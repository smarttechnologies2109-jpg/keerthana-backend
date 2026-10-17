
const pool = require("../config/db");
const {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const {
  uploadToS3,
} = require("../middleware/uploadMiddleware");

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});

const BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  "keerthana-media-908209635187";
const getPresignedMediaUrl = async (mediaUrl) => {
  if (!mediaUrl) return null;

  try {
    const parsedUrl = new URL(mediaUrl);

    // Extract the object key from an existing S3 URL.
    const key = decodeURIComponent(
      parsedUrl.pathname.replace(/^\/+/, "")
    );

    if (!key) return null;

    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
      { expiresIn: 3600 }
    );
  } catch (error) {
    console.error("Failed to sign S3 media URL:", error.message);
    throw error;
  }
};

  const ALLOWED_MOODS = [
  "worship",
  "praise",
  "prayer",
  "hope",
  "peace",
  "thanksgiving",
];

const parseSongMoods = (value, fallback = []) => {
  // Preserve existing moods when an update omits this field.
  if (value === undefined) {
    return fallback;
  }

  if (value === null || value === "") {
    return [];
  }

  let moods = value;

  // FormData sends the moods array as a JSON string.
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
    throw new Error("One or more selected moods are invalid");
  }

  return normalized;
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


  const createSong = async (req, res) => {
  let uploadedAudio = null;
  let uploadedCover = null;

  try {
    console.log("========== CREATE SONG START ==========");
    console.log("Request body:", {
      ...req.body,
      lyrics: req.body?.lyrics ? "[provided]" : "",
    });

    console.log(
      "Uploaded file fields:",
      Object.keys(req.files || {})
    );

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

    // -----------------------------------------
    // 1. VALIDATE REQUIRED FIELDS
    // -----------------------------------------

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
        message: "Please upload an audio file",
      });
    }

    const allowedLanguages = [
      "Telugu",
      "Hindi",
      "English",
      "Malayalam",
      "Kannada",
      "Tamil",
    ];

    if (!allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song language",
      });
    }

    // -----------------------------------------
    // 2. VALIDATE AND NORMALIZE MOODS
    // -----------------------------------------

    const ALLOWED_MOODS = [
      "worship",
      "praise",
      "prayer",
      "hope",
      "peace",
      "thanksgiving",
    ];

    let songMoods = [];

    try {
      let parsedMoods = moods;

      if (typeof parsedMoods === "string") {
        parsedMoods = parsedMoods.trim()
          ? JSON.parse(parsedMoods)
          : [];
      }

      if (!Array.isArray(parsedMoods)) {
        throw new Error("Moods must be an array");
      }

      songMoods = [
        ...new Set(
          parsedMoods.map((mood) =>
            String(mood).trim().toLowerCase()
          )
        ),
      ];

      if (
        songMoods.some(
          (mood) => !ALLOWED_MOODS.includes(mood)
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid mood selected",
          allowedMoods: ALLOWED_MOODS,
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid moods format. Please select moods again.",
      });
    }

    console.log("MOODS TO SAVE:", songMoods);

    // -----------------------------------------
    // 3. GET USER ID
    // -----------------------------------------

    const createdBy = req.user?.id || null;

    // -----------------------------------------
    // 4. UPLOAD AUDIO AND COVER
    // -----------------------------------------
    //
    // Keep the uploadToS3 arguments and return format
    // consistent with your existing uploadMiddleware.js.
    // Do not assume an upload succeeded unless it returns.
    // -----------------------------------------

    const audioResult = await uploadToS3(
      audioFile,
      "audio"
    );

    if (!audioResult) {
      throw new Error("Audio upload did not return a result");
    }

    uploadedAudio = audioResult;

    const coverFile = req.files?.cover?.[0];

    if (coverFile) {
      const coverResult = await uploadToS3(
        coverFile,
        "covers"
      );

      if (!coverResult) {
        throw new Error("Cover upload did not return a result");
      }

      uploadedCover = coverResult;
    }

    // Use the media URL returned by your existing S3 helper.
   
const getS3Url = (result) => {
  if (!result) return null;

  if (result.location || result.url || result.audio_url || result.cover_url) {
    return (
      result.location ||
      result.url ||
      result.audio_url ||
      result.cover_url
    );
  }

  if (result.key) {
    const region = process.env.AWS_REGION || "ap-south-1";

    return `https://${result.bucket || BUCKET_NAME}.s3.${region}.amazonaws.com/${result.key}`;
  }

  return null;
};

