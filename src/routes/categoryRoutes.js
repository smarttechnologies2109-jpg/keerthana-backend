const express = require("express");

const {
  getCategories,
  getCategoryById,
} = require("../controllers/categoryController");

const router = express.Router();


/* =========================================================
   GET ALL CATEGORIES

   GET /api/categories
========================================================= */

router.get(
  "/",
  getCategories
);


/* =========================================================
   GET CATEGORY BY ID

   GET /api/categories/:id
========================================================= */

router.get(
  "/:id",
  getCategoryById
);


module.exports = router;