const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const http = require('http');
const { WebSocketServer } = require('ws');

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in the environment');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

const authRoutes = require('../webapp/routes/auth');
const badgeRoutes = require('../webapp/routes/badge');
const pairing = require('../webapp/routes/pairing');

app.use('/auth', authRoutes);
app.use('/badge', badgeRoutes);
app.use('/', pairing.router);

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        application: 'ft_transcendence'
    });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/socket' });

pairing.attachWebSocket(wss);

app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    if (/^\/(auth|badge|pairing|badge-login|health)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
        if (err) next(err);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});