import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { TIERS, type EventConfig, type LogoTextStyle, type Media, type PlaylistItem, type Settings } from '../shared/types.js';
import { LAYOUT_LABELS, imageColumnCount, logoSlots } from '../shared/composition.js';
import { MAX_MEDIA_GAP, MAX_MEDIA_RADIUS, MIN_LOGO_SCALE, MAX_LOGO_SCALE } from '../shared/appearance.js';
import { playlistLoopRange } from '../shared/playlistLoop.js';
import { DEFAULT_LOGO_TEXT_STYLE, logoTextStyle, MAX_COMPANY_NAME_LENGTH, validateLogoTextStyle } from '../shared/logoText.js';

export class Store {
  db: Database.Database;
  constructor(root: string) {
    mkdirSync(path.join(root, 'data'), { recursive: true });
    this.db = new Database(path.join(root, 'data/event-player.db'));
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX IF NOT EXISTS single_active_event ON events(active) WHERE active=1;
      CREATE TABLE IF NOT EXISTS media_files (id TEXT PRIMARY KEY, filename TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, category TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS playlist_items (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, sort_order INTEGER NOT NULL, config TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS playlist_event_order ON playlist_items(event_id, sort_order);
      CREATE TABLE IF NOT EXISTS settings (event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE, config TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_preferences (key TEXT PRIMARY KEY, config TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
    if (!this.events().length) {
      const event = this.createEvent('My Event');
      this.activate(event.id);
      this.createItem({ name: 'Opening Video', itemType: 'FULL_VIDEO', durationSeconds: 30, enabled: false });
      this.createItem({ name: 'Diamond Sponsor', itemType: 'ADVERTISEMENT', tier: 'diamond', enabled: false });
      this.createItem({ name: 'Gold Sponsor', itemType: 'ADVERTISEMENT', tier: 'gold', layout: 'DUAL_MEDIA_LOGO', enabled: false });
    }
  }
  events(): EventConfig[] { return this.db.prepare('SELECT id,name,active FROM events ORDER BY created_at,id').all().map((r: any) => ({ ...r, active: !!r.active })); }
  activeId() { return this.events().find(e => e.active)!.id; }
  createEvent(name: string) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO events(id,name) VALUES(?,?)').run(id, this.name(name));
    this.db.prepare('INSERT INTO settings VALUES(?,?)').run(id, JSON.stringify({ advanceMode: 'WHICHEVER_COMES_FIRST', globalVolume: 100, loopPlaylist: false, loopStartItemId: null, loopEndItemId: null, selectedItemId: null }));
    return this.events().find(e => e.id === id)!;
  }
  name(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Name must contain 1–200 characters'); return value.trim(); }
  requireEvent(id: string) { if (!this.events().some(e => e.id === id)) throw new Error('Event not found'); }
  activate(id: string) { this.requireEvent(id); this.db.transaction(() => { this.db.prepare('UPDATE events SET active=0').run(); this.db.prepare('UPDATE events SET active=1 WHERE id=?').run(id); })(); }
  renameEvent(id: string, name: string) { this.requireEvent(id); this.db.prepare('UPDATE events SET name=? WHERE id=?').run(this.name(name), id); }
  duplicateEvent(id: string) {
    this.requireEvent(id);
    return this.db.transaction(() => {
      const copy = this.createEvent(this.events().find(e => e.id === id)!.name + ' (copy)');
      const copies = new Map<string, string>();
      for (const item of this.playlist(id)) {
        const next = { ...item, id: randomUUID(), eventId: copy.id };
        copies.set(item.id, next.id);
        this.db.prepare('INSERT INTO playlist_items VALUES(?,?,?,?)').run(next.id, copy.id, next.sortOrder, JSON.stringify(next));
      }
      const settings = this.settings(id);
      this.writeSettings({ ...settings, selectedItemId: null, loopStartItemId: copies.get(settings.loopStartItemId || '') ?? null, loopEndItemId: copies.get(settings.loopEndItemId || '') ?? null }, copy.id);
      return copy;
    })();
  }
  deleteEvent(id: string) { this.requireEvent(id); if (this.events().length === 1) throw new Error('Keep at least one event'); const active = this.activeId() === id; this.db.prepare('DELETE FROM events WHERE id=?').run(id); if (active) this.activate(this.events()[0].id); }
  media(): Media[] { return this.db.prepare('SELECT id,filename,relative_path AS relativePath,media_type AS mediaType,category,present AS "exists" FROM media_files ORDER BY filename').all().map((r: any) => ({ ...r, exists: !!r.exists })); }
  upsertMedia(filename: string, relativePath: string, mediaType: string, category: string) {
    this.db.prepare('INSERT INTO media_files VALUES(?,?,?,?,?,1) ON CONFLICT(relative_path) DO UPDATE SET present=1,filename=excluded.filename,media_type=excluded.media_type,category=excluded.category').run(randomUUID(), filename, relativePath, mediaType, category);
  }
  markMissing(relativePath: string) { this.db.prepare('UPDATE media_files SET present=0 WHERE relative_path=?').run(relativePath); }
  playlist(eventId = this.activeId()): PlaylistItem[] { return this.db.prepare('SELECT config,sort_order FROM playlist_items WHERE event_id=? ORDER BY sort_order,id').all(eventId).map((r: any) => ({ ...JSON.parse(r.config), sortOrder: r.sort_order })); }
  settings(eventId = this.activeId()): Settings { return JSON.parse((this.db.prepare('SELECT config FROM settings WHERE event_id=?').get(eventId) as any).config); }
  writeSettings(config: Settings, eventId = this.activeId()) { this.db.prepare('UPDATE settings SET config=? WHERE event_id=?').run(JSON.stringify(config), eventId); }
  logoTextDefault(): LogoTextStyle {
    const row = this.db.prepare("SELECT config FROM app_preferences WHERE key='logoTextDefault'").get() as { config: string } | undefined;
    return row ? JSON.parse(row.config) : { ...DEFAULT_LOGO_TEXT_STYLE };
  }
  setLogoTextDefault(value: unknown) {
    validateLogoTextStyle(value);
    const style = logoTextStyle(value);
    this.db.prepare("INSERT INTO app_preferences VALUES('logoTextDefault',?) ON CONFLICT(key) DO UPDATE SET config=excluded.config").run(JSON.stringify(style));
    return style;
  }
  updateSettings(patch: Partial<Settings>) {
    const next = { ...this.settings(), ...patch };
    if (!['VIDEO_END','CONFIGURED_DURATION','WHICHEVER_COMES_FIRST'].includes(next.advanceMode)) throw new Error('Invalid advance mode');
    if (!Number.isFinite(next.globalVolume) || next.globalVolume < 0 || next.globalVolume > 100) throw new Error('Invalid volume');
    if (typeof next.loopPlaylist !== 'boolean') throw new Error('Invalid loop setting');
    const items = this.playlist();
    for (const key of ['loopStartItemId', 'loopEndItemId'] as const) {
      if (next[key] != null && (typeof next[key] !== 'string' || !items.some(item => item.id === next[key]))) throw new Error('Loop boundary must belong to this event playlist');
    }
    if (items.length && !playlistLoopRange(items, next).length) throw new Error('Start from must be at or before End here');
    if (next.hiddenMissingMediaIds !== undefined && (!Array.isArray(next.hiddenMissingMediaIds) || next.hiddenMissingMediaIds.some(id => typeof id !== 'string' || id.length > 100))) throw new Error('Invalid hidden media list');
    if (next.selectedItemId !== null && !items.some(i => i.id === next.selectedItemId)) throw new Error('Selected item not found');
    this.writeSettings(next);
  }
  validate(item: PlaylistItem) {
    item.name = this.name(item.name);
    if (!['FULL_VIDEO','ADVERTISEMENT','PRESENTATION'].includes(item.itemType)) throw new Error('Invalid item type');
    if (!Object.hasOwn(TIERS, item.tier) || !Object.hasOwn(LAYOUT_LABELS, item.layout)) throw new Error('Invalid advertisement');
    if (!Number.isFinite(item.durationSeconds) || item.durationSeconds < 0.1 || item.durationSeconds > 86400) throw new Error('Duration must be between 0.1 and 86400 seconds');
    if (![0.5,0.75,1,1.25,1.5,2,3,4,5].includes(item.playbackRate)) throw new Error('Invalid playback rate');
    if (item.videoStartSeconds !== undefined && (!Number.isFinite(item.videoStartSeconds) || item.videoStartSeconds < 0 || item.videoStartSeconds > 86400)) throw new Error('Start second phải từ 0 đến 86400.');
    if (item.videoEndSeconds != null && (!Number.isFinite(item.videoEndSeconds) || item.videoEndSeconds <= (item.videoStartSeconds ?? 0) || item.videoEndSeconds > 86400)) throw new Error('End second phải lớn hơn Start second và không quá 86400.');
    if (!Number.isFinite(item.volume) || item.volume < 0 || item.volume > 100) throw new Error('Invalid volume');
    if (typeof item.enabled !== 'boolean' || typeof item.muted !== 'boolean') throw new Error('Invalid checkbox value');
    if (item.loop !== undefined && typeof item.loop !== 'boolean') throw new Error('Invalid video loop setting');
    if (item.playUntilVideoEnd !== undefined && typeof item.playUntilVideoEnd !== 'boolean') throw new Error('Invalid video end setting');
    if (item.mediaRounded !== undefined && typeof item.mediaRounded !== 'boolean') throw new Error('Invalid media mask setting');
    if (item.imageScroll !== undefined && typeof item.imageScroll !== 'boolean') throw new Error('Invalid image scroll setting');
    for (const [key, max] of [['mediaRadius', MAX_MEDIA_RADIUS], ['mediaGap', MAX_MEDIA_GAP]] as const) {
      const value = item[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)) throw new Error(`${key} must be between 0 and ${max}px`);
    }
    for (const key of ['backgroundMuted', 'backgroundLoop'] as const) {
      if (item[key] !== undefined && typeof item[key] !== 'boolean') throw new Error('Invalid background video setting');
    }
    if (item.loop && item.itemType !== 'FULL_VIDEO') throw new Error('Single-item loop is available for fullscreen videos only');
    if (!/^#[0-9a-f]{6}$/i.test(item.backgroundColor)) throw new Error('Invalid background color');
    const media = this.media();
    if (item.logoTexts !== undefined) {
      if (!item.logoTexts || typeof item.logoTexts !== 'object' || Array.isArray(item.logoTexts) || Object.keys(item.logoTexts).length > 12) throw new Error('Invalid logo text settings');
      const logos = logoSlots(item);
      for (const [id, text] of Object.entries(item.logoTexts)) {
        if (!logos.includes(id) || !media.some(file => file.id === id && file.mediaType === 'image')) throw new Error('Company text requires an assigned logo image');
        validateLogoTextStyle(text);
        if (typeof text.enabled !== 'boolean' || typeof text.text !== 'string' || text.text.length > MAX_COMPANY_NAME_LENGTH) throw new Error(`Company name must be text up to ${MAX_COMPANY_NAME_LENGTH} characters with a valid toggle`);
      }
    }
    if (item.logoScales !== undefined) {
      if (!item.logoScales || typeof item.logoScales !== 'object' || Array.isArray(item.logoScales) || Object.keys(item.logoScales).length > 12) throw new Error('Invalid logo scale settings');
      for (const [id, scale] of Object.entries(item.logoScales)) {
        if (!media.some(file => file.id === id && file.mediaType === 'image') || typeof scale !== 'number' || !Number.isFinite(scale) || scale < MIN_LOGO_SCALE || scale > MAX_LOGO_SCALE) throw new Error(`Logo scale must be between ${MIN_LOGO_SCALE}% and ${MAX_LOGO_SCALE}% for a valid image`);
      }
    }
    for (const key of ['imageMediaIds', 'logoMediaIds'] as const) {
      const ids = item[key];
      if (ids === undefined) continue;
      if (!Array.isArray(ids) || ids.length > (key === 'imageMediaIds' ? 3 : 12)) throw new Error('Invalid composition media list');
      for (const id of ids) {
        if (id === null && key === 'imageMediaIds') continue;
        if (typeof id !== 'string' || !media.some(m => m.id === id && m.mediaType === 'image')) throw new Error('Composition slots require valid images');
      }
    }
    const columns = imageColumnCount(item.layout);
    if (item.itemType === 'ADVERTISEMENT' && columns && (!Array.isArray(item.imageMediaIds) || item.imageMediaIds.length !== columns)) throw new Error('Provide one image slot per column');
    for (const key of ['mediaId','secondaryMediaId','logoMediaId','backgroundMediaId'] as const) {
      if (item[key] !== null) {
        const ref = media.find(m => m.id === item[key]);
        if (!ref) throw new Error('Invalid media reference');
        if (ref.mediaType === 'presentation' && !(key === 'mediaId' && item.itemType === 'PRESENTATION')) throw new Error('PowerPoint chỉ dùng cho mục thuyết trình');
        if ((key === 'logoMediaId' || (key === 'mediaId' && item.itemType === 'FULL_VIDEO')) && ref.mediaType !== (key === 'mediaId' ? 'video' : 'image')) throw new Error('Incorrect media type');
      }
    }
    for (const key of ['slideSetupOnly', 'speakerEnabled'] as const) {
      if (item[key] !== undefined && typeof item[key] !== 'boolean') throw new Error('Cấu hình slide không hợp lệ');
    }
    for (const key of ['speakerName', 'speakerTitle'] as const) {
      if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key]!.length > 300)) throw new Error('Tên và chức vị tối đa 300 ký tự.');
    }
    for (const [key, min, max] of [['slideNumber', 1, 999], ['speakerX', 0, 100], ['speakerY', 0, 100], ['speakerWidth', 1, 100], ['speakerHeight', 1, 100], ['speakerTextX', 0, 99], ['speakerTextY', 0, 99], ['speakerTextWidth', 1, 100], ['speakerNameSize', 10, 100], ['speakerTitleSize', 10, 100]] as const) {
      const value = item[key];
      if (value !== undefined && (!Number.isFinite(value) || value < min || value > max || key === 'slideNumber' && !Number.isInteger(value))) throw new Error('Vị trí hoặc kích thước slide ngoài phạm vi');
    }
    if ((item.speakerX ?? 76.04) + (item.speakerWidth ?? 22.92) > 100.01 || (item.speakerY ?? 20.56) + (item.speakerHeight ?? 77.59) > 100.01) throw new Error('Ảnh phải nằm trong khung slide');
    if ((item.speakerTextX ?? 76.04) + (item.speakerTextWidth ?? 22.92) > 100.01) throw new Error('Thông tin diễn giả phải nằm trong khung slide.');
    if (item.itemType === 'PRESENTATION') {
      if (item.mediaId && media.find(m => m.id === item.mediaId)?.mediaType !== 'presentation') throw new Error('Chọn file PowerPoint .pptx');
      if (item.speakerMediaId != null && !media.some(m => m.id === item.speakerMediaId && m.mediaType === 'image' && /\.png$/i.test(m.filename))) throw new Error('Chọn PNG diễn giả');
      if (item.backgroundMediaId && media.find(m => m.id === item.backgroundMediaId)?.mediaType !== 'video') throw new Error('Chọn video nền');
      if (item.presentationMode !== undefined && !['capture', 'window'].includes(item.presentationMode)) throw new Error('Chế độ trình chiếu không hợp lệ');
      if (item.presentationRatio !== undefined && !['auto', '16:9', '4:3'].includes(item.presentationRatio)) throw new Error('Tỉ lệ slide không hợp lệ');
      for (const [key, min, max] of [['presentationTitleBar', 0, 100], ['presentationInsetX', -200, 200], ['presentationInsetY', -200, 200]] as const) {
        if (item[key] !== undefined && (!Number.isFinite(item[key]) || item[key]! < min || item[key]! > max)) throw new Error('Căn chỉnh ngoài phạm vi');
      }
      item.durationSeconds = 1; item.playbackRate = 1; item.muted = true; item.backgroundMuted = true; item.backgroundLoop = true; item.loop = false;
    }
    return item;
  }
  createItem(patch: Partial<PlaylistItem>) {
    const item = this.validate({ id: randomUUID(), eventId: this.activeId(), sortOrder: this.playlist().length, itemType: 'FULL_VIDEO', name: 'Untitled video', enabled: patch.itemType !== 'PRESENTATION', durationSeconds: TIERS[patch.tier || 'diamond'], playbackRate: 1, mediaId: null, secondaryMediaId: null, logoMediaId: null, tier: 'diamond', layout: 'MEDIA_LOGO', volume: 100, muted: false, backgroundColor: '#000000', backgroundMediaId: null, backgroundMuted: true, backgroundLoop: true, loop: false, ...patch });
    item.id = randomUUID(); item.eventId = this.activeId(); item.sortOrder = this.playlist().length;
    this.db.prepare('INSERT INTO playlist_items VALUES(?,?,?,?)').run(item.id, item.eventId, item.sortOrder, JSON.stringify(item)); return item;
  }
  updateItem(id: string, patch: Partial<PlaylistItem>) {
    const old = this.playlist().find(i => i.id === id); if (!old) throw new Error('Playlist item not found');
    const item = this.validate({ ...old, ...patch, id: old.id, eventId: old.eventId, sortOrder: old.sortOrder });
    this.db.prepare('UPDATE playlist_items SET config=? WHERE id=?').run(JSON.stringify(item), id); return item;
  }
  deleteItem(id: string) {
    const items = this.playlist();
    if (!items.some(i => i.id === id)) throw new Error('Playlist item not found');
    const settings = this.settings();
    const remainingRange = playlistLoopRange(items, settings).filter(item => item.id !== id);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM playlist_items WHERE id=?').run(id);
      const patch: Partial<Settings> = {};
      if (settings.selectedItemId === id) patch.selectedItemId = null;
      if (settings.loopStartItemId === id) patch.loopStartItemId = remainingRange[0]?.id ?? null;
      if (settings.loopEndItemId === id) patch.loopEndItemId = remainingRange[remainingRange.length - 1]?.id ?? null;
      if (!remainingRange.length) Object.assign(patch, { loopPlaylist: false, loopStartItemId: null, loopEndItemId: null });
      this.updateSettings(patch);
      this.reorder(this.playlist().map(i => i.id));
    })();
  }
  reorder(ids: string[]) {
    const existing = this.playlist().map(i => i.id);
    if (!Array.isArray(ids) || ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new Error('Order must contain every playlist item exactly once');
    this.db.transaction(() => {
      ids.forEach((id, index) => this.db.prepare('UPDATE playlist_items SET sort_order=? WHERE id=? AND event_id=?').run(index, id, this.activeId()));
      const settings = this.settings();
      if (settings.loopStartItemId && settings.loopEndItemId && ids.indexOf(settings.loopStartItemId) > ids.indexOf(settings.loopEndItemId)) this.updateSettings({ loopStartItemId: settings.loopEndItemId, loopEndItemId: settings.loopStartItemId });
    })();
  }
}
