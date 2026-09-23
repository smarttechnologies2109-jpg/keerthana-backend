const express =
  require("express");

const {
  getAllAlbums,
  getAlbumById,
} = require(
  "../controllers/albumController"
);


const router =
  express.Router();


router.get(
  "/",
  getAllAlbums
);


router.get(
  "/:id",
  getAlbumById
);


module.exports =
  router;