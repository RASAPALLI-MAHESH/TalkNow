require("dotenv").config();
const http = require('http');
const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
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

server.get(
    "/api/health", (req , res) => {
        res.status(200).json({ status: "API RUNNING v1.0 [PRODUCTION-READY]" });
    }
)

const PORT = process.env.PORT || 8080;
const httpServer = http.createServer(server);

// WebSocket server shares the same port (path: /ws)
attachWebSocketServer(httpServer);

// Bind to 0.0.0.0 to accept connections from the local network and Render routing
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP + WS server listening on port ${PORT}`);
});

