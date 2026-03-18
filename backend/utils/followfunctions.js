const mongoose = require('mongoose');
const User = require('../models/user');
const { getIo, getUserRoom } = require('../services/notificationSocket');

// These handlers are meant to be mounted from backend/routes/authRoutes.js
// with authMiddleware so req.user.id is available.

const getTargetUserIdFromBody = (body) => {
    const raw = body?.targetUserId ?? body?.TargetUserId ?? body?.userId ?? body?.UserId;
    return String(raw ?? '').trim();
};

const getActorUserId = (req) => {
    // Prefer JWT identity.
    const fromToken = req?.user?.id;
    if (fromToken) {
        if (typeof fromToken === 'string') return fromToken.trim();

        // Handle cases where token payload might contain an ObjectId-like object.
        if (fromToken && typeof fromToken === 'object') {
            const anyId = fromToken;

            if (typeof anyId.$oid === 'string') return anyId.$oid.trim();
            if (typeof anyId._id === 'string') return anyId._id.trim();
            if (typeof anyId.id === 'string') return anyId.id.trim();

            // Common decoded ObjectId shapes:
            // - { _bsontype: 'ObjectId', id: { type: 'Buffer', data: [...] } }
            // - { id: { type: 'Buffer', data: [...] } }
            // - { type: 'Buffer', data: [...] }
            const bufferCandidate = anyId?.id ?? anyId;
            const data = bufferCandidate?.data;
            if (bufferCandidate && typeof bufferCandidate === 'object' && bufferCandidate.type === 'Buffer' && Array.isArray(data)) {
                try {
                    return Buffer.from(data).toString('hex');
                } catch {
                    // ignore
                }
            }

            // If the id is a raw byte array.
            if (Array.isArray(anyId?.id) && anyId.id.every((n) => Number.isInteger(n))) {
                try {
                    return Buffer.from(anyId.id).toString('hex');
                } catch {
                    // ignore
                }
            }
        }

        return String(fromToken).trim();
    }
    // Fallback (not recommended) if you ever call without authMiddleware.
    const fromBody = req?.body?.userId;
    return fromBody ? String(fromBody).trim() : '';
};

const validateIds = (actorUserId, targetUserId) => {
    if (!actorUserId) return { ok: false, status: 401, message: 'Unauthorized' };
    if (!mongoose.Types.ObjectId.isValid(String(actorUserId))) return { ok: false, status: 401, message: 'Unauthorized' };
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

        // Emit real-time notification to the target user's room.
        // Emitting to an empty room is a no-op, so we don't need an online check here.
        const io = getIo();
        if (io) {
            const actor = await User.findById(userId).select('_id username');
            const payload = {
                id: `${Date.now()}-${String(userId)}`,
                type: 'follow',
                username: actor?.username ? String(actor.username) : 'User',
                message: 'sent you a follow request',
                fromUserId: String(userId),
                createdAt: new Date().toISOString(),
            };

            const room = getUserRoom(targetUserId);
            // Helpful diagnostics: see whether the receiver is actually connected/registered.
            let roomSize = undefined;
            try {
                const sockets = await io.in(room).allSockets();
                roomSize = sockets?.size;
            } catch {
                // ignore
            }

            io.to(room).emit('new_notification', payload);
            console.log('[notifications] emitted follow notification', {
                toUserId: String(targetUserId),
                room,
                roomSize,
                fromUserId: String(userId),
            });
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