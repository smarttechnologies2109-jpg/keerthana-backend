
const express = require("express");
const router = express.Router();

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const {
  getLikedSongs,
  likeSong,
  unlikeSong,
} = require("../controllers/likedSongController");

// Protect all liked-song routes.
router.use(authMiddleware);

// GET /api/liked-songs
router.get("/", getLikedSongs);

// POST /api/liked-songs
// Supports the frontend body: { song_id: 71 }
router.post("/", (req, res, next) => {
  const songId = req.body?.song_id;

  if (!songId || !Number.isInteger(Number(songId)) ||
      Number(songId) <= 0) {
    return res.status(400).json({
      message: "A valid song_id is required.",
    });
  }

  // Pass the ID to the existing controller.
  req.params.songId = String(songId);
  next();
}, likeSong);

// POST /api/liked-songs/71
// Retain compatibility with existing callers.
router.post("/:songId", likeSong);

// DELETE /api/liked-songs/71
router.delete("/:songId", unlikeSong);

module.exports = router;
