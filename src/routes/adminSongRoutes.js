const express =
  require("express");


const {
  getAdminSongs,
  getAdminSongById,
  createSong,
  updateSong,
  deleteSong,
} = require(
  "../controllers/adminSongController"
);


const {
  authMiddleware,
  adminOnly,
} = require(
  "../middleware/authMiddleware"
);


const upload =
  require(
    "../middleware/uploadMiddleware"
  );


const router =
  express.Router();


/* =========================================================
   GET ALL SONGS
========================================================= */

router.get(
  "/",
  authMiddleware,
  adminOnly,
  getAdminSongs
);


/* =========================================================
   GET ONE SONG
========================================================= */

router.get(
  "/:id",
  authMiddleware,
  adminOnly,
  getAdminSongById
);


/* =========================================================
   CREATE SONG
========================================================= */

router.post(
  "/",

  authMiddleware,

  adminOnly,

  upload.fields([
    {
      name: "audio",
      maxCount: 1,
    },
    {
      name: "cover",
      maxCount: 1,
    },
  ]),

  createSong
);


/* =========================================================
   UPDATE SONG
========================================================= */

router.put(
  "/:id",

  authMiddleware,

  adminOnly,

  upload.fields([
    {
      name: "audio",
      maxCount: 1,
    },
    {
      name: "cover",
      maxCount: 1,
    },
  ]),

  updateSong
);


/* =========================================================
   DELETE SONG
========================================================= */

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteSong
);


module.exports =
  router;