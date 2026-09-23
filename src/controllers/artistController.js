const pool = require("../config/db");


/* =====================================================
   GET ALL ARTISTS
===================================================== */

const getAllArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ar.id,
        ar.name,
        ar.image_url,

        COUNT(DISTINCT s.id)::int
          AS song_count,

        COUNT(DISTINCT al.id)::int
          AS album_count

      FROM artists ar

      LEFT JOIN songs s
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON al.artist_id = ar.id

      GROUP BY
        ar.id,
        ar.name,
        ar.image_url

      ORDER BY ar.name ASC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      artists: result.rows,
    });

  } catch (error) {
    console.error(
      "Get artists error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to fetch artists",
    });
  }
};


/* =====================================================
   GET ARTIST BY ID
===================================================== */

const getArtistById = async (req, res) => {
  try {
    const artistId =
      Number(req.params.id);

    if (
      !Number.isInteger(artistId) ||
      artistId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist ID",
      });
    }


    /* ARTIST */

    const artistResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          image_url

        FROM artists

        WHERE id = $1
        `,
        [artistId]
      );


    if (
      artistResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Artist not found",
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
          s.featured,

          ar.id AS artist_id,
          ar.name AS artist_name,

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

        WHERE s.artist_id = $1

        ORDER BY
          s.created_at DESC
        `,
        [artistId]
      );


    /* ALBUMS */

    const albumsResult =
      await pool.query(
        `
        SELECT
          al.id,
          al.title,
          al.cover_url,

          COUNT(s.id)::int
            AS song_count

        FROM albums al

        LEFT JOIN songs s
          ON s.album_id = al.id

        WHERE al.artist_id = $1

        GROUP BY
          al.id,
          al.title,
          al.cover_url

        ORDER BY al.id DESC
        `,
        [artistId]
      );


    res.status(200).json({
      success: true,

      artist: {
        ...artistResult.rows[0],

        song_count:
          songsResult.rows.length,

        album_count:
          albumsResult.rows.length,

        songs:
          songsResult.rows,

        albums:
          albumsResult.rows,
      },
    });

  } catch (error) {
    console.error(
      "Get artist error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to fetch artist",
    });
  }
};


module.exports = {
  getAllArtists,
  getArtistById,
};