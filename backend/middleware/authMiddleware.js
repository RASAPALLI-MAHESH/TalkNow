const { verifyAuthToken } = require("../config/Jwthandling");

const authMiddleware = (req, res, next) => {
    // Get token from Authorization header (Bearer token)
    const authHeader = req.header("Authorization") || "";
    const parts = authHeader.split(" ");
    const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

    if (!token) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    try {
        const decoded = verifyAuthToken(token);
        req.user = decoded; // add user payload to request
        next();
    } catch (err) {
        res.status(401).json({ message: "Token is not valid" });
    }
};

module.exports = authMiddleware;