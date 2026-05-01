import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Flask upstream URL — set FLASK_UPLOAD_URL in Heroku config vars ───────
const FLASK_URL = (process.env.FLASK_UPLOAD_URL || '').replace(/\/$/, '');

// ── Health check — used by client for wakeup detection & keep-alive pings ─
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// ── Static assets (built by vite build / heroku-postbuild) ───────────────
app.use(express.static(path.join(__dirname, 'dist')));

// ── Proxy /files/* → Flask server ────────────────────────────────────────
// This avoids CORS issues: the browser talks to the same Heroku origin and
// the server forwards the request to Flask.
app.use('/files', async (req, res) => {
  if (!FLASK_URL) {
    return res.status(503).json({ status: 'error', message: 'FLASK_UPLOAD_URL is not configured on this server.' });
  }

  const targetURL = `${FLASK_URL}/files${req.url}`;

  // Forward relevant headers; pass through X-API-Key if present
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    // Strip hop-by-hop headers
    if (['host', 'connection', 'transfer-encoding', 'te', 'upgrade', 'keep-alive'].includes(key.toLowerCase())) continue;
    forwardHeaders[key] = value;
  }

  try {
    const { default: fetch } = await import('node-fetch');

    const upstream = await fetch(targetURL, {
      method:  req.method,
      headers: forwardHeaders,
      body:    ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req,
      // Allow req stream to be used as body (node-fetch supports Node streams)
      compress: false,
    });

    res.status(upstream.status);
    // Forward response headers (skip hop-by-hop)
    for (const [key, value] of upstream.headers.entries()) {
      if (['transfer-encoding', 'connection'].includes(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }

    upstream.body.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ status: 'error', message: 'Could not reach Flask server.' });
    }
  }
});

// ── SPA fallback — must come after /files proxy ───────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Camera PWA listening on port ${PORT}`);
  if (FLASK_URL) {
    console.log(`Proxying /files/* → ${FLASK_URL}/files/*`);
  } else {
    console.warn('WARNING: FLASK_UPLOAD_URL is not set — /files/* requests will return 503');
  }
});
