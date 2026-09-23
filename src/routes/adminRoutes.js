const express =
  require("express");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const adminMiddleware =
  require(
    "../middleware/adminMiddleware"
  );

const {
  getDashboard,
} = require(
  "../controllers/adminController"
);


const router =
  express.Router();


/* =========================================
   ADMIN DASHBOARD
========================================= */

router.get(
  "/dashboard",
  authMiddleware,
  adminMiddleware,
  getDashboard
);


module.exports =
  router;