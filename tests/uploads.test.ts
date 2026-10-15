import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../server/index.js';

test('direct ad uploads register media, preserve distinct files, reject invalid content and clean temporary files', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'event-upload-test-'));
  const application = createApplication(root);
  try {
    await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(application.http.address() as AddressInfo).port}`;
    const upload = async (category: string, name: string, data: Buffer) => {
      const form = new FormData(); form.append('file', new Blob([new Uint8Array(data)]), name);
      const response = await fetch(`${url}/api/media/upload/${category}`, { method: 'POST', body: form });
      return { status: response.status, body: await response.json() };
    };
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6r0QAAAAASUVORK5CYII=', 'base64');
    // A container header exercises upload validation, not browser decoding.
    const video = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isommp42')]);
    const first = await upload('ads', 'presentation.MP4', video);
    const second = await upload('ads', 'presentation.MP4', video);
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    assert.notEqual(first.body.id, second.body.id);
    assert.notEqual(first.body.relativePath, second.body.relativePath);
    assert.equal(first.body.mediaType, 'video');
    assert.match(first.body.relativePath, /^ads\/presentation-[\w-]+\.mp4$/);
    const picture = await upload('ads', 'slide.png', image);
    const logo = await upload('logos', 'sponsor.png', image);
    const background = await upload('backgrounds', 'backdrop.mp4', video);
    assert.equal(picture.status, 201); assert.equal(picture.body.mediaType, 'image');
    assert.equal(logo.status, 201); assert.equal(logo.body.category, 'logos');
    assert.equal(background.status, 201); assert.equal(background.body.category, 'backgrounds');
    assert.deepEqual(Buffer.from(await (await fetch(`${url}/media/${first.body.relativePath}`)).arrayBuffer()), video);
    const ad = application.store.createItem({ name: 'Uploaded ad', itemType: 'ADVERTISEMENT', mediaId: first.body.id, logoMediaIds: [logo.body.id], backgroundMediaId: background.body.id });
    application.runtime.play(ad.id);
    assert.equal(application.runtime.state.currentItemId, ad.id);
    assert.equal(ad.backgroundMuted, true); assert.equal(ad.backgroundLoop, true);
    application.runtime.stop();
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.equal(state.capabilities.mediaUpload, true);
    assert.equal(state.media.length, 5);
    assert.equal((await upload('logos', 'video.mp4', video)).status, 400);
    assert.equal((await upload('ads', 'renamed.mp4', Buffer.from('not a video'))).status, 400);
    assert.equal((await upload('backgrounds', 'script.svg', Buffer.from('<svg><script>alert(1)</script></svg>'))).status, 400);
    assert.equal((await upload('ads', 'program.html', Buffer.from('<html/>'))).status, 400);
    assert.equal((await upload('invalid', 'slide.png', image)).status, 400);
    assert.equal((await upload('ads', 'empty.png', Buffer.alloc(0))).status, 400);
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1); image.copy(oversized);
    assert.equal((await upload('ads', 'large.png', oversized)).status, 413);
    assert.equal(application.store.media().length, 5);
    assert.deepEqual(readdirSync(path.join(root, 'data/uploads')), []);
    assert.equal(readdirSync(path.join(root, 'media/ads')).length, 3);
    assert.equal(readdirSync(path.join(root, 'media/logos')).length, 1);
    assert.equal(readdirSync(path.join(root, 'media/backgrounds')).length, 1);
  } finally {
    await application.close();
    rmSync(root, { recursive: true, force: true });
  }
});
