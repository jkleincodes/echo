import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { GIPHY_API_KEY } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const trendingSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    original: GiphyImage;
    fixed_height_small: GiphyImage;
  };
}

function mapGif(gif: GiphyGif) {
  return {
    id: gif.id,
    title: gif.title,
    url: gif.images.original.url,
    width: Number(gif.images.original.width),
    height: Number(gif.images.original.height),
    previewUrl: gif.images.fixed_height_small.url,
    previewWidth: Number(gif.images.fixed_height_small.width),
    previewHeight: Number(gif.images.fixed_height_small.height),
  };
}

router.get('/search', authMiddleware, async (req, res) => {
  if (!GIPHY_API_KEY) {
    res.status(503).json({ error: 'Giphy integration not configured' });
    return;
  }

  try {
    const params = searchSchema.parse(req.query);
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(params.q)}&limit=${params.limit}&offset=${params.offset}&rating=pg-13&lang=en`;
    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ status: response.status }, 'Giphy API error');
      res.status(502).json({ error: 'Giphy API error' });
      return;
    }
    const body = await response.json();
    res.json({ data: body.data.map(mapGif), pagination: body.pagination });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    logger.error(err, 'Giphy search failed');
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/trending', authMiddleware, async (req, res) => {
  if (!GIPHY_API_KEY) {
    res.status(503).json({ error: 'Giphy integration not configured' });
    return;
  }

  try {
    const params = trendingSchema.parse(req.query);
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${params.limit}&offset=${params.offset}&rating=pg-13`;
    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ status: response.status }, 'Giphy API error');
      res.status(502).json({ error: 'Giphy API error' });
      return;
    }
    const body = await response.json();
    res.json({ data: body.data.map(mapGif), pagination: body.pagination });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    logger.error(err, 'Giphy trending failed');
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
