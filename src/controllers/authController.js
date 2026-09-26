const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = require("../config/db");
const transporter = require("../config/mailer");

// ==========================================
// GENERATE JWT TOKEN
// ==========================================

const generateToken = (userId, role) => {
  return jwt.sign(
    {
      id: userId,
      role: role,
    },
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

// ==========================================
// USER RESPONSE
// ==========================================

const getUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email || null,
  mobile: user.mobile || null,
  role: user.role || "USER",
  profile_image: user.profile_image || null,
  language: user.language || "Telugu",
});

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// ==========================================
// HASH OTP
// ==========================================

const hashOTP = (otp) => {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
};

// ==========================================
// NORMAL USER REGISTER
// ==========================================

// ==========================================
// NORMAL USER REGISTER
// ==========================================

const register = async (req, res) => {
  try {
    const {
      name,
      contact,
      language,
    } = req.body;

    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
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

    if (
      !language ||
      typeof language !== "string" ||
      !language.trim()
    ) {
      return res.status(400).json({
        message: "Preferred language is required",
      });
    }

    const cleanName = name.trim();
    const cleanContact = contact.trim();
    const cleanLanguage = language.trim();

    const allowedLanguages = [
      "Telugu",
      "Hindi",
      "English",
      "Malayalam",
      "Kannada",
      "Tamil",
    ];

    if (!allowedLanguages.includes(cleanLanguage)) {
      return res.status(400).json({
        message: "Invalid preferred language",
      });
    }

    let email = null;
    let mobile = null;

    // ==========================================
    // REGISTER WITH EMAIL
    // ==========================================

    if (isEmail(cleanContact)) {
      email = cleanContact.toLowerCase();
    }

    // ==========================================
    // REGISTER WITH MOBILE
    // ==========================================

    else {
      mobile = normalizeMobile(cleanContact);

      if (
        mobile.length < 7 ||
        mobile.length > 15
      ) {
        return res.status(400).json({
          message: "Please enter a valid phone number",
        });
      }
    }

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

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

    // ==========================================
    // CREATE USER
    // ==========================================

    let result;

    if (email) {
      result = await pool.query(
        `
        INSERT INTO users
          (name, email, role, language)
        VALUES
          ($1, $2, 'USER', $3)
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          profile_image,
          language
        `,
        [
          cleanName,
          email,
          cleanLanguage,
        ]
      );
    } else {
      result = await pool.query(
        `
        INSERT INTO users
          (name, mobile, role, language)
        VALUES
          ($1, $2, 'USER', $3)
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          profile_image,
          language
        `,
        [
          cleanName,
          mobile,
          cleanLanguage,
        ]
      );
    }

    const user = result.rows[0];

    const token = generateToken(
      user.id,
      user.role
    );

    return res.status(201).json({
      message: "Account created successfully",
      token,
      user: getUserResponse(user),
    });

  } catch (error) {
    console.error(
      "Register error:",
      error
    );

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

    // ==========================================
    // LOGIN WITH EMAIL
    // ==========================================

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

    // ==========================================
    // LOGIN WITH MOBILE
    // ==========================================

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

    // ==========================================
    // USER NOT FOUND
    // ==========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        message:
          "No account found with this email or phone number",
      });
    }

    const user = result.rows[0];

  const token = generateToken(
  user.id,
  user.role
);

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

    // ==========================================
    // VALIDATE EMAIL
    // ==========================================

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        message: "Admin email is required",
      });
    }

    // ==========================================
    // VALIDATE PASSWORD
    // ==========================================

    if (
      !password ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Admin password is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ==========================================
    // FIND ADMIN
    // ==========================================

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
        AND role = 'ADMIN'
      LIMIT 1
      `,
      [cleanEmail]
    );

    // ==========================================
    // ADMIN NOT FOUND
    // ==========================================

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    const admin = result.rows[0];

    // ==========================================
    // CHECK PASSWORD EXISTS
    // ==========================================

    if (!admin.password_hash) {
      return res.status(401).json({
        message: "Admin password is not configured",
      });
    }

    // ==========================================
    // CHECK PASSWORD
    // ==========================================

    const passwordMatch = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    // ==========================================
    // CREATE ADMIN TOKEN
    // ==========================================

    const token = generateToken(
  admin.id,
  admin.role
);

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
// BUSINESS OWNER LOGIN
// ==========================================

const ownerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        password_hash,
        role,
        profile_image,
        mobile,
        created_at,
        updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'BUSINESS_OWNER'
      LIMIT 1
      `,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid owner email or password",
      });
    }

    const owner = result.rows[0];

    if (!owner.password_hash) {
      return res.status(401).json({
        success: false,
        message:
          "Business owner password is not configured",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      owner.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid owner email or password",
      });
    }

  const token = generateToken(
  owner.id,
  owner.role
);

    return res.status(200).json({
      success: true,
      message: "Business owner login successful",
      token,
      user: getUserResponse(owner),
    });

  } catch (error) {
    console.error("Owner Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during owner login",
    });
  }
};

