
const pool = require("../config/db");
const crypto = require("crypto");

const {
  S3Client,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { uploadToS3 } = require("../middleware/s3Upload");

const getAudioSha256 = (audioFile) => {
  if (!audioFile?.buffer || !Buffer.isBuffer(audioFile.buffer)) {
    throw new Error("Uploaded audio buffer is missing.");
  }

  return crypto.createHash("sha256")
    .update(audioFile.buffer)
    .digest("hex");
};

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET_NAME =
  process.env.S3_BUCKET_NAME || "keerthana-media-908209635187";

const s3 = new S3Client({ region: AWS_REGION });

const ALLOWED_LANGUAGES = [
  "Telugu", "Hindi", "English",
  "Malayalam", "Kannada", "Tamil",
];

const ALLOWED_MOODS = [
  "worship", "praise", "prayer",
  "hope", "peace", "thanksgiving",
];

/* =========================================================
   COMMON HELPERS
========================================================= */

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  );
};

const parseOptionalId = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
};

/* =========================================================
   MULTIPLE ARTIST HELPERS
========================================================= */

const parseArtistIds = (value, fallbackArtistId = null) => {
  let ids = value;

  if (ids === undefined) {
    ids = fallbackArtistId ? [fallbackArtistId] : [];
  } else if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      throw new Error("artist_ids must be a valid JSON array");
    }
  }

  if (!Array.isArray(ids)) {
    throw new Error("artist_ids must be an array");
  }

  const parsed = ids.map((id) => {
    const artistId = Number(id);

    if (!Number.isInteger(artistId) || artistId <= 0) {
      throw new Error("Invalid artist ID in artist_ids");
    }

    return artistId;
  });

  return [...new Set(parsed)];
};

const validateArtistIds = async (client, artistIds) => {
  if (!artistIds.length) {
    throw new Error("At least one artist is required");
  }

  const result = await client.query(
    `SELECT id FROM artists WHERE id = ANY($1::bigint[])`,
    [artistIds]
  );

  const found = new Set(
    result.rows.map((row) => Number(row.id))
  );

  const missing = artistIds.filter((id) => !found.has(id));

  if (missing.length) {
    throw new Error(
      `Selected artist(s) do not exist: ${missing.join(", ")}`
    );
  }
};

const syncSongArtists = async (client, songId, artistIds) => {
  await client.query(
    `DELETE FROM song_artists WHERE song_id = $1`,
    [songId]
  );

  for (const artistId of artistIds) {
    await client.query(
      `
      INSERT INTO song_artists (song_id, artist_id)
      VALUES ($1, $2)
      ON CONFLICT (song_id, artist_id) DO NOTHING
      `,
      [songId, artistId]
    );
  }
};

/* =========================================================
   MOOD HELPER
========================================================= */

const parseSongMoods = (value, fallback = []) => {
  if (value === undefined) {
    return Array.isArray(fallback) ? fallback : [];
  }

  if (value === null || value === "") {
    return [];
  }

  let moods = value;

  if (typeof moods === "string") {
    try {
      moods = JSON.parse(moods);
    } catch {
      throw new Error("Moods must be a valid JSON array");
    }
  }

  if (!Array.isArray(moods)) {
    throw new Error("Moods must be an array");
  }

  const normalized = [
    ...new Set(
      moods.map((mood) =>
        String(mood).trim().toLowerCase()
      )
    ),
  ];

  if (normalized.some((mood) => !ALLOWED_MOODS.includes(mood))) {
    throw new Error(
      `Invalid mood selected. Allowed moods: ${ALLOWED_MOODS.join(", ")}`
    );
  }

  return normalized;
};

/* =========================================================
   S3 HELPERS
========================================================= */

const getS3Url = (result) => {
  if (!result) return null;

  if (result.cloudFrontUrl) {
    return result.cloudFrontUrl;
  }

  if (result.key) {
    const base = process.env.CLOUDFRONT_URL?.replace(/\/+$/, "");

    return base
      ? `${base}/${result.key.split("/").map(encodeURIComponent).join("/")}`
      : null;
  }

  return (
    result.location ||
    result.url ||
    result.audio_url ||
    result.cover_url ||
    null
  );
};

