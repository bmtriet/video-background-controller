import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync } from 'node:fs';
import type { Media } from '../shared/types.js';

const images = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const videos = new Set(['.mp4', '.webm', '.mov']);
const imageLimit = 20 * 1024 * 1024;
const videoLimit = 1024 * 1024 * 1024;

function validContent(file: Express.Multer.File, extension: string) {
  const isImage = images.has(extension);
  let buffer: Buffer;
  if (isImage) buffer = readFileSync(file.path);
  else {
    const descriptor = openSync(file.path, 'r');
    try {
      buffer = Buffer.alloc(Math.min(file.size, 128 * 1024));
      const length = readSync(descriptor, buffer, 0, buffer.length, 0);
      buffer = buffer.subarray(0, length);
    } finally { closeSync(descriptor); }
  }
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return buffer[0] === 255 && buffer[1] === 216;
  if (extension === '.webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (extension === '.svg') {
    const svg = buffer.toString();
    return /<svg[\s>]/i.test(svg) && !/<(?:script|foreignObject)|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:)|<!DOCTYPE|<!ENTITY/i.test(svg);
  }
  if (extension === '.webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && buffer.includes(Buffer.from('webm'));
  if (buffer.length < 8) return false;
  const box = buffer.toString('ascii', 4, 8);
  const size = buffer.readUInt32BE(0);
  return (extension === '.mp4' ? ['ftyp'] : ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip']).includes(box) && (size === 0 || size === 1 || size >= 8 && size <= file.size);
}

export function mediaUploadRouter(root: string, register: (relativePath: string) => Media) {
  const router = Router();
  // Stage files outside the watched media folders. Large clips stream to disk;
  // only a complete, validated upload becomes visible to the scanner.
  const temporary = path.join(root, 'data/uploads');
  mkdirSync(temporary, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({ destination: temporary, filename: (_req, _file, done) => done(null, `${randomUUID()}.upload`) }),
    limits: { fileSize: videoLimit, files: 1, fields: 0 },
    fileFilter: (req, file, done) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const allowed = images.has(extension) || req.params.category !== 'logos' && videos.has(extension);
      if (allowed) done(null, true);
      else done(new Error('Chọn PNG, JPG, WEBP, SVG hoặc video MP4, WEBM, MOV phù hợp với vị trí.'));
    },
  });
  router.post('/:category', (req, res, next) => {
    if (!['ads', 'logos', 'backgrounds'].includes(req.params.category)) { res.status(400).json({ error: 'Invalid upload category' }); return; }
    upload.single('file')(req, res, error => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'Video tối đa 1 GB, ảnh tối đa 20 MB.' }); return; }
        next(error); return;
      }
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Chọn file để tải lên.' }); return; }
      try {
        const extension = path.extname(file.originalname).toLowerCase();
        if (images.has(extension) && file.size > imageLimit) { res.status(413).json({ error: 'Ảnh tối đa 20 MB.' }); return; }
        if (!validContent(file, extension)) throw new Error('File không hợp lệ hoặc không đúng định dạng. SVG phải là ảnh tĩnh.');
        const basename = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'media';
        const filename = `${basename}-${randomUUID()}${extension}`;
        const relative = `${req.params.category}/${filename}`;
        renameSync(file.path, path.join(root, 'media', req.params.category, filename));
        res.status(201).json(register(relative));
      } catch (error) { next(error); }
      finally { rmSync(file.path, { force: true }); }
    });
  });
  return router;
}
