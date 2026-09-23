const pool =
  require("../config/db");

const fs =
  require("fs");

const path =
  require("path");


/* =========================================================
   GET ALL ALBUMS
========================================================= */

const getAlbums = async (
  req,
  res
) => {

  try {

    const result =
      await pool.query(`
        SELECT
          al.id,
          al.title,
          al.artist_id,
          al.cover_url,
          al.release_year,
          al.created_at,

          ar.name AS artist_name,

          COUNT(s.id)::integer
            AS song_count

        FROM albums al

        LEFT JOIN artists ar
          ON al.artist_id = ar.id

        LEFT JOIN songs s
          ON s.album_id = al.id

        GROUP BY
          al.id,
          ar.name

        ORDER BY
          al.created_at DESC,
          al.id DESC
      `);


    return res
      .status(200)
      .json({

        success: true,

        count:
          result.rows.length,

        albums:
          result.rows,

      });


  } catch (error) {

    console.error(
      "Admin get albums error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to load albums",

      });

  }

};


/* =========================================================
   CREATE ALBUM
========================================================= */

const createAlbum = async (
  req,
  res
) => {

  try {

    const {
      title,
      artist_id,
      release_year,
    } = req.body;


    /* =====================================================
       TITLE
    ===================================================== */

    if (
      !title ||
      !title.trim()
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Album title is required",

        });

    }


    /* =====================================================
       RELEASE YEAR
    ===================================================== */

    let releaseYear =
      null;


    if (release_year) {

      releaseYear =
        Number(
          release_year
        );


      if (
        !Number.isInteger(
          releaseYear
        ) ||
        releaseYear < 1900 ||
        releaseYear > 2100
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Please enter a valid release year",

          });

      }

    }


    /* =====================================================
       COVER IMAGE
    ===================================================== */

    let coverUrl =
      null;


    if (req.file) {

      coverUrl =
        `/uploads/albums/${req.file.filename}`;

    }


    /* =====================================================
       INSERT
    ===================================================== */

    const result =
      await pool.query(
        `
        INSERT INTO albums
        (
          title,
          artist_id,
          cover_url,
          release_year
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

          title.trim(),

          artist_id
            ? Number(
                artist_id
              )
            : null,

          coverUrl,

          releaseYear,

        ]
      );


    return res
      .status(201)
      .json({

        success: true,

        message:
          "Album created successfully",

        album:
          result.rows[0],

      });


  } catch (error) {

    console.error(
      "Create album error:",
      error
    );


    if (
      error.code === "23503"
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Selected artist does not exist",

        });

    }


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to create album",

      });

  }

};


/* =========================================================
   UPDATE ALBUM
========================================================= */

const updateAlbum = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    const {
      title,
      artist_id,
      release_year,
    } = req.body;


    /* =====================================================
       TITLE
    ===================================================== */

    if (
      !title ||
      !title.trim()
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Album title is required",

        });

    }


    /* =====================================================
       RELEASE YEAR
    ===================================================== */

    let releaseYear =
      null;


    if (release_year) {

      releaseYear =
        Number(
          release_year
        );


      if (
        !Number.isInteger(
          releaseYear
        ) ||
        releaseYear < 1900 ||
        releaseYear > 2100
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Please enter a valid release year",

          });

      }

    }


    /* =====================================================
       GET EXISTING ALBUM
    ===================================================== */

    const existingResult =
      await pool.query(
        `
        SELECT
          id,
          cover_url
        FROM albums
        WHERE id = $1
        `,
        [id]
      );


    if (
      existingResult.rows.length ===
      0
    ) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            "Album not found",

        });

    }


    const existingAlbum =
      existingResult.rows[0];


    /* =====================================================
       COVER
       
       If new file exists:
         use new file

       If no new file:
         keep existing cover
    ===================================================== */

    let coverUrl =
      existingAlbum.cover_url;


    if (req.file) {

      coverUrl =
        `/uploads/albums/${req.file.filename}`;


      /* =================================================
         DELETE OLD IMAGE
      ================================================= */

      if (
        existingAlbum.cover_url &&
        existingAlbum.cover_url.startsWith(
          "/uploads/albums/"
        )
      ) {

        const oldFile =
          path.join(
            process.cwd(),
            existingAlbum.cover_url
              .replace(
                /^\//,
                ""
              )
          );


        fs.unlink(
          oldFile,
          (error) => {

            if (
              error &&
              error.code !== "ENOENT"
            ) {

              console.error(
                "Unable to delete old album cover:",
                error
              );

            }

          }
        );

      }

    }


    /* =====================================================
       UPDATE
    ===================================================== */

    const result =
      await pool.query(
        `
        UPDATE albums

        SET
          title = $1,
          artist_id = $2,
          cover_url = $3,
          release_year = $4

        WHERE id = $5

        RETURNING *
        `,
        [

          title.trim(),

          artist_id
            ? Number(
                artist_id
              )
            : null,

          coverUrl,

          releaseYear,

          id,

        ]
      );


    return res
      .status(200)
      .json({

        success: true,

        message:
          "Album updated successfully",

        album:
          result.rows[0],

      });


  } catch (error) {

    console.error(
      "Update album error:",
      error
    );


    if (
      error.code === "23503"
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Selected artist does not exist",

        });

    }


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to update album",

      });

  }

};


/* =========================================================
   DELETE ALBUM
========================================================= */

const deleteAlbum = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    /* =====================================================
       CHECK SONGS
    ===================================================== */

    const songResult =
      await pool.query(
        `
        SELECT
          COUNT(*)::integer
            AS count

        FROM songs

        WHERE album_id = $1
        `,
        [id]
      );


    if (
      songResult.rows[0].count >
      0
    ) {

      return res
        .status(409)
        .json({

          success: false,

          message:
            "Cannot delete this album because songs are assigned to it.",

        });

    }


    /* =====================================================
       GET COVER BEFORE DELETE
    ===================================================== */

    const albumResult =
      await pool.query(
        `
        SELECT
          cover_url
        FROM albums
        WHERE id = $1
        `,
        [id]
      );


    if (
      albumResult.rows.length ===
      0
    ) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            "Album not found",

        });

    }


    const coverUrl =
      albumResult.rows[0]
        .cover_url;


    /* =====================================================
       DELETE ALBUM
    ===================================================== */

    const result =
      await pool.query(
        `
        DELETE FROM albums

        WHERE id = $1

        RETURNING id
        `,
        [id]
      );


    /* =====================================================
       DELETE COVER IMAGE
    ===================================================== */

    if (
      coverUrl &&
      coverUrl.startsWith(
        "/uploads/albums/"
      )
    ) {

      const filePath =
        path.join(
          process.cwd(),
          coverUrl.replace(
            /^\//,
            ""
          )
        );


      fs.unlink(
        filePath,
        (error) => {

          if (
            error &&
            error.code !== "ENOENT"
          ) {

            console.error(
              "Unable to delete album cover:",
              error
            );

          }

        }
      );

    }


    return res
      .status(200)
      .json({

        success: true,

        message:
          "Album deleted successfully",

      });


  } catch (error) {

    console.error(
      "Delete album error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Unable to delete album",

      });

  }

};


module.exports = {

  getAlbums,

  createAlbum,

  updateAlbum,

  deleteAlbum,

};