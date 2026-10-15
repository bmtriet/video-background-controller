import type { Store } from './store.js';
import type { RuntimeState } from '../shared/types.js';
import { imageColumnCount, requiredMediaIds } from '../shared/composition.js';
import { playbackItems } from '../shared/playlistLoop.js';
export class Runtime {
  state: RuntimeState;
  constructor(public store: Store, public broadcast: () => void, public error: (message: string) => void) {
    this.state = { currentItemId: store.settings().selectedItemId, status: 'STOPPED', startedAt: null, elapsed: 0, duration: 0, playbackRate: 1, layout: null, serverTime: Date.now(), generation: 0 };
  }
  snapshot(): RuntimeState { return { ...this.state, elapsed: this.elapsed(), serverTime: Date.now() }; }
  elapsed() { return this.state.elapsed + (this.state.status === 'PLAYING' && this.state.startedAt ? (Date.now() - this.state.startedAt) / 1000 : 0); }
  current() { return this.store.playlist().find(i => i.id === this.state.currentItemId); }
  waitsForVideoEnd() {
    const item = this.current();
    return item?.itemType === 'ADVERTISEMENT' && !!item.playUntilVideoEnd && !imageColumnCount(item.layout) && this.store.media().some(m => m.id === item.mediaId && m.mediaType === 'video');
  }
  reset() {
    this.state = { currentItemId: this.store.settings().selectedItemId, status: 'STOPPED', startedAt: null, elapsed: 0, duration: 0, playbackRate: 1, layout: null, serverTime: Date.now(), generation: this.state.generation + 1 };
    this.broadcast();
  }
  stop() { this.state = { ...this.state, status: 'STOPPED', elapsed: 0, startedAt: null, generation: this.state.generation + 1 }; this.broadcast(); }
  play(id?: string) {
    const items = this.store.playlist(), settings = this.store.settings();
    const candidates = playbackItems(items, settings);
    if (!id && this.state.status === 'PAUSED' && candidates.some(item => item.id === this.state.currentItemId && item.enabled)) { this.state.status = 'PLAYING'; this.state.startedAt = Date.now(); this.broadcast(); return; }
    let item = id ? items.find(i => i.id === id) : items.find(i => i.id === settings.selectedItemId && i.enabled) || candidates.find(i => i.enabled);
    if (id && (!item || !item.enabled)) throw new Error('Select an enabled playlist item');
    if (settings.loopPlaylist && !candidates.some(candidate => candidate.id === item?.id && candidate.enabled)) item = candidates.find(candidate => candidate.enabled);
    if (!item || !item.enabled) throw new Error('Select an enabled playlist item');
    const refs = requiredMediaIds(item);
    if (refs.some(id => !id || !this.store.media().some(m => m.id === id && m.exists))) throw new Error('Media file missing — choose all required media before going live');
    this.store.updateSettings({ selectedItemId: item.id });
    this.state = { currentItemId: item.id, status: 'PLAYING', elapsed: 0, startedAt: Date.now(), duration: item.itemType === 'PRESENTATION' ? 0 : item.durationSeconds, playbackRate: item.playbackRate, layout: item.itemType === 'PRESENTATION' ? 'PRESENTATION' : item.itemType === 'FULL_VIDEO' ? 'FULL_VIDEO' : item.layout, serverTime: Date.now(), generation: this.state.generation + 1, loop: item.itemType === 'FULL_VIDEO' && !!item.loop };
    this.broadcast();
  }
  pause() { if (this.state.status !== 'PLAYING') return; this.state.elapsed = this.elapsed(); this.state.startedAt = null; this.state.status = 'PAUSED'; this.broadcast(); }
  seek(seconds: number) { if (this.current()?.itemType === 'PRESENTATION') throw new Error('PowerPoint điều khiển trang bằng pointer'); if (!Number.isFinite(seconds) || seconds < 0 || seconds > this.state.duration) throw new Error('Invalid seek position'); this.state.elapsed = seconds; this.state.startedAt = this.state.status === 'PLAYING' ? Date.now() : null; this.state.generation++; this.broadcast(); }
  step(direction: number) {
    const settings = this.store.settings();
    const items = playbackItems(this.store.playlist(), settings); const index = items.findIndex(i => i.id === this.state.currentItemId);
    let next = direction > 0 ? items.slice(index + 1).find(i => i.enabled) : items.slice(0, index < 0 ? items.length : index).reverse().find(i => i.enabled);
    if (!next && settings.loopPlaylist) next = (direction > 0 ? items : [...items].reverse()).find(i => i.enabled);
    if (!next) { this.stop(); return; }
    try { this.play(next.id); } catch (e) { this.stop(); this.error((e as Error).message + ': ' + next.name); }
  }
  ended(itemId: string, generation: number) {
    if (itemId !== this.state.currentItemId || generation !== this.state.generation || this.state.status !== 'PLAYING') return;
    if (this.current()?.itemType === 'PRESENTATION') return;
    if (this.current()?.itemType === 'FULL_VIDEO' && this.current()?.loop) return;
    if (this.waitsForVideoEnd() || this.store.settings().advanceMode !== 'CONFIGURED_DURATION') this.step(1);
  }
  tick() {
    const item = this.current();
    if (this.state.status === 'PLAYING') {
      if (!item || !item.enabled) { this.stop(); return; }
      const isVideo = !(item.itemType === 'ADVERTISEMENT' && imageColumnCount(item.layout)) && this.store.media().some(m => m.id === item.mediaId && m.mediaType === 'video');
      if (item.itemType !== 'PRESENTATION' && !this.waitsForVideoEnd() && !(item.itemType === 'FULL_VIDEO' && item.loop) && this.elapsed() >= item.durationSeconds && (this.store.settings().advanceMode !== 'VIDEO_END' || !isVideo)) this.step(1);
    }
    this.broadcast();
  }
  reconcile() {
    const item = this.current();
    if (this.state.status !== 'STOPPED' && (!item || !item.enabled)) this.stop();
    else if (item) {
      const loop = item.itemType === 'FULL_VIDEO' && !!item.loop;
      // Turning off an indefinite loop starts one normal pass, preventing an
      // accumulated loop clock from immediately skipping the video.
      if (this.state.loop && !loop && this.state.status !== 'STOPPED') {
        this.state.elapsed = 0;
        this.state.startedAt = this.state.status === 'PLAYING' ? Date.now() : null;
        this.state.generation++;
      }
      this.state.loop = loop;
      this.state.duration = item.itemType === 'PRESENTATION' ? 0 : item.durationSeconds; this.state.playbackRate = item.playbackRate;
      this.state.layout = item.itemType === 'PRESENTATION' ? 'PRESENTATION' : item.itemType === 'FULL_VIDEO' ? 'FULL_VIDEO' : item.layout;
      this.broadcast();
    }
  }
}
