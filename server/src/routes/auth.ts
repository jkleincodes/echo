import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { signToken, signMfaToken, authMiddleware } from '../middleware/auth.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { sendEmailVerification } from '../lib/email.js';

const router = Router();

// In-memory store for one-time exchange codes (desktop auth flow)
const exchangeCodes = new Map<string, { token: string; expiresAt: number }>();

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of exchangeCodes) {
    if (entry.expiresAt < now) exchangeCodes.delete(code);
  }
}, 5 * 60 * 1000);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .refine((p) => /[A-Z]/.test(p), 'Password must contain at least one uppercase letter')
    .refine((p) => /[0-9]/.test(p), 'Password must contain at least one number'),
  email: z.string().email().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  totpCode: z.string().optional(),
});

function toUserResponse(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  bio: string | null;
  customStatus: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  pronouns: string | null;
  email?: string | null;
  emailVerified?: boolean;
  totpSecret?: string | null;
}, includePrivate = false) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    bio: user.bio,
    customStatus: user.customStatus,
    bannerColor: user.bannerColor,
    bannerUrl: user.bannerUrl,
    pronouns: user.pronouns,
    ...(includePrivate && {
      email: user.email ?? null,
      emailVerified: user.emailVerified ?? false,
      twoFactorEnabled: !!user.totpSecret,
    }),
  };
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    body.username = body.username.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { username: body.username } });
    if (existing) {
      logger.warn({ username: body.username }, 'Register failed: username taken');
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    if (body.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: body.email } });
      if (emailTaken) {
        logger.warn({ email: body.email }, 'Register failed: email in use');
        res.status(409).json({ error: 'Email already in use' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        displayName: body.displayName,
        passwordHash,
        email: body.email || null,
      },
    });

    // Send verification email if email provided
    if (body.email) {
      const verifyToken = generateToken();
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(verifyToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });
      sendEmailVerification(body.email, verifyToken, body.username);
    }

    const token = signToken(user.id);
    res.status(201).json({ data: { token, user: toUserResponse(user, true) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.warn({ errors: err.errors }, 'Register failed: validation error');
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    body.username = body.username.toLowerCase();

    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user) {
      logger.warn({ username: body.username }, 'Login failed: user not found');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      logger.warn({ username: body.username }, 'Login failed: wrong password');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // If 2FA is enabled and no TOTP code provided, return MFA challenge
    if (user.totpSecret && !body.totpCode) {
      const mfaToken = signMfaToken(user.id);
      res.json({ data: { mfaRequired: true, mfaToken } });
      return;
    }

    // If 2FA is enabled and TOTP code provided, verify it inline
    if (user.totpSecret && body.totpCode) {
      const { verifyTotpCode } = await import('./totp.js');
      const totpValid = verifyTotpCode(user.totpSecret, body.totpCode);
      if (!totpValid) {
        // Try recovery code
        const { verifyRecoveryCode } = await import('../lib/crypto.js');
        if (user.recoveryCodes) {
          const result = verifyRecoveryCode(body.totpCode, user.recoveryCodes);
          if (result.match) {
            await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: result.remaining } });
          } else {
            logger.warn({ username: body.username }, 'Login failed: invalid 2FA code');
            res.status(401).json({ error: 'Invalid two-factor code' });
            return;
          }
        } else {
          res.status(401).json({ error: 'Invalid two-factor code' });
          return;
        }
      }
    }

    logger.info({ username: body.username }, 'Login successful');
    const token = signToken(user.id);
    res.json({ data: { token, user: toUserResponse(user, true) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.warn({ errors: err.errors }, 'Login failed: validation error');
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ data: toUserResponse(user, true) });
});

// MFA login (second step after receiving mfaToken)
const mfaLoginSchema = z.object({
  mfaToken: z.string(),
  totpCode: z.string(),
});

router.post('/login/mfa', authLimiter, async (req, res) => {
  try {
    const body = mfaLoginSchema.parse(req.body);

    // Verify MFA token
    const { verifyMfaToken } = await import('../middleware/auth.js');
    const userId = verifyMfaToken(body.mfaToken);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired MFA token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      res.status(401).json({ error: 'Invalid MFA session' });
      return;
    }

    // Verify TOTP code
    const { verifyTotpCode } = await import('./totp.js');
    let codeValid = verifyTotpCode(user.totpSecret, body.totpCode);

    // If TOTP failed, try recovery code
    if (!codeValid && user.recoveryCodes) {
      const { verifyRecoveryCode } = await import('../lib/crypto.js');
      const result = verifyRecoveryCode(body.totpCode, user.recoveryCodes);
      if (result.match) {
        await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: result.remaining } });
        codeValid = true;
      }
    }

    if (!codeValid) {
      res.status(401).json({ error: 'Invalid two-factor code' });
      return;
    }

    const token = signToken(user.id);
    res.json({ data: { token, user: toUserResponse(user, true) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const tokenHash = hashToken(token);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  res.json({ data: { success: true } });
});

// Resend verification email
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many requests, please try again later' },
});

router.post('/resend-verification', authMiddleware, resendVerificationLimiter, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !user.email) {
    res.status(400).json({ error: 'No email on account' });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: 'Email already verified' });
    return;
  }

  const verifyToken = generateToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(verifyToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  sendEmailVerification(user.email, verifyToken, user.username);

  res.json({ data: { success: true } });
});

// Change password
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .refine((p) => /[A-Z]/.test(p), 'Password must contain at least one uppercase letter')
    .refine((p) => /[0-9]/.test(p), 'Password must contain at least one number'),
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const body = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ data: { success: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Create a one-time exchange code for desktop auth flow (requires auth)
router.post('/exchange-code', authMiddleware, (req, res) => {
  const code = crypto.randomBytes(32).toString('hex');
  const token = req.headers.authorization!.slice(7);
  exchangeCodes.set(code, { token, expiresAt: Date.now() + 60_000 });
  res.json({ data: { code } });
});

// Exchange a one-time code for a JWT (no auth required)
router.post('/exchange', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing code' });
    return;
  }

  const entry = exchangeCodes.get(code);
  if (!entry) {
    res.status(404).json({ error: 'Invalid or expired code' });
    return;
  }

  exchangeCodes.delete(code);

  if (entry.expiresAt < Date.now()) {
    res.status(410).json({ error: 'Code expired' });
    return;
  }

  res.json({ data: { token: entry.token } });
});

export default router;
