
const crypto = require("crypto");
const pool = require("../config/db");

// ============================================
// CONFIGURATION
// ============================================

const REWARD_DURATION_MINUTES = 30;

const REWARDED_AD_UNIT_ID =
  process.env.ADMOB_REWARDED_AD_UNIT_ID;

// Google AdMob SSV public key endpoint
const ADMOB_PUBLIC_KEYS_URL =
  "https://www.gstatic.com/admob/reward/verifier-keys.json";

// Cache public keys for less than 24 hours
let cachedKeys = null;
let keysFetchedAt = 0;

const KEY_CACHE_DURATION = 12 * 60 * 60 * 1000;


// ============================================
// GET AUTHENTICATED USER ID
// ============================================

const getUserId = (req) => {
  const id = Number(req.user?.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return id;
};


// ============================================
// GET ADMOB PUBLIC KEYS
// ============================================

const getAdMobPublicKeys = async () => {
  const now = Date.now();

  if (
    cachedKeys &&
    now - keysFetchedAt < KEY_CACHE_DURATION
  ) {
    return cachedKeys;
  }

  const response = await fetch(ADMOB_PUBLIC_KEYS_URL);

  if (!response.ok) {
    throw new Error("Unable to fetch AdMob public keys.");
  }

  const data = await response.json();

  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error("AdMob public keys are unavailable.");
  }

  cachedKeys = data.keys;
  keysFetchedAt = now;

  return cachedKeys;
};


// ============================================
// VERIFY ADMOB SSV SIGNATURE
// ============================================

const verifyAdMobSignature = async (req) => {
  const originalUrl = req.originalUrl;

  const signatureIndex = originalUrl.lastIndexOf("&signature=");

  if (signatureIndex === -1) {
    throw new Error("Missing AdMob signature.");
  }

  const signedData = originalUrl.slice(1, signatureIndex);

  const signature = req.query.signature;
  const keyId = Number(req.query.key_id);

  if (!signature || !Number.isSafeInteger(keyId)) {
    throw new Error("Invalid AdMob signature parameters.");
  }

  const keys = await getAdMobPublicKeys();

  const matchingKey = keys.find(
    (key) => Number(key.keyId) === keyId
  );

  if (!matchingKey?.pem) {
    throw new Error("AdMob verification key not found.");
  }

  const signatureBase64 = String(signature)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const signatureBuffer = Buffer.from(
    signatureBase64,
    "base64"
  );

  const isValid = crypto.verify(
    "sha256",
    Buffer.from(signedData, "utf8"),
    matchingKey.pem,
    signatureBuffer
  );

  if (!isValid) {
    throw new Error("AdMob signature verification failed.");
  }

  return true;
};


// ============================================
// 1. PREPARE REWARD SESSION
// ============================================

const prepareReward = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!REWARDED_AD_UNIT_ID) {
    return res.status(500).json({
      success: false,
      message: "Rewarded AdMob configuration missing.",
    });
  }

  try {
    const customData = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `
      INSERT INTO rewarded_ad_transactions (
        user_id,
        custom_data,
        ad_unit_id,
        verification_status
      )
      VALUES ($1, $2, $3, 'pending')
      `,
      [userId, customData, REWARDED_AD_UNIT_ID]
    );

    return res.status(201).json({
      success: true,
      message: "Reward session prepared.",
      customData,
      adUnitId: REWARDED_AD_UNIT_ID,
    });

  } catch (error) {
    console.error("Prepare reward error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to prepare reward.",
    });
  }
};


// ============================================
// 2. GET AD-FREE STATUS
// ============================================

const getAdFreeStatus = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        expires_at,
        GREATEST(
          0,
          CEIL(
            EXTRACT(EPOCH FROM (expires_at - NOW()))
            / 60
          )
        )::INTEGER AS remaining_minutes
      FROM user_ad_free_rewards
      WHERE user_id = $1
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        adFreeActive: false,
        remainingSeconds: 0,
        expiresAt: null,
      });
    }

    const reward = result.rows[0];

    const remainingSeconds = Math.max(
      0,
      Math.ceil(
        (new Date(reward.expires_at).getTime() - Date.now()) / 1000
      )
    );

    return res.json({
      success: true,
      adFreeActive: remainingSeconds > 0,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60),
      expiresAt: reward.expires_at,
    });

  } catch (error) {
    console.error("Get ad-free status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve reward status.",
    });
  }
};


