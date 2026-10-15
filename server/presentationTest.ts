import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_PRESENTATION_TEST, deckRatio, presentationWindow, type NativePresentation, type PresentationTestConfig, type PresentationTestSnapshot, type Rect, type TestDeck, type TestDisplay, type TestMedia } from '../shared/presentationTest.js';

const execute = promisify(execFile);
import { parseDeckXml, parseNativeResult, validateRect } from './presentationMetadata.js';
export { parseDeckXml, parseNativeResult, validateRect } from './presentationMetadata.js';
function nativeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ACCESSIBILITY_REQUIRED/i.test(message)) return 'macOS chưa cấp quyền Accessibility cho ứng dụng chạy bản thử. Cần quyền này để căn và kích hoạt cửa sổ Reading View; không cần Full Disk Access.';
  if (/1743|not authorized|not permitted|authorization/i.test(message)) return 'macOS chưa cho phép điều khiển ứng dụng. Cấp quyền Automation cho tiến trình chạy bản thử → PowerPoint/Google Chrome trong System Settings → Privacy & Security.';
  if ((error as { killed?: boolean })?.killed || /timed out|1712|ETIMEDOUT/i.test(message)) return 'PowerPoint chưa phản hồi. Kiểm tra hộp thoại đang mở trong PowerPoint rồi thử lại.';
  return message.split('\n').slice(-2).join(' ').slice(0, 500);
}
export function createPresentationTest(root = process.cwd(), port = 3001, nativeRunner = execute) {
  const app = express();
  const directory = path.join(root, 'data/presentation-test');
  const uploads = path.join(directory, 'files');
  mkdirSync(uploads, { recursive: true });
  const configFile = path.join(directory, 'config.json');
  let config: PresentationTestConfig = { ...DEFAULT_PRESENTATION_TEST };
  // Only persisted presentation setup is restored, never an active native show.
  try { config = { ...config, ...JSON.parse(readFileSync(configFile, 'utf8')), expanded: false }; } catch {}
  let stage: PresentationTestSnapshot['stage'] = null;
  let native: NativePresentation | null = null;
  let error: string | null = null;
  let busy = false;
  let displays: TestDisplay[] = [];
  const token = randomUUID();
  const deckFiles = new Map<string, { deck: TestDeck; file: string }>();
  const uploadedMedia: TestMedia[] = [];
  for (const file of readdirSync(uploads).filter(name => name.endsWith('.json'))) {
    try {
      const record = JSON.parse(readFileSync(path.join(uploads, file), 'utf8'));
      const local = path.join(uploads, path.basename(record.file));
      if (!existsSync(local)) continue;
      if (record.deck) deckFiles.set(record.deck.id, { deck: record.deck, file: local });
      if (record.media) uploadedMedia.push(record.media);
    } catch {}
  }
  const localMedia: TestMedia[] = [];
  function scanMedia(relative = '') {
    const current = path.join(root, 'media', relative);
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) scanMedia(next);
      else if (entry.isFile() && /\.(png|jpg|jpeg|webp|mp4|webm|mov)$/i.test(entry.name)) {
        localMedia.push({ id: `local:${next}`, name: next, kind: /\.(mp4|webm|mov)$/i.test(entry.name) ? 'video' : 'image', url: '/media/' + next.split('/').map(encodeURIComponent).join('/') });
      }
    }
  }
  scanMedia();
  const allMedia = () => [...localMedia, ...uploadedMedia];
  if (!config.backgroundId) config.backgroundId = localMedia.find(file => file.kind === 'video' && /background|bg_/i.test(file.name))?.id ?? null;
  const snapshot = (): PresentationTestSnapshot => ({ token, config, decks: [...deckFiles.values()].map(record => record.deck), media: allMedia(), displays, platform: process.platform, stage, native, error, busy });
  function save() { writeFileSync(configFile, JSON.stringify(config, null, 2)); }
  const stageURL = `http://localhost:${port}/presentation-stage`;
  const script = path.join(root, 'scripts/presentation-mac.applescript');
  const runNative = async (args: string[]) => {
    if (process.platform !== 'darwin') throw new Error('Bản thử điều khiển cửa sổ này dành cho macOS.');
    const isStage = args[0] === 'stage';
    const program = isStage ? '/usr/bin/osascript' : path.join(root, '.local/presentation-window');
    const result = await nativeRunner(program, isStage ? [script, ...args] : args, { timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 8192 });
    return result.stdout;
  };
  app.use((req, res, next) => {
    const host = req.hostname;
    const origin = req.get('origin');
    if (!['localhost', '127.0.0.1'].includes(host) || origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) { res.status(403).json({ error: 'Local requests only' }); return; }
    if (req.method !== 'GET' && req.get('x-presentation-test-key') !== token) { res.status(403).json({ error: 'Reload the presentation test before retrying.' }); return; }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/presentation-test/state', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(snapshot()); });
  app.get('/api/presentation-test/displays', async (_req, res, next) => {
    try {
      if (process.platform === 'darwin') {
        const result = await nativeRunner(path.join(root, '.local/presentation-displays'), [], { timeout: 5000 });
        displays = JSON.parse(result.stdout);
      }
      res.json(snapshot());
    } catch (error) { next(error); }
  });
  app.put('/api/presentation-test/config', (req, res, next) => {
    try {
      if (busy) throw new Error('Chờ thao tác PowerPoint hiện tại hoàn tất.');
      const update = req.body;
      if (!update || typeof update !== 'object') throw new Error('Cấu hình không hợp lệ.');
      if (update.deckId !== undefined && update.deckId !== null && !deckFiles.has(update.deckId)) throw new Error('Chọn bài PowerPoint đã tải vào bản thử.');
      for (const [key, kind] of [['speakerId', 'image'], ['backgroundId', 'video']] as const) {
        if (update[key] !== undefined && update[key] !== null && !allMedia().some(file => file.id === update[key] && file.kind === kind)) throw new Error('File ảnh hoặc video nền không hợp lệ.');
      }
      if (update.ratio !== undefined && !['auto', '16:9', '4:3'].includes(update.ratio)) throw new Error('Tỉ lệ slide không hợp lệ.');
      for (const key of ['expanded', 'guides']) if (update[key] !== undefined && typeof update[key] !== 'boolean') throw new Error('Cấu hình không hợp lệ.');
      for (const [key, min, max] of [['titleBar', 0, 100], ['insetX', -200, 200], ['insetY', -200, 200]] as const) if (update[key] !== undefined && (!Number.isFinite(update[key]) || update[key] < min || update[key] > max)) throw new Error('Giá trị căn chỉnh ngoài phạm vi.');
      if (update.deckId !== undefined && update.deckId !== config.deckId && native) throw new Error('Kết thúc bài thử hiện tại trước khi chọn bài khác.');
      const nextConfig = { ...config };
      for (const key of Object.keys(DEFAULT_PRESENTATION_TEST) as (keyof PresentationTestConfig)[]) if (update[key] !== undefined) Object.assign(nextConfig, { [key]: update[key] });
      config = nextConfig; stage = null; error = null; save(); res.json(snapshot());
    } catch (error) { next(error); }
  });
  app.post('/api/presentation-test/stage', (req, res, next) => {
    try {
      if (req.body.expanded !== config.expanded) throw new Error('Chờ màn chiếu cập nhật bố cục.');
      stage = { slot: validateRect(req.body.slot), viewport: validateRect(req.body.viewport), updatedAt: Date.now() }; res.json({ ok: true });
    } catch (error) { next(error); }
  });
  const upload = multer({ storage: multer.diskStorage({ destination: uploads, filename: (_req, _file, done) => done(null, `${randomUUID()}.upload`) }), limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0 } });
  app.post('/api/presentation-test/upload/:kind', (req, res, next) => {
    if (!['deck', 'speaker'].includes(req.params.kind)) { res.status(400).json({ error: 'Loại file không hợp lệ.' }); return; }
    upload.single('file')(req, res, async uploadError => {
      if (uploadError) { next(uploadError); return; }
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Chọn file để tải.' }); return; }
      let destination: string | null = null;
      try {
        const id = randomUUID();
        const kind = req.params.kind;
        if (kind === 'deck') {
          if (!/\.pptx$/i.test(file.originalname)) throw new Error('Chỉ nhận PowerPoint .pptx trong bản thử.');
          const result = await nativeRunner('/usr/bin/unzip', ['-p', file.path, 'ppt/presentation.xml'], { timeout: 5000, maxBuffer: 1024 * 1024 });
          const deck: TestDeck = { id, name: file.originalname, ...parseDeckXml(result.stdout) };
          destination = path.join(uploads, `${id}.pptx`);
          renameSync(file.path, destination);
          writeFileSync(path.join(uploads, `${id}.json`), JSON.stringify({ file: path.basename(destination), deck }));
          deckFiles.set(id, { deck, file: destination });
        } else {
          if (file.size > 20 * 1024 * 1024 || !/\.png$/i.test(file.originalname) || !readFileSync(file.path).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Chọn ảnh PNG tối đa 20 MB.');
          destination = path.join(uploads, `${id}.png`);
          renameSync(file.path, destination);
          const media: TestMedia = { id, name: file.originalname, kind: 'image', url: `/presentation-files/${id}.png` };
          writeFileSync(path.join(uploads, `${id}.json`), JSON.stringify({ file: path.basename(destination), media }));
          uploadedMedia.push(media);
        }
        res.status(201).json({ id, ...snapshot() });
      } catch (uploadError) { if (destination) rmSync(destination, { force: true }); next(uploadError); }
      finally { rmSync(file.path, { force: true }); }
    });
  });
  app.post('/api/presentation-test/native/:action', async (req, res, next) => {
    const action = req.params.action;
    if (!['stage', 'open', 'fit', 'focus', 'next', 'previous', 'capture-next', 'capture-previous', 'status', 'end'].includes(action)) { res.status(400).json({ error: 'Thao tác không hợp lệ.' }); return; }
    if (busy) { res.status(409).json({ error: 'Chờ thao tác PowerPoint hiện tại hoàn tất.' }); return; }
    busy = true;
    try {
      let args: string[];
      if (action === 'stage') {
        const display = displays.find(display => display.id === req.body.displayId);
        if (!display) throw new Error('Chọn màn hình rồi bấm Đọc màn hình nếu chưa thấy danh sách.');
        args = ['stage', stageURL, ...[display.x, display.y, display.x + display.width, display.y + display.height].map(value => String(Math.round(value)))];
      } else {
        const record = deckFiles.get(config.deckId ?? '');
        if (!record) throw new Error('Tải và chọn file PowerPoint trước.');
        args = [action, record.file, path.basename(record.file), String(record.deck.slides)];
        if (['open', 'fit'].includes(action)) {
          if (!stage || Date.now() - stage.updatedAt > 5000) throw new Error('Mở màn chiếu thử trước và chờ nó kết nối lại.');
          const bounds = presentationWindow(stage.slot, deckRatio(config, record.deck), config.titleBar, config.insetX, config.insetY);
          args.push(...[bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height].map(String));
        }
      }
      const output = await runNative(args);
      if (action !== 'stage') native = action === 'end' || output.trim() === 'closed' ? null : parseNativeResult(output);
      error = null; busy = false; res.json(snapshot());
    } catch (nativeFailure) { writeFileSync(path.join(directory, 'last-native-error.txt'), String((nativeFailure as { stderr?: string }).stderr || nativeFailure)); busy = false; error = nativeError(nativeFailure); next(new Error(error)); }
  });
  app.use('/presentation-files', express.static(uploads, { index: false, dotfiles: 'deny', setHeaders: res => res.setHeader('X-Content-Type-Options', 'nosniff') }));
  const mediaRoot = realpathSync(path.join(root, 'media'));
  app.use('/media', (req, res, next) => {
    try {
      const file = realpathSync(path.resolve(mediaRoot, '.' + decodeURIComponent(req.path)));
      if (!file.startsWith(mediaRoot + path.sep)) { res.sendStatus(403); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff'); next();
    } catch { res.sendStatus(404); }
  }, express.static(mediaRoot, { index: false, dotfiles: 'deny' }));
  app.use(express.static(path.join(root, 'dist/frontend')));
  for (const route of ['/presentation-test', '/presentation-stage', '/presentation-capture']) app.get(route, (_req, res) => res.sendFile(path.join(root, 'dist/frontend/index.html')));
  app.use((failure: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(failure instanceof multer.MulterError && failure.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: failure.message || 'Không hoàn tất được thao tác.' });
  });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const port = Number(process.env.PRESENTATION_TEST_PORT || 3001);
  if (process.platform === 'darwin') {
    mkdirSync(path.join(root, '.local'), { recursive: true });
    for (const helper of ['presentation-displays', 'presentation-window']) {
      await execute('/usr/bin/xcrun', ['swiftc', path.join(root, `scripts/${helper}.swift`), '-o', path.join(root, `.local/${helper}`)], { timeout: 60000 });
    }
  }
  createPresentationTest(root, port).listen(port, '127.0.0.1', () => console.log(`Presentation test: http://localhost:${port}/presentation-test\nIndependent of the event playlist.`));
}
