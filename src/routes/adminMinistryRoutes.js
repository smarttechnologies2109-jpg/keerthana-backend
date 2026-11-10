
const express = require("express");

const {
  createMinistry,
  updateMinistry,
  deleteMinistry,
} = require("../controllers/adminMinistryController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

const upload = require("../middleware/s3Upload");

const router = express.Router();

// ========================================
// CREATE MINISTRY
// POST /api/admin/ministries
// ========================================

router.post(
  "/",
  authMiddleware,
  adminOnly,
  upload.single("image"),
  createMinistry
);

// ========================================
// UPDATE MINISTRY
// PUT /api/admin/ministries/:id
// ========================================

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  upload.single("image"),
  updateMinistry
);

// ========================================
// DELETE MINISTRY
// DELETE /api/admin/ministries/:id
// ========================================

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteMinistry
);

module.exports = router;
