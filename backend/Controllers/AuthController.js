const crypto = require('crypto');
const User = require("../models/user");
const OtpModel = require("../models/otp");
const Session = require("../models/session");
const bcrypt = require('bcryptjs');
const { signAuthToken, getJwtSecret } = require("../config/Jwthandling");
const sendOtp = require("../services/otpService");
const { disconnectSessions } = require("../services/websocketServer");
const {
    InvalidImageError,
    publicBaseUrl,
    prepareImageInput,
    commitImageInput,
    deleteReplacedImage,
} = require("../services/mediaStore");
const mongoose = require('mongoose');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_GRACE_MS = 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const hashesEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

// Refresh tokens look like "<sessionId>.<random>" so the session is found by id;
// only a hash of the whole token is stored.
const newRefreshToken = (sessionId) => `${sessionId}.${crypto.randomBytes(32).toString('base64url')}`;

const signAccessToken = (userId, sessionId) =>
    signAuthToken({ id: String(userId), sid: String(sessionId) }, { expiresIn: ACCESS_TOKEN_TTL });

// A short-lived access token plus a refresh token, both tied to a revocable Session row.
const issueSession = async (userId) => {
    const session = new Session({ userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    const refreshToken = newRefreshToken(session._id);
    session.refreshTokenHash = sha256(refreshToken);
    await session.save();
    return { token: signAccessToken(userId, session._id), refreshToken };
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const isOtpExpired = (createdAt) => {
    if (!createdAt) return true;
    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return true;
    return Date.now() - created > OTP_TTL_MS;
};

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

// Keyed hash so a database leak alone does not reveal live codes.
const hashOtp = (email, otp) =>
    crypto.createHmac('sha256', getJwtSecret()).update(`${email}:${otp}`).digest('hex');

const otpMatches = (email, otp, storedHash) => {
    if (!otp || typeof storedHash !== 'string' || !storedHash) return false;
    const a = Buffer.from(hashOtp(email, otp), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const normalizeUsername = (value) => String(value ?? '').trim();
const normalizeFirstname = (value) => String(value ?? '').trim();
const normalizeOtp = (value) => String(value ?? '').trim();

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,72}$/;
const PASSWORD_RULE_MESSAGE = 'Password must be 6-72 chars and include at least 1 uppercase letter and 1 number';

// Used for timing-equal login failures when the username does not exist.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('talknow-dummy-password', 10);

const asMongoDuplicateKeyMessage = (err) => {
    // Mongoose wraps MongoServerError; prefer consistent checks.
    const code = err?.code;
    if (code !== 11000) return null;

    const keys = err?.keyPattern || err?.keyValue || {};
    if (keys.email) return 'Email already exists';
    if (keys.username) return 'Username already taken';
    return 'Duplicate value';
};

const isEmailProviderError = (err) => {
    const msg = String(err?.message || '');
    return msg.includes('BREVO_') || msg.startsWith('Brevo email send failed');
};

const EMAIL_SEND_FAILED_MESSAGE = 'Could not send the email right now. Please try again later.';

const serverError = (res, err, context) => {
    console.error(`${context}:`, err);
    return res.status(500).json({ message: "Server error" });
};

/**
 * Checks a signup code. Each check uses one attempt (counted atomically, so parallel
 * guesses cannot get past the limit); a correct code resets the counter.
 */
const checkSignupOtp = async (email, otp) => {
    if (!email || !otp) return false;

    const record = await OtpModel.findOneAndUpdate(
        { email, attempts: { $lt: OTP_MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
    );
    if (!record) return false;

    // TTL indexes are not guaranteed to delete instantly, so enforce expiry in app logic too.
    if (isOtpExpired(record.createdAt)) {
        await OtpModel.deleteOne({ _id: record._id });
        return false;
    }

    if (otpMatches(email, otp, record.otpHash)) {
        await OtpModel.updateOne({ _id: record._id }, { $set: { attempts: 0 } });
        return true;
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await OtpModel.deleteOne({ _id: record._id });
    }
    return false;
};

exports.sendSignupOtp = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists with this email" });
        }

        const existing = await OtpModel.findOne({ email }).select('createdAt').lean();
        if (existing?.createdAt && Date.now() - new Date(existing.createdAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ message: "Please wait a minute before requesting another code" });
        }

        const otp = generateOtp();
        await OtpModel.findOneAndUpdate(
            { email },
            { otpHash: hashOtp(email, otp), attempts: 0, createdAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );

        await sendOtp(email, otp);
        res.status(200).json({ message: "OTP sent successfully" });
    } catch(err) {
        const dup = asMongoDuplicateKeyMessage(err);
        if (dup) return res.status(400).json({ message: dup });
        if (isEmailProviderError(err)) {
            console.error('Signup OTP email failed:', err.message);
            return res.status(502).json({ message: EMAIL_SEND_FAILED_MESSAGE });
        }
        serverError(res, err, 'sendSignupOtp failed');
    }
}

exports.verifySignupOtp = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const otp = normalizeOtp(req.body?.otp);
        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        if (!(await checkSignupOtp(email, otp))) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        res.status(200).json({ message: "OTP verified successfully", verified: true });
    } catch(err) {
        serverError(res, err, 'verifySignupOtp failed');
    }
}

exports.checkUsernameAvailability = async (req, res) => {
    try {
        const username = normalizeUsername(req.query?.username);
        if (!username) {
            return res.status(400).json({ message: 'username is required' });
        }
        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                message: 'Username must be 3-24 characters and use letters, numbers, or underscore only',
                available: false,
            });
        }

        const exists = await User.exists({ username });
        return res.status(200).json({ available: !Boolean(exists) });
    } catch (err) {
        return serverError(res, err, 'checkUsernameAvailability failed');
    }
};

