'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Bike, Clock, LockKeyhole, MapPin } from 'lucide-react';
import { supabaseClient } from '@/lib/supabase/client';
import { isPickupOrder } from '@/lib/order-fulfillment';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-2xl bg-zinc-900" aria-label="Carregando mapa" />,
});

interface TrackingSnapshot {
  success: boolean;
  stage: 'locked' | 'active' | 'ended' | 'unavailable';
  message: string;
  driverLocation: {latitude: number; longitude: number; updatedAt: string; accuracy?: number | null} | null;
  destination: {latitude: number; longitude: number; approximate?: boolean} | null;
  route: {coordinates: [number, number][]; estimatedMinutes: number; distanceKm: number; calculatedAt?: string} | null;
  realtime?: {topic: string} | null;
}

const unavailable: TrackingSnapshot = {
  success: false, stage: 'unavailable', message: 'Não foi possível atualizar o rastreamento. Tentaremos novamente automaticamente.',
  driverLocation: null, destination: null, route: null,
};

export default function CustomerDeliveryTracking({token,fulfillmentType}: {token: string;fulfillmentType?:string}) {
  const pickup = isPickupOrder({fulfillmentType});
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [now, setNow] = useState(Date.now);
  const refreshTracking = useRef<() => void>(() => {});
  const topic = snapshot?.realtime?.topic;

  useEffect(() => {
    if (pickup) { setSnapshot(null); return; }
    let disposed = false;
    let request: AbortController | null = null;
    let pending = false;
    setSnapshot(null);
    const load = async () => {
      if (disposed || !token) return;
      if (request) { pending = true; return; }
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/customer-tracking?token=${encodeURIComponent(token)}`, {
          cache: 'no-store', signal: controller.signal, credentials: 'same-origin',
        });
        const data = response.ok ? await response.json() : null;
        if (disposed || controller.signal.aborted) return;
        if (!data?.success || !['locked','active','ended','unavailable'].includes(data.stage)) {
          setSnapshot(unavailable);
        } else {
          // Never keep coordinates from the previous snapshot when access ends.
          setSnapshot(data.stage === 'active' ? data : {...data, driverLocation: null, destination: null, route: null});
        }
      } catch {
        if (!disposed) setSnapshot(unavailable);
      } finally {
        window.clearTimeout(timeout);
        if (request === controller) request = null;
        if (!disposed && pending) {pending = false; void load();}
      }
    };
    refreshTracking.current = () => { void load(); };
    void load();
    const poll = window.setInterval(() => { void load(); }, 10000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    const onOffline = () => { request?.abort(); setSnapshot(unavailable); };
    window.addEventListener('online', load);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      refreshTracking.current = () => {};
      request?.abort();
      window.clearInterval(poll);
      window.removeEventListener('online', load);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, pickup]);

  useEffect(() => {
    if (pickup) return;
    const tick = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(tick);
  }, [pickup]);

  useEffect(() => {
    const client = supabaseClient;
    if (pickup || !topic || !client) return;
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let renewing = false;
    const connect = async () => {
      if (disposed || renewing) return;
      renewing = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12000);
      try {
        const {data: existing} = await client.auth.getSession();
        const session = existing.session || (await client.auth.signInAnonymously()).data.session;
        if (!session || disposed) return;
        const response = await fetch('/api/customer-tracking/grant', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: {'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`},
          body: JSON.stringify({token}),
        });
        const grant = response.ok ? await response.json() : null;
        if (disposed) return;
        if (!grant?.success || grant.topic !== topic) {
          if (channel) {void client.removeChannel(channel); channel = null;}
          refreshTracking.current();
          return;
        }
        await client.realtime.setAuth(session.access_token);
        if (disposed || channel) return;
        channel = client.channel(topic, {config: {private: true}})
          .on('broadcast', {event: 'updated'}, () => {
            if (disposed || debounce) return;
            debounce = setTimeout(() => {debounce = undefined; if (!disposed) refreshTracking.current();}, 300);
          }).subscribe();
      } catch {
        // Polling continues if anonymous Auth or the private channel is unavailable.
      } finally { window.clearTimeout(timeout); renewing = false; }
    };
    void connect();
    // Grants expire independently from the WebSocket; refresh before their expiry.
    const renew = window.setInterval(() => { void connect(); }, 10 * 60 * 1000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(renew);
      if (debounce) clearTimeout(debounce);
      if (channel) void client.removeChannel(channel);
    };
  }, [topic, token, pickup]);

  const timestamp = Date.parse(snapshot?.driverLocation?.updatedAt || '');
  const age = Number.isFinite(timestamp) && timestamp <= now + 5000 ? Math.max(0, now-timestamp) : Infinity;
  const active = snapshot?.stage === 'active';
  const location = active && age <= 120000 ? snapshot.driverLocation : null;
  const fresh = Boolean(location && age <= 30000);
  const routeAge = Date.parse(snapshot?.route?.calculatedAt || '');
  const routeFresh = !snapshot?.route?.calculatedAt || (Number.isFinite(routeAge) && now-routeAge <= 120000);
  const route = fresh && routeFresh ? snapshot?.route : null;

  if (pickup) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5" aria-label="Rastreamento da entrega">
      <h2 className="flex items-center gap-2 text-base font-bold text-white"><Bike className="h-5 w-5 text-orange-400" />Acompanhe sua entrega</h2>
      <p role="status" className="text-sm text-zinc-300">
        {!snapshot ? 'Verificando o acompanhamento do pedido…' : snapshot.message}
      </p>
      {active ? <>
        <TrackingMap height="clamp(280px, 55vh, 440px)" destinationLocation={snapshot.destination ? {...snapshot.destination, label: 'Seu endereço'} : null}
          driverLocation={location ? {...location, name: 'Seu entregador'} : null} routeCoordinates={route?.coordinates || []} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={fresh ? 'text-emerald-400' : 'text-amber-300'}>
            {fresh ? 'Localização atualizada' : location ? 'Última posição conhecida · aguardando novo sinal' : 'Sinal do entregador temporariamente indisponível'}
          </span>
          {Number.isFinite(timestamp) && <span className="text-zinc-400">Última atualização: {new Date(timestamp).toLocaleTimeString('pt-BR')}</span>}
        </div>
        {!fresh && <p className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200" role="status">O acompanhamento será retomado automaticamente assim que o aparelho enviar uma posição recente. A previsão fica pausada para não mostrar um horário incorreto.</p>}
        {location && route && Number.isFinite(route.estimatedMinutes) ? <p className="flex flex-wrap items-center gap-2 text-sm text-white">
          <Clock className="h-4 w-4 text-orange-400" />Previsão aproximada: {Math.max(1, Math.round(route.estimatedMinutes))} min
          {Number.isFinite(route.distanceKm) && <span className="text-zinc-400">· {route.distanceKm.toLocaleString('pt-BR', {maximumFractionDigits: 1})} km</span>}
        </p> : <p className="text-xs text-zinc-400">A previsão será atualizada quando houver uma posição recente e uma rota disponível.</p>}
        <p className="text-xs text-zinc-400">Trajeto e chegada são estimativas sem trânsito ao vivo. Outras entregas em andamento podem alterar a previsão, sem exibir os dados de outros clientes.</p>
        {snapshot.destination?.approximate && <p className="flex items-start gap-2 text-xs text-amber-300"><MapPin className="h-4 w-4 shrink-0" />Destino aproximado na rua. O número do imóvel não foi confirmado no mapa.</p>}
      </> : <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
        <LockKeyhole className="h-5 w-5 shrink-0" />{snapshot?.stage === 'ended' ? 'Rastreamento encerrado.' : 'O mapa é liberado somente quando a entrega começa e o acompanhamento está disponível para este pedido.'}
      </div>}
    </section>
  );
}
