function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} environment variable is required`);
  return val;
}

export const JWT_SECRET = requireEnv('JWT_SECRET');
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const APP_URL = process.env.APP_URL || 'http://localhost:3001';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Echo <noreply@localhost>';
export const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
