import { Router } from 'express';
import { z } from 'zod';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { avatarUpload, bannerUpload, validateUploadedImage } from '../lib/upload.js';
import { getRelatedUserSocketIds, getSocketIdsForUser } from '../socket/presenceHandler.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { sendEmailVerification } from '../lib/email.js';

const router = Router();
router.use(authMiddleware);

function broadcastUserUpdate(req: import('express').Request, userId: string, userData: Record<string, unknown>) {
  const io = req.app.get('io') as Server | undefined;
  if (!io) return;
  const userPayload = { ...userData, createdAt: undefined };
  // Send to related users and also to the user's own other sockets
  getRelatedUserSocketIds(io, userId).then((socketIds) => {
    const ownSockets = getSocketIdsForUser(userId);
    const allSockets = new Set([...socketIds, ...ownSockets]);
    for (const sid of allSockets) {
      io.to(sid).emit('user:updated', userPayload);
    }
  });
}

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  bio: true,
  customStatus: true,
  bannerColor: true,
  bannerUrl: true,
  pronouns: true,
  createdAt: true,
};

// Extended select for authenticated user's own profile (includes private fields)
const PRIVATE_USER_SELECT = {
  ...USER_SELECT,
  email: true,
  emailVerified: true,
  totpSecret: true,
};

function serializePrivateUser(user: any) {
  const serialized = {
    ...user,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: !!user.totpSecret,
  };
  // Strip totpSecret from the response (client only needs the boolean)
  delete serialized.totpSecret;
  return serialized;
}

function serializePublicUser(user: any) {
  const { email: _e, emailVerified: _ev, totpSecret: _ts, twoFactorEnabled: _tf, ...publicData } = serializePrivateUser(user);
  return publicData;
}

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(190).optional().nullable(),
  customStatus: z.string().max(128).optional().nullable(),
  bannerColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  pronouns: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

// Get user profile
router.get('/:userId', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: USER_SELECT,
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Find mutual servers
  const mutualServers = await prisma.server.findMany({
    where: {
      members: {
        some: { userId: req.params.userId },
      },
      AND: {
        members: {
          some: { userId: req.userId! },
        },
      },
    },
    select: { id: true, name: true, iconUrl: true },
  });

  res.json({
    data: {
      ...user,
      createdAt: user.createdAt.toISOString(),
      mutualServers,
    },
  });
});

// Update own profile
router.patch('/me', async (req, res) => {
  try {
    const body = updateProfileSchema.parse(req.body);

    // Handle email change
    let emailData: Record<string, unknown> = {};
    if (body.email !== undefined) {
      if (body.email) {
        // Check uniqueness
        const emailTaken = await prisma.user.findFirst({
          where: { email: body.email, id: { not: req.userId! } },
        });
        if (emailTaken) {
          res.status(409).json({ error: 'Email already in use' });
          return;
        }
        emailData = { email: body.email, emailVerified: false };
      } else {
        emailData = { email: null, emailVerified: false };
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.bio !== undefined && { bio: body.bio }),
        ...(body.customStatus !== undefined && { customStatus: body.customStatus }),
        ...(body.bannerColor !== undefined && { bannerColor: body.bannerColor }),
        ...(body.pronouns !== undefined && { pronouns: body.pronouns }),
        ...emailData,
      },
      select: PRIVATE_USER_SELECT,
    });

    // Send verification email if email was changed to a new value
    if (body.email) {
      const verifyToken = generateToken();
      await prisma.emailVerificationToken.create({
        data: {
          userId: req.userId!,
          tokenHash: hashToken(verifyToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      sendEmailVerification(body.email, verifyToken, user.username);
    }

    broadcastUserUpdate(req, req.userId!, serializePublicUser(user));
    res.json({ data: serializePrivateUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Upload avatar
router.post('/me/avatar', (req, res, next) => {
  avatarUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const imageError = await validateUploadedImage(file);
    if (imageError) {
      res.status(400).json({ error: imageError });
      return;
    }

    const avatarUrl = `/uploads/${file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { avatarUrl },
      select: PRIVATE_USER_SELECT,
    });

    broadcastUserUpdate(req, req.userId!, serializePublicUser(user));
    res.json({ data: serializePrivateUser(user) });
  });
});

// Upload banner image
router.post('/me/banner', (req, res, next) => {
  bannerUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      // No file means remove banner
      const user = await prisma.user.update({
        where: { id: req.userId! },
        data: { bannerUrl: null },
        select: PRIVATE_USER_SELECT,
      });
      broadcastUserUpdate(req, req.userId!, serializePublicUser(user));
      res.json({ data: serializePrivateUser(user) });
      return;
    }

    const bannerError = await validateUploadedImage(file);
    if (bannerError) {
      res.status(400).json({ error: bannerError });
      return;
    }

    const bannerUrl = `/uploads/${file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { bannerUrl },
      select: PRIVATE_USER_SELECT,
    });

    broadcastUserUpdate(req, req.userId!, serializePublicUser(user));
    res.json({ data: serializePrivateUser(user) });
  });
});

export default router;
