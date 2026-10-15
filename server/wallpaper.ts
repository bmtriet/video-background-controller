import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export function wallpaperRouter(root: string, token: () => string) {
  const router = express.Router(), execute = promisify(execFile);
  const folder = path.join(root, '.local/wallpaper'); mkdirSync(folder, { recursive: true });
  const source = path.join(root, 'scripts/wallpaper.swift'), binary = path.join(root, '.local/wallpaper-helper');
  let compiling: Promise<unknown> | undefined, busy = false;
  async function run(args: string[]) {
    if (!existsSync(binary) || statSync(source).mtimeMs > statSync(binary).mtimeMs) {
      compiling ??= execute('/usr/bin/xcrun', ['swiftc', source, '-o', binary], { timeout: 60000 }).finally(() => { compiling = undefined; });
      await compiling;
    }
    try { const { stdout } = await execute(binary, args, { timeout: 15000 }); return JSON.parse(stdout); }
    catch (error) { throw new Error((error as { stderr?: string }).stderr?.trim() || 'Không cập nhật được wallpaper.'); }
  }
  router.use((req, res, next) => {
    if (process.platform !== 'darwin') { res.status(400).json({ error: 'Chỉ hỗ trợ macOS.' }); return; }
    if (req.get('x-presentation-key') !== token()) { res.status(403).json({ error: 'Tải lại Controller trước khi thử lại.' }); return; }
    next();
  });
  router.get('/screens', async (_req, res) => { const screens = await run(['list']); res.json(screens.map((s: { id: string }) => ({ ...s, canRestore: existsSync(path.join(folder, `${s.id}.json`)) }))); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
  router.post('/:screen/:action', upload.single('file'), async (req, res) => {
    const screen = req.params.screen, action = req.params.action;
    if (typeof screen !== 'string' || typeof action !== 'string' || !/^\d+$/.test(screen) || !['set', 'restore'].includes(action)) throw new Error('Lựa chọn wallpaper không hợp lệ.');
    if (busy) throw new Error('Đang cập nhật wallpaper.');
    busy = true; let image: string | undefined, applied = false;
    try {
      const args = [action, screen, path.join(folder, `${screen}.json`)];
      if (action === 'set') {
        const b = req.file?.buffer;
        if (!b || !b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Chọn ảnh PNG bố cục.');
        image = path.join(folder, `${randomUUID()}.png`); writeFileSync(image, b, { flag: 'wx' }); args.push(image);
      }
      const result = await run(args); applied = true; res.json(result);
    } finally { if (image && !applied) unlinkSync(image); busy = false; }
  });
  return router;
}
