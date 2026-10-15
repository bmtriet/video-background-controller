import { Repeat, RotateCcw } from 'lucide-react';
import type { PlaylistItem, Settings } from '../../shared/types';
import { playlistLoopRange } from '../../shared/playlistLoop';

interface Props {
  items: PlaylistItem[]; settings: Settings; available: boolean; connected: boolean;
  saving: boolean; onChange: (patch: Partial<Settings>) => void;
}

export function PlaylistLoopControls({ items, settings, available, connected, saving, onChange }: Props) {
  const range = playlistLoopRange(items, settings);
  const enabled = range.filter(item => item.enabled).length;
  const disabled = !available || !connected || saving || !items.length;
  function boundary(key: 'loopStartItemId' | 'loopEndItemId', id: string) {
    const next = { loopStartItemId: settings.loopStartItemId ?? null, loopEndItemId: settings.loopEndItemId ?? null, [key]: id || null };
    const start = next.loopStartItemId ? items.findIndex(item => item.id === next.loopStartItemId) : 0;
    const end = next.loopEndItemId ? items.findIndex(item => item.id === next.loopEndItemId) : items.length - 1;
    // Moving one boundary past the other collapses to that row. The operator
    // can then expand the other edge without submitting an invalid range.
    if (start > end) {
      if (key === 'loopStartItemId') next.loopEndItemId = next.loopStartItemId;
      else next.loopStartItemId = next.loopEndItemId;
    }
    onChange(next);
  }
  const options = items.map(item => <option key={item.id} value={item.id}>{String(item.sortOrder + 1).padStart(2, '0')} · {item.name}{item.enabled ? '' : ' · tắt'}</option>);
  return <div className={`playlist-loop-controls ${settings.loopPlaylist ? 'loop-list-active' : ''}`}>
    <button className="loop-list-toggle" title={settings.loopPlaylist ? 'Tắt lặp đoạn playlist' : 'Bật lặp đoạn playlist'} aria-pressed={settings.loopPlaylist} disabled={disabled} onClick={() => onChange({ loopPlaylist: !settings.loopPlaylist })}><Repeat size={15}/> Loop list</button>
    <label>Start from<select aria-label="Loop list Start from" disabled={disabled} value={settings.loopStartItemId ?? ''} onChange={event => boundary('loopStartItemId', event.target.value)}><option value="">Đầu playlist</option>{options}</select></label>
    <label>End here<select aria-label="Loop list End here" disabled={disabled} value={settings.loopEndItemId ?? ''} onChange={event => boundary('loopEndItemId', event.target.value)}><option value="">Cuối playlist</option>{options}</select></label>
    <button className="icon-button reset-loop-range" title="Chọn toàn playlist" aria-label="Chọn toàn playlist cho Loop list" disabled={disabled || !settings.loopStartItemId && !settings.loopEndItemId} onClick={() => onChange({ loopStartItemId: null, loopEndItemId: null })}><RotateCcw size={14}/></button>
    <small role="status">{!available ? 'Khởi động lại app để dùng Loop list theo đoạn.' : !items.length ? 'Thêm mục vào playlist để chọn đoạn lặp.' : !enabled ? 'Đoạn đã chọn chưa có mục bật.' : `${settings.loopPlaylist ? 'Đang loop' : 'Đoạn lặp'} #${(range[0]?.sortOrder ?? 0) + 1} → #${(range[range.length - 1]?.sortOrder ?? 0) + 1} · ${enabled} mục bật${settings.loopPlaylist ? '' : ' · Bật Loop list để lặp'}`}</small>
  </div>;
}
