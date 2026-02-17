import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/config.js';

export interface JwtPayload {
  userId: string;
  purpose?: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Reject MFA-purpose tokens in regular auth
    if (payload.purpose === 'mfa') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

export function signMfaToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'mfa' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyMfaToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.purpose !== 'mfa') return null;
    return payload.userId;
  } catch {
    return null;
  }
}
