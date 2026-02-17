import crypto from 'crypto';
import { JWT_SECRET } from './config.js';

// Derive AES-256 key from JWT_SECRET via HKDF
const ENCRYPTION_KEY = crypto.hkdfSync('sha256', JWT_SECRET, 'echo-totp-encryption', 'aes-256-gcm-key', 32);

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'));
  }
  return codes;
}

export function hashRecoveryCodes(codes: string[]): string {
  return JSON.stringify(codes.map((code) => hashToken(code)));
}

export function verifyRecoveryCode(code: string, hashedCodesJson: string): { match: boolean; remaining: string } {
  const hashed = hashToken(code);
  const codes: string[] = JSON.parse(hashedCodesJson);
  const index = codes.indexOf(hashed);
  if (index === -1) return { match: false, remaining: hashedCodesJson };
  codes.splice(index, 1);
  return { match: true, remaining: JSON.stringify(codes) };
}
