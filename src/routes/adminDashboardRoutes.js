
const express = require("express");

const {
  getAdminDashboard,
} = require("../controllers/adminDashboardController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// ADMIN DASHBOARD
// =====================================================

router.get(
  "/dashboard",
  authMiddleware,
  adminOnly,
  getAdminDashboard
);

module.exports = router;