// ============================================
// 3. ADMOB SSV CALLBACK
// ============================================

const handleAdMobSSV = async (req, res) => {
  const client = await pool.connect();

  try {
    // Verify Google's cryptographic signature first.
    await verifyAdMobSignature(req);

    const customData = req.query.custom_data;
    const transactionId = req.query.transaction_id;
    const adUnitId = req.query.ad_unit;
    const rewardAmount = Number(req.query.reward_amount);
    const rewardType = req.query.reward_item;
    const timestamp = Number(req.query.timestamp);

    if (
      typeof customData !== "string" ||
      !/^[a-f0-9]{64}$/.test(customData) ||
      typeof transactionId !== "string" ||
      !/^[a-f0-9]+$/i.test(transactionId) ||
      !Number.isSafeInteger(rewardAmount) ||
      rewardAmount <= 0 ||
      !Number.isSafeInteger(timestamp) ||
      timestamp <= 0
    ) {
      return res.status(400).send("Invalid reward parameters.");
    }

    if (adUnitId !== REWARDED_AD_UNIT_ID) {
      return res.status(403).send("Unexpected ad unit.");
    }

    // Reject callbacks with timestamps too far in the future
    // or older than 24 hours.
    const callbackAge = Date.now() - timestamp;

    if (
      callbackAge < -5 * 60 * 1000 ||
      callbackAge > 24 * 60 * 60 * 1000
    ) {
      return res.status(400).send("Expired reward callback.");
    }

    await client.query("BEGIN");

    // Lock the original prepared reward session.
    const transaction = await client.query(
      `
      SELECT id, user_id, ad_unit_id, verification_status
      FROM rewarded_ad_transactions
      WHERE custom_data = $1
      FOR UPDATE
      `,
      [customData]
    );

    if (transaction.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Reward session not found.");
    }

    const pending = transaction.rows[0];

    if (pending.ad_unit_id !== adUnitId) {
      await client.query("ROLLBACK");
      return res.status(403).send("Ad unit mismatch.");
    }

    if (pending.verification_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).send("Reward already processed.");
    }

    // Record the verified AdMob transaction.
    const updated = await client.query(
      `
      UPDATE rewarded_ad_transactions
      SET
        transaction_id = $1,
        reward_amount = $2,
        reward_type = $3,
        verification_status = 'verified',
        verified_at = NOW()
      WHERE id = $4
        AND verification_status = 'pending'
      RETURNING id
      `,
      [
        transactionId,
        rewardAmount,
        rewardType || "ad_free_30_minutes",
        pending.id,
      ]
    );

    if (updated.rowCount !== 1) {
      throw new Error("Unable to record verified transaction.");
    }

    // Extend existing access instead of losing remaining time.
    const rewardStart = await client.query(
      `
      SELECT GREATEST(
        NOW(),
        COALESCE(MAX(expires_at), NOW())
      ) AS start_time
      FROM user_ad_free_rewards
      WHERE user_id = $1
        AND expires_at > NOW()
      `,
      [pending.user_id]
    );

    const startedAt = rewardStart.rows[0].start_time;

    const reward = await client.query(
      `
      INSERT INTO user_ad_free_rewards (
        user_id,
        transaction_id,
        started_at,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $3 + INTERVAL '30 minutes'
      )
      RETURNING expires_at
      `,
      [pending.user_id, transactionId, startedAt]
    );

    await client.query("COMMIT");

    console.log(
      "KEERTHANA rewarded ad verified:",
      pending.user_id,
      transactionId
    );

    return res.status(200).send("Reward granted.");

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("AdMob SSV error:", error);

    return res.status(400).send("Reward verification failed.");

  } finally {
    client.release();
  }
};


// ============================================
// EXPORT CONTROLLERS
// ============================================

module.exports = {
  prepareReward,
  getAdFreeStatus,
  handleAdMobSSV,
};
