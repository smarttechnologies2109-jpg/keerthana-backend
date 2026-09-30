
const pool = require("../config/db");


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
      songs: result.rows,
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
      song: result.rows[0],
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
      songs: result.rows,
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

const getSongsByMood = async (req, res) => {

  try {

    const mood =
      validateMood(
        req.params.mood
      );


    if (!mood) {

      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }


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

      WHERE
        $1 = ANY(
          COALESCE(
            s.moods,
            ARRAY[]::text[]
          )
        )
    `;


    const values = [
      mood,
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
      mood,
      count: result.rows.length,
      songs: result.rows,
    });

  } catch (error) {

    console.error(
      "Get songs by mood error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to fetch songs by mood",
    });
  }
};


/* =========================================================
   BROWSE ALL SONGS FOR MOOD
========================================================= */

const browseSongsForMood = async (req, res) => {

  try {

    const mood =
      validateMood(
        req.params.mood
      );


    if (!mood) {

      return res.status(400).json({
        success: false,
        message: "Invalid mood",
        allowedMoods: ALLOWED_MOODS,
      });
    }


    const userLanguage =
      getUserLanguage(req);


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

        al.title AS album_title,

        c.name AS category_name,

        CASE
          WHEN $1 = ANY(
            COALESCE(
              s.moods,
              ARRAY[]::text[]
            )
          )
          THEN true
          ELSE false
        END AS is_in_mood

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id
    `;


    const values = [
      mood,
    ];


    if (userLanguage) {

      values.push(userLanguage);

      sql += `
        WHERE s.language = $2
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
      mood,
      count: result.rows.length,
      songs: result.rows,
    });

  } catch (error) {

    console.error(
      "Browse songs for mood error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to browse songs for mood",
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

const getAvailableMoods = async (req, res) => {

  try {

    const userLanguage =
      getUserLanguage(req);


    let sql = `
      SELECT
        mood,
        COUNT(*)::integer AS song_count

      FROM
        songs,
        UNNEST(
          COALESCE(
            songs.moods,
            ARRAY[]::text[]
          )
        ) AS mood
    `;


    const values = [];


    if (userLanguage) {

      values.push(userLanguage);

      sql += `
        WHERE songs.language = $1
      `;
    }


    sql += `
      GROUP BY mood
      ORDER BY mood
    `;


    const result =
      await pool.query(
        sql,
        values
      );


    const moods =
      ALLOWED_MOODS.map(
        (mood) => {

          const found =
            result.rows.find(
              (row) =>
                row.mood === mood
            );


          return {
            id: mood,

            song_count:
              found
                ? found.song_count
                : 0,
          };
        }
      );


    return res.status(200).json({
      success: true,
      moods,
    });

  } catch (error) {

    console.error(
      "Get available moods error:",
      error
    );


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

