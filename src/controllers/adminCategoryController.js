const pool =
  require("../config/db");


/* =========================================================
   ALLOWED LANGUAGES
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
   GET ALL CATEGORIES
========================================================= */

const getCategories = async (
  req,
  res
) => {

  try {

    const result =
      await pool.query(`
        SELECT
          c.id,
          c.name,
          c.language,
          c.created_at,

          COUNT(s.id)::integer
            AS song_count

        FROM categories c

        LEFT JOIN songs s
          ON s.category_id = c.id

        GROUP BY
          c.id,
          c.name,
          c.language,
          c.created_at

        ORDER BY
          c.name ASC
      `);


    return res.status(200).json({

      success: true,

      count:
        result.rows.length,

      categories:
        result.rows,

    });


  } catch (error) {

    console.error(
      "Get categories error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to load categories",

    });

  }

};


/* =========================================================
   CREATE CATEGORY
========================================================= */

const createCategory = async (
  req,
  res
) => {

  try {

    const {
      name,
      language,
    } = req.body;


    /* =====================================================
       NAME VALIDATION
    ===================================================== */

    if (
      !name ||
      !name.trim()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Category name is required",

      });

    }


    const cleanName =
      name.trim();


    /* =====================================================
       LANGUAGE
    ===================================================== */

    const categoryLanguage =
      language?.trim() ||
      "Telugu";


    if (
      !ALLOWED_LANGUAGES.includes(
        categoryLanguage
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid category language",

      });

    }


    /* =====================================================
       CHECK DUPLICATE
       
       Same category name is allowed in different
       languages.

       Example:
       Worship + Telugu
       Worship + Hindi

       Both can exist.
    ===================================================== */

    const existing =
      await pool.query(
        `
        SELECT
          id

        FROM categories

        WHERE
          LOWER(name) =
            LOWER($1)

          AND language = $2
        `,
        [
          cleanName,
          categoryLanguage,
        ]
      );


    if (
      existing.rows.length > 0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Category already exists in this language",

      });

    }


    /* =====================================================
       INSERT
    ===================================================== */

    const result =
      await pool.query(
        `
        INSERT INTO categories
        (
          name,
          language
        )

        VALUES
        (
          $1,
          $2
        )

        RETURNING *
        `,
        [
          cleanName,
          categoryLanguage,
        ]
      );


    return res.status(201).json({

      success: true,

      message:
        "Category created successfully",

      category:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Create category error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to create category",

    });

  }

};


/* =========================================================
   UPDATE CATEGORY
========================================================= */

const updateCategory = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    const {
      name,
      language,
    } = req.body;


    /* =====================================================
       NAME VALIDATION
    ===================================================== */

    if (
      !name ||
      !name.trim()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Category name is required",

      });

    }


    const cleanName =
      name.trim();


    /* =====================================================
       LANGUAGE
    ===================================================== */

    const categoryLanguage =
      language?.trim() ||
      "Telugu";


    if (
      !ALLOWED_LANGUAGES.includes(
        categoryLanguage
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid category language",

      });

    }


    /* =====================================================
       CHECK DUPLICATE
    ===================================================== */

    const existing =
      await pool.query(
        `
        SELECT
          id

        FROM categories

        WHERE
          LOWER(name) =
            LOWER($1)

          AND language = $2

          AND id <> $3
        `,
        [
          cleanName,
          categoryLanguage,
          id,
        ]
      );


    if (
      existing.rows.length > 0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Another category already uses this name in this language",

      });

    }


    /* =====================================================
       UPDATE
    ===================================================== */

    const result =
      await pool.query(
        `
        UPDATE categories

        SET
          name = $1,
          language = $2

        WHERE id = $3

        RETURNING *
        `,
        [
          cleanName,
          categoryLanguage,
          id,
        ]
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Category not found",

      });

    }


    return res.status(200).json({

      success: true,

      message:
        "Category updated successfully",

      category:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Update category error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to update category",

    });

  }

};


/* =========================================================
   DELETE CATEGORY
========================================================= */

const deleteCategory = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    /* =====================================================
       CHECK IF SONGS USE CATEGORY
    ===================================================== */

    const songs =
      await pool.query(
        `
        SELECT
          COUNT(*)::integer
            AS count

        FROM songs

        WHERE category_id = $1
        `,
        [id]
      );


    if (
      songs.rows[0].count > 0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Cannot delete this category because songs are assigned to it.",

      });

    }


    /* =====================================================
       DELETE
    ===================================================== */

    const result =
      await pool.query(
        `
        DELETE FROM categories

        WHERE id = $1

        RETURNING id
        `,
        [id]
      );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Category not found",

      });

    }


    return res.status(200).json({

      success: true,

      message:
        "Category deleted successfully",

    });


  } catch (error) {

    console.error(
      "Delete category error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to delete category",

    });

  }

};


module.exports = {

  getCategories,

  createCategory,

  updateCategory,

  deleteCategory,

};