import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { Media, Snapshot } from '../../shared/types';
import { mediaSourceUrl } from '../../shared/mediaSource';

type ClientState = { data: Snapshot | null; connected: boolean; receivedAt: number; notice: string | null };
let state: ClientState = { data: null, connected: false, receivedAt: Date.now(), notice: null };
const listeners = new Set<() => void>();
const publish = (patch: Partial<ClientState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
// Older running servers may still have this obsolete initialization warning
// in their in-memory alert history. Do not surface it in the new Player flow.
const retiredPlayerWarning = (message: string) => /^\s*Playback blocked\.\s*Click INITIALIZE PLAYER\s*\/\s*ENTER FULLSCREEN on the Player/i.test(message);
export const socket = io({ auth: { role: location.pathname === '/player' ? 'player' : 'controller' }, autoConnect: false });
socket.on('connect', () => publish({ connected: true, notice: null }));
socket.on('disconnect', () => publish({ connected: false }));
socket.on('connect_error', () => publish({ connected: false }));
for (const event of ['sync','playlist:updated','media:updated','event:updated','player:refresh']) socket.on(event, (data: Snapshot) => publish({ data: { ...data, errors: data.errors.filter(message => !retiredPlayerWarning(message)) }, receivedAt: Date.now() }));
socket.on('player:state', runtime => { if (state.data) publish({ data: { ...state.data, state: runtime }, receivedAt: Date.now() }); });
socket.on('player:connection', playerCount => { if (state.data) publish({ data: { ...state.data, playerCount } }); });
socket.on('operation:error', (notice: string) => { if (!retiredPlayerWarning(notice)) publish({ notice }); });
socket.connect();
export function useApp() { return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => state); }
export function notify(notice: string | null) { if (notice === null || !retiredPlayerWarning(notice)) publish({ notice }); }
export function command(name: string, payload?: unknown) {
  if (!socket.connected) { notify('Server disconnected. Reconnect before sending commands.'); return; }
  socket.timeout(3000).emit(`controller:${name}`, payload, (error: Error | null, result: any) => { if (error) notify('Command timed out. Check the server connection.'); else if (result?.error) notify(result.error); });
}
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  try {
    const response = await fetch(`/api${url}`, { method, headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Operation failed'); return result;
  } catch (e) { notify((e as Error).message); throw e; }
}
export function mediaUrl(file: Media) { return mediaSourceUrl(file, !!state.data?.capabilities?.mediaContent); }
export function elapsedNow(data: Snapshot, receivedAt: number) { return data.state.elapsed + (data.state.status === 'PLAYING' ? (Date.now() - receivedAt) / 1000 : 0); }