const getS3KeyFromUpload = (uploadResult) => {
  if (!uploadResult) return null;

  if (uploadResult.key) {
    return String(uploadResult.key).replace(/^\/+/, "");
  }

  const mediaUrl =
    uploadResult.location ||
    uploadResult.url ||
    uploadResult.audio_url ||
    uploadResult.cover_url;

  if (!mediaUrl || typeof mediaUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(mediaUrl);

    const isS3Url =
      url.hostname === `${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com` ||
      url.hostname === `${BUCKET_NAME}.s3.amazonaws.com` ||
      (
        url.hostname.endsWith(".amazonaws.com") &&
        url.hostname.startsWith(`${BUCKET_NAME}.`)
      );

    if (!isS3Url) return null;

    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
};

const deleteUploadedObject = async (uploadResult) => {
  const key = getS3KeyFromUpload(uploadResult);

  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: uploadResult.bucket || BUCKET_NAME,
      Key: key,
    })
  );

  console.log("Rolled back uploaded S3 object:", key);
};

const getS3KeyFromMediaUrl = (mediaUrl) => {
  if (!mediaUrl || typeof mediaUrl !== "string") {
    return null;
  }

  let pathname = mediaUrl;

  if (/^https?:\/\//i.test(mediaUrl)) {
    try {
      const parsedUrl = new URL(mediaUrl);
      pathname = parsedUrl.pathname;

      const hostname = parsedUrl.hostname;

      const isS3Url =
        hostname === `${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com` ||
        hostname === `${BUCKET_NAME}.s3.amazonaws.com` ||
        (
          hostname.endsWith(".amazonaws.com") &&
          hostname.startsWith(`${BUCKET_NAME}.`)
        );

      if (isS3Url) {
        return decodeURIComponent(pathname.replace(/^\/+/, "")) || null;
      }
    } catch {
      return null;
    }
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep original path.
  }

  const normalizedPath = pathname.replace(/^\/+/, "");

  const patterns = [
    /^media\/audio\/(.+)$/,
    /^media\/images\/(.+)$/,
    /^audio\/(.+)$/,
    /^covers\/(.+)$/,
  ];

  for (let index = 0; index < patterns.length; index++) {
    const match = normalizedPath.match(patterns[index]);

    if (match) {
      return index === 0 || index === 2
        ? `audio/${match[1]}`
        : `covers/${match[1]}`;
    }
  }

  return null;
};

const deleteS3Object = async (mediaUrl) => {
  const key = getS3KeyFromMediaUrl(mediaUrl);

  if (!key) {
    console.warn(
      "Unable to identify S3 key; skipping deletion:",
      mediaUrl
    );
    return;
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  console.log("S3 object deleted:", key);
};

const deleteMediaIfUnused = async (mediaUrl) => {
  if (!mediaUrl) return;

  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM songs
      WHERE audio_url = $1 OR cover_url = $1
      LIMIT 1
      `,
      [mediaUrl]
    );

    if (result.rows.length > 0) {
      console.log("Media still in use; keeping:", mediaUrl);
      return;
    }

    await deleteS3Object(mediaUrl);
  } catch (error) {
    console.error("S3 media cleanup failed:", error.message);
  }
};

/* =========================================================
   REFERENCE VALIDATION
========================================================= */

const validateOptionalReference = async (
  tableName,
  id,
  fieldName
) => {
  if (id === null) return;

  const allowedTables = [
    "albums",
    "categories",
    "ministries",
  ];

  if (!allowedTables.includes(tableName)) {
    throw new Error("Invalid reference table");
  }

  const result = await pool.query(
    `SELECT id FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error(`Selected ${fieldName} does not exist`);
  }
};

/* =========================================================
   GET ALL SONGS - ADMIN
========================================================= */

const getAdminSongs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.language,
        s.lyrics,
        s.audio_url,
        s.cover_url,
        s.duration,
        s.featured,
        s.moods,
        s.created_at,

        s.artist_id,
        ar.name AS artist_name,
        ar.name_english AS artist_name_english,
        ar.name_telugu AS artist_name_telugu,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', artist.id,
                'name', artist.name,
                'name_english', artist.name_english,
                'name_telugu', artist.name_telugu
              )
              ORDER BY
                CASE WHEN sa.artist_id = s.artist_id THEN 0 ELSE 1 END,
                artist.name_english NULLS LAST,
                artist.name
            )
            FROM song_artists sa
            JOIN artists artist ON artist.id = sa.artist_id
            WHERE sa.song_id = s.id
          ),
          CASE
            WHEN ar.id IS NOT NULL THEN json_build_array(
              json_build_object(
                'id', ar.id,
                'name', ar.name,
                'name_english', ar.name_english,
                'name_telugu', ar.name_telugu
              )
            )
            ELSE '[]'::json
          END
        ) AS artists,

        s.album_id,
        al.title AS album_title,
        s.category_id,
        c.name AS category_name,
        s.ministry_id,
        m.name AS ministry_name,
        m.name_english AS ministry_name_english

      FROM songs s
      LEFT JOIN artists ar ON s.artist_id = ar.id
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN ministries m ON s.ministry_id = m.id

      ORDER BY s.created_at DESC, s.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      songs: result.rows,
    });
  } catch (error) {
    console.error("Admin get songs error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load songs",
    });
  }
};

