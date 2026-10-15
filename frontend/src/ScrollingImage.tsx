import { useLayoutEffect, useRef } from 'react';
import type { Media, RuntimeState } from '../../shared/types';
import { mediaUrl } from './services';
import { imagePanFrame, imagePlaybackElapsed, imageScrollProgress } from './imageMotion';

interface Props {
  file: Media; radius: number; duration: number; state?: RuntimeState;
  receivedAt?: number; preview?: boolean; onError?: (message: string) => void;
}

export function ScrollingImage(props: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    const container = viewport.current, element = image.current;
    if (!container || !element) return;
    let width = 0, height = 0, frame = 0;
    const startedAt = performance.now();
    const measure = () => { const bounds = container.getBoundingClientRect(); width = bounds.width; height = bounds.height; };
    const observer = new ResizeObserver(measure);
    observer.observe(container); measure();
    const tick = () => {
      const option = latest.current;
      const elapsed = option.preview ? (performance.now() - startedAt) / 1000 : imagePlaybackElapsed(option.state, option.receivedAt ?? Date.now(), Date.now());
      const geometry = imagePanFrame(width, height, element.naturalWidth, element.naturalHeight, imageScrollProgress(elapsed, option.duration, !!option.preview));
      if (geometry) {
        element.style.width = `${geometry.width}px`;
        element.style.height = `${geometry.height}px`;
        element.style.transform = `translate3d(${geometry.x}px, ${geometry.y}px, 0) scale(${geometry.scale})`;
        element.style.opacity = '1';
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [props.file.id, props.preview, props.duration]);
  return <div ref={viewport} className="scrolling-image" style={{ borderRadius: props.radius }}><img ref={image} src={mediaUrl(props.file)} alt="" onLoad={event => { event.currentTarget.style.visibility = 'visible'; }} onError={event => { event.currentTarget.style.visibility = 'hidden'; props.onError?.(`Không tải được ảnh: ${props.file.filename}. Kiểm tra file và bộ lọc quảng cáo của trình duyệt.`); }}/></div>;
}
