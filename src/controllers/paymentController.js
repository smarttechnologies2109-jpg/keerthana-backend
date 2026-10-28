
const crypto = require("crypto");
const pool = require("../config/db");

const API_VERSION =
  process.env.CASHFREE_API_VERSION || "2023-08-01";

const CASHFREE_BASE_URL =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

async function cashfreeRequest(path, options = {}) {
  const response = await fetch(`${CASHFREE_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_CLIENT_ID,
      "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Cashfree API error:", response.status, data);
    throw new Error("Cashfree payment service request failed");
  }

  return data;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result;
}

/*
 POST /api/payments/create-order
 Authenticated route
*/
async function createPaymentOrder(req, res) {
  try {
    const userId = req.user?.id;
    const planId = Number(req.body?.plan_id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid subscription plan is required",
      });
    }

    if (
      !process.env.CASHFREE_CLIENT_ID ||
      !process.env.CASHFREE_CLIENT_SECRET ||
      !process.env.FRONTEND_URL
    ) {
      return res.status(500).json({
        success: false,
        message: "Payment service is not configured",
      });
    }

    const planResult = await pool.query(
      `SELECT id, name, display_name, price, duration_days,
              ad_free, is_active
       FROM subscription_plans
       WHERE id = $1`,
      [planId]
    );

    const plan = planResult.rows[0];

    if (!plan || !plan.is_active) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan is unavailable",
      });
    }

    const amount = Number(plan.price);

    if (plan.name === "free" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "This plan does not require payment",
      });
    }

    // Read customer details from your own database.
    // Your schema uses "mobile", not "phone".
    const userResult = await pool.query(
      `SELECT id, name, email, mobile
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user?.email || !user?.mobile) {
      return res.status(400).json({
        success: false,
        message: "Please add your email and mobile number before payment",
      });
    }

    const customerPhone = String(user.mobile).replace(/\D/g, "");

    if (!/^\d{10}$/.test(customerPhone)) {
      return res.status(400).json({
        success: false,
        message: "A valid 10-digit Indian mobile number is required",
      });
    }

    const orderId =
      `keerthana_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const order = await cashfreeRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        order_id: orderId,
        order_amount: Number(amount.toFixed(2)),
        order_currency: "INR",
        customer_details: {
          customer_id: `user_${user.id}`,
          customer_name: String(user.name || "KEERTHANA User")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .slice(0, 100),
          customer_email: user.email,
          customer_phone: customerPhone,
        },
        order_meta: {
          return_url:
            `${process.env.FRONTEND_URL}/premium?cashfree_order_id={order_id}`,
        },
        order_note: `KEERTHANA ${plan.display_name}`,
      }),
    });

    // Save the order before returning checkout details.
    await pool.query(
      `INSERT INTO payments
         (user_id, plan_id, provider, provider_order_id,
          amount, currency, status)
       VALUES ($1, $2, 'cashfree', $3, $4, 'INR', 'created')
       ON CONFLICT (provider_order_id) DO NOTHING`,
      [userId, plan.id, orderId, amount]
    );

    return res.status(201).json({
      success: true,
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
      environment:
        process.env.CASHFREE_ENV === "production"
          ? "production"
          : "sandbox",
      plan: {
        id: plan.id,
        name: plan.name,
        display_name: plan.display_name,
        price: amount,
        duration_days: plan.duration_days,
      },
    });
  } catch (error) {
    console.error("Cashfree create order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create payment order",
    });
  }
}

/*
 POST /api/payments/verify
 Authenticated route

 The frontend cannot activate Premium directly.
 The backend fetches the order and payments from Cashfree.
*/
async function verifyPayment(req, res) {
  const userId = req.user?.id;
  const orderId = String(req.body?.order_id || "");

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (!/^keerthana_[a-zA-Z0-9_-]{5,80}$/.test(orderId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment order",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT p.id, p.user_id, p.plan_id, p.provider_order_id,
              p.provider_payment_id, p.amount, p.currency, p.status,
              sp.name AS plan_name, sp.display_name,
              sp.duration_days, sp.ad_free
       FROM payments p
       JOIN subscription_plans sp ON sp.id = p.plan_id
       WHERE p.provider_order_id = $1
         AND p.user_id = $2
         AND p.provider = 'cashfree'
       FOR UPDATE OF p`,
      [orderId, userId]
    );

    const payment = result.rows[0];

    if (!payment) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    if (payment.status === "paid") {
      await client.query("COMMIT");
      return res.json({
        success: true,
        already_verified: true,
        message: "Payment already verified",
      });
    }

    // Ask Cashfree for the actual order status.
    const order = await cashfreeRequest(
      `/orders/${encodeURIComponent(orderId)}`
    );

    const cashfreePayments = await cashfreeRequest(
      `/orders/${encodeURIComponent(orderId)}/payments`
    );

    const successfulPayment = Array.isArray(cashfreePayments)
      ? cashfreePayments.find(
          (item) => item.payment_status === "SUCCESS"
        )
      : null;

    if (
      order.order_status !== "PAID" ||
      !successfulPayment ||
      Number(order.order_amount) !== Number(payment.amount) ||
      order.order_currency !== payment.currency
    ) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        success: false,
        message: "Payment is not confirmed yet. Please try again shortly.",
      });
    }

    if (
      !Number.isInteger(Number(payment.duration_days)) ||
      Number(payment.duration_days) <= 0
    ) {
      throw new Error("Invalid subscription duration in database");
    }

    const now = new Date();

    const currentResult = await client.query(
      `SELECT id, status, expires_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    const current = currentResult.rows[0] || null;

    let baseDate = now;

    if (
      current?.status === "active" &&
      current.expires_at &&
      new Date(current.expires_at) > now
    ) {
      baseDate = new Date(current.expires_at);
    }

    const expiresAt = addDays(baseDate, payment.duration_days);

    await client.query(
      `UPDATE payments
       SET provider_payment_id = $1,
           status = 'paid',
           paid_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [String(successfulPayment.cf_payment_id), payment.id]
    );

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
          String(successfulPayment.cf_payment_id),
          now,
          expiresAt,
          current.id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO subscriptions
         (user_id, plan_id, status, provider, provider_payment_id,
          started_at, expires_at, cancelled_at, created_at, updated_at)
         VALUES ($1, $2, 'active', 'cashfree', $3, $4, $5,
                 NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          payment.plan_id,
          String(successfulPayment.cf_payment_id),
          now,
          expiresAt,
        ]
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: current
        ? "Payment verified and Premium renewed"
        : "Payment verified and Premium activated",
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
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Payment rollback error:", rollbackError);
    }

    console.error("Cashfree verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment. Please try again.",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  createPaymentOrder,
  verifyPayment,
};
