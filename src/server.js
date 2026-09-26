// =========================================================
// server.js
// KEERTHANA - Backend Server
// =========================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// =========================================================
// DATABASE
// =========================================================

const pool = require("./config/db");

// =========================================================
// ROUTES
// =========================================================

const authRoutes = require("./routes/authRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const songRoutes = require("./routes/songRoutes");
const likedSongRoutes = require("./routes/likedSongRoutes");
const playlistRoutes = require("./routes/playlistRoutes");
const artistRoutes = require("./routes/artistRoutes");
const albumRoutes = require("./routes/albumRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const ministryRoutes = require("./routes/ministryRoutes");
const historyRoutes = require("./routes/historyRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const aiRoutes = require("./routes/aiRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");

// =========================================================
// ADMIN ROUTES
// =========================================================

const adminRoutes = require("./routes/adminRoutes");
const adminSongRoutes = require("./routes/adminSongRoutes");
const adminArtistRoutes = require("./routes/adminArtistRoutes");
const adminAlbumRoutes = require("./routes/adminAlbumRoutes");
const adminCategoryRoutes = require("./routes/adminCategoryRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminMinistryRoutes = require("./routes/adminMinistryRoutes");

// =========================================================
// EXPRESS APP
// =========================================================

const app = express();

// =========================================================
// PORT
// =========================================================

const PORT = process.env.PORT || 5000;

// =========================================================
// CORS
// =========================================================

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  })
);

// =========================================================
// BODY PARSER
// =========================================================

app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

// =========================================================
// REQUEST LOGGER
// =========================================================

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

// =========================================================
// STATIC FILES
// =========================================================

// ---------------------------------------------------------
// UPLOADS
// backend/src/uploads
// ---------------------------------------------------------

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
);

// =========================================================
// AUDIO FILES
// =========================================================
//
// server.js:
// backend/src/server.js
//
// Audio folder:
// backend/public/audio
//
// Therefore:
// __dirname = backend/src
//
// Correct audio path:
// backend/src/../public/audio
//
// Browser URL:
// http://localhost:5000/media/audio/file.mp3
// =========================================================

const audioPath = path.join(
  __dirname,
  "..",
  "public",
  "audio"
);

console.log(
  "========================================"
);

console.log(
  "AUDIO FOLDER:",
  audioPath
);

console.log(
  "AUDIO FOLDER EXISTS:",
  fs.existsSync(audioPath)
);

console.log(
  "========================================"
);

// =========================================================
// AUDIO ROUTE
// =========================================================

app.get(
  "/media/audio/:filename",
  (req, res) => {

    try {

      const filename =
        req.params.filename;

      // Prevent path traversal
      const safeFilename =
        path.basename(filename);

      const filePath =
        path.join(
          audioPath,
          safeFilename
        );

      console.log(
        "========================================"
      );

      console.log(
        "AUDIO REQUEST:",
        filename
      );

      console.log(
        "AUDIO FILE PATH:",
        filePath
      );

      console.log(
        "AUDIO FILE EXISTS:",
        fs.existsSync(filePath)
      );

      console.log(
        "========================================"
      );

      // ---------------------------------------------------
      // FILE NOT FOUND
      // ---------------------------------------------------

      if (
        !fs.existsSync(filePath)
      ) {

        return res.status(404).json({
          success: false,
          message: "Audio file not found",
          filename: safeFilename,
          filePath: filePath,
        });

      }

      // ---------------------------------------------------
      // FILE INFORMATION
      // ---------------------------------------------------

      const stat =
        fs.statSync(filePath);

      if (!stat.isFile()) {

        return res.status(404).json({
          success: false,
          message: "Audio path is not a file",
          filename: safeFilename,
        });

      }

      // ---------------------------------------------------
      // AUDIO HEADERS
      // ---------------------------------------------------

      res.setHeader(
        "Content-Type",
        "audio/mpeg"
      );

      res.setHeader(
        "Accept-Ranges",
        "bytes"
      );

      res.setHeader(
        "Content-Length",
        stat.size
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=3600"
      );

      // ---------------------------------------------------
      // STREAM AUDIO
      // ---------------------------------------------------

      const stream =
        fs.createReadStream(
          filePath
        );

      stream.on(
        "error",
        (error) => {

          console.error(
            "AUDIO STREAM ERROR:",
            error
          );

          if (
            !res.headersSent
          ) {

            res.status(500).json({
              success: false,
              message:
                "Audio streaming failed",
            });

          }

        }
      );

      stream.pipe(res);

    } catch (error) {

      console.error(
        "AUDIO ROUTE ERROR:",
        error
      );

      if (
        !res.headersSent
      ) {

        res.status(500).json({
          success: false,
          message:
            "Audio server error",
          error:
            error.message,
        });

      }

    }

  }
);

// =========================================================
// PUBLIC FILES
// =========================================================
//
// backend/public
//
// Browser:
// http://localhost:5000/public/...
// =========================================================

app.use(
  "/public",
  express.static(
    path.join(
      __dirname,
      "..",
      "public"
    )
  )
);

// =========================================================
// ASSETS
// =========================================================

app.use(
  "/assets",
  express.static(
    path.join(
      __dirname,
      "assets"
    )
  )
);

