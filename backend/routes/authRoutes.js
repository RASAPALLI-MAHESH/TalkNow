const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

// Stricter per-IP limit on routes that send emails or check passwords and one-time codes.
const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Too many attempts. Please wait and try again." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});
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
const {
    getInbox,
    sendMessage,
    getConversationMessages,
    getConnectionCounters,
} = require('../utils/chatFunctions');
const { getNotifications, getUnreadCount, deleteNotification } = require("../utils/notificationFunctions");
const { markAsDelivered, markAsRead, getInbox: getMessageServiceInbox, getTotalUnread, recomputeUnread } = require('../services/messageService');
// Signup Flow
router.post("/send-signup-otp", credentialLimiter, authController.sendSignupOtp);
router.post("/verify-signup-otp", credentialLimiter, authController.verifySignupOtp);
router.get('/check-username', authController.checkUsernameAvailability);
router.post("/signup", credentialLimiter, authController.signUp);

// Login and Password Reset
router.post("/login", credentialLimiter, authController.login);
router.post("/forgot-password", credentialLimiter, authController.forgotPassword);
router.post("/reset-password", credentialLimiter, authController.resetPassword);
// Not under credentialLimiter: every device refreshes every 15 minutes, and many users can share one IP.
router.post("/refresh", authController.refresh);

// Protected routes
router.post("/logout", authMiddleware, authController.logout);
router.get("/profile", authMiddleware, authController.userProfile);
router.get("/profile/:userId", authMiddleware, authController.getUserProfile);
router.put("/updateProfile", authMiddleware, authController.updateProfile);

// follow  routes 
router.post("/follow", authMiddleware, followUser);
router.post("/unfollow", authMiddleware, unfollowUser);
router.post("/follow/accept", authMiddleware, acceptFollowRequest);
router.post("/follow/reject", authMiddleware, rejectFollowRequest);
router.get("/connections/mutual", authMiddleware, getMutualConnections);
router.get('/connections/counters', authMiddleware, getConnectionCounters);
router.get('/chats/inbox', authMiddleware, getInbox);
router.get('/messages/with/:peerId', authMiddleware, getConversationMessages);
router.post('/messages/send', authMiddleware, sendMessage);
router.post('/messages/read', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.body;
        if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });
        await markAsRead({ conversationId, userId: req.user._id });
        res.status(200).json({ message: 'Marked as read' });
    } catch (err) {
        console.error('Error marking as read:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
router.get("/notifications", authMiddleware, getNotifications);
router.get("/notifications/unread-count", authMiddleware, getUnreadCount);
router.delete("/notifications/:id", authMiddleware, deleteNotification);
router.get("/messages/unread-count", authMiddleware, async (req, res) => {
    try {
        const totalUnread = await getTotalUnread(req.user._id);
        res.json({ totalUnread });
    } catch (err) {
        console.error("Error fetching unread message count:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
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
router.post('/' , authMiddleware , async(req , res) => {
    const inbox = await getMessageServiceInbox(req.user._id);
    const totalUnread = await getTotalUnread(req.user._id);
    res.json({ inbox , totalUnread });
})
module.exports = router;
