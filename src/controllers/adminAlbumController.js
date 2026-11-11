
const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// =====================================================
// SUPPORTED LANGUAGES
// =====================================================

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

// =====================================================
// HELPER: SAFE LOCAL ALBUM COVER DELETION
// =====================================================

const deleteAlbumCover = (coverUrl) => {
  if (
    !coverUrl ||
    !coverUrl.startsWith("/uploads/albums/")
  ) {
    return;
  }

  const relativePath = coverUrl.replace(/^\/+/, "");

  const uploadDirectory = path.resolve(
    process.cwd(),
    "uploads",
    "albums"
  );

  const filePath = path.resolve(
    process.cwd(),
    relativePath
  );

  // Prevent deleting files outside the album upload directory.
  if (
    !filePath.startsWith(uploadDirectory + path.sep)
  ) {
    console.error("Invalid album cover path:", coverUrl);
    return;
  }

  fs.unlink(filePath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error(
        "Unable to delete album cover:",
        error
      );
    }
  });
};

// =====================================================
// GET ALL ALBUMS
// GET /api/admin/albums
// =====================================================

const getAlbums = async (req, res) => {
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

        al.language,
        al.artist_id,
        al.cover_url,
        al.release_year,
        al.created_at,

        ar.name AS artist_name,

        COALESCE(
          NULLIF(ar.name_english, ''),
          ar.name
        ) AS artist_name_english,

        COALESCE(
          NULLIF(ar.name_telugu, ''),
          ar.name
        ) AS artist_name_telugu,

        ar.language AS artist_language,

        COUNT(s.id)::integer AS song_count

      FROM albums al

      LEFT JOIN artists ar
        ON al.artist_id = ar.id

      LEFT JOIN songs s
        ON s.album_id = al.id

      GROUP BY
        al.id,
        ar.name,
        ar.name_english,
        ar.name_telugu,
        ar.language

      ORDER BY
        al.created_at DESC,
        al.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      albums: result.rows,
    });

  } catch (error) {
    console.error("Admin get albums error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load albums",
    });
  }
};

// =====================================================
// CREATE ALBUM
// POST /api/admin/albums
// =====================================================

