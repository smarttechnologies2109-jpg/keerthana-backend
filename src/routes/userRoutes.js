
const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
} = require("../controllers/userController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const {
  profileUpload,
} = require("../middleware/s3Upload");

// GET USER PROFILE
router.get(
  "/profile",
  authMiddleware,
  getProfile
);

// UPDATE USER PROFILE
router.put(
  "/profile",
  authMiddleware,
  profileUpload.single("profile_image"),
  updateProfile
);

// MULTER ERROR HANDLER
router.use((err, req, res, next) => {
  if (err instanceof require("multer").MulterError) {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "Profile image must not exceed 5 MB."
          : err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Profile upload failed.",
    });
  }

  next();
});

module.exports = router;
