import { Router } from 'express';
import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, generateRecoveryCodes, hashRecoveryCodes } from '../lib/crypto.js';
import { sendTwoFactorEnabledEmail } from '../lib/email.js';

const router = Router();
router.use(authMiddleware);

// Pending TOTP secrets (in-memory, 10min TTL)
const pendingSecrets = new Map<string, { secret: string; expiresAt: number }>();

// Clean up expired pending secrets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingSecrets) {
    if (entry.expiresAt < now) pendingSecrets.delete(key);
  }
}, 5 * 60 * 1000);

// Helper to verify a TOTP code against an encrypted secret
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret);
    const totp = new OTPAuth.TOTP({
      issuer: 'Echo',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

// Setup TOTP — generates secret + QR code
router.post('/setup', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.totpSecret) {
    res.status(400).json({ error: '2FA is already enabled' });
    return;
  }

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'Echo',
    label: user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  // Store pending secret
  pendingSecrets.set(req.userId!, {
    secret: secret.base32,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  res.json({
    data: {
      qrCodeDataUrl,
      secret: secret.base32,
    },
  });
});

// Enable TOTP — verify code against pending secret
const enableSchema = z.object({
  code: z.string().length(6),
});

router.post('/enable', async (req, res) => {
  try {
    const body = enableSchema.parse(req.body);

    const pending = pendingSecrets.get(req.userId!);
    if (!pending || pending.expiresAt < Date.now()) {
      res.status(400).json({ error: 'No pending 2FA setup. Please start setup again.' });
      return;
    }

    // Verify the code
    const totp = new OTPAuth.TOTP({
      issuer: 'Echo',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(pending.secret),
    });
    const delta = totp.validate({ token: body.code, window: 1 });
    if (delta === null) {
      res.status(400).json({ error: 'Invalid code. Please try again.' });
      return;
    }

    // Encrypt and save
    const encrypted = encryptSecret(pending.secret);
    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = hashRecoveryCodes(recoveryCodes);

    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        totpSecret: encrypted,
        totpEnabledAt: new Date(),
        recoveryCodes: hashedCodes,
      },
    });

    pendingSecrets.delete(req.userId!);

    // Send notification email if user has a verified email
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (user?.email && user.emailVerified) {
      sendTwoFactorEnabledEmail(user.email, user.username);
    }

    res.json({ data: { recoveryCodes } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Disable TOTP
const disableSchema = z.object({
  code: z.string(),
  password: z.string(),
});

router.post('/disable', async (req, res) => {
  try {
    const body = disableSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !user.totpSecret) {
      res.status(400).json({ error: '2FA is not enabled' });
      return;
    }

    // Verify password
    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    // Verify TOTP code
    if (!verifyTotpCode(user.totpSecret, body.code)) {
      res.status(401).json({ error: 'Invalid two-factor code' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null },
    });

    res.json({ data: { success: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Get TOTP status
router.get('/status', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    data: {
      enabled: !!user.totpSecret,
      enabledAt: user.totpEnabledAt?.toISOString() || null,
    },
  });
});

// Regenerate recovery codes
const regenerateSchema = z.object({
  code: z.string(),
});

router.post('/recovery-codes/regenerate', async (req, res) => {
  try {
    const body = regenerateSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !user.totpSecret) {
      res.status(400).json({ error: '2FA is not enabled' });
      return;
    }

    if (!verifyTotpCode(user.totpSecret, body.code)) {
      res.status(401).json({ error: 'Invalid two-factor code' });
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = hashRecoveryCodes(recoveryCodes);
    await prisma.user.update({
      where: { id: user.id },
      data: { recoveryCodes: hashedCodes },
    });

    res.json({ data: { recoveryCodes } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

export default router;
