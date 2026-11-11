
const pool = require("../config/db");

/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

/* =========================================================
   VALIDATE ARTIST ID
========================================================= */

const isValidId = (id) => {
  return /^\d+$/.test(String(id || "")) &&
    Number(id) > 0;
};

/* =========================================================
   GET ALL ARTISTS
========================================================= */

const getArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.name,

        COALESCE(
          NULLIF(a.name_english, ''),
          a.name
        ) AS name_english,

        COALESCE(
          NULLIF(a.name_telugu, ''),
          a.name
        ) AS name_telugu,

        a.bio,
        a.image_url,
        a.language,
        a.created_at,

        COUNT(DISTINCT s.id)::integer AS song_count

      FROM public.artists a

      LEFT JOIN public.songs s
        ON s.artist_id = a.id

      GROUP BY
        a.id,
        a.name,
        a.name_english,
        a.name_telugu,
        a.bio,
        a.image_url,
        a.language,
        a.created_at

      ORDER BY
        a.name ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      artists: result.rows,
    });

  } catch (error) {
    console.error("Admin get artists error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load artists.",
    });
  }
};

/* =========================================================
   CREATE ARTIST
========================================================= */

const createArtist = async (req, res) => {
  try {
    const {
      name,
      name_english,
      name_telugu,
      bio,
      language,
    } = req.body;

    /* -----------------------------------------------------
       NORMALIZE NAMES

       Backward compatibility:
       Old clients sending only "name" still work.
    ----------------------------------------------------- */

    const englishName =
      String(name_english || name || "").trim();

    const teluguName =
      String(name_telugu || name || "").trim();

    if (!englishName) {
      return res.status(400).json({
        success: false,
        message: "English artist name is required.",
      });
    }

    if (!teluguName) {
      return res.status(400).json({
        success: false,
        message: "Telugu artist name is required.",
      });
    }

    /* -----------------------------------------------------
       LANGUAGE
    ----------------------------------------------------- */

    const artistLanguage =
      String(language || "Telugu").trim();

    if (!ALLOWED_LANGUAGES.includes(artistLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist language.",
      });
    }

    /* -----------------------------------------------------
       CHECK DUPLICATE ARTIST

       Check both names against existing records.
    ----------------------------------------------------- */

    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM public.artists
      WHERE
        LOWER(TRIM(COALESCE(NULLIF(name_english, ''), name)))
          = LOWER($1)

        OR

        LOWER(TRIM(COALESCE(NULLIF(name_telugu, ''), name)))
          = LOWER($2)

      LIMIT 1
      `,
      [englishName, teluguName]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An artist with the same English or Telugu name already exists.",
      });
    }

    /* -----------------------------------------------------
       IMAGE

       Preserve existing image upload behavior.
    ----------------------------------------------------- */

    const image_url = req.file
      ? `/images/${req.file.filename}`
      : null;

    /* -----------------------------------------------------
       INSERT ARTIST
    ----------------------------------------------------- */

    const result = await pool.query(
      `
      INSERT INTO public.artists
      (
        name,
        name_english,
        name_telugu,
        bio,
        image_url,
        language
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        name,
        name_english,
        name_telugu,
        bio,
        image_url,
        language,
        created_at
      `,
      [
        teluguName,
        englishName,
        teluguName,
        bio?.trim() || null,
        image_url,
        artistLanguage,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Artist created successfully.",
      artist: result.rows[0],
    });

  } catch (error) {
    console.error("Create artist error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create artist.",
    });
  }
};

/* =========================================================
   UPDATE ARTIST
========================================================= */

const updateArtist = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    const {
      name,
      name_english,
      name_telugu,
      bio,
      language,
    } = req.body;

    /* -----------------------------------------------------
       GET EXISTING ARTIST
    ----------------------------------------------------- */

    const existing = await pool.query(
      `
      SELECT
        id,
        name,
        name_english,
        name_telugu,
        bio,
        image_url,
        language
      FROM public.artists
      WHERE id = $1
      `,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    const oldArtist = existing.rows[0];

    /* -----------------------------------------------------
       NORMALIZE NAMES

       Supports both bilingual and legacy requests.
    ----------------------------------------------------- */

    const englishName = String(
      name_english !== undefined
        ? name_english
        : oldArtist.name_english || name || oldArtist.name
    ).trim();

    const teluguName = String(
      name_telugu !== undefined
        ? name_telugu
        : name !== undefined
          ? name
          : oldArtist.name_telugu || oldArtist.name
    ).trim();

    if (!englishName) {
      return res.status(400).json({
        success: false,
        message: "English artist name is required.",
      });
    }

    if (!teluguName) {
      return res.status(400).json({
        success: false,
        message: "Telugu artist name is required.",
      });
    }

    /* -----------------------------------------------------
       LANGUAGE
    ----------------------------------------------------- */

    const artistLanguage =
      String(language || oldArtist.language || "Telugu").trim();

    if (!ALLOWED_LANGUAGES.includes(artistLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist language.",
      });
    }

    /* -----------------------------------------------------
       CHECK DUPLICATE ARTIST
    ----------------------------------------------------- */

    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM public.artists
      WHERE id <> $3
      AND (
        LOWER(TRIM(COALESCE(NULLIF(name_english, ''), name)))
          = LOWER($1)

        OR

        LOWER(TRIM(COALESCE(NULLIF(name_telugu, ''), name)))
          = LOWER($2)
      )
      LIMIT 1
      `,
      [englishName, teluguName, id]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another artist with the same English or Telugu name already exists.",
      });
    }

    /* -----------------------------------------------------
       IMAGE

       Keep the existing image when no new file is uploaded.
    ----------------------------------------------------- */

    const image_url = req.file
      ? `/images/${req.file.filename}`
      : oldArtist.image_url;

    /* -----------------------------------------------------
       BIO
    ----------------------------------------------------- */

    const artistBio =
      bio !== undefined
        ? bio.trim() || null
        : oldArtist.bio;

    /* -----------------------------------------------------
       UPDATE
    ----------------------------------------------------- */

    const result = await pool.query(
      `
      UPDATE public.artists
      SET
        name = $1,
        name_english = $2,
        name_telugu = $3,
        bio = $4,
        image_url = $5,
        language = $6

      WHERE id = $7

      RETURNING
        id,
        name,
        name_english,
        name_telugu,
        bio,
        image_url,
        language,
        created_at
      `,
      [
        teluguName,
        englishName,
        teluguName,
        artistBio,
        image_url,
        artistLanguage,
        id,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Artist updated successfully.",
      artist: result.rows[0],
    });

  } catch (error) {
    console.error("Update artist error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update artist.",
    });
  }
};

/* =========================================================
   DELETE ARTIST
========================================================= */

const deleteArtist = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    /* -----------------------------------------------------
       CHECK ARTIST EXISTS
    ----------------------------------------------------- */

    const existing = await pool.query(
      `
      SELECT id
      FROM public.artists
      WHERE id = $1
      `,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    /* -----------------------------------------------------
       CHECK ASSIGNED SONGS
    ----------------------------------------------------- */

    const songResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS count
      FROM public.songs
      WHERE artist_id = $1
      `,
      [id]
    );

    if (songResult.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this artist because songs are assigned to this artist.",
      });
    }

    /* -----------------------------------------------------
       DELETE
    ----------------------------------------------------- */

    await pool.query(
      `
      DELETE FROM public.artists
      WHERE id = $1
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Artist deleted successfully.",
    });

  } catch (error) {
    console.error("Delete artist error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete artist.",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getArtists,
  createArtist,
  updateArtist,
  deleteArtist,
};
