
const express = require("express");

const router = express.Router();

const {
  prepareReward,
  getAdFreeStatus,
  handleAdMobSSV,
} = require("../controllers/rewardController");

// IMPORTANT:
// Replace this import with your existing authentication middleware.
// Use the middleware that sets req.user.id.

const { authenticateToken } = require("../middleware/authMiddleware");

// Authenticated user endpoints
router.post(
  "/ad-free/prepare",
  authenticateToken,
  prepareReward
);

router.get(
  "/ad-free/status",
  authenticateToken,
  getAdFreeStatus
);

// Public callback:
// Google AdMob calls this endpoint, not the mobile app.
// Its cryptographic signature must be verified by the controller.
router.get(
  "/ad-free/ssv",
  handleAdMobSSV
);

module.exports = router;
