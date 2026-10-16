
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

const upload = require("../middleware/uploadMiddleware");

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
========================================================= */

router.put(
  "/reports/:id",
  authMiddleware,
  adminOnly,
  updateSongReportStatus
);

/* =========================================================
   DELETE SONG REPORT - ADMIN
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
   POST /api/admin/songs
========================================================= */

router.post(
  "/",
  authMiddleware,
  adminOnly,

  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),

  (req, res, next) => {
    console.log("CREATE SONG UPLOAD DEBUG:", {
      contentType: req.headers["content-type"],
      bodyFields: Object.keys(req.body || {}),

      // Mood debugging
      moods: req.body?.moods,
      moodsType: typeof req.body?.moods,

      fileFields: Object.keys(req.files || {}),
      audioCount: req.files?.audio?.length || 0,
      coverCount: req.files?.cover?.length || 0,
    });

    next();
  },

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
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
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
