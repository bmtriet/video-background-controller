import type { PlaylistItem } from './types.js';

export const MAX_MEDIA_RADIUS = 50;
export const DEFAULT_MEDIA_GAP = 20;
export const MAX_MEDIA_GAP = 100;
export const MIN_LOGO_SCALE = 10;
export const MAX_LOGO_SCALE = 200;

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
export function mediaRadius(item: PlaylistItem) {
  return bounded(item.mediaRadius, item.mediaRounded ? MAX_MEDIA_RADIUS : 0, 0, MAX_MEDIA_RADIUS);
}
export function mediaGap(item: PlaylistItem) {
  return bounded(item.mediaGap, DEFAULT_MEDIA_GAP, 0, MAX_MEDIA_GAP);
}
export function logoScale(item: PlaylistItem, id: string) {
  return bounded(item.logoScales?.[id], 100, MIN_LOGO_SCALE, MAX_LOGO_SCALE);
}
