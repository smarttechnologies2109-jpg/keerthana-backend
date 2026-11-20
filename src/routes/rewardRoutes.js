
const express = require("express");

const router = express.Router();

const {
  prepareReward,
  getAdFreeStatus,
  handleAdMobSSV,
} = require("../controllers/rewardController");

// Your actual authentication middleware export
const {
  authMiddleware,
} = require("../middleware/authMiddleware");

// =====================================================
// AUTHENTICATED USER ENDPOINTS
// =====================================================

router.post(
  "/ad-free/prepare",
  authMiddleware,
  prepareReward
);

router.get(
  "/ad-free/status",
  authMiddleware,
  getAdFreeStatus
);

// =====================================================
// PUBLIC ADMOB SERVER-SIDE VERIFICATION CALLBACK
// =====================================================

router.get(
  "/ad-free/ssv",
  handleAdMobSSV
);

module.exports = router;
