export const TIERS = { diamond: 60, gold: 45, silver: 30, bronze: 30, 'co-sponsor': 15 } as const;
export type Tier = keyof typeof TIERS;
export type Layout = 'MEDIA_LOGO' | 'DUAL_MEDIA_LOGO' | 'IMAGE_LOGO' | 'IMAGES_2_LOGO' | 'IMAGES_3_LOGO' | 'IMAGES_1' | 'IMAGES_2' | 'IMAGES_3';
export interface Media { id: string; filename: string; relativePath: string; mediaType: 'video' | 'image' | 'presentation'; category: string; exists: boolean; }
export interface LogoTextStyle { color: string; bold: boolean; fontSize: number; strokeColor: string; strokeWidth: number; }
export interface LogoText extends LogoTextStyle { enabled: boolean; text: string; }
export interface PlaylistItem {
  id: string; eventId: string; itemType: 'FULL_VIDEO' | 'ADVERTISEMENT' | 'PRESENTATION'; name: string;
  sortOrder: number; enabled: boolean; durationSeconds: number; playbackRate: number;
  videoStartSeconds?: number;
  videoEndSeconds?: number | null;
  playUntilVideoEnd?: boolean;
  mediaId: string | null; secondaryMediaId: string | null; logoMediaId: string | null;
  speakerMediaId?: string | null;
  slideSetupOnly?: boolean;
  slideNumber?: number;
  speakerEnabled?: boolean;
  speakerX?: number;
  speakerY?: number;
  speakerWidth?: number;
  speakerHeight?: number;
  speakerName?: string;
  speakerTitle?: string;
  speakerTextX?: number;
  speakerTextY?: number;
  speakerTextWidth?: number;
  speakerNameSize?: number;
  speakerTitleSize?: number;
  presentationMode?: 'capture' | 'window';
  presentationRatio?: 'auto' | '16:9' | '4:3';
  presentationTitleBar?: number;
  presentationInsetX?: number;
  presentationInsetY?: number;
  tier: Tier; layout: Layout; volume: number; muted: boolean; backgroundColor: string;
  backgroundMediaId: string | null;
  backgroundMuted?: boolean;
  backgroundLoop?: boolean;
  mediaRounded?: boolean;
  mediaRadius?: number;
  mediaGap?: number;
  logoScales?: Record<string, number>;
  logoTexts?: Record<string, LogoText>;
  loop?: boolean;
  imageMediaIds?: (string | null)[];
  imageScroll?: boolean;
  logoMediaIds?: string[];
}
export interface EventConfig { id: string; name: string; active: boolean; }
export interface Settings { advanceMode: 'VIDEO_END' | 'CONFIGURED_DURATION' | 'WHICHEVER_COMES_FIRST'; globalVolume: number; loopPlaylist: boolean; loopStartItemId?: string | null; loopEndItemId?: string | null; selectedItemId: string | null; hiddenMissingMediaIds?: string[]; }
export interface RuntimeState {
  currentItemId: string | null; status: 'STOPPED' | 'PLAYING' | 'PAUSED';
  startedAt: number | null; elapsed: number; duration: number; playbackRate: number;
  layout: Layout | 'FULL_VIDEO' | 'PRESENTATION' | null; serverTime: number; generation: number;
  loop?: boolean;
}
export interface Snapshot { events: EventConfig[]; playlist: PlaylistItem[]; media: Media[]; settings: Settings; state: RuntimeState; playerCount: number; errors: string[]; logoTextDefault?: LogoTextStyle; capabilities?: { itemLoop: boolean; compoundAds?: boolean; videoBackground?: boolean; mediaUpload?: boolean; imageAds?: boolean; imageLogoColumns?: boolean; mediaContent?: boolean; playlistLoopRange?: boolean; logoText?: boolean; presentation?: boolean }; }
