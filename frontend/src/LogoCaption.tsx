import { useLayoutEffect, useRef } from 'react';
import type { LogoText, Media } from '../../shared/types';
import { captionLogoGeometry, logoTextCss } from '../../shared/logoText';
import { mediaUrl } from './services';

export function LogoCaption({ file, text, scale, onError }: { file: Media; text: LogoText; scale: number; onError?: (message: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const group = root.current, element = image.current, slot = visual.current, name = caption.current;
    if (!group || !element || !slot || !name) return;
    const update = () => {
      const bounds = group.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(group).rowGap) || 0;
      const geometry = captionLogoGeometry(bounds.width, bounds.height, element.naturalWidth, element.naturalHeight, name.getBoundingClientRect().height, gap, scale);
      slot.style.width = `${geometry?.width ?? 0}px`;
      slot.style.height = `${geometry?.height ?? 0}px`;
      if (geometry) { element.style.width = `${geometry.imageWidth}px`; element.style.height = `${geometry.imageHeight}px`; }
    };
    const observer = new ResizeObserver(update);
    observer.observe(group); observer.observe(name);
    element.addEventListener('load', update); update();
    return () => { observer.disconnect(); element.removeEventListener('load', update); };
  }, [file.id, scale]);
  return <div className="logo-caption-group" ref={root}>
    <div className="caption-logo-visual" ref={visual}><img ref={image} src={mediaUrl(file)} alt="" onLoad={event => { event.currentTarget.style.visibility = 'visible'; }} onError={event => { event.currentTarget.style.visibility = 'hidden'; onError?.(`Không tải được ảnh: ${file.filename}. Kiểm tra file và bộ lọc quảng cáo của trình duyệt.`); }}/></div>
    <p className="logo-company-name" ref={caption} style={{ ...logoTextCss(text), padding: `${Math.max(2, text.strokeWidth) / 10.8}cqh` }}>{text.text}</p>
  </div>;
}
