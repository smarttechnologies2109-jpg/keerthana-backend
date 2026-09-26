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

const {
  optionalAuthMiddleware,
} = require(
  "../middleware/authMiddleware"
);


const router =
  express.Router();


/* ========================================
   GET ALL SONGS

   Logged-in USER:
   Only preferred-language songs

   Public user:
   Existing all-songs behavior
======================================== */

router.get(
  "/",
  optionalAuthMiddleware,
  getAllSongs
);


/* ========================================
   SEARCH

   Logged-in USER:
   Search only preferred-language songs

   Public user:
   Existing search behavior
======================================== */

router.get(
  "/search",
  optionalAuthMiddleware,
  searchSongs
);


/* ========================================
   GET AVAILABLE MOODS

   Logged-in USER:
   Mood counts for preferred language

   Public user:
   Existing mood behavior
======================================== */

router.get(
  "/moods",
  optionalAuthMiddleware,
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
  optionalAuthMiddleware,
  getSongsByMood
);


/* ========================================
   GET ONE SONG

   IMPORTANT:
   Keep this LAST

   Logged-in USER:
   Cannot access a song from another
   language.

   Public user:
   Existing behavior.
======================================== */

router.get(
  "/:id",
  optionalAuthMiddleware,
  getSongById
);


module.exports = router;