const audioUrl = getS3Url(audioResult);
const coverUrl = coverFile ? getS3Url(uploadedCover) : null;

if (!audioUrl) {
  throw new Error("Could not generate the S3 audio URL.");
}


    if (!audioUrl) {
      throw new Error(
        "S3 upload completed but no audio URL was returned. Check uploadMiddleware.js."
      );
    }

    // -----------------------------------------
    // 5. INSERT SONG INTO POSTGRESQL
    // -----------------------------------------

    const sql = `
      INSERT INTO songs (
        title,
        title_english,
        language,
        lyrics,
        audio_url,
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
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13
      )
      RETURNING *;
    `;

    const values = [
      String(title).trim(),
      title_english || null,
      language,
      lyrics || "",
      audioUrl,
      coverUrl,
      artist_id || null,
      album_id || null,
      category_id || null,
      featured === true ||
        featured === "true" ||
        featured === "1",
      ministry_id || null,
      songMoods,
      createdBy,
    ];

    const result = await pool.query(sql, values);

    if (!result.rows || result.rows.length === 0) {
      throw new Error("Song was not returned after database insert");
    }

    const savedSong = result.rows[0];

    console.log("SONG INSERT SUCCESS:", {
      id: savedSong.id,
      title: savedSong.title,
      moods: savedSong.moods,
    });

    // -----------------------------------------
    // 6. SEND SUCCESS RESPONSE
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message: "Song uploaded successfully",
      song: savedSong,
    });
  } catch (error) {
    // -----------------------------------------
    // 7. LOG THE ACTUAL ERROR
    // -----------------------------------------

    console.error("CREATE SONG ERROR DETAILS:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      stack: error.stack,
    });

    // Do not hide the real error in your server logs.
    // Remove uploaded files here only using your existing
    // deleteS3Object helper and its verified key format.

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category, ministry, or user reference.",
        detail: error.detail,
      });
    }

    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        message: "A required database field is missing.",
        detail: error.detail,
      });
    }

    if (error.code === "22P02") {
      return res.status(400).json({
        success: false,
        message: "One of the submitted fields has an invalid format.",
        detail: error.message,
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
   GET S3 KEY FROM MEDIA URL
========================================================= */

const getS3KeyFromMediaUrl = (mediaUrl) => {
  if (!mediaUrl || typeof mediaUrl !== "string") {
    return null;
  }

  let pathname = mediaUrl;

  if (/^https?:\/\//i.test(mediaUrl)) {
    try {
      pathname = new URL(mediaUrl).pathname;
    } catch {
      return null;
    }
  }

  let match = pathname.match(/^\/media\/audio\/([^/]+)$/);

  if (match) {
    return `audio/${match[1]}`;
  }

  match = pathname.match(/^\/media\/images\/([^/]+)$/);

  if (match) {
    return `covers/${match[1]}`;
  }

  match = pathname.match(/^\/audio\/([^/]+)$/);

  if (match) {
    return `audio/${match[1]}`;
  }

  match = pathname.match(/^\/covers\/([^/]+)$/);

  if (match) {
    return `covers/${match[1]}`;
  }

  return null;
};


/* =========================================================
   DELETE OBJECT FROM S3
========================================================= */

const deleteS3Object = async (mediaUrl) => {
  const key = getS3KeyFromMediaUrl(mediaUrl);

  if (!key) {
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


/* =========================================================
   DELETE MEDIA ONLY WHEN NO SONG USES IT
========================================================= */

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
      console.log("Media still in use; keeping:", mediaUrl);
      return;
    }

    await deleteS3Object(mediaUrl);
  } catch (error) {
    console.error("S3 media cleanup failed:", error);
  }
};



/* =========================================================
   DELETE SONG
========================================================= */

const deleteSong = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;


    /* =====================================================
       GET SONG FIRST
    ===================================================== */

    const songResult =
      await pool.query(
        `
        SELECT
          id,
          title,
          audio_url,
          cover_url

        FROM songs

        WHERE id = $1
        `,
        [id]
      );


    if (
      songResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Song not found",
      });
    }


    const song =
      songResult.rows[0];


    /* =====================================================
       DELETE DATABASE RECORD
    ===================================================== */

    await pool.query(
      `
      DELETE FROM songs
      WHERE id = $1
      `,
      [id]
    );


    /* =====================================================
       DELETE PHYSICAL FILES
    ===================================================== */
