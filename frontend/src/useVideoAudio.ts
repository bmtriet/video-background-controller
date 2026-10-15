import { useLayoutEffect, useRef } from 'react';
import type { PlaylistItem, RuntimeState, Settings } from '../../shared/types';
import { AudioFadeEnvelope, remainingAudioTime } from './audioFade';

interface Options {
  item: PlaylistItem; state?: RuntimeState; receivedAt: number; rate: number;
  globalVolume: number; muted: boolean; silentMonitor: boolean; loop: boolean;
  outgoing: boolean; advanceMode?: Settings['advanceMode']; mainVideo: boolean;
  blockedAudio: { current: boolean };
  trimStart: number; trimEnd?: number | null;
}

export function useVideoAudio(ref: { current: HTMLVideoElement | null }, options: Options) {
  const latest = useRef(options);
  const envelopeRef = useRef<AudioFadeEnvelope | null>(null);
  latest.current = options;
  useLayoutEffect(() => {
    const video = ref.current; if (!video) return;
    const envelope = new AudioFadeEnvelope();
    envelopeRef.current = envelope;
    let frame = 0;
    let previousTime = video.currentTime;
    let previousMuted = true;
    video.volume = 0;
    if (latest.current.silentMonitor) {
      video.defaultMuted = true; video.muted = true;
      return () => { video.pause(); };
    }
    const tick = () => {
      const option = latest.current;
      const now = performance.now();
      const muted = option.silentMonitor || option.muted || option.globalVolume === 0 || option.item.volume === 0 || option.blockedAudio.current;
      if (!video.paused && (previousMuted && !muted || option.loop && video.currentTime < previousTime - .1)) envelope.start(now);
      previousMuted = muted;
      previousTime = video.currentTime;
      if (option.outgoing) envelope.exit(now);
      const stop = Math.min(option.trimEnd ?? Infinity, video.duration);
      const sourceDuration = Number.isFinite(stop) && stop > option.trimStart ? (stop - option.trimStart) / option.rate : undefined;
      const sourceRemaining = sourceDuration === undefined ? undefined : Math.max(0, (stop - video.currentTime) / option.rate);
      const indefinite = option.item.itemType === 'FULL_VIDEO' && !!option.item.loop;
      const waitForEnd = option.mainVideo && (option.item.itemType === 'ADVERTISEMENT' && !!option.item.playUntilVideoEnd || option.advanceMode === 'VIDEO_END');
      const durationCut = !indefinite && !waitForEnd && (option.advanceMode !== 'VIDEO_END' || !option.mainVideo);
      const elapsed = option.state ? option.state.elapsed + (option.state.status === 'PLAYING' ? Math.max(0, Date.now() - option.receivedAt) / 1000 : 0) : 0;
      const itemRemaining = durationCut && option.state ? Math.max(0, option.item.durationSeconds - elapsed) : undefined;
      // End-driven clips retain their gain until the clip actually ends.
      // Keep the exit ramp for manual transitions, without a premature tail.
      const gain = envelope.sample(now, waitForEnd ? undefined : remainingAudioTime(sourceRemaining, itemRemaining), remainingAudioTime(sourceDuration, durationCut ? option.item.durationSeconds : undefined));
      video.muted = muted;
      const volume = muted ? 0 : option.item.volume * option.globalVolume / 10000 * gain;
      if (Math.abs(video.volume - volume) > .0001) video.volume = Math.max(0, Math.min(1, volume));
      frame = requestAnimationFrame(tick);
    };
    const playing = () => envelope.start(performance.now());
    video.addEventListener('playing', playing);
    if (!video.paused) playing();
    tick();
    return () => { cancelAnimationFrame(frame); video.removeEventListener('playing', playing); video.pause(); };
  }, [ref]);
  useLayoutEffect(() => {
    if (options.outgoing) envelopeRef.current?.exit(performance.now());
  }, [options.outgoing]);
}
