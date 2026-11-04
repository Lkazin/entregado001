'use client';

import { useEffect, useState } from 'react';

export type ReceivedStore = {
  id: string;
  profile: { name: string; domain: string; domainCandidate?: string; domainVerificationStatus?: string; plan: string; group: string; staging: string; production: string; kitAuthorized?: boolean; commercialStatus?: string };
  revision: number;
  updated_at: string;
  status: string;
};
type EventEntry = { event_id: string; store_id: string; outcome: string; created_at: string };

export default function Master2Connection({ onSelect }: { onSelect: (store: ReceivedStore) => void }) {
  const [configured, setConfigured] = useState<boolean>();
  const [stores, setStores] = useState<ReceivedStore[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [attempts, setAttempts] = useState<{ at: string; message: string }[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/master2/integrations/connection', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfigured(data.configured);
      setStores(data.stores);
      setEvents(data.events);
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Falha na consulta.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  async function runDemo() {
    setBusy(true);
    try {
      const response = await fetch('/api/master2/integrations/connection', { method: 'POST', signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      const result = data.message || data.error || 'Resposta inválida.';
      setAttempts(previous => [{ at: new Date().toLocaleString('pt-BR'), message: result }, ...previous].slice(0, 10));
    } catch {
      setAttempts(previous => [{ at: new Date().toLocaleString('pt-BR'), message: 'Falha de comunicação.' }, ...previous].slice(0, 10));
    } finally { setBusy(false); }
  }

  return <section className="space-y-4">
    <h2 className="text-2xl font-black">Conexão com Painel Master 1</h2>
    <p role="status">{configured === undefined ? 'Consultando configuração…' : !configured ? 'Aguardando configuração da chave entre os servidores.' : events.some(event => event.outcome === 'received') ? 'Envio oficial registrado.' : 'Configurado. Aguardando primeiro envio oficial.'}</p>
    <p className="text-sm text-zinc-400">Conexão existente: acompanhe as lojas recebidas, atualizações e eventos oficiais sem repetir a configuração inicial.</p>
    <div className="flex flex-wrap gap-2">
      <button className="rounded-xl border border-zinc-700 px-4 py-3" disabled={busy} onClick={() => void runDemo()}>Testar com loja fictícia</button>
      <button className="rounded-xl border border-zinc-700 px-4 py-3" onClick={() => void refresh()}>Atualizar</button>
    </div>
    {message && <p role="status">{message}</p>}
    <h3 className="font-bold">Lojas recebidas oficialmente</h3>
    {stores.length ? <ul className="space-y-2">{stores.map(store => <li key={store.id} className="rounded-xl border border-zinc-700 p-3 break-words">
      <p>{store.profile.name} · {store.id}</p>
      <p className="text-sm text-zinc-300">{store.profile.domain || store.profile.domainCandidate || 'Sem domínio'} · {store.profile.plan === 'premium' ? 'Premium' : store.profile.plan === 'business' ? 'Business' : 'Não elegível'} · {store.status === 'suspended' || store.profile.kitAuthorized === false ? 'Kit suspenso' : 'Kit recebido'}</p>
      <p className="text-sm text-zinc-400">Domínio: {store.profile.domain ? 'verificado' : store.profile.domainCandidate ? 'cadastrado, aguardando verificação' : 'não cadastrado'}</p>
      <p className="text-sm text-zinc-400">Grupo {store.profile.group || 'pendente'} · Último recebimento {new Date(store.updated_at).toLocaleString('pt-BR')}</p>
      <p className="text-sm text-zinc-400">Revisão {store.revision} · {store.status === 'pending_diagnosis' ? 'Pendente de diagnóstico' : store.status === 'suspended' ? 'Suspensa — novas instalações bloqueadas' : store.status}</p>
      <button disabled={store.status === 'suspended' || store.profile.kitAuthorized === false} className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onSelect(store)}>{store.status === 'suspended' || store.profile.kitAuthorized === false ? 'Instalação bloqueada — Kit suspenso' : 'Integrar Kit NovaesWeb Entregador'}</button>
    </li>)}</ul> : <p>Nenhuma loja oficial recebida.</p>}
    <h3 className="font-bold">Histórico de comunicação</h3>
    {[...attempts.map(attempt => ({ key: attempt.at + attempt.message, text: attempt.at + ' · ' + attempt.message })), ...events.map(event => ({ key: event.event_id, text: new Date(event.created_at).toLocaleString('pt-BR') + ' · ' + event.event_id + ' · ' + event.outcome }))].map(item => <p key={item.key} className="break-words text-sm text-zinc-300">{item.text}</p>)}
    {!attempts.length && !events.length && <p>Nenhuma tentativa registrada.</p>}
  </section>;
}