exports.signUp = async (req, res) => {
    try {
        const Firstname = normalizeFirstname(req.body?.Firstname);
        const username = normalizeUsername(req.body?.username);
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password ?? '');
        const otp = normalizeOtp(req.body?.otp);
        const profilePicture = String(req.body?.profilePicture ?? '').trim();

        if (!Firstname || !username || !password || !email || !otp) {
            return res.status(400).json({ message: "Firstname, username, password, email and otp are required" });
        }
        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({ message: 'Username must be 3-24 characters and use letters, numbers, or underscore only' });
        }
        if (!PASSWORD_REGEX.test(password)) {
            return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
        }
        // Check the image before anything is stored; it is saved once the account exists.
        const newUserId = new mongoose.Types.ObjectId();
        let preparedPicture;
        try {
            preparedPicture = await prepareImageInput(profilePicture, { ownerId: newUserId });
        } catch (err) {
            if (err instanceof InvalidImageError) return res.status(400).json({ message: err.message });
            throw err;
        }

        // Final OTP check at creation
        if (!(await checkSignupOtp(email, otp))) {
            return res.status(400).json({ message: "Email not verified or OTP expired" });
        }

        const [usernameExists, emailExists] = await Promise.all([
            User.exists({ username }),
            User.exists({ email }),
        ]);
        if (usernameExists) {
            return res.status(400).json({ message: "Username already taken" });
        }
        if (emailExists) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const hashedPassword = await bcrypt.hash(password , 10);
        const profilePictureUrl = await commitImageInput(preparedPicture, { ownerId: newUserId, baseUrl: publicBaseUrl(req) });
        const newUser = new User({
            _id: newUserId,
            Firstname,
            username,
            password: hashedPassword,
            email,
            profilePicture: profilePictureUrl
        });
        try {
            await newUser.save();
        } catch (err) {
            await deleteReplacedImage(profilePictureUrl, '', newUserId);
            throw err;
        }

        // Clean up OTP
        await OtpModel.deleteOne({ email });

        const { token, refreshToken } = await issueSession(newUser._id);
        res.status(201).json({
            message: "User created successfully",
            token,
            refreshToken,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                profilePicture: newUser.profilePicture,
            }
        });
    } catch(err) {
        const dup = asMongoDuplicateKeyMessage(err);
        if (dup) return res.status(400).json({ message: dup });
        serverError(res, err, 'signUp failed');
    }
}

