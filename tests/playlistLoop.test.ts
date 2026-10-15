import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { Runtime } from '../server/runtime';
import { playlistLoopRange } from '../shared/playlistLoop';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'playlist-loop-test-'));
  const store = new Store(root);
  for (const item of store.playlist()) store.deleteItem(item.id);
  store.upsertMedia('clip.mp4', 'videos/clip.mp4', 'video', 'videos');
  const video = store.media()[0];
  const items = ['A', 'B', 'C', 'D', 'E', 'F'].map(name => store.createItem({ name, mediaId: video.id, durationSeconds: 1 }));
  const errors: string[] = [];
  const runtime = new Runtime(store, () => {}, message => errors.push(message));
  return { root, store, runtime, items, errors, close: () => { if (store.db.open) store.db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('bounded loop wraps both directions and skips disabled items without leaving the range', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [a, b, c, d, e] = items;
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: e.id });
  store.updateItem(c.id, { enabled: false });
  store.updateItem(e.id, { enabled: false });
  runtime.play(a.id);
  assert.equal(runtime.state.currentItemId, b.id);
  runtime.step(1); assert.equal(runtime.state.currentItemId, d.id);
  runtime.step(1); assert.equal(runtime.state.currentItemId, b.id);
  runtime.step(-1); assert.equal(runtime.state.currentItemId, d.id);
  runtime.step(-1); assert.equal(runtime.state.currentItemId, b.id);
  store.updateSettings({ advanceMode: 'VIDEO_END' });
  runtime.play(d.id);
  const generation = runtime.state.generation;
  runtime.ended(d.id, generation);
  assert.equal(runtime.state.currentItemId, b.id);
  runtime.ended(d.id, generation);
  assert.equal(runtime.state.currentItemId, b.id);
  runtime.ended(b.id, runtime.state.generation);
  assert.equal(runtime.state.currentItemId, d.id);
  store.updateItem(d.id, { loop: true }); runtime.reconcile();
  runtime.ended(d.id, runtime.state.generation);
  assert.equal(runtime.state.currentItemId, d.id);
  runtime.step(1); assert.equal(runtime.state.currentItemId, b.id);
});

test('automatic duration/end advance and a one-item loop stay inside selected bounds', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [, b, , d] = items;
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  for (const advanceMode of ['CONFIGURED_DURATION', 'WHICHEVER_COMES_FIRST', 'VIDEO_END'] as const) {
    store.updateSettings({ advanceMode });
    runtime.play(d.id);
    if (advanceMode === 'VIDEO_END') runtime.ended(d.id, runtime.state.generation);
    else { runtime.state.elapsed = 2; runtime.state.startedAt = Date.now(); runtime.tick(); }
    assert.equal(runtime.state.currentItemId, b.id);
    assert.equal(runtime.state.status, 'PLAYING');
  }
  store.updateSettings({ loopStartItemId: d.id, loopEndItemId: d.id });
  runtime.play();
  const generation = runtime.state.generation;
  for (let pass = 0; pass < 5; pass++) {
    runtime.ended(d.id, runtime.state.generation);
    assert.equal(runtime.state.currentItemId, d.id);
    assert.equal(runtime.state.status, 'PLAYING');
  }
  assert.equal(runtime.state.generation, generation + 5);
});

test('a range with every item disabled stops instead of playing enabled rows outside it', t => {
  const { store, runtime, items, errors, close } = fixture(); t.after(close);
  const [a, b, c, d] = items;
  runtime.play(a.id);
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  for (const item of [b, c, d]) store.updateItem(item.id, { enabled: false });
  assert.throws(() => runtime.play(a.id), /enabled playlist item/);
  runtime.step(1);
  assert.equal(runtime.state.status, 'STOPPED');
  assert.equal(runtime.state.currentItemId, a.id);
  assert.deepEqual(errors, []);
  assert.throws(() => runtime.play(b.id), /enabled playlist item/);
  assert.throws(() => runtime.play('does-not-exist'), /enabled playlist item/);
});

test('enabling a range preserves current playback until transition and resumes paused items inside it', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [a, b, , d] = items;
  runtime.play(a.id);
  const generation = runtime.state.generation;
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  assert.equal(runtime.state.currentItemId, a.id);
  assert.equal(runtime.state.generation, generation);
  runtime.step(1); assert.equal(runtime.state.currentItemId, b.id);
  runtime.play(d.id); runtime.pause(); runtime.seek(.3);
  const pausedGeneration = runtime.state.generation;
  runtime.play();
  assert.equal(runtime.state.currentItemId, d.id);
  assert.equal(runtime.state.generation, pausedGeneration);
  assert.ok(runtime.elapsed() >= .3);
  store.updateSettings({ loopPlaylist: false });
  runtime.play(a.id);
  assert.equal(runtime.state.currentItemId, a.id);
  runtime.play(d.id); runtime.step(1);
  assert.equal(runtime.state.currentItemId, items[4].id);
});

