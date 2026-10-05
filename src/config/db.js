const { Pool } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

require("dotenv").config();

const host = process.env.DB_HOST;
const port = Number(process.env.DB_PORT || 5432);
const database = process.env.DB_NAME;
const user = process.env.DB_USER;
const region = process.env.AWS_REGION || "ap-south-1";

// =========================================================
// AWS RDS IAM TOKEN
// =========================================================

async function getIamToken() {
  const signer = new Signer({
    hostname: host,
    port,
    username: user,
    region,
  });

  return signer.getAuthToken();
}

// =========================================================
// POSTGRESQL POOL
// =========================================================

const pool = new Pool({
  host,
  port,
  database,
  user,

  password: getIamToken,

  ssl: {
    rejectUnauthorized: false,
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

// =========================================================
// CONNECTION EVENTS
// =========================================================

pool.on("connect", () => {
  console.log("✅ Aurora PostgreSQL IAM connection established");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

module.exports = pool;