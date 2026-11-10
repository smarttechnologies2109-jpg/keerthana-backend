
const express = require("express");

const {
  register,
  login,
  refreshSession,
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
   NORMAL USER AUTHENTICATION
========================================================= */

router.post("/register", register);

router.post("/login", login);

/* =========================================================
   REFRESH ACCESS TOKEN
========================================================= */

router.post("/refresh", refreshSession);

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

router.post("/admin/login", adminLogin);

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

router.post("/owner/login", ownerLogin);

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
   CURRENT AUTHENTICATED USER
========================================================= */

router.get(
  "/me",
  authMiddleware,
  getMe
);

module.exports = router;
