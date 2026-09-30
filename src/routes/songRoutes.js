
const express = require("express");


const {
  getAllSongs,
  getSongById,
  searchSongs,
  getSongsByMood,
  browseSongsForMood,
  addSongToMood,
  removeSongFromMood,
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


/* =========================================================
   GET ALL SONGS
========================================================= */

router.get(
  "/",
  optionalAuthMiddleware,
  getAllSongs
);


/* =========================================================
   SEARCH SONGS
========================================================= */

router.get(
  "/search",
  optionalAuthMiddleware,
  searchSongs
);


/* =========================================================
   AVAILABLE MOODS
========================================================= */

router.get(
  "/moods",
  optionalAuthMiddleware,
  getAvailableMoods
);


/* =========================================================
   GET SONGS BY MOOD
========================================================= */

router.get(
  "/mood/:mood",
  optionalAuthMiddleware,
  getSongsByMood
);


/* =========================================================
   BROWSE ALL SONGS FOR A MOOD

   Example:

   /api/songs/mood/worship/browse

========================================================= */

router.get(
  "/mood/:mood/browse",
  optionalAuthMiddleware,
  browseSongsForMood
);


/* =========================================================
   ADD SONG TO MOOD

   POST

   /api/songs/:id/mood

   Body:

   {
     "mood": "worship"
   }

========================================================= */

router.post(
  "/:id/mood",
  optionalAuthMiddleware,
  addSongToMood
);


/* =========================================================
   REMOVE SONG FROM MOOD

   DELETE

   /api/songs/:id/mood/worship

========================================================= */

router.delete(
  "/:id/mood/:mood",
  optionalAuthMiddleware,
  removeSongFromMood
);


/* =========================================================
   GET ONE SONG

   KEEP THIS LAST
========================================================= */

router.get(
  "/:id",
  optionalAuthMiddleware,
  getSongById
);


module.exports = router;

