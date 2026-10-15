import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_FADE_MS, AudioFadeEnvelope, remainingAudioTime } from '../frontend/src/audioFade';

test('video audio fades in and reaches zero at the source end', () => {
  const envelope = new AudioFadeEnvelope();
  assert.equal(envelope.sample(0, 10, 10), 0);
  envelope.start(100);
  assert.equal(envelope.sample(100, 10, 10), 0);
  assert.equal(envelope.sample(350, 9.75, 10), .5);
  assert.equal(envelope.sample(600, 9.5, 10), 1);
  assert.equal(envelope.sample(9850, .25, 10), .5);
  assert.equal(envelope.sample(10100, 0, 10), 0);
});

test('the earlier configured cutoff or source end controls fade-out', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(2000, remainingAudioTime(8, .25), 10), .5);
  assert.equal(envelope.sample(2250, remainingAudioTime(7.75, 0), 10), 0);
  assert.equal(remainingAudioTime(.1, 8), .1);
  assert.equal(remainingAudioTime(undefined, 2), 2);
  assert.equal(remainingAudioTime(2, undefined), 2);
  assert.equal(remainingAudioTime(undefined, undefined), undefined);
});

test('short clips use half-duration ramps and reach full volume midway', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(100, .3, .4), .5);
  assert.equal(envelope.sample(200, .2, .4), 1);
  assert.equal(envelope.sample(300, .1, .4), .5);
  assert.equal(envelope.sample(400, 0, .4), 0);
});

test('switching fades from the current gain without jumping or restarting', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(250, 10, 10), .5);
  envelope.exit(250);
  assert.equal(envelope.sample(250, 10, 10), .5);
  assert.equal(envelope.sample(500, 10, 10), .25);
  envelope.exit(500);
  envelope.start(500);
  assert.equal(envelope.sample(750, 10, 10), 0);
  assert.equal(envelope.sample(1000, 10, 10), 0);
});

test('switching during the natural tail continues fading from reduced volume', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(9000, .1, 10), .2);
  envelope.exit(9000);
  assert.equal(envelope.sample(9250, 0, 10), .1);
  assert.equal(envelope.sample(9500, 0, 10), 0);
});

test('loop restart fades in after the preceding pass fades out', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(1750, .25, 2), .5);
  assert.equal(envelope.sample(2000, 0, 2), 0);
  envelope.start(2000);
  assert.equal(envelope.sample(2000, 2, 2), 0);
  assert.equal(envelope.sample(2250, 1.75, 2), .5);
  assert.equal(envelope.sample(2500, 1.5, 2), 1);
});

test('unknown source duration still fades in and can fade out on switch', () => {
  const envelope = new AudioFadeEnvelope();
  envelope.start(0);
  assert.equal(envelope.sample(AUDIO_FADE_MS, undefined, undefined), 1);
  envelope.exit(AUDIO_FADE_MS);
  assert.equal(envelope.sample(AUDIO_FADE_MS * 2, undefined, undefined), 0);
});