/* =========================================================
   CREATE SONG - MULTIPLE ARTISTS
========================================================= */

const createSong = async (req, res) => {
  let uploadedAudio = null;
  let uploadedCover = null;
  let databaseSaved = false;
  let client = null;

  try {
    const {
      title,
      title_english,
      language = "Telugu",
      lyrics = "",
      artist_id,
      artist_ids,
      album_id,
      category_id,
      ministry_id,
      featured = false,
      moods = [],
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }

    const audioFile = req.files?.audio?.[0];

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        message: "Audio file is required",
      });
    }

    if (!ALLOWED_LANGUAGES.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song language",
        allowedLanguages: ALLOWED_LANGUAGES,
      });
    }

    let songMoods;
    let artistIds;
    let albumId;
    let categoryId;
    let ministryId;

    try {
      songMoods = parseSongMoods(moods, []);
      artistIds = parseArtistIds(artist_ids, artist_id);

      albumId = parseOptionalId(album_id, "album_id");
      categoryId = parseOptionalId(category_id, "category_id");
      ministryId = parseOptionalId(ministry_id, "ministry_id");
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (!artistIds.length) {
      return res.status(400).json({
        success: false,
        message: "At least one artist is required",
      });
    }

    // First selected artist is the primary artist.
    const artistId = artistIds[0];

    // Duplicate audio validation.
    const audioSha256 = getAudioSha256(audioFile);

    const duplicateResult = await pool.query(
      `
      SELECT id, title, title_english, language
      FROM songs
      WHERE audio_sha256 = $1
      LIMIT 1
      `,
      [audioSha256]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_AUDIO",
        message: "This audio file already exists in your songs.",
        existingSong: duplicateResult.rows[0],
      });
    }

    // Validate references before uploading files.
    client = await pool.connect();

    await validateArtistIds(client, artistIds);

    await validateOptionalReference("albums", albumId, "album");
    await validateOptionalReference("categories", categoryId, "category");
    await validateOptionalReference("ministries", ministryId, "ministry");

    // Upload audio.
    uploadedAudio = await uploadToS3(audioFile, "audio");

    if (!uploadedAudio) {
      throw new Error("Audio upload did not return a result");
    }

    // Upload optional cover.
    const coverFile = req.files?.cover?.[0];

    if (coverFile) {
      uploadedCover = await uploadToS3(coverFile, "covers");

      if (!uploadedCover) {
        throw new Error("Cover upload did not return a result");
      }
    }

    const audioUrl = getS3Url(uploadedAudio);
    const coverUrl = coverFile ? getS3Url(uploadedCover) : null;

    if (!audioUrl) {
      throw new Error("Audio URL was not returned by S3 upload.");
    }

    if (coverFile && !coverUrl) {
      throw new Error("Cover URL was not returned by S3 upload.");
    }

    const createdBy = req.user?.id || null;

    await client.query("BEGIN");

    // Insert the song.
    const result = await client.query(
      `
      INSERT INTO songs (
        title,
        title_english,
        language,
        lyrics,
        audio_url,
        audio_sha256,
        cover_url,
        artist_id,
        album_id,
        category_id,
        featured,
        ministry_id,
        moods,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING *
      `,
      [
        String(title).trim(),
        title_english ? String(title_english).trim() : null,
        language,
        lyrics || "",
        audioUrl,
        audioSha256,
        coverUrl,
        artistId,
        albumId,
        categoryId,
        parseBoolean(featured),
        ministryId,
        songMoods,
        createdBy,
      ]
    );

    const song = result.rows[0];

    // Save every selected artist.
    for (const selectedArtistId of artistIds) {
      await client.query(
        `
        INSERT INTO song_artists (song_id, artist_id)
        VALUES ($1, $2)
        ON CONFLICT (song_id, artist_id) DO NOTHING
        `,
        [song.id, selectedArtistId]
      );
    }

    await client.query("COMMIT");

    databaseSaved = true;

    return res.status(201).json({
      success: true,
      message: "Song uploaded successfully",
      song: {
        ...song,
        artist_ids: artistIds,
      },
    });

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Create song error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });

    // Clean up newly uploaded files if DB save failed.
    if (!databaseSaved) {
      if (uploadedAudio) {
        await deleteUploadedObject(uploadedAudio).catch(
          (cleanupError) => {
            console.error(
              "Audio upload rollback failed:",
              cleanupError.message
            );
          }
        );
      }

      if (uploadedCover) {
        await deleteUploadedObject(uploadedCover).catch(
          (cleanupError) => {
            console.error(
              "Cover upload rollback failed:",
              cleanupError.message
            );
          }
        );
      }
    }

    if (
      error.code === "23505" &&
      error.constraint === "songs_audio_sha256_unique"
    ) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_AUDIO",
        message: "This audio file already exists in your songs.",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category, ministry, or user reference.",
      });
    }

    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        message: "A required database field is missing.",
      });
    }

    if (error.code === "22P02") {
      return res.status(400).json({
        success: false,
        message: "One of the submitted fields has an invalid format.",
      });
    }

    if (
      error.message?.includes("artist") ||
      error.message?.includes("Artist")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to upload song",
      ...(process.env.NODE_ENV !== "production" && {
        detail: error.message,
        code: error.code || null,
      }),
    });

  } finally {
    if (client) client.release();
  }
};

