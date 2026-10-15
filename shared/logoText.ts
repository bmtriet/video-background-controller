import type { LogoText, LogoTextStyle } from './types.js';

export const MIN_LOGO_FONT_SIZE = 12;
export const MAX_LOGO_FONT_SIZE = 120;
export const MAX_LOGO_STROKE_WIDTH = 6;
export const MAX_COMPANY_NAME_LENGTH = 200;
export const DEFAULT_LOGO_TEXT_STYLE: Readonly<LogoTextStyle> = { color: '#ffffff', bold: true, fontSize: 32, strokeColor: '#000000', strokeWidth: 2 };

export function logoTextStyle(value: LogoTextStyle): LogoTextStyle {
  return { color: value.color, bold: value.bold, fontSize: value.fontSize, strokeColor: value.strokeColor, strokeWidth: value.strokeWidth };
}

export function validateLogoTextStyle(value: unknown): asserts value is LogoTextStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid logo text style');
  const style = value as LogoTextStyle;
  if (typeof style.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(style.color) || typeof style.strokeColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(style.strokeColor)) throw new Error('Logo text colors must be hex colors');
  if (typeof style.bold !== 'boolean') throw new Error('Invalid logo text bold setting');
  if (typeof style.fontSize !== 'number' || !Number.isFinite(style.fontSize) || style.fontSize < MIN_LOGO_FONT_SIZE || style.fontSize > MAX_LOGO_FONT_SIZE) throw new Error(`Logo font size must be between ${MIN_LOGO_FONT_SIZE} and ${MAX_LOGO_FONT_SIZE}px`);
  if (typeof style.strokeWidth !== 'number' || !Number.isFinite(style.strokeWidth) || style.strokeWidth < 0 || style.strokeWidth > MAX_LOGO_STROKE_WIDTH) throw new Error(`Logo text stroke must be between 0 and ${MAX_LOGO_STROKE_WIDTH}px`);
}

export function newLogoText(style: LogoTextStyle = DEFAULT_LOGO_TEXT_STYLE): LogoText {
  return { ...logoTextStyle(style), enabled: false, text: '' };
}

export function retainLogoTexts(texts: Record<string, LogoText> | undefined, ids: string[]) {
  return Object.fromEntries(ids.flatMap(id => texts?.[id] ? [[id, texts[id]]] : []));
}

// Sizes are in pixels on a 1080p output. Container units preserve the same
// composition proportions in Controller previews and other display sizes.
export function logoTextCss(style: LogoTextStyle) {
  return { color: style.color, fontWeight: style.bold ? 700 : 400, fontSize: `${style.fontSize / 10.8}cqh`, WebkitTextStroke: `${style.strokeWidth / 10.8}cqh ${style.strokeColor}`, paintOrder: 'stroke fill' as const };
}

export function captionLogoGeometry(width: number, height: number, sourceWidth: number, sourceHeight: number, captionHeight: number, gap: number, scale: number) {
  const availableHeight = Math.max(0, height - captionHeight - gap);
  if (![width, availableHeight, sourceWidth, sourceHeight, scale].every(value => Number.isFinite(value) && value > 0)) return null;
  const fit = Math.min(width / sourceWidth, availableHeight / sourceHeight) * scale / 100;
  const imageWidth = sourceWidth * fit, imageHeight = sourceHeight * fit;
  return { imageWidth, imageHeight, width: Math.min(width, imageWidth), height: Math.min(availableHeight, imageHeight) };
}
