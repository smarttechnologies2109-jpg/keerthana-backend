const pool = require("../config/db");

/* =========================================================
   GET ALL MINISTRIES
   GET /api/ministries
========================================================= */

const getMinistries = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        image_url,
        created_at
      FROM ministries
      ORDER BY name ASC
    `);

    return res.status(200).json(
      result.rows
    );

  } catch (error) {
    console.error(
      "Get ministries error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load ministries.",
    });
  }
};


/* =========================================================
   GET SINGLE MINISTRY
   GET /api/ministries/:id
========================================================= */

const getMinistryById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        image_url,
        created_at
      FROM ministries
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    return res.status(200).json(
      result.rows[0]
    );

  } catch (error) {
    console.error(
      "Get ministry error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load ministry.",
    });
  }
};


/* =========================================================
   GET SONGS BY MINISTRY
   GET /api/ministries/:id/songs
========================================================= */

const getSongsByMinistry = async (req, res) => {
  try {
    const { id } = req.params;

    /* -----------------------------------------------------
       Check ministry exists
    ----------------------------------------------------- */

    const ministryResult = await pool.query(
      `
      SELECT
        id,
        name
      FROM ministries
      WHERE id = $1
      `,
      [id]
    );

    if (ministryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }


    /* -----------------------------------------------------
       Get songs belonging to ministry
    ----------------------------------------------------- */

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.artist,
        s.category,
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
        c.name AS category_name,

        s.ministry_id

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      WHERE s.ministry_id = $1

      ORDER BY
        s.created_at DESC,
        s.id DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      ministry: ministryResult.rows[0],
      count: result.rows.length,
      songs: result.rows,
    });

  } catch (error) {
    console.error(
      "Get songs by ministry error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch ministry songs.",
    });
  }
};


module.exports = {
  getMinistries,
  getMinistryById,
  getSongsByMinistry,
};