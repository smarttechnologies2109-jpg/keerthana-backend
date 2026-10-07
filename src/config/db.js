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

  return await signer.getAuthToken();
}

// =========================================================
// POSTGRESQL POOL
// =========================================================

const pool = new Pool({
  host,
  port,
  database,
  user,

  // Generate a fresh IAM authentication token
  // whenever PostgreSQL creates a new connection.
  password: async () => {
    return await getIamToken();
  },

  ssl: {
    rejectUnauthorized: false,
  },

  // Pool configuration
  max: 10,

  // Close unused connections after 30 seconds
  idleTimeoutMillis: 30000,

  // Don't wait indefinitely for a database connection
  connectionTimeoutMillis: 15000,

  // Recycle connections before the IAM token lifetime becomes an issue
  maxLifetimeSeconds: 600,

  // Keep TCP connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
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

// =========================================================
// EXPORT
// =========================================================

module.exports = pool;