const pool = require("../config/db");


/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

const SUPPORTED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];


/* =========================================================
   LANGUAGE VALIDATION
========================================================= */

const getLanguageFromQuery = (req, res) => {

  const language = String(
    req.query.language || ""
  ).trim();


  if (!language) {
    return {
      language: "",
      valid: true,
    };
  }


  if (!SUPPORTED_LANGUAGES.includes(language)) {

    res.status(400).json({
      message:
        "Invalid language. Supported languages are Telugu, Hindi, English, Malayalam, Kannada and Tamil.",
    });

    return {
      language,
      valid: false,
    };

  }


  return {
    language,
    valid: true,
  };

};


/* =========================================================
   GET OWNER SONGS
========================================================= */

const getOwnerSongs = async (req, res) => {

  try {

    const {
      language,
      valid,
    } = getLanguageFromQuery(
      req,
      res
    );


    if (!valid) {
      return;
    }


    let query = `
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.language,
        s.lyrics,
        s.audio_url,
        s.cover_url,

        a.name AS artist_name,

        al.title AS album_title,

        c.name AS category_name,

        m.name AS ministry_name

      FROM songs s

      LEFT JOIN artists a
        ON a.id = s.artist_id

      LEFT JOIN albums al
        ON al.id = s.album_id

      LEFT JOIN categories c
        ON c.id = s.category_id

      LEFT JOIN ministries m
        ON m.id = s.ministry_id
    `;


    const values = [];


    if (language) {

      values.push(language);

      query += `
        WHERE s.language = $1
      `;

    }


    query += `
      ORDER BY s.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.json(result.rows);

  } catch (error) {

    console.error(
      "Owner songs error:",
      error
    );


    res.status(500).json({
      message:
        "Failed to load owner songs.",
    });

  }

};


/* =========================================================
   GET OWNER ALBUMS
========================================================= */

const getOwnerAlbums = async (req, res) => {

  try {

    const {
      language,
      valid,
    } = getLanguageFromQuery(
      req,
      res
    );


    if (!valid) {
      return;
    }


    let query = `
      SELECT
        al.id,
        al.title,
        al.artist_id,
        al.cover_url,
        al.release_year,

        a.name AS artist_name,

        COUNT(
          s.id
        )::int AS song_count,

        COALESCE(
          MAX(s.language),
          ''
        ) AS language

      FROM albums al

      LEFT JOIN artists a
        ON a.id = al.artist_id

      LEFT JOIN songs s
        ON s.album_id = al.id
    `;


    const values = [];


    if (language) {

      values.push(language);

      query += `
        WHERE EXISTS (
          SELECT 1
          FROM songs ls
          WHERE ls.album_id = al.id
          AND ls.language = $1
        )
      `;

    }


    query += `
      GROUP BY
        al.id,
        al.title,
        al.artist_id,
        al.cover_url,
        al.release_year,
        a.name

      ORDER BY
        al.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.json(result.rows);

  } catch (error) {

    console.error(
      "Owner albums error:",
      error
    );


    res.status(500).json({
      message:
        "Failed to load owner albums.",
    });

  }

};


/* =========================================================
   GET OWNER ARTISTS
========================================================= */

const getOwnerArtists = async (req, res) => {

  try {

    const {
      language,
      valid,
    } = getLanguageFromQuery(
      req,
      res
    );


    if (!valid) {
      return;
    }


    let query = `
      SELECT
        a.id,
        a.name,
        a.image_url,
        a.bio,

        COUNT(
          s.id
        )::int AS song_count,

        COALESCE(
          MAX(s.language),
          ''
        ) AS language

      FROM artists a

      LEFT JOIN songs s
        ON s.artist_id = a.id
    `;


    const values = [];


    if (language) {

      values.push(language);

      query += `
        WHERE EXISTS (
          SELECT 1
          FROM songs ls
          WHERE ls.artist_id = a.id
          AND ls.language = $1
        )
      `;

    }


    query += `
      GROUP BY
        a.id,
        a.name,
        a.image_url,
        a.bio

      ORDER BY
        a.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.json(result.rows);

  } catch (error) {

    console.error(
      "Owner artists error:",
      error
    );


    res.status(500).json({
      message:
        "Failed to load owner artists.",
    });

  }

};


/* =========================================================
   GET OWNER CATEGORIES
========================================================= */

const getOwnerCategories = async (
  req,
  res
) => {

  try {

    const {
      language,
      valid,
    } = getLanguageFromQuery(
      req,
      res
    );


    if (!valid) {
      return;
    }


    let query = `
      SELECT
        c.id,
        c.name,
        c.image_url,

        COUNT(
          s.id
        )::int AS song_count,

        COALESCE(
          MAX(s.language),
          ''
        ) AS language

      FROM categories c

      LEFT JOIN songs s
        ON s.category_id = c.id
    `;


    const values = [];


    if (language) {

      values.push(language);

      query += `
        WHERE EXISTS (
          SELECT 1
          FROM songs ls
          WHERE ls.category_id = c.id
          AND ls.language = $1
        )
      `;

    }


    query += `
      GROUP BY
        c.id,
        c.name,
        c.image_url

      ORDER BY
        c.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.json(result.rows);

  } catch (error) {

    console.error(
      "Owner categories error:",
      error
    );


    res.status(500).json({
      message:
        "Failed to load owner categories.",
    });

  }

};


/* =========================================================
   GET OWNER MINISTRIES
========================================================= */

const getOwnerMinistries = async (
  req,
  res
) => {

  try {

    const {
      language,
      valid,
    } = getLanguageFromQuery(
      req,
      res
    );


    if (!valid) {
      return;
    }


    let query = `
      SELECT
        m.id,
        m.name,
        m.image_url,
        m.description,

        COUNT(
          s.id
        )::int AS song_count,

        COALESCE(
          MAX(s.language),
          ''
        ) AS language

      FROM ministries m

      LEFT JOIN songs s
        ON s.ministry_id = m.id
    `;


    const values = [];


    if (language) {

      values.push(language);

      query += `
        WHERE EXISTS (
          SELECT 1
          FROM songs ls
          WHERE ls.ministry_id = m.id
          AND ls.language = $1
        )
      `;

    }


    query += `
      GROUP BY
        m.id,
        m.name,
        m.image_url,
        m.description

      ORDER BY
        m.id DESC
    `;


    const result =
      await pool.query(
        query,
        values
      );


    res.json(result.rows);

  } catch (error) {

    console.error(
      "Owner ministries error:",
      error
    );


    res.status(500).json({
      message:
        "Failed to load owner ministries.",
    });

  }

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  getOwnerSongs,
  getOwnerAlbums,
  getOwnerArtists,
  getOwnerCategories,
  getOwnerMinistries,

};