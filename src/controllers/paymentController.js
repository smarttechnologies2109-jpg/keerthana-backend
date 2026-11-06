
const crypto = require("crypto");
const pool = require("../config/db");

/* =========================================================
   CASHFREE CONFIGURATION
   Supports:
   CASHFREE_APP_ID / CASHFREE_SECRET_KEY
   CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET
========================================================= */

const CASHFREE_CLIENT_ID =
  process.env.CASHFREE_APP_ID ||
  process.env.CASHFREE_CLIENT_ID;

const CASHFREE_CLIENT_SECRET =
  process.env.CASHFREE_SECRET_KEY ||
  process.env.CASHFREE_CLIENT_SECRET;

const CASHFREE_ENV = String(
  process.env.CASHFREE_ENV || "sandbox"
)
  .trim()
  .toLowerCase();

const CASHFREE_API_VERSION =
  process.env.CASHFREE_API_VERSION || "2023-08-01";

function getCashfreeBaseUrl() {
  if (CASHFREE_ENV === "production") {
    return "https://api.cashfree.com/pg";
  }

  if (
    CASHFREE_ENV === "sandbox" ||
    CASHFREE_ENV === "test"
  ) {
    return "https://sandbox.cashfree.com/pg";
  }

  throw new Error(
    "Invalid CASHFREE_ENV. Use SANDBOX or PRODUCTION."
  );
}

const CASHFREE_BASE_URL = getCashfreeBaseUrl();

/* =========================================================
   CASHFREE API REQUEST
========================================================= */

