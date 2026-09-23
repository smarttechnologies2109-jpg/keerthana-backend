const express = require("express");

const {
  getListeningStatistics,
} = require("../controllers/statisticsController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================================================
   PERSONAL LISTENING STATISTICS

   GET /api/statistics
========================================================= */

router.get(
  "/",
  authMiddleware,
  getListeningStatistics
);

module.exports = router;