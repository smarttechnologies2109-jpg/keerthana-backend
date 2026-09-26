const express = require("express");

const {
  getMinistries,
  getMinistryById,
  getSongsByMinistry,
} = require("../controllers/ministryController");

const router = express.Router();


/* =========================================================
   GET ALL MINISTRIES
   GET /api/ministries
========================================================= */

router.get(
  "/",
  getMinistries
);


/* =========================================================
   GET SONGS BY MINISTRY
   GET /api/ministries/:id/songs
========================================================= */

router.get(
  "/:id/songs",
  getSongsByMinistry
);


/* =========================================================
   GET SINGLE MINISTRY
   GET /api/ministries/:id
========================================================= */

router.get(
  "/:id",
  getMinistryById
);


module.exports = router;