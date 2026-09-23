const express =
  require("express");

const {
  getPlaylists,
  createPlaylist,
  getPlaylistById,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
} = require(
  "../controllers/playlistController"
);

const {
  authMiddleware,
} = require("../middleware/authMiddleware");


const router =
  express.Router();


/* ALL PLAYLIST ROUTES REQUIRE LOGIN */

router.use(authMiddleware);


/* GET ALL */

router.get(
  "/",
  getPlaylists
);


/* CREATE */

router.post(
  "/",
  createPlaylist
);


/* GET ONE */

router.get(
  "/:id",
  getPlaylistById
);


/* ADD SONG */

router.post(
  "/:id/songs/:songId",
  addSongToPlaylist
);


/* REMOVE SONG */

router.delete(
  "/:id/songs/:songId",
  removeSongFromPlaylist
);


/* DELETE PLAYLIST */

router.delete(
  "/:id",
  deletePlaylist
);


module.exports =
  router;