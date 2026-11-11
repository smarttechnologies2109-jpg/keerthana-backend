
const pool = require("../config/db");

/* =====================================================
   GET ALL ARTISTS
   GET /api/artists
===================================================== */

const getAllArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ar.id,
        ar.name,

        COALESCE(
          NULLIF(ar.name_english, ''),
          ar.name
        ) AS name_english,

        COALESCE(
          NULLIF(ar.name_telugu, ''),
          ar.name
        ) AS name_telugu,

        ar.image_url,
        ar.language,

        COUNT(DISTINCT s.id)::integer AS song_count,

        COUNT(DISTINCT al.id)::integer AS album_count

      FROM public.artists ar

      LEFT JOIN public.songs s
        ON s.artist_id = ar.id

      LEFT JOIN public.albums al
        ON al.artist_id = ar.id

      GROUP BY
        ar.id,
        ar.name,
        ar.name_english,
        ar.name_telugu,
        ar.image_url,
        ar.language

      ORDER BY ar.name ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      artists: result.rows,
    });

  } catch (error) {
    console.error("Get artists error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch artists.",
    });
  }
};

/* =====================================================
   GET ARTIST BY ID
   GET /api/artists/:id
===================================================== */

const getArtistById = async (req, res) => {
  try {
    const artistId = Number(req.params.id);

    if (
      !Number.isInteger(artistId) ||
      artistId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    /* -------------------------------------------------
       ARTIST DETAILS
    ------------------------------------------------- */

    const artistResult = await pool.query(
      `
      SELECT
        id,
        name,

        COALESCE(
          NULLIF(name_english, ''),
          name
        ) AS name_english,

        COALESCE(
          NULLIF(name_telugu, ''),
          name
        ) AS name_telugu,

        image_url,
        bio,
        language,
        created_at

      FROM public.artists

      WHERE id = $1
      `,
      [artistId]
    );

    if (artistResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    /* -------------------------------------------------
       SONGS
    ------------------------------------------------- */

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
        s.featured,

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
        al.cover_url AS album_cover,

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

      FROM public.songs s

      LEFT JOIN public.artists ar
        ON s.artist_id = ar.id

      LEFT JOIN public.albums al
        ON s.album_id = al.id

      LEFT JOIN public.categories c
        ON s.category_id = c.id

      WHERE s.artist_id = $1

      ORDER BY
        s.created_at DESC,
        s.id DESC
      `,
      [artistId]
    );

    /* -------------------------------------------------
       ALBUMS
    ------------------------------------------------- */

    const albumsResult = await pool.query(
      `
      SELECT
        al.id,
        al.title,
        al.cover_url,

        COUNT(s.id)::integer AS song_count

      FROM public.albums al

      LEFT JOIN public.songs s
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

    /* -------------------------------------------------
       RESPONSE
    ------------------------------------------------- */

    return res.status(200).json({
      success: true,

      artist: {
        ...artistResult.rows[0],

        song_count: songsResult.rows.length,

        album_count: albumsResult.rows.length,

        songs: songsResult.rows,

        albums: albumsResult.rows,
      },
    });

  } catch (error) {
    console.error("Get artist error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch artist.",
    });
  }
};

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  getAllArtists,
  getArtistById,
};
