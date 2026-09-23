const pool =
  require("../config/db");


/* =========================================
   GET LIKED SONGS
========================================= */

const getLikedSongs =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const result =
        await pool.query(
          `
          SELECT
            s.id,
            s.title,
            s.title_english,
            s.language,
            s.lyrics,
            s.audio_url,
            s.cover_url,
            s.duration,
            s.featured,
            s.created_at,

            ar.id AS artist_id,
            ar.name AS artist_name,
            ar.image_url AS artist_image,

            al.id AS album_id,
            al.title AS album_title,
            al.cover_url AS album_cover,

            c.id AS category_id,
            c.name AS category_name,

            ls.created_at AS liked_at

          FROM liked_songs ls

          JOIN songs s
            ON ls.song_id = s.id

          LEFT JOIN artists ar
            ON s.artist_id = ar.id

          LEFT JOIN albums al
            ON s.album_id = al.id

          LEFT JOIN categories c
            ON s.category_id = c.id

          WHERE ls.user_id = $1

          ORDER BY ls.created_at DESC
          `,
          [userId]
        );


      res.status(200).json({
        success: true,

        count:
          result.rows.length,

        songs:
          result.rows,
      });


    } catch (error) {

      console.error(
        "Get liked songs error:",
        error
      );


      res.status(500).json({
        success: false,

        message:
          "Unable to load liked songs",
      });

    }

  };


/* =========================================
   LIKE SONG
========================================= */

const likeSong =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const songId =
        Number(req.params.songId);


      if (
        !Number.isInteger(songId) ||
        songId <= 0
      ) {

        return res.status(400).json({
          success: false,

          message:
            "Invalid song ID",
        });

      }


      /* CHECK SONG */

      const songResult =
        await pool.query(
          `
          SELECT id
          FROM songs
          WHERE id = $1
          `,
          [songId]
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


      /* ADD LIKE */

      await pool.query(
        `
        INSERT INTO liked_songs
          (user_id, song_id)

        VALUES
          ($1, $2)

        ON CONFLICT
          (user_id, song_id)

        DO NOTHING
        `,
        [
          userId,
          songId,
        ]
      );


      res.status(200).json({
        success: true,

        message:
          "Song added to Liked Songs",
      });


    } catch (error) {

      console.error(
        "Like song error:",
        error
      );


      res.status(500).json({
        success: false,

        message:
          "Unable to like song",
      });

    }

  };


/* =========================================
   UNLIKE SONG
========================================= */

const unlikeSong =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const songId =
        Number(req.params.songId);


      if (
        !Number.isInteger(songId) ||
        songId <= 0
      ) {

        return res.status(400).json({
          success: false,

          message:
            "Invalid song ID",
        });

      }


      await pool.query(
        `
        DELETE FROM liked_songs

        WHERE user_id = $1
          AND song_id = $2
        `,
        [
          userId,
          songId,
        ]
      );


      res.status(200).json({
        success: true,

        message:
          "Song removed from Liked Songs",
      });


    } catch (error) {

      console.error(
        "Unlike song error:",
        error
      );


      res.status(500).json({
        success: false,

        message:
          "Unable to unlike song",
      });

    }

  };


module.exports = {
  getLikedSongs,
  likeSong,
  unlikeSong,
};