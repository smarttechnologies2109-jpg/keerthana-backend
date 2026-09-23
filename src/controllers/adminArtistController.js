const pool =
  require("../config/db");


/* =========================================================
   GET ALL ARTISTS
========================================================= */

const getArtists = async (
  req,
  res
) => {

  try {

    const result =
      await pool.query(`
        SELECT
          a.id,
          a.name,
          a.bio,
          a.image_url,
          a.created_at,

          COUNT(s.id)::integer
            AS song_count

        FROM artists a

        LEFT JOIN songs s
          ON s.artist_id = a.id

        GROUP BY a.id

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

const createArtist = async (
  req,
  res
) => {

  try {

    const {
      name,
      bio,
    } = req.body;


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


    /*
     * If user selected an image:
     *
     * req.file.filename
     *
     * Example:
     * 1758450000-john.jpg
     *
     * Database:
     * /images/1758450000-john.jpg
     */

    const image_url =
      req.file
        ? `/images/${req.file.filename}`
        : null;


    const result =
      await pool.query(
        `
        INSERT INTO artists
        (
          name,
          bio,
          image_url
        )

        VALUES
        (
          $1,
          $2,
          $3
        )

        RETURNING *
        `,
        [
          name.trim(),

          bio?.trim() ||
            null,

          image_url,
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

const updateArtist = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    const {
      name,
      bio,
    } = req.body;


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


    /*
     * Get existing artist
     */

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


    /*
     * If new image uploaded:
     * use new image.
     *
     * If no new image:
     * keep existing image.
     */

    const image_url =
      req.file
        ? `/images/${req.file.filename}`
        : existing.rows[0].image_url;


    const result =
      await pool.query(
        `
        UPDATE artists

        SET
          name = $1,
          bio = $2,
          image_url = $3

        WHERE id = $4

        RETURNING *
        `,
        [
          name.trim(),

          bio?.trim() ||
            null,

          image_url,

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

const deleteArtist = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    /*
     * Check whether songs use artist
     */

    const songResult =
      await pool.query(
        `
        SELECT
          COUNT(*)::integer
            AS count

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