import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, existsSync, renameSync, writeFileSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const fps = Number(option('--fps', '30'));
const width = Number(option('--width', '1920'));
const height = Number(option('--height', '1080'));
const limit = Number(option('--duration', '0'));
const renderPort = Number(option('--render-port', '4178'));
const skip = Number(option('--skip', '0'));
if (!Number.isInteger(skip) || skip < 0) throw new Error('Invalid --skip');
if (![fps, width, height].every(n => Number.isInteger(n) && n > 0) || width % 2 || height % 2 || !Number.isFinite(limit) || limit < 0) throw new Error('Invalid fps, size or duration');
const output = path.resolve(option('--out', `output/playlist-mp4-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const chrome = option('--chrome', process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const response = await fetch(`${option('--server', 'http://127.0.0.1:3000')}/api/state`);
if (!response.ok) throw new Error(`Cannot read playlist: ${response.status}`);
const snapshot = await response.json();
const items = snapshot.playlist.slice(skip).filter(item => !args.includes('--enabled-only') || item.enabled).filter(item => !option('--only', '') || item.id === option('--only') || item.name === option('--only'));
if (!items.length) throw new Error('No matching playlist items');
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'playlist-snapshot.json'), JSON.stringify(snapshot, null, 2));
if (items.some(item => item.itemType === 'PRESENTATION')) throw new Error('PowerPoint là mục trình chiếu trực tiếp, không thể xuất thành video playlist. Chọn phạm vi không chứa thuyết trình.');
const mediaRoot = realpathSync(path.join(root, 'media'));
const probes = new Map();
function source(id) {
  const media = snapshot.media.find(entry => entry.id === id && entry.exists);
  if (!media) return null;
  const file = realpathSync(path.join(mediaRoot, media.relativePath));
  if (!file.startsWith(mediaRoot + path.sep)) throw new Error('Media outside media directory');
  if (!probes.has(file)) probes.set(file, JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' })));
  return { ...media, file, probe: probes.get(file) };
}
function tempo(rate) {
  const filters = [];
  while (rate > 2) { filters.push('atempo=2'); rate /= 2; }
  while (rate < .5) { filters.push('atempo=0.5'); rate *= 2; }
  return [...filters, `atempo=${rate}`].join(',');
}
const names = new Set();
const reportFile = path.join(output, 'export-report.json');
const selectedIds = new Set(items.map(item => item.id));
const results = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')).filter(result => !selectedIds.has(result.id)) : [];
let browser, vite, encoder;
let cancelled = false;
function stopEncoder() {
  if (!encoder) return;
  encoder.stdin.destroy();
  encoder.kill('SIGKILL');
  encoder = null;
}
async function evaluate(page, fn, ...params) {
  let timer;
  try {
    return await Promise.race([page.evaluate(fn, ...params), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser render timed out after 60s')), 60000); })]);
  } finally { clearTimeout(timer); }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cancelled = true; stopEncoder(); });
try {
  vite = await createServer({ configFile: path.join(root, 'frontend/vite.config.ts'), server: { port: renderPort, strictPort: true, host: '127.0.0.1', hmr: false } });
  await vite.listen();
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${renderPort}/export.html`);
  await page.waitForFunction('typeof window.loadExport === "function"');
  for (const [index, item] of items.entries()) {
    if (cancelled) break;
    let name = item.name.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 160) || 'video';
    const base = name;
    let duplicate = 2;
    while (names.has(name.toLowerCase())) name = `${base}-${duplicate++}`;
    names.add(name.toLowerCase());
    const file = path.join(output, `${name}.mp4`);
    const temporary = path.join(output, `${name}.partial.mp4`);
    try {
      if (existsSync(file)) throw new Error(`File already exists: ${file}. Choose a new --out folder.`);
      const main = source(item.mediaId);
      const imageColumns = item.itemType === 'ADVERTISEMENT' && /^IMAGES_/.test(item.layout);
      const mainDuration = main?.mediaType === 'video' && !imageColumns ? Number(main.probe.format.duration) / item.playbackRate : null;
      let duration = item.durationSeconds;
      if (!(item.itemType === 'FULL_VIDEO' && item.loop) && mainDuration && snapshot.settings.advanceMode !== 'CONFIGURED_DURATION') duration = snapshot.settings.advanceMode === 'VIDEO_END' ? mainDuration : Math.min(duration, mainDuration);
      if (limit) duration = Math.min(duration, limit);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid item duration');
      const frames = Math.ceil(duration * fps);
      duration = frames / fps;
      console.log(`[${index + 1}/${items.length}] ${name}: ${duration.toFixed(2)}s → ${file}`);
      await evaluate(page, (data, id) => window.loadExport(data, id), snapshot, item.id);
      const command = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0'];
      const audio = [];
      const candidates = [];
      if (!imageColumns) {
        candidates.push({ id: item.mediaId, rate: item.playbackRate, muted: item.muted, loop: item.itemType === 'FULL_VIDEO' && item.loop });
        if (item.layout === 'DUAL_MEDIA_LOGO' && item.itemType === 'ADVERTISEMENT') candidates.push({ id: item.secondaryMediaId, rate: item.playbackRate, muted: item.muted, loop: false });
      }
      if (item.itemType === 'ADVERTISEMENT') candidates.push({ id: item.backgroundMediaId, rate: 1, muted: item.backgroundMuted ?? true, loop: item.backgroundLoop ?? true });
      for (const candidate of candidates) {
        if (!candidate.id || candidate.muted || !item.volume || !snapshot.settings.globalVolume) continue;
        const media = source(candidate.id);
        if (media?.mediaType !== 'video' || !media.probe.streams.some(stream => stream.codec_type === 'audio')) continue;
        if (candidate.loop) command.push('-stream_loop', '-1');
        command.push('-i', media.file);
        const tail = Math.min(duration, Number(media.probe.format.duration) / candidate.rate);
        const fade = Math.min(.5, tail / 2);
        const label = `a${audio.length}`;
        audio.push({ label, filter: `[${audio.length + 1}:a]${tempo(candidate.rate)},volume=${item.volume * snapshot.settings.globalVolume / 10000},afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, (candidate.loop ? duration : tail) - fade)}:d=${fade},apad,atrim=duration=${duration}[${label}]` });
      }
      if (audio.length) {
        command.push('-filter_complex', `${audio.map(track => track.filter).join(';')};${audio.map(track => `[${track.label}]`).join('')}amix=inputs=${audio.length}:normalize=0[audio]`, '-map', '0:v', '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k');
      } else command.push('-an');
      command.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', String(duration), '-movflags', '+faststart', temporary);
      encoder = spawn('ffmpeg', command, { stdio: ['pipe', 'ignore', 'pipe'] });
      let errorText = '';
      encoder.stderr.on('data', data => { errorText = (errorText + data).slice(-8000); });
      encoder.stdin.on('error', () => {});
      const completed = new Promise((resolve, reject) => {
        encoder.on('error', reject);
        encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${errorText}`)));
      });
      completed.catch(() => {});
      for (let frame = 0; frame < frames; frame++) {
        if (cancelled) throw new Error('Export cancelled');
        await evaluate(page, time => window.exportFrame(time), frame / fps);
        const bytes = await page.screenshot({ type: 'jpeg', quality: 95 });
        if (encoder.exitCode !== null || encoder.stdin.destroyed) throw new Error(errorText || 'Encoder stopped');
        if (!encoder.stdin.write(bytes)) await once(encoder.stdin, 'drain');
        if (frame && frame % (fps * 5) === 0) console.log(`  ${name}: ${Math.round(frame / frames * 100)}%`);
      }
      encoder.stdin.end();
      await completed;
      encoder = null;
      const check = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temporary], { encoding: 'utf8' }));
      const video = check.streams.find(stream => stream.codec_type === 'video');
      if (!video || video.codec_name !== 'h264' || video.width !== width || video.height !== height || Math.abs(Number(check.format.duration) - duration) > .2) throw new Error('Output validation failed');
      renameSync(temporary, file);
      results.push({ id: item.id, name: item.name, file, duration, audio: audio.length > 0, status: 'ok' });
      console.log(`  Saved ${name}.mp4`);
    } catch (error) {
      stopEncoder();
      results.push({ id: item.id, name: item.name, status: 'failed', error: String(error) });
      console.error(`  FAILED ${name}: ${error}`);
    }
    writeFileSync(path.join(output, 'export-report.json'), JSON.stringify(results, null, 2));
  }
} finally {
  stopEncoder();
  await browser?.close();
  await vite?.close();
}
console.log(`Exported ${results.filter(result => selectedIds.has(result.id) && result.status === 'ok').length}/${items.length}: ${output}`);
if (cancelled || results.some(result => selectedIds.has(result.id) && result.status !== 'ok')) process.exitCode = 1;
