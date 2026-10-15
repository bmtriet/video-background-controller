import type { Media, PlaylistItem } from '../../shared/types';
import { mediaUrl } from './services';

// Match the 1920×1080 stage geometry; leave the Reading View area unobstructed.
export async function createPresentationLayout(item: PlaylistItem, media: Media[], width = 1920, height = 1080) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được ảnh bố cục.');
  const gradient = ctx.createRadialGradient(1920, 1080, 0, 1920, 1080, 2203);
  gradient.addColorStop(0, '#175080'); gradient.addColorStop(.75, '#071b36');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1080);
  const find = (id: string | null | undefined) => media.find(m => m.id === id && m.exists);
  const draw = (source: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number, cover = false) => {
    const scale = cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(source, x + (w - sw * scale) / 2, y + (h - sh * scale) / 2, sw * scale, sh * scale); ctx.restore();
  };
  const background = find(item.backgroundMediaId);
  if (background) {
    const video = document.createElement('video'); video.muted = true; video.preload = 'auto';
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => done(new Error('Không đọc được khung hình video nền.')), 15000);
        const done = (error?: Error) => { clearTimeout(timer); video.onloadeddata = null; video.onerror = null; error ? reject(error) : resolve(); };
        video.onloadeddata = () => done(); video.onerror = () => done(new Error('Không đọc được video nền.'));
        video.src = mediaUrl(background); video.load();
      });
      draw(video, video.videoWidth, video.videoHeight, 0, 0, 1920, 1080, true);
    } finally { video.removeAttribute('src'); video.load(); }
  }
  const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Không đọc được ảnh bố cục.')); image.src = url;
  });
  const header = await load('/branding/conference-header-spaced.png');
  const hw = 960, hh = 182.02928;
  ctx.save(); ctx.beginPath(); ctx.rect(20, 20, hw, hh); ctx.clip();
  const headerScale = Math.min(hw / 2115, hh / 413);
  ctx.drawImage(header, 29, 147, 2115, 413, 20 + (hw - 2115 * headerScale) / 2, 20 + (hh - 413 * headerScale) / 2, 2115 * headerScale, 413 * headerScale); ctx.restore();
  const speaker = find(item.speakerMediaId);
  if (speaker && item.speakerEnabled !== false) { const image = await load(mediaUrl(speaker)); draw(image, image.naturalWidth, image.naturalHeight, (item.speakerX ?? 76.04) * 19.2, (item.speakerY ?? 20.56) * 10.8, (item.speakerWidth ?? 22.92) * 19.2, (item.speakerHeight ?? 77.59) * 10.8); }
  const textWidth = (item.speakerTextWidth ?? 22.92) * 19.2;
  const textX = (item.speakerTextX ?? 76.04) * 19.2 + textWidth / 2;
  let textY = (item.speakerTextY ?? 85) * 10.8;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  for (const [text, size, bold] of [[item.speakerName, item.speakerNameSize ?? 28, true], [item.speakerTitle, item.speakerTitleSize ?? 22, false]] as const) {
    if (!text) continue;
    ctx.font = `${bold ? 'bold ' : ''}${size}px Arial`;
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const character of paragraph) {
        if (line && ctx.measureText(line + character).width > textWidth) { ctx.fillText(line, textX, textY); textY += size * 1.3; line = ''; }
        line += character;
      }
      ctx.fillText(line, textX, textY); textY += size * 1.3;
    }
    textY += 7.68;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Không xuất được PNG.')), 'image/png'));
  if (width === 1920 && height === 1080) return blob;
  const output = document.createElement('canvas'); output.width = width; output.height = height;
  const context = output.getContext('2d'); if (!context) throw new Error('Không tạo được ảnh màn hình.');
  context.fillStyle = '#071b36'; context.fillRect(0, 0, width, height);
  const scale = Math.min(width / 1920, height / 1080);
  context.drawImage(canvas, (width - 1920 * scale) / 2, (height - 1080 * scale) / 2, 1920 * scale, 1080 * scale);
  return new Promise<Blob>((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error('Không xuất được PNG.')), 'image/png'));
}
export async function downloadPresentationLayout(item: PlaylistItem, media: Media[]) {
  const blob = await createPresentationLayout(item, media);
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `layout-${item.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100) || 'thuyet-trinh'}-1920x1080.png`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
