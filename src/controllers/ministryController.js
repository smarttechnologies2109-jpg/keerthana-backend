const pool = require("../config/db");

/* =========================================================
   MINISTRY SELECT QUERY
   Reused by ministry endpoints
========================================================= */

const MINISTRY_SELECT_QUERY = `
  SELECT
    id,
    name,
    COALESCE(NULLIF(name_english, ''), name) AS name_english,
    COALESCE(NULLIF(name_telugu, ''), name) AS name_telugu,
    description,
    image_url,
    language,
    created_at
  FROM public.ministries
`;

/* =========================================================
   VALIDATE MINISTRY ID
========================================================= */

const isValidMinistryId = (id) => {
  return /^\d+$/.test(String(id || "")) && Number(id) > 0;
};

/* =========================================================
   GET ALL MINISTRIES
   GET /api/ministries
========================================================= */

const getMinistries = async (req, res) => {
  try {
    const result = await pool.query(`
      ${MINISTRY_SELECT_QUERY}
      ORDER BY name ASC, id ASC
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get ministries error:", error);

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

    if (!isValidMinistryId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    const result = await pool.query(
      `
        ${MINISTRY_SELECT_QUERY}
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Get ministry by ID error:", error);

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

    if (!isValidMinistryId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    /* -----------------------------------------------------
       CHECK MINISTRY EXISTS
    ----------------------------------------------------- */

    const ministryResult = await pool.query(
      `
        ${MINISTRY_SELECT_QUERY}
        WHERE id = $1
        LIMIT 1
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
       GET SONGS BELONGING TO MINISTRY
    ----------------------------------------------------- */

    const songsResult = await pool.query(
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

          COALESCE(
            NULLIF(c.name_english, ''),
            c.name
          ) AS category_name_english,

          COALESCE(
            NULLIF(c.name_telugu, ''),
            c.name
          ) AS category_name_telugu,

          s.ministry_id

        FROM public.songs s

        LEFT JOIN public.artists ar
          ON s.artist_id = ar.id

        LEFT JOIN public.albums al
          ON s.album_id = al.id

        LEFT JOIN public.categories c
          ON s.category_id = c.id

        WHERE s.ministry_id = $1

        ORDER BY
          s.created_at DESC NULLS LAST,
          s.id DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      ministry: ministryResult.rows[0],
      count: songsResult.rows.length,
      songs: songsResult.rows,
    });
  } catch (error) {
    console.error("Get songs by ministry error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch ministry songs.",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getMinistries,
  getMinistryById,
  getSongsByMinistry,
};