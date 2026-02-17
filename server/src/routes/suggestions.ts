import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const router = Router();

const SUGGESTIONS_DIR = path.join(process.cwd(), 'data', 'suggestions');
fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });

const SUGGESTIONS_FILE = path.join(SUGGESTIONS_DIR, 'suggestions.log');

// Rate limiting: 5 requests per IP per hour
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < hour);
  rateLimitMap.set(ip, recent);
  return recent.length >= 5;
}

// Clean up stale entries every hour
setInterval(() => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  for (const [ip, timestamps] of rateLimitMap) {
    const recent = timestamps.filter((t) => now - t < hour);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }
}, 60 * 60 * 1000);

router.post('/', (req, res) => {
  try {
    const ip = req.ip || 'unknown';

    if (isRateLimited(ip)) {
      res.status(429).json({ error: 'Too many suggestions. Please try again later.' });
      return;
    }

    const { name, suggestion } = req.body;

    if (!suggestion || typeof suggestion !== 'string' || suggestion.trim().length === 0) {
      res.status(400).json({ error: 'Suggestion is required' });
      return;
    }

    if (suggestion.length > 2000) {
      res.status(400).json({ error: 'Suggestion must be 2000 characters or less' });
      return;
    }

    if (name !== undefined && name !== null && (typeof name !== 'string' || name.length > 100)) {
      res.status(400).json({ error: 'Name must be 100 characters or less' });
      return;
    }

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ip,
      name: name?.trim() || null,
      suggestion: suggestion.trim(),
    });

    fs.appendFileSync(SUGGESTIONS_FILE, line + '\n');

    // Record the request for rate limiting
    const timestamps = rateLimitMap.get(ip) || [];
    timestamps.push(Date.now());
    rateLimitMap.set(ip, timestamps);

    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Failed to write suggestion');
    res.status(500).json({ error: 'Failed to submit suggestion' });
  }
});

export default router;
