const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../config/db");
const transporter = require("../config/mailer");

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_DAYS = 30;

const generateAccessToken = (userId, role) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

const generateRefreshToken = () =>
  crypto.randomBytes(64).toString("hex");

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const getRefreshTokenExpiry = () => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_DAYS);
  return expiry;
};

const createAuthSession = async (user, req) => {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = getRefreshTokenExpiry();

  const deviceInfo = String(
    req.headers["user-agent"] || "Unknown device"
  ).slice(0, 500);

  await pool.query(
    `INSERT INTO auth_sessions
      (user_id, refresh_token_hash, expires_at, device_info)
     VALUES ($1, $2, $3, $4)`,
    [user.id, refreshTokenHash, expiresAt, deviceInfo]
  );

  const accessToken = generateAccessToken(user.id, user.role);

  return { accessToken, refreshToken, expiresAt };
};

const isEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeMobile = (mobile) =>
  String(mobile || "").replace(/\D/g, "");

const getUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email || null,
  mobile: user.mobile || null,
  role: user.role || "USER",
  profile_image: user.profile_image || null,
  language: user.language || "Telugu",
});

const generateOTP = () =>
  crypto.randomInt(100000, 1000000).toString();

const hashOTP = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

/* =========================================================
   NORMAL USER REGISTER
========================================================= */

const register = async (req, res) => {
  try {
    const { name, contact, language } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
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

    if (isEmail(cleanContact)) {
      email = cleanContact.toLowerCase();
    } else {
      mobile = normalizeMobile(cleanContact);

      if (mobile.length < 7 || mobile.length > 15) {
        return res.status(400).json({
          message: "Please enter a valid phone number",
        });
      }
    }

    const existingUser = email
      ? await pool.query(
          `SELECT id FROM users
           WHERE LOWER(email) = LOWER($1)
           LIMIT 1`,
          [email]
        )
      : await pool.query(
          `SELECT id FROM users
           WHERE mobile = $1
           LIMIT 1`,
          [mobile]
        );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message:
          "An account with this email or phone number already exists",
      });
    }

    const result = email
      ? await pool.query(
          `INSERT INTO users
             (name, email, role, language)
           VALUES ($1, $2, 'USER', $3)
           RETURNING
             id, name, email, mobile, role, profile_image, language`,
          [cleanName, email, cleanLanguage]
        )
      : await pool.query(
          `INSERT INTO users
             (name, mobile, role, language)
           VALUES ($1, $2, 'USER', $3)
           RETURNING
             id, name, email, mobile, role, profile_image, language`,
          [cleanName, mobile, cleanLanguage]
        );

    const user = result.rows[0];
    const session = await createAuthSession(user, req);

    return res.status(201).json({
      message: "Account created successfully",
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
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

/* =========================================================
   NORMAL USER LOGIN
========================================================= */

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

    if (isEmail(cleanContact)) {
      result = await pool.query(
        `SELECT
           id, name, email, mobile, role, profile_image, language
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [cleanContact]
      );
    } else {
      const mobile = normalizeMobile(cleanContact);

      if (mobile.length < 7 || mobile.length > 15) {
        return res.status(400).json({
          message: "Please enter a valid email or phone number",
        });
      }

      result = await pool.query(
        `SELECT
           id, name, email, mobile, role, profile_image, language
         FROM users
         WHERE mobile = $1
         LIMIT 1`,
        [mobile]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message:
          "No account found with this email or phone number",
      });
    }

    const user = result.rows[0];
    const session = await createAuthSession(user, req);

    return res.status(200).json({
      message: "Login successful",
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: getUserResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Unable to login",
    });
  }
};

/* =========================================================
   ADMIN LOGIN
========================================================= */

const adminLogin = async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const password = req.body?.password;

    if (!email || !isEmail(email)) {
      return res.status(400).json({
        message: "A valid admin email is required",
      });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Admin password is required",
      });
    }

    const result = await pool.query(
      `SELECT
         id, name, email, mobile, password_hash,
         role, profile_image, language
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND UPPER(role) = 'ADMIN'
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    const admin = result.rows[0];

    if (!admin.password_hash) {
      return res.status(401).json({
        message: "Admin password is not configured",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid admin email or password",
      });
    }

    const session = await createAuthSession(admin, req);

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: getUserResponse(admin),
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      message: "Unable to login as admin",
    });
  }
};

/* =========================================================
   BUSINESS OWNER LOGIN
========================================================= */

const ownerLogin = async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const password = req.body?.password;

    if (!email || !isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid owner email is required",
      });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      `SELECT
         id, name, email, password_hash, role,
         profile_image, mobile, language
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND UPPER(role) = 'BUSINESS_OWNER'
       LIMIT 1`,
      [email]
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
        message: "Business owner password is not configured",
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

    const session = await createAuthSession(owner, req);

    return res.status(200).json({
      success: true,
      message: "Business owner login successful",
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: getUserResponse(owner),
    });
  } catch (error) {
    console.error("Owner login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during owner login",
    });
  }
};
/* =========================================================
   BUSINESS OWNER FORGOT PASSWORD
========================================================= */

const ownerForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

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

    const result = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'BUSINESS_OWNER'
       LIMIT 1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If a Business Owner account exists for this email, an OTP has been sent.",
      });
    }

    const owner = result.rows[0];

    await pool.query(
      `DELETE FROM password_reset_otps
       WHERE user_id = $1`,
      [owner.id]
    );

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_otps
         (user_id, otp_hash, expires_at, attempts, verified)
       VALUES ($1, $2, $3, 0, FALSE)`,
      [owner.id, otpHash, expiresAt]
    );

    await transporter.sendMail({
      from: `"Keerthana" <${process.env.EMAIL_USER}>`,
      to: owner.email,
      subject: "Keerthana Business Owner Password Reset OTP",
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
            <h2 style="margin-top: 0; color: #222;">
              Keerthana
            </h2>
            <p>Hello ${owner.name || "Business Owner"},</p>
            <p>
              We received a request to reset your
              Business Owner account password.
            </p>
            <p>Your password reset OTP is:</p>
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
              Regards,
              <strong>Keerthana</strong>
            </p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message:
        "If a Business Owner account exists for this email, an OTP has been sent.",
    });
  } catch (error) {
    console.error("Owner Forgot Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send password reset OTP",
    });
  }
};

/* =========================================================
   BUSINESS OWNER VERIFY OTP
========================================================= */

const ownerVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

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

    const ownerResult = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'BUSINESS_OWNER'
       LIMIT 1`,
      [cleanEmail]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const owner = ownerResult.rows[0];

    const otpResult = await pool.query(
      `SELECT
         id, user_id, otp_hash, expires_at, attempts, verified
       FROM password_reset_otps
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
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

    if (resetOTP.verified) {
      return res.status(400).json({
        success: false,
        message:
          "This OTP has already been verified. Please continue with password reset.",
      });
    }

    if (resetOTP.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    const enteredOTPHash = hashOTP(cleanOTP);

    if (enteredOTPHash !== resetOTP.otp_hash) {
      await pool.query(
        `UPDATE password_reset_otps
         SET attempts = attempts + 1
         WHERE id = $1`,
        [resetOTP.id]
      );

      const remainingAttempts = 4 - resetOTP.attempts;

      return res.status(400).json({
        success: false,
        message:
          remainingAttempts > 0
            ? `Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
            : "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    await pool.query(
      `UPDATE password_reset_otps
       SET verified = TRUE
       WHERE id = $1`,
      [resetOTP.id]
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Owner Verify OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
    });
  }
};

/* =========================================================
   BUSINESS OWNER RESET PASSWORD
========================================================= */

const ownerResetPassword = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
    } = req.body;

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
        message: "Password must be at least 6 characters",
      });
    }

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

    const ownerResult = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'BUSINESS_OWNER'
       LIMIT 1`,
      [cleanEmail]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to reset password",
      });
    }

    const owner = ownerResult.rows[0];

    const otpResult = await pool.query(
      `SELECT id, user_id, expires_at, verified
       FROM password_reset_otps
       WHERE user_id = $1
         AND verified = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
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

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = NOW()
       WHERE id = $2
         AND role = 'BUSINESS_OWNER'`,
      [passwordHash, owner.id]
    );

    // Revoke every existing owner session after password change.
    await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [owner.id]
    );

    await pool.query(
      `DELETE FROM password_reset_otps
       WHERE id = $1`,
      [resetOTP.id]
    );

    return res.status(200).json({
      success: true,
      message: "Business Owner password reset successfully",
    });
  } catch (error) {
    console.error("Owner Reset Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password",
    });
  }
};

/* =========================================================
   REFRESH AUTHENTICATION SESSION
========================================================= */

const refreshSession = async (req, res) => {
  const refreshToken = req.body?.refreshToken;

  if (
    !refreshToken ||
    typeof refreshToken !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Refresh token is required",
    });
  }

  try {
    const oldTokenHash = hashRefreshToken(refreshToken);
    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const expiresAt = getRefreshTokenExpiry();

    // Rotate the refresh token in one atomic database update.
    const result = await pool.query(
      `UPDATE auth_sessions
       SET refresh_token_hash = $1,
           expires_at = $2
       WHERE refresh_token_hash = $3
         AND expires_at > NOW()
         AND revoked_at IS NULL
       RETURNING user_id`,
      [newTokenHash, expiresAt, oldTokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message:
          "Refresh session expired or invalid. Please login again.",
      });
    }

    const userResult = await pool.query(
      `SELECT
         id, name, email, mobile, role, profile_image, language
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [result.rows[0].user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    const accessToken = generateAccessToken(user.id, user.role);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      token: accessToken,
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt,
      user: getUserResponse(user),
    });
  } catch (error) {
    console.error("Refresh session error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to refresh session",
    });
  }
};

