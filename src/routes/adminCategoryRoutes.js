const express =
  require("express");


const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require(
  "../controllers/adminCategoryController"
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
   GET CATEGORIES
========================================================= */

router.get(
  "/",
  authMiddleware,
  adminOnly,
  getCategories
);


/* =========================================================
   CREATE CATEGORY
========================================================= */

router.post(
  "/",
  authMiddleware,
  adminOnly,
  createCategory
);


/* =========================================================
   UPDATE CATEGORY
========================================================= */

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  updateCategory
);


/* =========================================================
   DELETE CATEGORY
========================================================= */

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteCategory
);


module.exports =
  router;