const express = require("express");
const router = express.Router();
const authController = require("../Controllers/AuthController");
const authMiddleware = require("../middleware/authMiddleware");
const { searchUsers } = require("../searchUsers");
const {
    followUser,
    unfollowUser,
    acceptFollowRequest,
    rejectFollowRequest,
    getMutualConnections,
} = require("../utils/followfunctions");
const { getNotifications, getUnreadCount, deleteNotification } = require("../utils/notificationFunctions");

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

// follow  routes 
router.post("/follow", authMiddleware, followUser);
router.post("/unfollow", authMiddleware, unfollowUser);
router.post("/follow/accept", authMiddleware, acceptFollowRequest);
router.post("/follow/reject", authMiddleware, rejectFollowRequest);
router.get("/connections/mutual", authMiddleware, getMutualConnections);
router.get("/notifications", authMiddleware, getNotifications);
router.get("/notifications/unread-count", authMiddleware, getUnreadCount);
router.delete("/notifications/:id", authMiddleware, deleteNotification);
router.get("/search-users", authMiddleware, async (req, res) => {
    try{
        const {query} = req.query;
        if(!query || typeof query !== 'string' || !query.trim()){
            return res.json({ users: [] });
        }

        const users = await searchUsers(query, { limit: 20 });
        res.json({ users });
    }
    catch(err){
        console.error("Error searching users:", err);
        res.status(500).json({message : "Internal server error"});
    }

});
module.exports = router;
