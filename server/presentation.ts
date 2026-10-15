import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { copyFileSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Store } from './store.js';
import type { Runtime } from './runtime.js';
import { parseDeckXml, parseNativeResult, validateRect } from './presentationMetadata.js';
import { presentationWindow, type NativePresentation, type Rect } from '../shared/presentationTest.js';

const execute = promisify(execFile);
export class Presentation {
  token = randomUUID();
  busy = false;
  error: string | null = null;
  expanded = false;
  captureStopVersion = 0;
  native: NativePresentation | null = null;
  slot: { itemId: string; generation: number; rect: Rect; viewport: Rect; at: number; expanded: boolean } | null = null;
  owned: { itemId: string; generation: number; file: string; slides: number; ratio: number } | null = null;
  reporter: { id: string; generation: number; at: number; capturing?: boolean } | null = null;
  attempted = '';
  closing = false;
  compiled: Promise<void> | null = null;
  constructor(public root: string, public store: Store, public runtime: Runtime, public changed: () => void, public runner: typeof execute = execute) {
    mkdirSync(path.join(root, 'data/presentations'), { recursive: true });
  }
  current() { const item = this.runtime.current(); return item?.itemType === 'PRESENTATION' && !item.slideSetupOnly && this.runtime.state.status !== 'STOPPED' ? item : null; }
  snapshot() { return { token: this.token, available: process.platform === 'darwin', itemId: this.current()?.id ?? null, generation: this.runtime.state.generation, busy: this.busy, error: this.error, expanded: this.expanded, mode: this.current()?.presentationMode ?? 'capture', captureStopVersion: this.captureStopVersion, captureActive: !!this.reporter?.capturing && this.reporter.generation === this.runtime.state.generation && Date.now() - this.reporter.at < 5000, captureWindowTitle: this.owned ? `PowerPoint Slide Show - [${path.basename(this.owned.file, '.pptx')}]` : null, native: this.native, ownedItemId: this.owned?.itemId ?? null, ownedGeneration: this.owned?.generation ?? null, connected: !!this.slot && Date.now() - this.slot.at < 5000 }; }
  async compile() {
    if (process.platform !== 'darwin') throw new Error('Điều khiển PowerPoint hiện hỗ trợ macOS.');
    if (!this.compiled) this.compiled = (async () => {
      mkdirSync(path.join(this.root, '.local'), { recursive: true });
      for (const helper of ['presentation-window', 'presentation-displays']) {
        await this.runner('/usr/bin/xcrun', ['swiftc', path.join(this.root, `scripts/${helper}.swift`), '-o', path.join(this.root, `.local/${helper}`)], { timeout: 60000 });
      }
    })().catch(error => { this.compiled = null; throw error; });
    await this.compiled;
  }
  file(id: string) {
    const media = this.store.media().find(m => m.id === id && m.exists);
    if (!media) throw new Error('Không tìm thấy file PowerPoint.');
    const root = realpathSync(path.join(this.root, 'media'));
    const file = realpathSync(path.join(root, media.relativePath));
    if (!file.startsWith(root + path.sep)) throw new Error('File ngoài thư viện.');
    return file;
  }
  async run(action: string) {
    const owned = this.owned;
    if (!owned) throw new Error('Chưa mở bài thuyết trình.');
    await this.compile();
    const capture = this.current()?.presentationMode !== 'window';
    const nativeAction = capture && ['next', 'previous'].includes(action) ? `capture-${action}` : action;
    const args = [nativeAction, owned.file, path.basename(owned.file), String(owned.slides)];
    if (action === 'open' || action === 'fit') {
      const item = this.current(), slot = this.slot;
      if (!item || item.id !== owned.itemId || !slot || slot.itemId !== item.id || slot.generation !== this.runtime.state.generation || slot.expanded !== this.expanded || Date.now() - slot.at > 5000) throw new Error('Mở Player trong Chrome, cùng Desktop với PowerPoint và chờ kết nối.');
      const ratio = item.presentationRatio === '16:9' ? 16 / 9 : item.presentationRatio === '4:3' ? 4 / 3 : owned.ratio;
      const source = capture ? { x: slot.viewport.x + 20, y: slot.viewport.y + 20, width: Math.min(1000, slot.viewport.width - 40), height: Math.min(700, slot.viewport.height - 40) } : slot.rect;
      const b = presentationWindow(source, ratio, item.presentationTitleBar ?? 32, item.presentationInsetX ?? 0, item.presentationInsetY ?? 0);
      args.push(...[b.x, b.y, b.x + b.width, b.y + b.height].map(String));
    }
    const result = await this.runner(path.join(this.root, '.local/presentation-window'), args, { timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 8192 });
    this.native = result.stdout.trim() === 'closed' ? null : parseNativeResult(result.stdout);
  }
  async prepare() {
    const item = this.current();
    if (!item?.mediaId) throw new Error('Chọn PowerPoint trước khi trình chiếu.');
    const generation = this.runtime.state.generation;
    const source = this.file(item.mediaId);
    const xml = await this.runner('/usr/bin/unzip', ['-p', source, 'ppt/presentation.xml'], { timeout: 5000, maxBuffer: 1024 * 1024 });
    const info = parseDeckXml(xml.stdout);
    if (this.current()?.id !== item.id || generation !== this.runtime.state.generation) return false;
    // Every live session owns a distinct copy; the source and unrelated decks
    // are never edited, closed or saved by this service.
    const file = path.join(this.root, 'data/presentations', randomUUID() + '.pptx');
    copyFileSync(source, file);
    this.owned = { itemId: item.id, generation, file, ...info };
    return true;
  }
  failure(error: unknown) {
    const e = error as { message?: string; stderr?: string; killed?: boolean };
    const message = e.stderr || e.message || String(error);
    this.error = /ACCESSIBILITY_REQUIRED/.test(message) ? 'Cần quyền Accessibility cho ứng dụng chạy server để căn cửa sổ PowerPoint.' : /1743|not authorized/i.test(message) ? 'macOS chưa cho phép điều khiển Chrome.' : e.killed || /timed out|1712/i.test(message) ? 'Ứng dụng chưa phản hồi. Kiểm tra hộp thoại trong PowerPoint rồi bấm Mở / căn slide lại.' : message.slice(-500);
  }
  // Serialized with button commands. A transition waits for any in-flight
  // action, closes the owned slideshow, then considers the new session.
  sync() {
    if (this.busy || this.closing) return;
    const item = this.current(), generation = this.runtime.state.generation;
    const stale = this.owned && (this.owned.itemId !== item?.id || this.owned.generation !== generation);
    if (stale) {
      if (this.error) return;
      void this.action('cleanup').catch(() => {}); return;
    }
    if (!item) { this.expanded = false; this.slot = null; return; }
    const key = `${item.id}:${generation}`;
    if (!this.owned && this.attempted !== key && this.slot?.itemId === item.id && this.slot.generation === generation && Date.now() - this.slot.at < 5000) {
      this.attempted = key;
      void this.action('open').catch(() => {});
    }
  }
  async action(action: string) {
    if (this.busy) throw new Error('Chờ thao tác PowerPoint hoàn tất.');
    this.busy = true; this.error = null; this.changed();
    try {
      if (action === 'cleanup') {
        if (this.owned) await this.run('end');
        this.owned = null; this.native = null; this.expanded = false;
      } else if (action === 'capture-stop') {
        this.captureStopVersion++;
        if (this.reporter) this.reporter.capturing = false;
      } else if (action === 'expand') {
        if (!this.owned) throw new Error('Mở PowerPoint trước khi phóng slide.');
        this.expanded = !this.expanded;
        if (this.current()?.presentationMode !== 'window') return;
        this.slot = null; this.changed();
        for (let i = 0; i < 15 && !this.slot; i++) await new Promise(resolve => setTimeout(resolve, 200));
        await this.run('fit');
      } else {
        if (!this.current()) throw new Error('Phát mục thuyết trình trong playlist trước.');
        if (!this.owned && action !== 'open') throw new Error('Bấm Mở / căn slide trước.');
        if (action === 'open' && this.owned && (this.owned.itemId !== this.current()?.id || this.owned.generation !== this.runtime.state.generation)) { await this.run('end'); this.owned = null; this.native = null; }
        if (action === 'open' && !this.owned && !await this.prepare()) return;
        await this.run(action);
      }
    } catch (error) { this.failure(error); throw new Error(this.error!); }
    finally { this.busy = false; this.changed(); }
  }
  requireSession(body: { itemId?: string; generation?: number }) {
    if (!this.current() || body.itemId !== this.current()?.id || body.generation !== this.runtime.state.generation) throw new Error('Mục đang phát đã thay đổi. Tải lại trạng thái trước khi điều khiển.');
  }
  async close() {
    this.closing = true;
    for (let i = 0; i < 160 && this.busy; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!this.busy && this.owned) await this.action('cleanup').catch(() => {});
  }
  router(register: (relative: string) => unknown) {
    const router = Router();
    router.use((req, res, next) => {
      if (!['localhost', '127.0.0.1'].includes(req.hostname)) { res.sendStatus(403); return; }
      if (req.method !== 'GET' && req.get('x-presentation-key') !== this.token) { res.status(403).json({ error: 'Tải lại Controller trước khi thử lại.' }); return; }
      next();
    });
    router.get('/state', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(this.snapshot()); });
    router.post('/stage', (req, res, next) => {
      try {
        const item = this.current();
        if (!item || req.body.itemId !== item.id || req.body.generation !== this.runtime.state.generation || req.body.expanded !== this.expanded) throw new Error('Màn chiếu đang cập nhật.');
        const reporterId = req.body.playerId;
        if (typeof reporterId !== 'string' || reporterId.length > 100 || !reporterId) throw new Error('Player chưa xác định.');
        if (this.reporter && this.reporter.generation === this.runtime.state.generation && this.reporter.id !== reporterId && Date.now() - this.reporter.at < 5000) throw new Error('Một Player khác đang điều khiển khung PowerPoint.');
        const rect = validateRect(req.body.rect), viewport = validateRect(req.body.viewport);
        if (req.body.capturing !== undefined && typeof req.body.capturing !== 'boolean') throw new Error('Trạng thái capture không hợp lệ.');
        this.reporter = { id: reporterId, generation: this.runtime.state.generation, at: Date.now(), capturing: req.body.capturing === true };
        this.slot = { itemId: item.id, generation: req.body.generation, rect, viewport, expanded: this.expanded, at: Date.now() };
        this.sync(); res.json({ ok: true });
      } catch (error) { next(error); }
    });
    router.post('/cleanup', async (req, res, next) => {
      try {
        if (!this.owned || this.owned.itemId !== req.body.itemId || this.owned.generation !== req.body.generation || (this.current()?.id === this.owned.itemId && this.runtime.state.generation === this.owned.generation)) throw new Error('Chỉ đóng được bài đã kết thúc.');
        await this.action('cleanup'); this.sync(); res.json(this.snapshot());
      } catch (error) { next(error); }
    });
    router.post('/finish', (req, res, next) => { try { this.requireSession(req.body); this.runtime.step(1); res.json(this.snapshot()); } catch (error) { next(error); } });
    router.post('/action/:action', async (req, res, next) => {
      try {
        this.requireSession(req.body);
        if (!['open', 'fit', 'focus', 'next', 'previous', 'status', 'expand', 'capture-stop'].includes(req.params.action)) throw new Error('Thao tác không hợp lệ.');
        await this.action(req.params.action); res.json(this.snapshot());
      } catch (error) { next(error); }
    });
    const upload = multer({ storage: multer.diskStorage({ destination: path.join(this.root, 'data/presentations'), filename: (_req, _file, done) => done(null, randomUUID() + '.upload') }), limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0 } });
    router.post('/upload', upload.single('file'), async (req, res, next) => {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Chọn PowerPoint .pptx.' }); return; }
      let destination: string | null = null;
      try {
        if (!/\.pptx$/i.test(file.originalname)) throw new Error('Chỉ hỗ trợ .pptx tối đa 100 MB.');
        const result = await this.runner('/usr/bin/unzip', ['-p', file.path, 'ppt/presentation.xml'], { timeout: 5000, maxBuffer: 1024 * 1024 });
        parseDeckXml(result.stdout);
        const filename = path.basename(file.originalname, '.pptx').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) + '-' + randomUUID() + '.pptx';
        destination = path.join(this.root, 'media/presentations', filename);
        renameSync(file.path, destination); res.status(201).json(register('presentations/' + filename));
      } catch (error) { if (destination && existsSync(destination)) rmSync(destination); next(error); }
      finally { rmSync(file.path, { force: true }); }
    });
    return router;
  }
}
