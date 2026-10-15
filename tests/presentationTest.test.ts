import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { presentationWindow } from '../shared/presentationTest.js';
import { createPresentationTest, parseDeckXml, parseNativeResult } from '../server/presentationTest.js';

test('16:9 and 4:3 fit the reserved slot, including title bar and negative monitor coordinates', () => {
  const slot = { x: -1900, y: 220, width: 1400, height: 840 };
  const wide = presentationWindow(slot, 16 / 9, 28);
  const standard = presentationWindow(slot, 4 / 3, 28);
  for (const [bounds, ratio] of [[wide, 16 / 9], [standard, 4 / 3]] as const) {
    assert.ok(bounds.x >= slot.x && bounds.y >= slot.y);
    assert.ok(bounds.x + bounds.width <= slot.x + slot.width);
    assert.ok(bounds.y + bounds.height <= slot.y + slot.height);
    assert.ok(Math.abs(bounds.width / (bounds.height - 28) - ratio) < .005);
  }
  assert.equal(wide.width, 1400);
  assert.equal(standard.height, 840);
  assert.throws(() => presentationWindow({ ...slot, height: 20 }, 4 / 3, 28));
});
test('read actual PPTX aspect ratio and reject invalid presentation metadata', () => {
  assert.deepEqual(parseDeckXml('<p:presentation><p:sldIdLst><p:sldId id="1"/><p:sldId id="2"/></p:sldIdLst><p:sldSz cy="6858000" cx="12192000"/></p:presentation>'), { ratio: 16 / 9, slides: 2 });
  assert.equal(parseDeckXml('<p:sldId id="1"/><p:sldSz cx="9144000" cy="6858000"/>').ratio, 4 / 3);
  assert.throws(() => parseDeckXml('<p:sldSz cx="1" cy="0"/>'));
  assert.throws(() => parseDeckXml('<p:sldSz cx="10" cy="10"/>'));
});
test('native window result preserves logical screen bounds and validates slide position', () => {
  assert.deepEqual(parseNativeResult('-1200|240|-200|1018|2|8|false'), { bounds: { x: -1200, y: 240, width: 1000, height: 778 }, slide: 2, slides: 8, fullScreen: false });
  assert.throws(() => parseNativeResult('1|2|3|4|9|8|false'));
});
test('presentation sandbox rejects cross-origin/native injection, validates uploads and stale stage layout', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'presentation-test-'));
  mkdirSync(path.join(root, 'media'));
  const calls: string[][] = [];
  const runner = (async (_program: string, args: string[]) => {
    calls.push(args);
    return { stdout: '<p:sldId id="1"/><p:sldSz cx="12192000" cy="6858000"/>', stderr: '' };
  }) as any;
  const server = createPresentationTest(root, 3001, runner).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const state = await (await fetch(url + '/api/presentation-test/state')).json();
    const headers = { 'Content-Type': 'application/json', 'x-presentation-test-key': state.token };
    const rejected = await fetch(url + '/api/presentation-test/native/open', { method: 'POST', body: '{}', headers: { ...headers, Origin: 'https://example.com' } });
    assert.equal(rejected.status, 403); assert.equal(calls.length, 0);
    assert.equal((await fetch(url + '/api/presentation-test/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/presentation-test/config', { method: 'PUT', headers, body: JSON.stringify({ ratio: '1:1' }) })).status, 400);
    const form = new FormData(); form.append('file', new Blob(['fixture']), 'Test.pptx');
    const uploaded = await (await fetch(url + '/api/presentation-test/upload/deck', { method: 'POST', headers: { 'x-presentation-test-key': state.token }, body: form })).json();
    assert.equal(uploaded.decks[0].ratio, 16 / 9);
    assert.equal(calls[0][0], '-p'); assert.equal(calls[0][2], 'ppt/presentation.xml');
    const malicious = new FormData(); malicious.append('file', new Blob(['x']), 'Test.pptm');
    assert.equal((await fetch(url + '/api/presentation-test/upload/deck', { method: 'POST', headers: { 'x-presentation-test-key': state.token }, body: malicious })).status, 400);
    const rect = { x: 20, y: 200, width: 1400, height: 840 };
    assert.equal((await fetch(url + '/api/presentation-test/stage', { method: 'POST', headers, body: JSON.stringify({ expanded: false, slot: rect, viewport: rect }) })).status, 200);
    await fetch(url + '/api/presentation-test/config', { method: 'PUT', headers, body: JSON.stringify({ expanded: true }) });
    assert.equal((await fetch(url + '/api/presentation-test/stage', { method: 'POST', headers, body: JSON.stringify({ expanded: false, slot: rect, viewport: rect }) })).status, 400);
    const after = await (await fetch(url + '/api/presentation-test/state')).json();
    assert.equal(after.stage, null); assert.equal(after.config.expanded, true);
    assert.equal((await fetch(url + '/api/presentation-test/native/eval', { method: 'POST', headers, body: '{}' })).status, 400);
    assert.equal(calls.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

test('native actions target only the uploaded copy and release it after Reading View closes', { skip: process.platform !== 'darwin' }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'presentation-native-'));
  mkdirSync(path.join(root, 'media'));
  let closed = false;
  const calls: { program: string; args: string[] }[] = [];
  const runner = (async (program: string, args: string[]) => {
    calls.push({ program, args });
    return { stdout: program.endsWith('presentation-window') ? closed ? 'closed' : '20|200|1020|790|2|3|false' : '<p:sldId id="1"/><p:sldId id="2"/><p:sldId id="3"/><p:sldSz cx="12192000" cy="6858000"/>', stderr: '' };
  }) as any;
  const server = createPresentationTest(root, 3001, runner).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/presentation-test`;
  try {
    const state = await (await fetch(url + '/state')).json();
    const headers = { 'Content-Type': 'application/json', 'x-presentation-test-key': state.token };
    const form = new FormData(); form.append('file', new Blob(['fixture']), 'Bài thử.pptx');
    const uploaded = await (await fetch(url + '/upload/deck', { method: 'POST', headers: { 'x-presentation-test-key': state.token }, body: form })).json();
    await fetch(url + '/config', { method: 'PUT', headers, body: JSON.stringify({ deckId: uploaded.id }) });
    const slot = { x: 20, y: 200, width: 1400, height: 800 };
    await fetch(url + '/stage', { method: 'POST', headers, body: JSON.stringify({ slot, viewport: slot, expanded: false }) });
    const opened = await (await fetch(url + '/native/open', { method: 'POST', headers, body: '{}' })).json();
    assert.equal(opened.native.slide, 2);
    const call = calls.at(-1)!;
    assert.equal(call.program, path.join(root, '.local/presentation-window'));
    assert.equal(call.args[1], path.join(root, 'data/presentation-test/files', uploaded.id + '.pptx'));
    assert.equal(call.args[2], uploaded.id + '.pptx');
    assert.equal(call.args[3], '3');
    assert.equal((await fetch(url + '/config', { method: 'PUT', headers, body: JSON.stringify({ deckId: null }) })).status, 400);
    const background = await fetch(url + '/native/capture-next', { method: 'POST', headers, body: '{}' });
    assert.equal(background.status, 200);
    assert.equal(calls.at(-1)!.args[0], 'capture-next');
    assert.equal(calls.at(-1)!.args[1], call.args[1]);
    closed = true;
    const ended = await (await fetch(url + '/native/status', { method: 'POST', headers, body: '{}' })).json();
    assert.equal(ended.native, null); assert.equal(ended.busy, false);
    assert.equal((await fetch(url + '/config', { method: 'PUT', headers, body: JSON.stringify({ deckId: null }) })).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
