
const pool = require("../config/db");

const {
  uploadToS3,
  deleteS3Object,
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
// HELPER: CLEAN CATEGORY NAME
// =====================================================

const cleanValue = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

// =====================================================
// HELPER: EXTRACT S3 OBJECT KEY
// Supports CloudFront URLs and direct object keys.
// =====================================================

const getS3KeyFromUrl = (imageUrl) => {
  if (!imageUrl) return null;

  try {
    if (!imageUrl.startsWith("http://") &&
        !imageUrl.startsWith("https://")) {
      return imageUrl;
    }

    const pathname = new URL(imageUrl).pathname;

    return decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch (error) {
    console.error("Unable to extract S3 key:", error);
    return null;
  }
};

// =====================================================
// HELPER: DELETE S3 IMAGE SAFELY
// =====================================================

const cleanupS3Image = async (image) => {
  if (!image) return;

  const key = getS3KeyFromUrl(image);

  if (!key) return;

  try {
    await deleteS3Object(key);
  } catch (error) {
    console.error("S3 image cleanup error:", error);
  }
};

// =====================================================
// HELPER: CHECK BILINGUAL DUPLICATES
// =====================================================

const checkDuplicateCategory = async (
  english,
  telugu,
  excludeId = null
) => {
  const result = await pool.query(
    `
    SELECT id
    FROM categories
    WHERE (
      LOWER(COALESCE(NULLIF(name_english, ''), name))
        = LOWER($1)
      OR
      LOWER(COALESCE(NULLIF(name_telugu, ''), name))
        = LOWER($2)
    )
    AND ($3::int IS NULL OR id <> $3)
    LIMIT 1
    `,
    [english, telugu, excludeId]
  );

  return result.rows.length > 0;
};

// =====================================================
// GET ALL CATEGORIES
// GET /api/admin/categories
// =====================================================

const getCategories = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        COALESCE(
          NULLIF(c.name_english, ''),
          c.name
        ) AS name_english,

        COALESCE(
          NULLIF(c.name_telugu, ''),
          c.name
        ) AS name_telugu,

        c.language,
        c.image_url,
        c.created_at,

        COUNT(DISTINCT s.id)::integer AS song_count

      FROM categories c

      LEFT JOIN songs s
        ON s.category_id = c.id

      GROUP BY c.id

      ORDER BY
        COALESCE(
          NULLIF(c.name_english, ''),
          c.name
        ) ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      categories: result.rows,
    });

  } catch (error) {
    console.error("Get categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load categories.",
    });
  }
};

// =====================================================
// CREATE CATEGORY
// POST /api/admin/categories
// =====================================================

const createCategory = async (req, res) => {
  let uploadedImage = null;

  try {
    const english = cleanValue(req.body.name_english);
    const telugu = cleanValue(
      req.body.name_telugu || req.body.name
    );

    const categoryLanguage =
      cleanValue(req.body.language) || "Telugu";

    // VALIDATION

    if (!english) {
      return res.status(400).json({
        success: false,
        message: "English category name is required.",
      });
    }

    if (!telugu) {
      return res.status(400).json({
        success: false,
        message: "Telugu category name is required.",
      });
    }

    if (!ALLOWED_LANGUAGES.includes(categoryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category language.",
      });
    }

    // DUPLICATE CHECK

    const duplicate = await checkDuplicateCategory(
      english,
      telugu
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "This English or Telugu category name already exists.",
      });
    }

    // UPLOAD IMAGE

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "categories"
      );

      if (!uploadedImage?.cloudFrontUrl) {
        throw new Error("Category image upload failed.");
      }
    }

    // INSERT CATEGORY

    const result = await pool.query(
      `
      INSERT INTO categories (
        name,
        name_english,
        name_telugu,
        language,
        image_url
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        telugu,
        english,
        telugu,
        categoryLanguage,
        uploadedImage?.cloudFrontUrl || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category: result.rows[0],
    });

  } catch (error) {
    console.error("Create category error:", error);

    // CLEANUP UPLOADED IMAGE IF DATABASE INSERT FAILS

    if (uploadedImage?.key) {
      await cleanupS3Image(uploadedImage.key);
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create category.",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE CATEGORY
// PUT /api/admin/categories/:id
// =====================================================

const updateCategory = async (req, res) => {
  let uploadedImage = null;

  try {
    const { id } = req.params;

    const english = cleanValue(req.body.name_english);
    const telugu = cleanValue(
      req.body.name_telugu || req.body.name
    );

    const categoryLanguage =
      cleanValue(req.body.language) || "Telugu";

    // VALIDATION

    if (!english) {
      return res.status(400).json({
        success: false,
        message: "English category name is required.",
      });
    }

    if (!telugu) {
      return res.status(400).json({
        success: false,
        message: "Telugu category name is required.",
      });
    }

    if (!ALLOWED_LANGUAGES.includes(categoryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category language.",
      });
    }

    // FIND CATEGORY

    const existingCategory = await pool.query(
      `
      SELECT *
      FROM categories
      WHERE id = $1
      `,
      [id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const oldCategory = existingCategory.rows[0];

    // DUPLICATE CHECK

    const duplicate = await checkDuplicateCategory(
      english,
      telugu,
      id
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another category already uses this English or Telugu name.",
      });
    }

    // UPLOAD NEW IMAGE IF PROVIDED

    if (req.file) {
      uploadedImage = await uploadToS3(
        req.file,
        "categories"
      );

      if (!uploadedImage?.cloudFrontUrl) {
        throw new Error("Category image upload failed.");
      }
    }

    const imageUrl = uploadedImage
      ? uploadedImage.cloudFrontUrl
      : oldCategory.image_url || null;

    // UPDATE DATABASE

    const result = await pool.query(
      `
      UPDATE categories

      SET
        name = $1,
        name_english = $2,
        name_telugu = $3,
        language = $4,
        image_url = $5

      WHERE id = $6

      RETURNING *
      `,
      [
        telugu,
        english,
        telugu,
        categoryLanguage,
        imageUrl,
        id,
      ]
    );

    // DELETE OLD IMAGE AFTER SUCCESSFUL UPDATE

    if (uploadedImage && oldCategory.image_url) {
      await cleanupS3Image(oldCategory.image_url);
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category: result.rows[0],
    });

  } catch (error) {
    console.error("Update category error:", error);

    // CLEANUP NEW IMAGE IF UPDATE FAILS

    if (uploadedImage?.key) {
      await cleanupS3Image(uploadedImage.key);
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update category.",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE CATEGORY
// DELETE /api/admin/categories/:id
// =====================================================

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // CHECK ASSIGNED SONGS

    const songs = await pool.query(
      `
      SELECT COUNT(*)::integer AS count
      FROM songs
      WHERE category_id = $1
      `,
      [id]
    );

    if (songs.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete category because songs are assigned to it.",
      });
    }

    // DELETE CATEGORY

    const result = await pool.query(
      `
      DELETE FROM categories
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    // CLEANUP CATEGORY IMAGE

    if (result.rows[0].image_url) {
      await cleanupS3Image(result.rows[0].image_url);
    }

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully.",
    });

  } catch (error) {
    console.error("Delete category error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete category.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
