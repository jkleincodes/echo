import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const router = Router();

const LOGS_DIR = process.env.CLIENT_LOGS_DIR || path.join(process.cwd(), 'data', 'client-logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

function getHourlyFilename(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}_${h}.log`;
}

router.post('/', (req, res) => {
  try {
    const { errors } = req.body;
    if (!Array.isArray(errors) || errors.length === 0) {
      res.status(400).json({ error: 'errors array required' });
      return;
    }

    const filename = getHourlyFilename();
    const filePath = path.join(LOGS_DIR, filename);

    const lines: string[] = [];
    for (const entry of errors.slice(0, 50)) {
      const line = JSON.stringify({
        ts: entry.timestamp || new Date().toISOString(),
        user: entry.username || null,
        userId: entry.userId || null,
        version: entry.appVersion || null,
        os: entry.os || null,
        type: entry.type || 'error',
        message: entry.message || '',
        stack: entry.stack || null,
        source: entry.source || null,
        line: entry.line || null,
        col: entry.col || null,
        url: entry.url || null,
        extra: entry.extra || null,
      });
      lines.push(line);
    }

    fs.appendFileSync(filePath, lines.join('\n') + '\n');
    res.json({ ok: true, count: lines.length });
  } catch (err) {
    logger.error(err, 'Failed to write client logs');
    res.status(500).json({ error: 'Failed to write logs' });
  }
});

export default router;
