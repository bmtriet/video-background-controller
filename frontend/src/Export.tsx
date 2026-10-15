import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PlayerRenderer } from './Renderer';
import { socket } from './services';
import type { PlaylistItem, Snapshot } from '../../shared/types';
import './style.css';

socket.disconnect();
const root = createRoot(document.getElementById('root')!);
let snapshot: Snapshot;
let item: PlaylistItem;
const failures: string[] = [];
function render(elapsed: number) {
  flushSync(() => root.render(<main className="audience"><PlayerRenderer key={item.id} item={item} media={snapshot.media} state={{ ...snapshot.state, status: 'PAUSED', elapsed, currentItemId: item.id }} receivedAt={Date.now()} forceMuted onError={message => failures.push(message)}/></main>));
}
Object.assign(window, {
  async loadExport(value: Snapshot, id: string) {
    snapshot = value; item = value.playlist.find(entry => entry.id === id)!;
    failures.length = 0;
    render(0);
    await Promise.all([...document.images].map(image => image.decode()));
    await Promise.all([...document.querySelectorAll('video')].map(video => new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) { resolve(); return; }
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`Không tải được ${video.src}`)), { once: true });
    })));
    await document.fonts.ready;
  },
  async exportFrame(time: number) {
    render(time);
    await Promise.all([...document.querySelectorAll('video')].map(async video => {
      video.pause();
      const position = time * (video.closest('.composition-background') ? 1 : item.playbackRate);
      const target = video.loop ? position % video.duration : Math.min(position, Math.max(0, video.duration - .001));
      if (Math.abs(video.currentTime - target) < .0001 && !video.seeking) return;
      await new Promise<void>((resolve, reject) => {
        const done = () => { video.removeEventListener('error', failed); resolve(); };
        const failed = () => { video.removeEventListener('seeked', done); reject(new Error(`Seek failed: ${video.src}`)); };
        video.addEventListener('seeked', done, { once: true });
        video.addEventListener('error', failed, { once: true });
        if (Math.abs(video.currentTime - target) >= .0001) video.currentTime = target;
      });
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (failures.length) throw new Error(failures.join('\n'));
  }
});
