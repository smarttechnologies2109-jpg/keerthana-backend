const pool = require("../config/db");


/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

const ALLOWED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];


/* =========================================================
   CREATE MINISTRY
   POST /api/admin/ministries
========================================================= */

const createMinistry = async (req, res) => {
  try {

    const {
      name,
      description,
      image_url,
      language,
    } = req.body;


    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Ministry name is required.",
      });
    }


    const ministryName = name.trim();

    const ministryLanguage =
      language?.trim() || "Telugu";


    /* Validate language */

    if (!ALLOWED_LANGUAGES.includes(ministryLanguage)) {
      return res.status(400).json({
        message: "Invalid ministry language.",
      });
    }


    /* Check duplicate within same language */

    const existing = await pool.query(
      `
      SELECT id
      FROM ministries
      WHERE LOWER(name) = LOWER($1)
      AND language = $2
      `,
      [
        ministryName,
        ministryLanguage,
      ]
    );


    if (existing.rows.length > 0) {
      return res.status(409).json({
        message:
          "A ministry with this name already exists in this language.",
      });
    }


    const result = await pool.query(
      `
      INSERT INTO ministries
      (
        name,
        description,
        image_url,
        language
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4
      )
      RETURNING
        id,
        name,
        description,
        image_url,
        language,
        created_at
      `,
      [
        ministryName,
        description?.trim() || null,
        image_url?.trim() || null,
        ministryLanguage,
      ]
    );


    return res.status(201).json({
      message: "Ministry created successfully.",
      ministry: result.rows[0],
    });


  } catch (error) {

    console.error(
      "Create ministry error:",
      error
    );


    return res.status(500).json({
      message: "Failed to create ministry.",
    });

  }
};


/* =========================================================
   UPDATE MINISTRY
   PUT /api/admin/ministries/:id
========================================================= */

const updateMinistry = async (req, res) => {
  try {

    const {
      id,
    } = req.params;


    const {
      name,
      description,
      image_url,
      language,
    } = req.body;


    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Ministry name is required.",
      });
    }


    const ministryName = name.trim();

    const ministryLanguage =
      language?.trim() || "Telugu";


    /* Validate language */

    if (!ALLOWED_LANGUAGES.includes(ministryLanguage)) {
      return res.status(400).json({
        message: "Invalid ministry language.",
      });
    }


    /* Check ministry */

    const ministryResult = await pool.query(
      `
      SELECT id
      FROM ministries
      WHERE id = $1
      `,
      [id]
    );


    if (ministryResult.rows.length === 0) {
      return res.status(404).json({
        message: "Ministry not found.",
      });
    }


    /* Check duplicate name in same language */

    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM ministries
      WHERE LOWER(name) = LOWER($1)
      AND language = $2
      AND id <> $3
      `,
      [
        ministryName,
        ministryLanguage,
        id,
      ]
    );


    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        message:
          "Another ministry with this name already exists in this language.",
      });
    }


    const result = await pool.query(
      `
      UPDATE ministries
      SET
        name = $1,
        description = $2,
        image_url = $3,
        language = $4
      WHERE id = $5
      RETURNING
        id,
        name,
        description,
        image_url,
        language,
        created_at
      `,
      [
        ministryName,
        description?.trim() || null,
        image_url?.trim() || null,
        ministryLanguage,
        id,
      ]
    );


    return res.status(200).json({
      message: "Ministry updated successfully.",
      ministry: result.rows[0],
    });


  } catch (error) {

    console.error(
      "Update ministry error:",
      error
    );


    return res.status(500).json({
      message: "Failed to update ministry.",
    });

  }
};


/* =========================================================
   DELETE MINISTRY
   DELETE /api/admin/ministries/:id
========================================================= */

const deleteMinistry = async (req, res) => {
  try {

    const {
      id,
    } = req.params;


    /* Check ministry */

    const ministryResult = await pool.query(
      `
      SELECT id, name
      FROM ministries
      WHERE id = $1
      `,
      [id]
    );


    if (ministryResult.rows.length === 0) {
      return res.status(404).json({
        message: "Ministry not found.",
      });
    }


    /*
      Because songs.ministry_id uses
      ON DELETE SET NULL,
      songs will remain safe.
    */

    await pool.query(
      `
      DELETE FROM ministries
      WHERE id = $1
      `,
      [id]
    );


    return res.status(200).json({
      message: "Ministry deleted successfully.",
    });


  } catch (error) {

    console.error(
      "Delete ministry error:",
      error
    );


    return res.status(500).json({
      message: "Failed to delete ministry.",
    });

  }
};


module.exports = {
  createMinistry,
  updateMinistry,
  deleteMinistry,
};