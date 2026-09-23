const pool =
  require("../config/db");


/* =====================================================
   GET ALL ALBUMS
===================================================== */

const getAllAlbums =
  async (req, res) => {

    try {

      const result =
        await pool.query(`
          SELECT
            al.id,
            al.title,
            al.cover_url,

            ar.id AS artist_id,
            ar.name AS artist_name,

            COUNT(s.id)::int
              AS song_count

          FROM albums al

          LEFT JOIN artists ar
            ON al.artist_id = ar.id

          LEFT JOIN songs s
            ON s.album_id = al.id

          GROUP BY
            al.id,
            al.title,
            al.cover_url,
            ar.id,
            ar.name

          ORDER BY al.id DESC
        `);


      res.status(200).json({
        success: true,
        count:
          result.rows.length,
        albums:
          result.rows,
      });

    } catch (error) {

      console.error(
        "Get albums error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to fetch albums",
      });

    }

  };


/* =====================================================
   GET ALBUM
===================================================== */

const getAlbumById =
  async (req, res) => {

    try {

      const albumId =
        Number(req.params.id);


      if (
        !Number.isInteger(albumId) ||
        albumId <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid album ID",
        });

      }


      /* ALBUM */

      const albumResult =
        await pool.query(
          `
          SELECT
            al.id,
            al.title,
            al.cover_url,

            ar.id AS artist_id,
            ar.name AS artist_name,
            ar.image_url
              AS artist_image

          FROM albums al

          LEFT JOIN artists ar
            ON al.artist_id = ar.id

          WHERE al.id = $1
          `,
          [albumId]
        );


      if (
        albumResult.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Album not found",
        });

      }


      /* SONGS */

      const songsResult =
        await pool.query(
          `
          SELECT
            s.id,
            s.title,
            s.title_english,
            s.language,
            s.audio_url,
            s.cover_url,
            s.duration,

            ar.id AS artist_id,
            ar.name AS artist_name,

            al.id AS album_id,
            al.title AS album_title,

            c.id AS category_id,
            c.name AS category_name

          FROM songs s

          LEFT JOIN artists ar
            ON s.artist_id = ar.id

          LEFT JOIN albums al
            ON s.album_id = al.id

          LEFT JOIN categories c
            ON s.category_id = c.id

          WHERE s.album_id = $1

          ORDER BY s.id ASC
          `,
          [albumId]
        );


      res.status(200).json({
        success: true,

        album: {
          ...albumResult.rows[0],

          song_count:
            songsResult.rows.length,

          songs:
            songsResult.rows,
        },
      });

    } catch (error) {

      console.error(
        "Get album error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to fetch album",
      });

    }

  };


module.exports = {
  getAllAlbums,
  getAlbumById,
};