const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * Authenticate user and return JWT token
 * @route POST /auth/login
 */
router.post('/login', authController.login);

/**
 * Refresh expired access token
 * @route POST /auth/refresh
 */
router.post('/refresh', authController.refresh);

module.exports = router;
