const User = require('./models/user');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchUsers = async (query, { limit = 20 } = {}) => {
    const q = String(query ?? '').trim();
    if (!q) return [];

    const regex = new RegExp(escapeRegex(q), 'i');

    const users = await User.find({ username: regex })
        .limit(Math.max(1, Math.min(50, Number(limit) || 20)))
        .select('_id username email')
        .lean();

    return users.map((u) => ({
        id: String(u._id),
        username: u.username,
        email: u.email,
    }));
};

module.exports = { searchUsers };