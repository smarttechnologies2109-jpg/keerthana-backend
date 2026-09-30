
const express = require("express");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const {
  getNotifications,
} = require("../controllers/notificationController");

const router = express.Router();

/* =========================================================
   GET NOTIFICATIONS

   GET /api/notifications
========================================================= */

router.get(
  "/",
  authMiddleware,
  getNotifications
);

module.exports = router;

