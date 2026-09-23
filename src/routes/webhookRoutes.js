const express =
  require("express");

const {
  razorpayWebhook,
} =
  require(
    "../controllers/webhookController"
  );


const router =
  express.Router();


/* =========================================================
   RAZORPAY WEBHOOK

   POST /api/webhooks/razorpay

   IMPORTANT:
   Razorpay signature verification requires
   the ORIGINAL RAW request body.

   So this route uses express.raw()
   instead of express.json().
========================================================= */

router.post(
  "/razorpay",

  express.raw({
    type:
      "application/json",
  }),

  razorpayWebhook
);


module.exports =
  router;