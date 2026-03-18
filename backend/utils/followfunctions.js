const mongoose = require('mongoose');
const User = require('../models/user');
const { OnlineUsers, getIo } = require('../services/notificationSocket');

// These handlers are meant to be mounted from backend/routes/authRoutes.js
// with authMiddleware so req.user.id is available.

const getTargetUserIdFromBody = (body) => {
    const raw = body?.targetUserId ?? body?.TargetUserId ?? body?.userId ?? body?.UserId;
    return String(raw ?? '').trim();
};

const getActorUserId = (req) => {
    // Prefer JWT identity.
    const fromToken = req?.user?.id;
    if (fromToken) return String(fromToken);
    // Fallback (not recommended) if you ever call without authMiddleware.
    const fromBody = req?.body?.userId;
    return fromBody ? String(fromBody).trim() : '';
};

const validateIds = (actorUserId, targetUserId) => {
    if (!actorUserId) return { ok: false, status: 401, message: 'Unauthorized' };
    if (!targetUserId) return { ok: false, status: 400, message: 'targetUserId is required' };
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return { ok: false, status: 400, message: 'Invalid targetUserId' };
    if (String(actorUserId) === String(targetUserId)) return { ok: false, status: 400, message: 'You cannot follow yourself' };
    return { ok: true };
};

const followUser = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        const targetUserId = getTargetUserIdFromBody(req.body);

        const v = validateIds(userId, targetUserId);
        if (!v.ok) return res.status(v.status).json({ message: v.message });

        const target = await User.findById(targetUserId).select('_id');
        if (!target) return res.status(404).json({ message: 'Target user not found' });

        await User.findByIdAndUpdate(userId, { $addToSet: { following: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $addToSet: { followers: userId } });

        // Emit real-time notification if the user is online.
        const targetSocketId = OnlineUsers.get(String(targetUserId));
        if (targetSocketId) {
            const actor = await User.findById(userId).select('_id username');
            const payload = {
                id: `${Date.now()}-${String(userId)}`,
                type: 'follow',
                username: actor?.username ? String(actor.username) : 'User',
                message: 'sent you a follow request',
                fromUserId: String(userId),
                createdAt: new Date().toISOString(),
            };

            const io = getIo();
            if (io) {
                io.to(targetSocketId).emit('new_notification', payload);
            }
        }

        return res.status(200).json({ message: 'User followed successfully' });
    } catch (err) {
        console.error('Error following user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const unfollowUser = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        const targetUserId = getTargetUserIdFromBody(req.body);

        const v = validateIds(userId, targetUserId);
        if (!v.ok) {
            // Customize message for unfollow.
            const msg = v.message === 'You cannot follow yourself' ? 'You cannot unfollow yourself' : v.message;
            return res.status(v.status).json({ message: msg });
        }

        await User.findByIdAndUpdate(userId, { $pull: { following: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $pull: { followers: userId } });

        return res.status(200).json({ message: 'User unfollowed successfully' });
    } catch (err) {
        console.error('Error unfollowing user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { followUser, unfollowUser };