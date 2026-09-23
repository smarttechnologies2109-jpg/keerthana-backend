const Razorpay =
  require("razorpay");

const crypto =
  require("crypto");

const pool =
  require("../config/db");


/* =========================================================
   CALCULATE SUBSCRIPTION EXPIRY

   RULE:

   No active Premium:
   today + plan duration

   Existing active Premium:
   current expires_at + plan duration
========================================================= */

const calculateSubscriptionExpiry = (
  currentSubscription,
  durationDays
) => {

  const days =
    Number(durationDays);


  if (
    !Number.isInteger(days) ||
    days <= 0
  ) {

    throw new Error(
      "Invalid subscription duration"
    );

  }


  const now =
    new Date();


  let baseDate =
    now;


  /* =====================================
     EXISTING ACTIVE SUBSCRIPTION

     If Premium is still active,
     preserve remaining paid days.
  ===================================== */

  if (
    currentSubscription &&
    currentSubscription.status ===
      "active" &&
    currentSubscription.expires_at
  ) {

    const currentExpiry =
      new Date(
        currentSubscription.expires_at
      );


    if (
      !Number.isNaN(
        currentExpiry.getTime()
      ) &&
      currentExpiry > now
    ) {

      baseDate =
        currentExpiry;

    }

  }


  /* =====================================
     ADD PLAN DURATION
  ===================================== */

  const expiresAt =
    new Date(
      baseDate
    );


  expiresAt.setUTCDate(
    expiresAt.getUTCDate() +
    days
  );


  return {

    startedAt:
      now,

    expiresAt,

    extendedFrom:
      baseDate,

  };

};


/* =========================================================
   RAZORPAY INSTANCE
========================================================= */

const razorpay =
  new Razorpay({

    key_id:
      process.env.RAZORPAY_KEY_ID,

    key_secret:
      process.env.RAZORPAY_KEY_SECRET,

  });


/* =========================================================
   CREATE PAYMENT ORDER

   POST /api/payments/create-order

   BODY:
   {
     "plan_id": 2
   }
========================================================= */

