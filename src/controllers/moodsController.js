
const db = require("../config/db");

const ALLOWED_MOODS = [
  "worship",
  "praise",
  "prayer",
  "hope",
  "peace",
  "thanksgiving",
];

const normalizeMood = (mood) =>
  String(mood || "").trim().toLowerCase();

const isValidMood = (mood) =>
  ALLOWED_MOODS.includes(normalizeMood(mood));

/**
 * GET /api/moods/:mood/songs
 * Return songs assigned to the requested mood.
 */
const getMoodSongs = async (req, res) => {
  try {
    const mood = normalizeMood(req.params.mood);

    console.log("MOOD API REQUEST:", mood);

    if (!isValidMood(mood)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood.",
      });
    }

    const result = await db.query(
      `
      SELECT s.*
      FROM songs AS s
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

    return res.json({
      success: true,
      mood,
      count: result.rows.length,
      songs: result.rows,
    });
  } catch (error) {
    console.error("MOOD API ERROR:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch mood songs.",
    });
  }
};

/**
 * GET /api/moods/:mood/browse
 * Return all songs and indicate whether each has this mood.
 */
const browseSongs = async (req, res) => {
  try {
    const mood = normalizeMood(req.params.mood);

    if (!isValidMood(mood)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood.",
      });
    }

    const result = await db.query(
      `
      SELECT
        s.*,
        EXISTS (
          SELECT 1
          FROM unnest(
            COALESCE(s.moods, ARRAY[]::text[])
          ) AS item(value)
          WHERE LOWER(TRIM(item.value)) = $1
        ) AS is_in_mood
      FROM songs AS s
      ORDER BY s.title ASC
      `,
      [mood]
    );

    return res.json({
      success: true,
      mood,
      songs: result.rows,
    });
  } catch (error) {
    console.error("Browse mood songs error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to browse songs.",
    });
  }
};

/**
 * POST /api/moods/songs/:id
 * Add a mood to a song.
 * Body: { "mood": "worship" }
 */
const addSongToMood = async (req, res) => {
  try {
    const mood = normalizeMood(req.body?.mood);
    const songId = Number(req.params.id);

    if (!isValidMood(mood)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood.",
      });
    }

    if (!Number.isInteger(songId) || songId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid song ID.",
      });
    }

    const result = await db.query(
      `
      UPDATE songs
      SET moods = CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(
            COALESCE(songs.moods, ARRAY[]::text[])
          ) AS item(value)
          WHERE LOWER(TRIM(item.value)) = $2
        )
        THEN COALESCE(songs.moods, ARRAY[]::text[])
        ELSE array_append(
          COALESCE(songs.moods, ARRAY[]::text[]),
          $2
        )
      END
      WHERE id = $1
      RETURNING id, title, moods
      `,
      [songId, mood]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found.",
      });
    }

    return res.json({
      success: true,
      message: "Song added to mood successfully.",
      song: result.rows[0],
    });
  } catch (error) {
    console.error("Add song to mood error:", error.message);

    return res.status(500).json({
      success: false,
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
    const songId = Number(req.params.id);

    if (!isValidMood(mood)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mood.",
      });
    }

    if (!Number.isInteger(songId) || songId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid song ID.",
      });
    }

    const result = await db.query(
      `
      UPDATE songs
      SET moods = ARRAY(
        SELECT item.value
        FROM unnest(
          COALESCE(songs.moods, ARRAY[]::text[])
        ) AS item(value)
        WHERE LOWER(TRIM(item.value)) <> $2
      )
      WHERE id = $1
        AND EXISTS (
          SELECT 1
          FROM unnest(
            COALESCE(songs.moods, ARRAY[]::text[])
          ) AS item(value)
          WHERE LOWER(TRIM(item.value)) = $2
        )
      RETURNING id, title, moods
      `,
      [songId, mood]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found or not assigned to this mood.",
      });
    }

    return res.json({
      success: true,
      message: "Song removed from mood successfully.",
      song: result.rows[0],
    });
  } catch (error) {
    console.error("Remove song from mood error:", error.message);

    return res.status(500).json({
      success: false,
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
