
const express = require("express");
const router = express.Router();

const {
  getMoodSongs,
  browseSongs,
  addSongToMood,
  removeSongFromMood,
} = require("../controllers/moodsController");

// GET /api/moods/:mood/songs
router.get("/:mood/songs", getMoodSongs);

// GET /api/moods/:mood/browse
router.get("/:mood/browse", browseSongs);

// POST /api/moods/songs/:id
router.post("/songs/:id", addSongToMood);

// DELETE /api/moods/songs/:id/:mood
router.delete("/songs/:id/:mood", removeSongFromMood);

module.exports = router;
