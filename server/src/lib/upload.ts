import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from './logger.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'text/csv',
  'text/markdown',
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-wav',
  'audio/wave',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
}).array('files', 10);

export const avatarUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File must be an image (JPEG, PNG, GIF, or WebP)'));
    }
  },
}).single('avatar');

export const bannerUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File must be an image (JPEG, PNG, GIF, or WebP)'));
    }
  },
}).single('banner');

/**
 * Validates that uploaded files' actual content matches allowed MIME types.
 * Deletes files that fail validation.
 * Returns an error message if validation fails, or null if all files are valid.
 */
export async function validateUploadedFiles(files: Express.Multer.File[]): Promise<string | null> {
  for (const file of files) {
    const filePath = path.join(UPLOAD_DIR, file.filename);
    try {
      const buffer = fs.readFileSync(filePath);
      const detected = await fileTypeFromBuffer(buffer);

      // For text-based types (plain, csv, markdown, json), file-type returns undefined
      // since they have no magic bytes. Allow those through based on extension.
      if (!detected) {
        const ext = path.extname(file.originalname).toLowerCase();
        const textExts = ['.txt', '.csv', '.md', '.json'];
        if (textExts.includes(ext)) continue;
        // Unknown binary with no detectable type - reject
        fs.unlinkSync(filePath);
        return `File "${file.originalname}" has an unrecognizable format`;
      }

      if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
        fs.unlinkSync(filePath);
        return `File "${file.originalname}" content does not match an allowed type (detected: ${detected.mime})`;
      }
    } catch (err) {
      logger.error(err, 'Error validating uploaded file');
      try { fs.unlinkSync(filePath); } catch {}
      return `Failed to validate file "${file.originalname}"`;
    }
  }
  return null;
}

const soundboardStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `sound-${crypto.randomUUID()}${ext}`);
  },
});

export const soundboardUpload = multer({
  storage: soundboardStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File must be an audio file (MP3, OGG, WAV, or WebM)'));
    }
  },
}).single('sound');

/**
 * Validates a single uploaded audio file's actual content.
 */
export async function validateUploadedAudio(file: Express.Multer.File): Promise<string | null> {
  const filePath = path.join(UPLOAD_DIR, file.filename);
  try {
    const buffer = fs.readFileSync(filePath);
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED_AUDIO_MIME_TYPES.has(detected.mime)) {
      fs.unlinkSync(filePath);
      return `File content is not a valid audio file (detected: ${detected?.mime ?? 'unknown'})`;
    }
    return null;
  } catch (err) {
    logger.error(err, 'Error validating uploaded audio');
    try { fs.unlinkSync(filePath); } catch {}
    return 'Failed to validate audio file';
  }
}

/**
 * Validates a single uploaded image file's actual content.
 */
export async function validateUploadedImage(file: Express.Multer.File): Promise<string | null> {
  const filePath = path.join(UPLOAD_DIR, file.filename);
  try {
    const buffer = fs.readFileSync(filePath);
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
      fs.unlinkSync(filePath);
      return `File content is not a valid image (detected: ${detected?.mime ?? 'unknown'})`;
    }
    return null;
  } catch (err) {
    logger.error(err, 'Error validating uploaded image');
    try { fs.unlinkSync(filePath); } catch {}
    return 'Failed to validate image file';
  }
}
