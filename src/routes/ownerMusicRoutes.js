const express = require("express");

const router = express.Router();

const {
  getOwnerSongs,
  getOwnerAlbums,
  getOwnerArtists,
  getOwnerCategories,
  getOwnerMinistries,
} = require("../controllers/ownerMusicController");


/* =========================================================
   OWNER MUSIC ROUTES
========================================================= */

router.get(
  "/songs",
  getOwnerSongs
);


router.get(
  "/albums",
  getOwnerAlbums
);


router.get(
  "/artists",
  getOwnerArtists
);


router.get(
  "/categories",
  getOwnerCategories
);


router.get(
  "/ministries",
  getOwnerMinistries
);


module.exports = router;