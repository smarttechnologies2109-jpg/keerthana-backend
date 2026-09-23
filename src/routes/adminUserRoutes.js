const express =
  require("express");


const {
  getUsers,
  updateUserRole,
} = require(
  "../controllers/adminUserController"
);


const {
  authMiddleware,
  adminOnly,
} = require(
  "../middleware/authMiddleware"
);


const router =
  express.Router();


/* =========================================================
   GET ALL USERS

   GET /api/admin/users
========================================================= */

router.get(
  "/",
  authMiddleware,
  adminOnly,
  getUsers
);


/* =========================================================
   UPDATE USER ROLE

   PATCH /api/admin/users/:id/role
========================================================= */

router.patch(
  "/:id/role",
  authMiddleware,
  adminOnly,
  updateUserRole
);


module.exports =
  router;