test('deleting boundaries shrinks the saved range and deleting its sole row disables loop', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [a, b, c, d] = items;
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  store.deleteItem(a.id);
  assert.equal(store.settings().loopStartItemId, b.id);
  store.deleteItem(b.id);
  assert.equal(store.settings().loopStartItemId, c.id);
  assert.equal(store.settings().loopEndItemId, d.id);
  store.deleteItem(d.id);
  assert.equal(store.settings().loopStartItemId, c.id);
  assert.equal(store.settings().loopEndItemId, c.id);
  runtime.play(c.id);
  store.deleteItem(c.id); runtime.reconcile();
  assert.equal(runtime.state.status, 'STOPPED');
  assert.equal(store.settings().selectedItemId, null);
  assert.equal(store.settings().loopPlaylist, false);
  assert.equal(store.settings().loopStartItemId, null);
  assert.equal(store.settings().loopEndItemId, null);
  assert.equal(store.playlist().length, 2);
});

test('reordering follows stable endpoint IDs and normalizes crossed endpoints', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [a, b, , d] = items;
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  store.reorder([...items].reverse().map(item => item.id));
  assert.equal(store.settings().loopStartItemId, d.id);
  assert.equal(store.settings().loopEndItemId, b.id);
  assert.deepEqual(playlistLoopRange(store.playlist(), store.settings()).map(item => item.name), ['D', 'C', 'B']);
  runtime.play(a.id); assert.equal(runtime.state.currentItemId, d.id);
  runtime.step(-1); assert.equal(runtime.state.currentItemId, b.id);
  store.updateSettings({ globalVolume: 50 });
  assert.equal(store.settings().globalVolume, 50);
});

test('loop settings are event-local, duplicated to new IDs and persist after restart', t => {
  const { root, store, items, close } = fixture(); t.after(close);
  const [, b, , d] = items;
  const original = store.activeId();
  store.updateSettings({ loopPlaylist: true, loopStartItemId: b.id, loopEndItemId: d.id });
  const copy = store.duplicateEvent(original);
  const copiedSettings = store.settings(copy.id);
  assert.notEqual(copiedSettings.loopStartItemId, b.id);
  assert.notEqual(copiedSettings.loopEndItemId, d.id);
  assert.deepEqual(playlistLoopRange(store.playlist(copy.id), copiedSettings).map(item => item.name), ['B', 'C', 'D']);
  store.activate(copy.id);
  assert.throws(() => store.updateSettings({ loopStartItemId: b.id }), /this event playlist/);
  const other = store.createEvent('Other event');
  assert.equal(store.settings(other.id).loopPlaylist, false);
  assert.equal(store.settings(other.id).loopStartItemId, null);
  assert.equal(store.settings(original).loopStartItemId, b.id);
  store.db.close();
  const reopened = new Store(root);
  try {
    assert.equal(reopened.activeId(), copy.id);
    assert.deepEqual(reopened.settings(), copiedSettings);
    const runtime = new Runtime(reopened, () => {}, message => assert.fail(message));
    runtime.play();
    assert.equal(runtime.state.currentItemId, copiedSettings.loopStartItemId);
  } finally { reopened.db.close(); }
});

test('invalid bounds are rejected atomically and legacy unbounded loop still plays the full list', t => {
  const { store, runtime, items, close } = fixture(); t.after(close);
  const [, b, , d, , f] = items;
  const original = store.settings();
  assert.throws(() => store.updateSettings({ loopStartItemId: 'missing', loopPlaylist: true }), /this event playlist/);
  assert.throws(() => store.updateSettings({ loopStartItemId: d.id, loopEndItemId: b.id }), /at or before/);
  assert.throws(() => store.updateSettings({ loopEndItemId: 42 as unknown as string }), /this event playlist/);
  assert.deepEqual(store.settings(), original);
  assert.deepEqual(playlistLoopRange(items, { loopStartItemId: 'missing' }), []);
  const { loopStartItemId, loopEndItemId, ...legacy } = original;
  store.writeSettings({ ...legacy, loopPlaylist: true });
  runtime.play(f.id); runtime.step(1);
  assert.equal(runtime.state.currentItemId, items[0].id);
  runtime.step(-1); assert.equal(runtime.state.currentItemId, f.id);
  store.updateSettings({ loopPlaylist: false });
  runtime.step(1); assert.equal(runtime.state.status, 'STOPPED');
});
