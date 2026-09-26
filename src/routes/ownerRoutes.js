const express = require("express");

const router = express.Router();

const {
  getOwnerProfile,
  getOwnerUsers,
  getOwnerStatistics,
  createOwnerUser,
  updateOwnerUser,
  deleteOwnerUser,

  getOwnerMusic,
  createOwnerMusic,
  updateOwnerMusic,
  deleteOwnerMusic,
} = require("../controllers/ownerController");


/* =========================================================
   OWNER PROFILE
========================================================= */

router.get("/profile", getOwnerProfile);


/* =========================================================
   OWNER USERS
========================================================= */

router.get("/users", getOwnerUsers);

router.post("/users", createOwnerUser);

router.put("/users/:id", updateOwnerUser);

router.delete("/users/:id", deleteOwnerUser);


/* =========================================================
   OWNER STATISTICS
========================================================= */

router.get("/statistics", getOwnerStatistics);


/* =========================================================
   OWNER MUSIC
========================================================= */

router.get("/music", getOwnerMusic);

router.post("/music", createOwnerMusic);

router.put("/music/:id", updateOwnerMusic);

router.delete("/music/:id", deleteOwnerMusic);


module.exports = router;