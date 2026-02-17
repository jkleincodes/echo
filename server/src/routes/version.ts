import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    data: {
      version: process.env.APP_VERSION || '1.0.0',
      downloadUrl: process.env.APP_DOWNLOAD_URL || '',
      releaseNotes: process.env.APP_RELEASE_NOTES || '',
    },
  });
});

export default router;
