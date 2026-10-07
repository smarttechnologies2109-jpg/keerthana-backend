
// =========================================================
// server.js
// KEERTHANA - Backend Server
// =========================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// =========================================================
// AWS S3
// =========================================================

const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

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
const userRoutes = require("./routes/userRoutes");

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
// SONG REPORT ROUTES
// =========================================================

const songReportRoutes = require("./routes/songReportRoutes");

// =========================================================
// NOTIFICATION ROUTES
// =========================================================

const notificationRoutes = require("./routes/notificationRoutes");

// =========================================================
// OWNER MUSIC ROUTES
// =========================================================

const ownerMusicRoutes = require("./routes/ownerMusicRoutes");

// =========================================================
// EXPRESS APP
// =========================================================

const app = express();

// =========================================================
// PORT
// =========================================================

const PORT = process.env.PORT || 5000;

// =========================================================
// AWS S3 CONFIGURATION
// =========================================================

const AWS_REGION =
  process.env.AWS_REGION || "ap-south-1";

const S3_BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  "keerthana-media-908209635187";

const s3 = new S3Client({
  region: AWS_REGION,
});

console.log("========================================");
console.log("S3 CONFIGURATION");
console.log("AWS REGION:", AWS_REGION);
console.log("S3 BUCKET:", S3_BUCKET_NAME);
console.log("========================================");

// =========================================================
// CORS
// =========================================================

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://main.d2g46r2zbmr5co.amplifyapp.com",
  ],

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  credentials: true,
};

// =========================================================
// CORS MIDDLEWARE
// =========================================================

app.use(cors(corsOptions));

// =========================================================
// EXPRESS 5 PREFLIGHT
// =========================================================

app.options(/.*/, cors(corsOptions));

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
  console.log(
    `${req.method} ${req.originalUrl}`
  );

  next();
});

// =========================================================
// STATIC LOCAL FILES
// =========================================================

// ---------------------------------------------------------
// LOCAL UPLOADS
// backend/src/uploads
// ---------------------------------------------------------

app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "uploads"
    )
  )
);

// =========================================================
// S3 MEDIA HELPERS
// =========================================================

// ---------------------------------------------------------
// Get MIME type
// ---------------------------------------------------------

function getContentType(filename) {
  const extension =
    path.extname(filename)
      .toLowerCase();

  const contentTypes = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",

    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };

  return (
    contentTypes[extension] ||
    "application/octet-stream"
  );
}

// ---------------------------------------------------------
// Get safe filename
// ---------------------------------------------------------

function getSafeFilename(filename) {
  return path.basename(
    filename || ""
  );
}

// =========================================================
// S3 AUDIO ROUTE
// =========================================================
//
// Database value:
// /media/audio/song.mp3
//
// Browser requests:
// /media/audio/song.mp3
//
// S3 object:
// audio/song.mp3
//
// Bucket remains PRIVATE.
// ECS task role reads the S3 object.
// =========================================================

app.get(
  "/media/audio/:filename",
  async (req, res) => {
    try {
      const filename =
        getSafeFilename(
          req.params.filename
        );

      if (!filename) {
        return res.status(400).json({
          success: false,
          message:
            "Audio filename is required",
        });
      }

      const key =
        `audio/${filename}`;

      console.log(
        "========================================"
      );

      console.log(
        "S3 AUDIO REQUEST"
      );

      console.log(
        "Filename:",
        filename
      );

      console.log(
        "S3 Key:",
        key
      );

      console.log(
        "Bucket:",
        S3_BUCKET_NAME
      );

      console.log(
        "========================================"
      );

      // ---------------------------------------------------
      // Check object information
      // ---------------------------------------------------

      const headResult =
        await s3.send(
          new HeadObjectCommand({
            Bucket:
              S3_BUCKET_NAME,
            Key: key,
          })
        );

      const fileSize =
        Number(
          headResult.ContentLength || 0
        );

      const contentType =
        headResult.ContentType ||
        getContentType(filename);

      // ---------------------------------------------------
      // RANGE REQUEST
      // ---------------------------------------------------

      const range =
        req.headers.range;

      let start = 0;
      let end =
        fileSize > 0
          ? fileSize - 1
          : 0;

      if (range) {
        const match =
          range.match(
            /bytes=(\d*)-(\d*)/
          );

        if (match) {
          const requestedStart =
            match[1] !== ""
              ? Number(match[1])
              : null;

          const requestedEnd =
            match[2] !== ""
              ? Number(match[2])
              : null;

          if (
            requestedStart !== null
          ) {
            start =
              requestedStart;
          }

          if (
            requestedEnd !== null
          ) {
            end =
              requestedEnd;
          }

          // ------------------------------------------------
          // Handle suffix range
          // Example: bytes=-500
          // ------------------------------------------------

          if (
            requestedStart === null &&
            requestedEnd !== null
          ) {
            const suffixLength =
              requestedEnd;

            start =
              Math.max(
                fileSize -
                  suffixLength,
                0
              );

            end =
              fileSize - 1;
          }

          // ------------------------------------------------
          // Validate range
          // ------------------------------------------------

          if (
            start < 0 ||
            start >= fileSize ||
            end < start
          ) {
            res.status(416);

            res.setHeader(
              "Content-Range",
              `bytes */${fileSize}`
            );

            return res.end();
          }

          end =
            Math.min(
              end,
              fileSize - 1
            );
        }
      }

      const contentLength =
        end - start + 1;

      // ---------------------------------------------------
      // S3 GET OBJECT
      // ---------------------------------------------------

      const getCommand =
        new GetObjectCommand({
          Bucket:
            S3_BUCKET_NAME,

          Key: key,

          ...(range
            ? {
                Range:
                  `bytes=${start}-${end}`,
              }
            : {}),
        });

      const result =
        await s3.send(
          getCommand
        );

      // ---------------------------------------------------
      // RESPONSE HEADERS
      // ---------------------------------------------------

      res.setHeader(
        "Content-Type",
        contentType
      );

      res.setHeader(
        "Accept-Ranges",
        "bytes"
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=3600"
      );

      res.setHeader(
        "Content-Length",
        contentLength
      );

      // ---------------------------------------------------
      // RANGE RESPONSE
      // ---------------------------------------------------

      if (range) {
        res.status(206);

        res.setHeader(
          "Content-Range",
          `bytes ${start}-${end}/${fileSize}`
        );
      }

      // ---------------------------------------------------
      // STREAM FROM S3
      // ---------------------------------------------------

      if (
        result.Body &&
        typeof result.Body.pipe ===
          "function"
      ) {
        result.Body.pipe(res);
      } else {
        const chunks = [];

        for await (
          const chunk of result.Body
        ) {
          chunks.push(chunk);
        }

        res.end(
          Buffer.concat(chunks)
        );
      }
    } catch (error) {
      console.error(
        "S3 AUDIO ERROR:",
        error
      );

      // ---------------------------------------------------
      // S3 NOT FOUND
      // ---------------------------------------------------

      if (
        error.name ===
          "NotFound" ||
        error.name ===
          "NoSuchKey" ||
        error.$metadata?.httpStatusCode ===
          404
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Audio file not found in S3",
        });
      }

      // ---------------------------------------------------
      // GENERAL ERROR
      // ---------------------------------------------------

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message:
            "S3 audio streaming failed",
          error:
            error.message,
        });
      }
    }
  }
);

