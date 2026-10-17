
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
  ALLOWED_MOODS.includes(String(mood || "").trim().toLowerCase());

const normalizeMood = (mood) =>
  String(mood || "").trim().toLowerCase();

/**
 * GET /api/moods/:mood/songs
 * Get songs assigned to a mood.
 */
const getMoodSongs = async (req, res) => {
  try {
    const mood = String(req.params.mood || "")
      .trim()
      .toLowerCase();

    console.log("MOOD API REQUEST:", mood);

    const result = await pool.query(
      `
      SELECT s.*
      FROM songs s
      WHERE EXISTS (
        SELECT 1
        FROM unnest(
          COALESCE(s.moods, ARRAY[]::text[])
        ) AS item(value)
        WHERE LOWER(TRIM(item.value)) = $1
      )
      ORDER BY s.title ASC
      `,
      [mood]
    );

    console.log("MOOD API SONG COUNT:", result.rows.length);
    console.log(
      "MOOD API RESULTS:",
      result.rows.map(song => ({
        id: song.id,
        title: song.title,
        moods: song.moods,
      }))
    );

    return res.json({ songs: result.rows });
  } catch (error) {
    console.error("MOOD API ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch mood songs",
    });
  }
};

/**
 * GET /api/moods/:mood/browse
 * Browse all songs and indicate whether each song has this mood.
 */
const browseSongs = async (req, res) => {
  try {
    const mood = normalizeMood(req.params.mood);

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `SELECT
         s.*,
         EXISTS (
           SELECT 1
           FROM unnest(COALESCE(s.moods, ARRAY[]::text[])) AS item(value)
           WHERE LOWER(TRIM(item.value)) = $1
         ) AS is_in_mood
       FROM songs s
       ORDER BY s.title ASC`,
      [mood]
    );

    return res.json({ songs: result.rows });
  } catch (error) {
    console.error("Browse mood songs error:", error);
    return res.status(500).json({
      message: "Unable to browse songs.",
    });
  }
};

/**
 * POST /api/moods/songs/:id
 * Add a mood to a song.
 * Request body: { "mood": "worship" }
 */
const addSongToMood = async (req, res) => {
  try {
    const mood = normalizeMood(req.body.mood);
    const songId = req.params.id;

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `UPDATE songs
       SET moods = CASE
         WHEN EXISTS (
           SELECT 1
           FROM unnest(COALESCE(songs.moods, ARRAY[]::text[])) AS item(value)
           WHERE LOWER(TRIM(item.value)) = $2
         )
         THEN COALESCE(songs.moods, ARRAY[]::text[])
         ELSE array_append(
           COALESCE(songs.moods, ARRAY[]::text[]),
           $2
         )
       END
       WHERE id = $1
       RETURNING id, title, moods`,
      [songId, mood]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Song not found." });
    }

    return res.json({
      message: "Song added to mood successfully.",
      songId: result.rows[0].id,
      mood,
      moods: result.rows[0].moods,
    });
  } catch (error) {
    console.error("Add song to mood error:", error);
    return res.status(500).json({
      message: "Unable to add song to mood.",
    });
  }
};

/**
 * DELETE /api/moods/songs/:id/:mood
 * Remove a mood from a song.
 */
const removeSongFromMood = async (req, res) => {
  try {
    const mood = normalizeMood(req.params.mood);
    const songId = req.params.id;

    if (!isValidMood(mood)) {
      return res.status(400).json({ message: "Invalid mood." });
    }

    const result = await db.query(
      `UPDATE songs
       SET moods = ARRAY(
         SELECT item.value
         FROM unnest(COALESCE(songs.moods, ARRAY[]::text[]))
           AS item(value)
         WHERE LOWER(TRIM(item.value)) <> $2
       )
       WHERE id = $1
         AND EXISTS (
           SELECT 1
           FROM unnest(COALESCE(songs.moods, ARRAY[]::text[]))
             AS item(value)
           WHERE LOWER(TRIM(item.value)) = $2
         )
       RETURNING id, title, moods`,
      [songId, mood]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Song not found or not assigned to this mood.",
      });
    }

    return res.json({
      message: "Song removed from mood successfully.",
      songId: result.rows[0].id,
      mood,
      moods: result.rows[0].moods,
    });
  } catch (error) {
    console.error("Remove song from mood error:", error);
    return res.status(500).json({
      message: "Unable to remove song from mood.",
    });
  }
};

module.exports = {
  getMoodSongs,
  browseSongs,
  addSongToMood,
  removeSongFromMood,
};
