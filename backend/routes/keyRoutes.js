const express = require("express");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../middleware/authMiddleware");
const {
    uploadKeys,
    addOneTimePreKeys,
    rotateSignedPreKey,
    getOwnKeyStatus,
    getPreKeyBundle,
} = require("../utils/keyFunctions");

const router = express.Router();

// Per account, not per IP: each fetch uses up one of the contact's one-time prekeys.
const bundleLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (req) => `keys:${req.user.id}`,
    message: { message: "Too many key requests. Please wait and try again." },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => `keys-upload:${req.user.id}`,
    message: { message: "Too many key uploads. Please wait and try again." },
    standardHeaders: true,
    legacyHeaders: false,
});

router.use(authMiddleware);
router.put("/", uploadLimiter, uploadKeys);
router.post("/prekeys", uploadLimiter, addOneTimePreKeys);
router.put("/signed-prekey", uploadLimiter, rotateSignedPreKey);
router.get("/me", getOwnKeyStatus);
router.get("/:userId", bundleLimiter, getPreKeyBundle);

module.exports = router;
