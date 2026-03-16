const express = require("express");
const router = express.Router();
const authController = require("../Controllers/AuthController");
const authMiddleware = require("../middleware/authMiddleware");

// Signup Flow
router.post("/send-signup-otp", authController.sendSignupOtp);
router.post("/verify-signup-otp", authController.verifySignupOtp);
router.post("/signup", authController.signUp);

// Login and Password Reset
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Protected routes
router.post("/logout", authMiddleware, authController.logout);
router.get("/profile", authMiddleware, authController.userProfile);

module.exports = router;
