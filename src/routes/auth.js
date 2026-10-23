const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const outletController = require('../controllers/outletController');
const { authenticate } = require('../middleware/auth');

router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty()
  ],
  authController.login
);

router.post(
  '/outletLogin',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array()
      });
    }

    next();
  },
  authController.outletLogin
);

router.get('/profile', authenticate, authController.getProfile);

module.exports = router;