
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

const getArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.name,
        COALESCE(NULLIF(a.name_english, ''), a.name) AS name_english,
        COALESCE(NULLIF(a.name_telugu, ''), a.name) AS name_telugu,
        a.bio,
        a.image_url,
        a.language,
        a.created_at,
        COUNT(DISTINCT s.id)::integer AS song_count
      FROM public.artists a
      LEFT JOIN public.songs s ON s.artist_id = a.id
      GROUP BY
        a.id, a.name, a.name_english, a.name_telugu,
        a.bio, a.image_url, a.language, a.created_at
      ORDER BY a.name ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      artists: result.rows,
    });
  } catch (error) {
    console.error("Admin get artists error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load artists.",
    });
  }
};

const createArtist = async (req, res) => {
  let uploadedImage = null;

  try {
    const {
      name,
      name_english,
      name_telugu,
      bio,
      language,
    } = req.body;

    const englishName = normalize(name_english || name);
    const teluguName = normalize(name_telugu || name);
    const artistLanguage = normalize(language || "Telugu");

    if (!englishName || !teluguName) {
      return res.status(400).json({
        success: false,
        message: "English and Telugu artist names are required.",
      });
    }

    if (!ALLOWED_LANGUAGES.includes(artistLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist language.",
      });
    }

    const duplicate = await pool.query(
      `
      SELECT id
      FROM public.artists
      WHERE
        LOWER(TRIM(COALESCE(NULLIF(name_english, ''), name))) = LOWER($1)
        OR
        LOWER(TRIM(COALESCE(NULLIF(name_telugu, ''), name))) = LOWER($2)
      LIMIT 1
      `,
      [englishName, teluguName]
    );

    if (duplicate.rows.length) {
      return res.status(409).json({
        success: false,
        message: "An artist with the same English or Telugu name already exists.",
      });
    }

    let imageUrl = null;

    if (req.file) {
      uploadedImage = await uploadToS3(req.file, "artists");
      imageUrl = uploadedImage.cloudFrontUrl;
    }

    const result = await pool.query(
      `
      INSERT INTO public.artists (
        name,
        name_english,
        name_telugu,
        bio,
        image_url,
        language
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        teluguName,
        englishName,
        teluguName,
        normalize(bio) || null,
        imageUrl,
        artistLanguage,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Artist created successfully.",
      artist: result.rows[0],
    });
  } catch (error) {
    console.error("Create artist error:", error);

    if (uploadedImage?.key) {
      await deleteManagedS3Object(uploadedImage.key).catch(
        (deleteError) =>
          console.error("S3 cleanup error:", deleteError)
      );
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create artist.",
    });
  }
};

const updateArtist = async (req, res) => {
  let uploadedImage = null;

  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    const existing = await pool.query(
      `
      SELECT *
      FROM public.artists
      WHERE id = $1
      `,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    const oldArtist = existing.rows[0];

    const englishName = normalize(
      req.body.name_english !== undefined
        ? req.body.name_english
        : oldArtist.name_english || req.body.name || oldArtist.name
    );

    const teluguName = normalize(
      req.body.name_telugu !== undefined
        ? req.body.name_telugu
        : req.body.name !== undefined
          ? req.body.name
          : oldArtist.name_telugu || oldArtist.name
    );

    const artistLanguage = normalize(
      req.body.language || oldArtist.language || "Telugu"
    );

    if (!englishName || !teluguName) {
      return res.status(400).json({
        success: false,
        message: "English and Telugu artist names are required.",
      });
    }

    if (!ALLOWED_LANGUAGES.includes(artistLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist language.",
      });
    }

    const duplicate = await pool.query(
      `
      SELECT id
      FROM public.artists
      WHERE id <> $3
      AND (
        LOWER(TRIM(COALESCE(NULLIF(name_english, ''), name))) = LOWER($1)
        OR
        LOWER(TRIM(COALESCE(NULLIF(name_telugu, ''), name))) = LOWER($2)
      )
      LIMIT 1
      `,
      [englishName, teluguName, id]
    );

    if (duplicate.rows.length) {
      return res.status(409).json({
        success: false,
        message: "Another artist with the same English or Telugu name already exists.",
      });
    }

    let imageUrl = oldArtist.image_url;

    if (req.file) {
      uploadedImage = await uploadToS3(req.file, "artists");
      imageUrl = uploadedImage.cloudFrontUrl;
    }

    const artistBio =
      req.body.bio !== undefined
        ? normalize(req.body.bio) || null
        : oldArtist.bio;

    const result = await pool.query(
      `
      UPDATE public.artists
      SET
        name = $1,
        name_english = $2,
        name_telugu = $3,
        bio = $4,
        image_url = $5,
        language = $6
      WHERE id = $7
      RETURNING *
      `,
      [
        teluguName,
        englishName,
        teluguName,
        artistBio,
        imageUrl,
        artistLanguage,
        id,
      ]
    );

    // Delete old image only after the database update succeeds.
    if (
      uploadedImage &&
      oldArtist.image_url &&
      oldArtist.image_url !== imageUrl
    ) {
      await deleteManagedS3Object(oldArtist.image_url).catch(
        (error) => console.error("Old artist image cleanup error:", error)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Artist updated successfully.",
      artist: result.rows[0],
    });
  } catch (error) {
    console.error("Update artist error:", error);

    if (uploadedImage?.key) {
      await deleteManagedS3Object(uploadedImage.key).catch(
        (deleteError) =>
          console.error("New artist image cleanup error:", deleteError)
      );
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update artist.",
    });
  }
};

const deleteArtist = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    const existing = await pool.query(
      `
      SELECT id, image_url
      FROM public.artists
      WHERE id = $1
      `,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    const songResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS count
      FROM public.songs
      WHERE artist_id = $1
      `,
      [id]
    );

    if (songResult.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete this artist because songs are assigned to this artist.",
      });
    }

    await pool.query(
      `DELETE FROM public.artists WHERE id = $1`,
      [id]
    );

    if (existing.rows[0].image_url) {
      await deleteManagedS3Object(existing.rows[0].image_url).catch(
        (error) => console.error("Artist image cleanup error:", error)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Artist deleted successfully.",
    });
  } catch (error) {
    console.error("Delete artist error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete artist.",
    });
  }
};

module.exports = {
  getArtists,
  createArtist,
  updateArtist,
  deleteArtist,
};