/* =========================================================
   DELETE SONG
========================================================= */

const deleteSong = async (req, res) => {
  try {
    const { id } = req.params;

    const songResult = await pool.query(
      `
      SELECT id, title, audio_url, cover_url
      FROM songs
      WHERE id = $1
      `,
      [id]
    );

    if (songResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    const song = songResult.rows[0];

    await pool.query(
      `DELETE FROM songs WHERE id = $1`,
      [id]
    );

    // song_artists records are deleted automatically
    // because song_id has ON DELETE CASCADE.
    await deleteMediaIfUnused(song.audio_url);
    await deleteMediaIfUnused(song.cover_url);

    return res.status(200).json({
      success: true,
      message: "Song deleted successfully",
    });

  } catch (error) {
    console.error("Delete song error:", error);

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "This song is being used by another record and cannot be deleted yet.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to delete song",
    });
  }
};

/* =========================================================
   GET ONE SONG - ADMIN
========================================================= */

const getAdminSongById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.language,
        s.lyrics,
        s.audio_url,
        s.cover_url,
        s.duration,
        s.featured,
        s.moods,
        s.created_at,

        s.artist_id,
        ar.name AS artist_name,
        ar.name_english AS artist_name_english,
        ar.name_telugu AS artist_name_telugu,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', artist.id,
                'name', artist.name,
                'name_english', artist.name_english,
                'name_telugu', artist.name_telugu
              )
              ORDER BY
                CASE WHEN sa.artist_id = s.artist_id THEN 0 ELSE 1 END,
                artist.name_english NULLS LAST,
                artist.name
            )
            FROM song_artists sa
            JOIN artists artist ON artist.id = sa.artist_id
            WHERE sa.song_id = s.id
          ),
          CASE
            WHEN ar.id IS NOT NULL THEN json_build_array(
              json_build_object(
                'id', ar.id,
                'name', ar.name,
                'name_english', ar.name_english,
                'name_telugu', ar.name_telugu
              )
            )
            ELSE '[]'::json
          END
        ) AS artists,

        s.album_id,
        al.title AS album_title,
        s.category_id,
        c.name AS category_name,
        s.ministry_id,
        m.name AS ministry_name

      FROM songs s

      LEFT JOIN artists ar ON s.artist_id = ar.id
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN ministries m ON s.ministry_id = m.id

      WHERE s.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    return res.status(200).json({
      success: true,
      song: result.rows[0],
    });

  } catch (error) {
    console.error("Get admin song error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load song",
    });
  }
};

/* =========================================================
   UPDATE SONG - MULTIPLE ARTISTS
========================================================= */

