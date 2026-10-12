const User = require('../models/user');
const Block = require('../models/block');
const Report = require('../models/report');
const Connection = require('../models/connection');
const Notification = require('../models/notification');
const { emitToUser } = require('../services/websocketServer');
const { sendEmail, escapeHtml } = require('../services/otpService');
const { getActorUserId, isValidObjectId } = require('./identityUtils');

const { REPORT_REASONS } = Report;
const MAX_REPORTS_PER_DAY = 20;
const MAX_REPORT_DETAILS_CHARS = 1000;

const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

// True when either user has blocked the other.
const isBlockedEitherWay = async (a, b) =>
    !!(await Block.exists({
        $or: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
        ],
    }));

const readTarget = (req, res) => {
    const me = getActorUserId(req);
    const target = String(req.body?.targetUserId ?? '').trim();
    if (!isValidObjectId(me)) {
        res.status(401).json({ message: 'Unauthorized' });
        return null;
    }
    if (!isValidObjectId(target) || target === me) {
        res.status(400).json({ message: 'Invalid targetUserId' });
        return null;
    }
    return { me, target };
};

/**
 * Blocks a user: ends any connection or pending request between the two, removes the
 * notifications between them, and stops follow requests and messages in both directions.
 * The blocked user is not told.
 */
const blockUser = async (req, res) => {
    try {
        const ids = readTarget(req, res);
        if (!ids) return;
        const { me, target } = ids;

        if (!(await User.exists({ _id: target }))) return res.status(404).json({ message: 'User not found' });

        await Block.updateOne(
            { blockerId: me, blockedId: target },
            { $setOnInsert: { blockerId: me, blockedId: target } },
            { upsert: true }
        );
        await Connection.deleteOne({ pairKey: pairKeyOf(me, target) });
        await Notification.deleteMany({
            $or: [
                { toUserId: me, fromUserId: target },
                { toUserId: target, fromUserId: me },
            ],
        });
        await User.updateOne({ _id: me }, { $pull: { following: target, followers: target } });
        await User.updateOne({ _id: target }, { $pull: { following: me, followers: me } });

        // Both chat lists reload, so the conversation disappears for both.
        emitToUser(me, { type: 'badge_update' });
        emitToUser(target, { type: 'badge_update' });

        return res.status(200).json({ message: 'User blocked', relationship: 'blocked' });
    } catch (err) {
        console.error('Error blocking user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const unblockUser = async (req, res) => {
    try {
        const ids = readTarget(req, res);
        if (!ids) return;
        await Block.deleteOne({ blockerId: ids.me, blockedId: ids.target });
        return res.status(200).json({ message: 'User unblocked', relationship: 'none' });
    } catch (err) {
        console.error('Error unblocking user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const listBlockedUsers = async (req, res) => {
    try {
        const me = getActorUserId(req);
        if (!isValidObjectId(me)) return res.status(401).json({ message: 'Unauthorized' });

        const blocks = await Block.find({ blockerId: me }).sort({ createdAt: -1 }).limit(500).select('blockedId').lean();
        const users = await User.find({ _id: { $in: blocks.map((b) => b.blockedId) } })
            .select('_id username profilePicture')
            .lean();
        const byId = new Map(users.map((u) => [String(u._id), u]));

        const blocked = blocks
            .map((b) => byId.get(String(b.blockedId)))
            .filter(Boolean)
            .map((u) => ({
                id: String(u._id),
                username: String(u.username || 'User'),
                profilePicture: typeof u.profilePicture === 'string' ? u.profilePicture : '',
            }));
        return res.status(200).json({ users: blocked });
    } catch (err) {
        console.error('Error listing blocked users:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Stores a report about another user for moderation, and emails it to REPORTS_EMAIL
 * when set so it can be acted on quickly (the app stores require this for chat apps).
 */
const reportUser = async (req, res) => {
    try {
        const ids = readTarget(req, res);
        if (!ids) return;
        const { me, target } = ids;

        const reason = String(req.body?.reason ?? '');
        const details = String(req.body?.details ?? '').trim();
        if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ message: 'Invalid reason' });
        if (details.length > MAX_REPORT_DETAILS_CHARS) {
            return res.status(400).json({ message: `Details must be at most ${MAX_REPORT_DETAILS_CHARS} characters` });
        }

        const [reporter, reported] = await Promise.all([
            User.findById(me).select('username').lean(),
            User.findById(target).select('username').lean(),
        ]);
        if (!reported) return res.status(404).json({ message: 'User not found' });

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if ((await Report.countDocuments({ reporterId: me, createdAt: { $gt: since } })) >= MAX_REPORTS_PER_DAY) {
            return res.status(429).json({ message: 'Too many reports today. Please try again tomorrow.' });
        }

        const report = await Report.create({ reporterId: me, reportedUserId: target, reason, details });

        const moderatorEmail = process.env.REPORTS_EMAIL;
        if (moderatorEmail) {
            sendEmail({
                to: moderatorEmail,
                subject: `TalkNow report: ${reason} (@${reported.username})`,
                html:
                    `<p><strong>Reported:</strong> @${escapeHtml(reported.username)} (${escapeHtml(target)})</p>` +
                    `<p><strong>By:</strong> @${escapeHtml(reporter?.username)} (${escapeHtml(me)})</p>` +
                    `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` +
                    `<p><strong>Details:</strong> ${escapeHtml(details) || '(none)'}</p>` +
                    `<p>Report id: ${escapeHtml(String(report._id))}</p>`,
            }).catch((err) => console.error('Report email failed:', err.message));
        }

        return res.status(201).json({ message: "Thanks for letting us know. We'll review this report." });
    } catch (err) {
        console.error('Error reporting user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    isBlockedEitherWay,
    blockUser,
    unblockUser,
    listBlockedUsers,
    reportUser,
};
