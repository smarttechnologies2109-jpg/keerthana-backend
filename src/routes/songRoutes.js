const express =
  require("express");

const {
  getAllSongs,
  getSongById,
  searchSongs,
  getSongsByMood,
  getAvailableMoods,
} = require(
  "../controllers/songController"
);


const router =
  express.Router();


/* ========================================
   GET ALL SONGS
======================================== */

router.get(
  "/",
  getAllSongs
);


/* ========================================
   SEARCH
======================================== */

router.get(
  "/search",
  searchSongs
);


/* ========================================
   GET AVAILABLE MOODS

   Example:
   GET /api/songs/moods
======================================== */

router.get(
  "/moods",
  getAvailableMoods
);


/* ========================================
   GET SONGS BY MOOD

   IMPORTANT:
   This MUST come before /:id

   Examples:

   /songs/mood/worship
   /songs/mood/praise
   /songs/mood/prayer
   /songs/mood/hope
   /songs/mood/peace
   /songs/mood/thanksgiving
======================================== */

router.get(
  "/mood/:mood",
  getSongsByMood
);


/* ========================================
   GET ONE SONG

   IMPORTANT:
   Keep this LAST
======================================== */

router.get(
  "/:id",
  getSongById
);


module.exports =
  router;