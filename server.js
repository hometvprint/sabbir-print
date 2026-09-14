const express = require('express');
const proxy = require('express-http-proxy');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.GATEWAY_SECRET || '@sabbir#ahmed';
const DATA_FILE = path.join(__dirname, 'last_url.json');

let state = {
    url: '',
    updatedAt: null
};

// Load saved tunnel URL from file if exists
if (fs.existsSync(DATA_FILE)) {
    try {
        state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error('Failed to load last_url.json:', e.message);
    }
}

// 1. Webhook endpoint called by Android TV Box when tunnel URL is generated or changes
app.post('/api/update-tunnel', express.json(), (req, res) => {
    const { url, secret } = req.body || {};
    if (secret !== SECRET && req.headers['x-gateway-secret'] !== SECRET) {
        return res.status(403).json({ success: false, error: 'ভুল সিক্রেট কি (Invalid Secret)' });
    }

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'URL প্রদান করা হয়নি' });
    }

    state.url = url.trim().replace(/\/+$/, '');
    state.updatedAt = new Date().toISOString();

    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save state:', e.message);
    }

    console.log(`[${new Date().toLocaleTimeString()}] নতুন টানেল URL সিঙ্ক হয়েছে: ${state.url}`);
    res.json({ success: true, url: state.url, updatedAt: state.updatedAt });
});

// 2. Status API endpoint
app.get('/api/current-tunnel', (req, res) => {
    res.json({
        online: !!state.url,
        url: state.url,
        updatedAt: state.updatedAt
    });
});

// 3. Fallback waiting screen if Android TV box is offline / not registered yet
const renderWaitingPage = () => `
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TOBI Remote Print Server - Gateway</title>
    <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
        .card { background: #1e293b; border-radius: 16px; padding: 2rem; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
        h1 { font-size: 1.5rem; color: #38bdf8; margin-bottom: 0.5rem; }
        p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }
        .spinner { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 1.5rem auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
    <meta http-equiv="refresh" content="5">
</head>
<body>
    <div class="card">
        <h1>🖨️ TOBI Print Server Gateway</h1>
        <div class="spinner"></div>
        <p><strong>টিভি বক্সের সাথে সংযোগ স্থাপন হচ্ছে...</strong></p>
        <p>অ্যান্ড্রয়েড টিভি বক্সে Remote Print Server অ্যাপটি চালু রাখুন। লিঙ্ক তৈরি হওয়া মাত্রই স্বয়ংক্রিয়ভাবে মূল প্রিন্ট পেজ চালু হবে।</p>
        <p style="font-size: 0.8rem; color: #64748b;">(প্রতি ৫ সেকেন্ড পর পর পেজটি রিফ্রেশ হচ্ছে)</p>
    </div>
</body>
</html>
`;

// 4. Reverse Proxy all other web traffic seamlessly to the TV Box
// This completely hides *.serveousercontent.com and prevents mobile ISP DNS block in Bangladesh!
app.use((req, res, next) => {
    if (!state.url) {
        return res.status(503).send(renderWaitingPage());
    }

    let targetHost = '';
    try {
        targetHost = new URL(state.url).host;
    } catch (e) {}

    return proxy(state.url, {
        parseReqBody: false, // Stream request body directly so multipart file uploads are never truncated or corrupted
        timeout: 300000,     // 5 minutes timeout for large uploads
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            if (targetHost) {
                proxyReqOpts.headers['host'] = targetHost;
            }
            proxyReqOpts.headers['X-Forwarded-Host'] = srcReq.headers.host;
            proxyReqOpts.headers['X-Forwarded-Proto'] = 'https';
            return proxyReqOpts;
        },
        proxyErrorHandler: (err, res, next) => {
            console.error('Proxy Error to TV Box:', err.message);
            if (req.path && req.path.startsWith('/api/')) {
                res.status(502).json({
                    success: false,
                    error: 'টিভি বক্সের সাথে যোগাযোগ করা যায়নি (' + (err.message || 'নেটওয়ার্ক সমস্যা') + ')। অনুগ্রহ করে টিভি বক্সে অ্যাপ চালু রাখুন।'
                });
            } else {
                res.status(502).send(renderWaitingPage());
            }
        }
    })(req, res, next);
});

app.listen(PORT, () => {
    console.log(`Render Gateway reverse proxy listening on port ${PORT}`);
});
