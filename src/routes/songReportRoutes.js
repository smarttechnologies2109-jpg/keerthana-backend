
const express = require("express");

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

const {
  createSongReport,
} = require("../controllers/songReportController");

const router = express.Router();

/*
  POST /api/song-reports

  Logged-in users can submit:
  - Incorrect lyrics
  - Incorrect audio
  - Incorrect song title
  - Missing lyrics
  - Other
*/
router.post(
  "/",
  authMiddleware,
  createSongReport
);

module.exports = router;