await deleteMediaIfUnused(song.audio_url);
await deleteMediaIfUnused(song.cover_url);


    return res.status(200).json({
      success: true,
      message:
        "Song deleted successfully",
    });


  } catch (error) {
    console.error(
      "Delete song error:",
      error
    );


    if (
      error.code === "23503"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This song is being used by another record and cannot be deleted yet.",
      });
    }


    return res.status(500).json({
      success: false,
      message:
        "Unable to delete song",
    });
  }
};


/* =========================================================
   GET ONE SONG - ADMIN
========================================================= */

const getAdminSongById = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;


    const result =
      await pool.query(
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

          s.artist_id,
          s.album_id,
          s.category_id,

          s.ministry_id,

          s.created_at,

          ar.name AS artist_name,

          al.title AS album_title,

          c.name AS category_name,

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


    if (
      result.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Song not found",
      });
    }


    return res.status(200).json({
      success: true,
      song:
        result.rows[0],
    });


  } catch (error) {
    console.error(
      "Get admin song error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to load song",
    });
  }
};


/* =========================================================
   UPDATE SONG
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
    } = req.body;

    // Get existing song
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

    // Validate title
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }
    

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
  });
}
console.log("MOODS TO SAVE:", songMoods);
    // Find newly uploaded files
    const newAudioFile = req.files?.audio?.[0] || null;
    const newCoverFile = req.files?.cover?.[0] || null;

    // Validate language
    const selectedLanguage = String(
      language || existingSong.language || "Telugu"
    ).trim();

    const allowedLanguages = [
      "Telugu",
      "Hindi",
      "English",
      "Malayalam",
      "Kannada",
      "Tamil",
    ];

    if (!allowedLanguages.includes(selectedLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song language",
        allowedLanguages,
      });
    }

    // Preserve existing media unless new files are uploaded
    let audioUrl = existingSong.audio_url;
    let coverUrl = existingSong.cover_url;

    // Upload new audio to S3 when provided
  if (newAudioFile) {
  uploadedAudio = await uploadToS3(newAudioFile, "audio");

  if (!uploadedAudio) {
    throw new Error("Audio upload failed.");
  }

  const region = process.env.AWS_REGION || "ap-south-1";

  audioUrl = `https://${uploadedAudio.bucket || BUCKET_NAME}.s3.${region}.amazonaws.com/${uploadedAudio.key}`;
}

    // Upload new cover to S3 when provided
 if (newCoverFile) {
  uploadedCover = await uploadToS3(newCoverFile, "covers");

  if (!uploadedCover) {
    throw new Error("Cover upload failed.");
  }

  const region = process.env.AWS_REGION || "ap-south-1";

  coverUrl = `https://${uploadedCover.bucket || BUCKET_NAME}.s3.${region}.amazonaws.com/${uploadedCover.key}`;
}

    // Preserve existing optional IDs if omitted
    const artistId =
      artist_id === undefined
        ? existingSong.artist_id
        : artist_id === ""
          ? null
          : Number(artist_id);

    const albumId =
      album_id === undefined
        ? existingSong.album_id
        : album_id === ""
          ? null
          : Number(album_id);

    const categoryId =
      category_id === undefined
        ? existingSong.category_id
        : category_id === ""
          ? null
          : Number(category_id);

    let ministryId =
      ministry_id === undefined
        ? existingSong.ministry_id
        : ministry_id === ""
          ? null
          : Number(ministry_id);

    // Validate optional IDs
    for (const [field, value] of [
      ["artist_id", artistId],
      ["album_id", albumId],
      ["category_id", categoryId],
      ["ministry_id", ministryId],
    ]) {
      if (value !== null &&
          (!Number.isInteger(value) || value <= 0)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${field}`,
        });
      }
    }

    // Validate ministry
    if (ministryId !== null) {
      const ministryResult = await pool.query(
        `SELECT id FROM ministries WHERE id = $1`,
        [ministryId]
      );

      if (ministryResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected ministry does not exist",
        });
      }
    }

    // Preserve featured value when omitted
    const isFeatured =
      featured === undefined
        ? existingSong.featured
        : featured === true || featured === "true";

    // Update database
    const result = await pool.query(
      `
      UPDATE songs
      SET
        title = $1,
        title_english = $2,
        language = $3,
        lyrics = $4,
        audio_url = $5,
        cover_url = $6,
        artist_id = $7,
        album_id = $8,
        category_id = $9,
        featured = $10,
        ministry_id = $11,
        moods = $12
      WHERE id = $13
      RETURNING *
      `,
      [
        title.trim(),
        title_english === undefined
          ? existingSong.title_english
          : title_english?.trim() || null,
        selectedLanguage,
        lyrics === undefined ? existingSong.lyrics : lyrics || null,
        audioUrl,
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

    // Delete old files only after database update succeeds
    if (newAudioFile &&
        existingSong.audio_url &&
        existingSong.audio_url !== audioUrl) {
      await deleteMediaIfUnused(existingSong.audio_url);
    }

    if (newCoverFile &&
        existingSong.cover_url &&
        existingSong.cover_url !== coverUrl) {
      await deleteMediaIfUnused(existingSong.cover_url);
    }

    return res.status(200).json({
      success: true,
      message: "Song updated successfully",
      song: result.rows[0],
    });
  } catch (error) {
    console.error("Update song error:", error);

    // Remove newly uploaded files if the database update failed
    if (!databaseUpdated && uploadedAudio) {
      await deleteS3Object(
        `/media/audio/${uploadedAudio.filename}`
      ).catch((err) =>
        console.error("Audio rollback failed:", err)
      );
    }

    if (!databaseUpdated && uploadedCover) {
      await deleteS3Object(
        `/media/images/${uploadedCover.filename}`
      ).catch((err) =>
        console.error("Cover rollback failed:", err)
      );
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category or ministry",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update song",
    });
  }
};



/* =========================================================
   GET ALL SONG REPORTS - ADMIN
========================================================= */

