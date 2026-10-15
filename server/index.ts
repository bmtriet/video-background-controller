import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Store } from './store.js';
import { createScanner } from './scanner.js';
import { Presentation } from './presentation.js';
import { Runtime } from './runtime.js';
import { mediaUploadRouter } from './uploads.js';
import { wallpaperRouter } from './wallpaper.js';

export function createApplication(root = process.cwd()) {
  const store = new Store(root);
  const app = express(); const http = createServer(app);
  const io = new Server(http);
  let errors: string[] = [];
  const fail = (message: string) => { errors = [...errors.slice(-9), message]; io.emit('operation:error', message); };
  let presentation: Presentation | undefined;
  const runtime = new Runtime(store, () => { io.emit('player:state', runtime.snapshot()); presentation?.sync(); }, fail);
  const players = () => [...io.sockets.sockets.values()].filter(s => s.data.role === 'player').length;
  const snapshot = () => ({ events: store.events(), playlist: store.playlist(), media: store.media(), settings: store.settings(), state: runtime.snapshot(), playerCount: players(), errors, logoTextDefault: store.logoTextDefault(), capabilities: { itemLoop: true, compoundAds: true, videoBackground: true, mediaUpload: true, imageAds: true, imageLogoColumns: true, mediaContent: true, playlistLoopRange: true, logoText: true, presentation: process.platform === 'darwin' } });
  const updated = (event = 'playlist:updated') => { io.emit(event, snapshot()); };
  const scanner = createScanner(root, store, () => updated('media:updated'));
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.status(403).json({ error: 'Local requests only' }); return; }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/state', (_req, res) => res.json(snapshot()));
  app.get('/api/events', (_req, res) => res.json(store.events()));
  app.post('/api/events', (req, res) => { const event = store.createEvent(req.body.name); updated('event:updated'); res.status(201).json(event); });
  app.put('/api/events/:id', (req, res) => { if (req.body.name !== undefined) store.renameEvent(req.params.id, req.body.name); if (req.body.active === true) { store.activate(req.params.id); runtime.reset(); } updated('event:updated'); res.json(snapshot()); });
  app.post('/api/events/:id/duplicate', (req, res) => { const event = store.duplicateEvent(req.params.id); updated('event:updated'); res.status(201).json(event); });
  app.delete('/api/events/:id', (req, res) => { const wasActive = req.params.id === store.activeId(); store.deleteEvent(req.params.id); if (wasActive) runtime.reset(); updated('event:updated'); res.json(snapshot()); });
  app.get('/api/media', (_req, res) => res.json(store.media()));
  app.post('/api/media/rescan', (_req, res) => { scanner.scan(); res.json(store.media()); });
  app.use('/api/media/upload', mediaUploadRouter(root, relative => {
    scanner.scan();
    const media = store.media().find(file => file.relativePath === relative);
    if (!media) throw new Error('Uploaded file could not be registered');
    return media;
  }));
  presentation = new Presentation(root, store, runtime, () => updated('event:updated'));
  app.use('/api/wallpaper', wallpaperRouter(root, () => presentation!.token));
  app.use('/api/presentation', presentation.router(relative => { scanner.scan(); return store.media().find(file => file.relativePath === relative); }));
  app.get('/api/playlist', (_req, res) => res.json(store.playlist()));
  app.post('/api/playlist', (req, res) => { const item = store.createItem(req.body); updated(); res.status(201).json(item); });
  app.post('/api/playlist/reorder', (req, res) => { store.reorder(req.body.ids); updated(); res.json(store.playlist()); });
  app.put('/api/playlist/:id', (req, res) => { const live = runtime.current(); if (live?.itemType === 'PRESENTATION' && live.id === req.params.id && runtime.state.status !== 'STOPPED' && (req.body.mediaId !== undefined && req.body.mediaId !== live.mediaId || req.body.presentationMode !== undefined && req.body.presentationMode !== live.presentationMode)) throw new Error('Kết thúc bài đang chiếu trước khi đổi PowerPoint.'); const item = store.updateItem(req.params.id, req.body); runtime.reconcile(); updated(); res.json(item); });
  app.delete('/api/playlist/:id', (req, res) => { store.deleteItem(req.params.id); runtime.reconcile(); updated(); res.json(store.playlist()); });
  app.put('/api/settings', (req, res) => { store.updateSettings(req.body); updated('event:updated'); res.json(store.settings()); });
  app.get('/api/logo-text/default', (_req, res) => res.json(store.logoTextDefault()));
  app.put('/api/logo-text/default', (req, res) => { const style = store.setLogoTextDefault(req.body); updated('event:updated'); res.json(style); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.post('/api/logos/upload', upload.single('logo'), (req, res) => {
    const file = req.file; if (!file) throw new Error('Choose a logo file');
    const extension = path.extname(file.originalname).toLowerCase();
    const b = file.buffer;
    const signatures: Record<string, boolean> = {
      '.png': b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      '.jpg': b[0] === 255 && b[1] === 216, '.jpeg': b[0] === 255 && b[1] === 216,
      '.webp': b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP',
      '.svg': /<svg[\s>]/i.test(b.toString()) && !/<(?:script|foreignObject)|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:)|<!DOCTYPE|<!ENTITY/i.test(b.toString())
    };
    if (!signatures[extension]) throw new Error('Unsupported or invalid logo. Use PNG, JPG, WEBP or a static SVG (maximum 5 MB).');
    const filename = `${path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,60) || 'logo'}-${randomUUID()}${extension}`;
    writeFileSync(path.join(root, 'media/logos', filename), b, { flag: 'wx' });
    scanner.scan(); res.status(201).json(store.media().find(m => m.relativePath === `logos/${filename}`));
  });
  const mediaRoot = realpathSync(path.resolve(root, 'media'));
  app.get('/content/:id', (req, res) => {
    const media = store.media().find(file => file.id === req.params.id && file.exists);
    if (!media) { res.sendStatus(404); return; }
    let file: string;
    try { file = realpathSync(path.resolve(mediaRoot, media.relativePath)); }
    catch { res.sendStatus(404); return; }
    if (!file.startsWith(mediaRoot + path.sep)) { res.sendStatus(403); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    // Express handles browser cancellations without forwarding them as errors.
    res.sendFile(file, { dotfiles: 'deny' });
  });
  app.use('/media', (req, res, next) => {
    try {
      const file = realpathSync(path.resolve(mediaRoot, '.' + decodeURIComponent(req.path)));
      if (!file.startsWith(mediaRoot + path.sep)) { res.sendStatus(403); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      next();
    } catch { res.sendStatus(404); }
  }, express.static(mediaRoot, { dotfiles: 'deny', index: false, fallthrough: false }));
  const frontend = path.join(root, 'dist/frontend');
  app.use(express.static(frontend));
  for (const route of ['/', '/controller', '/player', '/slide-setup']) app.get(route, (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.aborted || res.destroyed || res.writableEnded) return;
    // A streaming response cannot be replaced with a JSON error response.
    if (res.headersSent) { next(error); return; }
    res.status(error.status || 400).json({ error: error.message || 'Operation failed' });
  });

  io.on('connection', socket => {
    socket.data.role = socket.handshake.auth.role === 'player' ? 'player' : 'controller';
    socket.emit('sync', snapshot()); io.emit('player:connection', players());
    socket.on('disconnect', () => io.emit('player:connection', players()));
    const command = (event: string, action: (payload: any) => void) => socket.on(event, (payload: any, ack?: (result: any) => void) => {
      if (socket.data.role !== 'controller') return;
      try { action(payload); updated('event:updated'); ack?.({ ok: true }); }
      catch (e) { const message = (e as Error).message; socket.emit('operation:error', message); ack?.({ error: message }); }
    });
    command('controller:play', p => runtime.play(p?.itemId));
    command('controller:pause', () => runtime.pause());
    command('controller:stop', () => runtime.stop());
    command('controller:next', () => runtime.step(1));
    command('controller:previous', () => runtime.step(-1));
    command('controller:seek', p => runtime.seek(p?.seconds));
    command('controller:select-item', p => store.updateSettings({ selectedItemId: p?.itemId }));
    command('controller:set-volume', p => store.updateSettings({ globalVolume: p?.volume }));
    command('controller:refresh-player', () => io.emit('player:refresh', snapshot()));
    socket.on('player:ended', p => { if (socket.data.role === 'player') runtime.ended(p?.itemId, p?.generation); });
    socket.on('player:error', p => { if (socket.data.role === 'player' && p?.itemId === runtime.state.currentItemId) fail(String(p.message).slice(0,300)); });
  });
  const timer = setInterval(() => runtime.tick(), 250);
  return { app, http, io, store, runtime, scanner, close: async () => { clearInterval(timer); await presentation?.close(); await scanner.watcher.close(); await new Promise<void>(resolve => io.close(() => resolve())); store.db.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const application = createApplication(process.env.EVENT_PLAYER_ROOT || process.cwd());
  const port = Number(process.env.PORT || 3000);
  application.http.listen(port, '127.0.0.1', () => console.log(`Event Video Player running\nController: http://localhost:${port}/controller\nPlayer: http://localhost:${port}/player`));
  application.http.on('error', error => { console.error('Unable to start server:', error.message); process.exitCode = 1; void application.close(); });
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void application.close().then(() => process.exit(0)); });
}
