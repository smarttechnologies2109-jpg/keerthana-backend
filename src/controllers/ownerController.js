const pool = require("../config/db");
const bcrypt = require("bcryptjs");

/* =========================================================
   GET OWNER PROFILE
========================================================= */

const getOwnerProfile = async (req, res) => {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({
        success: false,
        message: "Owner authentication required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role,
        mobile,
        profile_image,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
        AND role = 'BUSINESS_OWNER'
      LIMIT 1
      `,
      [ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Business owner not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get Owner Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch owner profile",
    });
  }
};


/* =========================================================
   GET ALL USERS
========================================================= */

const getOwnerUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        role,
        mobile,
        profile_image,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      users: result.rows,
    });
  } catch (error) {
    console.error("Get Owner Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};


/* =========================================================
   CREATE USER
========================================================= */

const createOwnerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      mobile,
      role,
    } = req.body;

    // =====================================================
    // REQUIRED FIELDS
    // =====================================================

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // =====================================================
    // PASSWORD VALIDATION
    // =====================================================

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // =====================================================
    // ROLE VALIDATION
    // =====================================================

    const allowedRoles = [
      "USER",
      "ADMIN",
      "EMPLOYEE",
    ];

    const selectedRole = role || "USER";

    if (!allowedRoles.includes(selectedRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // =====================================================
    // CLEAN DATA
    // =====================================================

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    const cleanMobile =
      mobile && mobile.trim()
        ? mobile.trim()
        : null;

    // =====================================================
    // CHECK DUPLICATE EMAIL
    // =====================================================

    const existingEmail = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    // =====================================================
    // CHECK DUPLICATE MOBILE
    // =====================================================

    if (cleanMobile) {
      const existingMobile = await pool.query(
        `
        SELECT id, name, email
        FROM users
        WHERE mobile = $1
        LIMIT 1
        `,
        [cleanMobile]
      );

      if (existingMobile.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "A user with this mobile number already exists",
        });
      }
    }

    // =====================================================
    // HASH PASSWORD
    // =====================================================

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    // =====================================================
    // CREATE USER
    // =====================================================

    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        mobile,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        NOW()
      )
      RETURNING
        id,
        name,
        email,
        role,
        mobile,
        profile_image,
        created_at,
        updated_at
      `,
      [
        cleanName,
        cleanEmail,
        passwordHash,
        selectedRole,
        cleanMobile,
      ]
    );

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Create Owner User Error:",
      error
    );

    // =====================================================
    // POSTGRES UNIQUE CONSTRAINT
    // =====================================================

    if (error.code === "23505") {

      if (
        error.constraint === "users_mobile_unique"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A user with this mobile number already exists",
        });
      }

      if (
        error.constraint === "users_email_unique"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A user with this email already exists",
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "A user with the provided information already exists",
      });
    }

    // =====================================================
    // OTHER SERVER ERROR
    // =====================================================

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
};


/* =========================================================
   UPDATE USER
========================================================= */

const updateOwnerUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const {
      name,
      email,
      mobile,
      role,
      password,
    } = req.body;

    /* -----------------------------------------------------
       BASIC VALIDATION
    ----------------------------------------------------- */

    if (!name ) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    /* -----------------------------------------------------
       ROLE VALIDATION
    ----------------------------------------------------- */

    const allowedRoles = [
      "USER",
      "ADMIN",
      "EMPLOYEE",
    ];

    const selectedRole = role || "USER";

    if (!allowedRoles.includes(selectedRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    /* -----------------------------------------------------
       CLEAN DATA
    ----------------------------------------------------- */

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    const cleanMobile = mobile
      ? mobile.trim()
      : null;

    /* -----------------------------------------------------
       CHECK EMAIL
    ----------------------------------------------------- */

    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND id <> $2
      LIMIT 1
      `,
      [
        cleanEmail,
        userId,
      ]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this email already exists",
      });
    }

    /* -----------------------------------------------------
       PASSWORD VALIDATION
    ----------------------------------------------------- */

    if (password && password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    let result;

    /* -----------------------------------------------------
       UPDATE WITH PASSWORD
    ----------------------------------------------------- */

    if (password) {
      const passwordHash = await bcrypt.hash(
        password,
        12
      );

      result = await pool.query(
        `
        UPDATE users
        SET
          name = $1,
          email = $2,
          mobile = $3,
          role = $4,
          password_hash = $5,
          updated_at = NOW()
        WHERE id = $6
          AND role <> 'BUSINESS_OWNER'
        RETURNING
          id,
          name,
          email,
          role,
          mobile,
          profile_image,
          created_at,
          updated_at
        `,
        [
          cleanName,
          cleanEmail,
          cleanMobile,
          selectedRole,
          passwordHash,
          userId,
        ]
      );

    } else {

      /* ---------------------------------------------------
         UPDATE WITHOUT PASSWORD
      --------------------------------------------------- */

      result = await pool.query(
        `
        UPDATE users
        SET
          name = $1,
          email = $2,
          mobile = $3,
          role = $4,
          updated_at = NOW()
        WHERE id = $5
          AND role <> 'BUSINESS_OWNER'
        RETURNING
          id,
          name,
          email,
          role,
          mobile,
          profile_image,
          created_at,
          updated_at
        `,
        [
          cleanName,
          cleanEmail,
          cleanMobile,
          selectedRole,
          userId,
        ]
      );
    }

    /* -----------------------------------------------------
       USER NOT FOUND
    ----------------------------------------------------- */

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "User not found or cannot be modified",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Update Owner User Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
    });
  }
};


/* =========================================================
   DELETE USER
========================================================= */

const deleteOwnerUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const result = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
        AND role <> 'BUSINESS_OWNER'
      RETURNING id
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "User not found or cannot be deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });

  } catch (error) {
    console.error(
      "Delete Owner User Error:",
      error
    );

    /* -----------------------------------------------------
       FOREIGN KEY ERROR
    ----------------------------------------------------- */

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this user because related records exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
    });
  }
};


/* =========================================================
   GET DASHBOARD STATISTICS
========================================================= */

const getOwnerStatistics = async (req, res) => {
  try {
    /* -----------------------------------------------------
       USERS
    ----------------------------------------------------- */

    const totalUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
    `);

    const businessOwnersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE role = 'BUSINESS_OWNER'
    `);

    const normalUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE role IS NULL
         OR role != 'BUSINESS_OWNER'
    `);


    /* -----------------------------------------------------
       MUSIC
    ----------------------------------------------------- */

    const totalSongsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM songs
    `);

    const featuredSongsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM songs
      WHERE featured = true
    `);

    const totalAlbumsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM albums
    `);

    const totalArtistsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM artists
    `);

    const totalCategoriesResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM categories
    `);


    /* -----------------------------------------------------
       LISTENING
    ----------------------------------------------------- */

    const totalPlaysResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM listening_history
    `);

    const completedPlaysResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM listening_history
      WHERE completed = true
    `);

    const totalListeningTimeResult = await pool.query(`
      SELECT COALESCE(
        SUM(progress_seconds),
        0
      )::bigint AS total_seconds
      FROM listening_history
    `);


    /* -----------------------------------------------------
       LIKES
    ----------------------------------------------------- */

    const totalLikesResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM liked_songs
    `);


    /* -----------------------------------------------------
       PLAYLISTS
    ----------------------------------------------------- */

    const totalPlaylistsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM playlists
    `);

    const totalPlaylistSongsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM playlist_songs
    `);


    /* -----------------------------------------------------
       SUBSCRIPTIONS
    ----------------------------------------------------- */

    const totalSubscriptionsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM subscriptions
    `);

    const activeSubscriptionsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM subscriptions
      WHERE LOWER(status) = 'active'
    `);


    /* -----------------------------------------------------
       PAYMENTS
    ----------------------------------------------------- */

    const totalPaymentsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM payments
    `);

    const successfulPaymentsResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM payments
      WHERE LOWER(status) IN (
        'success',
        'successful',
        'paid',
        'completed'
      )
    `);

    const totalRevenueResult = await pool.query(`
      SELECT COALESCE(
        SUM(amount),
        0
      )::numeric AS total_revenue
      FROM payments
      WHERE LOWER(status) IN (
        'success',
        'successful',
        'paid',
        'completed'
      )
    `);


    /* -----------------------------------------------------
       RECENT USERS
    ----------------------------------------------------- */

    const recentUsersResult = await pool.query(`
      SELECT
        id,
        name,
        email,
        role,
        mobile,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);


    /* -----------------------------------------------------
       TOP SONGS
    ----------------------------------------------------- */

    const topSongsResult = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.artist,
        s.cover_url,
        COUNT(lh.id)::int AS play_count
      FROM songs s
      LEFT JOIN listening_history lh
        ON lh.song_id = s.id
      GROUP BY
        s.id,
        s.title,
        s.artist,
        s.cover_url
      ORDER BY play_count DESC
      LIMIT 5
    `);


    /* -----------------------------------------------------
       TOP LIKED SONGS
    ----------------------------------------------------- */

    const topLikedSongsResult = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.artist,
        s.cover_url,
        COUNT(ls.id)::int AS like_count
      FROM songs s
      LEFT JOIN liked_songs ls
        ON ls.song_id = s.id
      GROUP BY
        s.id,
        s.title,
        s.artist,
        s.cover_url
      ORDER BY like_count DESC
      LIMIT 5
    `);


    /* -----------------------------------------------------
       RECENT LISTENING
    ----------------------------------------------------- */

    const recentListeningResult = await pool.query(`
      SELECT
        lh.id,
        lh.user_id,
        lh.song_id,
        lh.progress_seconds,
        lh.completed,
        lh.played_at,
        s.title AS song_title,
        s.artist AS song_artist,
        u.name AS user_name
      FROM listening_history lh
      LEFT JOIN songs s
        ON s.id = lh.song_id
      LEFT JOIN users u
        ON u.id = lh.user_id
      ORDER BY lh.played_at DESC
      LIMIT 10
    `);


    /* -----------------------------------------------------
       FINAL STATISTICS
    ----------------------------------------------------- */

    const totalListeningSeconds = Number(
      totalListeningTimeResult.rows[0].total_seconds || 0
    );

    const totalListeningMinutes = Math.floor(
      totalListeningSeconds / 60
    );

    const totalListeningHours = Math.floor(
      totalListeningSeconds / 3600
    );


    const statistics = {
      users: {
        total: totalUsersResult.rows[0].count,
        businessOwners:
          businessOwnersResult.rows[0].count,
        normalUsers:
          normalUsersResult.rows[0].count,
      },

      music: {
        totalSongs:
          totalSongsResult.rows[0].count,

        featuredSongs:
          featuredSongsResult.rows[0].count,

        totalAlbums:
          totalAlbumsResult.rows[0].count,

        totalArtists:
          totalArtistsResult.rows[0].count,

        totalCategories:
          totalCategoriesResult.rows[0].count,
      },

      listening: {
        totalPlays:
          totalPlaysResult.rows[0].count,

        completedPlays:
          completedPlaysResult.rows[0].count,

        totalListeningSeconds,

        totalListeningMinutes,

        totalListeningHours,
      },

      likes: {
        totalLikes:
          totalLikesResult.rows[0].count,
      },

      playlists: {
        totalPlaylists:
          totalPlaylistsResult.rows[0].count,

        totalPlaylistSongs:
          totalPlaylistSongsResult.rows[0].count,
      },

      subscriptions: {
        totalSubscriptions:
          totalSubscriptionsResult.rows[0].count,

        activeSubscriptions:
          activeSubscriptionsResult.rows[0].count,
      },

      payments: {
        totalPayments:
          totalPaymentsResult.rows[0].count,

        successfulPayments:
          successfulPaymentsResult.rows[0].count,

        totalRevenue:
          Number(
            totalRevenueResult.rows[0].total_revenue || 0
          ),
      },

      recentUsers:
        recentUsersResult.rows,

      topSongs:
        topSongsResult.rows,

      topLikedSongs:
        topLikedSongsResult.rows,

      recentListening:
        recentListeningResult.rows,
    };


    return res.status(200).json({
      success: true,
      statistics,
    });

  } catch (error) {
    console.error(
      "Get Owner Statistics Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
};


/* =========================================================
   GET OWNER MUSIC
========================================================= */

const getOwnerMusic = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        artist,
        album,
        category,
        audio_url,
        cover_image,
        created_at,
        updated_at
      FROM music
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      music: result.rows,
    });

  } catch (error) {
    console.error(
      "Get Owner Music Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load music",
    });
  }
};


/* =========================================================
   CREATE MUSIC
========================================================= */

const createOwnerMusic = async (req, res) => {
  try {
    const {
      title,
      artist,
      album,
      category,
      audio_url,
      cover_image,
    } = req.body;

    if (!title || !artist || !audio_url) {
      return res.status(400).json({
        success: false,
        message:
          "Title, artist and audio URL are required",
      });
    }

    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();

    const cleanAlbum = album
      ? album.trim()
      : null;

    const cleanCategory = category
      ? category.trim()
      : null;

    const cleanAudioUrl = audio_url.trim();

    const cleanCoverImage = cover_image
      ? cover_image.trim()
      : null;

    const result = await pool.query(
      `
      INSERT INTO music (
        title,
        artist,
        album,
        category,
        audio_url,
        cover_image,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW(),
        NOW()
      )
      RETURNING
        id,
        title,
        artist,
        album,
        category,
        audio_url,
        cover_image,
        created_at,
        updated_at
      `,
      [
        cleanTitle,
        cleanArtist,
        cleanAlbum,
        cleanCategory,
        cleanAudioUrl,
        cleanCoverImage,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Music added successfully",
      music: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Create Owner Music Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to add music",
    });
  }
};


/* =========================================================
   UPDATE MUSIC
========================================================= */

const updateOwnerMusic = async (req, res) => {
  try {
    const musicId = Number(req.params.id);

    if (!Number.isInteger(musicId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid music ID",
      });
    }

    const {
      title,
      artist,
      album,
      category,
      audio_url,
      cover_image,
    } = req.body;

    if (!title || !artist || !audio_url) {
      return res.status(400).json({
        success: false,
        message:
          "Title, artist and audio URL are required",
      });
    }

    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();

    const cleanAlbum = album
      ? album.trim()
      : null;

    const cleanCategory = category
      ? category.trim()
      : null;

    const cleanAudioUrl = audio_url.trim();

    const cleanCoverImage = cover_image
      ? cover_image.trim()
      : null;

    const result = await pool.query(
      `
      UPDATE music
      SET
        title = $1,
        artist = $2,
        album = $3,
        category = $4,
        audio_url = $5,
        cover_image = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING
        id,
        title,
        artist,
        album,
        category,
        audio_url,
        cover_image,
        created_at,
        updated_at
      `,
      [
        cleanTitle,
        cleanArtist,
        cleanAlbum,
        cleanCategory,
        cleanAudioUrl,
        cleanCoverImage,
        musicId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Music not found",
      });
    }

    return res.json({
      success: true,
      message: "Music updated successfully",
      music: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Update Owner Music Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update music",
    });
  }
};


/* =========================================================
   DELETE MUSIC
========================================================= */

const deleteOwnerMusic = async (req, res) => {
  try {
    const musicId = Number(req.params.id);

    if (!Number.isInteger(musicId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid music ID",
      });
    }

    const result = await pool.query(
      `
      DELETE FROM music
      WHERE id = $1
      RETURNING id
      `,
      [musicId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Music not found",
      });
    }

    return res.json({
      success: true,
      message: "Music deleted successfully",
    });

  } catch (error) {
    console.error(
      "Delete Owner Music Error:",
      error
    );

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this music because related records exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete music",
    });
  }
};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getOwnerProfile,
  getOwnerUsers,
  createOwnerUser,
  updateOwnerUser,
  deleteOwnerUser,
  getOwnerStatistics,
  getOwnerMusic,
  createOwnerMusic,
  updateOwnerMusic,
  deleteOwnerMusic,
};