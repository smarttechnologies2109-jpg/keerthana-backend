const crypto =
  require("crypto");


/* =========================================================
   RAZORPAY WEBHOOK

   Razorpay will call this endpoint when
   payment events happen.

   POST /api/webhooks/razorpay
========================================================= */

const razorpayWebhook =
  async (
    req,
    res
  ) => {

    try {

      /* =====================================
         GET WEBHOOK SIGNATURE
      ===================================== */

      const signature =
        req.headers[
          "x-razorpay-signature"
        ];


      if (!signature) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Webhook signature missing",

          });

      }


      /* =====================================
         WEBHOOK SECRET
      ===================================== */

      const webhookSecret =
        process.env
          .RAZORPAY_WEBHOOK_SECRET;


      if (!webhookSecret) {

        console.error(
          "RAZORPAY_WEBHOOK_SECRET is missing"
        );


        return res
          .status(500)
          .json({

            success: false,

            message:
              "Webhook configuration error",

          });

      }


      /* =====================================
         IMPORTANT

         Signature must be calculated from
         the RAW request body.

         We will configure raw body parsing
         in the next step.
      ===================================== */

      if (
        !Buffer.isBuffer(
          req.body
        )
      ) {

        console.error(
          "Razorpay webhook body is not a Buffer"
        );


        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid webhook body",

          });

      }


      /* =====================================
         CREATE EXPECTED SIGNATURE
      ===================================== */

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            webhookSecret
          )
          .update(
            req.body
          )
          .digest(
            "hex"
          );


      /* =====================================
         SAFE SIGNATURE COMPARISON
      ===================================== */

      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "utf8"
        );


      const receivedBuffer =
        Buffer.from(
          signature,
          "utf8"
        );


      const validSignature =
        expectedBuffer.length ===
          receivedBuffer.length &&

        crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        );


      if (!validSignature) {

        console.error(
          "Invalid Razorpay webhook signature"
        );


        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid webhook signature",

          });

      }


      /* =====================================
         CONVERT RAW BODY TO JSON
      ===================================== */

      let event;


      try {

        event =
          JSON.parse(
            req.body.toString(
              "utf8"
            )
          );

      } catch (error) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid webhook JSON",

          });

      }


      /* =====================================
         EVENT INFORMATION
      ===================================== */

      const eventName =
        event.event;


      console.log(
        "Razorpay webhook received:",
        eventName
      );


      /* =====================================
         FOR NOW ONLY LOG EVENTS

         In the next step we will handle:

         payment.captured
         payment.failed
      ===================================== */

      switch (eventName) {

        case "payment.captured":

          console.log(
            "Payment captured webhook received"
          );

          break;


        case "payment.failed":

          console.log(
            "Payment failed webhook received"
          );

          break;


        default:

          console.log(
            "Unhandled Razorpay event:",
            eventName
          );

      }


      /* =====================================
         ACKNOWLEDGE WEBHOOK
      ===================================== */

      return res
        .status(200)
        .json({

          success: true,

          message:
            "Webhook received",

        });


    } catch (error) {

      console.error(
        "Razorpay webhook error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Webhook processing failed",

        });

    }

  };


module.exports = {

  razorpayWebhook,

};