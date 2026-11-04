
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token missing",
    });
  }

  // Verify JWT separately from the database query.
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    console.error("JWT verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed",
    });
  }

  // Database errors must NOT be reported as expired tokens.
  try {
    const result = await pool.query(
      `
        SELECT id, role, language
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    req.user = {
      id: user.id,
      role: user.role,
      language: user.language || "Telugu",
    };

    return next();
  } catch (error) {
    console.error(
      "Authentication database error:",
      error.message
    );

    return res.status(503).json({
      success: false,
      code: "AUTH_DATABASE_UNAVAILABLE",
      message: "Authentication service temporarily unavailable",
    });
  }
};

/* =========================================================
   OPTIONAL AUTHENTICATION MIDDLEWARE
========================================================= */

const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const result = await pool.query(
      `
        SELECT id, role, language
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      req.user = null;
      return next();
    }

    const user = result.rows[0];

    req.user = {
      id: user.id,
      role: user.role,
      language: user.language || "Telugu",
    };

    return next();
  } catch (error) {
    console.error(
      "Optional authentication skipped:",
      error.message
    );

    req.user = null;
    return next();
  }
};

/* =========================================================
   ADMIN ONLY MIDDLEWARE
========================================================= */

const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const role = String(req.user.role || "")
    .trim()
    .toUpperCase();

  if (role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  return next();
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminOnly,
};
