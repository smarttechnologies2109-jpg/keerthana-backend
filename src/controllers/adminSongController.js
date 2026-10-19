const pool = require("../config/db");
const crypto = require("crypto");

const {
  S3Client,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");


const getAudioSha256 = (audioFile) => {
  if (!audioFile?.buffer || !Buffer.isBuffer(audioFile.buffer)) {
    throw new Error(
      "Unable to calculate audio hash: uploaded audio buffer is missing."
    );
  }

  return crypto
    .createHash("sha256")
    .update(audioFile.buffer)
    .digest("hex");
};

const {
  uploadToS3,
} = require("../middleware/uploadMiddleware");

/* =========================================================
   AWS S3 CONFIGURATION
========================================================= */

const AWS_REGION =
  process.env.AWS_REGION || "ap-south-1";

const BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  "keerthana-media-908209635187";

const s3 = new S3Client({
  region: AWS_REGION,
});

/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

const ALLOWED_MOODS = [
  "worship",
  "praise",
  "prayer",
  "hope",
  "peace",
  "thanksgiving",
];

/* =========================================================
   COMMON HELPERS
========================================================= */

/**
 * Convert FormData values to a boolean.
 * Preserves support for multipart/form-data.
 */
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

/**
 * Convert optional relationship IDs to positive integers
 * or null when the field is intentionally cleared.
 *
 * If the field is omitted during an update, its existing
 * database value is preserved by the caller.
 */
const parseOptionalId = (value, fieldName) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
};

/**
 * Normalize moods consistently for both create and update.
 *
 * undefined: use fallback
 * null / empty string: clear moods
 * JSON string: parse FormData value
 * array: normalize, validate, and remove duplicates
 */
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

  if (
    normalized.some(
      (mood) => !ALLOWED_MOODS.includes(mood)
    )
  ) {
    throw new Error(
      `Invalid mood selected. Allowed moods: ${ALLOWED_MOODS.join(", ")}`
    );
  }

  return normalized;
};

/**
 * Convert the existing uploadToS3 return value into a URL.
 *
 * Prefer the URL returned by the existing middleware.
 * Fall back to an S3 URL only when the middleware returns
 * an object key.
 */
const getS3Url = (result) => {
  if (!result) return null;

  // Your uploadMiddleware returns { key, filename, bucket }.
  if (result.key) {
    const bucket = result.bucket || BUCKET_NAME;

    return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${String(
      result.key
    )
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }

  return (
    result.location ||
    result.url ||
    result.audio_url ||
    result.cover_url ||
    null
  );
};

/**
 * Find the S3 key returned by uploadToS3.
 * Used for cleanup if the database operation fails.
 */
const getS3KeyFromUpload = (uploadResult) => {
  if (!uploadResult) {
    return null;
  }

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
      url.hostname.endsWith(".amazonaws.com") &&
        url.hostname.startsWith(`${BUCKET_NAME}.`);

    if (!isS3Url) {
      // Do not assume a CloudFront or unrelated URL path
      // is a direct S3 object key during rollback.
      return null;
    }

    return decodeURIComponent(
      url.pathname.replace(/^\/+/, "")
    );
  } catch {
    return null;
  }
};

/**
 * Delete a newly uploaded object directly by its known key.
 */
const deleteUploadedObject = async (uploadResult) => {
  const key = getS3KeyFromUpload(uploadResult);

  if (!key) {
    return;
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: uploadResult.bucket || BUCKET_NAME,
      Key: key,
    })
  );

  console.log("Rolled back uploaded S3 object:", key);
};

/**
 * Extract keys from the media URL formats currently used
 * by the application.
 *
 * Supported:
 *   /media/audio/file.mp3
 *   /media/images/file.jpg
 *   /audio/file.mp3
 *   /covers/file.jpg
 *   direct S3 URLs for this configured bucket
 */
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
        return decodeURIComponent(
          pathname.replace(/^\/+/, "")
        ) || null;
      }
    } catch {
      return null;
    }
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the original pathname if decoding fails.
  }

  const normalizedPath = pathname.replace(/^\/+/, "");

  const patterns = [
    /^media\/audio\/(.+)$/,
    /^media\/images\/(.+)$/,
    /^audio\/(.+)$/,
    /^covers\/(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedPath.match(pattern);

    if (match) {
      const relativeKey = match[1];

      if (pattern === patterns[0] || pattern === patterns[2]) {
        return `audio/${relativeKey}`;
      }

      return `covers/${relativeKey}`;
    }
  }

  // Unknown URL format: do not risk deleting an unrelated object.
  return null;
};

