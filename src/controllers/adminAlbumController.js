
const pool = require("../config/db");

const {
  uploadToS3,
  deleteManagedS3Object,
} = require("../middleware/s3Upload");

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

const isValidId = (id) =>
  /^\d+$/.test(String(id || "")) && Number(id) > 0;

const normalize = (value) => String(value || "").trim();

const containsTelugu = (value) =>
  /[\u0C00-\u0C7F]/.test(String(value || ""));

// =====================================================
// GET ALL ALBUMS
// =====================================================

const getAlbums = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        al.id,
        al.title,

        COALESCE(
          NULLIF(BTRIM(al.title_english), ''),
          CASE
            WHEN COALESCE(al.title, '') !~ '[ఀ-౿]'
            THEN NULLIF(BTRIM(al.title), '')
            ELSE NULL
          END,
          ''
        ) AS title_english,

        COALESCE(
          NULLIF(BTRIM(al.title_telugu), ''),
          CASE
            WHEN COALESCE(al.title, '') ~ '[ఀ-౿]'
            THEN NULLIF(BTRIM(al.title), '')
            ELSE NULL
          END,
          ''
        ) AS title_telugu,

        CASE
          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('te', 'te-in', 'telugu', 'తెలుగు')
            THEN 'Telugu'

          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('hi', 'hi-in', 'hindi', 'हिन्दी')
            THEN 'Hindi'

          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('en', 'en-in', 'english')
            THEN 'English'

          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('ml', 'ml-in', 'malayalam')
            THEN 'Malayalam'

          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('kn', 'kn-in', 'kannada')
            THEN 'Kannada'

          WHEN LOWER(BTRIM(COALESCE(al.language, '')))
            IN ('ta', 'ta-in', 'tamil')
            THEN 'Tamil'

          ELSE COALESCE(NULLIF(BTRIM(al.language), ''), 'Telugu')
        END AS language,

        al.artist_id,
        al.cover_url,
        al.release_year,
        al.created_at,

        ar.name AS artist_name,

        COALESCE(
          NULLIF(BTRIM(ar.name_english), ''),
          ar.name
        ) AS artist_name_english,

        COALESCE(
          NULLIF(BTRIM(ar.name_telugu), ''),
          ar.name
        ) AS artist_name_telugu,

        ar.language AS artist_language,

        COUNT(DISTINCT s.id)::integer AS song_count

      FROM public.albums al

      LEFT JOIN public.artists ar
        ON al.artist_id = ar.id

      LEFT JOIN public.songs s
        ON s.album_id = al.id

      GROUP BY
        al.id,
        ar.name,
        ar.name_english,
        ar.name_telugu,
        ar.language

      ORDER BY
        al.created_at DESC NULLS LAST,
        al.id DESC
    `);

    const albums = result.rows.map((album) => ({
      ...album,

      english_name: album.title_english,
      name_english: album.title_english,

      telugu_name: album.title_telugu,
      name_telugu: album.title_telugu,

      album_language: album.language,

      song_count: Number(album.song_count || 0),
    }));

    return res.status(200).json({
      success: true,
      count: albums.length,
      albums,
    });

  } catch (error) {
    console.error("Admin get albums error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load albums.",
    });
  }
};

// =====================================================
// VALIDATE ALBUM FIELDS
// =====================================================

const validateAlbumFields = async ({
  title_english,
  english_title,
  title_telugu,
  telugu_title,
  title,
  language,
  artist_id,
  release_year,
}) => {
  const rawEnglishTitle = normalize(
    title_english || english_title
  );

  const rawTeluguTitle = normalize(
    title_telugu || telugu_title
  );

  const englishTitle =
    rawEnglishTitle ||
    (!containsTelugu(title) ? normalize(title) : "");

  const teluguTitle =
    rawTeluguTitle ||
    (containsTelugu(title) ? normalize(title) : "");

  const albumLanguage = normalize(language || "Telugu");

  if (!englishTitle || !teluguTitle) {
    return {
      error:
        "English and Telugu album titles are required. Please enter both names separately.",
    };
  }

  if (!ALLOWED_LANGUAGES.includes(albumLanguage)) {
    return {
      error: "Invalid album language.",
    };
  }

  let artistId = null;

  if (artist_id) {
    artistId = Number(artist_id);

    if (!Number.isInteger(artistId) || artistId <= 0) {
      return {
        error: "Invalid artist.",
      };
    }

    const artist = await pool.query(
      `
      SELECT id, language
      FROM public.artists
      WHERE id = $1
      `,
      [artistId]
    );

    if (!artist.rows.length) {
      return {
        error: "Selected artist does not exist.",
      };
    }

    if (artist.rows[0].language !== albumLanguage) {
      return {
        error:
          "Selected artist language must match album language.",
      };
    }
  }

  let releaseYear = null;

  if (
    release_year !== undefined &&
    normalize(release_year)
  ) {
    releaseYear = Number(release_year);

    if (
      !Number.isInteger(releaseYear) ||
      releaseYear < 1900 ||
      releaseYear > 2100
    ) {
      return {
        error: "Please enter a valid release year.",
      };
    }
  }

  return {
    englishTitle,
    teluguTitle,
    albumLanguage,
    artistId,
    releaseYear,
  };
};

// =====================================================
// CREATE ALBUM
// =====================================================

const createAlbum = async (req, res) => {
  let uploadedCover = null;

  try {
    const fields = await validateAlbumFields(req.body);

    if (fields.error) {
      return res.status(400).json({
        success: false,
        message: fields.error,
      });
    }

    let coverUrl = null;

    if (req.file) {
      uploadedCover = await uploadToS3(
        req.file,
        "covers"
      );

      coverUrl = uploadedCover.cloudFrontUrl;
    }

    const result = await pool.query(
      `
      INSERT INTO public.albums (
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
        fields.teluguTitle,
        fields.englishTitle,
        fields.teluguTitle,
        fields.albumLanguage,
        fields.artistId,
        coverUrl,
        fields.releaseYear,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Album created successfully.",
      album: result.rows[0],
    });

  } catch (error) {
    console.error("Create album error:", error);

    if (uploadedCover?.key) {
      await deleteManagedS3Object(
        uploadedCover.key
      ).catch((cleanupError) =>
        console.error(
          "New album cover cleanup error:",
          cleanupError
        )
      );
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create album.",
    });
  }
};

