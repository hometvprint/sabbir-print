const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.GATEWAY_SECRET || '@sabbir#ahmed';
const DATA_FILE = path.join(__dirname, 'last_url.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.post('/api/update-tunnel', (req, res) => {
    const { url, secret } = req.body;
    if (secret !== SECRET && req.headers['x-gateway-secret'] !== SECRET) {
        return res.status(403).json({ success: false, error: 'ভুল সিক্রেট কি (Invalid Secret)' });
    }

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'URL প্রদান করা হয়নি' });
    }

    state.url = url.trim();
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

// 3. Root redirect: seamlessly forwards visitors to the Android TV Box tunnel
app.get('/', (req, res) => {
    if (state.url) {
        // Redirect directly to the live Cloudflare / Serveo URL
        return res.redirect(state.url);
    }

    // If TV box hasn't registered yet, display friendly status page
    res.send(`
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
        .btn { display: inline-block; background: #0284c7; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 1rem; }
    </style>
    <meta http-equiv="refresh" content="5">
</head>
<body>
    <div class="card">
        <h1>🖨️ TOBI Print Server Gateway</h1>
        <div class="spinner"></div>
        <p><strong>টিভি বক্সের সাথে সংযোগ স্থাপন হচ্ছে...</strong></p>
        <p>অ্যান্ড্রয়েড টিভি বক্সে Remote Print Server অ্যাপটি চালু রাখুন। লিঙ্ক তৈরি হওয়া মাত্রই স্বয়ংক্রিয়ভাবে আপনাকে মূল প্রিন্ট পেজে রিডাইরেক্ট করা হবে।</p>
        <p style="font-size: 0.8rem; color: #64748b;">(প্রতি ৫ সেকেন্ড পর পর পেজটি রিফ্রেশ হচ্ছে)</p>
    </div>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`Render Gateway server listening on port ${PORT}`);
});