/**
 * Delete a media URL from S3 if its key can be identified.
 */
const deleteS3Object = async (mediaUrl) => {
  const key = getS3KeyFromMediaUrl(mediaUrl);

  if (!key) {
    console.warn(
      "Unable to identify S3 key; skipping media deletion:",
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

/**
 * Delete media only when no song record still references it.
 */
const deleteMediaIfUnused = async (mediaUrl) => {
  if (!mediaUrl) {
    return;
  }

  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM songs
      WHERE audio_url = $1
         OR cover_url = $1
      LIMIT 1
      `,
      [mediaUrl]
    );

    if (result.rows.length > 0) {
      console.log(
        "Media still in use; keeping:",
        mediaUrl
      );

      return;
    }

    await deleteS3Object(mediaUrl);
  } catch (error) {
    // Media cleanup must not turn a successful song update
    // or deletion into a failed API response.
    console.error("S3 media cleanup failed:", error.message);
  }
};

/**
 * Check whether a referenced record exists.
 * A null ID means that relationship is optional.
 */
const validateOptionalReference = async (
  tableName,
  id,
  fieldName
) => {
  if (id === null) {
    return;
  }

  // Table names are supplied only by this controller's
  // fixed internal calls, never by request input.
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

        s.album_id,
        al.title AS album_title,

        s.category_id,
        c.name AS category_name,

        s.ministry_id,
        m.name AS ministry_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      LEFT JOIN ministries m
        ON s.ministry_id = m.id

      ORDER BY
        s.created_at DESC,
        s.id DESC
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
   CREATE SONG
========================================================= */


/* =========================================================
   CREATE SONG - WITH DUPLICATE AUDIO CHECK
========================================================= */

const createSong = async (req, res) => {
  let uploadedAudio = null;
  let uploadedCover = null;
  let databaseSaved = false;

  try {
    const {
      title,
      title_english,
      language = "Telugu",
      lyrics = "",
      artist_id,
      album_id,
      category_id,
      ministry_id,
      featured = false,
      moods = [],
    } = req.body || {};

    // 1. Validate title
    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }

    // 2. Validate audio upload
    const audioFile = req.files?.audio?.[0];

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        message: "Audio file is required",
      });
    }

    // 3. Validate language
    if (!ALLOWED_LANGUAGES.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song language",
        allowedLanguages: ALLOWED_LANGUAGES,
      });
    }

    // 4. Validate moods
    let songMoods;

    try {
      songMoods = parseSongMoods(moods, []);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        allowedMoods: ALLOWED_MOODS,
      });
    }

    // 5. Validate optional relationship IDs
    let artistId;
    let albumId;
    let categoryId;
    let ministryId;

    try {
      artistId = parseOptionalId(artist_id, "artist_id");
      albumId = parseOptionalId(album_id, "album_id");
      categoryId = parseOptionalId(category_id, "category_id");
      ministryId = parseOptionalId(ministry_id, "ministry_id");
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
const audioSha256 = getAudioSha256(audioFile);

const duplicateResult = await pool.query(
  `SELECT id, title, title_english, language
   FROM songs
   WHERE audio_sha256 = $1
   LIMIT 1`,
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

    // 8. Upload audio only after the duplicate check
    uploadedAudio = await uploadToS3(audioFile, "audio");

    if (!uploadedAudio) {
      throw new Error("Audio upload did not return a result");
    }

    // 9. Upload optional cover image
    const coverFile = req.files?.cover?.[0];

    if (coverFile) {
      uploadedCover = await uploadToS3(coverFile, "covers");

      if (!uploadedCover) {
        throw new Error("Cover upload did not return a result");
      }
    }

    // 10. Resolve uploaded media URLs
    const audioUrl = getS3Url(uploadedAudio);
    const coverUrl = coverFile ? getS3Url(uploadedCover) : null;

    if (!audioUrl) {
      throw new Error(
        "Audio uploaded but no audio URL was returned. Check uploadMiddleware.js."
      );
    }

    if (coverFile && !coverUrl) {
      throw new Error(
        "Cover uploaded but no cover URL was returned."
      );
    }

    const createdBy = req.user?.id || null;

    // 11. Save song and its SHA-256 hash
    const result = await pool.query(
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

    databaseSaved = true;

    return res.status(201).json({
      success: true,
      message: "Song uploaded successfully",
      song: result.rows[0],
    });
  } catch (error) {
    console.error("Create song error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });

    // Roll back new S3 uploads if the database insert failed.
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

    // Handle PostgreSQL unique-index duplicate errors.
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

    return res.status(500).json({
      success: false,
      message: "Unable to upload song",
      ...(process.env.NODE_ENV !== "production" && {
        detail: error.message,
        code: error.code || null,
      }),
    });
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

        s.album_id,
        al.title AS album_title,

        s.category_id,
        c.name AS category_name,

        s.ministry_id,
        m.name AS ministry_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      LEFT JOIN ministries m
        ON s.ministry_id = m.id

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
   UPDATE SONG
========================================================= */


/* =========================================================
   UPDATE SONG - WITH DUPLICATE AUDIO CHECK
========================================================= */

const updateSong = async (req, res) => {
  let uploadedAudio = null;
  let uploadedCover = null;
  let databaseUpdated = false;

  try {
    const { id } = req.params;

    const {
      title,
      title_english,
      language,
      lyrics,
      artist_id,
      album_id,
      category_id,
      ministry_id,
      moods,
      featured,
    } = req.body || {};

    // 1. Load existing song
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

    // 2. Validate title
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }

    // 3. Validate moods
    let songMoods;

    try {
      songMoods = parseSongMoods(
        moods,
        existingSong.moods || []
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        allowedMoods: ALLOWED_MOODS,
      });
    }

    // 4. Validate language
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

    // 5. Preserve omitted relationships; allow explicit clearing
    let artistId;
    let albumId;
    let categoryId;
    let ministryId;

    try {
      artistId =
        artist_id === undefined
          ? existingSong.artist_id
          : parseOptionalId(artist_id, "artist_id");

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
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // 6. Validate referenced records
    try {
      await validateOptionalReference("artists", artistId, "artist");
      await validateOptionalReference("albums", albumId, "album");
      await validateOptionalReference("categories", categoryId, "category");
      await validateOptionalReference("ministries", ministryId, "ministry");
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // 7. Check whether replacement files were supplied
    const newAudioFile = req.files?.audio?.[0] || null;
    const newCoverFile = req.files?.cover?.[0] || null;

    // Preserve the current hash if audio is not being replaced.
    let audioSha256 = existingSong.audio_sha256 || null;

    if (newAudioFile) {
  audioSha256 = getAudioSha256(newAudioFile);

  const duplicateResult = await pool.query(
    `SELECT id, title, title_english, language
     FROM songs
     WHERE audio_sha256 = $1
       AND id <> $2
     LIMIT 1`,
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

    // 9. Preserve existing URLs unless replacements are uploaded
    let audioUrl = existingSong.audio_url;
    let coverUrl = existingSong.cover_url;

    if (newAudioFile) {
      uploadedAudio = await uploadToS3(newAudioFile, "audio");

      if (!uploadedAudio) {
        throw new Error("Audio upload failed");
      }

      audioUrl = getS3Url(uploadedAudio);

      if (!audioUrl) {
        throw new Error(
          "Audio uploaded but no URL was returned by uploadMiddleware.js"
        );
      }
    }

    if (newCoverFile) {
      uploadedCover = await uploadToS3(newCoverFile, "covers");

      if (!uploadedCover) {
        throw new Error("Cover upload failed");
      }

      coverUrl = getS3Url(uploadedCover);

      if (!coverUrl) {
        throw new Error(
          "Cover uploaded but no URL was returned by uploadMiddleware.js"
        );
      }
    }

    // 10. Preserve featured value when omitted
    const isFeatured =
      featured === undefined
        ? existingSong.featured
        : parseBoolean(featured);

    // 11. Update song and audio hash
    const result = await pool.query(
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
        title.trim(),
        title_english === undefined
          ? existingSong.title_english
          : String(title_english).trim() || null,
        selectedLanguage,
        lyrics === undefined ? existingSong.lyrics : lyrics || "",
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

    databaseUpdated = true;

    // 12. Remove replaced media only after successful DB update.
    // The helper preserves objects still referenced by another song.
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
      song: result.rows[0],
    });
  } catch (error) {
    console.error("Update song error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });

    // Roll back new uploads if the database update failed.
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

    // Handle PostgreSQL unique-index duplicate errors.
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

    return res.status(500).json({
      success: false,
      message: "Unable to update song",
      ...(process.env.NODE_ENV !== "production" && {
        detail: error.message,
        code: error.code || null,
      }),
    });
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