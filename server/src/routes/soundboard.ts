import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { UPLOAD_DIR, soundboardUpload, validateUploadedAudio } from '../lib/upload.js';
const MAX_SOUNDBOARD_SOUNDS = 50;

const router = Router();
router.use(authMiddleware);

const updateSoundSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  emoji: z.string().max(10).optional().nullable(),
});

// List sounds for a server
router.get('/:serverId/soundboard', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member of this server' });
    return;
  }

  const sounds = await prisma.soundboardSound.findMany({
    where: { serverId: req.params.serverId },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    data: sounds.map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      filename: s.filename,
      serverId: s.serverId,
      uploaderId: s.uploaderId,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

// Upload a new sound (admin/owner only)
router.post('/:serverId/soundboard', (req, res) => {
  soundboardUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      // Clean up uploaded file
      const file = req.file as Express.Multer.File | undefined;
      if (file) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, file.filename)); } catch {}
      }
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No sound file provided' });
      return;
    }

    // Validate actual file content
    const validationError = await validateUploadedAudio(file);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Check sound limit
    const count = await prisma.soundboardSound.count({
      where: { serverId: req.params.serverId },
    });
    if (count >= MAX_SOUNDBOARD_SOUNDS) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, file.filename)); } catch {}
      res.status(400).json({ error: `Maximum of ${MAX_SOUNDBOARD_SOUNDS} sounds per server` });
      return;
    }

    const name = (req.body?.name as string) || path.parse(file.originalname).name;
    const emoji = (req.body?.emoji as string) || null;

    const sound = await prisma.soundboardSound.create({
      data: {
        name: name.slice(0, 50),
        emoji,
        filename: file.filename,
        serverId: req.params.serverId,
        uploaderId: req.userId!,
      },
    });

    res.status(201).json({
      data: {
        id: sound.id,
        name: sound.name,
        emoji: sound.emoji,
        filename: sound.filename,
        serverId: sound.serverId,
        uploaderId: sound.uploaderId,
        createdAt: sound.createdAt.toISOString(),
      },
    });
  });
});

// Update sound name/emoji (admin/owner only)
router.patch('/:serverId/soundboard/:soundId', async (req, res) => {
  try {
    const body = updateSoundSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const sound = await prisma.soundboardSound.findFirst({
      where: { id: req.params.soundId, serverId: req.params.serverId },
    });
    if (!sound) {
      res.status(404).json({ error: 'Sound not found' });
      return;
    }

    const updated = await prisma.soundboardSound.update({
      where: { id: req.params.soundId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.emoji !== undefined && { emoji: body.emoji }),
      },
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        emoji: updated.emoji,
        filename: updated.filename,
        serverId: updated.serverId,
        uploaderId: updated.uploaderId,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Delete a sound (admin/owner only)
router.delete('/:serverId/soundboard/:soundId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const sound = await prisma.soundboardSound.findFirst({
    where: { id: req.params.soundId, serverId: req.params.serverId },
  });
  if (!sound) {
    res.status(404).json({ error: 'Sound not found' });
    return;
  }

  await prisma.soundboardSound.delete({ where: { id: req.params.soundId } });

  // Delete the file
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, sound.filename));
  } catch {}

  res.json({ data: { success: true } });
});

export default router;
