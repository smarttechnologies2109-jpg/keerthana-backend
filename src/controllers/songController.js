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

  /*
    Only normal USER accounts are filtered
    by preferred language.

    ADMIN / BUSINESS_OWNER keep existing behavior.
  */

  const role = String(
    req.user?.role || ""
  )
    .trim()
    .toUpperCase();


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


    /* =====================================
       LANGUAGE FILTER

       Only normal logged-in USER accounts
    ===================================== */

    if (userLanguage) {

      values.push(userLanguage);

      query += `
        WHERE s.language = $1
      `;
    }


    query += `
      ORDER BY s.created_at DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.status(200).json({
      success: true,
      count: result.rows.length,
      songs: result.rows,
    });

  } catch (error) {

    console.error(
      "Get songs error:",
      error
    );

    res.status(500).json({
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

    const { id } =
      req.params;


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


    const values = [id];


    /* =====================================
       LANGUAGE FILTER
    ===================================== */

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


    if (result.rows.length === 0) {

      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }


    res.status(200).json({
      success: true,
      song: result.rows[0],
    });

  } catch (error) {

    console.error(
      "Get song error:",
      error
    );

    res.status(500).json({
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


    /* =====================================
       LANGUAGE FILTER
    ===================================== */

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
      String(
        req.params.mood || ""
      )
        .trim()
        .toLowerCase();


    if (
      !ALLOWED_MOODS.includes(mood)
    ) {

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
        $1 = ANY(s.moods)
    `;


    const values = [
      mood,
    ];


    /* =====================================
       LANGUAGE FILTER
    ===================================== */

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
        UNNEST(songs.moods) AS mood
    `;


    const values = [];


    /* =====================================
       LANGUAGE FILTER
    ===================================== */

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
  getAvailableMoods,
};