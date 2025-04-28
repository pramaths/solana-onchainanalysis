const express = require("express");
const router = express.Router();

const ethRoutes = require("./ethereumRoutes");
const commonRoutes = require("./commonRoutes");
const solanaRoutes = require("./solanaRoutes");

router.use('/sol', solanaRoutes);
router.use('/crypto', commonRoutes);
router.use('/', ethRoutes);


module.exports = router;