exports.login = async (req, res) => {
    try {
        // Coerce to strings so objects like { "$ne": null } can't become query operators.
        const username = normalizeUsername(req.body?.username);
        const password = String(req.body?.password ?? '');
        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }
        const existingUser = await User.findOne({ username });

        // Same response and similar timing whether or not the username exists.
        const isPasswordValid = await bcrypt.compare(password, existingUser?.password ?? DUMMY_PASSWORD_HASH);
        if (!existingUser || !isPasswordValid) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const { token, refreshToken } = await issueSession(existingUser._id);
        res.status(200).json({
            message: "Login successful",
            token,
            refreshToken,
            user: {
                id: existingUser._id,
                username: existingUser.username,
                email: existingUser.email,
                profilePicture: existingUser.profilePicture,
            }
        });
    } catch(err) {
        serverError(res, err, 'login failed');
    }
}

const FORGOT_PASSWORD_RESPONSE = { message: "If an account exists for this email, a code has been sent." };

exports.forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const existingUser = await User.findOne({ email });

        // Same response for unknown emails and during the resend cooldown.
        if (!existingUser) {
            return res.status(200).json(FORGOT_PASSWORD_RESPONSE);
        }
        const lastSent = existingUser.resetOtpSentAt ? new Date(existingUser.resetOtpSentAt).getTime() : 0;
        if (Date.now() - lastSent < OTP_RESEND_COOLDOWN_MS) {
            return res.status(200).json(FORGOT_PASSWORD_RESPONSE);
        }

        const otp = generateOtp();
        existingUser.resetOtpHash = hashOtp(email, otp);
        existingUser.otpExpiry = new Date(Date.now() + OTP_TTL_MS);
        existingUser.resetOtpSentAt = new Date();
        existingUser.resetOtpAttempts = 0;
        await existingUser.save();
        await sendOtp(email, otp);
        res.status(200).json(FORGOT_PASSWORD_RESPONSE);
    } catch(err) {
        if (isEmailProviderError(err)) {
            console.error('Password reset email failed:', err.message);
            return res.status(502).json({ message: EMAIL_SEND_FAILED_MESSAGE });
        }
        serverError(res, err, 'forgotPassword failed');
    }
}

exports.resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const otp = normalizeOtp(req.body?.otp);
        const finalNewPassword = String(req.body?.newpassword ?? req.body?.newPassword ?? '');
        if (!email || !otp || !finalNewPassword) {
            return res.status(400).json({ message: "email, otp and newPassword are required" });
        }
        if (!PASSWORD_REGEX.test(finalNewPassword)) {
            return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
        }

        // Use up one attempt before comparing, atomically, so parallel guesses can't exceed the limit.
        const existingUser = await User.findOneAndUpdate(
            {
                email,
                resetOtpHash: { $ne: null },
                otpExpiry: { $gt: new Date() },
                resetOtpAttempts: { $lt: OTP_MAX_ATTEMPTS },
            },
            { $inc: { resetOtpAttempts: 1 } },
            { returnDocument: 'after' }
        );

        if (!existingUser || !otpMatches(email, otp, existingUser.resetOtpHash)) {
            if (existingUser && existingUser.resetOtpAttempts >= OTP_MAX_ATTEMPTS) {
                await User.updateOne({ _id: existingUser._id }, { $set: { resetOtpHash: null, otpExpiry: null } });
            }
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        existingUser.password = await bcrypt.hash(finalNewPassword , 10);
        existingUser.resetOtpHash = null;
        existingUser.otpExpiry = null;
        existingUser.resetOtpAttempts = 0;
        await existingUser.save();

        // Sign out every device: whoever had the old password loses access.
        await Session.deleteMany({ userId: existingUser._id });
        disconnectSessions({ userId: existingUser._id });

        res.status(200).json({message: "Password reset successful"});
    } catch(err) {
        serverError(res, err, 'resetPassword failed');
    }
}

