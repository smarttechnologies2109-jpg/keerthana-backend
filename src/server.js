const express =
  require("express");

const cors =
  require("cors");

const dotenv =
  require("dotenv");

const path =
  require("path");


/* ========================================
   ENVIRONMENT VARIABLES
======================================== */

dotenv.config();


/* ========================================
   DATABASE
======================================== */

const pool =
  require("./config/db");


/* ========================================
   PUBLIC ROUTES
======================================== */

const songRoutes =
  require("./routes/songRoutes");

const authRoutes =
  require("./routes/authRoutes");

const likedSongRoutes =
  require("./routes/likedSongRoutes");

const playlistRoutes =
  require("./routes/playlistRoutes");

const artistRoutes =
  require("./routes/artistRoutes");

const albumRoutes =
  require("./routes/albumRoutes");

/*
  NEW:
  Public categories route
*/

const categoryRoutes =
  require("./routes/adminCategoryRoutes");

const historyRoutes =
  require("./routes/historyRoutes");


/* ========================================
   ADMIN ROUTES
======================================== */

const adminRoutes =
  require("./routes/adminRoutes");

const adminSongRoutes =
  require("./routes/adminSongRoutes");

const adminArtistRoutes =
  require("./routes/adminArtistRoutes");

const adminAlbumRoutes =
  require("./routes/adminAlbumRoutes");

const adminCategoryRoutes =
  require("./routes/adminCategoryRoutes");

const adminUserRoutes =
  require("./routes/adminUserRoutes");


/* ========================================
   SUBSCRIPTION / PAYMENT ROUTES
======================================== */

const subscriptionRoutes =
  require("./routes/subscriptionRoutes");

const paymentRoutes =
  require("./routes/paymentRoutes");


/* ========================================
   WEBHOOK ROUTES
======================================== */

const webhookRoutes =

  require("./routes/webhookRoutes");


  const aiRoutes = require("./routes/aiRoutes");

  const statisticsRoutes = require("./routes/statisticsRoutes");

/* ========================================
   EXPRESS APP
======================================== */

const app =
  express();


/* ========================================
   CORS
======================================== */

app.use(
  cors({
    origin:
      "http://localhost:5173",

    credentials:
      true,
  })
);


/* =========================================================
   RAZORPAY WEBHOOK

   IMPORTANT:
   This MUST be mounted BEFORE express.json().

   webhookRoutes uses express.raw()
   for Razorpay signature verification.
========================================================= */

app.use(
  "/api/webhooks",
  webhookRoutes
);


/* ========================================
   NORMAL BODY PARSERS
======================================== */

app.use(
  express.json()
);


app.use(
  express.urlencoded({
    extended:
      true,
  })
);
app.use("/api/ai", aiRoutes);

/* ========================================
   STATIC MEDIA
======================================== */

const publicPath =
  path.join(
    __dirname,
    "../public"
  );


console.log(
  "Public folder:",
  publicPath
);


app.use(
  "/media",
  express.static(
    publicPath
  )
);


/* ========================================
   HOME
======================================== */

app.get(
  "/",

  (req, res) => {

    res
      .status(200)
      .json({

        success:
          true,

        app:
          "KEERTHANA",

        message:
          "Welcome to KEERTHANA Christian Music API",

      });

  }
);


/* ========================================
   HEALTH CHECK
======================================== */

app.get(
  "/api/health",

  async (
    req,
    res
  ) => {

    try {

      await pool.query(
        "SELECT 1"
      );


      return res
        .status(200)
        .json({

          success:
            true,

          app:
            "KEERTHANA",

          server:
            "online",

          database:
            "connected",

        });

    } catch (error) {

      console.error(
        "Database health error:",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          app:
            "KEERTHANA",

          server:
            "online",

          database:
            "disconnected",

        });

    }

  }
);


/* ========================================
   PUBLIC API ROUTES
======================================== */


/* SONGS */

app.use(
  "/api/songs",
  songRoutes
);


/* AUTH */

app.use(
  "/api/auth",
  authRoutes
);


/* LIKED SONGS */

app.use(
  "/api/liked-songs",
  likedSongRoutes
);


/* PLAYLISTS */

app.use(
  "/api/playlists",
  playlistRoutes
);


/* ARTISTS */

app.use(
  "/api/artists",
  artistRoutes
);


