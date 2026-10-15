import { useEffect, useState } from 'react';
import { AlertTriangle, Film, Image as ImageIcon, ImageOff, Presentation } from 'lucide-react';
import type { Media } from '../../shared/types';
import { mediaUrl } from './services';

export function MediaThumbnail({ file, size = 25 }: { file?: Media; size?: number }) {
  const source = file ? mediaUrl(file) : '';
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [source]);
  if (!file) return <ImageIcon size={size}/>;
  if (!file.exists) return <AlertTriangle size={size}/>;
  if (file.mediaType === 'presentation') return <Presentation size={size}/>;
  if (file.mediaType === 'video') return <Film size={size}/>;
  if (failed) return <span className="image-load-failed" title={`Không tải được ảnh ${file.filename}. Kiểm tra file và bộ lọc quảng cáo của trình duyệt.`}><ImageOff size={size}/><small>Lỗi tải ảnh</small></span>;
  return <img src={source} alt="" loading="lazy" onError={() => setFailed(true)}/>;
}