/* =========================================================
   GET CURRENT USER
========================================================= */

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id, name, email, mobile, role, profile_image, language
       FROM users
       WHERE id = $1
       LIMIT 1`,
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
    console.error("Get current user error:", error);

    return res.status(500).json({
      message: "Unable to get user information",
    });
  }
};
/* =========================================================
   ADMIN FORGOT PASSWORD
========================================================= */

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

    const result = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'ADMIN'
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        message:
          "If an admin account exists for this email, an OTP has been sent.",
      });
    }

    const admin = result.rows[0];

    await pool.query(
      `DELETE FROM password_reset_otps
       WHERE user_id = $1`,
      [admin.id]
    );

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_otps
         (user_id, otp_hash, expires_at, attempts, verified)
       VALUES ($1, $2, $3, 0, FALSE)`,
      [admin.id, otpHash, expiresAt]
    );

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: "Keerthana Admin Password Reset OTP",
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
            <h2>Keerthana Admin</h2>
            <p>Your password reset OTP is:</p>
            <div style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              text-align: center;
              padding: 20px;
              margin: 20px 0;
              background: #f1f5f9;
              border-radius: 8px;
            ">
              ${otp}
            </div>
            <p>This OTP expires in 10 minutes.</p>
            <p>
              If you did not request this password reset,
              please ignore this email.
            </p>
            <p>Regards,<br />Keerthana</p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({
      message:
        "If an admin account exists for this email, an OTP has been sent.",
    });
  } catch (error) {
    console.error("Admin forgot password error:", error);

    return res.status(500).json({
      message: "Unable to send password reset OTP.",
    });
  }
};

/* =========================================================
   ADMIN VERIFY OTP
========================================================= */

const adminVerifyOTP = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const otp = String(req.body.otp || "").trim();

    if (!email) {
      return res.status(400).json({
        message: "Admin email is required.",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Please enter a valid 6-digit OTP.",
      });
    }

    const userResult = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'ADMIN'
       LIMIT 1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    const admin = userResult.rows[0];

    const otpResult = await pool.query(
      `SELECT
         id, user_id, otp_hash, expires_at, attempts, verified
       FROM password_reset_otps
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [admin.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        message:
          "Password reset OTP not found. Please request a new OTP.",
      });
    }

    const resetOTP = otpResult.rows[0];

    if (resetOTP.verified) {
      return res.status(400).json({
        message:
          "OTP already verified. Please continue with password reset.",
      });
    }

    if (resetOTP.attempts >= 5) {
      return res.status(429).json({
        message:
          "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    const enteredOTPHash = hashOTP(otp);

    if (enteredOTPHash !== resetOTP.otp_hash) {
      await pool.query(
        `UPDATE password_reset_otps
         SET attempts = attempts + 1
         WHERE id = $1`,
        [resetOTP.id]
      );

      const remainingAttempts = 4 - resetOTP.attempts;

      return res.status(400).json({
        message:
          remainingAttempts > 0
            ? `Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
            : "Too many incorrect OTP attempts. Please request a new OTP.",
      });
    }

    await pool.query(
      `UPDATE password_reset_otps
       SET verified = TRUE
       WHERE id = $1`,
      [resetOTP.id]
    );

    return res.status(200).json({
      message: "OTP verified successfully.",
    });
  } catch (error) {
    console.error("Admin verify OTP error:", error);

    return res.status(500).json({
      message: "Unable to verify OTP.",
    });
  }
};

/* =========================================================
   ADMIN RESET PASSWORD
========================================================= */

const adminResetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");
    const confirmPassword = String(
      req.body.confirmPassword || ""
    );

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
        message: "Password must be at least 6 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match.",
      });
    }

    const userResult = await pool.query(
      `SELECT id
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND role = 'ADMIN'
       LIMIT 1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        message: "Admin account not found.",
      });
    }

    const adminId = userResult.rows[0].id;

    const otpResult = await pool.query(
      `SELECT id, expires_at, verified
       FROM password_reset_otps
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [adminId]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        message: "Password reset verification not found.",
      });
    }

    const resetOTP = otpResult.rows[0];

    if (!resetOTP.verified) {
      return res.status(400).json({
        message: "Please verify the OTP first.",
      });
    }

    if (new Date(resetOTP.expires_at) < new Date()) {
      return res.status(400).json({
        message: "OTP has expired.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = NOW()
       WHERE id = $2
         AND role = 'ADMIN'`,
      [hashedPassword, adminId]
    );

    // Revoke every existing admin session after password change.
    await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [adminId]
    );

    await pool.query(
      `DELETE FROM password_reset_otps
       WHERE id = $1`,
      [resetOTP.id]
    );

    return res.status(200).json({
      message: "Admin password reset successfully.",
    });
  } catch (error) {
    console.error("Admin reset password error:", error);

    return res.status(500).json({
      message: "Unable to reset admin password.",
    });
  }
};
/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {
  // Normal user
  register,
  login,
  refreshSession,
  getMe,

  // Admin
  adminLogin,
  adminForgotPassword,
  adminVerifyOTP,
  adminResetPassword,

  // Business Owner
  ownerLogin,
  ownerForgotPassword,
  ownerVerifyOTP,
  ownerResetPassword,
};