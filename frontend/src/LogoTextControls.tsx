import { RotateCcw, Save, Type } from 'lucide-react';
import type { LogoText, LogoTextStyle } from '../../shared/types';
import { logoTextStyle, MAX_COMPANY_NAME_LENGTH, MAX_LOGO_FONT_SIZE, MAX_LOGO_STROKE_WIDTH, MIN_LOGO_FONT_SIZE } from '../../shared/logoText';

interface Props {
  index: number; value: LogoText; defaultStyle: LogoTextStyle; available: boolean;
  onChange: (patch: Partial<LogoText>) => void;
  onSetDefault: (style: LogoTextStyle) => void;
}

export function LogoTextControls({ index, value, defaultStyle, available, onChange, onSetDefault }: Props) {
  const label = `Logo ${index + 1}`;
  return <div className="logo-text-controls">
    <button className={`logo-text-toggle ${value.enabled ? 'active' : ''}`} aria-label={`${value.enabled ? 'Tắt' : 'Bật'} text tên công ty dưới ${label}`} aria-pressed={value.enabled} onClick={() => onChange({ enabled: !value.enabled })}><Type size={15}/>{value.enabled ? 'Tắt text' : 'Bật text'} · Tên công ty</button>
    {value.enabled && <div className="logo-text-fields">
      <label>Tên công ty<textarea aria-label={`Tên công ty dưới ${label}`} rows={3} maxLength={MAX_COMPANY_NAME_LENGTH} placeholder="Nhập tên công ty…" value={value.text} onChange={event => onChange({ text: event.target.value })}/></label>
      <small>Nhấn Enter để xuống dòng theo ý muốn.</small>
      <div className="logo-text-colors"><label className="color-field">Màu chữ<input aria-label={`Màu chữ ${label}`} type="color" value={value.color} onChange={event => onChange({ color: event.target.value })}/></label><label className="color-field">Màu stroke<input aria-label={`Màu stroke ${label}`} type="color" value={value.strokeColor} onChange={event => onChange({ strokeColor: event.target.value })}/></label></div>
      <label className="checkbox-line"><input aria-label={`Bold tên công ty ${label}`} type="checkbox" checked={value.bold} onChange={event => onChange({ bold: event.target.checked })}/> Bold · Chữ đậm</label>
      <label className="appearance-range"><span>Font size <output>{value.fontSize}px</output></span><input aria-label={`Font size ${label}`} type="range" min={MIN_LOGO_FONT_SIZE} max={MAX_LOGO_FONT_SIZE} step="1" value={value.fontSize} onChange={event => onChange({ fontSize: Number(event.target.value) })}/></label>
      <label className="appearance-range"><span>Stroke <output>{value.strokeWidth}px</output></span><input aria-label={`Độ dày stroke ${label}`} type="range" min="0" max={MAX_LOGO_STROKE_WIDTH} step="0.25" value={value.strokeWidth} onChange={event => onChange({ strokeWidth: Number(event.target.value) })}/></label>
      <div className="logo-text-default-actions"><button disabled={!available} title="Lưu kiểu chữ này làm mặc định cho toàn app" onClick={() => onSetDefault(logoTextStyle(value))}><Save size={14}/> Set default</button><button title="Dùng kiểu chữ mặc định đã lưu, giữ nguyên tên công ty" onClick={() => onChange(logoTextStyle(defaultStyle))}><RotateCcw size={14}/> Dùng default</button></div>
      <small>Căn giữa dưới logo · cỡ chữ tính trên màn hình 1080p.{!available && ' Khởi động lại app để lưu text và default.'}</small>
    </div>}
  </div>;
}
