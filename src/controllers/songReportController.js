
const pool = require("../config/db");

/* =========================================================
   ALLOWED REPORT TYPES
========================================================= */

const ALLOWED_REPORT_TYPES = [
  "Incorrect lyrics",
  "Incorrect audio",
  "Incorrect song title",
  "Missing lyrics",
  "Other",
];


/* =========================================================
   CREATE SONG REPORT
========================================================= */

const createSongReport = async (req, res) => {
  try {

    /* =====================================
       AUTHENTICATED USER
    ===================================== */

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }


    const userId = req.user.id;


    /* =====================================
       GET REQUEST DATA
    ===================================== */

    const {
      song_id,
      report_type,
      message,
    } = req.body;


    /* =====================================
       VALIDATE SONG ID
    ===================================== */

    if (!song_id) {
      return res.status(400).json({
        success: false,
        message: "Song ID is required",
      });
    }


    /* =====================================
       VALIDATE REPORT TYPE
    ===================================== */

    if (
      !ALLOWED_REPORT_TYPES.includes(report_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid report type",
        allowedTypes: ALLOWED_REPORT_TYPES,
      });
    }


    /* =====================================
       VALIDATE MESSAGE
    ===================================== */

    const cleanMessage =
      String(message || "").trim();


    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        message: "Report message is required",
      });
    }


    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Report message cannot exceed 2000 characters",
      });
    }


    /* =====================================
       CHECK SONG EXISTS
    ===================================== */

    const songResult = await pool.query(
      `
      SELECT
        id,
        title,
        title_english
      FROM songs
      WHERE id = $1
      `,
      [song_id]
    );


    if (songResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }


    const song = songResult.rows[0];


    /* =====================================
       INSERT REPORT
    ===================================== */

    const result = await pool.query(
      `
      INSERT INTO song_reports (
        user_id,
        song_id,
        song_title,
        report_type,
        message,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'pending'
      )
      RETURNING
        id,
        user_id,
        song_id,
        song_title,
        report_type,
        message,
        status,
        created_at
      `,
      [
        userId,
        song.id,
        song.title,
        report_type,
        cleanMessage,
      ]
    );


    /* =====================================
       SUCCESS RESPONSE
    ===================================== */

    return res.status(201).json({
      success: true,
      message:
        "Thank you! Your report has been submitted successfully.",
      report: result.rows[0],
    });

  } catch (error) {

    console.error(
      "Create song report error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to submit your report. Please try again.",
    });
  }
};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createSongReport,
};

