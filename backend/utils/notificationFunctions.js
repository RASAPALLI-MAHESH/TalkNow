const mongoose = require('mongoose');
const Notification = require('../models/notification');
const User = require('../models/user');

const getActorUserId = (req) => {
    const fromToken = req?.user?.id;
    if (!fromToken) return '';

    if (typeof fromToken === 'string') return fromToken.trim();

    if (fromToken && typeof fromToken === 'object') {
        const anyId = fromToken;
        if (typeof anyId.$oid === 'string') return anyId.$oid.trim();
        if (typeof anyId._id === 'string') return anyId._id.trim();
        if (typeof anyId.id === 'string') return anyId.id.trim();

        const bufferCandidate = anyId?.id ?? anyId;
        const data = bufferCandidate?.data;
        if (bufferCandidate && typeof bufferCandidate === 'object' && bufferCandidate.type === 'Buffer' && Array.isArray(data)) {
            try {
                return Buffer.from(data).toString('hex');
            } catch {
                // ignore
            }
        }

        if (Array.isArray(anyId?.id) && anyId.id.every((n) => Number.isInteger(n))) {
            try {
                return Buffer.from(anyId.id).toString('hex');
            } catch {
                // ignore
            }
        }
    }

    return String(fromToken).trim();
};

const getNotifications = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const rawLimit = req?.query?.limit;
        const parsedLimit = Number.parseInt(String(rawLimit ?? '50'), 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

        const notifications = await Notification.find({ toUserId: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('_id toUserId fromUserId fromUsername type message createdAt')
            .lean();

        const missingUsernameIds = Array.from(
            new Set(
                notifications
                    .filter((n) => !n.fromUsername && n.fromUserId)
                    .map((n) => String(n.fromUserId))
                    .filter((id) => mongoose.Types.ObjectId.isValid(id))
            )
        );

        const userIdToUsername = new Map();
        if (missingUsernameIds.length > 0) {
            const users = await User.find({ _id: { $in: missingUsernameIds } }).select('_id username').lean();
            for (const u of users) userIdToUsername.set(String(u._id), u.username ? String(u.username) : 'User');
        }

        const normalized = notifications.map((n) => {
            const fromUserId = n.fromUserId ? String(n.fromUserId) : undefined;
            const username =
                typeof n.fromUsername === 'string' && n.fromUsername.trim().length > 0
                    ? n.fromUsername.trim()
                    : fromUserId && userIdToUsername.has(fromUserId)
                        ? userIdToUsername.get(fromUserId)
                        : 'User';

            return {
                id: String(n._id),
                type: String(n.type),
                message: String(n.message),
                createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : undefined,
                fromUserId,
                username,
            };
        });

        return res.status(200).json({ notifications: normalized });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const sinceRaw = typeof req?.query?.since === 'string' ? req.query.since : '';
        const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
        if (!Number.isFinite(sinceMs)) {
            return res.status(200).json({ unread: 0 });
        }

        const unread = await Notification.countDocuments({
            toUserId: userId,
            createdAt: { $gt: new Date(sinceMs) },
        });

        return res.status(200).json({ unread });
    } catch (err) {
        console.error('Error fetching unread notification count:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const id = String(req?.params?.id ?? '').trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid notification id' });
        }

        const result = await Notification.deleteOne({ _id: id, toUserId: userId });
        if (!result?.deletedCount) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Error deleting notification:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { getNotifications, getUnreadCount, deleteNotification };
