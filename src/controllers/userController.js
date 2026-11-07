
const pool = require("../config/db");

const {
  uploadToS3,
  deleteS3Object,
  getProfileS3Key,
} = require("../middleware/s3Upload");

// =====================================================
// SUPPORTED LANGUAGES
// =====================================================

const SUPPORTED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

// =====================================================
// GET USER PROFILE
// =====================================================

const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required.",
      });
    }

    const result = await pool.query(
      `SELECT
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
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch profile.",
    });
  }
};

// =====================================================
// UPDATE USER PROFILE
//
// Profile image:
// Multer memoryStorage -> S3 profiles/
//
// PostgreSQL stores:
// profiles/generated-filename.webp
//
// Mobile is preserved when not submitted.
// =====================================================

const updateProfile = async (req, res) => {
  let newlyUploadedKey = null;

  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required.",
      });
    }

    const {
      name,
      mobile,
      language,
    } = req.body;

    // -------------------------------------------------
    // GET EXISTING PROFILE
    // -------------------------------------------------

    const existingResult = await pool.query(
      `SELECT
        id,
        name,
        mobile,
        profile_image,
        language
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    const existingUser = existingResult.rows[0];

    // -------------------------------------------------
    // VALIDATE NAME
    // -------------------------------------------------

    const updatedName =
      name !== undefined
        ? String(name).trim()
        : existingUser.name;

    if (
      !updatedName ||
      updatedName.length < 2 ||
      updatedName.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 100 characters.",
      });
    }

    // -------------------------------------------------
    // VALIDATE LANGUAGE
    // -------------------------------------------------

    const updatedLanguage =
      language !== undefined
        ? String(language).trim()
        : existingUser.language;

    if (!SUPPORTED_LANGUAGES.includes(updatedLanguage)) {
      return res.status(400).json({
        success: false,
        message: "Please select a supported language.",
      });
    }

    // -------------------------------------------------
    // PRESERVE MOBILE IF NOT SUBMITTED
    // -------------------------------------------------

    let updatedMobile = existingUser.mobile;

    if (mobile !== undefined) {
      const cleanMobile = String(mobile).trim();

      if (cleanMobile.length > 30) {
        return res.status(400).json({
          success: false,
          message: "Mobile number cannot exceed 30 characters.",
        });
      }

      updatedMobile = cleanMobile || null;
    }

    // -------------------------------------------------
    // KEEP EXISTING PROFILE IMAGE
    // -------------------------------------------------

    let updatedProfileImage = existingUser.profile_image;

    // -------------------------------------------------
    // UPLOAD NEW PROFILE IMAGE TO S3
    // -------------------------------------------------

    if (req.file) {
      const uploaded = await uploadToS3(
        req.file,
        "profiles"
      );

      if (!uploaded || !uploaded.key) {
        throw new Error("Profile image upload to S3 failed.");
      }

      newlyUploadedKey = uploaded.key;
      updatedProfileImage = uploaded.key;
    }

    // -------------------------------------------------
    // UPDATE POSTGRESQL
    // -------------------------------------------------

    let updateResult;

    try {
      updateResult = await pool.query(
        `UPDATE users
         SET
           name = $1,
           mobile = $2,
           language = $3,
           profile_image = $4,
           updated_at = NOW()
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
           updated_at`,
        [
          updatedName,
          updatedMobile,
          updatedLanguage,
          updatedProfileImage,
          userId,
        ]
      );
    } catch (databaseError) {
      // Database update failed. Remove the newly uploaded
      // image so an orphaned profile object is not left behind.
      if (newlyUploadedKey) {
        try {
          await deleteS3Object(newlyUploadedKey);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up new profile image:",
            cleanupError
          );
        }
      }

      throw databaseError;
    }

    const updatedUser = updateResult.rows[0];

    // -------------------------------------------------
    // DELETE OLD S3 PROFILE IMAGE AFTER DB SUCCESS
    //
    // Legacy /uploads/profile/... files are not deleted.
    // Only old profiles/ S3 objects are eligible.
    // -------------------------------------------------

    if (
      newlyUploadedKey &&
      existingUser.profile_image &&
      existingUser.profile_image !== newlyUploadedKey
    ) {
      const oldProfileKey = getProfileS3Key(
        existingUser.profile_image
      );

      if (oldProfileKey) {
        try {
          await deleteS3Object(oldProfileKey);
        } catch (deleteError) {
          // Keep the successful profile update even if
          // cleanup of the previous image fails.
          console.error(
            "Old profile image cleanup failed:",
            deleteError
          );
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    // Best-effort cleanup if an error occurred after upload
    // but before the database update completed.
    if (newlyUploadedKey) {
      try {
        const currentResult = await pool.query(
          "SELECT profile_image FROM users WHERE id = $1",
          [req.user?.id || req.user?.userId]
        );

        const currentImage =
          currentResult.rows[0]?.profile_image;

        if (currentImage !== newlyUploadedKey) {
          await deleteS3Object(newlyUploadedKey);
        }
      } catch (cleanupError) {
        console.error(
          "Profile image cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update profile.",
    });
  }
};

// =====================================================
// LEGACY HELPER
// Retained for compatibility with existing imports.
// Only deletes S3 profile objects. Local legacy files
// are deliberately left untouched.
// =====================================================

const deleteOldProfileImage = async (profileImage) => {
  const key = getProfileS3Key(profileImage);

  if (!key) return;

  try {
    await deleteS3Object(key);
  } catch (error) {
    console.error("Delete old profile image error:", error);
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getProfile,
  updateProfile,
  deleteOldProfileImage,
};
