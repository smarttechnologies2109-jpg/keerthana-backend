const express = require("express");

const {
  createMinistry,
  updateMinistry,
  deleteMinistry,
} = require("../controllers/adminMinistryController");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");


const router = express.Router();


/* ========================================
   ADMIN ROLE CHECK
======================================== */

const adminOnly = (req, res, next) => {

  if (!req.user) {

    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });

  }


  const role =
    String(req.user.role || "")
      .trim()
      .toUpperCase();


  console.log(
    "Admin ministry request role:",
    role
  );


  if (role !== "ADMIN") {

    console.log(
      "Admin ministry access denied:",
      req.user
    );

    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });

  }


  next();

};


/* ========================================
   CREATE MINISTRY
   POST /api/admin/ministries
======================================== */

router.post(
  "/",
  authMiddleware,
  adminOnly,
  createMinistry
);


/* ========================================
   UPDATE MINISTRY
   PUT /api/admin/ministries/:id
======================================== */

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  updateMinistry
);


/* ========================================
   DELETE MINISTRY
   DELETE /api/admin/ministries/:id
======================================== */

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteMinistry
);


module.exports = router;