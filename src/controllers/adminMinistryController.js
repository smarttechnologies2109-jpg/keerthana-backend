
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

// Normalize strings safely
const normalizeString = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

// Validate language
const isValidLanguage = (language) => {
  return ALLOWED_LANGUAGES.includes(language);
};

// =====================================================
// S3 CLEANUP HELPERS
// =====================================================

// Delete newly uploaded image if database operation fails
const cleanupUploadedImage = async (key) => {
  if (!key) return;

  try {
    await deleteManagedS3Object(key);
  } catch (error) {
    console.error(
      "S3 uploaded ministry image cleanup failed:",
      error
    );
  }
};

// Delete existing managed image
const deleteOldImage = async (imageUrl) => {
  if (!imageUrl) return;

  try {
    await deleteManagedS3Object(imageUrl);
  } catch (error) {
    console.error(
      "Old ministry image deletion failed:",
      error
    );
  }
};

// =====================================================
// DUPLICATE VALIDATION
// Check English and Telugu names separately
// =====================================================

const checkDuplicateMinistry = async (
  englishName,
  teluguName,
  language,
  excludeId = null
) => {
  const result = await pool.query(
    `
    SELECT id
    FROM ministries
    WHERE
      (
        LOWER(
          COALESCE(
            NULLIF(TRIM(name_english), ''),
            name
          )
        ) = LOWER($1)

        OR

        LOWER(
          COALESCE(
            NULLIF(TRIM(name_telugu), ''),
            name
          )
        ) = LOWER($2)
      )

      AND language = $3

      AND (
        $4::integer IS NULL
        OR id <> $4
      )

    LIMIT 1
    `,
    [
      englishName,
      teluguName,
      language,
      excludeId,
    ]
  );

  return result.rows.length > 0;
};

// =====================================================
// CREATE MINISTRY
// POST /api/admin/ministries
// =====================================================

const createMinistry = async (req, res) => {
  let uploadedImage = null;

  try {
    // BILINGUAL NAMES

    const englishName = normalizeString(
      req.body.name_english
    );

    const teluguName = normalizeString(
      req.body.name_telugu || req.body.name
    );

    const description = normalizeString(
      req.body.description
    );

    const language =
      normalizeString(req.body.language) || "Telugu";

    // VALIDATE ENGLISH NAME

    if (!englishName) {
      return res.status(400).json({
        success: false,
        message: "English ministry name is required.",
      });
    }

    // VALIDATE TELUGU NAME

    if (!teluguName) {
      return res.status(400).json({
        success: false,
        message: "Telugu ministry name is required.",
      });
    }

    // VALIDATE LANGUAGE

    if (!isValidLanguage(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // CHECK DUPLICATE

    const duplicate = await checkDuplicateMinistry(
      englishName,
      teluguName,
      language
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "This English or Telugu ministry name already exists in this language.",
      });
    }

    // UPLOAD IMAGE

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );

      if (!uploadedImage?.cloudFrontUrl) {
        throw new Error(
          "Ministry image upload failed."
        );
      }
    }

    const imageUrl =
      uploadedImage?.cloudFrontUrl || null;

    // INSERT MINISTRY

    const result = await pool.query(
      `
      INSERT INTO ministries (
        name,
        name_english,
        name_telugu,
        description,
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
    console.error(
      "Create ministry error:",
      error
    );

    // CLEANUP NEW IMAGE

    await cleanupUploadedImage(
      uploadedImage?.key
    );

    // DUPLICATE DATABASE CONSTRAINT

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "This ministry already exists. Please use different names.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to create ministry. Please try again.",
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

    // VALIDATE ID

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    // FIND EXISTING MINISTRY

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

    // SUPPORT OLD AND NEW DATA

    const oldEnglishName =
      oldMinistry.name_english ||
      oldMinistry.name ||
      "";

    const oldTeluguName =
      oldMinistry.name_telugu ||
      oldMinistry.name ||
      "";

    // ENGLISH NAME

    const englishName =
      req.body.name_english !== undefined
        ? normalizeString(req.body.name_english)
        : oldEnglishName;

    // TELUGU NAME

    const teluguName =
      req.body.name_telugu !== undefined
        ? normalizeString(req.body.name_telugu)
        : req.body.name !== undefined
          ? normalizeString(req.body.name)
          : oldTeluguName;

    // DESCRIPTION

    const description =
      req.body.description !== undefined
        ? normalizeString(req.body.description)
        : oldMinistry.description || "";

    // LANGUAGE

    const language =
      req.body.language !== undefined
        ? normalizeString(req.body.language)
        : oldMinistry.language || "Telugu";

    // VALIDATE ENGLISH

    if (!englishName) {
      return res.status(400).json({
        success: false,
        message: "English ministry name is required.",
      });
    }

    // VALIDATE TELUGU

    if (!teluguName) {
      return res.status(400).json({
        success: false,
        message: "Telugu ministry name is required.",
      });
    }

    // VALIDATE LANGUAGE

    if (!isValidLanguage(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry language.",
      });
    }

    // DUPLICATE CHECK

    const duplicate = await checkDuplicateMinistry(
      englishName,
      teluguName,
      language,
      id
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another ministry already uses this English or Telugu name in this language.",
      });
    }

    // KEEP EXISTING IMAGE

    let imageUrl = oldMinistry.image_url || null;

    // UPLOAD NEW IMAGE IF SELECTED

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "ministries"
      );

      if (!uploadedImage?.cloudFrontUrl) {
        throw new Error(
          "Ministry image upload failed."
        );
      }

      imageUrl = uploadedImage.cloudFrontUrl;
    }

    // UPDATE DATABASE

    const result = await pool.query(
      `
      UPDATE ministries

      SET
        name = $1,
        name_english = $2,
        name_telugu = $3,
        description = $4,
        image_url = $5,
        language = $6

      WHERE id = $7

      RETURNING *
      `,
      [
        teluguName,
        englishName,
        teluguName,
        description || null,
        imageUrl,
        language,
        id,
      ]
    );

    // DELETE OLD IMAGE ONLY AFTER SUCCESSFUL UPDATE

    if (
      uploadedImage &&
      oldMinistry.image_url &&
      oldMinistry.image_url !== imageUrl
    ) {
      await deleteOldImage(
        oldMinistry.image_url
      );
    }

    return res.status(200).json({
      success: true,
      message: "Ministry updated successfully.",
      ministry: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Update ministry error:",
      error
    );

    // CLEANUP NEW IMAGE IF UPDATE FAILED

    await cleanupUploadedImage(
      uploadedImage?.key
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "This ministry already exists. Please use different names.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to update ministry. Please try again.",
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

    // VALIDATE ID

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ministry ID.",
      });
    }

    // FIND MINISTRY

    const existingResult = await pool.query(
      `
      SELECT
        id,
        name,
        name_english,
        name_telugu,
        image_url

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

    // DELETE FROM DATABASE

    const result = await pool.query(
      `
      DELETE FROM ministries
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Ministry not found.",
      });
    }

    // DELETE S3 IMAGE AFTER SUCCESSFUL DB DELETE

    await deleteOldImage(
      ministry.image_url
    );

    return res.status(200).json({
      success: true,
      message: "Ministry deleted successfully.",
    });

  } catch (error) {
    console.error(
      "Delete ministry error:",
      error
    );

    // FOREIGN KEY CONSTRAINT

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "This ministry is linked to existing songs. Remove or reassign those songs before deleting this ministry.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete ministry. Please try again.",
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
