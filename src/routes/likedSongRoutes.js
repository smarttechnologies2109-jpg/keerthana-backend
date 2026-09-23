const express =
  require("express");

const router =
  express.Router();


/* =========================================
   MIDDLEWARE
========================================= */

const {
  authMiddleware,
} = require("../middleware/authMiddleware");


/* =========================================
   CONTROLLER
========================================= */

const {
  getLikedSongs,
  likeSong,
  unlikeSong,
} = require(
  "../controllers/likedSongController"
);


/* =========================================
   PROTECT ALL LIKED SONG ROUTES
========================================= */

router.use(
  authMiddleware
);


/* =========================================
   GET LIKED SONGS
========================================= */

router.get(
  "/",
  getLikedSongs
);


/* =========================================
   LIKE SONG
========================================= */

router.post(
  "/:songId",
  likeSong
);


/* =========================================
   UNLIKE SONG
========================================= */

router.delete(
  "/:songId",
  unlikeSong
);


module.exports =
  router;