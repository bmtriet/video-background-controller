import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, ExternalLink, Focus, Monitor, Presentation, RotateCcw, Upload, UserRound, X } from 'lucide-react';
import { deckRatio, presentationWindow, type PresentationTestConfig, type PresentationTestSnapshot, type Rect } from '../../shared/presentationTest';

const base = '/api/presentation-test';
async function request<T>(route: string, token?: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(base + route, { method, headers: { ...(token ? { 'x-presentation-test-key': token } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không kết nối được bản thử.');
  return result;
}
function useTest() {
  const [data, setData] = useState<PresentationTestSnapshot | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    let alive = true;
    const read = async () => { try { const result = await request<PresentationTestSnapshot>('/state', undefined, undefined, 'GET'); if (alive) { setData(result); setProblem(''); } } catch (failure) { if (alive) setProblem((failure as Error).message); } };
    void read(); const timer = setInterval(() => void read(), 700);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return { data, setData, problem };
}
function Stage({ data, report = false }: { data: PresentationTestSnapshot; report?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const config = data.config;
  const deck = data.decks.find(deck => deck.id === config.deckId);
  const speaker = data.media.find(file => file.id === config.speakerId);
  const background = data.media.find(file => file.id === config.backgroundId);
  const ratio = deckRatio(config, deck);
  const [fit, setFit] = useState<Rect | null>(null);
  const [previewTitleBar, setPreviewTitleBar] = useState(config.titleBar);
  useLayoutEffect(() => {
    if (!root.current || !slot.current) return;
    const update = () => {
      const reserved = slot.current!.getBoundingClientRect();
      const frame = root.current!.getBoundingClientRect();
      const titleBar = report ? config.titleBar : config.titleBar * frame.width / (data.stage?.viewport.width || 1920);
      setPreviewTitleBar(titleBar);
      setFit(presentationWindow({ x: reserved.x - frame.x, y: reserved.y - frame.y, width: reserved.width, height: reserved.height }, ratio, titleBar));
      if (!report) return;
      // Browser viewport coordinates and native window bounds both use logical
      // screen points at 100% zoom, independent of devicePixelRatio on Retina.
      const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
      const top = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
      const left = window.screenX + border;
      void request('/stage', data.token, {
        expanded: config.expanded,
        slot: { x: left + reserved.x, y: top + reserved.y, width: reserved.width, height: reserved.height },
        viewport: { x: left, y: top, width: window.innerWidth, height: window.innerHeight },
      }).catch(() => {});
    };
    update(); const observer = new ResizeObserver(update); observer.observe(root.current);
    const timer = report ? setInterval(update, 1000) : undefined;
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [report, ratio, config.expanded, config.titleBar, data.token]);
  return <div className={`presentation-stage composition ${config.expanded ? 'presentation-expanded' : ''}`} ref={root}>
    {background && <video className="presentation-background" src={background.url} autoPlay playsInline muted loop onVolumeChange={event => { event.currentTarget.muted = true; if (event.currentTarget.volume !== 0) event.currentTarget.volume = 0; }}/>}
    {!config.expanded && <><div className="conference-header"><img src="/branding/conference-header-spaced.png" alt="Hội nghị Khoa học Kỹ thuật lần XI — Bệnh viện Đa khoa Lê Ngọc Tùng"/></div><aside className="presentation-speaker">{speaker ? <img src={speaker.url} alt="Diễn giả"/> : config.guides ? <div className="presentation-speaker-empty"><UserRound size={44}/><strong>PNG diễn giả</strong><span>Ảnh và thông tin người thuyết trình</span></div> : null}</aside></>}
    <div ref={slot} className="presentation-slide-slot"/>
    {config.guides && fit && <div className="presentation-window-guide" style={{ left: fit.x, top: fit.y, width: fit.width, height: fit.height }}><div style={{ height: previewTitleBar }} className="presentation-title-guide">Cửa sổ PowerPoint · Reading View</div><div className="presentation-slide-guide"><Presentation size={38}/><strong>{deck?.name ?? 'Vùng trình chiếu PowerPoint'}</strong><span>{Math.abs(ratio - 16 / 9) < .01 ? '16:9' : Math.abs(ratio - 4 / 3) < .01 ? '4:3' : ratio.toFixed(3)} · giữ đúng tỉ lệ</span></div></div>}
  </div>;
}
export function PresentationStage() {
  const { data } = useTest();
  useEffect(() => { document.title = 'Màn chiếu thử — Thuyết trình'; }, []);
  return <main className="presentation-stage-page">{data && <Stage data={data} report/>}</main>;
}
export function PresentationTest() {
  const { data, setData, problem } = useTest();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [display, setDisplay] = useState('');
  const deckInput = useRef<HTMLInputElement>(null);
  const speakerInput = useRef<HTMLInputElement>(null);
  useEffect(() => { document.title = 'Thử thuyết trình trên Mac'; }, []);
  async function perform(action: () => Promise<PresentationTestSnapshot>, success = '') {
    if (running) return;
    setRunning(true); setNotice('');
    try { setData(await action()); setNotice(success); } catch (failure) { setNotice((failure as Error).message); }
    finally { setRunning(false); }
  }
  if (!data) return <main className="presentation-test"><h1>Thử thuyết trình trên Mac</h1><p>{problem || 'Đang kết nối bản thử…'}</p></main>;
  const current = data;
  const config = data.config;
  const deck = data.decks.find(deck => deck.id === config.deckId);
  const stageConnected = !!data.stage && Date.now() - data.stage.updatedAt < 5000;
  const patch = (update: Partial<PresentationTestConfig>) => perform(() => request('/config', data.token, update, 'PUT'));
  const native = (action: string) => perform(() => request(`/native/${action}`, data.token, action === 'stage' ? { displayId: display || data.displays[0]?.id } : {}));
  async function upload(file: File, kind: 'deck' | 'speaker') {
    await perform(async () => {
      const body = new FormData(); body.append('file', file);
      const result = await request<PresentationTestSnapshot & { id: string }>(`/upload/${kind}`, current.token, body);
      return request('/config', current.token, kind === 'deck' ? { deckId: result.id } : { speakerId: result.id }, 'PUT');
    }, 'Đã tải file vào bản thử.');
  }
  async function toggleExpanded() {
    await perform(async () => {
      let result = await request<PresentationTestSnapshot>('/config', current.token, { expanded: !current.config.expanded }, 'PUT');
      if (!current.native) return result;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        result = await request<PresentationTestSnapshot>('/state', undefined, undefined, 'GET');
        if (result.stage && Date.now() - result.stage.updatedAt < 3000) return request('/native/fit', current.token, {});
      }
      throw new Error('Bố cục đã đổi. Màn chiếu chưa kết nối; mở màn chiếu rồi bấm Căn vào khung.');
    });
  }
  return <main className="presentation-test">
    <header className="presentation-test-heading"><div><span className="eyebrow">BẢN THỬ · macOS</span><h1>Thuyết trình</h1><p>PowerPoint Reading View phía trước màn chiếu · ¾ slide, ¼ diễn giả.</p></div><a className="button" href="http://localhost:3000/controller" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Controller hiện tại</a></header>
    <div className="presentation-test-workspace">
      <fieldset className="presentation-test-setup" disabled={running || data.busy}>
        <label>Bài PowerPoint<select value={config.deckId || ''} disabled={!!data.native} onChange={event => patch({ deckId: event.target.value || null })}><option value="">Chọn bài đã tải…</option>{data.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name} · {deck.slides} slide</option>)}</select></label>
        <input type="file" accept=".pptx" hidden ref={deckInput} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, 'deck'); }}/>
        <button disabled={!!data.native} onClick={() => deckInput.current?.click()}><Upload size={16}/> Tải PowerPoint .pptx</button>
        <label>Tỉ lệ slide<select value={config.ratio} onChange={event => patch({ ratio: event.target.value as PresentationTestConfig['ratio'] })}><option value="auto">Tự nhận diện từ PowerPoint</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select></label>
        {deck && <small>Đã đọc {deck.slides} slide · tỉ lệ {deck.ratio.toFixed(3)}.</small>}
        <label>PNG diễn giả<select value={config.speakerId || ''} onChange={event => patch({ speakerId: event.target.value || null })}><option value="">Chưa chọn ảnh</option>{data.media.filter(file => file.kind === 'image').map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>
        <input type="file" accept="image/png" hidden ref={speakerInput} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, 'speaker'); }}/>
        <button onClick={() => speakerInput.current?.click()}><Upload size={16}/> Tải PNG diễn giả</button>
        <label>Video nền<select value={config.backgroundId || ''} onChange={event => patch({ backgroundId: event.target.value || null })}><option value="">Nền màu</option>{data.media.filter(file => file.kind === 'video').map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label><small>Video nền luôn tắt tiếng và lặp.</small>
        <div className="presentation-test-divider"/>
        <label>Màn hình chiếu<select value={display || data.displays[0]?.id || ''} onChange={event => setDisplay(event.target.value)}><option value="" disabled>Đọc danh sách màn hình trước</option>{data.displays.map(screen => <option key={screen.id} value={screen.id}>{screen.name} · {screen.width} × {screen.height}</option>)}</select></label>
        <button onClick={() => perform(() => request('/displays', undefined, undefined, 'GET'))}><Monitor size={16}/> Đọc màn hình</button>
        <button className="primary" disabled={!data.displays.length} onClick={() => native('stage')}><ExternalLink size={16}/> Mở màn chiếu thử trong Chrome</button>
        <small>Giữ Chrome ở cửa sổ thường trên cùng Desktop với PowerPoint; zoom trình duyệt 100%.</small>
        <details><summary>Căn chỉnh cửa sổ</summary><div className="presentation-calibration">{([['titleBar', 'Chiều cao thanh cửa sổ', 0, 100], ['insetX', 'Dịch ngang', -200, 200], ['insetY', 'Dịch dọc', -200, 200]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} defaultValue={config[key]} key={`${key}:${config[key]}`} onBlur={event => { const value = Number(event.target.value); if (value !== config[key]) patch({ [key]: value }); }}/></label>)}<small>Đơn vị theo hiển thị macOS; bấm Căn vào khung sau khi chỉnh.</small></div></details>
        <label className="presentation-guides-toggle"><input type="checkbox" checked={config.guides} onChange={event => patch({ guides: event.target.checked })}/> Hiện khung hướng dẫn</label>
      </fieldset>
      <section className="presentation-test-preview"><div className="presentation-preview-title"><strong>Bố cục màn chiếu</strong><span className={stageConnected ? 'online' : ''}>{stageConnected ? 'Màn chiếu đã kết nối' : 'Màn chiếu chưa mở'}</span></div><div className="presentation-preview-frame"><Stage data={data}/></div><p className="presentation-preview-note">Preview hiển thị vùng đặt cửa sổ. Slide thật chạy trong PowerPoint trên màn chiếu.</p>
        <div className="presentation-native-actions"><button className="primary" disabled={running || !deck || !stageConnected} onClick={() => native('open')}><Presentation size={18}/> Mở PowerPoint vào khung</button><button disabled={running || !data.native || !stageConnected} onClick={() => native('fit')}><RotateCcw size={16}/> Căn vào khung</button><button disabled={running || !data.native} onClick={() => native('focus')}><Focus size={16}/> Trả pointer về PowerPoint</button><button disabled={running} onClick={() => void toggleExpanded()}><Expand size={16}/>{config.expanded ? 'Trở về ¾–¼' : 'Phóng slide'}</button></div>
        <div className="presentation-native-actions"><button disabled={running || !data.native} onClick={() => native('previous')}><ArrowLeft size={16}/> Slide trước</button><button disabled={running || !data.native} onClick={() => native('next')}>Slide sau <ArrowRight size={16}/></button><button disabled={running || !deck} onClick={() => native('status')}>Đọc trạng thái PowerPoint</button><button disabled={running || !data.native} onClick={() => native('end')}><X size={16}/> Kết thúc bài thử</button></div>
        <div className="presentation-test-status" role="status">{running ? 'Đang thực hiện…' : notice || data.error || problem || (data.native ? `PowerPoint: slide ${data.native.slide}/${data.native.slides} · ${data.native.bounds.width} × ${data.native.bounds.height}` : 'Chuẩn bị file, mở màn chiếu thử rồi mở PowerPoint vào khung.')}</div>
        <p className="presentation-test-note">Bài thử không có giới hạn thời gian và không điều khiển playlist đang chạy. Pointer thao tác trực tiếp với PowerPoint. Các nút Slide trước/sau dùng để kiểm tra chuyển trang.</p>
      </section>
    </div>
  </main>;
}
