
const pool = require("../config/db");

const {
  uploadToS3,
  deleteManagedS3Object,
} = require("../middleware/s3Upload");

// =====================================================
// CONFIGURATION
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
// HELPERS
// =====================================================

const normalizeString = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const isValidLanguage = (language) => {
  return ALLOWED_LANGUAGES.includes(language);
};

const cleanupUploadedImage = async (key) => {
  if (!key) return;

  try {
    await deleteManagedS3Object(key);
  } catch (error) {
    console.error("S3 uploaded image cleanup failed:", error);
  }
};

const deleteOldImage = async (imageUrl) => {
  if (!imageUrl) return;

  try {
    await deleteManagedS3Object(imageUrl);
  } catch (error) {
    console.error("Old ministry image deletion failed:", error);
  }
};

// =====================================================
// CREATE MINISTRY
// POST /api/admin/ministries
// =====================================================

const createMinistry = async (req, res) => {
  let uploadedImage = null;

  try {
    const name = normalizeString(req.body.name);
    const description = normalizeString(req.body.description);
    const language =
      normalizeString(req.body.language) || "Telugu";

    // Validate name
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Ministry name is required.",
      });
    }

    // Validate language
    if (!isValidLanguage(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // Check duplicate ministry
    const duplicate = await pool.query(
      `
      SELECT id
      FROM ministries
      WHERE LOWER(TRIM(name)) = LOWER($1)
      AND language = $2
      LIMIT 1
      `,
      [name, language]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This ministry already exists in this language.",
      });
    }

    // Upload image if provided
    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );
    }

    const imageUrl = uploadedImage?.cloudFrontUrl || null;

    // Insert ministry
    const result = await pool.query(
      `
      INSERT INTO ministries
        (name, description, image_url, language)
      VALUES
        ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        name,
        description || null,
        imageUrl,
        language,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Ministry created successfully.",
      ministry: result.rows[0],
    });

  } catch (error) {
    console.error("Create ministry error:", error);

    await cleanupUploadedImage(uploadedImage?.key);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This ministry already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create ministry. Please try again.",
    });
  }
};

// =====================================================
// UPDATE MINISTRY
// PUT /api/admin/ministries/:id
// =====================================================

const updateMinistry = async (req, res) => {
  let uploadedImage = null;

  try {
    const { id } = req.params;

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    // Find existing ministry
    const existingResult = await pool.query(
      `
      SELECT *
      FROM ministries
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    const oldMinistry = existingResult.rows[0];

    // Support partial updates
    const name =
      req.body.name !== undefined
        ? normalizeString(req.body.name)
        : oldMinistry.name;

    const description =
      req.body.description !== undefined
        ? normalizeString(req.body.description)
        : oldMinistry.description || "";

    const language =
      req.body.language !== undefined
        ? normalizeString(req.body.language)
        : oldMinistry.language || "Telugu";

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Ministry name is required.",
      });
    }

    if (!isValidLanguage(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // Check duplicate ministry excluding current ID
    const duplicate = await pool.query(
      `
      SELECT id
      FROM ministries
      WHERE LOWER(TRIM(name)) = LOWER($1)
      AND language = $2
      AND id <> $3
      LIMIT 1
      `,
      [name, language, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another ministry already has this name in this language.",
      });
    }

    // Keep existing image unless a new image is uploaded
    let imageUrl = oldMinistry.image_url || null;

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );

      imageUrl = uploadedImage.cloudFrontUrl;
    }

    // Update database
    const result = await pool.query(
      `
      UPDATE ministries
      SET
        name = $1,
        description = $2,
        image_url = $3,
        language = $4
      WHERE id = $5
      RETURNING *
      `,
      [
        name,
        description || null,
        imageUrl,
        language,
        id,
      ]
    );

    // Delete old image only after successful database update
    if (
      uploadedImage &&
      oldMinistry.image_url &&
      oldMinistry.image_url !== imageUrl
    ) {
      await deleteOldImage(oldMinistry.image_url);
    }

    return res.status(200).json({
      success: true,
      message: "Ministry updated successfully.",
      ministry: result.rows[0],
    });

  } catch (error) {
    console.error("Update ministry error:", error);

    // Remove newly uploaded image if update failed
    await cleanupUploadedImage(uploadedImage?.key);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This ministry already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update ministry. Please try again.",
    });
  }
};

// =====================================================
// DELETE MINISTRY
// DELETE /api/admin/ministries/:id
// =====================================================

const deleteMinistry = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    // Find ministry before deleting
    const existingResult = await pool.query(
      `
      SELECT id, name, image_url
      FROM ministries
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    const ministry = existingResult.rows[0];

    // Delete ministry from database
    await pool.query(
      `
      DELETE FROM ministries
      WHERE id = $1
      `,
      [id]
    );

    // Delete associated S3 image after successful DB deletion
    await deleteOldImage(ministry.image_url);

    return res.status(200).json({
      success: true,
      message: "Ministry deleted successfully.",
    });

  } catch (error) {
    console.error("Delete ministry error:", error);

    // Foreign key constraint violation
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "This ministry is linked to existing songs. Remove or reassign those songs before deleting this ministry.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to delete ministry. Please try again.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createMinistry,
  updateMinistry,
  deleteMinistry,
};
