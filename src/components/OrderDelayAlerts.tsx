'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ORDER_ALARM, normalizeAlarmSettings, orderDelay, type OrderAlarmSettings } from '@/lib/order-delay-alerts';

export function useOrderAlarmSettings(storeId: string) {
  const [settings, setSettings] = useState(DEFAULT_ORDER_ALARM);
  const key = `nw:order-alarm:v1:${storeId}`;
  useEffect(() => {
    const load = () => { try { setSettings(normalizeAlarmSettings(JSON.parse(localStorage.getItem(key) || '{}'))); } catch { setSettings(DEFAULT_ORDER_ALARM); } };
    load(); window.addEventListener('storage', load); window.addEventListener('nw:order-alarm-settings', load);
    return () => { window.removeEventListener('storage', load); window.removeEventListener('nw:order-alarm-settings', load); };
  }, [key]);
  const save = useCallback((value: OrderAlarmSettings) => { const clean = normalizeAlarmSettings(value); setSettings(clean); try { localStorage.setItem(key, JSON.stringify(clean)); } catch {} window.dispatchEvent(new Event('nw:order-alarm-settings')); }, [key]);
  return [settings, save] as const;
}

export default function OrderDelayAlerts({ orders, now, storeId, onOpenOrder, muted = false }: { orders: any[]; now: number; storeId: string; onOpenOrder: (id: string) => void; muted?: boolean }) {
  const [settings, save] = useOrderAlarmSettings(storeId);
  const [unlocked, setUnlocked] = useState(false), [snoozeUntil, setSnoozeUntil] = useState(0), [expanded, setExpanded] = useState(false);
  const audio = useRef<AudioContext | null>(null), lastPlayed = useRef(0);
  const alerts = orders.map(order => orderDelay(order, now, settings)).filter((alert): alert is NonNullable<typeof alert> => alert !== null);
  const latest = useRef({ alerts, settings, now, snoozeUntil, muted });
  latest.current = { alerts, settings, now, snoozeUntil, muted };
  const play = useCallback(() => {
    const ctx = audio.current; if (!ctx || ctx.state !== 'running') return;
    const { settings: current, alerts: currentAlerts } = latest.current;
    if (current.volume === 0) return;
    const critical = currentAlerts.some(a => a.level === 'critical');
    for (let i = 0; i < (critical ? 3 : 2); i++) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + i * 0.24;
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(critical ? 1050 : 740, start);
      gain.gain.setValueAtTime(0.001, start); gain.gain.linearRampToValueAtTime(current.volume / 100 * 0.22, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 0.2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }, []);
  const unlock = useCallback(async (test = false) => {
    try {
      const Constructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Constructor) return;
      audio.current ||= new Constructor();
      if (audio.current!.state !== 'running') await audio.current!.resume();
      setUnlocked(audio.current!.state === 'running');
      if (test) { lastPlayed.current = latest.current.now; play(); }
    } catch { setUnlocked(false); }
  }, [play]);
  useEffect(() => {
    const activate = () => { void unlock(); };
    window.addEventListener('pointerdown', activate);
    window.addEventListener('keydown', activate);
    return () => { window.removeEventListener('pointerdown', activate); window.removeEventListener('keydown', activate); };
  }, [unlock]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); audio.current = null; }, []);
  useEffect(() => {
    if (!unlocked || !settings.enabled || muted || snoozeUntil > now || !alerts.length) { if (!alerts.length) lastPlayed.current = 0; return; }
    if (now - lastPlayed.current >= settings.repeatSeconds * 1000) { lastPlayed.current = now; play(); }
  }, [now, unlocked, settings.enabled, settings.repeatSeconds, muted, snoozeUntil, alerts.length, play]);
  return <section aria-label="Alertas operacionais" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-white">
    <div className="flex flex-wrap items-center gap-2">
      <strong className={alerts.length ? 'text-red-300' : 'text-zinc-300'}>{alerts.length ? `${alerts.length} pedido(s) precisam de atenção` : 'Sem pedidos acima do tempo configurado'}</strong>
      <button type="button" onClick={() => void unlock(true)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">{unlocked ? 'Testar som' : 'Ativar e testar som'}</button>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Configurar alarmes deste aparelho</button>
      {alerts.length > 0 && <button type="button" onClick={() => setSnoozeUntil(snoozeUntil > now ? 0 : now + 5 * 60000)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">{snoozeUntil > now ? 'Retomar alarme' : 'Silenciar por 5 min'}</button>}
    </div>
    {(!unlocked || !settings.enabled || muted || snoozeUntil > now) && <p className="mt-2 text-xs text-zinc-400">{!settings.enabled ? 'Sons dos pedidos desativados.' : muted ? 'Alarme de demora temporariamente silenciado.' : snoozeUntil > now ? `Som pausado até ${new Date(snoozeUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : 'Toque em Ativar e testar som para permitir os alarmes neste aparelho.'}</p>}
    {expanded && <div className="mt-3 grid gap-3 border-t border-zinc-800 pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={e => save({ ...settings, enabled: e.target.checked })}/>Sons dos pedidos</label>
      <label>Volume ({settings.volume}%)<input type="range" min="0" max="100" value={settings.volume} onChange={e => save({ ...settings, volume: Number(e.target.value) })} className="mt-2 block w-full"/></label>
      {([['warningMinutes','Alerta após (min)',1,120],['criticalMinutes','Urgente após (min)',settings.warningMinutes+1,240],['repeatSeconds','Repetir som (seg)',10,300]] as const).map(([key,label,min,max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={settings[key]} onChange={e => save({ ...settings, [key]: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-base"/></label>)}
      <p className="text-zinc-400 sm:col-span-2">Conta o tempo da etapa atual: aceite, preparo, retirada ou entrega. Configuração salva somente neste navegador. Volume e repetição também controlam a chegada de pedidos.</p>
    </div>}
    {!!alerts.length && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{alerts.map(alert => <button key={alert.id} type="button" onClick={() => onOpenOrder(alert.orderId)} className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${alert.level === 'critical' ? 'border-red-500 bg-red-950 text-red-100' : 'border-red-800 bg-red-950/40 text-red-200'}`}><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400 motion-safe:animate-pulse"/>#{alert.orderNumber} · {alert.minutes} min {alert.label}{alert.level === 'critical' && ' · URGENTE'}</button>)}</div>}
  </section>;
}

export function OrderDelayBadge({ order, now, settings = DEFAULT_ORDER_ALARM }: { order: any; now: number; settings?: OrderAlarmSettings }) {
  const alert = orderDelay(order, now, settings);
  if (!alert) return null;
  return <p className="flex items-center gap-2 rounded-lg border border-red-500 bg-red-950 px-2 py-2 text-xs font-bold text-red-100"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-red-400 motion-safe:animate-pulse"/>{alert.level === 'critical' ? 'URGENTE · ' : 'Atenção · '}{alert.minutes} min {alert.label}</p>;
}
