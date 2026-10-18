
const pool = require("../config/db");

const CLOUDFRONT_URL =
  "https://d1aj7yf1pvtrkq.cloudfront.net";

/**
 * Convert stored S3 media URLs to CloudFront URLs.
 * Supports audio/ and covers/ object keys.
 */
const getPublicMediaUrl = (mediaUrl) => {
  if (
    typeof mediaUrl !== "string" ||
    !mediaUrl.trim()
  ) {
    return mediaUrl;
  }

  const value = mediaUrl.trim();

  try {
    const url = new URL(value);

    // Convert URLs belonging to the KEERTHANA S3 bucket.
    if (
      url.hostname ===
      "keerthana-media-908209635187.s3.ap-south-1.amazonaws.com"
    ) {
      const key = decodeURIComponent(
        url.pathname.replace(/^\/+/, "")
      );

      if (
        key.startsWith("audio/") ||
        key.startsWith("covers/")
      ) {
        return `${CLOUDFRONT_URL}/${key
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;
      }
    }

    // Keep existing CloudFront URLs and other URLs unchanged.
    return value;
  } catch {
    return value;
  }
};

const transformSongMedia = (song) => ({
  ...song,
  audio_url: getPublicMediaUrl(song.audio_url),
  cover_url: getPublicMediaUrl(song.cover_url),
  album_cover: getPublicMediaUrl(song.album_cover),
  artist_image: getPublicMediaUrl(song.artist_image),
});

/* =========================================================
   ALLOWED MOODS
========================================================= */

const ALLOWED_MOODS = [
  "worship",
  "praise",
  "prayer",
  "hope",
  "peace",
  "thanksgiving",
];


/* =========================================================
   GET USER LANGUAGE CONDITION
========================================================= */

const getUserLanguage = (req) => {

  const role = String(
    req.user?.role || ""
  )
    .trim()
    .toUpperCase();


  /*
    Only normal USER accounts are filtered
    by preferred language.

    ADMIN / BUSINESS_OWNER keep existing behavior.
  */

  if (role !== "USER") {
    return null;
  }


  const language = String(
    req.user?.language || ""
  ).trim();


  if (!language) {
    return null;
  }


  return language;
};


/* =========================================================
   VALIDATE MOOD
========================================================= */

const validateMood = (value) => {

  const mood =
    String(value || "")
      .trim()
      .toLowerCase();


  if (!ALLOWED_MOODS.includes(mood)) {
    return null;
  }


  return mood;
};


/* =========================================
   GET ALL SONGS
========================================= */

const getAllSongs = async (req, res) => {

  try {

    const userLanguage =
      getUserLanguage(req);


    let query = `
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

        ar.id AS artist_id,
        ar.name AS artist_name,
        ar.image_url AS artist_image,

        al.id AS album_id,
        al.title AS album_title,
        al.cover_url AS album_cover,

        c.id AS category_id,
        c.name AS category_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id
    `;


    const values = [];


    if (userLanguage) {

      values.push(userLanguage);

      query += `
        WHERE s.language = $1
      `;
    }


    query += `
      ORDER BY
        s.created_at DESC,
        s.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


 return res.status(200).json({
  success: true,
  count: result.rows.length,
  songs: result.rows.map(transformSongMedia),
});

  } catch (error) {

    console.error(
      "Get songs error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to fetch songs",
    });
  }
};


/* =========================================
   GET SONG BY ID
========================================= */

const getSongById = async (req, res) => {

  try {

    const {
      id,
    } = req.params;


    const userLanguage =
      getUserLanguage(req);


    let query = `
      SELECT
        s.*,

        ar.name AS artist_name,
        ar.image_url AS artist_image,

        al.title AS album_title,
        al.cover_url AS album_cover,

        c.name AS category_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      WHERE s.id = $1
    `;


    const values = [
      id,
    ];


    if (userLanguage) {

      values.push(userLanguage);

      query += `
        AND s.language = $2
      `;
    }


    const result =
      await pool.query(
        query,
        values
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }


    return res.status(200).json({
      success: true,
      song: transformSongMedia(result.rows[0]),
    });

  } catch (error) {

    console.error(
      "Get song error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to fetch song",
    });
  }
};


