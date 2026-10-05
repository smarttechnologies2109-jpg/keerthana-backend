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

/* =========================================================
   GET OWNER STATISTICS
   - Overview
   - Language statistics
   - Today's uploads
   - Admin contributions
   - Calendar statistics
   - Selected-date statistics
========================================================= */

const getOwnerStatistics = async (req, res) => {
  try {
    /*
      Optional query parameters:

      /owner/statistics
      /owner/statistics?month=2026-09
      /owner/statistics?date=2026-09-28
      /owner/statistics?month=2026-09&date=2026-09-28
    */

    const requestedMonth = String(
      req.query.month || ""
    ).trim();

    const requestedDate = String(
      req.query.date || ""
    ).trim();


    /* =====================================================
       DATE VALIDATION
    ===================================================== */

    const monthPattern = /^\d{4}-\d{2}$/;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const validMonth =
      monthPattern.test(requestedMonth)
        ? requestedMonth
        : null;

    const validDate =
      datePattern.test(requestedDate)
        ? requestedDate
        : null;


    /* =====================================================
       USERS
    ===================================================== */

    const totalUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
    `);

    const businessOwnersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE UPPER(role) = 'BUSINESS_OWNER'
    `);

    const adminUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE UPPER(role) = 'ADMIN'
    `);

    const normalUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE LOWER(COALESCE(role, 'user'))
        NOT IN ('business_owner', 'admin', 'employee')
    `);


    /* =====================================================
       MUSIC OVERVIEW
    ===================================================== */

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

/* =====================================================
   MUSIC COLLECTION BY LANGUAGE
   - Songs
   - Albums
   - Artists
   - Categories
   - Ministries
===================================================== */

