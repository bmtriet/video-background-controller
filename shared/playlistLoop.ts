import type { PlaylistItem, Settings } from './types.js';

export function playlistLoopRange(items: PlaylistItem[], settings: Pick<Settings, 'loopStartItemId' | 'loopEndItemId'>): PlaylistItem[] {
  const start = settings.loopStartItemId == null ? 0 : items.findIndex(item => item.id === settings.loopStartItemId);
  const end = settings.loopEndItemId == null ? items.length - 1 : items.findIndex(item => item.id === settings.loopEndItemId);
  // Invalid/stale bounds must never silently expand to the full playlist.
  return start < 0 || end < start ? [] : items.slice(start, end + 1);
}

export function playbackItems(items: PlaylistItem[], settings: Settings) {
  return settings.loopPlaylist ? playlistLoopRange(items, settings) : items;
}
