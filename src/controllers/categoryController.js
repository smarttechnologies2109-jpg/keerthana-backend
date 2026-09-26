const pool = require("../config/db");


/* =========================================================
   GET ALL PUBLIC CATEGORIES

   GET /api/categories
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
          c.id,
          c.name,
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
      "Public get categories error:",
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
   GET CATEGORY BY ID

   GET /api/categories/:id
========================================================= */

const getCategoryById = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    const result =
      await pool.query(
        `
        SELECT
          c.id,
          c.name,
          c.created_at,

          COUNT(s.id)::integer
            AS song_count

        FROM categories c

        LEFT JOIN songs s
          ON s.category_id = c.id

        WHERE c.id = $1

        GROUP BY
          c.id,
          c.name,
          c.created_at
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

      category:
        result.rows[0],

    });

  } catch (error) {

    console.error(
      "Public get category error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to load category",

    });

  }

};


module.exports = {

  getCategories,

  getCategoryById,

};