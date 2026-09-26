require("dotenv").config({
  path: require("path").join(__dirname, "../.env"),
});

const bcrypt = require("bcryptjs");
const pool = require("./config/db");

const createBusinessOwner = async () => {
  try {
    const ownerId = 1;

    const email = process.env.BUSINESS_OWNER_EMAIL;
    const password = process.env.BUSINESS_OWNER_PASSWORD;

    if (!email || !password) {
      console.error(
        "❌ BUSINESS_OWNER_EMAIL or BUSINESS_OWNER_PASSWORD is missing in .env"
      );

      process.exit(1);
    }

    console.log("======================================");
    console.log(" Creating Business Owner");
    console.log("======================================");

    console.log("Email:", email);
    console.log("Owner ID:", ownerId);

    // ==========================================
    // CHECK USER
    // ==========================================

    const existingUser = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE id = $1
      `,
      [ownerId]
    );

    if (existingUser.rows.length === 0) {
      console.log("");
      console.log("❌ USER WITH ID 1 DOES NOT EXIST");
      console.log("");
      process.exit(1);
    }

    console.log("");
    console.log("Existing user:");
    console.log(existingUser.rows[0]);

    // ==========================================
    // HASH PASSWORD
    // ==========================================

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    console.log("");
    console.log("Password hash generated.");

    // ==========================================
    // UPDATE BUSINESS OWNER
    // ==========================================

    const result = await pool.query(
      `
      UPDATE users
      SET
        email = $1,
        password_hash = $2,
        role = 'BUSINESS_OWNER',
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        name,
        email,
        role,
        mobile,
        password_hash
      `,
      [
        email.toLowerCase(),
        passwordHash,
        ownerId,
      ]
    );

    if (result.rows.length === 0) {
      console.log("");
      console.log("❌ BUSINESS OWNER UPDATE FAILED");
      process.exit(1);
    }

    const owner = result.rows[0];

    // ==========================================
    // VERIFY PASSWORD
    // ==========================================

    const passwordCheck = await bcrypt.compare(
      password,
      owner.password_hash
    );

    console.log("");
    console.log(
      "Password verification:",
      passwordCheck
    );

    // ==========================================
    // FINAL RESULT
    // ==========================================

    console.log("");
    console.log("======================================");
    console.log(" BUSINESS OWNER CREATED SUCCESSFULLY");
    console.log("======================================");
    console.log("");
    console.log("ID:", owner.id);
    console.log("Name:", owner.name);
    console.log("Email:", owner.email);
    console.log("Role:", owner.role);
    console.log("Mobile:", owner.mobile);
    console.log("");
    console.log("Login Email:", email);
    console.log("Login Password: [FROM .env]");
    console.log("");
    console.log(
      "Password Check:",
      passwordCheck ? "PASS" : "FAILED"
    );
    console.log("");

    process.exit(0);

  } catch (error) {
    console.error("");
    console.error(
      "❌ Create Business Owner Error:"
    );
    console.error(error);
    console.error("");
    process.exit(1);
  }
};

createBusinessOwner();