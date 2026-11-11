
const pool = require("../config/db");

// =====================================================
// GET ALL ALBUMS
// GET /api/albums
// =====================================================

const getAllAlbums = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        al.id,
        al.title,

        COALESCE(
          NULLIF(al.title_english, ''),
          al.title
        ) AS title_english,

        COALESCE(
          NULLIF(al.title_telugu, ''),
          al.title
        ) AS title_telugu,

        al.cover_url,
        al.language,
        al.release_year,

        ar.id AS artist_id,
        ar.name AS artist_name,

        COALESCE(
          NULLIF(ar.name_english, ''),
          ar.name
        ) AS artist_name_english,

        COALESCE(
          NULLIF(ar.name_telugu, ''),
          ar.name
        ) AS artist_name_telugu,

        COUNT(s.id)::integer AS song_count

      FROM albums al

      LEFT JOIN artists ar
        ON al.artist_id = ar.id

      LEFT JOIN songs s
        ON s.album_id = al.id

      GROUP BY
        al.id,
        ar.id

      ORDER BY
        al.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      albums: result.rows,
    });

  } catch (error) {
    console.error("Get albums error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch albums",
    });
  }
};

// =====================================================
// GET ALBUM BY ID
// GET /api/albums/:id
// =====================================================

const getAlbumById = async (req, res) => {
  try {
    const albumId = Number(req.params.id);

    if (
      !Number.isInteger(albumId) ||
      albumId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid album ID",
      });
    }

    // =================================================
    // ALBUM DETAILS
    // =================================================

    const albumResult = await pool.query(
      `
        SELECT
          al.id,
          al.title,

          COALESCE(
            NULLIF(al.title_english, ''),
            al.title
          ) AS title_english,

          COALESCE(
            NULLIF(al.title_telugu, ''),
            al.title
          ) AS title_telugu,

          al.cover_url,
          al.language,
          al.release_year,

          ar.id AS artist_id,
          ar.name AS artist_name,

          COALESCE(
            NULLIF(ar.name_english, ''),
            ar.name
          ) AS artist_name_english,

          COALESCE(
            NULLIF(ar.name_telugu, ''),
            ar.name
          ) AS artist_name_telugu,

          ar.image_url AS artist_image

        FROM albums al

        LEFT JOIN artists ar
          ON al.artist_id = ar.id

        WHERE al.id = $1
      `,
      [albumId]
    );

    if (albumResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Album not found",
      });
    }

    // =================================================
    // ALBUM SONGS
    // =================================================

    const songsResult = await pool.query(
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

          COALESCE(
            NULLIF(ar.name_english, ''),
            ar.name
          ) AS artist_name_english,

          COALESCE(
            NULLIF(ar.name_telugu, ''),
            ar.name
          ) AS artist_name_telugu,

          al.id AS album_id,
          al.title AS album_title,

          COALESCE(
            NULLIF(al.title_english, ''),
            al.title
          ) AS album_title_english,

          COALESCE(
            NULLIF(al.title_telugu, ''),
            al.title
          ) AS album_title_telugu,

          c.id AS category_id,
          c.name AS category_name,

          COALESCE(
            NULLIF(c.name_english, ''),
            c.name
          ) AS category_name_english,

          COALESCE(
            NULLIF(c.name_telugu, ''),
            c.name
          ) AS category_name_telugu

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

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      album: {
        ...albumResult.rows[0],

        song_count: songsResult.rows.length,

        songs: songsResult.rows,
      },
    });

  } catch (error) {
    console.error("Get album error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch album",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getAllAlbums,
  getAlbumById,
};