/* =========================================
   SEARCH SONGS
========================================= */

const searchSongs = async (req, res) => {

  try {

    const query =
      String(
        req.query.q || ""
      ).trim();


    if (!query) {

      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }


    const searchTerm =
      `%${query}%`;


    const userLanguage =
      getUserLanguage(req);


    let sql = `
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
        ar.image_url AS artist_image,

        s.album_id,
        al.title AS album_title,
        al.cover_url AS album_cover,

        s.category_id,
        c.name AS category_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      WHERE
        (
          s.title ILIKE $1
          OR s.title_english ILIKE $1
          OR s.artist ILIKE $1
          OR s.lyrics ILIKE $1
          OR s.language ILIKE $1
          OR ar.name ILIKE $1
          OR al.title ILIKE $1
          OR c.name ILIKE $1
        )
    `;


    const values = [
      searchTerm,
    ];


    if (userLanguage) {

      values.push(userLanguage);

      sql += `
        AND s.language = $2
      `;
    }


    sql += `
      ORDER BY
        s.created_at DESC,
        s.id DESC
    `;


    const result =
      await pool.query(
        sql,
        values
      );


    return res.status(200).json({
      success: true,
      query,
      count: result.rows.length,
    songs: result.rows.map(transformSongMedia),
    });

  } catch (error) {

    console.error(
      "Search songs error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to search songs",
    });
  }
};


/* =========================================================
   GET SONGS BY MOOD
========================================================= */

/* =========================================================
   GET SONGS BY MOOD
========================================================= */

const getSongsByMood = async (req, res) => {
  try {
    const mood = validateMood(req.params.mood);

    if (!mood) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }

    const userLanguage = getUserLanguage(req);

    const values = [mood];

    let sql = `
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

        ar.id AS artist_id,
        ar.name AS artist_name,
        ar.image_url AS artist_image,

        al.id AS album_id,
        al.title AS album_title,
        al.cover_url AS album_cover,

        c.id AS category_id,
        c.name AS category_name

      FROM songs s

      LEFT JOIN artists ar ON s.artist_id = ar.id
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN categories c ON s.category_id = c.id

      WHERE EXISTS (
        SELECT 1
        FROM unnest(
          COALESCE(s.moods, ARRAY[]::text[])
        ) AS song_mood(value)
        WHERE LOWER(TRIM(song_mood.value)) = $1
      )
    `;

    if (userLanguage) {
      values.push(userLanguage);
      sql += ` AND s.language = $${values.length}`;
    }

    sql += `
      ORDER BY s.created_at DESC, s.id DESC
    `;

    const result = await pool.query(sql, values);

    const songs = result.rows.map(transformSongMedia);

    return res.status(200).json({
      success: true,
      mood,
      count: songs.length,
      songs,
    });
  } catch (error) {
    console.error("Get songs by mood error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch songs by mood",
    });
  }
};



/* =========================================================
   BROWSE ALL SONGS FOR MOOD
========================================================= */


/* =========================================================
   BROWSE ALL SONGS FOR MOOD
========================================================= */

const browseSongsForMood = async (req, res) => {
  try {
    const mood = validateMood(req.params.mood);

    if (!mood) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }

    const userLanguage = getUserLanguage(req);
    const values = [mood];

    let sql = `
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.language,
        s.audio_url,
        s.cover_url,
        s.duration,
        s.featured,
        s.moods,
        s.created_at,

        ar.name AS artist_name,
        ar.image_url AS artist_image,

        al.title AS album_title,
        al.cover_url AS album_cover,

        c.name AS category_name,

        EXISTS (
          SELECT 1
          FROM unnest(
            COALESCE(s.moods, ARRAY[]::text[])
          ) AS song_mood(value)
          WHERE LOWER(TRIM(song_mood.value)) = $1
        ) AS is_in_mood

      FROM songs s

      LEFT JOIN artists ar ON s.artist_id = ar.id
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN categories c ON s.category_id = c.id
    `;

    if (userLanguage) {
      values.push(userLanguage);
      sql += ` WHERE s.language = $${values.length}`;
    }

    sql += `
      ORDER BY s.created_at DESC, s.id DESC
    `;

    const result = await pool.query(sql, values);
    const songs = result.rows.map(transformSongMedia);

    return res.status(200).json({
      success: true,
      mood,
      count: songs.length,
      songs,
    });
  } catch (error) {
    console.error("Browse songs for mood error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to browse songs for mood",
    });
  }
};



