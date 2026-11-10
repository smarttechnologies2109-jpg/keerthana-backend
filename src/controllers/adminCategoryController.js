
const pool = require("../config/db");

const {
  uploadToS3,
  deleteS3Object,
} = require("../middleware/s3Upload");

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

// GET ALL CATEGORIES
const getCategories = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.language,
        c.image_url,
        c.created_at,
        COUNT(s.id)::integer AS song_count
      FROM categories c
      LEFT JOIN songs s ON s.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
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
      message: "Unable to load categories",
    });
  }
};

// CREATE CATEGORY
const createCategory = async (req, res) => {
  let uploadedImage = null;

  try {
    const { name, language } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const cleanName = name.trim();
    const categoryLanguage = language?.trim() || "Telugu";

    if (!ALLOWED_LANGUAGES.includes(categoryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category language",
      });
    }

    const existing = await pool.query(
      `SELECT id FROM categories
       WHERE LOWER(name) = LOWER($1)
       AND language = $2`,
      [cleanName, categoryLanguage]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Category already exists in this language",
      });
    }

    if (req.file) {
      uploadedImage = await uploadToS3(req.file, "categories");
    }

    const result = await pool.query(
      `INSERT INTO categories
       (name, language, image_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        cleanName,
        categoryLanguage,
        uploadedImage?.cloudFrontUrl || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Create category error:", error);

    if (uploadedImage?.key) {
      try {
        await deleteS3Object(uploadedImage.key);
      } catch (cleanupError) {
        console.error("S3 cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create category",
      error: error.message,
    });
  }
};

// UPDATE CATEGORY
const updateCategory = async (req, res) => {
  let uploadedImage = null;

  try {
    const { id } = req.params;
    const { name, language } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const cleanName = name.trim();
    const categoryLanguage = language?.trim() || "Telugu";

    if (!ALLOWED_LANGUAGES.includes(categoryLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category language",
      });
    }

    const existingCategory = await pool.query(
      `SELECT * FROM categories WHERE id = $1`,
      [id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const oldCategory = existingCategory.rows[0];

    const duplicate = await pool.query(
      `SELECT id FROM categories
       WHERE LOWER(name) = LOWER($1)
       AND language = $2
       AND id <> $3`,
      [cleanName, categoryLanguage, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another category already uses this name in this language",
      });
    }

    if (req.file) {
      uploadedImage = await uploadToS3(req.file, "categories");
    }

    const imageUrl = uploadedImage
      ? uploadedImage.cloudFrontUrl
      : oldCategory.image_url || null;

    const result = await pool.query(
      `UPDATE categories
       SET name = $1,
           language = $2,
           image_url = $3
       WHERE id = $4
       RETURNING *`,
      [cleanName, categoryLanguage, imageUrl, id]
    );

    // Delete old image only after successful database update.
    if (uploadedImage && oldCategory.image_url) {
      try {
        await deleteS3Object(oldCategory.image_url);
      } catch (deleteError) {
        console.error("Old category image cleanup error:", deleteError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Update category error:", error);

    if (uploadedImage?.key) {
      try {
        await deleteS3Object(uploadedImage.key);
      } catch (cleanupError) {
        console.error("S3 cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update category",
      error: error.message,
    });
  }
};

// DELETE CATEGORY
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const songs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM songs WHERE category_id = $1`,
      [id]
    );

    if (songs.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete category because songs are assigned to it.",
      });
    }

    const result = await pool.query(
      `DELETE FROM categories
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (result.rows[0].image_url) {
      try {
        await deleteS3Object(result.rows[0].image_url);
      } catch (deleteError) {
        console.error("Category image cleanup error:", deleteError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete category error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete category",
    });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
