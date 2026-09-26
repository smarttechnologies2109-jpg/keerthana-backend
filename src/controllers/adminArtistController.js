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
   GET ALL ARTISTS
========================================================= */

const getArtists = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        a.id,
        a.name,
        a.bio,
        a.image_url,
        a.language,
        a.created_at,

        COUNT(s.id)::integer AS song_count

      FROM artists a

      LEFT JOIN songs s
        ON s.artist_id = a.id

      GROUP BY
        a.id,
        a.name,
        a.bio,
        a.image_url,
        a.language,
        a.created_at

      ORDER BY
        a.name ASC
    `);


    return res.status(200).json({

      success: true,

      count:
        result.rows.length,

      artists:
        result.rows,

    });


  } catch (error) {

    console.error(
      "Admin get artists error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to load artists",

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
      bio,
      language,
    } = req.body;


    /* -----------------------------------------------------
       VALIDATE NAME
    ----------------------------------------------------- */

    if (
      !name ||
      !name.trim()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Artist name is required",

      });

    }


    /* -----------------------------------------------------
       LANGUAGE
    ----------------------------------------------------- */

    const artistLanguage =
      language?.trim() || "Telugu";


    if (
      !ALLOWED_LANGUAGES.includes(
        artistLanguage
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid artist language",

      });

    }


    /* -----------------------------------------------------
       IMAGE
    ----------------------------------------------------- */

    const image_url =
      req.file
        ? `/images/${req.file.filename}`
        : null;


    /* -----------------------------------------------------
       INSERT
    ----------------------------------------------------- */

    const result =
      await pool.query(
        `
        INSERT INTO artists
        (
          name,
          bio,
          image_url,
          language
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4
        )

        RETURNING *
        `,
        [
          name.trim(),

          bio?.trim() ||
            null,

          image_url,

          artistLanguage,
        ]
      );


    return res.status(201).json({

      success: true,

      message:
        "Artist created successfully",

      artist:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Create artist error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to create artist",

    });

  }

};


/* =========================================================
   UPDATE ARTIST
========================================================= */

const updateArtist = async (req, res) => {

  try {

    const {
      id,
    } = req.params;


    const {
      name,
      bio,
      language,
    } = req.body;


    /* -----------------------------------------------------
       VALIDATE NAME
    ----------------------------------------------------- */

    if (
      !name ||
      !name.trim()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Artist name is required",

      });

    }


    /* -----------------------------------------------------
       LANGUAGE
    ----------------------------------------------------- */

    const artistLanguage =
      language?.trim() || "Telugu";


    if (
      !ALLOWED_LANGUAGES.includes(
        artistLanguage
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid artist language",

      });

    }


    /* -----------------------------------------------------
       GET EXISTING ARTIST
    ----------------------------------------------------- */

    const existing =
      await pool.query(
        `
        SELECT
          id,
          image_url

        FROM artists

        WHERE id = $1
        `,
        [id]
      );


    if (
      existing.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Artist not found",

      });

    }


    /* -----------------------------------------------------
       IMAGE
    ----------------------------------------------------- */

    const image_url =
      req.file
        ? `/images/${req.file.filename}`
        : existing.rows[0].image_url;


    /* -----------------------------------------------------
       UPDATE
    ----------------------------------------------------- */

    const result =
      await pool.query(
        `
        UPDATE artists

        SET
          name = $1,
          bio = $2,
          image_url = $3,
          language = $4

        WHERE id = $5

        RETURNING *
        `,
        [
          name.trim(),

          bio?.trim() ||
            null,

          image_url,

          artistLanguage,

          id,
        ]
      );


    return res.status(200).json({

      success: true,

      message:
        "Artist updated successfully",

      artist:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Update artist error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to update artist",

    });

  }

};


/* =========================================================
   DELETE ARTIST
========================================================= */

const deleteArtist = async (req, res) => {

  try {

    const {
      id,
    } = req.params;


    /* -----------------------------------------------------
       CHECK SONGS
    ----------------------------------------------------- */

    const songResult =
      await pool.query(
        `
        SELECT
          COUNT(*)::integer AS count

        FROM songs

        WHERE artist_id = $1
        `,
        [id]
      );


    if (
      songResult.rows[0].count >
      0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Cannot delete this artist because songs are assigned to this artist.",

      });

    }


    /* -----------------------------------------------------
       DELETE ARTIST
    ----------------------------------------------------- */

    const result =
      await pool.query(
        `
        DELETE FROM artists

        WHERE id = $1

        RETURNING id
        `,
        [id]
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Artist not found",

      });

    }


    return res.status(200).json({

      success: true,

      message:
        "Artist deleted successfully",

    });


  } catch (error) {

    console.error(
      "Delete artist error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to delete artist",

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