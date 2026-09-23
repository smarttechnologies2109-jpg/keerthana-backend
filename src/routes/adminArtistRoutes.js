const express = require("express");

const {
  getArtists,
  createArtist,
  updateArtist,
  deleteArtist,
} = require("../controllers/adminArtistController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

// IMPORTANT: your file is uploadMiddleware.js
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();


/* =========================================================
   GET ARTISTS
========================================================= */

router.get(
  "/",
  authMiddleware,
  adminOnly,
  getArtists
);


/* =========================================================
   CREATE ARTIST
   Upload field name = "cover"
========================================================= */

router.post(
  "/",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  createArtist
);


/* =========================================================
   UPDATE ARTIST
   Upload field name = "cover"
========================================================= */

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  updateArtist
);


/* =========================================================
   DELETE ARTIST
========================================================= */

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteArtist
);


module.exports = router;