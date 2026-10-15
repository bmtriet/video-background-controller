import chokidar from 'chokidar';
import { mkdirSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';
const videos = new Set(['.mp4', '.webm', '.mov']);
const images = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export function createScanner(root: string, store: Store, notify: () => void) {
  const mediaRoot = path.join(root, 'media');
  for (const name of ['videos','ads','images','logos','backgrounds','presentations']) mkdirSync(path.join(mediaRoot, name), { recursive: true });
  function register(file: string) {
    try {
      if (!lstatSync(file).isFile()) return;
      const extension = path.extname(file).toLowerCase();
      if (!videos.has(extension) && !images.has(extension) && extension !== '.pptx') return;
      const relative = path.relative(mediaRoot, file).split(path.sep).join('/');
      store.upsertMedia(path.basename(file), relative, extension === '.pptx' ? 'presentation' : videos.has(extension) ? 'video' : 'image', relative.split('/')[0]);
    } catch { /* File may disappear during a scan. */ }
  }
  function scan() {
    store.db.transaction(() => {
      store.db.prepare('UPDATE media_files SET present=0').run();
      function walk(dir: string) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (entry.isFile()) register(file); } }
      walk(mediaRoot);
    })(); notify();
  }
  scan();
  const watcher = chokidar.watch(mediaRoot, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 700, pollInterval: 100 }, followSymlinks: false });
  const ready = new Promise<void>(resolve => watcher.once('ready', () => resolve()));
  watcher.on('add', file => { register(file); notify(); }).on('change', file => { register(file); notify(); }).on('unlink', file => { store.markMissing(path.relative(mediaRoot, file).split(path.sep).join('/')); notify(); }).on('error', error => console.error('Media watcher:', error));
  return { scan, watcher, ready };
}
