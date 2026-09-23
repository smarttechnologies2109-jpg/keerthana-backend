const pool =
  require("../config/db");


/* =====================================================
   GET USER PLAYLISTS
===================================================== */

const getPlaylists =
  async (req, res) => {

    try {

      const userId =
        req.user.id;


      const result =
        await pool.query(
          `
          SELECT
            p.id,
            p.name,
            p.description,
            p.cover_url,
            p.created_at,
            p.updated_at,

            COUNT(ps.song_id)::int
              AS song_count

          FROM playlists p

          LEFT JOIN playlist_songs ps
            ON p.id = ps.playlist_id

          WHERE p.user_id = $1

          GROUP BY p.id

          ORDER BY p.created_at DESC
          `,
          [userId]
        );


      res.status(200).json({
        success: true,
        count: result.rows.length,
        playlists: result.rows,
      });

    } catch (error) {

      console.error(
        "Get playlists error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to load playlists",
      });

    }

  };


/* =====================================================
   CREATE PLAYLIST
===================================================== */

const createPlaylist =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const {
        name,
        description = "",
      } = req.body;


      if (
        !name ||
        !name.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Playlist name is required",
        });

      }


      const result =
        await pool.query(
          `
          INSERT INTO playlists
            (
              user_id,
              name,
              description
            )

          VALUES
            ($1, $2, $3)

          RETURNING *
          `,
          [
            userId,
            name.trim(),
            description.trim(),
          ]
        );


      res.status(201).json({
        success: true,
        message:
          "Playlist created",
        playlist:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        "Create playlist error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to create playlist",
      });

    }

  };


/* =====================================================
   GET ONE PLAYLIST
===================================================== */

const getPlaylistById =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const playlistId =
        Number(req.params.id);


      if (
        !Number.isInteger(playlistId) ||
        playlistId <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid playlist ID",
        });

      }


      const playlistResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            description,
            cover_url,
            created_at,
            updated_at

          FROM playlists

          WHERE id = $1
            AND user_id = $2
          `,
          [
            playlistId,
            userId,
          ]
        );


      if (
        playlistResult.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Playlist not found",
        });

      }


      const songsResult =
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

            ar.name
              AS artist_name,

            al.title
              AS album_title,

            c.name
              AS category_name,

            ps.created_at
              AS added_at

          FROM playlist_songs ps

          JOIN songs s
            ON ps.song_id = s.id

          LEFT JOIN artists ar
            ON s.artist_id = ar.id

          LEFT JOIN albums al
            ON s.album_id = al.id

          LEFT JOIN categories c
            ON s.category_id = c.id

          WHERE ps.playlist_id = $1

          ORDER BY ps.created_at ASC
          `,
          [playlistId]
        );


      res.status(200).json({
        success: true,

        playlist: {
          ...playlistResult.rows[0],

          songs:
            songsResult.rows,

          song_count:
            songsResult.rows.length,
        },
      });

    } catch (error) {

      console.error(
        "Get playlist error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to load playlist",
      });

    }

  };


/* =====================================================
   ADD SONG
===================================================== */

const addSongToPlaylist =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const playlistId =
        Number(req.params.id);

      const songId =
        Number(req.params.songId);


      const playlist =
        await pool.query(
          `
          SELECT id

          FROM playlists

          WHERE id = $1
            AND user_id = $2
          `,
          [
            playlistId,
            userId,
          ]
        );


      if (
        playlist.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Playlist not found",
        });

      }


      const song =
        await pool.query(
          `
          SELECT id

          FROM songs

          WHERE id = $1
          `,
          [songId]
        );


      if (
        song.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Song not found",
        });

      }


      await pool.query(
        `
        INSERT INTO playlist_songs
          (
            playlist_id,
            song_id
          )

        VALUES
          ($1, $2)

        ON CONFLICT
          (playlist_id, song_id)

        DO NOTHING
        `,
        [
          playlistId,
          songId,
        ]
      );


      res.status(200).json({
        success: true,
        message:
          "Song added to playlist",
      });

    } catch (error) {

      console.error(
        "Add playlist song error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to add song",
      });

    }

  };


/* =====================================================
   REMOVE SONG
===================================================== */

const removeSongFromPlaylist =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const playlistId =
        Number(req.params.id);

      const songId =
        Number(req.params.songId);


      const playlist =
        await pool.query(
          `
          SELECT id

          FROM playlists

          WHERE id = $1
            AND user_id = $2
          `,
          [
            playlistId,
            userId,
          ]
        );


      if (
        playlist.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Playlist not found",
        });

      }


      await pool.query(
        `
        DELETE FROM playlist_songs

        WHERE playlist_id = $1
          AND song_id = $2
        `,
        [
          playlistId,
          songId,
        ]
      );


      res.status(200).json({
        success: true,
        message:
          "Song removed from playlist",
      });

    } catch (error) {

      console.error(
        "Remove playlist song error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to remove song",
      });

    }

  };


/* =====================================================
   DELETE PLAYLIST
===================================================== */

const deletePlaylist =
  async (req, res) => {

    try {

      const userId =
        req.user.id;

      const playlistId =
        Number(req.params.id);


      const result =
        await pool.query(
          `
          DELETE FROM playlists

          WHERE id = $1
            AND user_id = $2

          RETURNING id
          `,
          [
            playlistId,
            userId,
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message:
            "Playlist not found",
        });

      }


      res.status(200).json({
        success: true,
        message:
          "Playlist deleted",
      });

    } catch (error) {

      console.error(
        "Delete playlist error:",
        error
      );


      res.status(500).json({
        success: false,
        message:
          "Unable to delete playlist",
      });

    }

  };


module.exports = {
  getPlaylists,
  createPlaylist,
  getPlaylistById,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
};