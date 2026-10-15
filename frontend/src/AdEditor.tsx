import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Image as ImageIcon, Layers, Maximize2, Minimize2, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { TIERS, type Layout, type LogoText, type LogoTextStyle, type Media, type PlaylistItem, type Tier } from '../../shared/types';
import { AD_LAYOUT_CHOICES, editableAdLayout, hasLogoColumn, imageColumnCount, imageSlots, LAYOUT_LABELS, logoSlots, requiredMediaIds } from '../../shared/composition';
import { api } from './services';
import { PlayerRenderer } from './Renderer';
import { AppearanceControls } from './AppearanceControls';
import { logoScale, mediaGap, mediaRadius, MIN_LOGO_SCALE, MAX_LOGO_SCALE } from '../../shared/appearance';
import { newLogoText, retainLogoTexts } from '../../shared/logoText';
import { LogoTextControls } from './LogoTextControls';
import { MediaThumbnail } from './MediaThumbnail';

type Target = { kind: 'main' | 'secondary' | 'image' | 'logo' | 'background'; index: number };
type UploadSelection = { target: Target; type?: Media['mediaType']; label: string };
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];
function uploadFile(file: File, category: string, onProgress: (percent: number) => void): Promise<Media> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/media/upload/${category}`);
    request.responseType = 'json';
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      const result = request.response;
      if (request.status >= 200 && request.status < 300 && result?.id) { onProgress(100); resolve(result); }
      else reject(new Error(result?.error || 'Tải file thất bại. Kiểm tra kết nối máy chủ.'));
    };
    request.onerror = () => reject(new Error('Mất kết nối khi tải file. Vui lòng thử lại.'));
    const form = new FormData(); form.append('file', file);
    request.send(form);
  });
}
interface Props {
  item: PlaylistItem; media: Media[]; available: boolean; connected: boolean; videoBackgroundAvailable: boolean; mediaUploadAvailable: boolean; imageAdsAvailable: boolean;
  imageLogoColumnsAvailable: boolean;
  logoTextAvailable: boolean; logoTextDefault: LogoTextStyle; onSetLogoTextDefault: (style: LogoTextStyle) => Promise<LogoTextStyle>;
  onSave: (item: PlaylistItem) => Promise<void>; onClose: () => void;
}
function Thumb({ file }: { file?: Media }) {
  return <MediaThumbnail file={file}/>;
}

export function AdEditor({ item, media, available, connected, videoBackgroundAvailable, mediaUploadAvailable, imageAdsAvailable, imageLogoColumnsAvailable, logoTextAvailable, logoTextDefault, onSetLogoTextDefault, onSave, onClose }: Props) {
  const initialDraft = useRef({ ...item, layout: editableAdLayout(item.layout), logoMediaIds: logoSlots(item), backgroundMuted: item.backgroundMuted ?? true, backgroundLoop: item.backgroundLoop ?? true, mediaRounded: item.mediaRounded ?? false, mediaRadius: mediaRadius(item), mediaGap: mediaGap(item), logoScales: Object.fromEntries(logoSlots(item).map(id => [id, logoScale(item, id)])), logoTexts: retainLogoTexts(item.logoTexts, logoSlots(item)) });
  const [draft, setDraft] = useState<PlaylistItem>(initialDraft.current);
  const [backgroundKind, setBackgroundKind] = useState<'color' | 'image' | 'video'>(() => item.backgroundMediaId ? media.find(file => file.id === item.backgroundMediaId)?.mediaType === 'video' ? 'video' : 'image' : 'color');
  const [target, setTarget] = useState<Target>(() => ({ kind: imageColumnCount(item.layout) ? 'image' : 'main', index: 0 }));
  const [search, setSearch] = useState('');
  const [uploaded, setUploaded] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultStyle, setDefaultStyle] = useState(logoTextDefault);
  const [defaultNotice, setDefaultNotice] = useState('');
  useEffect(() => { setDefaultStyle(logoTextDefault); }, [logoTextDefault]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState('');
  const [error, setError] = useState('');
  const [openLogoId, setOpenLogoId] = useState<string | null>(() => logoSlots(item)[0] ?? null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const previewPanel = useRef<HTMLDivElement>(null);
  const previewToggle = useRef<HTMLButtonElement>(null);
  const previewExpandedRef = useRef(false);
  previewExpandedRef.current = previewExpanded;
  const root = useRef<HTMLDivElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadSelection = useRef<UploadSelection | null>(null);
  const closeRef = useRef(() => {});
  const initial = useRef(JSON.stringify(initialDraft.current));
  const allMedia = [...media, ...uploaded.filter(file => !media.some(m => m.id === file.id))];
  const columns = imageColumnCount(draft.layout);
  const withLogos = hasLogoColumn(draft.layout);
  const logos = logoSlots(draft);
  const images = imageSlots(draft);
  const patch = (update: Partial<PlaylistItem>) => { setDraft(old => ({ ...old, ...update })); setError(''); setDefaultNotice(''); };
  function changeLogoText(id: string, update: Partial<LogoText>) {
    patch({ logoTexts: { ...draft.logoTexts, [id]: { ...(draft.logoTexts?.[id] ?? newLogoText(defaultStyle)), ...update } } });
  }
  async function setTextDefault(style: LogoTextStyle) {
    if (!logoTextAvailable || !connected || saving || uploading || savingDefault) return;
    setSavingDefault(true); setError(''); setDefaultNotice('');
    try { setDefaultStyle(await onSetLogoTextDefault(style)); setDefaultNotice('Đã lưu style mặc định cho toàn app. Dùng default để áp dụng lại.'); }
    catch (error) { setError((error as Error).message); }
    finally { setSavingDefault(false); }
  }
  function close() {
    if (saving || uploading || savingDefault) return;
    if (JSON.stringify(draft) !== initial.current && !confirm('Đóng và bỏ các thay đổi chưa lưu?')) return;
    onClose();
  }
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>('input:not([type="file"])')?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (previewExpandedRef.current) { setPreviewExpanded(false); previewToggle.current?.focus(); }
        else closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const region = previewExpandedRef.current ? previewPanel.current : root.current;
      const elements = Array.from(region?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => !element.closest('[inert], [hidden]') && element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  function chooseTarget(next: Target) {
    setTarget(next); setSearch('');
    if (next.kind === 'logo' && logos[next.index]) setOpenLogoId(logos[next.index]);
  }
  function changeBackground(kind: typeof backgroundKind) {
    setBackgroundKind(kind);
    patch({ backgroundMediaId: null });
    chooseTarget({ kind: kind === 'color' ? columns ? 'image' : 'main' : 'background', index: 0 });
  }
  function layout(next: Layout) {
    const count = imageColumnCount(next);
    const sourceImages = draft.imageMediaIds || [draft.mediaId, draft.secondaryMediaId].map(id => allMedia.some(m => m.id === id && m.mediaType === 'image') ? id : null);
    patch({ layout: next, ...(count ? { imageMediaIds: Array.from({ length: count }, (_, index) => sourceImages[index] ?? null) } : {}) });
    chooseTarget({ kind: count ? 'image' : 'main', index: 0 });
  }
  const currentId = target.kind === 'main' ? draft.mediaId : target.kind === 'secondary' ? draft.secondaryMediaId : target.kind === 'background' ? draft.backgroundMediaId : target.kind === 'image' ? images[target.index] : logos[target.index];
  // Existing media+logo ads can contain an image. Keep them editable while
  // offering a video-only source picker for the new video|logos layout.
  function typeFor(destination: Target): Media['mediaType'] | undefined {
    return destination.kind === 'background' ? backgroundKind === 'video' ? 'video' : 'image' : destination.kind === 'main' && draft.layout === 'MEDIA_LOGO' ? 'video' : destination.kind === 'main' || destination.kind === 'secondary' ? undefined : 'image';
  }
  const mediaType = typeFor(target);
  const targetLabel = target.kind === 'main' ? columns ? 'Ảnh' : 'Video / media chính' : target.kind === 'secondary' ? 'Media thứ hai' : target.kind === 'background' ? backgroundKind === 'video' ? 'Video nền' : 'Ảnh nền' : target.kind === 'logo' ? `Logo ${target.index + 1}` : `Ảnh cột ${target.index + 1}`;
  const files = allMedia.filter(file => file.mediaType !== 'presentation' && file.exists && (!mediaType || file.mediaType === mediaType) && `${file.filename} ${file.relativePath}`.toLowerCase().includes(search.toLowerCase()));
  function choose(file: Media, destination = target) {
    if (destination.kind === 'main') patch({ mediaId: file.id });
    else if (destination.kind === 'secondary') patch({ secondaryMediaId: file.id });
    else if (destination.kind === 'background') patch({ backgroundMediaId: file.id });
    else if (destination.kind === 'image') patch({ imageMediaIds: images.map((id, index) => index === destination.index ? file.id : id) });
    else {
      if (logos.some((id, index) => id === file.id && index !== destination.index)) { setError('Logo này đã có trong bố cục.'); return; }
      const next = [...logos]; next[destination.index] = file.id;
      patch({ logoMediaIds: next, logoMediaId: next[0] || null, logoScales: Object.fromEntries(next.map(id => [id, logoScale(draft, id)])), logoTexts: retainLogoTexts(draft.logoTexts, next) });
      setOpenLogoId(file.id);
      if (next.length < 12) setTarget({ kind: 'logo', index: next.length });
    }
  }
  function startUpload(destination = target, label = targetLabel) {
    const type = typeFor(destination);
    if (uploading || saving || !connected) return;
    if (!mediaUploadAvailable && type !== 'image') { setError('Khởi động lại bằng ./start.sh để tải video trực tiếp.'); return; }
    const input = uploadInput.current; if (!input) return;
    uploadSelection.current = { target: destination, type, label };
    input.accept = (type === 'image' ? IMAGE_EXTENSIONS : type === 'video' ? VIDEO_EXTENSIONS : [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]).map(extension => `.${extension}`).join(',');
    chooseTarget(destination); input.click();
  }
  async function upload(file: File, selection: UploadSelection) {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = IMAGE_EXTENSIONS.includes(extension);
    if (!(isImage || VIDEO_EXTENSIONS.includes(extension)) || selection.type && (isImage ? 'image' : 'video') !== selection.type) { setError('Định dạng file không phù hợp với ô đã chọn.'); return; }
    const limit = isImage ? mediaUploadAvailable ? 20 : 5 : 1024;
    if (!file.size || file.size > limit * 1024 * 1024) { setError(`Chọn file có dung lượng từ 1 byte đến ${isImage ? `${limit} MB` : '1 GB'}.`); return; }
    setUploading(true); setUploadProgress(0); setUploadName(`${selection.label}: ${file.name}`); setError('');
    try {
      let result: Media;
      if (mediaUploadAvailable) {
        const category = selection.target.kind === 'background' ? 'backgrounds' : selection.target.kind === 'logo' ? 'logos' : 'ads';
        result = await uploadFile(file, category, setUploadProgress);
      } else {
        const form = new FormData(); form.append('logo', file);
        result = await api<Media>('/logos/upload', 'POST', form);
      }
      setUploaded(old => [...old, result]); setSearch(''); choose(result, selection.target);
    } catch (error) { setError((error as Error).message); }
    finally { setUploading(false); }
  }
  function removeLogo(index: number) {
    const next = logos.filter((_, i) => i !== index);
    patch({ logoMediaIds: next, logoMediaId: next[0] || null, logoScales: Object.fromEntries(next.map(id => [id, logoScale(draft, id)])), logoTexts: retainLogoTexts(draft.logoTexts, next) });
    setTarget({ kind: 'logo', index: next.length }); setSearch('');
    if (openLogoId === logos[index]) setOpenLogoId(next[Math.min(index, next.length - 1)] ?? null);
  }
  function slot(label: string, id: string | null | undefined, next: Target, remove?: () => void, disclosure?: { expanded: boolean; controls: string; toggle: () => void }) {
    const file = allMedia.find(m => m.id === id);
    const active = target.kind === next.kind && target.index === next.index;
    return <div className={`ad-slot ${active ? 'active' : ''}`} key={`${next.kind}:${next.index}`}><button onClick={() => chooseTarget(next)}><span className="ad-slot-thumb"><Thumb file={file}/></span><span><strong>{label}</strong><small>{file?.exists ? file.filename : file ? 'File bị thiếu · chọn thay thế' : 'Chọn từ thư viện hoặc tải file'}</small></span></button><button className="ad-slot-upload" title={`Tải file cho ${label}`} aria-label={`Tải file cho ${label}`} disabled={!connected || !mediaUploadAvailable && typeFor(next) !== 'image'} onClick={() => startUpload(next, label)}><Upload size={15}/><span>Tải file</span></button>{remove && <button className="icon-button danger-hover" aria-label={`Xóa ${label}`} onClick={remove}><Trash2 size={15}/></button>}{disclosure && <button className="icon-button ad-logo-disclosure" aria-label={`${disclosure.expanded ? 'Thu gọn' : 'Mở cấu hình'} ${label}`} aria-expanded={disclosure.expanded} aria-controls={disclosure.controls} onClick={disclosure.toggle}>{disclosure.expanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</button>}</div>;
  }
  const missing = requiredMediaIds(draft).some(id => !allMedia.some(file => file.id === id && file.exists));
  const missingBackground = backgroundKind !== 'color' && !allMedia.some(file => file.id === draft.backgroundMediaId && file.exists && file.mediaType === backgroundKind);
  const needsImageAds = columns > 0 && (withLogos || !!draft.imageScroll);
  const needsImageLogoColumns = draft.layout === 'IMAGES_2_LOGO' || draft.layout === 'IMAGES_3_LOGO';
  const needsLogoText = Object.keys(draft.logoTexts ?? {}).length > 0;
  const supported = available && (backgroundKind !== 'video' || videoBackgroundAvailable) && (!needsImageAds || imageAdsAvailable) && (!needsImageLogoColumns || imageLogoColumnsAvailable) && (!needsLogoText || logoTextAvailable);
  const validRange = Number.isFinite(draft.videoStartSeconds ?? 0) && (draft.videoStartSeconds ?? 0) >= 0 && (draft.videoStartSeconds ?? 0) <= 86400 && (draft.videoEndSeconds == null || Number.isFinite(draft.videoEndSeconds) && draft.videoEndSeconds > (draft.videoStartSeconds ?? 0) && draft.videoEndSeconds <= 86400);
  const valid = validRange && draft.name.trim().length > 0 && draft.name.length <= 200 && Number.isFinite(draft.durationSeconds) && draft.durationSeconds >= .1 && draft.durationSeconds <= 86400 && !missing && !missingBackground;
  const validationMessage = !validRange ? 'End second phải lớn hơn Start second; các mốc từ 0 đến 86400 giây.' : !draft.name.trim() ? 'Nhập tên quảng cáo trước khi lưu.' : !Number.isFinite(draft.durationSeconds) || draft.durationSeconds < .1 || draft.durationSeconds > 86400 ? 'Thời lượng phải từ 0.1 đến 86400 giây.' : missing ? 'Chọn đủ file cho các ô bắt buộc trước khi lưu.' : missingBackground ? 'Chọn file nền hoặc chuyển về nền màu.' : 'Preview không thay đổi màn hình đang phát.';
  async function save() {
    if (!supported || !valid || saving || uploading || savingDefault) return;
    setSaving(true); setError('');
    try { await onSave(draft); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <div className="ad-editor" role="dialog" aria-modal="true" aria-labelledby="ad-editor-title" ref={root} tabIndex={-1}>
    <input className="ad-file-input" type="file" ref={uploadInput} aria-label="Tải file quảng cáo từ máy" disabled={uploading || saving} onChange={e => { const file = e.target.files?.[0]; const selection = uploadSelection.current; e.target.value = ''; if (file && selection) void upload(file, selection); }}/>
    <header className="ad-editor-header" inert={previewExpanded}><div><h2 id="ad-editor-title"><Layers size={22}/> Setup quảng cáo</h2><p>Chọn bố cục, gán file vào từng ô và xem trước.</p></div><button className="icon-button" title="Đóng" aria-label="Đóng setup quảng cáo" disabled={saving || uploading || savingDefault} onClick={close}><X size={23}/></button></header>
    <fieldset className="ad-editor-body" disabled={saving || uploading || savingDefault}>
      <aside className="ad-config" inert={previewExpanded}><label>Tên quảng cáo<input maxLength={200} value={draft.name} onChange={e => patch({ name: e.target.value })}/></label><label>Hạng tài trợ<select value={draft.tier} onChange={e => { const tier = e.target.value as Tier; patch({ tier, durationSeconds: TIERS[tier] }); }}>{Object.keys(TIERS).map(tier => <option key={tier} value={tier}>{tier}</option>)}</select></label>
        <div className="section-label">BỐ CỤC</div><div className="ad-layout-choices">{([...AD_LAYOUT_CHOICES, ...(item.layout === 'DUAL_MEDIA_LOGO' ? ['DUAL_MEDIA_LOGO'] : [])] as Layout[]).map(value => <button key={value} className={draft.layout === value ? 'active' : ''} aria-pressed={draft.layout === value} onClick={() => layout(value)}><span className={`layout-diagram ${imageColumnCount(value) ? 'image-with-logos' : 'with-logos'}`}>{imageColumnCount(value) ? <><span className="image-diagram-columns">{Array.from({ length: imageColumnCount(value) }, (_, index) => <i key={index}/>)}</span><i/></> : <><i/><i/></>}</span>{LAYOUT_LABELS[value]}{draft.layout === value && <Check size={15}/>}</button>)}</div>
        <AppearanceControls item={draft} onChange={patch}/>
        {!!columns && <><label className="checkbox-line"><input type="checkbox" checked={draft.imageScroll ?? false} onChange={event => patch({ imageScroll: event.target.checked })}/> Cuộn ảnh từ trên xuống (Ken Burns)</label><small className="image-scroll-help">Cuộn hết ảnh và zoom nhẹ trong thời lượng quảng cáo. Khi tắt, ảnh hiển thị đầy đủ.</small></>}
        {!columns && <><label className="checkbox-line"><input type="checkbox" checked={draft.playUntilVideoEnd ?? false} onChange={e => patch({ playUntilVideoEnd: e.target.checked })}/> Không giới hạn thời gian · phát hết video rồi chuyển tiếp</label><small>Áp dụng cho video chính, theo đoạn Start–End và tốc độ đã chọn. Quảng cáo ảnh vẫn dùng thời lượng cấu hình.</small></>}
        <label>Thời lượng (giây)<input type="number" min="0.1" max="86400" step="0.1" disabled={!columns && !!draft.playUntilVideoEnd && allMedia.some(m => m.id === draft.mediaId && m.mediaType === 'video')} value={draft.durationSeconds || ''} onChange={e => patch({ durationSeconds: Number(e.target.value) })}/></label>
        {!columns && <><label>Tốc độ video<select value={draft.playbackRate} onChange={e => patch({ playbackRate: Number(e.target.value) })}>{[.5,.75,1,1.25,1.5,2,3,4,5].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label><div className="field-pair"><label>Start second<input type="number" min="0" max="86400" step="0.1" value={draft.videoStartSeconds ?? 0} onChange={e => patch({ videoStartSeconds: Number(e.target.value) })}/></label><label>End second<input type="number" min="0" max="86400" step="0.1" placeholder="Hết video" value={draft.videoEndSeconds ?? ''} onChange={e => patch({ videoEndSeconds: e.target.value === '' ? null : Number(e.target.value) })}/></label></div><small>Mốc giây trong file gốc, trước khi tăng tốc. Để trống End để phát đến hết video. Áp dụng cho các video nội dung, không áp dụng cho nền.</small><label>Âm lượng · {draft.volume}%<input type="range" min="0" max="100" value={draft.volume} onChange={e => patch({ volume: Number(e.target.value) })}/></label><label className="checkbox-line"><input type="checkbox" checked={draft.muted} onChange={e => patch({ muted: e.target.checked })}/> Tắt âm thanh</label></>}
        <div className="section-label">BACKGROUND</div>
        <label>Nguồn nền<select value={backgroundKind} onChange={e => changeBackground(e.target.value as typeof backgroundKind)}><option value="color">Nền màu</option><option value="image">Ảnh nền</option><option value="video">Video nền</option></select></label>
        <label className="color-field">Màu nền<input type="color" value={draft.backgroundColor} onChange={e => patch({ backgroundColor: e.target.value })}/></label>
        {backgroundKind !== 'color' && slot(backgroundKind === 'video' ? 'Video nền' : 'Ảnh nền', draft.backgroundMediaId, { kind: 'background', index: 0 }, draft.backgroundMediaId ? () => changeBackground('color') : undefined)}
        {backgroundKind === 'video' && <><label className="checkbox-line"><input type="checkbox" checked={draft.backgroundMuted ?? true} onChange={e => patch({ backgroundMuted: e.target.checked })}/> Tắt tiếng video nền</label><label className="checkbox-line"><input type="checkbox" checked={draft.backgroundLoop ?? true} onChange={e => patch({ backgroundLoop: e.target.checked })}/> Lặp video nền</label></>}
        <label className="checkbox-line"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })}/> Bật trong playlist</label>
      </aside>
      <main className="ad-stage">
        <div ref={previewPanel} className={`ad-preview-panel ${previewExpanded ? 'expanded' : ''}`}>
          <div className="ad-stage-title"><strong>PREVIEW · {LAYOUT_LABELS[draft.layout]}</strong><div className="ad-preview-actions"><span>Chỉ xem tại đây · tắt âm thanh</span><button ref={previewToggle} aria-label={previewExpanded ? 'Thu nhỏ Preview' : 'Phóng to Preview'} aria-expanded={previewExpanded} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}<span>{previewExpanded ? 'Thu nhỏ' : 'Phóng to'}</span></button></div></div>
          <div className="ad-preview-viewport"><div className="ad-preview"><PlayerRenderer item={draft} media={allMedia} preview globalVolume={0} forceMuted onError={message => setError(message)}/></div></div>
        </div>
        <div className="ad-controls-scroll" inert={previewExpanded}><p className="ad-slot-hint">Bấm Tải file tại từng ô để chọn từ máy, hoặc chọn file trong thư viện bên phải.</p>
        <div className="ad-source-slots">
          {columns ? images.map((id, index) => slot(draft.layout === 'IMAGE_LOGO' ? 'Ảnh · ⅔ màn hình' : `Ảnh cột ${index + 1}`, id, { kind: 'image', index })) : <>{slot('Video / media chính', draft.mediaId, { kind: 'main', index: 0 })}{draft.layout === 'DUAL_MEDIA_LOGO' && slot('Media thứ hai', draft.secondaryMediaId, { kind: 'secondary', index: 0 })}</>}
          {withLogos && <div className="ad-logos"><div className="ad-stage-title"><strong>LOGOS · {logos.length}/12</strong><span>{columns ? '⅓ màn hình' : 'Cột phải'} · tự chia đều</span></div>{logos.map((id, index) => <div className="ad-logo-control" key={id}>{slot(`Logo ${index + 1}`, id, { kind: 'logo', index }, () => removeLogo(index), { expanded: openLogoId === id, controls: `ad-logo-settings-${id}`, toggle: () => { if (openLogoId === id) setOpenLogoId(null); else chooseTarget({ kind: 'logo', index }); } })}<div id={`ad-logo-settings-${id}`} hidden={openLogoId !== id}><label className="appearance-range logo-scale-control"><span>Scale logo {index + 1} <output>{logoScale(draft, id)}%</output></span><input type="range" min={MIN_LOGO_SCALE} max={MAX_LOGO_SCALE} step="1" value={logoScale(draft, id)} onChange={event => patch({ logoScales: { ...draft.logoScales, [id]: Number(event.target.value) } })}/></label><LogoTextControls index={index} value={draft.logoTexts?.[id] ?? newLogoText(defaultStyle)} defaultStyle={defaultStyle} available={logoTextAvailable && connected} onChange={update => changeLogoText(id, update)} onSetDefault={style => void setTextDefault(style)}/></div></div>)}{logos.length < 12 && <button className={`ad-add-logo ${target.kind === 'logo' && target.index === logos.length ? 'active' : ''}`} onClick={() => chooseTarget({ kind: 'logo', index: logos.length })}><Plus size={18}/> Thêm logo</button>}</div>}
        </div></div>
      </main>
      <aside className="ad-picker" inert={previewExpanded}><div className="ad-stage-title"><strong>CHỌN FILE · {targetLabel}</strong><button className="icon-button" title="Quét lại thư viện" disabled={uploading} onClick={() => void api('/media/rescan','POST').catch(error => setError(error.message))}><RefreshCw size={16}/></button></div><div className="library-search"><Search size={16}/><input aria-label="Tìm file quảng cáo" placeholder="Tìm tên file…" value={search} onChange={e => setSearch(e.target.value)}/></div><p className="ad-picker-help">{mediaType === 'video' ? 'Video trong media/videos/ hoặc media/ads/' : mediaType === 'image' ? 'Ảnh trong media/ads/ hoặc media/logos/' : 'Video và ảnh trong thư viện'}</p>
        <button className="primary ad-upload" disabled={uploading || saving || !connected || !mediaUploadAvailable && mediaType !== 'image'} onClick={() => startUpload()}><Upload size={16}/>{uploading ? `Đang tải… ${uploadProgress}%` : mediaType === 'video' ? 'Tải video từ máy' : mediaType === 'image' ? 'Tải ảnh / logo từ máy' : 'Tải ảnh / video từ máy'}</button>
        <small className="ad-upload-help">{!mediaUploadAvailable && mediaType !== 'image' ? 'Khởi động lại bằng ./start.sh để tải video trực tiếp.' : mediaType === 'video' ? 'MP4 · WEBM · MOV · tối đa 1 GB' : mediaType === 'image' ? `PNG · JPG · WEBP · SVG · tối đa ${mediaUploadAvailable ? '20' : '5'} MB` : 'Ảnh tối đa 20 MB · Video tối đa 1 GB'}</small>
        <div className="ad-picker-files">{files.map(file => <button key={file.id} className={`ad-picker-file ${currentId === file.id ? 'active' : ''}`} title={file.relativePath} disabled={uploading || saving} onClick={() => choose(file)}><span className="ad-picker-thumb"><Thumb file={file}/>{currentId === file.id && <Check size={16} className="ad-picked"/>}</span><strong>{file.filename}</strong><small>{file.category} · {file.mediaType === 'video' ? 'VIDEO' : 'IMAGE'}</small></button>)}{!files.length && <div className="ad-picker-empty"><ImageIcon size={32}/><p>Chưa có file phù hợp.</p><small>{search ? 'Thử tìm tên khác.' : mediaType === 'video' ? 'Chép clip vào media/videos/ hoặc media/ads/ rồi quét lại.' : 'Tải ảnh từ máy hoặc chép vào thư mục media/ads/.'}</small></div>}</div>
      </aside>
    </fieldset>
    <footer className="ad-editor-footer" inert={previewExpanded}><div role="status">{uploading ? `Đang tải ${uploadName} · ${uploadProgress}%` : savingDefault ? 'Đang lưu style mặc định…' : error ? <span className="missing-text">{error}</span> : !connected ? <span className="missing-text">Mất kết nối máy chủ. Chờ kết nối lại để lưu.</span> : !supported ? <span className="missing-text">Khởi động lại bằng ./start.sh để lưu {!available ? 'bố cục quảng cáo mới' : needsImageAds && !imageAdsAvailable ? 'layout ảnh / cuộn ảnh mới' : needsImageLogoColumns && !imageLogoColumnsAvailable ? 'layout 2/3 ảnh có logo' : needsLogoText && !logoTextAvailable ? 'text tên công ty dưới logo' : 'video nền'}.</span> : defaultNotice || validationMessage}</div><button disabled={saving || uploading || savingDefault} onClick={close}>Hủy</button><button className="primary" disabled={!supported || !valid || saving || uploading || savingDefault} onClick={() => void save()}><Check size={17}/>{saving ? 'Đang lưu…' : item.id === 'draft' ? 'Thêm vào playlist' : 'Lưu quảng cáo'}</button></footer>
  </div>;
}
