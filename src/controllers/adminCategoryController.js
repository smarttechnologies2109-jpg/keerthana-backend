const pool =
  require("../config/db");


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
          c.created_at,

          COUNT(s.id)::integer
            AS song_count

        FROM categories c

        LEFT JOIN songs s
          ON s.category_id = c.id

        GROUP BY
          c.id

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
    } = req.body;


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


    /* CHECK DUPLICATE */

    const existing =
      await pool.query(
        `
        SELECT id

        FROM categories

        WHERE LOWER(name) =
              LOWER($1)
        `,
        [cleanName]
      );


    if (
      existing.rows.length > 0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Category already exists",

      });

    }


    /* INSERT */

    const result =
      await pool.query(
        `
        INSERT INTO categories
        (
          name
        )

        VALUES
        (
          $1
        )

        RETURNING *
        `,
        [cleanName]
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
    } = req.body;


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


    /* CHECK DUPLICATE */

    const existing =
      await pool.query(
        `
        SELECT id

        FROM categories

        WHERE
          LOWER(name) =
            LOWER($1)

          AND id <> $2
        `,
        [
          cleanName,
          id,
        ]
      );


    if (
      existing.rows.length > 0
    ) {

      return res.status(409).json({

        success: false,

        message:
          "Another category already uses this name",

      });

    }


    const result =
      await pool.query(
        `
        UPDATE categories

        SET
          name = $1

        WHERE id = $2

        RETURNING *
        `,
        [
          cleanName,
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


    /* CHECK IF SONGS USE CATEGORY */

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