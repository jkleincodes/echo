import { Resend } from 'resend';
import { RESEND_API_KEY, APP_URL, EMAIL_FROM } from './config.js';
import { logger } from './logger.js';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    logger.warn(`Email not sent (no RESEND_API_KEY): to=${to} subject="${subject}"`);
    return;
  }
  try {
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    if (result.error) {
      logger.error({ resendError: result.error }, `Resend API error sending to ${to}`);
    } else {
      logger.info(`Email sent to ${to}: ${result.data?.id}`);
    }
  } catch (err) {
    logger.error(err, `Failed to send email to ${to}`);
  }
}

export async function sendEmailVerification(to: string, token: string, username: string) {
  const url = `${APP_URL}/verify-email?token=${token}`;
  await send(to, 'Verify your email — Echo', `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Hey ${username},</h2>
      <p>Click the button below to verify your email address:</p>
      <p><a href="${url}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 4px; font-weight: 600;">Verify Email</a></p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${url}</p>
      <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
    </div>
  `);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const url = `${APP_URL}/reset-password?token=${token}`;
  await send(to, 'Reset your password — Echo', `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Hey ${username},</h2>
      <p>We received a request to reset your password. Click the button below:</p>
      <p><a href="${url}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 4px; font-weight: 600;">Reset Password</a></p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${url}</p>
      <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>
  `);
}

export async function sendTwoFactorEnabledEmail(to: string, username: string) {
  await send(to, 'Two-factor authentication enabled — Echo', `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Hey ${username},</h2>
      <p>Two-factor authentication has been enabled on your account.</p>
      <p style="color: #666; font-size: 14px;">If you didn't do this, please secure your account immediately.</p>
    </div>
  `);
}
