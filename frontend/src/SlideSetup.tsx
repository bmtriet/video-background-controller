import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../shared/types';
import { api, useApp } from './services';
import { PresentationRenderer } from './Presentation';

export function SlideSetup() {
  const { data, connected, notice } = useApp();
  const [selected, setSelected] = useState(new URLSearchParams(location.search).get('item') || '');
  const [draft, setDraft] = useState<PlaylistItem | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const slides = data?.playlist.filter(item => item.itemType === 'PRESENTATION') || [];
  const item = slides.find(item => item.id === selected) || slides[0];
  useEffect(() => { if (!dirty) setDraft(item || null); }, [item, dirty]);
  function change(patch: Partial<PlaylistItem>) { setDraft(old => old ? { ...old, ...patch } : old); setDirty(true); setSaved(false); }
  function choose(id: string) { if (dirty && !confirm('Bỏ thay đổi chưa lưu để chọn slide khác?')) return; setDirty(false); setSelected(id); setSaved(false); }
  async function save() {
    if (!draft) return;
    setSaving(true);
    try { const result = await api<PlaylistItem>(`/playlist/${draft.id}`, 'PUT', draft); setDraft(result); setDirty(false); setSaved(true); }
    catch {} finally { setSaving(false); }
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!data) return <div className="fatal">Đang kết nối…</div>;
  return <div className="slide-setup-page">
    <header><a href="/controller">← Controller</a><h1>Setup slides</h1><span>{connected ? 'Đã kết nối' : 'Mất kết nối'}</span><button className="primary" disabled={!draft || !dirty || saving || !connected} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu vào playlist'}</button></header>
    {notice && <div className="notice" role="alert">{notice}</div>}
    <div className="slide-setup-body"><nav>{slides.map(slide => <button key={slide.id} className={slide.id === draft?.id ? 'active' : ''} onClick={() => choose(slide.id)}><b>{String(slide.slideNumber ?? slide.sortOrder + 1).padStart(2, '0')}</b><span>{slide.name}</span></button>)}{!slides.length && <p>Chưa có slide trong playlist.</p>}</nav>
    <main>{draft && <><div className="slide-setup-preview"><PresentationRenderer item={{ ...draft, slideSetupOnly: true }} media={data.media}/></div><p>{saved ? 'Đã lưu vào playlist.' : dirty ? 'Có thay đổi chưa lưu.' : 'Chỉnh cấu hình bên phải rồi lưu vào playlist.'}</p></>}</main>
    <aside className="properties">{draft && <>
      <label>Số thứ tự<input type="number" min="1" max="999" value={draft.slideNumber ?? draft.sortOrder + 1} onChange={e => change({ slideNumber: Number(e.target.value) })}/></label>
      <label>Tiêu đề bài<textarea rows={5} maxLength={200} value={draft.name} onChange={e => change({ name: e.target.value })}/></label>
      <label className="checkbox-line"><input type="checkbox" checked={draft.slideSetupOnly !== false && !draft.mediaId} onChange={e => change({ slideSetupOnly: e.target.checked, ...(e.target.checked ? { mediaId: null } : {}) })}/> Slide tiêu đề · chưa dùng PowerPoint</label>
      <label className="checkbox-line"><input type="checkbox" checked={draft.speakerEnabled !== false} onChange={e => change({ speakerEnabled: e.target.checked })}/> Hiện ảnh người phát biểu</label>
      <label>Ảnh người phát biểu<select value={draft.speakerMediaId || ''} onChange={e => change({ speakerMediaId: e.target.value || null })}><option value="">Không chọn ảnh</option>{data.media.filter(m => m.exists && m.mediaType === 'image' && /\.png$/i.test(m.filename)).map(m => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
      {([['speakerX', 'Vị trí ngang', 76.04], ['speakerY', 'Vị trí dọc', 20.56], ['speakerWidth', 'Chiều rộng', 22.92], ['speakerHeight', 'Chiều cao', 77.59]] as const).map(([key, label, fallback]) => <label key={key}>{label} · {(draft[key] ?? fallback).toFixed(1)}%<input type="number" min={key.includes('Width') || key.includes('Height') ? 1 : 0} max={key === 'speakerX' ? 100 - (draft.speakerWidth ?? 22.92) : key === 'speakerY' ? 100 - (draft.speakerHeight ?? 77.59) : key === 'speakerWidth' ? 100 - (draft.speakerX ?? 76.04) : 100 - (draft.speakerY ?? 20.56)} step="0.1" value={draft[key] ?? fallback} onChange={e => change({ [key]: Number(e.target.value) })}/></label>)}
      <button onClick={() => change({ speakerX: 76.04, speakerY: 20.56, speakerWidth: 22.92, speakerHeight: 77.59 })}>Khôi phục vị trí & kích thước</button>
      <label>Tên diễn giả<input maxLength={300} value={draft.speakerName ?? ''} onChange={e => change({ speakerName: e.target.value })}/></label>
      <label>Chức vị<textarea rows={3} maxLength={300} value={draft.speakerTitle ?? ''} onChange={e => change({ speakerTitle: e.target.value })}/></label>
      {([['speakerTextX', 'Vị trí ngang thông tin (%)', 76.04, 0, 99], ['speakerTextY', 'Vị trí dọc thông tin (%)', 85, 0, 99], ['speakerTextWidth', 'Chiều rộng thông tin (%)', 22.92, 1, 100], ['speakerNameSize', 'Cỡ chữ tên (px tại 1920px)', 28, 10, 100], ['speakerTitleSize', 'Cỡ chữ chức vị (px tại 1920px)', 22, 10, 100]] as const).map(([key, label, fallback, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step="0.1" value={draft[key] ?? fallback} onChange={e => change({ [key]: Number(e.target.value) })}/></label>)}
      <small>Nhập kích thước và vị trí bằng phần trăm màn hình. Tên và chức vị là chữ riêng; để trống nếu PNG đã có thông tin.</small>
      <label>Video nền<select value={draft.backgroundMediaId || ''} onChange={e => change({ backgroundMediaId: e.target.value || null })}><option value="">Nền navy</option>{data.media.filter(m => m.exists && m.mediaType === 'video').map(m => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
      <small>Ảnh giữ đúng tỉ lệ trong khung. Video nền tắt tiếng và lặp. Slide tiêu đề chuyển bằng nút Next / Previous.</small>
    </>}</aside></div>
  </div>;
}
