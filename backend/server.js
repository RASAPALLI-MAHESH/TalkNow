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
const { initializeNotificationSocket } = require('./services/notificationSocket');
const server = express();

// Set up Global Rate Limiting to prevent DDoS and Brute Force Attacks
// For true millions-scale, this should be backed by a Redis store, but memory is good for v1.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
});

// Connect to MongoDB with connection pooling
connectDB();

// 1. Security Headers (Helmet protects against cross-site scripting, sniffing, etc)
server.use(helmet());

// 2. Logging (Morgan outputs standard Apache style logs to help monitor scale)
server.use(morgan("combined"));

// 3. Rate limiting applied to all /api routes
server.use("/api", limiter);

// 4. CORS configuration for frontend clients
// Allow requests from all origins during development so Expo mobile app IPs don't get rejected by CORS
server.use(cors({
    origin: "*", 
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

// 5. Body parser with a strict size limit to prevent large payload memory attacks
server.use(express.json({ limit: '10kb' }));

server.use("/api/auth", authRoutes)

server.get(
    "/api/health", (req , res) => {
        res.status(200).json({ status: "API RUNNING v1.0 [PRODUCTION-READY]" });
    }
)

const PORT = process.env.PORT || 8080;
const httpServer = http.createServer(server);

// Socket.IO notifications share the same port.
initializeNotificationSocket(httpServer);

// WebSocket server shares the same port (path: /ws)
attachWebSocketServer(httpServer);

// Bind to 0.0.0.0 to accept connections from the local network and Render routing
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP + WS server listening on port ${PORT}`);
});

