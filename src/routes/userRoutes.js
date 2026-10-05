// =========================================================
// userRoutes.js
// KEERTHANA - User Profile Routes
// =========================================================

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  getProfile,
  updateProfile,
} = require("../controllers/userController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const router = express.Router();


// =========================================================
// PROFILE UPLOAD DIRECTORY
// =========================================================

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "profile"
);


// =========================================================
// CREATE DIRECTORY IF NOT EXISTS
// =========================================================

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(
    uploadDirectory,
    {
      recursive: true,
    }
  );
}


// =========================================================
// MULTER STORAGE
// =========================================================

const storage = multer.diskStorage({

  destination: (
    req,
    file,
    cb
  ) => {

    cb(
      null,
      uploadDirectory
    );
  },


  filename: (
    req,
    file,
    cb
  ) => {

    const extension =
      path.extname(
        file.originalname
      ).toLowerCase();

    const userId =
      req.user?.id || "user";

    const timestamp =
      Date.now();

    const filename =
      `profile-${userId}-${timestamp}${extension}`;

    cb(
      null,
      filename
    );
  },

});


// =========================================================
// FILE FILTER
// =========================================================

const fileFilter = (
  req,
  file,
  cb
) => {

  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ];

  const extension =
    path.extname(
      file.originalname
    ).toLowerCase();

  const mimeTypeAllowed =
    allowedMimeTypes.includes(
      file.mimetype
    );

  const extensionAllowed =
    allowedExtensions.includes(
      extension
    );

  if (
    mimeTypeAllowed &&
    extensionAllowed
  ) {
    cb(
      null,
      true
    );
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed"
      )
    );
  }
};


// =========================================================
// MULTER
// Maximum: 5 MB
// =========================================================

const upload = multer({

  storage,

  fileFilter,

  limits: {
    fileSize:
      5 * 1024 * 1024,
  },

});


// =========================================================
// GET PROFILE
// GET /api/users/profile
// =========================================================

router.get(
  "/profile",
  authMiddleware,
  getProfile
);


// =========================================================
// UPDATE PROFILE
// PUT /api/users/profile
//
// Form fields:
// name
// mobile
// language
// profile_image
// =========================================================

router.put(
  "/profile",
  authMiddleware,
  upload.single("profile_image"),
  updateProfile
);


// =========================================================
// MULTER ERROR HANDLER
// =========================================================

router.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Profile image must be 5 MB or smaller",
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message,
        });
    }

    if (error) {

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "Profile upload failed",
        });
    }

    next();
  }
);


// =========================================================
// EXPORT
// =========================================================

module.exports = router;