
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// =========================================================
// JWT CONFIGURATION
// =========================================================

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return secret;
};

// =========================================================
// ROLE NORMALIZATION
// =========================================================

const normalizeRole = (role) => {
  return String(role || "")
    .trim()
    .toUpperCase();
};

// =========================================================
// JWT VERIFICATION
// =========================================================

const verifyAccessToken = (token) => {
  const decoded = jwt.verify(
    token,
    getJwtSecret()
  );

  if (!decoded || !decoded.id) {
    throw new Error("Invalid token payload.");
  }

  return decoded;
};

// =========================================================
// GET USER FROM DATABASE
// =========================================================

const getUserFromDatabase = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        id,
        role,
        language
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];

  return {
    id: user.id,
    role: user.role,
    language: user.language || "Telugu",
  };
};

// =========================================================
// AUTHENTICATION MIDDLEWARE
// =========================================================

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token missing.",
    });
  }

  // Verify JWT separately from database query.
  let decoded;

  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError" ||
      error.message === "Invalid token payload."
    ) {
      return res.status(401).json({
        success: false,
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "Invalid or expired token.",
      });
    }

    console.error(
      "JWT verification error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed.",
    });
  }

  // Fetch current user and role from database.
  try {
    const user = await getUserFromDatabase(
      decoded.id
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User account not found.",
      });
    }

    req.user = user;

    return next();

  } catch (error) {
    console.error(
      "Authentication database error:",
      error.message
    );

    return res.status(503).json({
      success: false,
      code: "AUTH_DATABASE_UNAVAILABLE",
      message: "Authentication service temporarily unavailable.",
    });
  }
};

// =========================================================
// OPTIONAL AUTHENTICATION MIDDLEWARE
// =========================================================

const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await getUserFromDatabase(
      decoded.id
    );

    req.user = user || null;

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

// =========================================================
// ADMIN ONLY MIDDLEWARE
// =========================================================

const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const role = normalizeRole(req.user.role);

  if (role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      code: "ADMIN_ACCESS_REQUIRED",
      message: "Admin access required.",
    });
  }

  return next();
};

// =========================================================
// BUSINESS OWNER ONLY MIDDLEWARE
// =========================================================

const ownerOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const role = normalizeRole(req.user.role);

  if (role !== "BUSINESS_OWNER") {
    return res.status(403).json({
      success: false,
      code: "OWNER_ACCESS_REQUIRED",
      message: "Business Owner access required.",
    });
  }

  return next();
};

// =========================================================
// ADMIN OR BUSINESS OWNER
// =========================================================

const adminOrOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const role = normalizeRole(req.user.role);

  if (
    role !== "ADMIN" &&
    role !== "BUSINESS_OWNER"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied.",
    });
  }

  return next();
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminOnly,
  ownerOnly,
  adminOrOwner,
};
