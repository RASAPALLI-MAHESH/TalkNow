require("dotenv").config();
const http = require('http');
const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const keyRoutes = require("./routes/keyRoutes");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { attachWebSocketServer } = require('./services/websocketServer');
const server = express();

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) return true; // mobile/native clients or same-origin calls
    if (!isProduction) return true;
    if (allowedOrigins.length === 0) return false;
    return allowedOrigins.includes(origin);
};

// Required when running behind proxies/load balancers (Render/NGINX) so rate limits and secure headers are correct.
server.set('trust proxy', 1);

// Set up Global Rate Limiting to prevent DDoS and Brute Force Attacks
// For true millions-scale, this should be backed by a Redis store, but memory is good for v1.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // API-wide baseline. Apply stricter limits on sensitive routes separately as needed.
    message: "Too many requests from this IP, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    // Images have their own limit below: one screen can load dozens of avatars.
    skip: (req) => req.path.startsWith('/media/'),
});

const mediaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

// Connect to MongoDB with connection pooling
connectDB();

// 1. Security Headers (Helmet protects against cross-site scripting, sniffing, etc)
server.use(
    helmet({
        hsts: isProduction
            ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            }
            : false,
    })
);

// 2. Logging (Morgan outputs standard Apache style logs to help monitor scale)
server.use(morgan("combined"));

// 3. Rate limiting applied to all /api routes
server.use("/api", limiter);

if (isProduction) {
    // Reject plain HTTP at the app edge; terminate TLS at the platform/proxy.
    server.use((req, res, next) => {
        const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
        if (proto && proto !== 'https') {
            return res.status(426).json({ message: 'HTTPS is required' });
        }
        return next();
    });
}

// 4. CORS configuration for frontend clients
// Allow requests from all origins during development so Expo mobile app IPs don't get rejected by CORS
server.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

// 5. Body parser limits: allow avatar/profile payloads during signup while keeping finite caps.
// If avatars are sent as base64 data URIs, 10kb is too small and causes HTTP 413.
server.use(express.json({ limit: '8mb' }));
server.use(express.urlencoded({ extended: true, limit: '8mb' }));

server.use("/api/auth", authRoutes)
server.use("/api/media", mediaLimiter, mediaRoutes)
server.use("/api/keys", keyRoutes)

// Older apps send plain text, which the server no longer accepts: they are asked to update.
const MIN_APP_VERSION = String(process.env.MIN_APP_VERSION || '1.1.0').trim();

server.get(
    "/api/health", (req , res) => {
        res.status(200).json({ status: "API RUNNING v1.0 [PRODUCTION-READY]", minAppVersion: MIN_APP_VERSION });
    }
)

server.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

// Always answer with JSON, never an HTML error page or a stack trace.
// eslint-disable-next-line no-unused-vars
server.use((err, req, res, next) => {
    const status = Number(err?.status || err?.statusCode) || 500;
    if (status === 413) return res.status(413).json({ message: "Request is too large" });
    if (status === 400 && err?.type === 'entity.parse.failed') return res.status(400).json({ message: "Invalid JSON" });
    if (err?.message === 'Not allowed by CORS') return res.status(403).json({ message: "Not allowed by CORS" });
    if (status >= 500) console.error('Unhandled error:', err);
    return res.status(status).json({ message: status >= 500 ? "Internal server error" : "Bad request" });
});

const PORT = process.env.PORT || 8080;
const httpServer = http.createServer(server);

// WebSocket server shares the same port (path: /ws)
const wss = attachWebSocketServer(httpServer);

// Bind to 0.0.0.0 to accept connections from the local network and Render routing
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP + WS server listening on port ${PORT}`);
});

// On deploys the platform sends SIGTERM: stop accepting work, let requests finish, then exit.
const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    for (const client of wss.clients) client.close(1012, 'Server restarting');
    wss.close();
    httpServer.close(async () => {
        await mongoose.disconnect().catch(() => {});
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 10 * 1000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

