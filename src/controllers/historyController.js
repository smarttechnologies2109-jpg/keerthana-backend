const pool =
  require("../config/db");


/* =====================================================
   RECORD SONG PLAY
===================================================== */

const recordPlay =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const {
        song_id,
        progress_seconds = 0,
        completed = false,
      } = req.body;


      if (!song_id) {

        return res.status(400).json({
          success: false,
          message:
            "Song ID is required",
        });

      }


      const songResult =
        await pool.query(
          `
          SELECT id
          FROM songs
          WHERE id = $1
          `,
          [song_id]
        );


      if (
        songResult.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Song not found",
        });

      }


      const result =
        await pool.query(
          `
          INSERT INTO listening_history (
            user_id,
            song_id,
            progress_seconds,
            completed,
            played_at
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            CURRENT_TIMESTAMP
          )

          RETURNING *
          `,
          [
            userId,
            song_id,
            Math.max(
              0,
              Math.floor(
                Number(progress_seconds) || 0
              )
            ),
            Boolean(completed),
          ]
        );


      res.status(201).json({
        success: true,
        history:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        "Record play error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to record listening history",
      });

    }

  };


/* =====================================================
   UPDATE LISTENING PROGRESS
===================================================== */

const updateProgress =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const historyId =
        Number(req.params.id);

      const {
        progress_seconds,
        completed = false,
      } = req.body;


      const progress =
        Math.max(
          0,
          Math.floor(
            Number(progress_seconds) || 0
          )
        );


      const result =
        await pool.query(
          `
          UPDATE listening_history

          SET
            progress_seconds = $1,
            completed = $2

          WHERE
            id = $3
            AND user_id = $4

          RETURNING *
          `,
          [
            progress,
            Boolean(completed),
            historyId,
            userId,
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Listening history not found",
        });

      }


      res.status(200).json({
        success: true,
        history:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        "Update history error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to update progress",
      });

    }

  };

/* =====================================================
   FULL LISTENING HISTORY

   GET /api/history
===================================================== */

const getHistory =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const result =
        await pool.query(
          `
          SELECT

            h.id AS history_id,
            h.user_id,
            h.song_id,
            h.progress_seconds,
            h.completed,
            h.played_at,

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

          FROM listening_history h

          INNER JOIN songs s
            ON s.id = h.song_id

          LEFT JOIN artists ar
            ON ar.id = s.artist_id

          LEFT JOIN albums al
            ON al.id = s.album_id

          LEFT JOIN categories c
            ON c.id = s.category_id

          WHERE
            h.user_id = $1

          ORDER BY
            h.played_at DESC

          LIMIT 100
          `,
          [
            userId,
          ]
        );


      return res
        .status(200)
        .json({

          success: true,

          count:
            result.rows.length,

          history:
            result.rows,

        });


    } catch (error) {

      console.error(
        "Get listening history error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to fetch listening history",

        });

    }

  };
/* =====================================================
   RECENTLY PLAYED
===================================================== */

const getRecentlyPlayed =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const result =
        await pool.query(
          `
          SELECT DISTINCT ON (s.id)

            h.id AS history_id,
            h.progress_seconds,
            h.completed,
            h.played_at,

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

          FROM listening_history h

          INNER JOIN songs s
            ON s.id = h.song_id

          LEFT JOIN artists ar
            ON ar.id = s.artist_id

          LEFT JOIN albums al
            ON al.id = s.album_id

          LEFT JOIN categories c
            ON c.id = s.category_id

          WHERE h.user_id = $1

          ORDER BY
            s.id,
            h.played_at DESC

          LIMIT 20
          `,
          [userId]
        );


      /*
        DISTINCT ON requires song ID first
        in ORDER BY.

        Sort again in JS so newest songs
        appear first.
      */

      const songs =
        result.rows.sort(
          (a, b) =>
            new Date(b.played_at) -
            new Date(a.played_at)
        );


      res.status(200).json({
        success: true,
        count:
          songs.length,
        songs,
      });

    } catch (error) {

      console.error(
        "Recently played error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to fetch recently played songs",
      });

    }

  };


