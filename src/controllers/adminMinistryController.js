
const pool = require("../config/db");

const {
  uploadToS3,
  deleteManagedS3Object,
} = require("../middleware/s3Upload");

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
// CREATE MINISTRY
// POST /api/admin/ministries
// =====================================================

const createMinistry = async (req, res) => {
  let uploadedImage = null;

  try {
    const {
      name,
      description,
      language,
    } = req.body;

    // NAME VALIDATION

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Ministry name is required.",
      });
    }

    const ministryName = name.trim();

    const ministryDescription =
      description?.trim() || null;

    const ministryLanguage =
      language?.trim() || "Telugu";

    // LANGUAGE VALIDATION

    if (!ALLOWED_LANGUAGES.includes(ministryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // CHECK DUPLICATE

    const existing = await pool.query(
      `SELECT id
       FROM ministries
       WHERE LOWER(name) = LOWER($1)
       AND language = $2`,
      [ministryName, ministryLanguage]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A ministry with this name already exists in this language.",
      });
    }

    // UPLOAD IMAGE TO S3

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );
    }

    // SAVE TO POSTGRESQL

    const result = await pool.query(
      `INSERT INTO ministries
       (
         name,
         description,
         image_url,
         language
       )
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         name,
         description,
         image_url,
         language,
         created_at`,
      [
        ministryName,
        ministryDescription,
        uploadedImage?.cloudFrontUrl || null,
        ministryLanguage,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Ministry created successfully.",
      ministry: result.rows[0],
    });

  } catch (error) {
    console.error("Create ministry error:", error);

    // REMOVE NEW S3 IMAGE IF DATABASE INSERT FAILS

    if (uploadedImage?.key) {
      try {
        await deleteManagedS3Object(
          uploadedImage.key
        );
      } catch (cleanupError) {
        console.error(
          "Ministry image cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create ministry.",
      error: error.message,
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

    const {
      name,
      description,
      language,
    } = req.body;

    // NAME VALIDATION

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Ministry name is required.",
      });
    }

    const ministryName = name.trim();

    const ministryDescription =
      description?.trim() || null;

    const ministryLanguage =
      language?.trim() || "Telugu";

    // LANGUAGE VALIDATION

    if (!ALLOWED_LANGUAGES.includes(ministryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // GET EXISTING MINISTRY

    const ministryResult = await pool.query(
      `SELECT *
       FROM ministries
       WHERE id = $1`,
      [id]
    );

    if (ministryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    const oldMinistry = ministryResult.rows[0];

    // CHECK DUPLICATE

    const duplicateResult = await pool.query(
      `SELECT id
       FROM ministries
       WHERE LOWER(name) = LOWER($1)
       AND language = $2
       AND id <> $3`,
      [
        ministryName,
        ministryLanguage,
        id,
      ]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Another ministry with this name already exists in this language.",
      });
    }

    // UPLOAD NEW IMAGE IF SELECTED

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );
    }

    // KEEP OLD IMAGE IF NO NEW IMAGE

    const finalImageUrl = uploadedImage
      ? uploadedImage.cloudFrontUrl
      : oldMinistry.image_url || null;

    // UPDATE DATABASE

    const result = await pool.query(
      `UPDATE ministries
       SET
         name = $1,
         description = $2,
         image_url = $3,
         language = $4
       WHERE id = $5
       RETURNING
         id,
         name,
         description,
         image_url,
         language,
         created_at`,
      [
        ministryName,
        ministryDescription,
        finalImageUrl,
        ministryLanguage,
        id,
      ]
    );

    // DELETE OLD IMAGE AFTER SUCCESSFUL UPDATE

    if (
      uploadedImage &&
      oldMinistry.image_url
    ) {
      try {
        await deleteManagedS3Object(
          oldMinistry.image_url
        );
      } catch (deleteError) {
        console.error(
          "Old ministry image cleanup error:",
          deleteError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Ministry updated successfully.",
      ministry: result.rows[0],
    });

  } catch (error) {
    console.error("Update ministry error:", error);

    // CLEAN UP NEW IMAGE IF UPDATE FAILS

    if (uploadedImage?.key) {
      try {
        await deleteManagedS3Object(
          uploadedImage.key
        );
      } catch (cleanupError) {
        console.error(
          "New ministry image cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update ministry.",
      error: error.message,
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

    // GET MINISTRY

    const ministryResult = await pool.query(
      `SELECT id, name, image_url
       FROM ministries
       WHERE id = $1`,
      [id]
    );

    if (ministryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    const ministry = ministryResult.rows[0];

    // DELETE DATABASE RECORD

    const result = await pool.query(
      `DELETE FROM ministries
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    // DELETE ASSOCIATED S3 IMAGE

    if (ministry.image_url) {
      try {
        await deleteManagedS3Object(
          ministry.image_url
        );
      } catch (deleteError) {
        console.error(
          "Ministry image cleanup error:",
          deleteError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Ministry deleted successfully.",
    });

  } catch (error) {
    console.error("Delete ministry error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete ministry.",
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
