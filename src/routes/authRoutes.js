
const express = require("express");

const {
  register,
  login,
  adminLogin,
  getMe,
} = require("../controllers/authController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// NORMAL USER
// ==========================================

router.post("/register", register);

router.post("/login", login);


// ==========================================
// ADMIN
// ==========================================

router.post("/admin/login", adminLogin);


// ==========================================
// CURRENT USER / ADMIN
// ==========================================

router.get("/me", authMiddleware, getMe);


module.exports = router;