/* =====================================================
   CONTINUE LISTENING
===================================================== */

const getContinueListening =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const result =
        await pool.query(
          `
          SELECT DISTINCT ON (s.id)

            h.id AS history_id,
            h.progress_seconds,
            h.completed,
            h.played_at,

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

          FROM listening_history h

          INNER JOIN songs s
            ON s.id = h.song_id

          LEFT JOIN artists ar
            ON ar.id = s.artist_id

          LEFT JOIN albums al
            ON al.id = s.album_id

          LEFT JOIN categories c
            ON c.id = s.category_id

          WHERE
            h.user_id = $1

            AND h.completed = FALSE

            AND h.progress_seconds > 5

          ORDER BY
            s.id,
            h.played_at DESC
          `,
          [userId]
        );


      const songs =
        result.rows
          .sort(
            (a, b) =>
              new Date(b.played_at) -
              new Date(a.played_at)
          )
          .slice(0, 10);


      res.status(200).json({
        success: true,
        count:
          songs.length,
        songs,
      });

    } catch (error) {

      console.error(
        "Continue listening error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to fetch continue listening",
      });

    }

  };


/* =====================================================
   GLOBAL POPULAR SONGS
===================================================== */

const getPopularSongs =
  async (req, res) => {

    try {

      const result =
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
            c.name AS category_name,

            COUNT(h.id)::int
              AS play_count

          FROM songs s

          LEFT JOIN listening_history h
            ON h.song_id = s.id

          LEFT JOIN artists ar
            ON ar.id = s.artist_id

          LEFT JOIN albums al
            ON al.id = s.album_id

          LEFT JOIN categories c
            ON c.id = s.category_id

          GROUP BY
            s.id,
            ar.id,
            ar.name,
            al.id,
            al.title,
            c.id,
            c.name

          ORDER BY
            play_count DESC,
            s.created_at DESC

          LIMIT 20
          `
        );


      res.status(200).json({
        success: true,
        songs:
          result.rows,
      });

    } catch (error) {

      console.error(
        "Popular songs error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to fetch popular songs",
      });

    }

  };
/* =====================================================
   CLEAR USER LISTENING HISTORY
===================================================== */

const clearHistory =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      await pool.query(
        `
        DELETE FROM listening_history
        WHERE user_id = $1
        `,
        [userId]
      );


      return res
        .status(200)
        .json({

          success: true,

          message:
            "Listening history cleared successfully",

        });


    } catch (error) {

      console.error(
        "Clear history error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to clear listening history",

        });

    }

  };
/* =====================================================
   REMOVE ONE SONG FROM USER HISTORY
===================================================== */

const removeHistoryItem =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const songId =
        Number(
          req.params.songId
        );


      /* ===============================================
         VALIDATE SONG ID
      =============================================== */

      if (
        !Number.isInteger(songId) ||
        songId <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Valid Song ID is required",

          });

      }


      /* ===============================================
         DELETE HISTORY FOR THIS SONG

         We delete all listening_history entries
         for this user + song.

         This prevents the same song from appearing
         again because of an older history entry.
      =============================================== */

      const result =
        await pool.query(
          `
          DELETE FROM listening_history

          WHERE
            user_id = $1
            AND song_id = $2

          RETURNING id
          `,
          [
            userId,
            songId,
          ]
        );


      /* ===============================================
         NOT FOUND
      =============================================== */

      if (
        result.rowCount === 0
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Song not found in listening history",

          });

      }


      /* ===============================================
         SUCCESS
      =============================================== */

      return res
        .status(200)
        .json({

          success: true,

          message:
            "Song removed from listening history",

          song_id:
            songId,

          deleted_entries:
            result.rowCount,

        });


    } catch (error) {

      console.error(
        "Remove history item error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to remove song from listening history",

        });

    }

  };
module.exports = {
  recordPlay,
  updateProgress,
  getRecentlyPlayed,
  getContinueListening,
  getPopularSongs,
  clearHistory,
  removeHistoryItem,
};