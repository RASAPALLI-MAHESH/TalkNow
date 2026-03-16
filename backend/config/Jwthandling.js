const jwt = require('jsonwebtoken');

let warnedMissingSecret = false;

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (secret) return secret;

    // Never silently run production with a default JWT secret.
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }

    if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        console.warn('[auth] JWT_SECRET is not set; using an insecure development fallback secret.');
    }
    return 'dev_insecure_secret_change_me';
};

const signAuthToken = (payload, options = { expiresIn: '30d' }) => {
    return jwt.sign(payload, getJwtSecret(), options);
};

const verifyAuthToken = (token) => {
    return jwt.verify(token, getJwtSecret());
};

module.exports = {
    getJwtSecret,
    signAuthToken,
    verifyAuthToken,
};

