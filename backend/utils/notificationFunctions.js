const mongoose = require('mongoose');
const Notification = require('../models/notification');
const User = require('../models/user');
const { getActorUserId, isValidObjectId } = require('./identityUtils');

const getNotifications = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!isValidObjectId(userId)) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const rawLimit = req?.query?.limit;
        const parsedLimit = Number.parseInt(String(rawLimit ?? '50'), 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

        const notifications = await Notification.find({ toUserId: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('_id toUserId fromUserId fromUsername fromProfilePicture type message createdAt')
            .lean();

        const missingUsernameIds = Array.from(
            new Set(
                notifications
                    .filter((n) => !n.fromUsername && n.fromUserId)
                    .map((n) => String(n.fromUserId))
                    .filter((id) => isValidObjectId(id))
            )
        );

        const userIdToProfile = new Map();
        if (missingUsernameIds.length > 0) {
            const users = await User.find({ _id: { $in: missingUsernameIds } })
                .select('_id username profilePicture')
                .lean();
            for (const u of users) {
                userIdToProfile.set(String(u._id), {
                    username: u.username ? String(u.username) : 'User',
                    profilePicture: typeof u.profilePicture === 'string' ? u.profilePicture : '',
                });
            }
        }

        const normalized = notifications.map((n) => {
            const fromUserId = n.fromUserId ? String(n.fromUserId) : undefined;
            const username =
                typeof n.fromUsername === 'string' && n.fromUsername.trim().length > 0
                    ? n.fromUsername.trim()
                    : fromUserId && userIdToProfile.has(fromUserId)
                        ? userIdToProfile.get(fromUserId).username
                        : 'User';

            const profilePicture =
                typeof n.fromProfilePicture === 'string' && n.fromProfilePicture.trim().length > 0
                    ? n.fromProfilePicture.trim()
                    : fromUserId && userIdToProfile.has(fromUserId)
                        ? String(userIdToProfile.get(fromUserId).profilePicture || '')
                        : '';

            return {
                id: String(n._id),
                type: String(n.type),
                message: String(n.message),
                createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : undefined,
                fromUserId,
                username,
                profilePicture,
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
        if (!isValidObjectId(userId)) {
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
        if (!isValidObjectId(userId)) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const id = String(req?.params?.id ?? '').trim();
        if (!isValidObjectId(id)) {
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
