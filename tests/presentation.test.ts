import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.js';
import { Runtime } from '../server/runtime.js';
import { Presentation } from '../server/presentation.js';
import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createScanner } from '../server/scanner.js';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'presentation-live-'));
  mkdirSync(path.join(root, 'media/presentations'), { recursive: true });
  writeFileSync(path.join(root, 'media/presentations/deck.pptx'), 'fixture');
  const store = new Store(root);
  store.upsertMedia('deck.pptx', 'presentations/deck.pptx', 'presentation', 'presentations');
  store.upsertMedia('speaker.png', 'speaker.png', 'image', 'logos');
  store.upsertMedia('background.mp4', 'background.mp4', 'video', 'videos');
  const deck = store.media().find(m => m.mediaType === 'presentation')!, speaker = store.media().find(m => m.mediaType === 'image')!, bg = store.media().find(m => m.mediaType === 'video')!;
  const item = store.createItem({ itemType: 'PRESENTATION', name: 'Talk', mediaId: deck.id, speakerMediaId: speaker.id, backgroundMediaId: bg.id, enabled: true, backgroundMuted: false, durationSeconds: 2 });
  const next = store.createItem({ itemType: 'FULL_VIDEO', name: 'Next', mediaId: bg.id });
  const runtime = new Runtime(store, () => {}, error => { throw new Error(error); });
  return { root, store, runtime, item, next, deck, speaker, bg, close() { store.db.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('presentation holds indefinitely in every advance mode, ignores end messages and advances only manually', () => {
  const f = setup();
  try {
    assert.equal(f.item.muted, true); assert.equal(f.item.backgroundMuted, true); assert.equal(f.item.backgroundLoop, true);
    for (const advanceMode of ['VIDEO_END', 'CONFIGURED_DURATION', 'WHICHEVER_COMES_FIRST'] as const) {
      f.store.updateSettings({ advanceMode }); f.runtime.play(f.item.id);
      f.runtime.state.elapsed = 90000; f.runtime.tick();
      f.runtime.ended(f.item.id, f.runtime.state.generation);
      assert.equal(f.runtime.state.currentItemId, f.item.id); assert.equal(f.runtime.state.duration, 0);
      f.runtime.pause(); f.runtime.play(); assert.equal(f.runtime.state.currentItemId, f.item.id);
      assert.throws(() => f.runtime.seek(0));
    }
    f.runtime.step(1); assert.equal(f.runtime.state.currentItemId, f.next.id);
  } finally { f.close(); }
});
test('presentation validates sources, persists and duplicates without a fixed duration', () => {
  const f = setup();
  try {
    assert.throws(() => f.store.updateItem(f.item.id, { mediaId: f.bg.id }));
    assert.throws(() => f.store.updateItem(f.item.id, { speakerMediaId: f.deck.id }));
    assert.throws(() => f.store.updateItem(f.item.id, { backgroundMediaId: f.speaker.id }));
    assert.throws(() => f.store.updateItem(f.item.id, { presentationMode: 'invalid' as any }));
    assert.equal(f.store.updateItem(f.item.id, { presentationMode: 'capture' }).presentationMode, 'capture');
    assert.throws(() => f.store.updateItem(f.item.id, { presentationRatio: 'square' as any }));
    assert.throws(() => f.store.updateItem(f.item.id, { presentationTitleBar: 200 }));
    assert.throws(() => f.store.createItem({ itemType: 'ADVERTISEMENT', mediaId: f.deck.id }));
    const draft = f.store.createItem({ itemType: 'PRESENTATION' }); assert.equal(draft.enabled, false);
    const copy = f.store.duplicateEvent(f.store.activeId());
    assert.equal(f.store.playlist(copy.id).find(i => i.name === 'Talk')?.speakerMediaId, f.speaker.id);
    const reopened = new Store(f.root);
    assert.equal(reopened.playlist().find(i => i.id === f.item.id)?.itemType, 'PRESENTATION'); reopened.db.close();
  } finally { f.close(); }
});
test('scanner discovers PPTX without classifying it as an image', async () => {
  const f = setup(), scanner = createScanner(f.root, f.store, () => {});
  try { assert.equal(f.store.media().find(m => m.relativePath === 'presentations/deck.pptx')?.mediaType, 'presentation'); }
  finally { await scanner.watcher.close(); f.close(); }
});
test('native session closes only its copy on a transition and rejects stale controller actions', { skip: process.platform !== 'darwin' }, async () => {
  const f = setup();
  const calls: string[][] = [];
  const runner = (async (program: string, args: string[]) => {
    if (program.endsWith('unzip')) return { stdout: '<p:sldId id="1"/><p:sldId id="2"/><p:sldSz cx="12192000" cy="6858000"/>', stderr: '' };
    if (program.endsWith('presentation-window')) { calls.push(args); return { stdout: args[0] === 'end' ? 'closed' : '20|200|1020|795|1|2|false', stderr: '' }; }
    return { stdout: '', stderr: '' };
  }) as any;
  const live = new Presentation(f.root, f.store, f.runtime, () => {}, runner);
  try {
    f.runtime.play(f.item.id);
    const generation = f.runtime.state.generation;
    live.slot = { itemId: f.item.id, generation, rect: { x:20, y:200, width:1400, height:800 }, viewport: { x:0, y:0, width:1920, height:1080 }, at:Date.now(), expanded:false };
    await live.action('open');
    assert.notEqual(live.owned!.file, path.join(f.root, 'media/presentations/deck.pptx'));
    assert.equal(live.native?.slide, 1);
    f.runtime.step(1);
    assert.throws(() => live.requireSession({ itemId:f.item.id, generation }));
    await live.action('cleanup');
    assert.equal(calls.at(-1)![0], 'end'); assert.equal(calls[0][1], calls.at(-1)![1]);
    assert.equal(live.native, null); assert.equal(live.owned, null);
  } finally { await live.close(); f.close(); }
});

test('presentation HTTP rejects missing keys and stale sessions, and validates PPTX uploads', async () => {
  const f = setup();
  const live = new Presentation(f.root, f.store, f.runtime, () => {});
  const app = express(); app.use(express.json());
  app.use('/api/presentation', live.router(relative => f.store.upsertMedia(path.basename(relative), relative, 'presentation', 'presentations')));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({error:error.message}));
  const http = createServer(app); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as {port:number}).port}/api/presentation`;
  try {
    f.runtime.play(f.item.id);
    const generation = f.runtime.state.generation;
    assert.equal((await fetch(url+'/finish', {method:'POST'})).status, 403);
    const post = (route: string, body: unknown) => fetch(url+route, {method:'POST',headers:{'Content-Type':'application/json','x-presentation-key':live.token},body:JSON.stringify(body)});
    assert.equal((await post('/finish',{itemId:f.item.id,generation:generation-1})).status,400);
    assert.equal(f.runtime.state.currentItemId,f.item.id);
    assert.equal((await post('/stage',{itemId:f.item.id,generation,expanded:false,playerId:'a',rect:{x:0,y:0,width:0,height:800},viewport:{x:0,y:0,width:1920,height:1080}})).status,400);
    const bad = new FormData(); bad.append('file',new Blob(['invalid']), 'fake.pptx');
    assert.equal((await fetch(url+'/upload',{method:'POST',headers:{'x-presentation-key':live.token},body:bad})).status,400);
    mkdirSync(path.join(f.root, 'fixture/ppt'), {recursive:true});
    writeFileSync(path.join(f.root, 'fixture/ppt/presentation.xml'), '<p:sldId id="1"/><p:sldSz cx="9144000" cy="6858000"/>');
    execFileSync('/usr/bin/zip', ['-q', path.join(f.root, 'fixture.pptx'), 'ppt/presentation.xml'], {cwd:path.join(f.root, 'fixture')});
    const good = new FormData(); good.append('file',new Blob([readFileSync(path.join(f.root, 'fixture.pptx'))]), 'valid.pptx');
    assert.equal((await fetch(url+'/upload',{method:'POST',headers:{'x-presentation-key':live.token},body:good})).status,201);
    assert.equal((await post('/cleanup',{itemId:f.item.id,generation})).status,400);
    assert.equal((await post('/finish',{itemId:f.item.id,generation})).status,200);
    assert.equal(f.runtime.state.currentItemId,f.next.id);
  } finally { await live.close(); await new Promise<void>(resolve => http.close(() => resolve())); f.close(); }
});

test('capture controls send background keys and resize only Player when expanded', {skip:process.platform !== 'darwin'}, async () => {
  const f = setup(), calls: string[][] = [];
  const runner = (async (program: string, args: string[]) => {
    if (program.endsWith('unzip')) return {stdout:'<p:sldId id="1"/><p:sldId id="2"/><p:sldSz cx="12192000" cy="6858000"/>',stderr:''};
    if (program.endsWith('presentation-window')) {calls.push(args);return {stdout:args[0] === 'end' ? 'closed' : '20|200|1020|795|1|2|false',stderr:''};}
    return {stdout:'',stderr:''};
  }) as any;
  const live = new Presentation(f.root, f.store, f.runtime, () => {}, runner);
  try {
    f.runtime.play(f.item.id);
    const generation = f.runtime.state.generation;
    live.slot = {itemId:f.item.id,generation,rect:{x:20,y:200,width:1400,height:800},viewport:{x:0,y:0,width:1920,height:1080},at:Date.now(),expanded:false};
    await live.action('open');
    const source = live.owned!.file;
    await live.action('next'); await live.action('previous');
    assert.equal(calls.at(-2)![0],'capture-next'); assert.equal(calls.at(-1)![0],'capture-previous');
    assert.equal(calls.at(-1)![1],source);
    const count = calls.length;
    await live.action('expand'); assert.equal(live.expanded,true); assert.equal(calls.length,count);
    await live.action('expand'); assert.equal(live.expanded,false); assert.equal(calls.length,count);
    live.reporter = {id:'player',generation,at:Date.now(),capturing:true};
    assert.equal(live.snapshot().captureActive,true);
    await live.action('capture-stop'); assert.equal(live.snapshot().captureActive,false); assert.equal(live.captureStopVersion,1);
    f.runtime.step(1); assert.equal(live.snapshot().captureActive,false);
    assert.throws(() => live.requireSession({itemId:f.item.id,generation}));
    await live.action('cleanup'); assert.equal(calls.at(-1)![0],'end'); assert.equal(calls.at(-1)![1],source);
  } finally {await live.close(); f.close();}
});
