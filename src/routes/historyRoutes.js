const express =
  require("express");


const {
  recordPlay,
  updateProgress,
  getRecentlyPlayed,
  getContinueListening,
  getPopularSongs,
  clearHistory,
  removeHistoryItem,
} = require(
  "../controllers/historyController"
);


const {
  authMiddleware,
} = require(
  "../middleware/authMiddleware"
);


const router =
  express.Router();


/* =========================================================
   TEST HISTORY ROUTE

   GET /api/history/test
========================================================= */

router.get(
  "/test",

  (req, res) => {

    return res
      .status(200)
      .json({

        success: true,

        message:
          "History routes are working",

      });

  }
);


/* =========================================================
   POPULAR SONGS

   GET /api/history/popular
========================================================= */

router.get(
  "/popular",

  getPopularSongs
);


/* =========================================================
   MAIN HISTORY

   GET /api/history

   We use getRecentlyPlayed here because there is
   currently no separate getHistory controller.
========================================================= */

router.get(
  "/",

  authMiddleware,

  getRecentlyPlayed
);


/* =========================================================
   RECENTLY PLAYED

   GET /api/history/recent
========================================================= */

router.get(
  "/recent",

  authMiddleware,

  getRecentlyPlayed
);


/* =========================================================
   CONTINUE LISTENING

   GET /api/history/continue
========================================================= */

router.get(
  "/continue",

  authMiddleware,

  getContinueListening
);


/* =========================================================
   RECORD PLAY

   POST /api/history/play
========================================================= */

router.post(
  "/play",

  authMiddleware,

  recordPlay
);


/* =========================================================
   UPDATE LISTENING PROGRESS

   PATCH /api/history/:id/progress
========================================================= */

router.patch(
  "/:id/progress",

  authMiddleware,

  updateProgress
);


/* =========================================================
   CLEAR ALL USER HISTORY

   DELETE /api/history
========================================================= */

router.delete(
  "/",

  authMiddleware,

  clearHistory
);

/* =========================================================
   REMOVE ONE SONG FROM HISTORY

   DELETE /api/history/song/:songId
========================================================= */

router.delete(
  "/song/:songId",

  authMiddleware,

  removeHistoryItem
);
module.exports =
  router;