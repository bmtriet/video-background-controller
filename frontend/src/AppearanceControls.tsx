import type { PlaylistItem } from '../../shared/types';
import { MAX_MEDIA_GAP, MAX_MEDIA_RADIUS, mediaGap, mediaRadius } from '../../shared/appearance';

export type AppearanceField = 'mediaRadius' | 'mediaGap';
export function AppearanceControls({ item, onChange, onCommit }: {
  item: PlaylistItem;
  onChange: (patch: Partial<PlaylistItem>) => void;
  onCommit?: (field: AppearanceField) => void;
}) {
  return <>
    <div className="section-label">KHUNG ẢNH / VIDEO</div>
    <label className="appearance-range"><span>Bo góc <output>{mediaRadius(item)}px</output></span><input type="range" min="0" max={MAX_MEDIA_RADIUS} step="1" value={mediaRadius(item)} onChange={event => { const value = Number(event.target.value); onChange({ mediaRadius: value, mediaRounded: value > 0 }); }} onPointerUp={() => onCommit?.('mediaRadius')} onKeyUp={() => onCommit?.('mediaRadius')} onBlur={() => onCommit?.('mediaRadius')}/></label>
    <label className="appearance-range"><span>Khoảng cách các cạnh <output>{mediaGap(item)}px</output></span><input type="range" min="0" max={MAX_MEDIA_GAP} step="1" value={mediaGap(item)} onChange={event => onChange({ mediaGap: Number(event.target.value) })} onPointerUp={() => onCommit?.('mediaGap')} onKeyUp={() => onCommit?.('mediaGap')} onBlur={() => onCommit?.('mediaGap')}/></label>
  </>;
}
