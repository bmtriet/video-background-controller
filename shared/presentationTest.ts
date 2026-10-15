export interface Rect { x: number; y: number; width: number; height: number; }
export interface TestDeck { id: string; name: string; ratio: number; slides: number; }
export interface TestMedia { id: string; name: string; kind: 'image' | 'video'; url: string; }
export interface TestDisplay extends Rect { id: string; name: string; }
export interface PresentationTestConfig {
  deckId: string | null;
  speakerId: string | null;
  backgroundId: string | null;
  ratio: 'auto' | '16:9' | '4:3';
  expanded: boolean;
  guides: boolean;
  // Logical screen points, not physical Retina pixels.
  titleBar: number;
  insetX: number;
  insetY: number;
}
export interface NativePresentation { bounds: Rect; slide: number; slides: number; fullScreen: boolean; }
export interface PresentationTestSnapshot {
  token: string;
  config: PresentationTestConfig;
  decks: TestDeck[];
  media: TestMedia[];
  displays: TestDisplay[];
  platform: string;
  stage: { slot: Rect; viewport: Rect; updatedAt: number } | null;
  native: NativePresentation | null;
  error: string | null;
  busy: boolean;
}
export const DEFAULT_PRESENTATION_TEST: PresentationTestConfig = {
  deckId: null, speakerId: null, backgroundId: null, ratio: 'auto', expanded: false,
  guides: true, titleBar: 28, insetX: 0, insetY: 0,
};
export function deckRatio(config: PresentationTestConfig, deck?: TestDeck) {
  return config.ratio === '16:9' ? 16 / 9 : config.ratio === '4:3' ? 4 / 3 : deck?.ratio ?? 16 / 9;
}
// Fit the *outer* PowerPoint window in the reserved slot, accounting for its
// title bar. The slide content is never stretched or cropped.
export function presentationWindow(slot: Rect, ratio: number, titleBar: number, insetX = 0, insetY = 0): Rect {
  if (![slot.x, slot.y, slot.width, slot.height, ratio, titleBar, insetX, insetY].every(Number.isFinite)
    || slot.width <= 0 || slot.height <= titleBar || ratio <= 0 || titleBar < 0) throw new Error('Vùng trình chiếu không hợp lệ.');
  const contentHeight = Math.min(slot.height - titleBar, slot.width / ratio);
  const width = contentHeight * ratio;
  const height = contentHeight + titleBar;
  return { x: Math.round(slot.x + (slot.width - width) / 2 + insetX), y: Math.round(slot.y + (slot.height - height) / 2 + insetY), width: Math.round(width), height: Math.round(height) };
}
