const mongoose = require('mongoose');
const Notification = require('../models/notification');

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

        const notifications = await Notification.find({ toUserId: userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate({ path: 'fromUserId', select: 'username' })
            .select('_id toUserId fromUserId type message createdAt');

        const normalized = notifications.map((n) => ({
            id: String(n._id),
            type: String(n.type),
            message: String(n.message),
            createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : undefined,
            fromUserId: n.fromUserId && typeof n.fromUserId === 'object' ? String(n.fromUserId._id) : undefined,
            username:
                n.fromUserId && typeof n.fromUserId === 'object' && n.fromUserId.username
                    ? String(n.fromUserId.username)
                    : 'User',
        }));

        return res.status(200).json({ notifications: normalized });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { getNotifications };