// =========================================================
// HEALTH CHECK
// =========================================================

app.get(
  "/",
  (req, res) => {

    res.json({
      success: true,
      message:
        "KEERTHANA API server is running",
      port: PORT,
    });

  }
);

// =========================================================
// API HEALTH CHECK
// =========================================================

app.get(
  "/api",
  (req, res) => {

    res.json({
      success: true,
      message:
        "KEERTHANA API is working",
    });

  }
);

// =========================================================
// AUTH ROUTES
// =========================================================

app.use(
  "/api/auth",
  authRoutes
);

// =========================================================
// BUSINESS OWNER ROUTES
// =========================================================

app.use(
  "/api/owner",
  ownerRoutes
);

// =========================================================
// PUBLIC SONG ROUTES
// =========================================================

app.use(
  "/api/songs",
  songRoutes
);

// =========================================================
// LIKED SONG ROUTES
// =========================================================

app.use(
  "/api/liked-songs",
  likedSongRoutes
);

// =========================================================
// PLAYLIST ROUTES
// =========================================================

app.use(
  "/api/playlists",
  playlistRoutes
);

// =========================================================
// ARTIST ROUTES
// =========================================================

app.use(
  "/api/artists",
  artistRoutes
);

// =========================================================
// ALBUM ROUTES
// =========================================================

app.use(
  "/api/albums",
  albumRoutes
);

// =========================================================
// CATEGORY ROUTES
// =========================================================

app.use(
  "/api/categories",
  categoryRoutes
);

// =========================================================
// MINISTRY ROUTES
// =========================================================

app.use(
  "/api/ministries",
  ministryRoutes
);

// =========================================================
// HISTORY ROUTES
// =========================================================

app.use(
  "/api/history",
  historyRoutes
);

// =========================================================
// SUBSCRIPTION ROUTES
// =========================================================

app.use(
  "/api/subscriptions",
  subscriptionRoutes
);

// =========================================================
// PAYMENT ROUTES
// =========================================================

app.use(
  "/api/payments",
  paymentRoutes
);

// =========================================================
// AI ROUTES
// =========================================================

app.use(
  "/api/ai",
  aiRoutes
);

// =========================================================
// STATISTICS ROUTES
// =========================================================

app.use(
  "/api/statistics",
  statisticsRoutes
);

// =========================================================
// ADMIN ROUTES
// =========================================================

app.use(
  "/api/admin",
  adminRoutes
);

// =========================================================
// ADMIN SONG ROUTES
// =========================================================

app.use(
  "/api/admin/songs",
  adminSongRoutes
);

// =========================================================
// ADMIN ARTIST ROUTES
// =========================================================

app.use(
  "/api/admin/artists",
  adminArtistRoutes
);

// =========================================================
// ADMIN ALBUM ROUTES
// =========================================================

app.use(
  "/api/admin/albums",
  adminAlbumRoutes
);

// =========================================================
// ADMIN CATEGORY ROUTES
// =========================================================

app.use(
  "/api/admin/categories",
  adminCategoryRoutes
);

// =========================================================
// ADMIN USER ROUTES
// =========================================================

app.use(
  "/api/admin/users",
  adminUserRoutes
);

// =========================================================
// ADMIN MINISTRY ROUTES
// =========================================================

app.use(
  "/api/admin/ministries",
  adminMinistryRoutes
);

// =========================================================
// 404 HANDLER
// =========================================================

app.use(
  (req, res) => {

    console.log(
      "404 - API route not found:",
      req.originalUrl
    );

    res.status(404).json({
      success: false,
      message:
        "API route not found",
      path:
        req.originalUrl,
    });

  }
);

// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use(
  (err, req, res, next) => {

    console.error(
      "GLOBAL SERVER ERROR:",
      err
    );

    res.status(
      err.status || 500
    ).json({
      success: false,
      message:
        err.message ||
        "Internal server error",
    });

  }
);

// =========================================================
// DATABASE CONNECTION TEST
// =========================================================

async function testDatabase() {

  try {

    const result =
      await pool.query(
        "SELECT NOW()"
      );

    console.log(
      "========================================"
    );

    console.log(
      "PostgreSQL connected successfully"
    );

    console.log(
      "Database time:",
      result.rows[0].now
    );

    console.log(
      "========================================"
    );

  } catch (error) {

    console.error(
      "PostgreSQL connection failed:"
    );

    console.error(
      error.message
    );

  }

}

// =========================================================
// START SERVER
// =========================================================

async function startServer() {

  try {

    await testDatabase();

    app.listen(
      PORT,
      () => {

        console.log(
          "========================================"
        );

        console.log(
          "KEERTHANA BACKEND SERVER STARTED"
        );

        console.log(
          `Server: http://localhost:${PORT}`
        );

        console.log(
          `API: http://localhost:${PORT}/api`
        );

        console.log(
          `Audio: http://localhost:${PORT}/media/audio`
        );

        console.log(
          "========================================"
        );

      }
    );

  } catch (error) {

    console.error(
      "Failed to start server:"
    );

    console.error(
      error
    );

    process.exit(1);

  }

}

// =========================================================
// START
// =========================================================

startServer();