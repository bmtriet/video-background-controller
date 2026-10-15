import { useEffect, useRef, useState } from 'react';
import type { PresentationTestSnapshot } from '../../shared/presentationTest';

export function PresentationCaptureTest() {
  const [data, setData] = useState<PresentationTestSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [frames, setFrames] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const keyBusy = useRef(false);
  useEffect(() => {
    let alive = true;
    void fetch('/api/presentation-test/state').then(r => r.json()).then(value => { if (alive) setData(value); }).catch(e => setError(e.message));
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    const timer = setInterval(() => setFrames(video.current?.getVideoPlaybackQuality().totalVideoFrames ?? 0), 500);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('fullscreenchange', changed); stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);
  async function request(route: string, body: unknown, method = 'POST') {
    if (!data) throw new Error('Chờ server kết nối.');
    const response = await fetch('/api/presentation-test' + route, {method, headers:{'Content-Type':'application/json','x-presentation-test-key':data.token}, body:JSON.stringify(body)});
    const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
  }
  async function native(action: string) {
    if (keyBusy.current) return;
    keyBusy.current = true; setBusy(true); setError('');
    try {
      if (action === 'open') {
        const rect = {x:window.screenX + 80,y:window.screenY + 120,width:1000,height:650};
        await request('/stage', {slot:rect,viewport:rect,expanded:data?.config.expanded ?? false});
      }
      setData(await request('/native/' + action, {}));
    } catch (e) { setError((e as Error).message); }
    finally { keyBusy.current = false; setBusy(false); }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!capturing || (e.target as HTMLElement).closest('input,select,textarea')) return;
      if (['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(e.key)) {
        e.preventDefault(); void native(e.key === 'ArrowRight' || e.key === 'PageDown' ? 'capture-next' : 'capture-previous');
      }
    };
    window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key);
  }, [capturing, data]);
  function stopCapture() {
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCapturing(false); setFrames(0);
  }
  async function capture() {
    setError('');
    try {
      // Must run directly from the button gesture. Chrome owns source selection
      // and permission; no persistence, auto-grant, recording or transmission.
      const next = await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'window',frameRate:{ideal:30,max:30}},audio:false});
      if (next.getVideoTracks()[0]?.getSettings().displaySurface === 'browser' || next.getVideoTracks()[0]?.getSettings().displaySurface === 'monitor') {
        next.getTracks().forEach(t => t.stop()); throw new Error('Chọn riêng cửa sổ Reading View, không chọn màn hình hoặc tab Chrome.');
      }
      stopCapture(); stream.current = next;
      next.getVideoTracks()[0].addEventListener('ended', () => { if (stream.current === next) stopCapture(); }, {once:true});
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      setCapturing(true);
    } catch (e) { stopCapture(); setError((e as Error).name === 'NotAllowedError' ? 'Capture chưa được cấp quyền hoặc đã hủy. Chọn cửa sổ PowerPoint khi sẵn sàng.' : (e as Error).message); }
  }
  const background = data?.media.find(m => m.id === data.config.backgroundId);
  const speaker = data?.media.find(m => m.id === data.config.speakerId);
  return <div ref={host} className="capture-test-page">
    <div className="capture-test-toolbar">
      <strong>Thử capture PowerPoint</strong>
      <select aria-label="Bài thử capture" value={data?.config.deckId || ''} disabled={busy || capturing || !!data?.native} onChange={e => { void request('/config',{deckId:e.target.value},'PUT').then(setData).catch(e => setError(e.message)); }}>
        <option value="">Chọn bài thử…</option>{data?.decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <button disabled={!data?.config.deckId || busy} onClick={() => void native('open')}>Mở Reading View thử</button>
      <button disabled={!data?.native || capturing} onClick={() => void capture()}>Capture PowerPoint</button>
      <button disabled={!capturing} onClick={stopCapture}>Dừng capture</button>
      <button disabled={!capturing} onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu về ¾–¼' : 'Phóng slide'}</button>
      <button disabled={!capturing} onClick={() => { void (async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await host.current?.requestFullscreen(); })().catch(e => setError(e.message)); }}>{fullscreen ? 'Thoát fullscreen' : 'Fullscreen Player'}</button>
      <button disabled={!data?.native || busy} onClick={() => void native('capture-previous')}>← Slide trước</button>
      <button disabled={!data?.native || busy} onClick={() => void native('capture-next')}>Slide sau →</button>
      <button disabled={!data?.native || busy} onClick={() => { stopCapture(); void native('end'); }}>Kết thúc bài thử</button>
      <span role="status">{capturing ? `Đang capture · ${frames} khung hình` : 'Chưa capture'} · Slide {data?.native?.slide ?? '—'}/{data?.native?.slides ?? '—'}</span>
      {error && <span role="alert">{error}</span>}
    </div>
    <div className={`composition capture-test-stage ${expanded ? 'capture-test-expanded' : ''}`}>
      {background?.kind === 'video' && <video className="presentation-background" src={background.url} autoPlay muted loop playsInline/>}
      {!expanded && <><div className="conference-header"><img src="/branding/conference-header-spaced.png" alt="Hội nghị Khoa học Kỹ thuật lần XI"/></div><aside className="presentation-speaker">{speaker && <img src={speaker.url} alt="Diễn giả"/>}</aside></>}
      <div className="presentation-slide-slot capture-video-slot"><video ref={video} autoPlay muted playsInline/>{!capturing && <div className="presentation-slot-placeholder"><strong>Chọn Capture PowerPoint → cửa sổ Reading View của bài thử</strong><span>Chỉ xem trực tiếp tại máy, không ghi file hoặc gửi ra mạng. Giữ PowerPoint mở, không thu nhỏ.</span></div>}</div>
    </div>
    <p className="capture-test-note">Bản thử độc lập với playlist. Pointer/phím ← → hoặc Page Up/Down trên trang này gửi phím nền tới bản sao PowerPoint đã chọn; cần kiểm tra trên máy thực. Capture bao gồm viền cửa sổ; chưa cắt viền.</p>
  </div>;
}
