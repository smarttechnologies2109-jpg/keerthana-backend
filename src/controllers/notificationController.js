
const pool = require("../config/db");

/* =========================================================
   GET NOTIFICATIONS
========================================================= */

const getNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        title,
        message,
        type,
        song_id,
        album_id,
        ministry_id,
        is_active,
        created_at
      FROM notifications
      WHERE is_active = TRUE
      ORDER BY created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      notifications: result.rows,
      unreadCount: 0,
    });

  } catch (error) {
    console.error(
      "Get notifications error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch notifications",
    });
  }
};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getNotifications,
};

