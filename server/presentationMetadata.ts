import type { NativePresentation, Rect } from '../shared/presentationTest.js';
export function parseDeckXml(xml: string): { ratio: number; slides: number } {
  const size = xml.match(/<(?:\w+:)?sldSz\b([^>]+)>/);
  const cx = Number(size?.[1].match(/\bcx=["'](\d+)["']/)?.[1]);
  const cy = Number(size?.[1].match(/\bcy=["'](\d+)["']/)?.[1]);
  const slides = (xml.match(/<(?:\w+:)?sldId\b/g) ?? []).length;
  if (!cx || !cy || cx / cy < .2 || cx / cy > 5 || !slides) throw new Error('Không đọc được kích thước hoặc trang trong PowerPoint. Chọn file .pptx hợp lệ.');
  return { ratio: cx / cy, slides };
}
export function validateRect(value: unknown): Rect {
  const r = value as Rect;
  if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) || Math.abs(r.x) > 100000 || Math.abs(r.y) > 100000 || r.width < 100 || r.height < 100 || r.width > 20000 || r.height > 20000) throw new Error('Kích thước màn chiếu không hợp lệ.');
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
export function parseNativeResult(output: string): NativePresentation {
  const values = output.trim().split('|');
  const [x, y, right, bottom, slide, slides] = values.map(Number);
  if (values.length !== 7 || ![x, y, right, bottom, slide, slides].every(Number.isFinite) || right <= x || bottom <= y || slide < 1 || slides < slide) throw new Error('PowerPoint trả về trạng thái cửa sổ không hợp lệ.');
  return { bounds: { x, y, width: right - x, height: bottom - y }, slide, slides, fullScreen: values[6] === 'true' };
}
