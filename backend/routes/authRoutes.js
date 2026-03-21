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
const {
    getInbox,
    sendMessage,
    getConversationMessages,
    getConnectionCounters,
} = require('../utils/chatFunctions');
const { getNotifications, getUnreadCount, deleteNotification } = require("../utils/notificationFunctions");
const { markAsDelivered, markAsRead, getInbox: getMessageServiceInbox, getTotalUnread, recomputeUnread } = require('../services/messageService');
// Signup Flow
router.post("/send-signup-otp", authController.sendSignupOtp);
router.post("/verify-signup-otp", authController.verifySignupOtp);
router.get('/check-username', authController.checkUsernameAvailability);
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
