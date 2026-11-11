
const express = require("express");

const {
  getArtists,
  createArtist,
  updateArtist,
  deleteArtist,
} = require("../controllers/adminArtistController");

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

const upload = require("../middleware/s3Upload");

const router = express.Router();

router.get("/artists", authMiddleware, adminOnly, getArtists);
router.post(
  "/artists",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  createArtist
);
router.put(
  "/artists/:id",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  updateArtist
);
router.delete("/artists/:id", authMiddleware, adminOnly, deleteArtist);

router.get("/albums", authMiddleware, adminOnly, getAlbums);
router.post(
  "/albums",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  createAlbum
);
router.put(
  "/albums/:id",
  authMiddleware,
  adminOnly,
  upload.single("cover"),
  updateAlbum
);
router.delete("/albums/:id", authMiddleware, adminOnly, deleteAlbum);

module.exports = router;