// =====================================================
// UPDATE ALBUM
// =====================================================

const updateAlbum = async (req, res) => {
  let uploadedCover = null;

  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid album ID.",
      });
    }

    const existing = await pool.query(
      `
      SELECT *
      FROM public.albums
      WHERE id = $1
      `,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Album not found.",
      });
    }

    const oldAlbum = existing.rows[0];

    const validationPayload = {
      title_english:
        req.body.title_english ??
        req.body.english_title ??
        oldAlbum.title_english,

      title_telugu:
        req.body.title_telugu ??
        req.body.telugu_title ??
        oldAlbum.title_telugu,

      title: req.body.title ?? oldAlbum.title,

      language:
        req.body.language ?? oldAlbum.language,

      artist_id:
        req.body.artist_id !== undefined
          ? req.body.artist_id
          : oldAlbum.artist_id,

      release_year:
        req.body.release_year !== undefined
          ? req.body.release_year
          : oldAlbum.release_year,
    };

    const fields = await validateAlbumFields(
      validationPayload
    );

    if (fields.error) {
      return res.status(400).json({
        success: false,
        message: fields.error,
      });
    }

    let coverUrl = oldAlbum.cover_url;

    if (req.file) {
      uploadedCover = await uploadToS3(
        req.file,
        "covers"
      );

      coverUrl = uploadedCover.cloudFrontUrl;
    }

    const result = await pool.query(
      `
      UPDATE public.albums
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
        fields.teluguTitle,
        fields.englishTitle,
        fields.teluguTitle,
        fields.albumLanguage,
        fields.artistId,
        coverUrl,
        fields.releaseYear,
        id,
      ]
    );

    if (
      uploadedCover &&
      oldAlbum.cover_url &&
      oldAlbum.cover_url !== coverUrl
    ) {
      await deleteManagedS3Object(
        oldAlbum.cover_url
      ).catch((error) =>
        console.error(
          "Old album cover cleanup error:",
          error
        )
      );
    }

    return res.status(200).json({
      success: true,
      message: "Album updated successfully.",
      album: result.rows[0],
    });

  } catch (error) {
    console.error("Update album error:", error);

    if (uploadedCover?.key) {
      await deleteManagedS3Object(
        uploadedCover.key
      ).catch((cleanupError) =>
        console.error(
          "New album cover cleanup error:",
          cleanupError
        )
      );
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update album.",
    });
  }
};

// =====================================================
// DELETE ALBUM
// =====================================================

const deleteAlbum = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid album ID.",
      });
    }

    const existing = await pool.query(
      `
      SELECT id, cover_url
      FROM public.albums
      WHERE id = $1
      `,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Album not found.",
      });
    }

    const songResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS count
      FROM public.songs
      WHERE album_id = $1
      `,
      [id]
    );

    if (songResult.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this album because songs are assigned to it.",
      });
    }

    await pool.query(
      `
      DELETE FROM public.albums
      WHERE id = $1
      `,
      [id]
    );

    if (existing.rows[0].cover_url) {
      await deleteManagedS3Object(
        existing.rows[0].cover_url
      ).catch((error) =>
        console.error(
          "Album cover cleanup error:",
          error
        )
      );
    }

    return res.status(200).json({
      success: true,
      message: "Album deleted successfully.",
    });

  } catch (error) {
    console.error("Delete album error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete album.",
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
