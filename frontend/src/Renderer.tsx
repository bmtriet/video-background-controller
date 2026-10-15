import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Media, PlaylistItem, RuntimeState, Settings } from '../../shared/types';
import { mediaUrl } from './services';
import { hasLogoColumn, imageColumnCount, imageSlots, logoSlots } from '../../shared/composition';
import { logoScale, mediaGap, mediaRadius } from '../../shared/appearance';
import { AUDIO_FADE_MS } from './audioFade';
import { useVideoAudio } from './useVideoAudio';
import { ScrollingImage } from './ScrollingImage';
import { PresentationRenderer } from './Presentation';
import { LogoCaption } from './LogoCaption';

interface Props { item: PlaylistItem; media: Media[]; state?: RuntimeState; receivedAt?: number; globalVolume?: number; preview?: boolean; forceMuted?: boolean; audioOutgoing?: boolean; advanceMode?: Settings['advanceMode']; onError?: (message: string) => void; onEnded?: () => void; }
function useRoundedMedia(ref: { current: HTMLVideoElement | HTMLImageElement | null }, radius: number, fileId: string) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || radius <= 0) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const sourceWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
      const sourceHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
      const scale = sourceWidth && sourceHeight ? Math.min(width / sourceWidth, height / sourceHeight) : 0;
      const insetX = scale ? Math.max(0, (width - sourceWidth * scale) / 2) : 0;
      const insetY = scale ? Math.max(0, (height - sourceHeight * scale) / 2) : 0;
      // Mask the visible object-fit:contain content, including letterboxed
      // portrait media, rather than just rounding the surrounding slot.
      element.style.clipPath = `inset(${insetY}px ${insetX}px round ${radius}px)`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('load', update);
    element.addEventListener('loadedmetadata', update);
    return () => { observer.disconnect(); element.removeEventListener('load', update); element.removeEventListener('loadedmetadata', update); element.style.clipPath = ''; };
  }, [ref, radius, fileId]);
}
function VideoRenderer({ file, item, media, state, receivedAt = Date.now(), globalVolume = 100, preview, forceMuted = false, audioOutgoing = false, advanceMode, onError, onEnded, background = false, masked = false }: Props & { file: Media; background?: boolean; masked?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useRoundedMedia(ref, masked ? mediaRadius(item) : 0, file.id);
  const failed = useRef(false);
  const blockedAudio = useRef(false);
  const playAttempt = useRef<Promise<void> | null>(null);
  const finished = useRef(false);
  const start = background ? 0 : item.videoStartSeconds ?? 0;
  const end = background ? null : item.videoEndSeconds;
  const rate = background ? 1 : item.playbackRate;
  const muted = background ? item.backgroundMuted ?? true : item.muted;
  const loop = background ? item.backgroundLoop ?? true : !!preview || (item.itemType === 'FULL_VIDEO' && !!item.loop);
  const silentMonitor = forceMuted || !!preview;
  const mainVideo = !(item.itemType === 'ADVERTISEMENT' && imageColumnCount(item.layout)) && media.some(source => source.id === item.mediaId && source.mediaType === 'video');
  useVideoAudio(ref, { item, state, receivedAt, rate, globalVolume, muted, silentMonitor, loop, outgoing: audioOutgoing, advanceMode, mainVideo, blockedAudio, trimStart: start, trimEnd: end });
  useEffect(() => { failed.current = false; finished.current = false; }, [file.id, state?.generation, start, end]);
  useEffect(() => {
    const video = ref.current; if (!video) return;
    video.playbackRate = rate;
    const configuredMuted = silentMonitor || muted || globalVolume === 0 || item.volume === 0;
    video.muted = configuredMuted || blockedAudio.current;
    const play = () => {
      if (playAttempt.current || failed.current || finished.current || video.ended) return;
      const attempt = video.play().catch(async (error: DOMException) => {
        if (error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError' && !video.muted && !preview) {
          blockedAudio.current = true;
          video.muted = true;
          onError?.(`Chrome blocked audio: ${file.filename}. Video continues muted. Click or press a key in the Player to enable sound.`);
          try { await video.play(); }
          catch (retryError) { if ((retryError as DOMException).name !== 'AbortError') { failed.current = true; onError?.(`Unable to play media: ${file.filename}`); } }
        } else {
          failed.current = true;
          onError?.(`Unable to play media: ${file.filename}. Check the file and Chrome playback permissions.`);
        }
      }).finally(() => { if (playAttempt.current === attempt) playAttempt.current = null; });
      playAttempt.current = attempt;
    };
    const sync = () => {
      if (video.readyState >= 1 && Number.isFinite(video.duration) && start >= video.duration) {
        if (!failed.current) onError?.(`Start second vượt thời lượng video: ${file.filename}`);
        failed.current = true; video.pause(); return;
      }
      if (!preview && state) {
        const elapsed = state.elapsed + (state.status === 'PLAYING' ? (Date.now() - receivedAt) / 1000 : 0);
        const position = elapsed * rate;
        const stop = Math.min(end ?? Infinity, video.duration);
        const length = stop - start;
        const target = start + (loop && Number.isFinite(length) && length > 0 ? position % length : position);
        if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.65) {
          const seek = Number.isFinite(stop) ? Math.min(target, Math.max(start, stop - 0.01)) : target;
          if (!video.ended || loop) video.currentTime = seek;
        }
      } else if (preview && video.readyState >= 1 && video.currentTime < start) video.currentTime = start;
      if (preview || state?.status === 'PLAYING') {
        if (video.paused) play();
      } else video.pause();
    };
    sync(); video.addEventListener('loadedmetadata', sync); video.addEventListener('canplay', sync);
    const enableAudio = () => {
      if (!blockedAudio.current || configuredMuted) return;
      blockedAudio.current = false; failed.current = false;
      video.muted = false;
      if (state?.status === 'PLAYING') play();
    };
    if (!silentMonitor) { window.addEventListener('pointerdown', enableAudio); window.addEventListener('keydown', enableAudio); }
    return () => { video.removeEventListener('loadedmetadata', sync); video.removeEventListener('canplay', sync); window.removeEventListener('pointerdown', enableAudio); window.removeEventListener('keydown', enableAudio); };
  }, [rate, start, end, item.volume, muted, loop, globalVolume, preview, silentMonitor, state, receivedAt, onError]);
  function finishSegment(video: HTMLVideoElement) {
    if (loop) { video.currentTime = start; void video.play().catch(() => {}); }
    else if (!finished.current) { finished.current = true; video.pause(); onEnded?.(); }
  }
  return <video ref={ref} src={mediaUrl(file)} playsInline preload="auto" muted={silentMonitor || muted || globalVolume === 0 || item.volume === 0} loop={loop && start === 0 && end == null} onTimeUpdate={event => { const video = event.currentTarget; if (end != null && video.currentTime >= Math.min(end, video.duration)) finishSegment(video); }} onEnded={event => finishSegment(event.currentTarget)} onVolumeChange={event => {
    if (!silentMonitor) return;
    const video = event.currentTarget;
    if (!video.muted) video.muted = true;
    if (video.volume !== 0) video.volume = 0;
  }} onError={() => onError?.(`Unable to load media: ${file.filename}`)} />;
}
function ImageRenderer({ file, onError, radius = 0 }: { file: Media; onError?: (message: string) => void; radius?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  useRoundedMedia(ref, radius, file.id);
  return <img ref={ref} src={mediaUrl(file)} alt="" onLoad={event => { event.currentTarget.style.visibility = 'visible'; }} onError={e => { e.currentTarget.style.visibility = 'hidden'; onError?.(`Không tải được ảnh: ${file.filename}. Kiểm tra file và bộ lọc quảng cáo của trình duyệt.`); }} />;
}
function MediaRenderer(props: Props & { id: string | null; primary?: boolean; masked?: boolean; scrollImage?: boolean }) {
  const file = props.media.find(m => m.id === props.id);
  if (!file?.exists) return <div className="media-black" />;
  const radius = props.masked === false ? 0 : mediaRadius(props.item);
  if (file.mediaType === 'image' && props.scrollImage) return <ScrollingImage key={file.id} file={file} radius={radius} duration={props.item.durationSeconds} state={props.state} receivedAt={props.receivedAt} preview={props.preview} onError={props.onError}/>;
  return file.mediaType === 'video' ? <VideoRenderer key={`${file.id}:${props.state?.generation || 0}`} {...props} file={file} masked={radius > 0} onEnded={props.primary ? props.onEnded : undefined} /> : <ImageRenderer key={file.id} file={file} radius={radius} onError={props.onError} />;
}
function LogoRenderer(props: Props) {
  const logos = logoSlots(props.item);
  return <aside className="logo-panel"><div className="logo-grid" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(logos.length / (logos.length > 4 ? 2 : 1)))}, minmax(0, 1fr))`, gridTemplateColumns: logos.length > 4 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}>{logos.map((id, index) => {
    const text = props.item.logoTexts?.[id];
    const file = props.media.find(media => media.id === id && media.exists && media.mediaType === 'image');
    return <div className="logo-cell" key={`${index}:${id}`}>{file && text?.enabled && text.text.trim() ? <LogoCaption file={file} text={text} scale={logoScale(props.item, id)} onError={props.onError}/> : <div className="logo-scaled" style={{ transform: `scale(${logoScale(props.item, id) / 100})` }}><MediaRenderer {...props} id={id} masked={false} onEnded={undefined}/></div>}</div>;
  })}</div></aside>;
}
export function FullVideoRenderer(props: Props) { return <div className="full-video" style={{ padding: mediaGap(props.item) }}><MediaRenderer {...props} id={props.item.mediaId} primary /></div>; }
export function MediaLogoAdRenderer(props: Props) {
  const gap = mediaGap(props.item);
  return <div className="ad-layout" style={{ padding: gap, gap }}><div className="ad-main"><MediaRenderer {...props} id={props.item.mediaId} primary /></div><LogoRenderer {...props}/></div>;
}
export function DualMediaLogoAdRenderer(props: Props) {
  const gap = mediaGap(props.item);
  return <div className="ad-layout" style={{ padding: gap, gap }}><div className="ad-main dual" style={{ gap }}><div><MediaRenderer {...props} id={props.item.mediaId} primary /></div><div><MediaRenderer {...props} id={props.item.secondaryMediaId}/></div></div><LogoRenderer {...props}/></div>;
}
export function ImageColumnsAdRenderer(props: Props) {
  const gap = mediaGap(props.item);
  const withLogos = hasLogoColumn(props.item.layout);
  const images = <div className="image-columns" style={{ padding: withLogos ? 0 : gap, gap, gridTemplateColumns: `repeat(${imageColumnCount(props.item.layout)}, minmax(0, 1fr))` }}>{imageSlots(props.item).map((id, index) => <div key={index}><MediaRenderer {...props} id={id} scrollImage={!!props.item.imageScroll} onEnded={undefined}/></div>)}</div>;
  return withLogos ? <div className="ad-layout image-logo-layout" style={{ padding: gap, gap }}><div className="ad-main">{images}</div><LogoRenderer {...props}/></div> : images;
}
export function PlayerRenderer(props: Props) {
  if (props.item.itemType === 'PRESENTATION') return <PresentationRenderer {...props}/>;
  const background = props.media.find(m => m.id === props.item.backgroundMediaId && m.exists);
  return <div className={`composition${props.item.itemType === 'ADVERTISEMENT' ? ' composition-ad' : ''}`} style={{ backgroundColor: props.item.backgroundColor, backgroundImage: background?.mediaType === 'image' ? `url("${mediaUrl(background)}")` : undefined }}>
    {props.item.itemType === 'ADVERTISEMENT' && background?.mediaType === 'video' && <div className="composition-background"><VideoRenderer key={`${background.id}:${props.state?.generation || 0}:${props.item.backgroundLoop ?? true}`} {...props} file={background} background onEnded={undefined}/></div>}
    {props.item.itemType === 'ADVERTISEMENT' && <div className="conference-header"><img src="/branding/conference-header-spaced.png" alt="Hội nghị Khoa học Kỹ thuật lần XI — Bệnh viện Đa khoa Lê Ngọc Tùng"/></div>}
    <div className="composition-content">{props.item.itemType === 'FULL_VIDEO' ? <FullVideoRenderer {...props}/> : imageColumnCount(props.item.layout) ? <ImageColumnsAdRenderer {...props}/> : props.item.layout === 'DUAL_MEDIA_LOGO' ? <DualMediaLogoAdRenderer {...props}/> : <MediaLogoAdRenderer {...props}/>}</div>
  </div>;
}
export function FadingRenderer(props: Props) {
  const token = JSON.stringify([props.item.id, props.state?.generation, props.item.layout, props.item.presentationMode, props.item.mediaId, props.item.secondaryMediaId, props.item.backgroundMediaId]);
  const [frames, setFrames] = useState(() => [{ key: 0, token, props, exitAt: null as number | null }]);
  const active = frames[frames.length - 1];
  const latest = useRef(props);
  if (active.token === token) latest.current = props;
  useLayoutEffect(() => {
    if (active.token === token) return;
    const leaving = latest.current;
    const exitAt = performance.now() + AUDIO_FADE_MS;
    // Preserve the outgoing video DOM and playback for its audio ramp. Its
    // frozen callbacks cannot report an end/error against the incoming item.
    setFrames(previous => [...previous.map(frame => frame.exitAt === null ? { ...frame, props: leaving, exitAt } : frame), { key: active.key + 1, token, props, exitAt: null }]);
    latest.current = props;
  }, [token]);
  useEffect(() => {
    const deadlines = frames.flatMap(frame => frame.exitAt === null ? [] : [frame.exitAt]);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setFrames(previous => previous.filter(frame => frame.exitAt === null || frame.exitAt > performance.now())), Math.max(0, Math.min(...deadlines) - performance.now()));
    return () => clearTimeout(timer);
  }, [frames]);
  return <div className="fade-renderer">{frames.map(frame => {
    const outgoing = frame.exitAt !== null;
    const current = outgoing ? frame.props : latest.current;
    return <div key={frame.key} className={`fade-layer ${outgoing ? 'fade-layer-exit' : 'fade-layer-enter'}`} aria-hidden={outgoing || undefined}><PlayerRenderer {...current} audioOutgoing={outgoing} onEnded={outgoing ? undefined : current.onEnded} onError={outgoing ? undefined : current.onError} /></div>;
  })}</div>;
}
