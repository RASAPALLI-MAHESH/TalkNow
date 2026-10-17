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
    getRelationshipMap,
} = require("../utils/followfunctions");
const {
    getInbox,
    getConversationMessages,
    getConnectionCounters,
} = require('../utils/chatFunctions');
const { getNotifications, getUnreadCount, deleteNotification } = require("../utils/notificationFunctions");
const { markAsRead, getTotalUnread } = require('../services/messageService');
const { blockUser, unblockUser, listBlockedUsers, reportUser } = require('../utils/safetyFunctions');
const { listPending, acknowledgeMessages, acknowledgeResets } = require('../services/e2eeMessaging');
const { emitDeliveryStatuses } = require('../services/websocketServer');
const { isValidObjectId } = require("../utils/identityUtils");
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
router.post("/push-token", authMiddleware, authController.registerPushToken);
router.delete("/account", credentialLimiter, authMiddleware, authController.deleteAccount);

// Safety
router.post("/users/block", authMiddleware, blockUser);
router.post("/users/unblock", authMiddleware, unblockUser);
router.get("/users/blocked", authMiddleware, listBlockedUsers);
router.post("/reports", authMiddleware, reportUser);

// follow  routes 
router.post("/follow", authMiddleware, followUser);
router.post("/unfollow", authMiddleware, unfollowUser);
router.post("/follow/accept", authMiddleware, acceptFollowRequest);
router.post("/follow/reject", authMiddleware, rejectFollowRequest);
router.get("/connections/mutual", authMiddleware, getMutualConnections);
router.get('/connections/counters', authMiddleware, getConnectionCounters);
router.get('/chats/inbox', authMiddleware, getInbox);
router.get('/messages/with/:peerId', authMiddleware, getConversationMessages);
router.post('/messages/read', authMiddleware, async (req, res) => {
    try {
        const conversationId = String(req.body?.conversationId ?? '');
        if (!isValidObjectId(conversationId)) return res.status(400).json({ message: 'conversationId is required' });
        await markAsRead({ conversationId, userId: req.user.id });
        res.status(200).json({ message: 'Marked as read' });
    } catch (err) {
        console.error('Error marking as read:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Encrypted messages and session-reset requests waiting for this phone, oldest first.
router.get('/messages/pending', authMiddleware, async (req, res) => {
    try {
        const limitRaw = Number.parseInt(String(req.query?.limit ?? ''), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
        res.status(200).json(await listPending(req.user.id, limit));
    } catch (err) {
        console.error('Error listing pending messages:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// The phone stored these: the server deletes their ciphertext and marks them delivered.
router.post('/messages/ack', authMiddleware, async (req, res) => {
    try {
        const delivered = await acknowledgeMessages(req.user.id, req.body?.ids);
        emitDeliveryStatuses(delivered);
        const resets = await acknowledgeResets(req.user.id, req.body?.resetIds);
        res.status(200).json({ acknowledged: delivered.length, resets });
    } catch (err) {
        console.error('Error acknowledging messages:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
router.get("/notifications", authMiddleware, getNotifications);
router.get("/notifications/unread-count", authMiddleware, getUnreadCount);
router.delete("/notifications/:id", authMiddleware, deleteNotification);
router.get("/messages/unread-count", authMiddleware, async (req, res) => {
    try {
        const totalUnread = await getTotalUnread(req.user.id);
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
        const relationships = await getRelationshipMap(req.user.id, users.map((u) => u.id));
        res.json({
            users: users
                .map((u) => ({ ...u, relationship: relationships.get(u.id) ?? 'none' }))
                // People who blocked you don't show up.
                .filter((u) => u.relationship !== 'unavailable'),
        });
    }
    catch(err){
        console.error("Error searching users:", err);
        res.status(500).json({message : "Internal server error"});
    }

});
module.exports = router;