/* =========================================================
   ADD SONG TO MOOD
========================================================= */

const addSongToMood = async (req, res) => {

  try {

    /*
      This operation changes the database.

      Therefore the user must be logged in.
    */

    if (!req.user) {

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }


    const {
      id,
    } = req.params;


    const mood =
      validateMood(
        req.body?.mood
      );


    if (!mood) {

      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }


    const result =
      await pool.query(
        `
        UPDATE songs

        SET moods =
          CASE
            WHEN $1 = ANY(
              COALESCE(
                moods,
                ARRAY[]::text[]
              )
            )
            THEN COALESCE(
              moods,
              ARRAY[]::text[]
            )

            ELSE array_append(
              COALESCE(
                moods,
                ARRAY[]::text[]
              ),
              $1
            )
          END

        WHERE id = $2

        RETURNING
          id,
          title,
          moods
        `,
        [
          mood,
          id,
        ]
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }


    return res.status(200).json({
      success: true,
      message: "Song added to mood",
      song: result.rows[0],
    });

  } catch (error) {

    console.error(
      "Add song to mood error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to add song to mood",
    });
  }
};


/* =========================================================
   REMOVE SONG FROM MOOD
========================================================= */

const removeSongFromMood = async (req, res) => {

  try {

    if (!req.user) {

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }


    const {
      id,
      mood: moodParam,
    } = req.params;


    const mood =
      validateMood(
        moodParam
      );


    if (!mood) {

      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }


    const result =
      await pool.query(
        `
        UPDATE songs

        SET moods =
          array_remove(
            COALESCE(
              moods,
              ARRAY[]::text[]
            ),
            $1
          )

        WHERE id = $2

        RETURNING
          id,
          title,
          moods
        `,
        [
          mood,
          id,
        ]
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }


    return res.status(200).json({
      success: true,
      message: "Song removed from mood",
      song: result.rows[0],
    });

  } catch (error) {

    console.error(
      "Remove song from mood error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to remove song from mood",
    });
  }
};


/* =========================================================
   GET AVAILABLE MOODS
========================================================= */


/* =========================================================
   GET AVAILABLE MOODS
========================================================= */

const getAvailableMoods = async (req, res) => {
  try {
    const userLanguage = getUserLanguage(req);
    const values = [];

    let sql = `
      SELECT
        LOWER(TRIM(mood_item.value)) AS mood,
        COUNT(DISTINCT s.id)::integer AS song_count

      FROM songs s

      CROSS JOIN LATERAL unnest(
        COALESCE(s.moods, ARRAY[]::text[])
      ) AS mood_item(value)
    `;

    if (userLanguage) {
      values.push(userLanguage);
      sql += ` WHERE s.language = $${values.length}`;
    }

    sql += `
      GROUP BY LOWER(TRIM(mood_item.value))
    `;

    const result = await pool.query(sql, values);

    const counts = new Map(
      result.rows.map((row) => [
        row.mood,
        row.song_count,
      ])
    );

    const moods = ALLOWED_MOODS.map((mood) => ({
      id: mood,
      song_count: counts.get(mood) || 0,
    }));

    return res.status(200).json({
      success: true,
      moods,
    });
  } catch (error) {
    console.error("Get available moods error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch moods",
    });
  }
};



/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  getAllSongs,

  getSongById,

  searchSongs,

  getSongsByMood,

  browseSongsForMood,

  addSongToMood,

  removeSongFromMood,

  getAvailableMoods,

};

