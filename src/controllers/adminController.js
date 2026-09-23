const pool =
  require("../config/db");


/* =========================================
   ADMIN DASHBOARD
========================================= */

const getDashboard = async (
  req,
  res
) => {

  try {

    const [
      songsResult,
      artistsResult,
      albumsResult,
      categoriesResult,
      usersResult,
    ] = await Promise.all([

      pool.query(
        "SELECT COUNT(*) FROM songs"
      ),

      pool.query(
        "SELECT COUNT(*) FROM artists"
      ),

      pool.query(
        "SELECT COUNT(*) FROM albums"
      ),

      pool.query(
        "SELECT COUNT(*) FROM categories"
      ),

      pool.query(
        "SELECT COUNT(*) FROM users"
      ),

    ]);


    return res.status(200).json({

      success: true,

      stats: {

        songs:
          Number(
            songsResult.rows[0].count
          ),

        artists:
          Number(
            artistsResult.rows[0].count
          ),

        albums:
          Number(
            albumsResult.rows[0].count
          ),

        categories:
          Number(
            categoriesResult.rows[0].count
          ),

        users:
          Number(
            usersResult.rows[0].count
          ),

      },

    });

  } catch (error) {

    console.error(
      "Admin dashboard error:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        "Unable to load admin dashboard",
    });

  }

};


module.exports = {
  getDashboard,
};