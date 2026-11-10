
const express = require("express");

const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/adminCategoryController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

const upload = require("../middleware/s3Upload");

const router = express.Router();

// GET CATEGORIES
router.get(
  "/",
  authMiddleware,
  adminOnly,
  getCategories
);

// CREATE CATEGORY WITH IMAGE
router.post(
  "/",
  authMiddleware,
  adminOnly,
  upload.single("image"),
  createCategory
);

// UPDATE CATEGORY WITH IMAGE
router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  upload.single("image"),
  updateCategory
);

// DELETE CATEGORY
router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteCategory
);

module.exports = router;