const createPaymentOrder =
  async (
    req,
    res
  ) => {

    try {

      /* =====================================
         AUTH USER
      ===================================== */

      const userId =
        req.user?.id;


      if (!userId) {

        return res
          .status(401)
          .json({

            success: false,

            message:
              "Authentication required",

          });

      }


      /* =====================================
         GET PLAN
      ===================================== */

      const {
        plan_id,
      } = req.body;


      const planId =
        Number(plan_id);


      if (
        !Number.isInteger(planId) ||
        planId <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Valid subscription plan is required",

          });

      }


      /* =====================================
         GET PLAN FROM DATABASE
      ===================================== */

      const planResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            display_name,
            price,
            duration_days,
            ad_free,
            is_active

          FROM subscription_plans

          WHERE id = $1
          `,
          [
            planId,
          ]
        );


      if (
        planResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Subscription plan not found",

          });

      }


      const plan =
        planResult.rows[0];


      /* =====================================
         PLAN ACTIVE CHECK
      ===================================== */

      if (!plan.is_active) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "This subscription plan is not available",

          });

      }


      /* =====================================
         FREE PLAN CANNOT BE PURCHASED
      ===================================== */

      if (
        plan.name === "free" ||
        Number(plan.price) <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Free plan does not require payment",

          });

      }


      /* =====================================
         PRICE
      ===================================== */

      const price =
        Number(
          plan.price
        );


      if (
        !Number.isFinite(price) ||
        price <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid subscription price",

          });

      }


      /*
        Razorpay expects paise.

        ₹99 = 9900
      */

      const amount =
        Math.round(
          price * 100
        );


      /* =====================================
         CREATE RECEIPT
      ===================================== */

      const receipt =
        `k_${userId}_${Date.now()}`;


      /* =====================================
         CREATE RAZORPAY ORDER
      ===================================== */

      const order =
        await razorpay
          .orders
          .create({

            amount,

            currency:
              "INR",

            receipt,

            notes: {

              user_id:
                String(userId),

              plan_id:
                String(plan.id),

              plan_name:
                plan.name,

            },

          });


      /* =====================================
         SAVE ORDER TO DATABASE
      ===================================== */

      await pool.query(
        `
        INSERT INTO payments
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
        (
          $1,
          $2,
          'razorpay',
          $3,
          $4,
          $5,
          'created'
        )

        ON CONFLICT
          (provider_order_id)

        DO NOTHING
        `,
        [
          userId,
          plan.id,
          order.id,
          price,
          order.currency,
        ]
      );


      /* =====================================
         RESPONSE
      ===================================== */

      return res
        .status(201)
        .json({

          success: true,

          message:
            "Payment order created",

          order: {

            id:
              order.id,

            amount:
              order.amount,

            currency:
              order.currency,

            receipt:
              order.receipt,

          },

          plan: {

            id:
              plan.id,

            name:
              plan.name,

            display_name:
              plan.display_name,

            price,

            duration_days:
              plan.duration_days,

          },

          /*
            Razorpay Key ID is safe
            to send to frontend.

            NEVER send:
            RAZORPAY_KEY_SECRET
          */

          key_id:
            process.env
              .RAZORPAY_KEY_ID,

        });


    } catch (error) {

      console.error(
        "Create payment order error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to create payment order",

        });

    }

  };


/* =========================================================
   VERIFY RAZORPAY PAYMENT

   POST /api/payments/verify

   BODY:
   {
     razorpay_order_id,
     razorpay_payment_id,
     razorpay_signature
   }
========================================================= */

const verifyPayment =
  async (
    req,
    res
  ) => {

    let client =
      null;


    try {

      /* =====================================
         AUTH USER
      ===================================== */

      const userId =
        req.user?.id;


      if (!userId) {

        return res
          .status(401)
          .json({

            success: false,

            message:
              "Authentication required",

          });

      }


      /* =====================================
         PAYMENT DATA FROM RAZORPAY
      ===================================== */

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;


      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Payment verification details are missing",

          });

      }


      /* =====================================
         FIND PAYMENT ORDER
      ===================================== */

      const paymentResult =
        await pool.query(
          `
          SELECT
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

          WHERE
            p.provider_order_id = $1
            AND
            p.user_id = $2
          `,
          [
            razorpay_order_id,
            userId,
          ]
        );


      if (
        paymentResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Payment order not found",

          });

      }


      const payment =
        paymentResult.rows[0];


      /* =====================================
         ALREADY VERIFIED

         Important:
         Never extend subscription twice
         for the same payment.
      ===================================== */

      if (
        payment.status ===
        "paid"
      ) {

        return res
          .status(200)
          .json({

            success: true,

            already_verified:
              true,

            message:
              "Payment already verified",

            subscription: {

              plan:
                payment.plan_name,

              display_name:
                payment.display_name,

              is_premium:
                true,

              ad_free:
                Boolean(
                  payment.ad_free
                ),

              status:
                "active",

            },

          });

      }


      /* =====================================
         VERIFY RAZORPAY SIGNATURE
      ===================================== */

      const signatureBody =
        `${razorpay_order_id}|${razorpay_payment_id}`;


      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env
              .RAZORPAY_KEY_SECRET
          )
          .update(
            signatureBody
          )
          .digest(
            "hex"
          );


      if (
        expectedSignature !==
        razorpay_signature
      ) {

        console.error(
          "Razorpay signature verification failed"
        );


        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid payment signature",

          });

      }


      /* =====================================
         PLAN DURATION
      ===================================== */

      const durationDays =
        Number(
          payment.duration_days
        );


      if (
        !Number.isInteger(
          durationDays
        ) ||
        durationDays <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid subscription duration",

          });

      }


      /* =====================================
         START DATABASE TRANSACTION
      ===================================== */

      client =
        await pool.connect();


      await client.query(
        "BEGIN"
      );


      /* =====================================
         LOCK PAYMENT ROW
      ===================================== */

      const lockedPaymentResult =
        await client.query(
          `
          SELECT
            id,
            status,
            provider_payment_id

          FROM payments

          WHERE id = $1

          FOR UPDATE
          `,
          [
            payment.id,
          ]
        );


      if (
        lockedPaymentResult
          .rows
          .length === 0
      ) {

        throw new Error(
          "Payment record not found during verification"
        );

      }


      const lockedPayment =
        lockedPaymentResult
          .rows[0];


      /* =====================================
         CONCURRENT DUPLICATE CHECK
      ===================================== */

      if (
        lockedPayment.status ===
        "paid"
      ) {

        await client.query(
          "COMMIT"
        );


        return res
          .status(200)
          .json({

            success: true,

            already_verified:
              true,

            message:
              "Payment already verified",

          });

      }


      /* =====================================
         PAYMENT ID CONSISTENCY
      ===================================== */

      if (
        lockedPayment
          .provider_payment_id &&
        lockedPayment
          .provider_payment_id !==
          razorpay_payment_id
      ) {

        throw new Error(
          "Payment ID does not match existing payment record"
        );

      }


      /* =====================================
         FIND EXISTING SUBSCRIPTION
      ===================================== */

      const subscriptionResult =
        await client.query(
          `
          SELECT
            id,
            user_id,
            plan_id,
            status,
            provider,
            provider_payment_id,
            started_at,
            expires_at,
            cancelled_at

          FROM subscriptions

          WHERE user_id = $1

          ORDER BY id DESC

          LIMIT 1

          FOR UPDATE
          `,
          [
            userId,
          ]
        );


      /* =====================================
         CURRENT SUBSCRIPTION
      ===================================== */

      const currentSubscription =
        subscriptionResult.rows[0] ||
        null;


      /* =====================================
         CALCULATE NEW / RENEWAL EXPIRY
      ===================================== */

      const {
        startedAt,
        expiresAt,
        extendedFrom,
      } =
        calculateSubscriptionExpiry(
          currentSubscription,
          durationDays
        );


      console.log(
        "Subscription renewal calculation:",
        {

          userId,

          previousExpiry:
            currentSubscription
              ?.expires_at ||
            null,

          extendedFrom,

          newExpiry:
            expiresAt,

          durationDays,

        }
      );


      /* =====================================
         MARK PAYMENT AS PAID
      ===================================== */

      await client.query(
        `
        UPDATE payments

        SET
          provider_payment_id = $1,

          status = 'paid',

          paid_at =
            CURRENT_TIMESTAMP

        WHERE id = $2
        `,
        [
          razorpay_payment_id,
          payment.id,
        ]
      );


      /* =====================================
         UPDATE EXISTING SUBSCRIPTION
      ===================================== */

      if (
        currentSubscription
      ) {

        await client.query(
          `
          UPDATE subscriptions

          SET
            plan_id = $1,

            status = 'active',

            provider = 'razorpay',

            provider_payment_id = $2,

            started_at = $3,

            expires_at = $4,

            cancelled_at = NULL,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = $5
          `,
          [
            payment.plan_id,
            razorpay_payment_id,
            startedAt,
            expiresAt,
            currentSubscription.id,
          ]
        );

      }


      /* =====================================
         CREATE FIRST SUBSCRIPTION
      ===================================== */

      else {

        await client.query(
          `
          INSERT INTO subscriptions
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
          (
            $1,
            $2,
            'active',
            'razorpay',
            $3,
            $4,
            $5,
            NULL,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          `,
          [
            userId,
            payment.plan_id,
            razorpay_payment_id,
            startedAt,
            expiresAt,
          ]
        );

      }


      /* =====================================
         COMMIT TRANSACTION
      ===================================== */

      await client.query(
        "COMMIT"
      );


      /* =====================================
         SUCCESS RESPONSE
      ===================================== */

      return res
        .status(200)
        .json({

          success: true,

          message:
            currentSubscription
              ? "Payment verified and Premium renewed"
              : "Payment verified and Premium activated",

          subscription: {

            plan:
              payment.plan_name,

            display_name:
              payment.display_name,

            is_premium:
              true,

            ad_free:
              Boolean(
                payment.ad_free
              ),

            status:
              "active",

            provider:
              "razorpay",

            started_at:
              startedAt,

            expires_at:
              expiresAt,

            renewed:
              Boolean(
                currentSubscription
              ),

          },

        });


    } catch (error) {

      /* =====================================
         ROLLBACK
      ===================================== */

      if (client) {

        try {

          await client.query(
            "ROLLBACK"
          );

        } catch (
          rollbackError
        ) {

          console.error(
            "Rollback error:",
            rollbackError
          );

        }

      }


      console.error(
        "Verify payment error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to verify payment",

          /*
            Development only.
            Remove error details before
            production deployment.
          */

          error:
            process.env
              .NODE_ENV ===
              "development"
              ? error.message
              : undefined,

        });


    } finally {

      if (client) {

        client.release();

      }

    }

  };


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createPaymentOrder,

  verifyPayment,

};