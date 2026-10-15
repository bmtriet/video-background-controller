import { useCallback, useEffect, useState } from 'react';
import { FadingRenderer } from './Renderer';
import { elapsedNow, socket, useApp } from './services';

export function Player() {
  const { data, receivedAt } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { const refresh = () => setRefreshKey(key => key + 1); socket.on('player:refresh', refresh); return () => { socket.off('player:refresh', refresh); }; }, []);
  const item = data?.playlist.find(i => i.id === data.state.currentItemId);
  const report = useCallback((message: string) => {
    if (!data) return;
    const key = `${data.state.generation}:${message}`;
    if (reported.has(key)) return; reported.add(key);
    socket.emit('player:error', { itemId: data.state.currentItemId, message });
  }, [data?.state.currentItemId, data?.state.generation]);
  return <main className="audience">
    {data && item && data.state.status !== 'STOPPED' && <FadingRenderer key={refreshKey} item={item} media={data.media} state={{ ...data.state, elapsed: elapsedNow(data, receivedAt) }} receivedAt={Date.now()} globalVolume={data.settings.globalVolume} advanceMode={data.settings.advanceMode} onError={report} onEnded={() => socket.emit('player:ended', { itemId: item.id, generation: data.state.generation })} />}
  </main>;
}
const reported = new Set<string>();
