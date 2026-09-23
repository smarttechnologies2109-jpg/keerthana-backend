const pool =
  require("../config/db");

/* =========================================================
   FREE SUBSCRIPTION RESPONSE
========================================================= */

const createFreeSubscription =
  (
    previousStatus = null
  ) => {

    return {

      id:
        null,


      plan_id:
        null,


      plan:
        "free",


      display_name:
        "KEERTHANA Free",


      price:
        0,


      duration_days:
        null,


      status:
        "active",


      provider:
        null,


      started_at:
        null,


      expires_at:
        null,


      is_premium:
        false,


      ad_free:
        false,


      previous_status:
        previousStatus,

    };

  };

/* =========================================================
   GET USER SUBSCRIPTION
========================================================= */

const getUserSubscription =
  async (userId) => {

    try {

      /* =====================================
         GET LATEST SUBSCRIPTION
      ===================================== */

      const result =
        await pool.query(
          `
          SELECT
            s.id,
            s.user_id,
            s.plan_id,
            s.status,
            s.provider,
            s.provider_payment_id,
            s.started_at,
            s.expires_at,
            s.cancelled_at,
            s.created_at,
            s.updated_at,

            sp.name AS plan,
            sp.display_name,
            sp.price,
            sp.duration_days,
            sp.ad_free

          FROM subscriptions s

          JOIN subscription_plans sp
            ON sp.id = s.plan_id

          WHERE s.user_id = $1

          ORDER BY
            s.created_at DESC

          LIMIT 1
          `,
          [
            userId,
          ]
        );


      /* =====================================
         NO SUBSCRIPTION
      ===================================== */

      if (
        result.rows.length === 0
      ) {

        return createFreeSubscription();

      }


      const subscription =
        result.rows[0];


      /* =====================================
         CHECK EXPIRY
      ===================================== */

      const now =
        new Date();


      const expiresAt =
        subscription.expires_at
          ? new Date(
              subscription.expires_at
            )
          : null;


      const hasExpired =
        expiresAt &&
        expiresAt <= now;


      /* =====================================
         EXPIRED SUBSCRIPTION
      ===================================== */

      if (hasExpired) {

        /*
          Update database only if it
          has not already been expired.
        */

        if (
          subscription.status !==
          "expired"
        ) {

          await pool.query(
            `
            UPDATE subscriptions

            SET
              status = 'expired',
              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = $1
            `,
            [
              subscription.id,
            ]
          );

        }


        return createFreeSubscription(
          "expired"
        );

      }


      /* =====================================
         CANCELLED SUBSCRIPTION
      ===================================== */

      if (
        subscription.status ===
        "cancelled"
      ) {

        return createFreeSubscription(
          "cancelled"
        );

      }


      /* =====================================
         NOT ACTIVE
      ===================================== */

      if (
        subscription.status !==
        "active"
      ) {

        return createFreeSubscription(
          subscription.status
        );

      }


      /* =====================================
         ACTIVE SUBSCRIPTION
      ===================================== */

      return {

        id:
          subscription.id,


        plan_id:
          subscription.plan_id,


        plan:
          subscription.plan,


        display_name:
          subscription.display_name,


        price:
          Number(
            subscription.price
          ),


        duration_days:
          subscription.duration_days,


        status:
          subscription.status,


        provider:
          subscription.provider,


        started_at:
          subscription.started_at,


        expires_at:
          subscription.expires_at,


        is_premium:
          subscription.plan !==
          "free",


        ad_free:
          Boolean(
            subscription.ad_free
          ),

      };


    } catch (error) {

      console.error(
        "Get user subscription error:",
        error
      );


      throw error;

    }

  };


/* =========================================================
   GET MY SUBSCRIPTION

   GET /api/subscriptions/me
========================================================= */

const getMySubscription =
  async (
    req,
    res
  ) => {

    try {

      if (!req.user?.id) {

        return res
          .status(401)
          .json({

            success: false,

            message:
              "Authentication required",

          });

      }


      const subscription =
        await getUserSubscription(
          req.user.id
        );


      return res
        .status(200)
        .json({

          success: true,

          subscription,

        });


    } catch (error) {

      console.error(
        "Get subscription error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to load subscription",

        });

    }

  };


/* =========================================================
   GET AVAILABLE PLANS

   GET /api/subscriptions/plans
========================================================= */

/* =========================================================
   GET AVAILABLE SUBSCRIPTION PLANS

   GET /api/subscriptions/plans
========================================================= */

const getPlans =
  async (
    req,
    res
  ) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            display_name,
            price,
            duration_days,
            ad_free

          FROM subscription_plans

          WHERE is_active = TRUE

          ORDER BY
            CASE
              WHEN name = 'free'
                THEN 1

              WHEN name = 'premium_monthly'
                THEN 2

              WHEN name = 'premium_yearly'
                THEN 3

              ELSE 4
            END,
            id ASC
          `
        );


      /* =====================================
         NORMALIZE DATABASE VALUES
      ===================================== */

      const plans =
        result.rows.map(
          (plan) => ({

            id:
              plan.id,

            name:
              plan.name,

            display_name:
              plan.display_name,

            price:
              Number(
                plan.price || 0
              ),

            duration_days:
              plan.duration_days,

            ad_free:
              Boolean(
                plan.ad_free
              ),

          })
        );


      return res
        .status(200)
        .json({

          success: true,

          plans,

        });


    } catch (error) {

      console.error(
        "Get subscription plans error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Unable to load subscription plans",

        });

    }

  };


  module.exports = {
     getUserSubscription,

  getMySubscription,

  

  getPlans,

  getUserSubscription,

};