/**
 * Swaps a refresh token for a new access token and a new refresh token (rotation).
 * Presenting a refresh token that was already replaced means it was copied, so the
 * whole session is ended. The one exception is the token replaced in the last minute,
 * for a client that never received the response to its previous refresh.
 */
exports.refresh = async (req, res) => {
    try {
        const presentedToken = String(req.body?.refreshToken ?? '');
        const sessionId = presentedToken.split('.')[0];
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
            return res.status(401).json({ message: "Session expired" });
        }
        const presentedHash = sha256(presentedToken);

        // Two attempts: a parallel refresh may rotate the token between our read and write.
        for (let attempt = 0; attempt < 2; attempt++) {
            const session = await Session.findOne({ _id: sessionId, expiresAt: { $gt: new Date() } }).lean();
            if (!session) {
                return res.status(401).json({ message: "Session expired" });
            }

            const isCurrent = hashesEqual(presentedHash, session.refreshTokenHash);
            const isRecentPrevious =
                !isCurrent &&
                hashesEqual(presentedHash, session.previousRefreshTokenHash) &&
                !!session.rotatedAt &&
                Date.now() - new Date(session.rotatedAt).getTime() < REFRESH_GRACE_MS;

            if (!isCurrent && !isRecentPrevious) {
                await Session.deleteOne({ _id: session._id });
                disconnectSessions({ userId: session.userId, sessionId: session._id });
                return res.status(401).json({ message: "Session expired" });
            }

            const nextRefreshToken = newRefreshToken(session._id);
            const update = {
                refreshTokenHash: sha256(nextRefreshToken),
                previousRefreshTokenHash: session.refreshTokenHash,
                rotatedAt: new Date(),
                expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            };
            const result = await Session.updateOne(
                { _id: session._id, refreshTokenHash: session.refreshTokenHash },
                { $set: update }
            );
            if (result.modifiedCount === 1) {
                return res.status(200).json({
                    token: signAccessToken(session.userId, session._id),
                    refreshToken: nextRefreshToken,
                });
            }
        }
        return res.status(409).json({ message: "Please try again" });
    } catch (err) {
        serverError(res, err, 'refresh failed');
    }
};

exports.logout = async (req, res) => {
    try {
        await Session.deleteOne({ _id: req.user.sid });
        disconnectSessions({ userId: req.user.id, sessionId: req.user.sid });
        res.status(200).json({message: "Logout successful"});
    } catch (err) {
        serverError(res, err, 'logout failed');
    }
}

exports.userProfile = async (req, res) => {
    try {
        if(!req.user) return res.status(401).json({message: "Unauthorized"});
        const userId = req.user.id;
        const existingUser = await User.findById(userId);
        if(!existingUser){
            return res.status(404).json({message: "User not found"});
        }
        res.status(200).json({
            id: existingUser._id,
            username: existingUser.username,
            Firstname: existingUser.Firstname,
            email: existingUser.email,
            profilePicture: existingUser.profilePicture,
            bio: existingUser.bio,
            heroData: existingUser.heroData,
            socialUrls: existingUser.socialUrls,
            customLinks: existingUser.customLinks,
            followers: existingUser.followers ? existingUser.followers.length : 0,
            following: existingUser.following ? existingUser.following.length : 0
        });
    } catch(err) {
        serverError(res, err, 'userProfile failed');
    }
}