const getAdminSongReports = async (
  req,
  res
) => {
  try {

    /* =====================================================
       GET REPORTS
    ===================================================== */

    const result =
      await pool.query(
        `
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
        `
      );


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reports: result.rows,
    });


  } catch (error) {

    console.error(
      "Admin get song reports error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to load song reports",
    });
  }
};

/* =========================================================
   UPDATE SONG REPORT STATUS - ADMIN
========================================================= */

const updateSongReportStatus = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;

    const {
      status,
    } = req.body;


    /* -----------------------------------------------------
       VALIDATE ID
    ----------------------------------------------------- */

    if (!id) {

      return res.status(400).json({
        success: false,
        message:
          "Report ID is required",
      });

    }


    /* -----------------------------------------------------
       ALLOWED STATUS
    ----------------------------------------------------- */

    const allowedStatuses = [
      "pending",
      "resolved",
      "rejected",
    ];


    if (
      !allowedStatuses.includes(
        String(status || "")
          .toLowerCase()
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid report status",
        allowedStatuses,
      });

    }


    const cleanStatus =
      String(status)
        .toLowerCase();


    /* -----------------------------------------------------
       UPDATE
    ----------------------------------------------------- */

    const result =
      await pool.query(
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
        [
          cleanStatus,
          id,
        ]
      );


    /* -----------------------------------------------------
       NOT FOUND
    ----------------------------------------------------- */

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message:
          "Song report not found",
      });

    }


    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    return res.status(200).json({

      success: true,

      message:
        "Report status updated successfully",

      report:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Admin update song report status error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to update report status",

    });

  }

};


/* =========================================================
   DELETE SONG REPORT - ADMIN
========================================================= */

const deleteSongReport = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    /* -----------------------------------------------------
       VALIDATE ID
    ----------------------------------------------------- */

    if (!id) {

      return res.status(400).json({
        success: false,
        message:
          "Report ID is required",
      });

    }


    /* -----------------------------------------------------
       DELETE
    ----------------------------------------------------- */

    const result =
      await pool.query(
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


    /* -----------------------------------------------------
       NOT FOUND
    ----------------------------------------------------- */

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message:
          "Song report not found",
      });

    }


    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    return res.status(200).json({

      success: true,

      message:
        "Song report deleted successfully",

      report:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Admin delete song report error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to delete song report",

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
