const jwt =
  require("jsonwebtoken");


/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

const authMiddleware = (
  req,
  res,
  next
) => {

  try {

    /* =====================================
       GET AUTH HEADER
    ===================================== */

    const authHeader =
      req.headers.authorization;


    if (
      !authHeader ||
      !authHeader.startsWith(
        "Bearer "
      )
    ) {

      return res
        .status(401)
        .json({

          success: false,

          message:
            "Authentication required",

        });

    }


    /* =====================================
       GET TOKEN
    ===================================== */

    const token =
      authHeader
        .split(" ")[1];


    if (!token) {

      return res
        .status(401)
        .json({

          success: false,

          message:
            "Authentication token missing",

        });

    }


    /* =====================================
       VERIFY TOKEN
    ===================================== */

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );


    /* =====================================
       SAVE USER TO REQUEST
    ===================================== */

    req.user =
      decoded;


    next();

  } catch (error) {

    console.error(
      "Authentication error:",
      error.message
    );


    return res
      .status(401)
      .json({

        success: false,

        message:
          "Invalid or expired token",

      });

  }

};


/* =========================================================
   ADMIN ONLY MIDDLEWARE
========================================================= */

const adminOnly = (
  req,
  res,
  next
) => {

  /* =====================================
     USER MUST BE AUTHENTICATED FIRST
  ===================================== */

  if (!req.user) {

    return res
      .status(401)
      .json({

        success: false,

        message:
          "Authentication required",

      });

  }


  /* =====================================
     CHECK ADMIN ROLE
  ===================================== */

  if (
    req.user.role !==
    "admin"
  ) {

    console.log(
      "Admin access denied:",
      req.user
    );


    return res
      .status(403)
      .json({

        success: false,

        message:
          "Admin access required",

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
  adminOnly,
};