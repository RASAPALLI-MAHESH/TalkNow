const mongoose = require('mongoose');
const { verifyAuthToken } = require("../config/Jwthandling");
const Session = require("../models/session");

/**
 * Verifies a JWT and checks that its session has not been revoked.
 * Returns { id, sid } on success, or null. Shared by HTTP routes and the WebSocket server.
 */
const resolveAuthToken = async (token) => {
    if (!token || typeof token !== 'string') return null;

    let decoded;
    try {
        decoded = verifyAuthToken(token);
    } catch {
        return null;
    }

    const id = String(decoded?.id ?? '');
    const sid = String(decoded?.sid ?? '');
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(sid)) return null;

    const session = await Session.exists({ _id: sid, userId: id, expiresAt: { $gt: new Date() } });
    if (!session) return null;

    return { id, sid };
};

const authMiddleware = async (req, res, next) => {
    // Get token from Authorization header (Bearer token)
    const authHeader = req.header("Authorization") || "";
    const parts = authHeader.split(" ");
    const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

    if (!token) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    try {
        const auth = await resolveAuthToken(token);
        if (!auth) {
            return res.status(401).json({ message: "Token is not valid" });
        }
        req.user = auth; // add user payload to request
        next();
    } catch (err) {
        console.error('Auth check failed:', err);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = authMiddleware;
module.exports.resolveAuthToken = resolveAuthToken;
