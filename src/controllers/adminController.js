
const pool = require("../config/db");

/* =========================================
   SAFE TABLE COUNT
========================================= */

const getTableCount = async (tableName) => {
  const allowedTables = [
    "songs",
    "artists",
    "albums",
    "categories",
    "ministries",
    "song_reports",
    "users",
  ];

  if (!allowedTables.includes(tableName)) {
    throw new Error("Invalid dashboard table");
  }

  // Check whether the table exists
  const exists = await pool.query(
    "SELECT to_regclass($1) AS table_name",
    [`public.${tableName}`]
  );

  if (!exists.rows[0].table_name) {
    return 0;
  }

  // Get live table count
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS total FROM public.${tableName}`
  );

  return Number(result.rows[0].total || 0);
};

/* =========================================
   ADMIN DASHBOARD
   GET /api/admin/dashboard
========================================= */

const getDashboard = async (req, res) => {
  try {
    const [
      songs,
      artists,
      albums,
      categories,
      ministries,
      songReports,
      users,
    ] = await Promise.all([
      getTableCount("songs"),
      getTableCount("artists"),
      getTableCount("albums"),
      getTableCount("categories"),
      getTableCount("ministries"),
      getTableCount("song_reports"),
      getTableCount("users"),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        songs,
        artists,
        albums,
        categories,
        ministries,
        songReports,
        users,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load admin dashboard statistics",
    });
  }
};

module.exports = {
  getDashboard,
};
