
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

// ==========================================
// GENERATE JWT TOKEN
// ==========================================
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

// ==========================================
// CHECK EMAIL
// ==========================================
const isEmail = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// ==========================================
// NORMALIZE MOBILE
// ==========================================
const normalizeMobile = (mobile) => {
  return String(mobile || "").replace(/\D/g, "");
};

// ==========================================
// USER RESPONSE
// ==========================================
const getUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email || null,
  mobile: user.mobile || null,
  role: user.role || "user",
  profile_image: user.profile_image || null,
});

// ==========================================
// NORMAL USER REGISTER
// ==========================================
const register = async (req, res) => {
  try {
    const { name, contact } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Name is required",
      });
    }

    if (
      !contact ||
      typeof contact !== "string" ||
      !contact.trim()
    ) {
      return res.status(400).json({
        message: "Email or phone number is required",
      });
    }

    const cleanName = name.trim();
    const cleanContact = contact.trim();

    let email = null;
    let mobile = null;

    // ------------------------------------------
    // REGISTER WITH EMAIL
    // ------------------------------------------
    if (isEmail(cleanContact)) {
      email = cleanContact.toLowerCase();
    }

    // ------------------------------------------
    // REGISTER WITH MOBILE
    // ------------------------------------------
    else {
      mobile = normalizeMobile(cleanContact);

      if (mobile.length < 7 || mobile.length > 15) {
        return res.status(400).json({
          message: "Please enter a valid phone number",
        });
      }
    }

    // ------------------------------------------
    // CHECK EXISTING USER
    // ------------------------------------------
    let existingUser;

    if (email) {
      existingUser = await pool.query(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [email]
      );
    } else {
      existingUser = await pool.query(
        `
        SELECT id
        FROM users
        WHERE mobile = $1
        LIMIT 1
        `,
        [mobile]
      );
    }

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message:
          "An account with this email or phone number already exists",
      });
    }

    // ------------------------------------------
    // CREATE USER
    // ------------------------------------------
    let result;

    if (email) {
      result = await pool.query(
        `
        INSERT INTO users
          (name, email, role)
        VALUES
          ($1, $2, 'user')
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          profile_image
        `,
        [cleanName, email]
      );
    } else {
      result = await pool.query(
        `
        INSERT INTO users
          (name, mobile, role)
        VALUES
          ($1, $2, 'user')
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          profile_image
        `,
        [cleanName, mobile]
      );
    }

    const user = result.rows[0];

    const token = generateToken(user.id);

    return res.status(201).json({
      message: "Account created successfully",
      token,
      user: getUserResponse(user),
    });
  } catch (error) {
    console.error("Register error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message:
          "An account with this email or phone number already exists",
      });
    }

    return res.status(500).json({
      message: "Unable to create account",
    });
  }
};

// ==========================================
// NORMAL USER LOGIN
// ==========================================
const login = async (req, res) => {
  try {
    const { contact } = req.body;

    if (
      !contact ||
      typeof contact !== "string" ||
      !contact.trim()
    ) {
      return res.status(400).json({
        message: "Email or phone number is required",
      });
    }

    const cleanContact = contact.trim();

    let result;

    // ------------------------------------------
    // LOGIN WITH EMAIL
    // ------------------------------------------
    if (isEmail(cleanContact)) {
      result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          mobile,
          role,
          profile_image
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [cleanContact]
      );
    }

    // ------------------------------------------
    // LOGIN WITH MOBILE
    // ------------------------------------------
    else {
      const mobile = normalizeMobile(cleanContact);

      if (mobile.length < 7 || mobile.length > 15) {
        return res.status(400).json({
          message:
            "Please enter a valid email or phone number",
        });
      }

      result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          mobile,
          role,
          profile_image
        FROM users
        WHERE mobile = $1
        LIMIT 1
        `,
        [mobile]
      );
    }

    // ------------------------------------------
    // USER NOT FOUND
    // ------------------------------------------
    if (result.rows.length === 0) {
      return res.status(404).json({
        message:
          "No account found with this email or phone number",
      });
    }

    const user = result.rows[0];

    const token = generateToken(user.id);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: getUserResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Unable to login",
    });
  }
};

// ==========================================
// ADMIN LOGIN
// ==========================================
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ------------------------------------------
    // VALIDATE EMAIL
    // ------------------------------------------
    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        message: "Admin email is required",
      });
    }

    // ------------------------------------------
    // VALIDATE PASSWORD
    // ------------------------------------------
    if (
      !password ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Admin password is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ------------------------------------------
    // FIND ADMIN
    // ------------------------------------------
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        mobile,
        password_hash,
        role,
        profile_image
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'admin'
      LIMIT 1
      `,
      [cleanEmail]
    );

    // ------------------------------------------
    // ADMIN NOT FOUND
    // ------------------------------------------
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    const admin = result.rows[0];

    // ------------------------------------------
    // CHECK PASSWORD EXISTS
    // ------------------------------------------
    if (!admin.password_hash) {
      return res.status(401).json({
        message: "Admin password is not configured",
      });
    }

    // ------------------------------------------
    // CHECK PASSWORD
    // ------------------------------------------
    const passwordMatch = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    // ------------------------------------------
    // CREATE ADMIN TOKEN
    // ------------------------------------------
    const token = generateToken(admin.id);

    return res.status(200).json({
      message: "Admin login successful",
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile || null,
        role: admin.role,
        profile_image: admin.profile_image || null,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      message: "Unable to login as admin",
    });
  }
};

// ==========================================
// GET CURRENT USER
// ==========================================
const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        mobile,
        role,
        profile_image
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      user: getUserResponse(user),
    });
  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      message: "Unable to get user information",
    });
  }
};

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  register,
  login,
  adminLogin,
  getMe,
};

