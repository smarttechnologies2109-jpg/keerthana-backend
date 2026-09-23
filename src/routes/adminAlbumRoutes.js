const express = require("express");

const {
  getAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
} = require("../controllers/adminAlbumController");

const {
  authMiddleware,
  adminOnly,
} = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");


const router = express.Router();


/* =========================================================
   GET ALL ALBUMS
   GET /api/admin/albums
========================================================= */

router.get(
  "/",
  authMiddleware,
  adminOnly,
  getAlbums
);


/* =========================================================
   CREATE ALBUM
   POST /api/admin/albums

   FormData:
   - title
   - artist_id
   - release_year
   - cover
========================================================= */

router.post(
  "/",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  createAlbum
);


/* =========================================================
   UPDATE ALBUM
   PUT /api/admin/albums/:id

   FormData:
   - title
   - artist_id
   - release_year
   - cover (optional)
========================================================= */

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  updateAlbum
);


/* =========================================================
   DELETE ALBUM
   DELETE /api/admin/albums/:id
========================================================= */

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteAlbum
);


module.exports = router;