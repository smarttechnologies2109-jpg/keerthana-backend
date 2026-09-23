const pool = require("../config/db");

const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    const user = result.rows[0];

    // Debug information
    console.log("ADMIN CHECK:");
    console.log("User ID:", user.id);
    console.log("User Name:", user.name);
    console.log("User Email:", user.email);
    console.log("User Role:", JSON.stringify(user.role));

    if (String(user.role).trim().toLowerCase() !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
        userRole: user.role,
      });
    }

    req.user.role = "admin";

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify admin access",
    });
  }
};

module.exports = adminMiddleware;