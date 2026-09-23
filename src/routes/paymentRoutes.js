const express =
  require("express");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
  authMiddleware,
} =
  require(
    "../middleware/authMiddleware"
  );


/* =========================================================
   PAYMENT CONTROLLER
========================================================= */

const {
  createPaymentOrder,
  verifyPayment,
} =
  require(
    "../controllers/paymentController"
  );


const router =
  express.Router();


/* =========================================================
   DEBUG

   Remove this after everything works.
========================================================= */

console.log(
  "PAYMENT ROUTE DEBUG:",
  {
    authMiddleware:
      typeof authMiddleware,

    createPaymentOrder:
      typeof createPaymentOrder,

    verifyPayment:
      typeof verifyPayment,
  }
);


/* =========================================================
   CREATE RAZORPAY ORDER

   POST /api/payments/create-order
========================================================= */

router.post(
  "/create-order",
  authMiddleware,
  createPaymentOrder
);


/* =========================================================
   VERIFY RAZORPAY PAYMENT

   POST /api/payments/verify
========================================================= */

router.post(
  "/verify",
  authMiddleware,
  verifyPayment
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;