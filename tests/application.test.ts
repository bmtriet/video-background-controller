import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../server/index.js';

async function eventually(predicate: () => boolean, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > end) throw new Error('Timed out waiting for expected state'); await new Promise(r => setTimeout(r,50)); }
}
async function start(root: string) {
  const application = createApplication(root);
  await new Promise<void>(resolve => application.http.listen(0,'127.0.0.1',resolve));
  const address = application.http.address() as { port: number };
  return { application, url: `http://127.0.0.1:${address.port}` };
}
async function connect(url: string, role: string): Promise<Socket> {
  const socket = io(url,{ auth: { role }, transports: ['websocket'] });
  await new Promise<void>((resolve,reject) => { socket.once('sync', () => resolve()); socket.once('connect_error',reject); });
  return socket;
}
async function command(socket: Socket, name: string, payload?: unknown) {
  return new Promise<any>((resolve,reject) => socket.timeout(2000).emit(`controller:${name}`,payload,(error: Error | null,result: any) => error ? reject(error) : resolve(result)));
}

test('local application: watcher, CRUD, runtime, uploads, sockets, events and restart persistence', async () => {
  const root = mkdtempSync(path.join(tmpdir(),'event-player-test-'));
  mkdirSync(path.join(root,'dist/frontend'),{ recursive: true });
  writeFileSync(path.join(root,'dist/frontend/index.html'),'<html>Event Video Player</html>');
  let running = await start(root);
  const sockets: Socket[] = [];
  async function request(route: string, method = 'GET', body?: unknown) {
    const response = await fetch(running.url + '/api' + route, { method, headers: { 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json(); assert.ok(response.ok,JSON.stringify(json)); return json;
  }
  try {
    const { application } = running;
    assert.equal(application.store.events()[0].name,'My Event');
    assert.equal(application.runtime.state.status,'STOPPED');
    for (const route of ['/controller','/player']) assert.equal((await fetch(running.url+route)).status,200);
    assert.equal((await request('/playlist')).length,3);
    await application.scanner.ready;
    writeFileSync(path.join(root,'media/videos/video1.mp4'),Buffer.from('watcher test fixture, not playable video'));
    await eventually(() => application.store.media().some(m => m.filename === 'video1.mp4'));
    const video = application.store.media().find(m => m.filename === 'video1.mp4')!;
    writeFileSync(path.join(root,'media/images/image1.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>');
    writeFileSync(path.join(root,'media/images/image2.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>');
    await eventually(() => application.store.media().length === 3);
    const image1 = application.store.media().find(m => m.filename === 'image1.svg')!;
    const image2 = application.store.media().find(m => m.filename === 'image2.svg')!;
    const form = new FormData(); form.append('logo', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="green"/></svg>'],{ type: 'image/svg+xml' }),'abc.svg');
    const logoResponse = await fetch(running.url+'/api/logos/upload',{ method: 'POST',body: form });
    assert.equal(logoResponse.status,201); const logo = await logoResponse.json();
    assert.match(logo.relativePath,/^logos\/abc-[\w-]+\.svg$/);
    assert.equal((await fetch(running.url+'/media/'+logo.relativePath)).status,200);
    const item = await request('/playlist','POST',{ name: 'Opening',itemType:'FULL_VIDEO', mediaId: video.id,durationSeconds:20 });
    const ad = await request('/playlist','POST',{ name:'ABC',itemType:'ADVERTISEMENT',tier:'diamond',layout:'MEDIA_LOGO',mediaId:video.id,logoMediaId:logo.id });
    const dual = await request('/playlist','POST',{ name:'Gold dual',itemType:'ADVERTISEMENT',tier:'gold',layout:'DUAL_MEDIA_LOGO',mediaId:image1.id,secondaryMediaId:image2.id,logoMediaId:logo.id });
    assert.equal(ad.durationSeconds,60); assert.equal(dual.durationSeconds,45);
    const companyText = { enabled: true, text: 'Công ty ABC', color: '#ffffff', fontSize: 36, bold: true, strokeColor: '#000000', strokeWidth: 2 };
    await request(`/playlist/${ad.id}`, 'PUT', { logoTexts: { [logo.id]: companyText } });
    const defaultStyle = { color: '#ffcc88', fontSize: 28, bold: false, strokeColor: '#111111', strokeWidth: 1 };
    await request('/logo-text/default', 'PUT', defaultStyle);
    assert.deepEqual(await request('/logo-text/default'), defaultStyle);
    assert.equal((await request('/state')).capabilities.logoText, true);
    assert.deepEqual((await request('/state')).logoTextDefault, defaultStyle);
    const invalidTextStyle = await fetch(running.url + '/api/logo-text/default', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...defaultStyle, fontSize: 1000 }) });
    assert.equal(invalidTextStyle.status, 400);
    assert.deepEqual(await request('/logo-text/default'), defaultStyle);
    const ids = [dual.id,item.id,ad.id,...application.store.playlist().filter(i => ![dual.id,item.id,ad.id].includes(i.id)).map(i => i.id)];
    await request('/playlist/reorder','POST',{ ids }); assert.deepEqual(application.store.playlist().map(i => i.id),ids);
    const invalidOrder = await fetch(running.url+'/api/playlist/reorder',{ method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[item.id]}) }); assert.equal(invalidOrder.status,400);
    const controller = await connect(running.url,'controller'); const player = await connect(running.url,'player'); sockets.push(controller,player);
    assert.equal((await request('/state')).playerCount,1);
    assert.equal((await command(controller,'play',{ itemId: item.id })).ok,true);
    assert.equal(application.runtime.state.status,'PLAYING'); assert.equal(application.runtime.state.duration,20);
    await new Promise(r => setTimeout(r,150)); await command(controller,'pause');
    const paused = application.runtime.state.elapsed; await new Promise(r => setTimeout(r,150)); assert.equal(application.runtime.elapsed(),paused);
    await command(controller,'play'); assert.equal(application.runtime.state.status,'PLAYING');
    await command(controller,'seek',{ seconds:3 }); assert.ok(application.runtime.elapsed() >= 3);
    controller.disconnect(); await eventually(() => application.io.sockets.sockets.size === 1); assert.equal(application.runtime.state.status,'PLAYING');
    const reconnect = await connect(running.url,'controller'); sockets.push(reconnect); assert.equal((await request('/state')).state.currentItemId,item.id);
    await command(reconnect,'play',{itemId:ad.id});
    player.emit('player:ended',{itemId:ad.id,generation:application.runtime.state.generation-1});
    await new Promise(r=>setTimeout(r,80)); assert.equal(application.runtime.state.currentItemId,ad.id);
    await command(reconnect,'play',{ itemId:dual.id });
    await request(`/playlist/${dual.id}`,'PUT',{durationSeconds:.2});
    await eventually(() => application.runtime.state.currentItemId === item.id);
    await request(`/playlist/${dual.id}`,'PUT',{durationSeconds:45});
    await request('/settings','PUT',{advanceMode:'CONFIGURED_DURATION'});
    player.emit('player:ended',{itemId:item.id,generation:application.runtime.state.generation});
    await new Promise(r=>setTimeout(r,80)); assert.equal(application.runtime.state.currentItemId,item.id);
    await request('/settings','PUT',{advanceMode:'WHICHEVER_COMES_FIRST'});
    player.emit('player:ended',{itemId:item.id,generation:application.runtime.state.generation});
    await eventually(() => application.runtime.state.currentItemId === ad.id);
    await command(reconnect,'stop'); assert.equal(application.runtime.state.status,'STOPPED');
    assert.equal((await request('/state')).capabilities.playlistLoopRange, true);
    await request('/settings', 'PUT', { loopPlaylist: true, loopStartItemId: item.id, loopEndItemId: ad.id });
    const invalidRange = await fetch(running.url + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loopStartItemId: ad.id, loopEndItemId: item.id }) });
    assert.equal(invalidRange.status, 400);
    assert.equal((await command(reconnect, 'play', { itemId: dual.id })).ok, true);
    assert.equal(application.runtime.state.currentItemId, item.id);
    await command(reconnect, 'previous'); assert.equal(application.runtime.state.currentItemId, ad.id);
    await command(reconnect, 'next'); assert.equal(application.runtime.state.currentItemId, item.id);
    await command(reconnect, 'stop');
    await request('/settings', 'PUT', { loopPlaylist: false });
    const originalEvent = application.store.activeId();
    const copy = await request(`/events/${originalEvent}/duplicate`,'POST');
    await request(`/events/${copy.id}`,'PUT',{active:true}); assert.equal(application.store.playlist().length,6);
    await request(`/events/${copy.id}`,'PUT',{name:'Conference copy'});
    await request(`/events/${copy.id}`,'DELETE'); assert.equal(application.store.activeId(),originalEvent);
    assert.equal(application.runtime.state.status,'STOPPED'); assert.equal(application.runtime.state.duration,0);
    assert.ok(application.store.media().some(m => m.id === logo.id && m.exists));
    unlinkSync(path.join(root,'media/videos/video1.mp4'));
    await eventually(() => application.store.media().find(m => m.id === video.id)?.exists === false);
    assert.equal(application.store.playlist().find(i => i.id === item.id)?.mediaId,video.id);
    const missingResult = await command(reconnect,'play',{ itemId:item.id }); assert.match(missingResult.error,/missing/);
    writeFileSync(path.join(root,'media/videos/video1.mp4'),'restored');
    await eventually(() => application.store.media().find(m => m.id === video.id)?.exists === true);
    await command(reconnect,'select-item',{itemId:ad.id});
    for (const s of sockets) s.disconnect();
    await running.application.close(); running = await start(root);
    assert.equal(running.application.runtime.state.status,'STOPPED');
    assert.equal(running.application.runtime.state.currentItemId,ad.id);
    assert.equal(running.application.store.settings().loopStartItemId, item.id);
    assert.equal(running.application.store.settings().loopEndItemId, ad.id);
    assert.deepEqual(running.application.store.playlist().map(i => i.id),ids);
    assert.equal(running.application.store.playlist().find(i=>i.id===item.id)?.durationSeconds,20);
    assert.equal(running.application.store.playlist().find(i=>i.id===dual.id)?.secondaryMediaId,image2.id);
    assert.equal(running.application.store.playlist().find(i=>i.id===ad.id)?.logoMediaId,logo.id);
    assert.deepEqual(running.application.store.playlist().find(i=>i.id===ad.id)?.logoTexts?.[logo.id], companyText);
    assert.deepEqual(running.application.store.logoTextDefault(), defaultStyle);
    assert.equal((await fetch(running.url+'/api/playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Invalid',mediaId:'does-not-exist'})})).status,400);
    const malicious = new FormData(); malicious.append('logo',new Blob(['<svg><script>alert(1)</script></svg>']),'bad.svg');
    assert.equal((await fetch(running.url+'/api/logos/upload',{method:'POST',body:malicious})).status,400);
  } finally { for (const s of sockets) s.disconnect(); await running.application.close(); rmSync(root,{recursive:true,force:true}); }
});
