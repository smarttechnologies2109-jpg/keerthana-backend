
const pool = require("../config/db");

/* =====================================================
   GET ALL ARTISTS
   GET /api/artists

   Counts songs from both:
   1. songs.artist_id
   2. song_artists.artist_id
===================================================== */

const getAllArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ar.id,
        ar.name,

        COALESCE(
          NULLIF(BTRIM(ar.name_english), ''),
          ar.name
        ) AS name_english,

        COALESCE(
          NULLIF(BTRIM(ar.name_telugu), ''),
          ar.name
        ) AS name_telugu,

        ar.image_url,
        ar.language,

        COUNT(DISTINCT s.id)::integer AS song_count,

        COUNT(DISTINCT al.id)::integer AS album_count

      FROM public.artists ar

      LEFT JOIN public.songs s
        ON (
          s.artist_id = ar.id
          OR EXISTS (
            SELECT 1
            FROM public.song_artists sa
            WHERE sa.song_id = s.id
              AND sa.artist_id = ar.id
          )
        )

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

   Returns songs associated with this artist through
   either songs.artist_id or song_artists.
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
          NULLIF(BTRIM(name_english), ''),
          name
        ) AS name_english,

        COALESCE(
          NULLIF(BTRIM(name_telugu), ''),
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

       IMPORTANT:
       A song appears in every artist profile linked
       through song_artists.

       Legacy songs using artist_id also continue working.
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
        s.artist_id,
        s.album_id,
        s.category_id,
        s.ministry_id,
        s.created_at,

        /* LEGACY / MAIN ARTIST FIELDS */
        ar.id AS primary_artist_id,
        ar.name AS artist_name,

        COALESCE(
          NULLIF(BTRIM(ar.name_english), ''),
          ar.name
        ) AS artist_name_english,

        COALESCE(
          NULLIF(BTRIM(ar.name_telugu), ''),
          ar.name
        ) AS artist_name_telugu,

        /* ALL LINKED ARTISTS */
        COALESCE(
          artist_data.artists,
          '[]'::json
        ) AS artists,

        COALESCE(
          artist_data.artist_ids,
          ARRAY[]::integer[]
        ) AS artist_ids,

        /* ALBUM */
        al.id AS album_id,
        al.title AS album_title,
        al.cover_url AS album_cover,

        /* CATEGORY */
        c.id AS category_id,
        c.name AS category_name,

        COALESCE(
          NULLIF(BTRIM(c.name_english), ''),
          c.name
        ) AS category_name_english,

        COALESCE(
          NULLIF(BTRIM(c.name_telugu), ''),
          c.name
        ) AS category_name_telugu

      FROM public.songs s

      LEFT JOIN public.artists ar
        ON s.artist_id = ar.id

      LEFT JOIN public.albums al
        ON s.album_id = al.id

      LEFT JOIN public.categories c
        ON s.category_id = c.id

      /* Fetch every artist linked to this song */
      LEFT JOIN LATERAL (
        SELECT
          json_agg(
            json_build_object(
              'id', artist.id,
              'artist_id', artist.id,
              'name', artist.name,
              'name_english', artist.name_english,
              'name_telugu', artist.name_telugu,
              'image_url', artist.image_url
            )
            ORDER BY
              (artist.id = s.artist_id) DESC,
              artist.id ASC
          ) AS artists,

          array_agg(
            artist.id
            ORDER BY
              (artist.id = s.artist_id) DESC,
              artist.id ASC
          ) AS artist_ids

        FROM (
          SELECT DISTINCT
            a.id,
            a.name,

            COALESCE(
              NULLIF(BTRIM(a.name_english), ''),
              a.name
            ) AS name_english,

            COALESCE(
              NULLIF(BTRIM(a.name_telugu), ''),
              a.name
            ) AS name_telugu,

            a.image_url

          FROM public.artists a

          WHERE
            a.id = s.artist_id

            OR EXISTS (
              SELECT 1
              FROM public.song_artists sa
              WHERE sa.song_id = s.id
                AND sa.artist_id = a.id
            )

        ) artist
      ) artist_data ON TRUE

      WHERE
        s.artist_id = $1

        OR EXISTS (
          SELECT 1
          FROM public.song_artists sa
          WHERE sa.song_id = s.id
            AND sa.artist_id = $1
        )

      ORDER BY
        s.created_at DESC NULLS LAST,
        s.id DESC
      `,
      [artistId]
    );

    /* -------------------------------------------------
       ALBUMS

       Keep existing album ownership behavior.
    ------------------------------------------------- */

    const albumsResult = await pool.query(
      `
      SELECT
        al.id,
        al.title,
        al.cover_url,

        COUNT(DISTINCT s.id)::integer AS song_count

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
