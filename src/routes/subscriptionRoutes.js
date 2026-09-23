const express =
  require("express");


/* =========================================================
   MIDDLEWARE
========================================================= */

const {
  authMiddleware,
} = require(
  "../middleware/authMiddleware"
);


/* =========================================================
   CONTROLLERS
========================================================= */

const {
  getMySubscription,
  getPlans,
} = require(
  "../controllers/subscriptionController"
);


/* =========================================================
   ROUTER
========================================================= */

const router =
  express.Router();


/* =========================================================
   GET AVAILABLE SUBSCRIPTION PLANS

   GET /api/subscriptions/plans

   Public route
========================================================= */

router.get(
  "/plans",
  getPlans
);


/* =========================================================
   GET CURRENT USER SUBSCRIPTION

   GET /api/subscriptions/me

   Login required
========================================================= */

router.get(
  "/me",
  authMiddleware,
  getMySubscription
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;