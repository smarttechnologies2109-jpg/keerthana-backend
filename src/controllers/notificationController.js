
const pool = require("../config/db");

/* =========================================================
   GET NOTIFICATIONS FOR THE LOGGED-IN USER
========================================================= */

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        n.id,
        n.title,
        n.message,
        n.type,
        n.song_id,
        n.album_id,
        n.ministry_id,
        n.is_active,
        n.created_at,
        (un.read_at IS NOT NULL) AS is_read
      FROM notifications n
      LEFT JOIN user_notifications un
        ON un.notification_id = n.id
       AND un.user_id = $1
      WHERE n.is_active = TRUE
      ORDER BY n.created_at DESC NULLS LAST, n.id DESC
      LIMIT 100
      `,
      [userId]
    );

    const notifications = result.rows;

    const unreadCount = notifications.filter(
      (notification) => !notification.is_read
    ).length;

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch notifications",
    });
  }
};

/* =========================================================
   MARK ONE NOTIFICATION AS READ
========================================================= */

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const notificationId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (
      !Number.isSafeInteger(notificationId) ||
      notificationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO user_notifications (
        user_id,
        notification_id,
        read_at
      )
      SELECT $1, n.id, NOW()
      FROM notifications n
      WHERE n.id = $2
        AND n.is_active = TRUE
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET read_at =
        COALESCE(user_notifications.read_at, NOW())
      RETURNING notification_id
      `,
      [userId, notificationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark notification read error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to mark notification as read",
    });
  }
};

/* =========================================================
   MARK ALL ACTIVE NOTIFICATIONS AS READ
========================================================= */

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    await pool.query(
      `
      INSERT INTO user_notifications (
        user_id,
        notification_id,
        read_at
      )
      SELECT $1, n.id, NOW()
      FROM notifications n
      WHERE n.is_active = TRUE
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET read_at =
        COALESCE(user_notifications.read_at, NOW())
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to mark notifications as read",
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
