import { test } from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../server/index';
import { mediaSourceUrl } from '../shared/mediaSource';

test('ID-based content URLs serve large posters, logos and video ranges without exposing storage categories', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'media-content-test-'));
  const application = createApplication(root);
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await application.scanner.ready;
    const poster = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=', 'base64'), Buffer.alloc(2 * 1024 * 1024)]);
    const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>');
    const video = Buffer.alloc(128, 1);
    const fixtures = [{ relative: 'ads/poster space.png', type: 'image/png', bytes: poster }, { relative: 'logos/company.svg', type: 'image/svg+xml', bytes: logo }, { relative: 'videos/clip.mp4', type: 'video/mp4', bytes: video }];
    for (const fixture of fixtures) writeFileSync(path.join(root, 'media', fixture.relative), fixture.bytes);
    application.scanner.scan();
    const snapshot = await (await fetch(url + '/api/state')).json();
    assert.equal(snapshot.capabilities.mediaContent, true);
    assert.equal(snapshot.capabilities.imageLogoColumns, true);
    for (const fixture of fixtures) {
      const media = application.store.media().find(file => file.relativePath === fixture.relative)!;
      const source = mediaSourceUrl(media, true);
      assert.match(source, /^\/content\/[^/]+$/);
      assert.ok(!source.includes('/ads/'));
      assert.ok(!source.includes(media.filename));
      const response = await fetch(url + source);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type')?.startsWith(fixture.type));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture.bytes);
      const legacy = await fetch(url + mediaSourceUrl(media, false));
      assert.equal(legacy.status, 200);
      assert.deepEqual(Buffer.from(await legacy.arrayBuffer()), fixture.bytes);
      if (fixture.type === 'video/mp4') {
        const range = await fetch(url + source, { headers: { Range: 'bytes=4-15' } });
        assert.equal(range.status, 206);
        assert.equal(range.headers.get('content-range'), 'bytes 4-15/128');
        assert.deepEqual(Buffer.from(await range.arrayBuffer()), video.subarray(4, 16));
      }
    }
    assert.equal((await fetch(url + '/content/unknown')).status, 404);
    const registered = application.store.media()[0];
    unlinkSync(path.join(root, 'media', registered.relativePath));
    application.store.markMissing(registered.relativePath);
    assert.equal((await fetch(url + mediaSourceUrl(registered, true))).status, 404);
    const outside = path.join(root, 'outside.png'); writeFileSync(outside, poster);
    symlinkSync(outside, path.join(root, 'media/ads/outside.png'));
    application.store.upsertMedia('outside.png', 'ads/outside.png', 'image', 'ads');
    const linked = application.store.media().find(file => file.relativePath === 'ads/outside.png')!;
    assert.equal((await fetch(url + mediaSourceUrl(linked, true))).status, 403);
  } finally { await application.close(); rmSync(root, { recursive: true, force: true }); }
});

test('cancelling an active media transfer does not write a second response or disrupt later requests', { timeout: 10000 }, async context => {
  const root = mkdtempSync(path.join(tmpdir(), 'media-cancel-test-'));
  const application = createApplication(root);
  const errors: unknown[][] = [];
  context.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await application.scanner.ready;
    writeFileSync(path.join(root, 'media/videos/large.mp4'), Buffer.alloc(16 * 1024 * 1024, 1));
    application.scanner.scan();
    const media = application.store.media().find(file => file.relativePath === 'videos/large.mp4')!;
    for (const source of [mediaSourceUrl(media, true), mediaSourceUrl(media, false)]) {
      const closed = new Promise<void>(resolve => {
        application.http.once('request', (_req, res) => {
          res.once('close', () => { setImmediate(() => setImmediate(resolve)); });
        });
      });
      await new Promise<void>((resolve, reject) => {
        const request = get(url + source, response => {
          assert.equal(response.statusCode, 200);
          response.once('data', () => { response.destroy(); request.destroy(); resolve(); });
          response.once('error', reject);
        });
        request.once('error', reject);
      });
      await closed;
      assert.equal((await fetch(url + '/api/health')).status, 200);
      const range = await fetch(url + source, { headers: { Range: 'bytes=0-15' } });
      assert.equal(range.status, 206);
      assert.equal((await range.arrayBuffer()).byteLength, 16);
    }
    assert.deepEqual(errors, [], 'Expected cancellations must not produce server errors');
    const invalid = await fetch(url + '/api/playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationSeconds: -1 }) });
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).error, 'Real validation errors must still return JSON');
  } finally { await application.close(); rmSync(root, { recursive: true, force: true }); }
});
