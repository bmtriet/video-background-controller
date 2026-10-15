import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { Runtime } from '../server/runtime';
import { AD_LAYOUT_CHOICES, editableAdLayout, hasLogoColumn, imageColumnCount, requiredMediaIds } from '../shared/composition';
import { imagePanFrame, imagePlaybackElapsed, imageScrollProgress } from '../frontend/src/imageMotion';
import type { RuntimeState } from '../shared/types';

test('image/logo ads validate images, require logos and retain motion settings after restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'image-ad-test-'));
  let store = new Store(root);
  try {
    store.upsertMedia('poster.png', 'ads/poster.png', 'image', 'ads');
    store.upsertMedia('logo.png', 'logos/logo.png', 'image', 'logos');
    store.upsertMedia('next.mp4', 'videos/next.mp4', 'video', 'videos');
    const [poster, logo, video] = ['poster.png', 'logo.png', 'next.mp4'].map(name => store.media().find(file => file.filename === name)!);
    const ad = store.createItem({ name: 'Image with logos', itemType: 'ADVERTISEMENT', layout: 'IMAGE_LOGO', imageMediaIds: [poster.id], logoMediaIds: [logo.id], imageScroll: true, mediaRadius: 50, mediaGap: 20, logoScales: { [logo.id]: 120 } });
    assert.equal(imageColumnCount(ad.layout), 1);
    assert.equal(hasLogoColumn(ad.layout), true);
    assert.deepEqual(requiredMediaIds(ad), [poster.id, logo.id]);
    assert.deepEqual(requiredMediaIds({ ...ad, logoMediaIds: [] }), [poster.id, null]);
    assert.throws(() => store.updateItem(ad.id, { imageScroll: 'yes' as unknown as boolean }), /image scroll/);
    assert.throws(() => store.updateItem(ad.id, { imageMediaIds: [video.id] }), /valid images/);
    assert.throws(() => store.updateItem(ad.id, { imageMediaIds: [] }), /one image slot/);
    const runtime = new Runtime(store, () => {}, message => assert.fail(message));
    store.updateItem(ad.id, { logoMediaIds: [] });
    assert.throws(() => runtime.play(ad.id), /Media file missing/);
    store.updateItem(ad.id, { logoMediaIds: [logo.id] });
    store.markMissing(logo.relativePath);
    assert.throws(() => runtime.play(ad.id), /Media file missing/);
    store.upsertMedia(logo.filename, logo.relativePath, 'image', 'logos');
    runtime.play(ad.id);
    assert.equal(runtime.state.layout, 'IMAGE_LOGO');
    store.db.close();
    store = new Store(root);
    const restored = store.playlist().find(item => item.id === ad.id)!;
    assert.equal(restored.imageScroll, true);
    assert.deepEqual(restored.imageMediaIds, [poster.id]);
    assert.deepEqual(restored.logoMediaIds, [logo.id]);
    assert.equal(restored.logoScales?.[logo.id], 120);
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('all image layouts use the configured timer even in Video End mode', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'image-runtime-test-'));
  const store = new Store(root);
  try {
    store.upsertMedia('poster.png', 'ads/poster.png', 'image', 'ads');
    store.upsertMedia('logo.png', 'logos/logo.png', 'image', 'logos');
    store.upsertMedia('next.mp4', 'videos/next.mp4', 'video', 'videos');
    const [poster, logo, video] = ['poster.png', 'logo.png', 'next.mp4'].map(name => store.media().find(file => file.filename === name)!);
    store.updateSettings({ advanceMode: 'VIDEO_END' });
    for (const layout of ['IMAGE_LOGO', 'IMAGES_2_LOGO', 'IMAGES_3_LOGO', 'IMAGES_1', 'IMAGES_2', 'IMAGES_3'] as const) {
      const ad = store.createItem({ name: layout, itemType: 'ADVERTISEMENT', layout, imageScroll: true, imageMediaIds: Array(imageColumnCount(layout)).fill(poster.id), logoMediaIds: [logo.id], mediaId: video.id, durationSeconds: 1 });
      const next = store.createItem({ name: 'Next video', mediaId: video.id });
      const runtime = new Runtime(store, () => {}, message => assert.fail(message));
      runtime.play(ad.id);
      runtime.pause();
      runtime.state.elapsed = 2;
      runtime.tick();
      assert.equal(runtime.state.currentItemId, ad.id);
      runtime.play();
      runtime.tick();
      assert.equal(runtime.state.currentItemId, next.id);
    }
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('two/three-image layouts require logos, preserve caption/scroll settings and retain old image-only playback', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'image-columns-logo-test-'));
  const store = new Store(root);
  try {
    store.upsertMedia('poster.png', 'ads/poster.png', 'image', 'ads');
    store.upsertMedia('logo.png', 'logos/logo.png', 'image', 'logos');
    const poster = store.media().find(file => file.filename === 'poster.png')!;
    const logo = store.media().find(file => file.filename === 'logo.png')!;
    for (const layout of ['IMAGES_2_LOGO', 'IMAGES_3_LOGO'] as const) {
      const imageMediaIds = Array(imageColumnCount(layout)).fill(poster.id);
      const ad = store.createItem({ name: layout, itemType: 'ADVERTISEMENT', layout, imageMediaIds, logoMediaIds: [], imageScroll: true });
      const runtime = new Runtime(store, () => {}, message => assert.fail(message));
      assert.equal(hasLogoColumn(layout), true);
      assert.deepEqual(requiredMediaIds(ad), [...imageMediaIds, null]);
      assert.throws(() => runtime.play(ad.id), /Media file missing/);
      const caption = { enabled: true, text: 'Company', color: '#ffffff', bold: true, fontSize: 32, strokeColor: '#000000', strokeWidth: 2 };
      store.updateItem(ad.id, { logoMediaIds: [logo.id], logoTexts: { [logo.id]: caption }, logoScales: { [logo.id]: 125 } });
      runtime.play(ad.id);
      assert.equal(runtime.state.layout, layout);
      assert.equal(store.playlist().find(item => item.id === ad.id)?.logoTexts?.[logo.id].text, caption.text);
      assert.throws(() => store.updateItem(ad.id, { imageMediaIds: [poster.id] }), /one image slot/);
    }
    for (const layout of ['IMAGES_1', 'IMAGES_2', 'IMAGES_3'] as const) {
      const imageMediaIds = Array(imageColumnCount(layout)).fill(poster.id);
      const old = store.createItem({ name: layout, itemType: 'ADVERTISEMENT', layout, imageMediaIds });
      assert.equal(hasLogoColumn(layout), false);
      assert.deepEqual(requiredMediaIds(old), imageMediaIds);
      const runtime = new Runtime(store, () => {}, message => assert.fail(message));
      runtime.play(old.id); assert.equal(runtime.state.status, 'PLAYING');
      assert.ok(AD_LAYOUT_CHOICES.includes(editableAdLayout(layout)));
    }
    assert.equal(AD_LAYOUT_CHOICES.includes('IMAGES_1'), false);
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('Ken Burns reveals the top and bottom without blank edges or changing proportions', () => {
  for (const [sourceWidth, sourceHeight] of [[100, 500], [600, 100], [100, 100]]) {
    const first = imagePanFrame(200, 100, sourceWidth, sourceHeight, 0)!;
    const last = imagePanFrame(200, 100, sourceWidth, sourceHeight, 1)!;
    assert.equal(Math.abs(first.y), 0);
    assert.ok(Math.abs(last.y + last.height * last.scale - 100) < .00001);
    assert.ok(Math.abs(first.width / first.height - sourceWidth / sourceHeight) < .00001);
    for (const progress of [0, .25, .5, .75, 1]) {
      const frame = imagePanFrame(200, 100, sourceWidth, sourceHeight, progress)!;
      assert.ok(frame.x <= 0 && frame.y <= 0);
      assert.ok(frame.x + frame.width * frame.scale >= 200);
      assert.ok(frame.y + frame.height * frame.scale >= 100);
    }
    assert.equal(last.scale, 1.04);
  }
  assert.equal(imagePanFrame(0, 100, 200, 400, .5), null);
  assert.equal(imagePanFrame(100, 100, 0, 0, .5), null);
});

test('image motion follows pause, resume, seek and reload clocks; only preview repeats', () => {
  const state: RuntimeState = { currentItemId: 'ad', status: 'PLAYING', elapsed: 10, duration: 60, startedAt: null, playbackRate: 1, layout: 'IMAGE_LOGO', serverTime: 1000, generation: 1 };
  assert.equal(imagePlaybackElapsed(state, 1000, 2000), 11);
  assert.equal(imagePlaybackElapsed({ ...state, status: 'PAUSED' }, 1000, 5000), 10);
  assert.equal(imagePlaybackElapsed({ ...state, elapsed: 30, generation: 2 }, 2000, 2000), 30);
  assert.equal(imageScrollProgress(imagePlaybackElapsed(state, 1000, 2000), 60), 11 / 60);
  assert.equal(imageScrollProgress(60, 60), 1);
  assert.equal(imageScrollProgress(90, 60), 1);
  assert.equal(imageScrollProgress(90, 60, true), .5);
  assert.equal(imageScrollProgress(-5, 60), 0);
  assert.equal(imageScrollProgress(10, 0), 0);
});