const musicLanguageResult = await pool.query(`
  WITH languages AS (
    SELECT unnest(
      ARRAY[
        'Telugu',
        'Hindi',
        'English',
        'Malayalam',
        'Kannada',
        'Tamil'
      ]
    ) AS language
  )

  SELECT
    l.language,

    (
      SELECT COUNT(*)::int
      FROM songs s
      WHERE LOWER(TRIM(COALESCE(s.language, ''))) =
            LOWER(l.language)
    ) AS songs,

    (
      SELECT COUNT(*)::int
      FROM albums a
      WHERE LOWER(TRIM(COALESCE(a.language, ''))) =
            LOWER(l.language)
    ) AS albums,

    (
      SELECT COUNT(*)::int
      FROM artists ar
      WHERE LOWER(TRIM(COALESCE(ar.language, ''))) =
            LOWER(l.language)
    ) AS artists,

    (
      SELECT COUNT(*)::int
      FROM categories c
      WHERE LOWER(TRIM(COALESCE(c.language, ''))) =
            LOWER(l.language)
    ) AS categories,

    (
      SELECT COUNT(*)::int
      FROM ministries m
      WHERE LOWER(TRIM(COALESCE(m.language, ''))) =
            LOWER(l.language)
    ) AS ministries

  FROM languages l
  ORDER BY
    CASE l.language
      WHEN 'Telugu' THEN 1
      WHEN 'Hindi' THEN 2
      WHEN 'English' THEN 3
      WHEN 'Malayalam' THEN 4
      WHEN 'Kannada' THEN 5
      WHEN 'Tamil' THEN 6
      ELSE 99
    END
`);
const musicByLanguage =
  musicLanguageResult.rows.map((row) => ({
    language: row.language,

    songs: Number(
      row.songs || 0
    ),

    albums: Number(
      row.albums || 0
    ),

    artists: Number(
      row.artists || 0
    ),

    categories: Number(
      row.categories || 0
    ),

    ministries: Number(
      row.ministries || 0
    ),
  }));
    /* =====================================================
       LANGUAGE STATISTICS
    ===================================================== */

    const languageResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Telugu')
        )::int AS telugu,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Hindi')
        )::int AS hindi,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('English')
        )::int AS english,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Malayalam')
        )::int AS malayalam,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Kannada')
        )::int AS kannada,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Tamil')
        )::int AS tamil,

        COUNT(*) FILTER (
          WHERE language IS NULL
             OR TRIM(language) = ''
             OR LOWER(TRIM(language))
                NOT IN (
                  'telugu',
                  'hindi',
                  'english',
                  'malayalam',
                  'kannada',
                  'tamil'
                )
        )::int AS other
      FROM songs
    `);


    const languageStats = languageResult.rows[0] || {};

    const totalLanguageSongs =
      Number(languageStats.total || 0);


    const createLanguageItem = (
      name,
      key
    ) => {
      const count = Number(
        languageStats[key] || 0
      );

      const percentage =
        totalLanguageSongs > 0
          ? Number(
              (
                (count / totalLanguageSongs) *
                100
              ).toFixed(1)
            )
          : 0;

      return {
        language: name,
        count,
        percentage,
      };
    };


    const languages = [
      createLanguageItem("Telugu", "telugu"),
      createLanguageItem("Hindi", "hindi"),
      createLanguageItem("English", "english"),
      createLanguageItem("Malayalam", "malayalam"),
      createLanguageItem("Kannada", "kannada"),
      createLanguageItem("Tamil", "tamil"),
      createLanguageItem("Other", "other"),
    ];


    /* =====================================================
       TODAY'S STATISTICS
    ===================================================== */

    const todayResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Telugu')
        )::int AS telugu,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Hindi')
        )::int AS hindi,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('English')
        )::int AS english,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Malayalam')
        )::int AS malayalam,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Kannada')
        )::int AS kannada,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Tamil')
        )::int AS tamil
      FROM songs
      WHERE created_at::date = CURRENT_DATE
    `);


    const today = todayResult.rows[0] || {};


    /* =====================================================
       MONTH RANGE
    ===================================================== */

    let monthStartExpression = `
      date_trunc('month', CURRENT_DATE)
    `;

    let nextMonthExpression = `
      date_trunc('month', CURRENT_DATE)
      + INTERVAL '1 month'
    `;

    if (validMonth) {
      monthStartExpression = `
        TO_DATE($1, 'YYYY-MM')
      `;

      nextMonthExpression = `
        TO_DATE($1, 'YYYY-MM')
        + INTERVAL '1 month'
      `;
    }


    /* =====================================================
       CALENDAR DAILY STATISTICS
    ===================================================== */

    const calendarQuery = `
      SELECT
        created_at::date AS date,

        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Telugu')
        )::int AS telugu,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Hindi')
        )::int AS hindi,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('English')
        )::int AS english,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Malayalam')
        )::int AS malayalam,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Kannada')
        )::int AS kannada,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Tamil')
        )::int AS tamil

      FROM songs

      WHERE created_at >= ${monthStartExpression}
        AND created_at < ${nextMonthExpression}

      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `;


    const calendarParams =
      validMonth
        ? [validMonth]
        : [];


    const calendarResult = await pool.query(
      calendarQuery,
      calendarParams
    );


    const calendar = calendarResult.rows.map(
      (row) => ({
        date: row.date,
        total: Number(row.total || 0),
        telugu: Number(row.telugu || 0),
        hindi: Number(row.hindi || 0),
        english: Number(row.english || 0),
        malayalam: Number(row.malayalam || 0),
        kannada: Number(row.kannada || 0),
        tamil: Number(row.tamil || 0),
      })
    );


    /* =====================================================
       ADMIN CONTRIBUTIONS - ALL TIME
    ===================================================== */

    const adminContributionResult =
      await pool.query(`
        SELECT
          u.id AS admin_id,
          u.name AS admin_name,
          u.email AS admin_email,

          COUNT(s.id)::int AS total_songs,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Telugu')
          )::int AS telugu,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Hindi')
          )::int AS hindi,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('English')
          )::int AS english,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Malayalam')
          )::int AS malayalam,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Kannada')
          )::int AS kannada,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Tamil')
          )::int AS tamil

        FROM songs s

        INNER JOIN users u
          ON u.id = s.created_by

        WHERE UPPER(u.role) = 'ADMIN'

        GROUP BY
          u.id,
          u.name,
          u.email

        ORDER BY total_songs DESC
      `);


    const adminContributions =
      adminContributionResult.rows.map(
        (row) => ({
          adminId: row.admin_id,
          adminName: row.admin_name,
          adminEmail: row.admin_email,

          totalSongs:
            Number(row.total_songs || 0),

          languages: {
            Telugu:
              Number(row.telugu || 0),

            Hindi:
              Number(row.hindi || 0),

            English:
              Number(row.english || 0),

            Malayalam:
              Number(row.malayalam || 0),

            Kannada:
              Number(row.kannada || 0),

            Tamil:
              Number(row.tamil || 0),
          },
        })
      );


    /* =====================================================
       UNASSIGNED / OLD SONGS
       Songs created before created_by was implemented
    ===================================================== */

    const unassignedResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Telugu')
        )::int AS telugu,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Hindi')
        )::int AS hindi,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('English')
        )::int AS english,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Malayalam')
        )::int AS malayalam,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Kannada')
        )::int AS kannada,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(language, '')))
          = LOWER('Tamil')
        )::int AS tamil

      FROM songs
      WHERE created_by IS NULL
    `);


    const unassigned =
      unassignedResult.rows[0] || {};


    /* =====================================================
       SELECTED DATE
    ===================================================== */

    let selectedDateExpression =
      "CURRENT_DATE";

    let selectedDateParams = [];

    if (validDate) {
      selectedDateExpression =
        "$1::date";

      selectedDateParams = [
        validDate,
      ];
    }


    const selectedDateResult =
      await pool.query(
        `
        SELECT
          COUNT(*)::int AS total,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('Telugu')
          )::int AS telugu,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('Hindi')
          )::int AS hindi,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('English')
          )::int AS english,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('Malayalam')
          )::int AS malayalam,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('Kannada')
          )::int AS kannada,

          COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(language, '')))
            = LOWER('Tamil')
          )::int AS tamil

        FROM songs
        WHERE created_at::date = ${selectedDateExpression}
        `,
        selectedDateParams
      );


    const selectedDate =
      selectedDateResult.rows[0] || {};


    /* =====================================================
       SELECTED DATE - ADMIN BREAKDOWN
    ===================================================== */

    const selectedDateAdminsResult =
      await pool.query(
        `
        SELECT
          u.id AS admin_id,
          u.name AS admin_name,
          u.email AS admin_email,

          COUNT(s.id)::int AS total_songs,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Telugu')
          )::int AS telugu,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Hindi')
          )::int AS hindi,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('English')
          )::int AS english,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Malayalam')
          )::int AS malayalam,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Kannada')
          )::int AS kannada,

          COUNT(s.id) FILTER (
            WHERE LOWER(TRIM(COALESCE(s.language, '')))
            = LOWER('Tamil')
          )::int AS tamil

        FROM songs s

        INNER JOIN users u
          ON u.id = s.created_by

        WHERE UPPER(u.role) = 'ADMIN'
          AND s.created_at::date = ${validDate
            ? "$1::date"
            : "CURRENT_DATE"}

        GROUP BY
          u.id,
          u.name,
          u.email

        ORDER BY total_songs DESC
        `,
        validDate
          ? [validDate]
          : []
      );


    const selectedDateAdmins =
      selectedDateAdminsResult.rows.map(
        (row) => ({
          adminId: row.admin_id,
          adminName: row.admin_name,
          adminEmail: row.admin_email,

          totalSongs:
            Number(row.total_songs || 0),

          languages: {
            Telugu:
              Number(row.telugu || 0),

            Hindi:
              Number(row.hindi || 0),

            English:
              Number(row.english || 0),

            Malayalam:
              Number(row.malayalam || 0),

            Kannada:
              Number(row.kannada || 0),

            Tamil:
              Number(row.tamil || 0),
          },
        })
      );


    /* =====================================================
       LISTENING
    ===================================================== */

    const totalPlaysResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM listening_history
    `);

    const completedPlaysResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM listening_history
      WHERE completed = true
    `);

    const totalListeningTimeResult =
      await pool.query(`
        SELECT COALESCE(
          SUM(progress_seconds),
          0
        )::bigint AS total_seconds
        FROM listening_history
      `);


    /* =====================================================
       LIKES
    ===================================================== */

    const totalLikesResult = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM liked_songs
    `);


    /* =====================================================
       PLAYLISTS
    ===================================================== */

    const totalPlaylistsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM playlists
      `);

    const totalPlaylistSongsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM playlist_songs
      `);


    /* =====================================================
       SUBSCRIPTIONS
    ===================================================== */

    const totalSubscriptionsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM subscriptions
      `);

    const activeSubscriptionsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM subscriptions
        WHERE LOWER(status) = 'active'
      `);


    /* =====================================================
       PAYMENTS
    ===================================================== */

    const totalPaymentsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM payments
      `);

    const successfulPaymentsResult =
      await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM payments
        WHERE LOWER(status) IN (
          'success',
          'successful',
          'paid',
          'completed'
        )
      `);

    const totalRevenueResult =
      await pool.query(`
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


    /* =====================================================
       RECENT USERS
    ===================================================== */

    const recentUsersResult =
      await pool.query(`
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


    /* =====================================================
       TOP SONGS
    ===================================================== */

    const topSongsResult =
      await pool.query(`
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


    /* =====================================================
       TOP LIKED SONGS
    ===================================================== */

    const topLikedSongsResult =
      await pool.query(`
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


    /* =====================================================
       RECENT LISTENING
    ===================================================== */

    const recentListeningResult =
      await pool.query(`
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


    /* =====================================================
       LISTENING TIME
    ===================================================== */

    const totalListeningSeconds =
      Number(
        totalListeningTimeResult.rows[0]
          ?.total_seconds || 0
      );

    const totalListeningMinutes =
      Math.floor(
        totalListeningSeconds / 60
      );

    const totalListeningHours =
      Math.floor(
        totalListeningSeconds / 3600
      );


    /* =====================================================
       FINAL STATISTICS
    ===================================================== */

    const statistics = {

      /* ---------------------------------------------------
         USERS
      --------------------------------------------------- */

      users: {
        total:
          Number(
            totalUsersResult.rows[0]?.count || 0
          ),

        businessOwners:
          Number(
            businessOwnersResult.rows[0]?.count || 0
          ),

        admins:
          Number(
            adminUsersResult.rows[0]?.count || 0
          ),

        normalUsers:
          Number(
            normalUsersResult.rows[0]?.count || 0
          ),
      },


      /* ---------------------------------------------------
         MUSIC
      --------------------------------------------------- */

      music: {
        totalSongs:
          Number(
            totalSongsResult.rows[0]?.count || 0
          ),

        featuredSongs:
          Number(
            featuredSongsResult.rows[0]?.count || 0
          ),

        totalAlbums:
          Number(
            totalAlbumsResult.rows[0]?.count || 0
          ),

        totalArtists:
          Number(
            totalArtistsResult.rows[0]?.count || 0
          ),

        totalCategories:
          Number(
            totalCategoriesResult.rows[0]?.count || 0
          ),
      },


      /* ---------------------------------------------------
         LANGUAGE
      --------------------------------------------------- */

      languages,
      /* ---------------------------------------------------
   MUSIC COLLECTION BY LANGUAGE
--------------------------------------------------- */

musicByLanguage,


      /* ---------------------------------------------------
         TODAY
      --------------------------------------------------- */

      today: {
        total:
          Number(today.total || 0),

        Telugu:
          Number(today.telugu || 0),

        Hindi:
          Number(today.hindi || 0),

        English:
          Number(today.english || 0),

        Malayalam:
          Number(today.malayalam || 0),

        Kannada:
          Number(today.kannada || 0),

        Tamil:
          Number(today.tamil || 0),
      },


      /* ---------------------------------------------------
         ADMIN CONTRIBUTIONS
      --------------------------------------------------- */

      adminContributions,


      /* ---------------------------------------------------
         OLD / UNASSIGNED SONGS
      --------------------------------------------------- */

      unassignedSongs: {
        total:
          Number(unassigned.total || 0),

        Telugu:
          Number(unassigned.telugu || 0),

        Hindi:
          Number(unassigned.hindi || 0),

        English:
          Number(unassigned.english || 0),

        Malayalam:
          Number(unassigned.malayalam || 0),

        Kannada:
          Number(unassigned.kannada || 0),

        Tamil:
          Number(unassigned.tamil || 0),
      },


      /* ---------------------------------------------------
         CALENDAR
      --------------------------------------------------- */

      calendar: {
        month:
          validMonth ||
          new Date().toISOString().slice(0, 7),

        days: calendar,
      },


      /* ---------------------------------------------------
         SELECTED DATE
      --------------------------------------------------- */

      selectedDate: {
        date:
          validDate ||
          new Date().toISOString().slice(0, 10),

        total:
          Number(selectedDate.total || 0),

        languages: {
          Telugu:
            Number(selectedDate.telugu || 0),

          Hindi:
            Number(selectedDate.hindi || 0),

          English:
            Number(selectedDate.english || 0),

          Malayalam:
            Number(selectedDate.malayalam || 0),

          Kannada:
            Number(selectedDate.kannada || 0),

          Tamil:
            Number(selectedDate.tamil || 0),
        },

        admins:
          selectedDateAdmins,
      },


      /* ---------------------------------------------------
         LISTENING
      --------------------------------------------------- */

      listening: {
        totalPlays:
          Number(
            totalPlaysResult.rows[0]?.count || 0
          ),

        completedPlays:
          Number(
            completedPlaysResult.rows[0]?.count || 0
          ),

        totalListeningSeconds,

        totalListeningMinutes,

        totalListeningHours,
      },


      /* ---------------------------------------------------
         LIKES
      --------------------------------------------------- */

      likes: {
        totalLikes:
          Number(
            totalLikesResult.rows[0]?.count || 0
          ),
      },


      /* ---------------------------------------------------
         PLAYLISTS
      --------------------------------------------------- */

      playlists: {
        totalPlaylists:
          Number(
            totalPlaylistsResult.rows[0]?.count || 0
          ),

        totalPlaylistSongs:
          Number(
            totalPlaylistSongsResult.rows[0]?.count || 0
          ),
      },


      /* ---------------------------------------------------
         SUBSCRIPTIONS
      --------------------------------------------------- */

      subscriptions: {
        totalSubscriptions:
          Number(
            totalSubscriptionsResult.rows[0]?.count || 0
          ),

        activeSubscriptions:
          Number(
            activeSubscriptionsResult.rows[0]?.count || 0
          ),
      },


      /* ---------------------------------------------------
         PAYMENTS
      --------------------------------------------------- */

      payments: {
        totalPayments:
          Number(
            totalPaymentsResult.rows[0]?.count || 0
          ),

        successfulPayments:
          Number(
            successfulPaymentsResult.rows[0]?.count || 0
          ),

        totalRevenue:
          Number(
            totalRevenueResult.rows[0]
              ?.total_revenue || 0
          ),
      },


      /* ---------------------------------------------------
         RECENT DATA
      --------------------------------------------------- */

      recentUsers:
        recentUsersResult.rows,

      topSongs:
        topSongsResult.rows,

      topLikedSongs:
        topLikedSongsResult.rows,

      recentListening:
        recentListeningResult.rows,
    };


    /* =====================================================
       RESPONSE
    ===================================================== */

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
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
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