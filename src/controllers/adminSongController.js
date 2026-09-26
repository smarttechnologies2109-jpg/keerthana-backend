const pool = require("../config/db");

const fs = require("fs");
const path = require("path");


/* =========================================================
   GET ALL SONGS - ADMIN
========================================================= */

const getAdminSongs = async (req, res) => {
  try {
    const result = await pool.query(`
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

        s.artist_id,
        ar.name AS artist_name,

        s.album_id,
        al.title AS album_title,

        s.category_id,
        c.name AS category_name,

        s.ministry_id,
        m.name AS ministry_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      LEFT JOIN ministries m
        ON s.ministry_id = m.id

      ORDER BY
        s.created_at DESC,
        s.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      songs: result.rows,
    });

  } catch (error) {
    console.error("Admin get songs error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load songs",
    });
  }
};


/* =========================================================
   CREATE SONG
========================================================= */

const createSong = async (req, res) => {
  try {
    const {
      title,
      title_english,
      language,
      lyrics,
      artist_id,
      album_id,
      category_id,
      ministry_id,
      featured,
    } = req.body;

console.log("========== CREATE SONG BODY ==========");
console.log(req.body);
console.log("MINISTRY ID RECEIVED:", ministry_id);
console.log("======================================");
    /* =====================================================
       VALIDATE TITLE
    ===================================================== */

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Song title is required",
      });
    }


    /* =====================================================
       AUDIO FILE
    ===================================================== */

    const audioFile = req.files?.audio?.[0];

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        message: "Please upload an audio file",
      });
    }


    /* =====================================================
       COVER FILE
    ===================================================== */

    const coverFile = req.files?.cover?.[0];


    /* =====================================================
       MEDIA URLS
    ===================================================== */

    const audio_url =
      `/media/audio/${audioFile.filename}`;

    const cover_url =
      coverFile
        ? `/media/images/${coverFile.filename}`
        : null;


    /* =====================================================
       FEATURED
    ===================================================== */

    const isFeatured =
      featured === true ||
      featured === "true";


    /* =====================================================
       MINISTRY ID
    ===================================================== */

    let ministryId = null;

    if (
      ministry_id !== undefined &&
      ministry_id !== null &&
      ministry_id !== ""
    ) {
      ministryId = Number(ministry_id);

      if (!Number.isInteger(ministryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ministry",
        });
      }
    }


    /* =====================================================
       OPTIONAL FOREIGN KEYS
    ===================================================== */

    const artistId =
      artist_id
        ? Number(artist_id)
        : null;

    const albumId =
      album_id
        ? Number(album_id)
        : null;

    const categoryId =
      category_id
        ? Number(category_id)
        : null;


    /* =====================================================
       VALIDATE MINISTRY
    ===================================================== */

    if (ministryId !== null) {
      const ministryResult = await pool.query(
        `
        SELECT id
        FROM ministries
        WHERE id = $1
        `,
        [ministryId]
      );

      if (ministryResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected ministry does not exist",
        });
      }
    }


    /* =====================================================
       INSERT SONG
    ===================================================== */

    const result = await pool.query(
      `
      INSERT INTO songs
      (
        title,
        title_english,
        language,
        lyrics,
        audio_url,
        cover_url,
        artist_id,
        album_id,
        category_id,
        featured,
        ministry_id
      )

      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )

      RETURNING *
      `,
      [
        title.trim(),

        title_english?.trim() || null,

        language || "Telugu",

        lyrics || null,

        audio_url,

        cover_url,

        artistId,

        albumId,

        categoryId,

        isFeatured,

        ministryId,
      ]
    );


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(201).json({
      success: true,

      message:
        "Song uploaded successfully",

      song:
        result.rows[0],
    });


  } catch (error) {
    console.error(
      "Create song error:",
      error
    );


    /* =====================================================
       FOREIGN KEY ERROR
    ===================================================== */

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category or ministry",
      });
    }


    return res.status(500).json({
      success: false,
      message:
        "Unable to upload song",
    });
  }
};


/* =========================================================
   DELETE MEDIA FILE
========================================================= */

const deleteMediaFile = (mediaUrl) => {
  try {
    if (!mediaUrl) {
      return;
    }


    if (
      !mediaUrl.startsWith("/media/")
    ) {
      return;
    }


    const relativePath =
      mediaUrl.replace(
        "/media/",
        ""
      );


    const filePath =
      path.join(
        __dirname,
        "../../public",
        relativePath
      );


    if (
      fs.existsSync(filePath)
    ) {
      fs.unlinkSync(filePath);
    }

  } catch (error) {
    console.error(
      "Delete media file error:",
      error
    );
  }
};


/* =========================================================
   DELETE SONG
========================================================= */

const deleteSong = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;


    /* =====================================================
       GET SONG FIRST
    ===================================================== */

    const songResult =
      await pool.query(
        `
        SELECT
          id,
          title,
          audio_url,
          cover_url

        FROM songs

        WHERE id = $1
        `,
        [id]
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


    const song =
      songResult.rows[0];


    /* =====================================================
       DELETE DATABASE RECORD
    ===================================================== */

    await pool.query(
      `
      DELETE FROM songs
      WHERE id = $1
      `,
      [id]
    );


    /* =====================================================
       DELETE PHYSICAL FILES
    ===================================================== */

    deleteMediaFile(
      song.audio_url
    );

    deleteMediaFile(
      song.cover_url
    );


    return res.status(200).json({
      success: true,
      message:
        "Song deleted successfully",
    });


  } catch (error) {
    console.error(
      "Delete song error:",
      error
    );


    if (
      error.code === "23503"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This song is being used by another record and cannot be deleted yet.",
      });
    }


    return res.status(500).json({
      success: false,
      message:
        "Unable to delete song",
    });
  }
};


/* =========================================================
   GET ONE SONG - ADMIN
========================================================= */

const getAdminSongById = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;


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

          s.artist_id,
          s.album_id,
          s.category_id,

          s.ministry_id,

          s.created_at,

          ar.name AS artist_name,

          al.title AS album_title,

          c.name AS category_name,

          m.name AS ministry_name

        FROM songs s

        LEFT JOIN artists ar
          ON s.artist_id = ar.id

        LEFT JOIN albums al
          ON s.album_id = al.id

        LEFT JOIN categories c
          ON s.category_id = c.id

        LEFT JOIN ministries m
          ON s.ministry_id = m.id

        WHERE s.id = $1
        `,
        [id]
      );


    if (
      result.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Song not found",
      });
    }


    return res.status(200).json({
      success: true,
      song:
        result.rows[0],
    });


  } catch (error) {
    console.error(
      "Get admin song error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to load song",
    });
  }
};