exports.getUserProfile = async (req, res) => {
    try {
        const userId = String(req.params.userId ?? '');
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(404).json({ message: "User not found" });
        }
        const existingUser = await User.findById(userId);
        if(!existingUser){
            return res.status(404).json({message: "User not found"});
        }
        // Public profile: email is intentionally left out.
        res.status(200).json({
            id: existingUser._id,
            username: existingUser.username,
            Firstname: existingUser.Firstname,
            profilePicture: existingUser.profilePicture,
            bio: existingUser.bio,
            heroData: existingUser.heroData,
            socialUrls: existingUser.socialUrls,
            customLinks: existingUser.customLinks,
            followers: existingUser.followers ? existingUser.followers.length : 0,
            following: existingUser.following ? existingUser.following.length : 0
        });
    } catch(err) {
        serverError(res, err, 'getUserProfile failed');
    }
}

const MAX_FIRSTNAME_CHARS = 50;
const MAX_BIO_CHARS = 300;
const MAX_HERO_TEXT_CHARS = 280;
const MAX_URL_CHARS = 2048;
const MAX_CUSTOM_LINKS = 20;
const MAX_LINK_LABEL_CHARS = 60;
const SOCIAL_PLATFORMS = ['whatsapp', 'instagram', 'linkedin', 'twitter'];

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Accepts only http(s) links; a link typed without a scheme is treated as https.
 * Returns '' for empty input and null for anything else (javascript:, intent:, tel:, ...),
 * because other users open these links straight from the profile.
 */
const normalizeWebUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (raw.length > MAX_URL_CHARS) return null;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(candidate);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return candidate;
    } catch {
        // fall through
    }
    return null;
};

class ProfileValidationError extends Error {}

const fail = (message) => {
    throw new ProfileValidationError(message);
};

/**
 * Checks every field before anything is written. Image fields are only checked here
 * (returned in `images`); the caller stores them once the whole update is known to be valid.
 */
const validateProfileUpdates = async (body, { ownerId }) => {
    const updates = {};
    const images = {};

    if (body.Firstname !== undefined) {
        const Firstname = normalizeFirstname(body.Firstname);
        if (!Firstname || Firstname.length > MAX_FIRSTNAME_CHARS) fail(`Name must be 1-${MAX_FIRSTNAME_CHARS} characters`);
        updates.Firstname = Firstname;
    }

    if (body.profilePicture !== undefined) {
        images.profilePicture = await prepareImageInput(body.profilePicture, { ownerId });
    }

    if (body.bio !== undefined) {
        const bio = String(body.bio ?? '').trim();
        if (bio.length > MAX_BIO_CHARS) fail(`Bio must be at most ${MAX_BIO_CHARS} characters`);
        updates.bio = bio;
    }

    if (body.heroData !== undefined) {
        const hero = body.heroData;
        if (!isPlainObject(hero)) fail('Invalid hero data');
        const text = String(hero.text ?? '');
        const themeId = String(hero.themeId ?? 't1');
        if (text.length > MAX_HERO_TEXT_CHARS) fail(`Hero text must be at most ${MAX_HERO_TEXT_CHARS} characters`);
        if (!/^[a-z0-9_-]{1,20}$/i.test(themeId)) fail('Invalid hero theme');
        images.heroImage = await prepareImageInput(hero.customImageUri, { ownerId });
        updates.heroData = { text, themeId, customImageUri: '' };
    }

    if (body.socialUrls !== undefined) {
        if (!isPlainObject(body.socialUrls)) fail('Invalid social links');
        const socialUrls = {};
        for (const platform of SOCIAL_PLATFORMS) {
            const url = normalizeWebUrl(body.socialUrls[platform]);
            if (url === null) fail(`Invalid ${platform} link`);
            socialUrls[platform] = url;
        }
        updates.socialUrls = socialUrls;
    }

    if (body.customLinks !== undefined) {
        if (!Array.isArray(body.customLinks) || body.customLinks.length > MAX_CUSTOM_LINKS) {
            fail(`You can add at most ${MAX_CUSTOM_LINKS} links`);
        }
        updates.customLinks = body.customLinks.map((link) => {
            if (!isPlainObject(link)) fail('Invalid link');
            const id = String(link.id ?? '');
            const label = String(link.label ?? '').trim();
            const url = normalizeWebUrl(link.url);
            if (!/^[\w-]{1,64}$/.test(id)) fail('Invalid link id');
            if (!label || label.length > MAX_LINK_LABEL_CHARS) fail(`Link labels must be 1-${MAX_LINK_LABEL_CHARS} characters`);
            if (!url) fail('Links must be valid http(s) URLs');
            return { id, label, url };
        });
    }

    return { updates, images };
};