const createAlbum = async (req, res) => {
  try {
    const {
      title,
      title_english,
      title_telugu,
      language,
      artist_id,
      release_year,
    } = req.body;

    // =================================================
    // BILINGUAL TITLES
    // =================================================

    const englishTitle = String(
      title_english || title || ""
    ).trim();

    const teluguTitle = String(
      title_telugu || title || ""
    ).trim();

    if (!englishTitle) {
      return res.status(400).json({
        success: false,
        message: "English album title is required",
      });
    }

    if (!teluguTitle) {
      return res.status(400).json({
        success: false,
        message: "Telugu album title is required",
      });
    }

    // Legacy title remains Telugu for compatibility.
    const albumTitle = teluguTitle;

    // =================================================
    // LANGUAGE
    // =================================================

    const albumLanguage = String(
      language || "Telugu"
    ).trim();

    if (!ALLOWED_LANGUAGES.includes(albumLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid album language",
      });
    }

    // =================================================
    // ARTIST
    // Artist language must match album language.
    // =================================================

    let artistId = null;

    if (artist_id) {
      artistId = Number(artist_id);

      if (
        !Number.isInteger(artistId) ||
        artistId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid artist",
        });
      }

      const artistResult = await pool.query(
        `
          SELECT
            id,
            language
          FROM artists
          WHERE id = $1
        `,
        [artistId]
      );

      if (artistResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected artist does not exist",
        });
      }

      if (
        artistResult.rows[0].language !== albumLanguage
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected artist language must match album language",
        });
      }
    }

    // =================================================
    // RELEASE YEAR
    // =================================================

    let releaseYear = null;

    if (
      release_year !== undefined &&
      release_year !== null &&
      String(release_year).trim() !== ""
    ) {
      releaseYear = Number(release_year);

      if (
        !Number.isInteger(releaseYear) ||
        releaseYear < 1900 ||
        releaseYear > 2100
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid release year",
        });
      }
    }

    // =================================================
    // COVER IMAGE
    // =================================================

    let coverUrl = null;

    if (req.file) {
      coverUrl = `/uploads/albums/${req.file.filename}`;
    }

    // =================================================
    // INSERT ALBUM
    // =================================================

    const result = await pool.query(
      `
        INSERT INTO albums (
          title,
          title_english,
          title_telugu,
          language,
          artist_id,
          cover_url,
          release_year
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        albumTitle,
        englishTitle,
        teluguTitle,
        albumLanguage,
        artistId,
        coverUrl,
        releaseYear,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Album created successfully",
      album: result.rows[0],
    });

  } catch (error) {
    console.error("Create album error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create album",
    });
  }
};

// =====================================================
// UPDATE ALBUM
// PUT /api/admin/albums/:id
// =====================================================

const updateAlbum = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      title_english,
      title_telugu,
      language,
      artist_id,
      release_year,
    } = req.body;

    // =================================================
    // VALIDATE ID
    // =================================================

    const albumId = Number(id);

    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid album ID",
      });
    }

    // =================================================
    // BILINGUAL TITLES
    // =================================================

    const englishTitle = String(
      title_english || title || ""
    ).trim();

    const teluguTitle = String(
      title_telugu || title || ""
    ).trim();

    if (!englishTitle) {
      return res.status(400).json({
        success: false,
        message: "English album title is required",
      });
    }

    if (!teluguTitle) {
      return res.status(400).json({
        success: false,
        message: "Telugu album title is required",
      });
    }

    const albumTitle = teluguTitle;

    // =================================================
    // LANGUAGE
    // =================================================

    const albumLanguage = String(
      language || "Telugu"
    ).trim();

    if (!ALLOWED_LANGUAGES.includes(albumLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid album language",
      });
    }

    // =================================================
    // ARTIST
    // =================================================

    let artistId = null;

    if (artist_id) {
      artistId = Number(artist_id);

      if (
        !Number.isInteger(artistId) ||
        artistId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid artist",
        });
      }

      const artistResult = await pool.query(
        `
          SELECT
            id,
            language
          FROM artists
          WHERE id = $1
        `,
        [artistId]
      );

      if (artistResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected artist does not exist",
        });
      }

      if (
        artistResult.rows[0].language !== albumLanguage
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected artist language must match album language",
        });
      }
    }

    // =================================================
    // RELEASE YEAR
    // =================================================

    let releaseYear = null;

    if (
      release_year !== undefined &&
      release_year !== null &&
      String(release_year).trim() !== ""
    ) {
      releaseYear = Number(release_year);

      if (
        !Number.isInteger(releaseYear) ||
        releaseYear < 1900 ||
        releaseYear > 2100
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid release year",
        });
      }
    }

    // =================================================
    // GET EXISTING ALBUM
    // =================================================

    const existingResult = await pool.query(
      `
        SELECT
          id,
          cover_url
        FROM albums
        WHERE id = $1
      `,
      [albumId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Album not found",
      });
    }

    const existingAlbum = existingResult.rows[0];

    // =================================================
    // COVER IMAGE
    // =================================================

    let coverUrl = existingAlbum.cover_url;

    if (req.file) {
      coverUrl = `/uploads/albums/${req.file.filename}`;
    }

    // =================================================
    // UPDATE ALBUM
    // =================================================

    const result = await pool.query(
      `
        UPDATE albums
        SET
          title = $1,
          title_english = $2,
          title_telugu = $3,
          language = $4,
          artist_id = $5,
          cover_url = $6,
          release_year = $7
        WHERE id = $8
        RETURNING *
      `,
      [
        albumTitle,
        englishTitle,
        teluguTitle,
        albumLanguage,
        artistId,
        coverUrl,
        releaseYear,
        albumId,
      ]
    );

    // Delete old local cover only after successful DB update.
    if (
      req.file &&
      existingAlbum.cover_url !== coverUrl
    ) {
      deleteAlbumCover(existingAlbum.cover_url);
    }

    return res.status(200).json({
      success: true,
      message: "Album updated successfully",
      album: result.rows[0],
    });

  } catch (error) {
    console.error("Update album error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update album",
    });
  }
};

// =====================================================
// DELETE ALBUM
// DELETE /api/admin/albums/:id
// =====================================================

const deleteAlbum = async (req, res) => {
  try {
    const { id } = req.params;

    const albumId = Number(id);

    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid album ID",
      });
    }

    // =================================================
    // GET ALBUM
    // =================================================

    const albumResult = await pool.query(
      `
        SELECT
          id,
          cover_url
        FROM albums
        WHERE id = $1
      `,
      [albumId]
    );

    if (albumResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Album not found",
      });
    }

    const coverUrl = albumResult.rows[0].cover_url;

    // =================================================
    // CHECK SONGS
    // =================================================

    const songResult = await pool.query(
      `
        SELECT
          COUNT(*)::integer AS count
        FROM songs
        WHERE album_id = $1
      `,
      [albumId]
    );

    if (songResult.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this album because songs are assigned to it.",
      });
    }

    // =================================================
    // DELETE ALBUM
    // =================================================

    await pool.query(
      `
        DELETE FROM albums
        WHERE id = $1
      `,
      [albumId]
    );

    // =================================================
    // DELETE LOCAL COVER IMAGE
    // =================================================

    deleteAlbumCover(coverUrl);

    return res.status(200).json({
      success: true,
      message: "Album deleted successfully",
    });

  } catch (error) {
    console.error("Delete album error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete album",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
};