async function cashfreeRequest(path, options = {}) {
  if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
    throw new Error(
      "Cashfree credentials are not configured."
    );
  }

  const response = await fetch(
    `${CASHFREE_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_API_VERSION,
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        ...(options.headers || {}),
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(
      "Cashfree API error:",
      response.status,
      data
    );

    throw new Error(
      `Cashfree payment request failed (${response.status}).`
    );
  }

  return data;
}

/* =========================================================
   HELPERS
========================================================= */

function addDays(date, days) {
  const result = new Date(date);

  result.setUTCDate(
    result.getUTCDate() + Number(days)
  );

  return result;
}

function amountsMatch(first, second) {
  return (
    Math.round(Number(first) * 100) ===
    Math.round(Number(second) * 100)
  );
}

function getPaymentEnvironment() {
  return CASHFREE_ENV === "production"
    ? "production"
    : "sandbox";
}

/*
  Normalize Indian mobile numbers.

  Accepted examples:
  9876543210
  +919876543210
  919876543210
  09876543210
*/
function normalizeIndianMobile(value) {
  let mobile = String(value || "").replace(/\D/g, "");

  if (mobile.length === 12 && mobile.startsWith("91")) {
    mobile = mobile.slice(2);
  } else if (
    mobile.length === 11 &&
    mobile.startsWith("0")
  ) {
    mobile = mobile.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return null;
  }

  return mobile;
}

/* =========================================================
   CREATE PAYMENT ORDER

   POST /api/payments/create-order

   Frontend sends:
   {
     "plan_id": 2
   }

   Mobile number is required.
   Email address is optional.
========================================================= */

async function createPaymentOrder(req, res) {
  try {
    const userId = req.user?.id;
    const planId = Number(req.body?.plan_id);

    /* AUTHENTICATION */

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    /* VALIDATE PLAN ID */

    if (
      !Number.isInteger(planId) ||
      planId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid subscription plan is required.",
      });
    }

    /* VALIDATE CASHFREE CONFIGURATION */

    if (
      !CASHFREE_CLIENT_ID ||
      !CASHFREE_CLIENT_SECRET ||
      !process.env.FRONTEND_URL
    ) {
      console.error(
        "Cashfree configuration is incomplete."
      );

      return res.status(500).json({
        success: false,
        message: "Payment service is not configured.",
      });
    }

    /* GET SUBSCRIPTION PLAN */

    const planResult = await pool.query(
      `SELECT
         id,
         name,
         display_name,
         price,
         duration_days,
         ad_free,
         is_active
       FROM subscription_plans
       WHERE id = $1`,
      [planId]
    );

    const plan = planResult.rows[0];

    if (!plan || !plan.is_active) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan is unavailable.",
      });
    }

    const amount = Number(plan.price);

    if (
      plan.name === "free" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "This plan does not require payment.",
      });
    }

    if (
      !Number.isInteger(Number(plan.duration_days)) ||
      Number(plan.duration_days) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan duration.",
      });
    }

    /* GET USER DETAILS */

    const userResult = await pool.query(
      `SELECT
         id,
         name,
         email,
         mobile
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    /* MOBILE NUMBER IS REQUIRED */

    if (!String(user.mobile || "").trim()) {
      return res.status(400).json({
        success: false,
        code: "MOBILE_REQUIRED",
        message:
          "Please add your mobile number to continue with your Premium subscription. Email is optional.",
      });
    }

    /* VALIDATE AND NORMALIZE INDIAN MOBILE */

    const customerPhone = normalizeIndianMobile(
      user.mobile
    );

    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        code: "INVALID_MOBILE",
        message:
          "Please enter a valid 10-digit Indian mobile number.",
      });
    }

    /* GENERATE UNIQUE ORDER ID */

    const orderId =
      `keerthana_${Date.now()}_${crypto
        .randomBytes(4)
        .toString("hex")}`;

    /* CASHFREE RETURN URL */

    const frontendUrl =
      process.env.FRONTEND_URL.replace(/\/+$/, "");

    const returnUrl =
      `${frontendUrl}/premium?cashfree_order_id={order_id}`;

    /* CUSTOMER DETAILS
       Email is included only when available.
    */

    const customerDetails = {
      customer_id: `user_${user.id}`,

      customer_name: String(
        user.name || "KEERTHANA User"
      )
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .slice(0, 100),

      customer_phone: customerPhone,

      ...(user.email && String(user.email).trim()
        ? {
            customer_email: String(user.email).trim(),
          }
        : {}),
    };

    /* CREATE ORDER WITH CASHFREE */

    const cashfreeOrder = await cashfreeRequest(
      "/orders",
      {
        method: "POST",

        body: JSON.stringify({
          order_id: orderId,

          order_amount: Number(amount.toFixed(2)),

          order_currency: "INR",

          customer_details: customerDetails,

          order_meta: {
            return_url: returnUrl,
          },

          order_note: `KEERTHANA ${plan.display_name}`,
        }),
      }
    );

    if (
      !cashfreeOrder.order_id ||
      !cashfreeOrder.payment_session_id
    ) {
      console.error(
        "Invalid Cashfree order response:",
        cashfreeOrder
      );

      throw new Error(
        "Cashfree did not return a valid payment session."
      );
    }

    /* SAVE ORDER IN EXISTING PAYMENTS TABLE */

    await pool.query(
      `INSERT INTO payments
         (
           user_id,
           plan_id,
           provider,
           provider_order_id,
           amount,
           currency,
           status
         )
       VALUES
         ($1, $2, 'cashfree', $3, $4, 'INR', 'created')
       ON CONFLICT (provider_order_id)
       DO NOTHING`,
      [
        userId,
        plan.id,
        orderId,
        amount,
      ]
    );

    /* SEND CHECKOUT DETAILS TO FRONTEND */

    return res.status(201).json({
      success: true,

      order_id: cashfreeOrder.order_id,

      payment_session_id:
        cashfreeOrder.payment_session_id,

      environment: getPaymentEnvironment(),

      plan: {
        id: plan.id,
        name: plan.name,
        display_name: plan.display_name,
        price: amount,
        duration_days: plan.duration_days,
      },
    });
  } catch (error) {
    console.error(
      "Cashfree create order error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create payment order.",
    });
  }
}

/* =========================================================
   VERIFY CASHFREE PAYMENT

   POST /api/payments/verify

   Frontend sends:
   {
     "order_id": "keerthana_..."
   }

   Premium is activated only after server-side
   confirmation from Cashfree.
========================================================= */