/* =========================================================
   UPDATE SONG
========================================================= */

const updateSong = async (
  req,
  res
) => {
  try {
    const {
      id,
    } = req.params;


    const {
      title,
      title_english,
      language,
      lyrics,
      artist_id,
      album_id,
      category_id,
      ministry_id,
      featured,
    } = req.body;


    /* =====================================================
       CHECK EXISTING SONG
    ===================================================== */

    const existingResult =
      await pool.query(
        `
        SELECT *
        FROM songs
        WHERE id = $1
        `,
        [id]
      );


    if (
      existingResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Song not found",
      });
    }


    const existingSong =
      existingResult.rows[0];


    /* =====================================================
       VALIDATE TITLE
    ===================================================== */

    if (
      !title ||
      !title.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Song title is required",
      });
    }


    /* =====================================================
       NEW FILES
    ===================================================== */

    const newAudioFile =
      req.files?.audio?.[0];

    const newCoverFile =
      req.files?.cover?.[0];


    let audioUrl =
      existingSong.audio_url;

    let coverUrl =
      existingSong.cover_url;


    /* =====================================================
       REPLACE AUDIO
    ===================================================== */

    if (newAudioFile) {
      audioUrl =
        `/media/audio/${newAudioFile.filename}`;
    }


    /* =====================================================
       REPLACE COVER
    ===================================================== */

    if (newCoverFile) {
      coverUrl =
        `/media/images/${newCoverFile.filename}`;
    }


    /* =====================================================
       FEATURED
    ===================================================== */

    const isFeatured =
      featured === true ||
      featured === "true";


    /* =====================================================
       MINISTRY ID
    ===================================================== */

    let ministryId = null;

    if (
      ministry_id !== undefined &&
      ministry_id !== null &&
      ministry_id !== ""
    ) {
      ministryId =
        Number(ministry_id);


      if (
        !Number.isInteger(ministryId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ministry",
        });
      }
    }


    /* =====================================================
       VALIDATE MINISTRY
    ===================================================== */

    if (ministryId !== null) {
      const ministryResult =
        await pool.query(
          `
          SELECT id
          FROM ministries
          WHERE id = $1
          `,
          [ministryId]
        );


      if (
        ministryResult.rows.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected ministry does not exist",
        });
      }
    }


    /* =====================================================
       OPTIONAL FOREIGN KEYS
    ===================================================== */

    const artistId =
      artist_id
        ? Number(artist_id)
        : null;

    const albumId =
      album_id
        ? Number(album_id)
        : null;

    const categoryId =
      category_id
        ? Number(category_id)
        : null;


    /* =====================================================
       UPDATE DATABASE
    ===================================================== */

    const result =
      await pool.query(
        `
        UPDATE songs

        SET
          title = $1,
          title_english = $2,
          language = $3,
          lyrics = $4,
          audio_url = $5,
          cover_url = $6,
          artist_id = $7,
          album_id = $8,
          category_id = $9,
          featured = $10,
          ministry_id = $11

        WHERE id = $12

        RETURNING *
        `,
        [
          title.trim(),

          title_english?.trim() ||
            null,

          language ||
            "Telugu",

          lyrics ||
            null,

          audioUrl,

          coverUrl,

          artistId,

          albumId,

          categoryId,

          isFeatured,

          ministryId,

          id,
        ]
      );


    /* =====================================================
       DELETE OLD AUDIO AFTER SUCCESS
    ===================================================== */

    if (
      newAudioFile &&
      existingSong.audio_url &&
      existingSong.audio_url !==
        audioUrl
    ) {
      deleteMediaFile(
        existingSong.audio_url
      );
    }


    /* =====================================================
       DELETE OLD COVER AFTER SUCCESS
    ===================================================== */

    if (
      newCoverFile &&
      existingSong.cover_url &&
      existingSong.cover_url !==
        coverUrl
    ) {
      deleteMediaFile(
        existingSong.cover_url
      );
    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(200).json({
      success: true,

      message:
        "Song updated successfully",

      song:
        result.rows[0],
    });


  } catch (error) {
    console.error(
      "Update song error:",
      error
    );


    if (
      error.code === "23503"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid artist, album, category or ministry",
      });
    }


    return res.status(500).json({
      success: false,
      message:
        "Unable to update song",
    });
  }
};


/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {
  getAdminSongs,
  getAdminSongById,
  createSong,
  updateSong,
  deleteSong,
};