// ==========================================
// BUSINESS OWNER FORGOT PASSWORD
// SEND OTP TO EMAIL
// ==========================================

const ownerForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // ==========================================
    // VALIDATE EMAIL
    // ==========================================

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ==========================================
    // FIND BUSINESS OWNER
    // ==========================================

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'BUSINESS_OWNER'
      LIMIT 1
      `,
      [cleanEmail]
    );

    // ==========================================
    // ACCOUNT NOT FOUND
    // ==========================================

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If a Business Owner account exists for this email, an OTP has been sent.",
      });
    }

    const owner = result.rows[0];

    // ==========================================
    // DELETE OLD OTP
    // ==========================================

    await pool.query(
      `
      DELETE FROM password_reset_otps
      WHERE user_id = $1
      `,
      [owner.id]
    );

    // ==========================================
    // GENERATE OTP
    // ==========================================

    const otp = generateOTP();

    // ==========================================
    // HASH OTP
    // ==========================================

    const otpHash = hashOTP(otp);

    // ==========================================
    // OTP EXPIRES IN 10 MINUTES
    // ==========================================

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // ==========================================
    // SAVE OTP
    // ==========================================

    await pool.query(
      `
      INSERT INTO password_reset_otps
      (
        user_id,
        otp_hash,
        expires_at,
        attempts,
        verified
      )
      VALUES
      ($1, $2, $3, 0, FALSE)
      `,
      [
        owner.id,
        otpHash,
        expiresAt,
      ]
    );

    // ==========================================
    // SEND OTP EMAIL
    // ==========================================

    await transporter.sendMail({
      from: `"Keerthana" <${process.env.EMAIL_USER}>`,

      to: owner.email,

      subject:
        "Keerthana Business Owner Password Reset OTP",

      // ========================================
      // PLAIN TEXT EMAIL
      // ========================================

      text: `
Hello ${owner.name || "Business Owner"},

We received a request to reset your Keerthana Business Owner password.

Your OTP is:

${otp}

This OTP is valid for 10 minutes.

If you did not request a password reset, please ignore this email.

Regards,
Keerthana
      `,

      // ========================================
      // HTML EMAIL
      // ========================================

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 30px;
          background: #f5f5f5;
        ">

          <div style="
            background: #ffffff;
            padding: 30px;
            border-radius: 12px;
          ">

            <h2 style="
              margin-top: 0;
              color: #222;
            ">
              Keerthana
            </h2>

            <p>
              Hello ${owner.name || "Business Owner"},
            </p>

            <p>
              We received a request to reset your
              Business Owner account password.
            </p>

            <p>
              Your password reset OTP is:
            </p>

            <div style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              text-align: center;
              padding: 20px;
              margin: 20px 0;
              background: #f1f1f1;
              border-radius: 8px;
            ">
              ${otp}
            </div>

            <p>
              This OTP will expire in
              <strong>10 minutes</strong>.
            </p>

            <p>
              If you did not request this password reset,
              you can safely ignore this email.
            </p>

            <p>
              Regards,<br />
              <strong>Keerthana</strong>
            </p>

          </div>

        </div>
      `,
    });

    // ==========================================
    // SUCCESS
    // ==========================================

    return res.status(200).json({
      success: true,
      message:
        "If a Business Owner account exists for this email, an OTP has been sent.",
    });

  } catch (error) {
    console.error(
      "Owner Forgot Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to send password reset OTP",
    });
  }
};
// ==========================================
// BUSINESS OWNER RESET PASSWORD
// ==========================================

