import type { Media } from './types.js';

export function mediaSourceUrl(file: Media, byId: boolean) {
  // Keep category names (especially /ads/) out of browser resource URLs.
  // They are storage organization, not a signal to advertising filters.
  return byId ? `/content/${encodeURIComponent(file.id)}` : '/media/' + file.relativePath.split('/').map(encodeURIComponent).join('/');
}
