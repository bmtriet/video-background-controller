import type { RuntimeState } from '../../shared/types';

const END_SCALE = 1.04;

export function imagePanFrame(width: number, height: number, sourceWidth: number, sourceHeight: number, progress: number) {
  if (![width, height, sourceWidth, sourceHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const fitted = Math.max(width / sourceWidth, height / sourceHeight);
  const imageWidth = sourceWidth * fitted;
  const imageHeight = sourceHeight * fitted;
  const position = Math.max(0, Math.min(1, progress));
  const scale = 1 + (END_SCALE - 1) * position;
  // Center horizontally while revealing the top first and the bottom last.
  return { width: imageWidth, height: imageHeight, scale, x: (width - imageWidth * scale) / 2, y: -(imageHeight * scale - height) * position };
}

export function imageScrollProgress(elapsed: number, duration: number, repeat = false) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  return repeat ? time % duration / duration : Math.min(1, time / duration);
}

export function imagePlaybackElapsed(state: RuntimeState | undefined, receivedAt: number, now: number) {
  return (state?.elapsed ?? 0) + (state?.status === 'PLAYING' ? Math.max(0, now - receivedAt) / 1000 : 0);
}
