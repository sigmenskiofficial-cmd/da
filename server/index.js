// aniyashi server: serves the built client and the API on 0.0.0.0:PORT.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachUser } from './lib/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin.js';
import { MetadataError } from './lib/anilist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "connect-src 'self' https://graphql.anilist.co",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.use(attachUser);

app.use('/api', catalogRouter);
app.use('/api', accountRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API endpoint.' });
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /settings\nDisallow: /profile\n');
});

app.get('/sitemap.xml', (_req, res) => {
  const base = process.env.PUBLIC_ORIGIN || `${_req.protocol}://${_req.get('host')}`;
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/browse', '/trending', '/popular', '/movies', '/schedule']
      .map((route) => `  <url><loc>${base}${route}</loc></url>`)
      .join('\n')}\n</urlset>`,
  );
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h', setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('aniyashi API is running. Run "npm run build" to serve the interface, or "npm run dev" for the development client.');
  });
}

app.use((err, _req, res, _next) => {
  const status = err instanceof MetadataError ? err.status : Number(err?.status) || 500;
  const message =
    err instanceof MetadataError
      ? err.message
      : status >= 500
        ? 'The service could not complete that request. Please try again.'
        : String(err?.message || 'Request failed.');
  if (status >= 500) console.error('[api]', err?.message || err);
  res.status(status).json({ error: message, detail: status >= 500 ? (err?.detail ?? null) : null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[aniyashi] listening on http://0.0.0.0:${PORT} (dist ${fs.existsSync(DIST) ? 'present' : 'missing'})`);
});
