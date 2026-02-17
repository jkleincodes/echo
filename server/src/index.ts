import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { mediaService } from './services/mediaService.js';
import { createSocketServer } from './socket/index.js';
import authRoutes from './routes/auth.js';
import passwordResetRoutes from './routes/passwordReset.js';
import totpRoutes from './routes/totp.js';
import serverRoutes from './routes/servers.js';
import channelRoutes from './routes/channels.js';
import inviteRoutes from './routes/invites.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import dmRoutes from './routes/dms.js';
import searchRoutes from './routes/search.js';
import serverSettingsRoutes from './routes/serverSettings.js';
import giphyRoutes from './routes/giphy.js';
import versionRoutes from './routes/version.js';
import clientLogRoutes from './routes/clientLogs.js';
import suggestionRoutes from './routes/suggestions.js';
import soundboardRoutes from './routes/soundboard.js';
import threadRoutes from './routes/threads.js';
import { bulkRouter as notificationPrefBulkRoutes, scopedRouter as notificationPrefScopedRoutes } from './routes/notificationPreferences.js';
import { webhookCrudRouter, webhookExecuteRouter } from './routes/webhooks.js';
import { UPLOAD_DIR } from './lib/upload.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(process.cwd(), 'data', 'downloads');

const app = express();

// Trust first proxy (Cloudflare) so Express uses X-Forwarded-For for real client IPs
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Ensure uploads and downloads directories exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// Safe MIME types for inline serving (everything else gets Content-Disposition: attachment)
const INLINE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

/**
 * Strip dangerous content from SVG files (defense-in-depth).
 * Removes <script> elements, event handler attributes, and other XSS vectors.
 */
function sanitizeSvg(content: Buffer): string {
  let svg = content.toString('utf-8');
  // Remove <script>...</script> blocks (including multiline)
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  // Remove standalone <script.../> tags
  svg = svg.replace(/<script[^>]*\/>/gi, '');
  // Remove event handler attributes (on*)
  svg = svg.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript: URLs in href/xlink:href
  svg = svg.replace(/(href\s*=\s*)(["'])javascript:[^"']*\2/gi, '$1$2$2');
  // Remove <foreignObject> elements (can embed arbitrary HTML)
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  svg = svg.replace(/<foreignObject[^>]*\/>/gi, '');
  return svg;
}

// Serve uploaded files (no auth — img/video tags can't send Authorization headers)
app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(String(req.params.filename));
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const raw = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();

  // Check content for SVG markers regardless of extension
  const isSvgContent = ext === '.svg' || /^\s*(<\?xml[^>]*\?>)?\s*<svg[\s>]/i.test(raw.slice(0, 512).toString('utf-8'));

  if (isSvgContent) {
    const sanitized = sanitizeSvg(raw);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sanitized);
    return;
  }

  // Known safe image types: serve inline with explicit Content-Type
  const inlineMime = INLINE_MIME_TYPES[ext];
  if (inlineMime) {
    res.setHeader('Content-Type', inlineMime);
    res.sendFile(filePath);
    return;
  }

  // Everything else: force download to prevent browser execution
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

// Serve downloadable app builds (no auth — direct download links)
app.get('/downloads/:filename', (req, res) => {
  const filename = path.basename(String(req.params.filename));
  const filePath = path.join(DOWNLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.download(filePath, filename);
});

// Health check (before auth-protected routes)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Version check (public, no auth required)
app.use('/api/version', versionRoutes);

// Client error logging (public, no auth required)
app.use('/api/client-logs', clientLogRoutes);

// Suggestion box (public, no auth required)
app.use('/api/suggestions', suggestionRoutes);

// Webhook execution (public, no auth required)
app.use('/api/webhooks', webhookExecuteRouter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', passwordResetRoutes);
app.use('/api/auth/totp', totpRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers', channelRoutes);
app.use('/api', inviteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api', searchRoutes);
app.use('/api/servers', serverSettingsRoutes);
app.use('/api/servers', soundboardRoutes);
app.use('/api/servers', threadRoutes);
app.use('/api/notification-preferences', notificationPrefBulkRoutes);
app.use('/api/servers', notificationPrefScopedRoutes);
app.use('/api/servers', webhookCrudRouter);
app.use('/api/giphy', giphyRoutes);

// Serve web SPA static files
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '../../web/dist');
if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));

  // SPA catch-all: serve index.html for non-API, non-upload routes
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/downloads/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });
} else {
  logger.info(`Web directory not found at ${WEB_DIR}, skipping SPA serving`);
}

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const httpServer = createServer(app);
export const io = createSocketServer(httpServer);
app.set('io', io);

async function start() {
  await prisma.$connect();
  logger.info('Database connected');

  try {
    await mediaService.init();
    logger.info('mediasoup initialized');
  } catch (err) {
    logger.warn('mediasoup failed to initialize (voice will be unavailable): ' + (err as Error).message);
  }

  httpServer.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
