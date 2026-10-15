import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, Focus, Presentation as PresentationIcon, Upload } from 'lucide-react';
import type { Media, PlaylistItem, RuntimeState } from '../../shared/types';
import type { NativePresentation } from '../../shared/presentationTest';
import { api, mediaUrl, notify } from './services';
import { createPresentationLayout, downloadPresentationLayout } from './presentationLayout';

interface NativeState { token: string; available: boolean; itemId: string | null; generation: number; busy: boolean; error: string | null; expanded: boolean; native: NativePresentation | null; connected: boolean; ownedItemId: string | null; ownedGeneration: number | null; mode: 'capture' | 'window'; captureActive: boolean; captureStopVersion: number; captureWindowTitle: string | null; }
function usePresentation(enabled: boolean) {
  const [status, setStatus] = useState<NativeState | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = async () => { try { const response = await fetch('/api/presentation/state'); if (response.ok) { const value = await response.json(); if (alive) setStatus(value); } } catch {} };
    void read(); const timer = setInterval(read, 700);
    return () => { alive = false; clearInterval(timer); };
  }, [enabled]);
  return { status, setStatus };
}
async function nativeRequest(route: string, token: string, body: unknown = {}) {
  const response = await fetch('/api/presentation' + route, { method: 'POST', headers: { 'x-presentation-key': token, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
export function PresentationRecovery({ enabled }: { enabled: boolean }) {
  const { status, setStatus } = usePresentation(enabled);
  if (!status?.error || !status.ownedItemId || (status.ownedItemId === status.itemId && status.ownedGeneration === status.generation)) return null;
  return <div className="notice" role="alert"><span>PowerPoint chưa đóng: {status.error}</span><button disabled={status.busy} onClick={() => { void nativeRequest('/cleanup', status.token, { itemId: status.ownedItemId, generation: status.ownedGeneration }).then(setStatus).catch(error => notify(error.message)); }}>Thử đóng bài đã kết thúc</button></div>;
}
export function PresentationControls({ item }: { item: PlaylistItem }) {
  const { status, setStatus } = usePresentation(true);
  const [working, setWorking] = useState(false);
  const active = status?.itemId === item.id;
  const captureMode = item.presentationMode !== 'window';
  async function action(name: string) {
    if (!status || working) return;
    setWorking(true);
    try { setStatus(await nativeRequest(name === 'finish' ? '/finish' : '/action/' + name, status.token, { itemId: item.id, generation: status.generation })); }
    catch (error) { notify((error as Error).message); }
    finally { setWorking(false); }
  }
  return <div className="presentation-live-controls">
    <strong><PresentationIcon size={16}/> Điều khiển thuyết trình</strong>
    <p>{!active ? 'Phát mục này để mở PowerPoint trên Player.' : status?.error || (status?.busy || working ? 'Đang điều chỉnh PowerPoint…' : status?.native ? captureMode ? `PowerPoint đã mở · ${status.captureActive ? 'đang capture' : 'chọn Capture PowerPoint trên Player'}` : `Slide ${status.native.slide}/${status.native.slides} · chờ kết thúc thủ công` : 'Chờ Player kết nối hoặc bấm Mở / căn slide.')}</p>
    <fieldset disabled={!active || !status?.available || status.busy || working}>
      <button onClick={() => void action('open')}>{captureMode ? 'Mở PowerPoint' : 'Mở / căn slide'}</button>
      <button disabled={!status?.native} onClick={() => void action('expand')}><Expand size={14}/>{status?.expanded ? 'Thu về ¾–¼' : 'Phóng slide'}</button>
      {!captureMode && <button disabled={!status?.native} onClick={() => void action('focus')}><Focus size={14}/> Trả pointer</button>}
      {captureMode && <button disabled={!status?.captureActive} onClick={() => void action('capture-stop')}>Dừng capture</button>}
      <button disabled={!status?.native} onClick={() => void action('previous')}><ArrowLeft size={14}/> Trước</button>
      <button disabled={!status?.native} onClick={() => void action('next')}>Sau <ArrowRight size={14}/></button>
      <button onClick={() => void action('status')}>Đọc trạng thái</button>
      <button className="primary" onClick={() => void action('finish')}>Kết thúc & tiếp tục</button>
    </fieldset>
    <small>{captureMode ? 'Bấm Capture PowerPoint trên Player và chọn cửa sổ Reading View. Sau đó fullscreen Player. Bấm vào Player để nhận phím pointer; giữ PowerPoint mở, không thu nhỏ.' : 'Player và PowerPoint cùng Desktop. Giữ Chrome ở cửa sổ thường, zoom 100%. Pointer điều khiển trực tiếp PowerPoint.'}</small>
  </div>;
}
export function PresentationProperties({ item, media, onChange, actions }: { item: PlaylistItem; media: Media[]; onChange: (patch: Partial<PlaylistItem>) => void; actions: React.ReactNode }) {
  const { status } = usePresentation(true);
  const [exporting, setExporting] = useState(false);
  const [screens, setScreens] = useState<{ id: string; name: string; width: number; height: number; canRestore: boolean }[]>([]);
  const [screenId, setScreenId] = useState('');
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperMessage, setWallpaperMessage] = useState('');
  async function wallpaperRequest(route: string, body?: FormData) {
    if (!status) throw new Error('Chờ server kết nối.');
    const response = await fetch('/api/wallpaper' + route, { method: body ? 'POST' : 'GET', headers: { 'x-presentation-key': status.token }, body });
    const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
  }
  async function loadScreens() {
    setWallpaperBusy(true);
    try { const values = await wallpaperRequest('/screens'); setScreens(values); setScreenId(current => values.some((s: { id: string }) => s.id === current) ? current : values.length === 1 ? values[0].id : ''); }
    catch (error) { notify((error as Error).message); }
    finally { setWallpaperBusy(false); }
  }
  async function setWallpaper(action: 'set' | 'restore') {
    const screen = screens.find(s => s.id === screenId); if (!screen) return;
    setWallpaperBusy(true); setWallpaperMessage('');
    try {
      const body = new FormData();
      if (action === 'set') body.append('file', await createPresentationLayout(item, media, screen.width, screen.height), 'layout.png');
      await wallpaperRequest(`/${screen.id}/${action}`, body);
      setScreens(current => current.map(s => s.id === screen.id ? { ...s, canRestore: action === 'set' } : s));
      setWallpaperMessage(action === 'set' ? `Đã đặt layout làm wallpaper: ${screen.name}.` : `Đã khôi phục wallpaper: ${screen.name}.`);
    } catch (error) { notify((error as Error).message); }
    finally { setWallpaperBusy(false); }
  }
  const [uploading, setUploading] = useState(false);
  const deckInput = useRef<HTMLInputElement>(null), speakerInput = useRef<HTMLInputElement>(null);
  async function upload(file: File, kind: 'deck' | 'speaker') {
    setUploading(true);
    try {
      const body = new FormData(); body.append('file', file);
      if (kind === 'deck') {
        if (!status) throw new Error('Chờ server kết nối.');
        const result = await nativeRequest('/upload', status.token, body);
        onChange({ mediaId: result.id });
      } else {
        if (!/\.png$/i.test(file.name)) throw new Error('Chọn ảnh PNG diễn giả.');
        const result = await api<Media>('/media/upload/logos', 'POST', body);
        onChange({ speakerMediaId: result.id });
      }
    } catch (error) { notify((error as Error).message); }
    finally { setUploading(false); }
  }
  return <div className="properties">
    <div className="property-title"><div className="item-icon"><PresentationIcon size={20}/></div><div><strong>{item.name}</strong><span>THUYẾT TRÌNH · KHÔNG GIỚI HẠN</span></div></div>
    <a className="primary" href={`/slide-setup?item=${item.id}`}>Setup slide · tiêu đề & ảnh diễn giả</a>
    <label>Tên bài<input key={item.id} defaultValue={item.name} onBlur={e => { if (e.target.value !== item.name) onChange({ name: e.target.value }); }}/></label>
    <label>PowerPoint<select aria-label="PowerPoint" value={item.mediaId || ''} onChange={e => onChange({ mediaId: e.target.value || null })}><option value="">Chọn bài .pptx…</option>{media.filter(m => m.exists && m.mediaType === 'presentation').map(m => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
    <input ref={deckInput} hidden type="file" accept=".pptx" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file, 'deck'); }}/>
    <button disabled={uploading || !status} onClick={() => deckInput.current?.click()}><Upload size={14}/> Tải PowerPoint</button>
    <label>PNG diễn giả<select aria-label="PNG diễn giả" value={item.speakerMediaId || ''} onChange={e => onChange({ speakerMediaId: e.target.value || null })}><option value="">Chọn PNG diễn giả…</option>{media.filter(m => m.exists && m.mediaType === 'image' && /\.png$/i.test(m.filename)).map(m => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
    <input ref={speakerInput} hidden type="file" accept="image/png" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file, 'speaker'); }}/>
    <button disabled={uploading} onClick={() => speakerInput.current?.click()}><Upload size={14}/> Tải PNG diễn giả</button>
    <label>Video nền<select aria-label="Video nền" value={item.backgroundMediaId || ''} onChange={e => onChange({ backgroundMediaId: e.target.value || null })}><option value="">Nền màu</option>{media.filter(m => m.exists && m.mediaType === 'video').map(m => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
    <small>Video nền luôn tắt tiếng và lặp. Ảnh PNG chứa ảnh và thông tin diễn giả.</small>
    <button disabled={exporting} onClick={async () => { setExporting(true); try { await downloadPresentationLayout(item, media); } catch (error) { notify((error as Error).message); } finally { setExporting(false); } }}>{exporting ? 'Đang lưu ảnh…' : 'Lưu layout thuyết trình · PNG'}</button>
    <small>Ảnh 1920×1080 gồm header, diễn giả và khung đầu video nền. Vùng slide để trống để đặt Reading View phía trước. Có thể dùng ảnh tải về làm hình nền màn hình macOS.</small>
    <details><summary>Đặt layout làm wallpaper macOS</summary>
      <button disabled={!status?.available || wallpaperBusy} onClick={() => void loadScreens()}>Đọc danh sách màn hình</button>
      <label>Màn hình<select value={screenId} disabled={wallpaperBusy} onChange={e => setScreenId(e.target.value)}><option value="">Chọn màn hình…</option>{screens.map(s => <option key={s.id} value={s.id}>{s.name} · {s.width}×{s.height}</option>)}</select></label>
      <button disabled={!screenId || wallpaperBusy || exporting} onClick={() => void setWallpaper('set')}>{wallpaperBusy ? 'Đang xử lý…' : 'Đặt layout làm wallpaper'}</button>
      <button disabled={wallpaperBusy || !screens.find(s => s.id === screenId)?.canRestore} onClick={() => void setWallpaper('restore')}>Khôi phục wallpaper cũ</button>
      <small>Ảnh tĩnh theo kích thước màn hình, giữ tỉ lệ bố cục 16:9. Thu nhỏ Chrome trên màn chiếu để hiện wallpaper rồi đặt Reading View phía trước.</small>
      {wallpaperMessage && <small role="status">{wallpaperMessage}</small>}
    </details>
    <label>Chế độ trình chiếu<select aria-label="Chế độ trình chiếu" value={item.presentationMode || 'capture'} onChange={e => onChange({ presentationMode: e.target.value as PlaylistItem['presentationMode'] })}><option value="capture">Capture vào Player · hỗ trợ fullscreen</option><option value="window">Cửa sổ Reading View phía trước Chrome</option></select></label>
    <label>Tỉ lệ slide<select aria-label="Tỉ lệ slide" value={item.presentationRatio || 'auto'} onChange={e => onChange({ presentationRatio: e.target.value as PlaylistItem['presentationRatio'] })}><option value="auto">Tự đọc từ PowerPoint</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select></label>
    <details><summary>Căn chỉnh cửa sổ</summary>{([['presentationTitleBar', 'Thanh cửa sổ', 32, 0, 100], ['presentationInsetX', 'Dịch ngang', 0, -200, 200], ['presentationInsetY', 'Dịch dọc', 0, -200, 200]] as const).map(([key, name, fallback, min, max]) => <label key={key}>{name}<input type="number" min={min} max={max} key={`${key}:${item[key]}`} defaultValue={item[key] ?? fallback} onBlur={e => onChange({ [key]: Number(e.target.value) })}/></label>)}</details>
    <label className="checkbox-line"><input type="checkbox" checked={item.enabled} onChange={e => onChange({ enabled: e.target.checked })}/> Cho phép phát</label>
    {actions}{!item.slideSetupOnly && <PresentationControls item={item}/>}
  </div>;
}

export function PresentationRenderer({ item, media }: { item: PlaylistItem; media: Media[]; state?: RuntimeState; preview?: boolean; forceMuted?: boolean; audioOutgoing?: boolean }) {
  const speaker = media.find(m => m.id === item.speakerMediaId && m.exists);
  const background = media.find(m => m.id === item.backgroundMediaId && m.exists);
  return <div className="composition presentation-stage">
    {background && <video className="presentation-background" src={mediaUrl(background)} autoPlay playsInline loop muted onError={() => notify('Không phát được video nền thuyết trình.')}/>}
    <div className="conference-header"><img src="/branding/conference-header-spaced.png" alt="Hội nghị Khoa học Kỹ thuật lần XI"/></div>
    {item.slideSetupOnly && <div className="setup-slide-title" style={{ width: `${item.speakerEnabled === false ? 88 : Math.max(25, (item.speakerX ?? 76.04) - 8)}%` }}><span>BÀI {String(item.slideNumber ?? item.sortOrder + 1).padStart(2, '0')}</span><h1>{item.name}</h1></div>}
    {item.speakerEnabled !== false && <aside className="presentation-speaker" style={{ left: `${item.speakerX ?? 76.041667}%`, top: `${item.speakerY ?? 20.558267}%`, width: `${item.speakerWidth ?? 22.916666}%`, height: `${item.speakerHeight ?? 77.58988}%`, right: 'auto', bottom: 'auto' }}>{speaker && <img style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={mediaUrl(speaker)} alt="Diễn giả"/>}</aside>}
    {(item.speakerName || item.speakerTitle) && <div className="speaker-manual-text" style={{ left: `${item.speakerTextX ?? 76.04}%`, top: `${item.speakerTextY ?? 85}%`, width: `${item.speakerTextWidth ?? 22.92}%` }}>
      {item.speakerName && <div style={{ fontSize: `${(item.speakerNameSize ?? 28) / 19.2}cqw`, fontWeight: 700 }}>{item.speakerName}</div>}
      {item.speakerTitle && <div style={{ fontSize: `${(item.speakerTitleSize ?? 22) / 19.2}cqw`, marginTop: '.4cqw' }}>{item.speakerTitle}</div>}
    </div>}
  </div>;
}
