// =========================================================
// userController.js
// KEERTHANA - User Profile Controller
// =========================================================

const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// =========================================================
// GET CURRENT USER PROFILE
// GET /api/users/profile
// =========================================================

const getProfile = async (req, res) => {
  try {
    // -----------------------------------------------------
    // Authentication check
    // -----------------------------------------------------

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // -----------------------------------------------------
    // Get user
    // -----------------------------------------------------

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        mobile,
        role,
        profile_image,
        language,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    // -----------------------------------------------------
    // User not found
    // -----------------------------------------------------

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    // -----------------------------------------------------
    // Response
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        profile_image: user.profile_image,
        language: user.language || "Telugu",
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error) {
    console.error(
      "GET PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
};


// =========================================================
// UPDATE CURRENT USER PROFILE
// PUT /api/users/profile
// =========================================================

const updateProfile = async (req, res) => {
  try {
    // -----------------------------------------------------
    // Authentication check
    // -----------------------------------------------------

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id;

    // -----------------------------------------------------
    // Get submitted values
    // -----------------------------------------------------

    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    const mobile =
      typeof req.body.mobile === "string"
        ? req.body.mobile.trim()
        : "";

    const language =
      typeof req.body.language === "string"
        ? req.body.language.trim()
        : "";

    // -----------------------------------------------------
    // Validate name
    // -----------------------------------------------------

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 2 characters",
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must not exceed 100 characters",
      });
    }

    // -----------------------------------------------------
    // Supported languages
    // -----------------------------------------------------

    const allowedLanguages = [
      "Telugu",
      "Hindi",
      "English",
      "Malayalam",
      "Kannada",
      "Tamil",
    ];

    // -----------------------------------------------------
    // Validate language
    // -----------------------------------------------------

    if (
      language &&
      !allowedLanguages.includes(language)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid language selected",
      });
    }

    // -----------------------------------------------------
    // Validate mobile
    // -----------------------------------------------------

    if (mobile && mobile.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is too long",
      });
    }

    // -----------------------------------------------------
    // Get existing user
    // -----------------------------------------------------

    const existingResult = await pool.query(
      `
      SELECT
        id,
        profile_image,
        language
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingUser =
      existingResult.rows[0];

    // -----------------------------------------------------
    // Determine final language
    // -----------------------------------------------------

    const finalLanguage =
      language ||
      existingUser.language ||
      "Telugu";

    // -----------------------------------------------------
    // Determine uploaded image
    // -----------------------------------------------------

    let profileImage =
      existingUser.profile_image || null;

    if (req.file) {
      profileImage =
        `/uploads/profile/${req.file.filename}`;
    }

    // -----------------------------------------------------
    // Update database
    // -----------------------------------------------------

    const result = await pool.query(
      `
      UPDATE users
      SET
        name = $1,
        mobile = $2,
        language = $3,
        profile_image = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING
        id,
        name,
        email,
        mobile,
        role,
        profile_image,
        language,
        created_at,
        updated_at
      `,
      [
        name,
        mobile || null,
        finalLanguage,
        profileImage,
        userId,
      ]
    );

    // -----------------------------------------------------
    // Return updated user
    // -----------------------------------------------------

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        profile_image: user.profile_image,
        language: user.language || "Telugu",
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error) {
    console.error(
      "UPDATE PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};


// =========================================================
// DELETE OLD PROFILE IMAGE
// Optional helper
// =========================================================

const deleteOldProfileImage = (imagePath) => {
  try {
    if (!imagePath) {
      return;
    }

    // Only delete our uploaded profile images
    if (
      !imagePath.startsWith(
        "/uploads/profile/"
      )
    ) {
      return;
    }

    const filename =
      path.basename(imagePath);

    const filePath = path.join(
      __dirname,
      "..",
      "uploads",
      "profile",
      filename
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(
      "DELETE OLD PROFILE IMAGE ERROR:",
      error.message
    );
  }
};


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getProfile,
  updateProfile,
  deleteOldProfileImage,
};