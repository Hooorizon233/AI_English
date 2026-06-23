// WordWise Server — Express.js backend
const express = require('express');
const cors = require('cors');
const path = require('path');

const storage = require('./server/storage');
const routes = require('./server/routes');

const app = express();
const PORT = storage.readConfig().port || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Block access to server-side files
app.use((req, res, next) => {
    const blocked = ['/server/', '/data/users/', '/data/config.json', '/package.json'];
    if (blocked.some(p => req.path.startsWith(p) || req.path === p)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
});

// Static files — serve the root directory (index.html, css/, js/, data/ wordbanks)
app.use(express.static(__dirname, { index: 'index.html' }));

// API routes
app.use('/api', routes);

// SPA fallback — everything else goes to index.html
app.get('*', (req, res) => {
    // Only fallback for non-API, non-static requests
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ WordWise Server running at http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop`);
});