// =========================================================
// S3 COVER IMAGE ROUTE
// =========================================================
//
// Database value:
// /media/images/cover.jpg
//
// Browser requests:
// /media/images/cover.jpg
//
// S3 object:
// covers/cover.jpg
//
// Bucket remains PRIVATE.
// =========================================================

app.get(
  "/media/images/:filename",
  async (req, res) => {
    try {
      const filename =
        getSafeFilename(
          req.params.filename
        );

      if (!filename) {
        return res.status(400).json({
          success: false,
          message:
            "Image filename is required",
        });
      }

      const key =
        `covers/${filename}`;

      console.log(
        "========================================"
      );

      console.log(
        "S3 IMAGE REQUEST"
      );

      console.log(
        "Filename:",
        filename
      );

      console.log(
        "S3 Key:",
        key
      );

      console.log(
        "Bucket:",
        S3_BUCKET_NAME
      );

      console.log(
        "========================================"
      );

      // ---------------------------------------------------
      // GET IMAGE
      // ---------------------------------------------------

      const command =
        new GetObjectCommand({
          Bucket:
            S3_BUCKET_NAME,

          Key: key,
        });

      const result =
        await s3.send(
          command
        );

      // ---------------------------------------------------
      // RESPONSE HEADERS
      // ---------------------------------------------------

      res.setHeader(
        "Content-Type",
        result.ContentType ||
          getContentType(filename)
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=86400"
      );

      if (
        result.ContentLength !==
        undefined
      ) {
        res.setHeader(
          "Content-Length",
          result.ContentLength
        );
      }

      // ---------------------------------------------------
      // STREAM IMAGE
      // ---------------------------------------------------

      if (
        result.Body &&
        typeof result.Body.pipe ===
          "function"
      ) {
        result.Body.pipe(res);
      } else {
        const chunks = [];

        for await (
          const chunk of result.Body
        ) {
          chunks.push(chunk);
        }

        res.end(
          Buffer.concat(chunks)
        );
      }
    } catch (error) {
      console.error(
        "S3 IMAGE ERROR:",
        error
      );

      if (
        error.name ===
          "NotFound" ||
        error.name ===
          "NoSuchKey" ||
        error.$metadata?.httpStatusCode ===
          404
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Cover image not found in S3",
        });
      }

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message:
            "S3 image loading failed",
          error:
            error.message,
        });
      }
    }
  }
);

// =========================================================
// PUBLIC LOCAL FILES
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
// LOCAL ASSETS
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
// USER PROFILE ROUTES
// =========================================================

app.use(
  "/api/users",
  userRoutes
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
// SONG REPORT ROUTES
// =========================================================

app.use(
  "/api/song-reports",
  songReportRoutes
);

// =========================================================
// NOTIFICATION ROUTES
// =========================================================

app.use(
  "/api/notifications",
  notificationRoutes
);

// =========================================================
// OWNER MUSIC ROUTES
// =========================================================

app.use(
  "/api/owner/music",
  ownerMusicRoutes
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
          `Images: http://localhost:${PORT}/media/images`
        );

        console.log(
          "S3 Bucket:",
          S3_BUCKET_NAME
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

