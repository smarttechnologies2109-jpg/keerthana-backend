const express = require("express");

const {
  register,
  login,
  adminLogin,

  ownerLogin,
  ownerForgotPassword,
  ownerVerifyOTP,
  ownerResetPassword,

  adminForgotPassword,
  adminVerifyOTP,
  adminResetPassword,

  getMe,
} = require("../controllers/authController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const router = express.Router();


/* =========================================================
   USER AUTHENTICATION
========================================================= */

router.post(
  "/register",
  register
);

router.post(
  "/login",
  login
);


/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

router.post(
  "/admin/login",
  adminLogin
);


/* =========================================================
   ADMIN FORGOT PASSWORD
========================================================= */

router.post(
  "/admin/forgot-password",
  adminForgotPassword
);

router.post(
  "/admin/verify-otp",
  adminVerifyOTP
);

router.post(
  "/admin/reset-password",
  adminResetPassword
);


/* =========================================================
   BUSINESS OWNER AUTHENTICATION
========================================================= */

router.post(
  "/owner/login",
  ownerLogin
);


/* =========================================================
   BUSINESS OWNER FORGOT PASSWORD
========================================================= */

router.post(
  "/owner/forgot-password",
  ownerForgotPassword
);

router.post(
  "/owner/verify-otp",
  ownerVerifyOTP
);

router.post(
  "/owner/reset-password",
  ownerResetPassword
);


/* =========================================================
   CURRENT USER
========================================================= */

router.get(
  "/me",
  authMiddleware,
  getMe
);


module.exports = router;