exports.updateProfile = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const userId = req.user.id;

        let updates;
        let images;
        try {
            ({ updates, images } = await validateProfileUpdates(req.body ?? {}, { ownerId: userId }));
        } catch (err) {
            if (err instanceof ProfileValidationError || err instanceof InvalidImageError) {
                return res.status(400).json({ message: err.message });
            }
            throw err;
        }

        const previous = await User.findById(userId).select('profilePicture heroData').lean();
        if (!previous) {
            return res.status(404).json({ message: "User not found" });
        }

        const imageContext = { ownerId: userId, baseUrl: publicBaseUrl(req) };
        if (images.profilePicture) {
            updates.profilePicture = await commitImageInput(images.profilePicture, imageContext);
        }
        if (images.heroImage) {
            updates.heroData.customImageUri = await commitImageInput(images.heroImage, imageContext);
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Remove images the profile no longer uses.
        if (updates.profilePicture !== undefined) {
            await deleteReplacedImage(previous.profilePicture, updatedUser.profilePicture, userId);
        }
        if (updates.heroData !== undefined) {
            await deleteReplacedImage(previous.heroData?.customImageUri, updatedUser.heroData?.customImageUri, userId);
        }

        return res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: updatedUser._id,
                username: updatedUser.username,
                Firstname: updatedUser.Firstname,
                email: updatedUser.email,
                profilePicture: updatedUser.profilePicture,
                bio: updatedUser.bio,
                heroData: updatedUser.heroData,
                socialUrls: updatedUser.socialUrls,
                customLinks: updatedUser.customLinks
            }
        });
    } catch (err) {
        return serverError(res, err, 'updateProfile failed');
    }
}

exports.followUser = async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

        const userId = String(req.user.id);
        const targetUserId = String(req.body?.targetUserId ?? req.body?.userId ?? '').trim();

        if (!targetUserId) {
            return res.status(400).json({ message: 'targetUserId is required' });
        }
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ message: 'Invalid targetUserId' });
        }
        if (userId === targetUserId) {
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        const target = await User.findById(targetUserId).select('_id');
        if (!target) return res.status(404).json({ message: 'Target user not found' });

        await User.findByIdAndUpdate(userId, { $addToSet: { following: targetUserId } }, { new: false });
        await User.findByIdAndUpdate(targetUserId, { $addToSet: { followers: userId } }, { new: false });

        return res.status(200).json({ message: 'Followed successfully' });
    } catch (err) {
        return serverError(res, err, 'followUser failed');
    }
};

exports.unfollowUser = async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

        const userId = String(req.user.id);
        const targetUserId = String(req.body?.targetUserId ?? req.body?.userId ?? '').trim();

        if (!targetUserId) {
            return res.status(400).json({ message: 'targetUserId is required' });
        }
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ message: 'Invalid targetUserId' });
        }
        if (userId === targetUserId) {
            return res.status(400).json({ message: 'You cannot unfollow yourself' });
        }

        await User.findByIdAndUpdate(userId, { $pull: { following: targetUserId } }, { new: false });
        await User.findByIdAndUpdate(targetUserId, { $pull: { followers: userId } }, { new: false });

        return res.status(200).json({ message: 'Unfollowed successfully' });
    } catch (err) {
        return serverError(res, err, 'unfollowUser failed');
    }
};