/* ALBUMS */

app.use(
  "/api/albums",
  albumRoutes
);


/* ========================================
   CATEGORIES

   NEW PUBLIC ENDPOINT:

   GET /api/categories
======================================== */

app.use(
  "/api/categories",
  categoryRoutes
);


/* HISTORY */

app.use(
  "/api/history",
  historyRoutes
);


/* ========================================
   SUBSCRIPTIONS
======================================== */

app.use(
  "/api/subscriptions",
  subscriptionRoutes
);


/* ========================================
   PAYMENTS
======================================== */

app.use(
  "/api/payments",
  paymentRoutes
);


/* ========================================
   ADMIN API ROUTES
======================================== */


/* ADMIN DASHBOARD */

app.use(
  "/api/admin",
  adminRoutes
);


/* ADMIN SONGS */

app.use(
  "/api/admin/songs",
  adminSongRoutes
);


/* ADMIN ARTISTS */

app.use(
  "/api/admin/artists",
  adminArtistRoutes
);


/* ADMIN ALBUMS */

app.use(
  "/api/admin/albums",
  adminAlbumRoutes
);


/* ADMIN CATEGORIES */

app.use(
  "/api/admin/categories",
  adminCategoryRoutes
);


/* ADMIN USERS */

app.use(
  "/api/admin/users",
  adminUserRoutes
);

app.use("/api/statistics", statisticsRoutes);
/* ========================================
   404 HANDLER

   ALL API ROUTES MUST BE ABOVE THIS.
======================================== */

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        success:
          false,

        message:
          "API route not found",

        method:
          req.method,

        path:
          req.originalUrl,

      });

  }
);


/* ========================================
   GLOBAL ERROR HANDLER
======================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Server error:",
      error
    );


    return res
      .status(500)
      .json({

        success:
          false,

        message:
          "Internal server error",

      });

  }
);


/* ========================================
   SERVER PORT
======================================== */

const PORT =
  process.env.PORT ||
  5000;


/* ========================================
   START SERVER
======================================== */

app.listen(
  PORT,

  () => {

    console.log("");

    console.log(
      "=========================================="
    );

    console.log(
      "          🎵 KEERTHANA API 🎵"
    );

    console.log(
      "=========================================="
    );


    console.log(
      `Server: http://localhost:${PORT}`
    );

    console.log(
      `Health: http://localhost:${PORT}/api/health`
    );


    console.log(
      "------------------------------------------"
    );

    console.log(
      "PUBLIC"
    );


    console.log(
      `Songs: http://localhost:${PORT}/api/songs`
    );

    console.log(
      `Artists: http://localhost:${PORT}/api/artists`
    );

    console.log(
      `Albums: http://localhost:${PORT}/api/albums`
    );

    console.log(
      `Categories: http://localhost:${PORT}/api/categories`
    );


    console.log(
      "------------------------------------------"
    );

    console.log(
      "ADMIN"
    );


    console.log(
      `Dashboard: http://localhost:${PORT}/api/admin/dashboard`
    );

    console.log(
      `Admin Songs: http://localhost:${PORT}/api/admin/songs`
    );

    console.log(
      `Admin Artists: http://localhost:${PORT}/api/admin/artists`
    );

    console.log(
      `Admin Albums: http://localhost:${PORT}/api/admin/albums`
    );

    console.log(
      `Admin Categories: http://localhost:${PORT}/api/admin/categories`
    );

    console.log(
      `Admin Users: http://localhost:${PORT}/api/admin/users`
    );


    console.log(
      "------------------------------------------"
    );

    console.log(
      "AUTH"
    );


    console.log(
      `Register: POST http://localhost:${PORT}/api/auth/register`
    );

    console.log(
      `Login: POST http://localhost:${PORT}/api/auth/login`
    );

    console.log(
      `Profile: GET http://localhost:${PORT}/api/auth/me`
    );


    console.log(
      "------------------------------------------"
    );

    console.log(
      "PAYMENTS"
    );


    console.log(
      `Payments: http://localhost:${PORT}/api/payments`
    );

    console.log(
      `Subscriptions: http://localhost:${PORT}/api/subscriptions`
    );

    console.log(
      `Razorpay Webhook: POST http://localhost:${PORT}/api/webhooks/razorpay`
    );


    console.log(
      "=========================================="
    );

    console.log("");

  }
);