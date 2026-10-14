
const pool = require("../config/db");

/* =========================================================
   PERSONAL LISTENING STATISTICS
========================================================= */

const getListeningStatistics = async (req, res) => {
  try {
    const userId = req.user.id;

    /* =====================================================
       OVERVIEW
    ===================================================== */

    const overviewResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_plays,
        COUNT(DISTINCT song_id)::int AS unique_songs,
        COALESCE(SUM(progress_seconds), 0)::int AS total_seconds,
        COUNT(*) FILTER (
          WHERE completed = TRUE
        )::int AS completed_songs
      FROM public.listening_history
      WHERE user_id = $1
      `,
      [userId]
    );

    /* =====================================================
       MOST ACTIVE HOUR
    ===================================================== */

    const mostActiveHourResult = await pool.query(
      `
      SELECT
        EXTRACT(HOUR FROM played_at)::int AS hour,
        COUNT(*)::int AS play_count
      FROM public.listening_history
      WHERE user_id = $1
      GROUP BY EXTRACT(HOUR FROM played_at)
      ORDER BY play_count DESC, hour ASC
      LIMIT 1
      `,
      [userId]
    );

    /* =====================================================
       TOP SONGS
       Join artists table using songs.artist_id
    ===================================================== */

    const topSongsResult = await pool.query(
      `
      SELECT
        h.song_id,
        COALESCE(s.title, 'Unknown Song') AS title,
        COALESCE(s.title_english, '') AS title_english,
        COALESCE(a.name, 'Unknown Artist') AS artist,
        COALESCE(s.audio_url, '') AS audio_url,
        COUNT(h.id)::int AS play_count,
        COALESCE(SUM(h.progress_seconds), 0)::int
          AS listening_seconds
      FROM public.listening_history h
      LEFT JOIN public.songs s
        ON s.id = h.song_id
      LEFT JOIN public.artists a
        ON a.id = s.artist_id
      WHERE h.user_id = $1
      GROUP BY
        h.song_id,
        s.title,
        s.title_english,
        a.name,
        s.audio_url
      ORDER BY
        play_count DESC,
        listening_seconds DESC
      LIMIT 10
      `,
      [userId]
    );

    /* =====================================================
       TOP ARTISTS
    ===================================================== */

    const topArtistsResult = await pool.query(
      `
      SELECT
        a.id AS artist_id,
        COALESCE(a.name, 'Unknown Artist') AS artist,
        COUNT(h.id)::int AS play_count,
        COUNT(DISTINCT h.song_id)::int AS unique_songs,
        COALESCE(SUM(h.progress_seconds), 0)::int
          AS listening_seconds
      FROM public.listening_history h
      JOIN public.songs s
        ON s.id = h.song_id
      LEFT JOIN public.artists a
        ON a.id = s.artist_id
      WHERE h.user_id = $1
      GROUP BY a.id, a.name
      ORDER BY
        play_count DESC,
        listening_seconds DESC
      LIMIT 10
      `,
      [userId]
    );

    /* =====================================================
       TOP LANGUAGES
    ===================================================== */

    const topLanguagesResult = await pool.query(
      `
      SELECT
        COALESCE(
          NULLIF(s.language, ''),
          'Unknown'
        ) AS language,
        COUNT(h.id)::int AS play_count,
        COALESCE(SUM(h.progress_seconds), 0)::int
          AS listening_seconds
      FROM public.listening_history h
      LEFT JOIN public.songs s
        ON s.id = h.song_id
      WHERE h.user_id = $1
      GROUP BY COALESCE(NULLIF(s.language, ''), 'Unknown')
      ORDER BY
        play_count DESC,
        listening_seconds DESC
      LIMIT 10
      `,
      [userId]
    );

    /* =====================================================
       DAILY LISTENING
    ===================================================== */

    const dailyResult = await pool.query(
      `
      SELECT
        DATE(played_at) AS date,
        COUNT(*)::int AS play_count,
        COALESCE(SUM(progress_seconds), 0)::int
          AS listening_seconds
      FROM public.listening_history
      WHERE user_id = $1
      GROUP BY DATE(played_at)
      ORDER BY date ASC
      `,
      [userId]
    );

    /* =====================================================
       HOURLY LISTENING
    ===================================================== */

    const hourlyResult = await pool.query(
      `
      SELECT
        EXTRACT(HOUR FROM played_at)::int AS hour,
        COUNT(*)::int AS play_count,
        COALESCE(SUM(progress_seconds), 0)::int
          AS listening_seconds
      FROM public.listening_history
      WHERE user_id = $1
      GROUP BY EXTRACT(HOUR FROM played_at)
      ORDER BY hour ASC
      `,
      [userId]
    );

    /* =====================================================
       RESPONSE
       Preserve the response format expected by Statistics.jsx
    ===================================================== */

    const overview = overviewResult.rows[0] || {};

    return res.json({
      success: true,

      overview: {
        totalPlays: Number(overview.total_plays || 0),
        uniqueSongs: Number(overview.unique_songs || 0),
        totalSeconds: Number(overview.total_seconds || 0),
        completedSongs: Number(overview.completed_songs || 0),

        mostActiveHour:
          mostActiveHourResult.rows.length > 0
            ? Number(mostActiveHourResult.rows[0].hour)
            : null,
      },

      topSongs: topSongsResult.rows,
      topArtists: topArtistsResult.rows,
      topLanguages: topLanguagesResult.rows,
      daily: dailyResult.rows,
      hourly: hourlyResult.rows,
    });
  } catch (error) {
    console.error("Listening statistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load listening statistics",
      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message,
    });
  }
};

module.exports = {
  getListeningStatistics,
};
