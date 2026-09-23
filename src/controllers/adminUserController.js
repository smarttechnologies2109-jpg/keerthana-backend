const pool =
  require("../config/db");


/* =========================================================
   GET ALL USERS
========================================================= */

const getUsers = async (
  req,
  res
) => {

  try {

    const result =
      await pool.query(`
        SELECT
          id,
          name,
          email,
          role,
          profile_image,
          created_at

        FROM users

        ORDER BY
          created_at DESC,
          id DESC
      `);


    return res.status(200).json({

      success: true,

      count:
        result.rows.length,

      users:
        result.rows,

    });


  } catch (error) {

    console.error(
      "Admin get users error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to load users",

    });

  }

};


/* =========================================================
   UPDATE USER ROLE
========================================================= */

const updateUserRole = async (
  req,
  res
) => {

  try {

    const {
      id,
    } = req.params;


    const {
      role,
    } = req.body;


    /* =====================================
       VALIDATE ROLE
    ===================================== */

    const allowedRoles = [
      "user",
      "admin",
    ];


    if (
      !allowedRoles.includes(
        role
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Role must be user or admin",

      });

    }


    /* =====================================
       VALIDATE USER ID
    ===================================== */

    const userId =
      Number(id);


    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid user ID",

      });

    }


    /* =====================================
       GET TARGET USER
    ===================================== */

    const targetResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          email,
          role

        FROM users

        WHERE id = $1
        `,
        [userId]
      );


    if (
      targetResult.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",

      });

    }


    const targetUser =
      targetResult.rows[0];


    /* =====================================
       DON'T DEMOTE YOURSELF

       req.user.id comes from JWT
    ===================================== */

    if (
      Number(req.user.id) ===
        userId &&
      role !== "admin"
    ) {

      return res.status(400).json({

        success: false,

        message:
          "You cannot remove your own admin role",

      });

    }


    /* =====================================
       UPDATE
    ===================================== */

    const result =
      await pool.query(
        `
        UPDATE users

        SET
          role = $1

        WHERE id = $2

        RETURNING
          id,
          name,
          email,
          role,
          profile_image,
          created_at
        `,
        [
          role,
          userId,
        ]
      );


    return res.status(200).json({

      success: true,

      message:
        `${targetUser.name}'s role updated successfully`,

      user:
        result.rows[0],

    });


  } catch (error) {

    console.error(
      "Update user role error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to update user role",

    });

  }

};


module.exports = {

  getUsers,

  updateUserRole,

};