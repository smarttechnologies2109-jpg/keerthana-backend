
const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

// Get notifications for the logged-in user
router.get("/", authMiddleware, getNotifications);

// Mark all notifications as read
router.post("/read-all", authMiddleware, markAllAsRead);

// Mark one notification as read
router.post("/:id/read", authMiddleware, markAsRead);

module.exports = router;
