export const AUDIO_FADE_MS = 500;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export class AudioFadeEnvelope {
  private startedAt: number | null = null;
  private outgoing: { at: number; gain: number } | null = null;
  private lastGain = 0;

  start(now: number) { if (!this.outgoing) this.startedAt = now; }
  exit(now: number) { if (!this.outgoing) this.outgoing = { at: now, gain: this.lastGain }; }
  sample(now: number, remaining: number | undefined, duration: number | undefined) {
    if (this.outgoing) return this.lastGain = this.outgoing.gain * clamp(1 - (now - this.outgoing.at) / AUDIO_FADE_MS);
    const fadeMs = duration !== undefined && duration > 0 ? Math.min(AUDIO_FADE_MS, duration * 500) : AUDIO_FADE_MS;
    const head = this.startedAt === null ? 0 : clamp((now - this.startedAt) / fadeMs);
    const tail = remaining === undefined ? 1 : clamp(remaining * 1000 / fadeMs);
    return this.lastGain = Math.min(head, tail);
  }
}

export function remainingAudioTime(source: number | undefined, item: number | undefined) {
  return source === undefined ? item : item === undefined ? source : Math.min(source, item);
}
