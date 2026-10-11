
const db = require("../config/db");

const ALLOWED_MOODS = [
  "worship",
  "praise",
  "prayer",
  "hope",
  "peace",
  "thanksgiving",
];

const isValidMood = (mood) =>
  ALLOWED_MOODS.includes(String(mood || "").toLowerCase());

const getMoodSongs = async (req, res) => {
  try {
    const mood = String(req.params.mood || "").toLowerCase();

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `SELECT s.*
       FROM songs s
       INNER JOIN song_moods sm ON sm.song_id = s.id
       WHERE LOWER(sm.mood) = $1
       ORDER BY s.title ASC`,
      [mood]
    );

    return res.json({ songs: result.rows });
  } catch (error) {
    console.error("Get mood songs error:", error);
    return res.status(500).json({ message: "Unable to load mood songs." });
  }
};

const browseSongs = async (req, res) => {
  try {
    const mood = String(req.params.mood || "").toLowerCase();

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `SELECT s.*,
              EXISTS (
                SELECT 1
                FROM song_moods sm
                WHERE sm.song_id = s.id
                  AND LOWER(sm.mood) = $1
              ) AS is_in_mood
       FROM songs s
       ORDER BY s.title ASC`,
      [mood]
    );

    return res.json({ songs: result.rows });
  } catch (error) {
    console.error("Browse mood songs error:", error);
    return res.status(500).json({ message: "Unable to browse songs." });
  }
};

const addSongToMood = async (req, res) => {
  try {
    const mood = String(req.body.mood || "").toLowerCase();
    const songId = req.params.id;

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const song = await db.query(
      "SELECT id FROM songs WHERE id = $1",
      [songId]
    );

    if (song.rowCount === 0) {
      return res.status(404).json({ message: "Song not found." });
    }

    await db.query(
      `INSERT INTO song_moods (song_id, mood)
       VALUES ($1, $2)
       ON CONFLICT (song_id, mood) DO NOTHING`,
      [songId, mood]
    );

    return res.json({
      message: "Song added to mood successfully.",
      songId,
      mood,
    });
  } catch (error) {
    console.error("Add song to mood error:", error);
    return res.status(500).json({ message: "Unable to add song to mood." });
  }
};

const removeSongFromMood = async (req, res) => {
  try {
    const mood = String(req.params.mood || "").toLowerCase();
    const songId = req.params.id;

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `DELETE FROM song_moods
       WHERE song_id = $1 AND LOWER(mood) = $2
       RETURNING song_id`,
      [songId, mood]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Song was not assigned to this mood.",
      });
    }

    return res.json({ message: "Song removed from mood successfully." });
  } catch (error) {
    console.error("Remove song from mood error:", error);
    return res.status(500).json({ message: "Unable to remove song from mood." });
  }
};

module.exports = {
  getMoodSongs,
  browseSongs,
  addSongToMood,
  removeSongFromMood,
};
