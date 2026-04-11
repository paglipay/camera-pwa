import express from 'express';
import Busboy from 'busboy';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Static assets (built by vite build / heroku-postbuild) ───────────────
app.use(express.static(path.join(__dirname, 'dist')));

// ── Upload endpoint ───────────────────────────────────────────────────────
// Replace this section with your real storage logic (S3, database, etc.)
//
// The incoming multipart/form-data has:
//   image     — the image file (Blob)
//   timestamp — capture timestamp (ms string)
//
// Using busboy for streaming multipart parsing (no temp files kept in memory).

const UPLOADS_DIR = path.join(__dirname, 'uploads');
await mkdir(UPLOADS_DIR, { recursive: true });

app.post('/api/upload', (req, res) => {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Expected multipart/form-data' });
  }

  let fileName  = `upload-${Date.now()}.jpg`;
  let timestamp = null;
  let saved     = false;

  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } });

  busboy.on('field', (name, value) => {
    if (name === 'timestamp') timestamp = value;
  });

  busboy.on('file', (_field, fileStream, info) => {
    // Sanitise the client-supplied filename
    const safeName = path.basename(info.filename || fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    fileName = `${Date.now()}-${safeName}`;
    const dest = path.join(UPLOADS_DIR, fileName);
    const write = createWriteStream(dest);
    fileStream.pipe(write);
    write.on('finish', () => { saved = true; });
    write.on('error', err => {
      console.error('Write error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'File write failed' });
    });
  });

  busboy.on('finish', () => {
    if (!res.headersSent) {
      if (saved) {
        res.status(200).json({ ok: true, fileName, timestamp });
      } else {
        res.status(400).json({ error: 'No file received' });
      }
    }
  });

  busboy.on('error', err => {
    console.error('Busboy error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Upload processing failed' });
  });

  req.pipe(busboy);
});

// ── SPA fallback — must come after /api routes ────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Camera PWA listening on port ${PORT}`);
});