async function verifyPayment(req, res) {
  const userId = req.user?.id;

  const orderId = String(
    req.body?.order_id || ""
  ).trim();

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (
    !/^keerthana_[a-zA-Z0-9_-]{5,80}$/.test(orderId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment order.",
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    /* FIND USER'S CASHFREE PAYMENT ORDER */

    const result = await client.query(
      `SELECT
         p.id,
         p.user_id,
         p.plan_id,
         p.provider_order_id,
         p.provider_payment_id,
         p.amount,
         p.currency,
         p.status,
         sp.name AS plan_name,
         sp.display_name,
         sp.duration_days,
         sp.ad_free
       FROM payments p
       JOIN subscription_plans sp
         ON sp.id = p.plan_id
       WHERE p.provider_order_id = $1
         AND p.user_id = $2
         AND p.provider = 'cashfree'
       FOR UPDATE OF p`,
      [
        orderId,
        userId,
      ]
    );

    const payment = result.rows[0];

    if (!payment) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment order not found.",
      });
    }

    /* ALREADY VERIFIED */

    if (payment.status === "paid") {
      await client.query("COMMIT");

      return res.json({
        success: true,
        already_verified: true,
        message: "Payment already verified.",
      });
    }

    /* FETCH ORDER STATUS FROM CASHFREE */

    const cashfreeOrder = await cashfreeRequest(
      `/orders/${encodeURIComponent(orderId)}`
    );

    /* FETCH PAYMENT DETAILS FROM CASHFREE */

    const cashfreePayments = await cashfreeRequest(
      `/orders/${encodeURIComponent(orderId)}/payments`
    );

    const successfulPayment =
      Array.isArray(cashfreePayments)
        ? cashfreePayments.find(
            (item) =>
              item.payment_status === "SUCCESS"
          )
        : null;

    /* VALIDATE PAYMENT */

    const orderIsPaid =
      cashfreeOrder.order_status === "PAID";

    const paymentIsSuccessful =
      Boolean(successfulPayment);

    const amountIsCorrect = amountsMatch(
      cashfreeOrder.order_amount,
      payment.amount
    );

    const currencyIsCorrect =
      cashfreeOrder.order_currency === payment.currency;

    if (
      !orderIsPaid ||
      !paymentIsSuccessful ||
      !amountIsCorrect ||
      !currencyIsCorrect
    ) {
      await client.query("ROLLBACK");

      return res.status(402).json({
        success: false,
        message:
          "Payment is not confirmed yet. Please try again shortly.",
      });
    }

    /* VALIDATE SUBSCRIPTION DURATION */

    const durationDays =
      Number(payment.duration_days);

    if (
      !Number.isInteger(durationDays) ||
      durationDays <= 0
    ) {
      throw new Error(
        "Invalid subscription duration in database."
      );
    }

    const now = new Date();

    /* GET CURRENT SUBSCRIPTION */

    const currentResult = await client.query(
      `SELECT
         id,
         status,
         expires_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    const current =
      currentResult.rows[0] || null;

    let baseDate = now;

    if (
      current?.status === "active" &&
      current.expires_at &&
      new Date(current.expires_at) > now
    ) {
      baseDate = new Date(current.expires_at);
    }

    const expiresAt = addDays(
      baseDate,
      durationDays
    );

    const cashfreePaymentId = String(
      successfulPayment.cf_payment_id
    );

    /* UPDATE EXISTING PAYMENT RECORD */

    await client.query(
      `UPDATE payments
       SET provider_payment_id = $1,
           status = 'paid',
           paid_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [
        cashfreePaymentId,
        payment.id,
      ]
    );

    /* ACTIVATE OR UPDATE SUBSCRIPTION */

    if (current) {
      await client.query(
        `UPDATE subscriptions
         SET plan_id = $1,
             status = 'active',
             provider = 'cashfree',
             provider_payment_id = $2,
             started_at = $3,
             expires_at = $4,
             cancelled_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          payment.plan_id,
          cashfreePaymentId,
          now,
          expiresAt,
          current.id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO subscriptions
           (
             user_id,
             plan_id,
             status,
             provider,
             provider_payment_id,
             started_at,
             expires_at,
             cancelled_at,
             created_at,
             updated_at
           )
         VALUES
           ($1, $2, 'active', 'cashfree', $3, $4, $5,
            NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          payment.plan_id,
          cashfreePaymentId,
          now,
          expiresAt,
        ]
      );
    }

    /* COMMIT DATABASE TRANSACTION */

    await client.query("COMMIT");

    return res.json({
      success: true,

      message: current
        ? "Payment verified and Premium renewed."
        : "Payment verified and Premium activated.",

      subscription: {
        plan: payment.plan_name,
        display_name: payment.display_name,
        status: "active",
        is_premium: true,
        ad_free: Boolean(payment.ad_free),
        provider: "cashfree",
        started_at: now,
        expires_at: expiresAt,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Payment rollback error:",
          rollbackError
        );
      }
    }

    console.error(
      "Cashfree verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify payment. Please try again.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createPaymentOrder,
  verifyPayment,
};