const updateSong = async (req, res) => {
  let uploadedAudio = null;
  let uploadedCover = null;
  let databaseUpdated = false;
  let client = null;

  try {
    const { id } = req.params;

    const {
      title,
      title_english,
      language,
      lyrics,
      artist_id,
      artist_ids,
      album_id,
      category_id,
      ministry_id,
      moods,
      featured,
    } = req.body || {};

    // Load existing song.
    const existingResult = await pool.query(
      `SELECT * FROM songs WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    const existingSong = existingResult.rows[0];

    const updatedTitle =
      title === undefined
        ? existingSong.title
        : String(title).trim();

    if (!updatedTitle) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }

    let songMoods;
    let artistIds;
    let albumId;
    let categoryId;
    let ministryId;

    try {
      songMoods = parseSongMoods(
        moods,
        existingSong.moods || []
      );

      albumId =
        album_id === undefined
          ? existingSong.album_id
          : parseOptionalId(album_id, "album_id");

      categoryId =
        category_id === undefined
          ? existingSong.category_id
          : parseOptionalId(category_id, "category_id");

      ministryId =
        ministry_id === undefined
          ? existingSong.ministry_id
          : parseOptionalId(ministry_id, "ministry_id");

      if (artist_ids !== undefined) {
        artistIds = parseArtistIds(artist_ids);
      } else if (artist_id !== undefined) {
        const singleArtistId = parseOptionalId(
          artist_id,
          "artist_id"
        );

        artistIds = singleArtistId ? [singleArtistId] : [];
      } else {
        // Preserve all existing artists if artist fields
        // are not included in the update request.
        const existingArtistsResult = await pool.query(
          `
          
SELECT artist_id
FROM song_artists
WHERE song_id = $1
ORDER BY
  CASE WHEN artist_id = $2 THEN 0 ELSE 1 END,
  artist_id ASC

          `,
          [id, existingSong.artist_id]
        );

        artistIds = existingArtistsResult.rows.length
          ? existingArtistsResult.rows.map(
              (row) => Number(row.artist_id)
            )
          : existingSong.artist_id
            ? [Number(existingSong.artist_id)]
            : [];
      }

    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (!artistIds.length) {
      return res.status(400).json({
        success: false,
        message: "At least one artist is required",
      });
    }

    // First selected artist is primary.
    const artistId = artistIds[0];

    const selectedLanguage = String(
      language || existingSong.language || "Telugu"
    ).trim();

    if (!ALLOWED_LANGUAGES.includes(selectedLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song language",
        allowedLanguages: ALLOWED_LANGUAGES,
      });
    }

    await validateOptionalReference("albums", albumId, "album");
    await validateOptionalReference("categories", categoryId, "category");
    await validateOptionalReference("ministries", ministryId, "ministry");

    const newAudioFile = req.files?.audio?.[0] || null;
    const newCoverFile = req.files?.cover?.[0] || null;

    let audioSha256 = existingSong.audio_sha256 || null;

    // Check duplicate audio only if a replacement is uploaded.
    if (newAudioFile) {
      audioSha256 = getAudioSha256(newAudioFile);

      const duplicateResult = await pool.query(
        `
        SELECT id, title, title_english, language
        FROM songs
        WHERE audio_sha256 = $1
          AND id <> $2
        LIMIT 1
        `,
        [audioSha256, id]
      );

      if (duplicateResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_AUDIO",
          message: "This audio file already exists in another song.",
          existingSong: duplicateResult.rows[0],
        });
      }
    }

    let audioUrl = existingSong.audio_url;
    let coverUrl = existingSong.cover_url;

    // Replace audio if supplied.
    if (newAudioFile) {
      uploadedAudio = await uploadToS3(
        newAudioFile,
        "audio"
      );

      if (!uploadedAudio) {
        throw new Error("Audio upload failed");
      }

      audioUrl = getS3Url(uploadedAudio);

      if (!audioUrl) {
        throw new Error(
          "Audio URL was not returned by S3 upload."
        );
      }
    }

    // Replace cover if supplied.
    if (newCoverFile) {
      uploadedCover = await uploadToS3(
        newCoverFile,
        "covers"
      );

      if (!uploadedCover) {
        throw new Error("Cover upload failed");
      }

      coverUrl = getS3Url(uploadedCover);

      if (!coverUrl) {
        throw new Error(
          "Cover URL was not returned by S3 upload."
        );
      }
    }

    const isFeatured =
      featured === undefined
        ? existingSong.featured
        : parseBoolean(featured);

    client = await pool.connect();

    await validateArtistIds(client, artistIds);

    await client.query("BEGIN");

    // Update the primary song record.
    const result = await client.query(
      `
      UPDATE songs
      SET
        title = $1,
        title_english = $2,
        language = $3,
        lyrics = $4,
        audio_url = $5,
        audio_sha256 = $6,
        cover_url = $7,
        artist_id = $8,
        album_id = $9,
        category_id = $10,
        featured = $11,
        ministry_id = $12,
        moods = $13
      WHERE id = $14
      RETURNING *
      `,
      [
        updatedTitle,
        title_english === undefined
          ? existingSong.title_english
          : String(title_english).trim() || null,
        selectedLanguage,
        lyrics === undefined
          ? existingSong.lyrics
          : lyrics || "",
        audioUrl,
        audioSha256,
        coverUrl,
        artistId,
        albumId,
        categoryId,
        isFeatured,
        ministryId,
        songMoods,
        id,
      ]
    );

    // Replace all artist relationships.
    await syncSongArtists(client, id, artistIds);

    await client.query("COMMIT");

    databaseUpdated = true;

    // Delete old media only after successful update.
    if (
      newAudioFile &&
      existingSong.audio_url &&
      existingSong.audio_url !== audioUrl
    ) {
      await deleteMediaIfUnused(existingSong.audio_url);
    }

    if (
      newCoverFile &&
      existingSong.cover_url &&
      existingSong.cover_url !== coverUrl
    ) {
      await deleteMediaIfUnused(existingSong.cover_url);
    }

    return res.status(200).json({
      success: true,
      message: "Song updated successfully",
      song: {
        ...result.rows[0],
        artist_ids: artistIds,
      },
    });

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Update song error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });

    if (!databaseUpdated && uploadedAudio) {
      await deleteUploadedObject(uploadedAudio).catch(
        (cleanupError) => {
          console.error(
            "Audio rollback failed:",
            cleanupError.message
          );
        }
      );
    }

    if (!databaseUpdated && uploadedCover) {
      await deleteUploadedObject(uploadedCover).catch(
        (cleanupError) => {
          console.error(
            "Cover rollback failed:",
            cleanupError.message
          );
        }
      );
    }

    if (
      error.code === "23505" &&
      error.constraint === "songs_audio_sha256_unique"
    ) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_AUDIO",
        message: "This audio file already exists in your songs.",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category, ministry, or user reference.",
      });
    }

    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        message: "A required database field is missing.",
      });
    }

    if (error.code === "22P02") {
      return res.status(400).json({
        success: false,
        message: "One of the submitted fields has an invalid format.",
      });
    }

    if (
      error.message?.includes("artist") ||
      error.message?.includes("Artist")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update song",
      ...(process.env.NODE_ENV !== "production" && {
        detail: error.message,
        code: error.code || null,
      }),
    });

  } finally {
    if (client) client.release();
  }
};

/* =========================================================
   GET ALL SONG REPORTS - ADMIN
========================================================= */

const getAdminSongReports = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sr.id,
        sr.user_id,
        sr.song_id,
        sr.song_title,
        sr.report_type,
        sr.message,
        sr.status,
        sr.created_at,

        u.name AS user_name,
        u.email AS user_email

      FROM song_reports sr

      LEFT JOIN users u
        ON sr.user_id = u.id

      ORDER BY
        sr.created_at DESC,
        sr.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reports: result.rows,
    });

  } catch (error) {
    console.error("Admin get song reports error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load song reports",
    });
  }
};

/* =========================================================
   UPDATE SONG REPORT STATUS - ADMIN
========================================================= */

const updateSongReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const allowedStatuses = [
      "pending",
      "resolved",
      "rejected",
    ];

    const cleanStatus = String(status || "").toLowerCase();

    if (!allowedStatuses.includes(cleanStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report status",
        allowedStatuses,
      });
    }

    const result = await pool.query(
      `
      UPDATE song_reports
      SET status = $1
      WHERE id = $2
      RETURNING
        id,
        user_id,
        song_id,
        song_title,
        report_type,
        message,
        status,
        created_at
      `,
      [cleanStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song report not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report status updated successfully",
      report: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Admin update song report status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update report status",
    });
  }
};

/* =========================================================
   DELETE SONG REPORT - ADMIN
========================================================= */

const deleteSongReport = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const result = await pool.query(
      `
      DELETE FROM song_reports
      WHERE id = $1
      RETURNING
        id,
        song_title,
        report_type,
        message,
        status
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song report not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Song report deleted successfully",
      report: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Admin delete song report error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to delete song report",
    });
  }
};

/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {
  getAdminSongs,
  getAdminSongById,
  createSong,
  updateSong,
  deleteSong,

  getAdminSongReports,
  updateSongReportStatus,
  deleteSongReport,
};