const ownerResetPassword = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
    } = req.body;

    // ==========================================
    // VALIDATE EMAIL
    // ==========================================

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // ==========================================
    // VALIDATE PASSWORD
    // ==========================================

    if (
      !password ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    // ==========================================
    // CONFIRM PASSWORD
    // ==========================================

    if (
      !confirmPassword ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please confirm your new password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ==========================================
    // FIND BUSINESS OWNER
    // ==========================================

    const ownerResult = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'BUSINESS_OWNER'
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to reset password",
      });
    }

    const owner = ownerResult.rows[0];

    // ==========================================
    // FIND VERIFIED OTP
    // ==========================================

    const otpResult = await pool.query(
      `
      SELECT
        id,
        user_id,
        expires_at,
        verified
      FROM password_reset_otps
      WHERE user_id = $1
        AND verified = TRUE
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [owner.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Please verify the OTP before resetting your password",
      });
    }

    const resetOTP = otpResult.rows[0];

    // ==========================================
    // CHECK OTP EXPIRATION
    // ==========================================

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    // ==========================================
    // HASH NEW PASSWORD
    // ==========================================

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    // ==========================================
    // UPDATE PASSWORD
    // ==========================================

    await pool.query(
      `
      UPDATE users
      SET
        password_hash = $1,
        updated_at = NOW()
      WHERE id = $2
        AND role = 'BUSINESS_OWNER'
      `,
      [
        passwordHash,
        owner.id,
      ]
    );

    // ==========================================
    // DELETE USED OTP
    // ==========================================

    await pool.query(
      `
      DELETE FROM password_reset_otps
      WHERE id = $1
      `,
      [resetOTP.id]
    );

    // ==========================================
    // SUCCESS
    // ==========================================

    return res.status(200).json({
      success: true,
      message:
        "Business Owner password reset successfully",
    });

  } catch (error) {
    console.error(
      "Owner Reset Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to reset password",
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
      message:
        "Unable to get user information",
    });
  }
};


const ownerVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // ==========================================
    // VALIDATE EMAIL
    // ==========================================

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // ==========================================
    // VALIDATE OTP
    // ==========================================

    if (
      !otp ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit OTP",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOTP = otp.trim();

    // ==========================================
    // FIND BUSINESS OWNER
    // ==========================================

    const ownerResult = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'BUSINESS_OWNER'
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const owner = ownerResult.rows[0];

    // ==========================================
    // FIND LATEST OTP
    // ==========================================

    const otpResult = await pool.query(
      `
      SELECT
        id,
        user_id,
        otp_hash,
        expires_at,
        attempts,
        verified
      FROM password_reset_otps
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [owner.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No password reset OTP found. Please request a new OTP.",
      });
    }

    const resetOTP = otpResult.rows[0];

    // ==========================================
    // ALREADY VERIFIED
    // ==========================================

    if (resetOTP.verified) {
      return res.status(400).json({
        success: false,
        message:
          "This OTP has already been verified. Please continue with password reset.",
      });
    }

    // ==========================================
    // MAXIMUM ATTEMPTS
    // ==========================================

    if (resetOTP.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    // ==========================================
    // CHECK EXPIRATION
    // ==========================================

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    // ==========================================
    // HASH ENTERED OTP
    // ==========================================

    const enteredOTPHash = hashOTP(cleanOTP);

    // ==========================================
    // CHECK OTP
    // ==========================================

    if (enteredOTPHash !== resetOTP.otp_hash) {
      await pool.query(
        `
        UPDATE password_reset_otps
        SET attempts = attempts + 1
        WHERE id = $1
        `,
        [resetOTP.id]
      );

      const remainingAttempts =
        4 - resetOTP.attempts;

      return res.status(400).json({
        success: false,
        message:
          remainingAttempts > 0
            ? `Incorrect OTP. ${remainingAttempts} attempt${
                remainingAttempts === 1 ? "" : "s"
              } remaining.`
            : "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    // ==========================================
    // OTP IS CORRECT
    // ==========================================

    await pool.query(
      `
      UPDATE password_reset_otps
      SET
        verified = TRUE
      WHERE id = $1
      `,
      [resetOTP.id]
    );

    // ==========================================
    // SUCCESS
    // ==========================================

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error) {
    console.error(
      "Owner Verify OTP Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
    });
  }
};
const adminForgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Please enter your admin email.",
      });
    }

    /* =====================================================
       FIND ADMIN
    ===================================================== */

    const result = await pool.query(
      `
      SELECT id, name, email, role
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'ADMIN'
      LIMIT 1
      `,
      [email]
    );

    /*
      Do not reveal whether an email exists.
    */

    if (result.rows.length === 0) {
      return res.status(200).json({
        message:
          "If an admin account exists for this email, an OTP has been sent.",
      });
    }

    const admin = result.rows[0];

    /* =====================================================
       DELETE OLD OTPs
    ===================================================== */

    await pool.query(
      `
      DELETE FROM password_reset_otps
      WHERE user_id = $1
      `,
      [admin.id]
    );

    /* =====================================================
       GENERATE OTP
    ===================================================== */

    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    const otpHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    /* =====================================================
       OTP EXPIRY - 10 MINUTES
    ===================================================== */

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    /* =====================================================
       SAVE OTP
    ===================================================== */

    await pool.query(
      `
      INSERT INTO password_reset_otps
      (
        user_id,
        otp_hash,
        expires_at,
        attempts,
        verified
      )
      VALUES
      ($1, $2, $3, 0, FALSE)
      `,
      [
        admin.id,
        otpHash,
        expiresAt,
      ]
    );

    /* =====================================================
       SEND EMAIL
    ===================================================== */

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject:
        "Keerthana Admin Password Reset OTP",

      text:
        `Your Keerthana Admin password reset OTP is: ${otp}\n\n` +
        `This OTP is valid for 10 minutes.\n\n` +
        `If you did not request a password reset, please ignore this email.`,

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: auto;
          padding: 30px;
          background: #f8fafc;
        ">

          <div style="
            background: #ffffff;
            padding: 30px;
            border-radius: 12px;
            border: 1px solid #e5e7eb;
          ">

            <h2 style="
              color: #111827;
              margin-top: 0;
            ">
              Keerthana Admin Password Reset
            </h2>

            <p style="
              color: #4b5563;
              font-size: 15px;
            ">
              You requested to reset your admin password.
            </p>

            <p style="
              color: #4b5563;
              font-size: 15px;
            ">
              Your verification OTP is:
            </p>

            <div style="
              text-align: center;
              margin: 25px 0;
            ">

              <span style="
                display: inline-block;
                padding: 14px 28px;
                background: #4f46e5;
                color: #ffffff;
                border-radius: 10px;
                font-size: 30px;
                font-weight: bold;
                letter-spacing: 8px;
              ">
                ${otp}
              </span>

            </div>

            <p style="
              color: #6b7280;
              font-size: 14px;
            ">
              This OTP is valid for 10 minutes.
            </p>

            <p style="
              color: #6b7280;
              font-size: 14px;
            ">
              If you did not request this password reset,
              please ignore this email.
            </p>

            <hr style="
              border: none;
              border-top: 1px solid #e5e7eb;
              margin: 25px 0;
            ">

            <p style="
              color: #9ca3af;
              font-size: 12px;
              text-align: center;
            ">
              Keerthana Admin Panel
            </p>

          </div>

        </div>
      `,
    });

    return res.status(200).json({
      message:
        "If an admin account exists for this email, an OTP has been sent.",
    });

  } catch (error) {
    console.error(
      "Admin forgot password error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to process password reset request.",
    });
  }
};
const adminVerifyOTP = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const otp = String(req.body.otp || "")
      .trim();

    if (!email) {
      return res.status(400).json({
        message: "Admin email is required.",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "OTP must be a 6-digit number.",
      });
    }

    /* =====================================================
       FIND ADMIN
    ===================================================== */

    const userResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'ADMIN'
      LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    const adminId = userResult.rows[0].id;

    /* =====================================================
       GET LATEST OTP
    ===================================================== */

    const otpResult = await pool.query(
      `
      SELECT
        id,
        otp_hash,
        expires_at,
        attempts,
        verified
      FROM password_reset_otps
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [adminId]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        message:
          "OTP not found. Please request a new OTP.",
      });
    }

    const resetOTP = otpResult.rows[0];

    /* =====================================================
       ALREADY VERIFIED
    ===================================================== */

    if (resetOTP.verified) {
      return res.status(400).json({
        message:
          "This OTP has already been verified.",
      });
    }

    /* =====================================================
       MAX ATTEMPTS
    ===================================================== */

    if (resetOTP.attempts >= 5) {
      return res.status(400).json({
        message:
          "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    /* =====================================================
       CHECK EXPIRY
    ===================================================== */

    if (
      new Date(resetOTP.expires_at) <
      new Date()
    ) {
      return res.status(400).json({
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    /* =====================================================
       HASH ENTERED OTP
    ===================================================== */

    const enteredOTPHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    /* =====================================================
       CHECK OTP
    ===================================================== */

    if (
      enteredOTPHash !==
      resetOTP.otp_hash
    ) {
      await pool.query(
        `
        UPDATE password_reset_otps
        SET attempts = attempts + 1
        WHERE id = $1
        `,
        [resetOTP.id]
      );

      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    /* =====================================================
       VERIFY OTP
    ===================================================== */

    await pool.query(
      `
      UPDATE password_reset_otps
      SET verified = TRUE
      WHERE id = $1
      `,
      [resetOTP.id]
    );

    return res.status(200).json({
      message:
        "OTP verified successfully.",
    });

  } catch (error) {
    console.error(
      "Admin verify OTP error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to verify OTP.",
    });
  }
};
const adminResetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    const confirmPassword = String(
      req.body.confirmPassword || ""
    );

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!email) {
      return res.status(400).json({
        message: "Admin email is required.",
      });
    }

    if (!password) {
      return res.status(400).json({
        message: "Please enter a new password.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message:
          "Passwords do not match.",
      });
    }

    /* =====================================================
       FIND ADMIN
    ===================================================== */

    const userResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'ADMIN'
      LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        message:
          "Admin account not found.",
      });
    }

    const adminId = userResult.rows[0].id;

    /* =====================================================
       FIND VERIFIED OTP
    ===================================================== */

    const otpResult = await pool.query(
      `
      SELECT
        id,
        expires_at,
        verified
      FROM password_reset_otps
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [adminId]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        message:
          "Password reset verification not found.",
      });
    }

    const resetOTP = otpResult.rows[0];

    /* =====================================================
       CHECK VERIFIED
    ===================================================== */

    if (!resetOTP.verified) {
      return res.status(400).json({
        message:
          "Please verify the OTP first.",
      });
    }

    /* =====================================================
       CHECK EXPIRY
    ===================================================== */

    if (
      new Date(resetOTP.expires_at) <
      new Date()
    ) {
      return res.status(400).json({
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    /* =====================================================
       HASH PASSWORD
    ===================================================== */

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    /* =====================================================
       UPDATE ADMIN PASSWORD
    ===================================================== */

    await pool.query(
      `
      UPDATE users
      SET
        password_hash = $1,
        updated_at = NOW()
      WHERE id = $2
        AND role = 'ADMIN'
      `,
      [
        hashedPassword,
        adminId,
      ]
    );

    /* =====================================================
       DELETE USED OTP
    ===================================================== */

    await pool.query(
      `
      DELETE FROM password_reset_otps
      WHERE id = $1
      `,
      [resetOTP.id]
    );

    return res.status(200).json({
      message:
        "Admin password reset successfully.",
    });

  } catch (error) {
    console.error(
      "Admin reset password error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to reset admin password.",
    });
  }
};
// ==========================================
// EXPORTS
// ==========================================

module.exports = {
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
};