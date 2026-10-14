const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationsController");

// Replace require path/name below with your existing
// authentication middleware.
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getNotifications);
router.post("/read-all", protect, markAllAsRead);
router.post("/:id/read", protect, markAsRead);

module.exports = router;