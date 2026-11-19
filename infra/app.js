const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const http = require('http');
const { WebSocketServer } = require('ws');

// Load environment variables
dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Check required environment variables
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in the environment');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Static files
app.use(express.static(path.join(__dirname, '../frontend/public'), { index: 'home.html' }));

// Routes
const authRoutes = require('../webapp/routes/auth');
const badgeRoutes = require('../webapp/routes/badge');
const pairing = require('../webapp/routes/pairing');

app.use('/auth', authRoutes);
app.use('/badge', badgeRoutes);
app.use('/', pairing.router);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        application: 'ft_transcendence'
    });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Connect WebSocket to pairing logic
pairing.attachWebSocket(wss);

// Start server
server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});