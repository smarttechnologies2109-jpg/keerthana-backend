
const express = require("express");
const router = express.Router();

const {
  getMoodSongs,
  browseSongs,
  addSongToMood,
  removeSongFromMood,
} = require("../controllers/moodsController");

// GET /api/moods/worship/songs
router.get("/:mood/songs", getMoodSongs);

// GET /api/moods/worship/browse
router.get("/:mood/browse", browseSongs);

// POST /api/moods/songs/123
router.post("/songs/:id", addSongToMood);

// DELETE /api/moods/songs/123/worship
router.delete("/songs/:id/:mood", removeSongFromMood);

module.exports = router;
