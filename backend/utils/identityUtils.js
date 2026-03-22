const mongoose = require('mongoose');

/**
 * Extracts a clean, hex string userId from req.user (typically populated by authMiddleware).
 * Handles various ObjectId representations from different JWT payloads or Mongoose versions.
 */
const getActorUserId = (req) => {
    const fromToken = req?.user?.id ?? req?.user?._id;
    if (!fromToken) return '';

    if (typeof fromToken === 'string') return fromToken.trim();

    if (fromToken && typeof fromToken === 'object') {
        const anyId = fromToken;
        // Handle common MongoDB/BSON shapes
        if (typeof anyId.$oid === 'string') return anyId.$oid.trim();
        if (typeof anyId._id === 'string') return anyId._id.trim();
        if (typeof anyId.id === 'string') return anyId.id.trim();

        // Handle Buffer-based IDs
        const bufferCandidate = anyId?.id ?? anyId;
        if (bufferCandidate && bufferCandidate.type === 'Buffer' && Array.isArray(bufferCandidate.data)) {
            try {
                return Buffer.from(bufferCandidate.data).toString('hex');
            } catch {
                return '';
            }
        }
    }

    return String(fromToken).trim();
};

/**
 * Validates if the given string is a valid MongoDB ObjectId.
 */
const isValidObjectId = (id) => {
    return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id.trim());
};

module.exports = {
    getActorUserId,
    isValidObjectId,
};
