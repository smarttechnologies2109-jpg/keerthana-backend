
const express = require("express");

const {
  getAdminSongs,
  getAdminSongById,
  createSong,
  updateSong,
  deleteSong,
  getAdminSongReports,
  updateSongReportStatus,
  deleteSongReport,
} = require("../controllers/adminSongController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

const upload = require(
  "../middleware/uploadMiddleware"
);

const router = express.Router();


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
   GET ALL SONG REPORTS - ADMIN
========================================================= */

router.get(
  "/reports",
  authMiddleware,
  adminOnly,
  getAdminSongReports
);


/* =========================================================
   UPDATE SONG REPORT STATUS - ADMIN

   PUT /api/admin/songs/reports/:id

   Body:
   {
     "status": "pending"
   }

   Allowed:
   pending
   resolved
   rejected
========================================================= */

router.put(
  "/reports/:id",
  authMiddleware,
  adminOnly,
  updateSongReportStatus
);


/* =========================================================
   DELETE SONG REPORT - ADMIN

   DELETE /api/admin/songs/reports/:id
========================================================= */

router.delete(
  "/reports/:id",
  authMiddleware,
  adminOnly,
  deleteSongReport
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


module.exports = router;
