const jwt = require("jsonwebtoken");
const pool = require("../config/db");


/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

const authMiddleware = async (req, res, next) => {
  try {

    /* =====================================
       GET AUTHORIZATION HEADER
    ===================================== */

    const authHeader =
      req.headers.authorization;


    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }


    /* =====================================
       GET TOKEN
    ===================================== */

    const token =
      authHeader.split(" ")[1];


    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token missing",
      });
    }


    /* =====================================
       VERIFY TOKEN
    ===================================== */

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );


    /* =====================================
       GET CURRENT USER FROM DATABASE

       We get language from database instead
       of putting language inside JWT.
    ===================================== */

    const result = await pool.query(
      `
      SELECT
        id,
        role,
        language
      FROM users
      WHERE id = $1
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


    /* =====================================
       SAVE USER TO REQUEST
    ===================================== */

    req.user = {
      id: user.id,
      role: user.role,
      language: user.language || "Telugu",
    };


    console.log(
      "Authenticated user:",
      req.user
    );


    next();

  } catch (error) {

    console.error(
      "Authentication error:",
      error.message
    );


    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};


/* =========================================================
   OPTIONAL AUTHENTICATION MIDDLEWARE

   - If user is logged in:
       req.user will be available
   - If user is not logged in:
       request continues normally

   This keeps existing public song browsing working.
========================================================= */

const optionalAuthMiddleware = async (req, res, next) => {
  try {

    /* =====================================
       GET AUTHORIZATION HEADER
    ===================================== */

    const authHeader =
      req.headers.authorization;


    /* =====================================
       NO TOKEN

       Continue as public user.
    ===================================== */

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      req.user = null;
      return next();
    }


    /* =====================================
       GET TOKEN
    ===================================== */

    const token =
      authHeader.split(" ")[1];


    if (!token) {
      req.user = null;
      return next();
    }


    /* =====================================
       VERIFY TOKEN
    ===================================== */

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );


    /* =====================================
       GET CURRENT USER

       Get latest language from database.
    ===================================== */

    const result = await pool.query(
      `
      SELECT
        id,
        role,
        language
      FROM users
      WHERE id = $1
      `,
      [decoded.id]
    );


    /* =====================================
       USER NOT FOUND

       Treat request as public.
    ===================================== */

    if (result.rows.length === 0) {
      req.user = null;
      return next();
    }


    const user = result.rows[0];


    /* =====================================
       SAVE USER TO REQUEST
    ===================================== */

    req.user = {
      id: user.id,
      role: user.role,
      language: user.language || "Telugu",
    };


    console.log(
      "Optional authenticated user:",
      req.user
    );


    next();

  } catch (error) {

    /*
      Important:
      For optional authentication, an invalid
      token should not break public song browsing.
    */

    console.log(
      "Optional authentication skipped:",
      error.message
    );

    req.user = null;

    next();
  }
};


/* =========================================================
   ADMIN ONLY MIDDLEWARE
========================================================= */

const adminOnly = (req, res, next) => {

  /* =====================================
     USER MUST BE AUTHENTICATED
  ===================================== */

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }


  /* =====================================
     NORMALIZE ROLE
  ===================================== */

  const role = String(
    req.user.role || ""
  )
    .trim()
    .toUpperCase();


  console.log(
    "Admin middleware role:",
    role
  );


  /* =====================================
     CHECK ADMIN ROLE
  ===================================== */

  if (role !== "ADMIN") {

    console.log(
      "Admin access denied:",
      req.user
    );

    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }


  /* =====================================
     ADMIN VERIFIED
  ===================================== */

  next();
};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminOnly,
};