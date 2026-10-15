import type { Layout, PlaylistItem } from './types.js';

export const LAYOUT_LABELS: Record<Layout, string> = {
  MEDIA_LOGO: 'Video | Logos',
  DUAL_MEDIA_LOGO: '2 media | Logos',
  IMAGE_LOGO: 'Ảnh ⅔ | Logos ⅓',
  IMAGES_2_LOGO: '2 ảnh ⅔ | Logos ⅓',
  IMAGES_3_LOGO: '3 ảnh ⅔ | Logos ⅓',
  IMAGES_1: 'Ảnh · 1 cột',
  IMAGES_2: 'Ảnh · 2 cột',
  IMAGES_3: 'Ảnh · 3 cột',
};
export const AD_LAYOUT_CHOICES: Layout[] = ['MEDIA_LOGO', 'IMAGE_LOGO', 'IMAGES_2_LOGO', 'IMAGES_3_LOGO'];

export function editableAdLayout(layout: Layout): Layout {
  return layout === 'IMAGES_1' ? 'IMAGE_LOGO' : layout === 'IMAGES_2' ? 'IMAGES_2_LOGO' : layout === 'IMAGES_3' ? 'IMAGES_3_LOGO' : layout;
}
export function imageColumnCount(layout: Layout): number {
  return layout === 'IMAGES_1' || layout === 'IMAGE_LOGO' ? 1 : layout === 'IMAGES_2' || layout === 'IMAGES_2_LOGO' ? 2 : layout === 'IMAGES_3' || layout === 'IMAGES_3_LOGO' ? 3 : 0;
}
export function hasLogoColumn(layout: Layout): boolean {
  return layout === 'MEDIA_LOGO' || layout === 'DUAL_MEDIA_LOGO' || layout === 'IMAGE_LOGO' || layout === 'IMAGES_2_LOGO' || layout === 'IMAGES_3_LOGO';
}
export function imageSlots(item: PlaylistItem): (string | null)[] {
  return Array.from({ length: imageColumnCount(item.layout) }, (_, index) => item.imageMediaIds?.[index] ?? null);
}
export function logoSlots(item: PlaylistItem): string[] {
  return item.logoMediaIds ?? (item.logoMediaId ? [item.logoMediaId] : []);
}
export function requiredMediaIds(item: PlaylistItem): (string | null)[] {
  if (item.itemType === 'PRESENTATION') return [...(item.slideSetupOnly ? [] : [item.mediaId]), ...(item.speakerEnabled === false || !item.speakerMediaId ? [] : [item.speakerMediaId]), ...(item.backgroundMediaId ? [item.backgroundMediaId] : [])];
  if (item.itemType === 'FULL_VIDEO') return [item.mediaId];
  if (imageColumnCount(item.layout)) {
    const logos = logoSlots(item);
    return [...imageSlots(item), ...(hasLogoColumn(item.layout) ? logos.length ? logos : [null] : [])];
  }
  const logos = logoSlots(item);
  return [item.mediaId, ...(item.layout === 'DUAL_MEDIA_LOGO' ? [item.secondaryMediaId] : []), ...(logos.length ? logos : [null])];
}
