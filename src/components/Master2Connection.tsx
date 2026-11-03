'use client';

import { useEffect, useState } from 'react';

export type ReceivedStore = {
  id: string;
  profile: { name: string; domain: string; plan: string; group: string; staging: string; production: string };
  revision: number;
  status: string;
};
type EventEntry = { event_id: string; store_id: string; outcome: string; created_at: string };

const example = {
  schemaVersion: 1,
  eventType: 'kit.authorized',
  eventId: 'demo-001',
  officialStoreId: 'd0e00000-0000-4000-8000-000000000001',
  name: 'Hamburgueria Horizonte',
  domain: 'horizonte.example',
  basePlan: 'business',
  storeStatus: 'active',
  kitAuthorized: true,
  supabaseGroupId: 'grupo-homologado',
  revision: 1,
};

export default function Master2Connection({ onSelect }: { onSelect: (store: ReceivedStore) => void }) {
  const [configured, setConfigured] = useState<boolean>();
  const [stores, setStores] = useState<ReceivedStore[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [attempts, setAttempts] = useState<{ at: string; message: string }[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = typeof window === 'undefined' ? '/api/master2/integrations/events' : window.location.origin + '/api/master2/integrations/events';
  const prompt = [
    'Codex do Master 1: implemente o botão Enviar ao Master 2 no painel administrativo.',
    'Valide a sessão administrativa, localize a loja por managed_sites.id e confirme situação ativa, plano Business ou Premium e autorização vigente do Kit no servidor.',
    'Envie POST para ' + endpoint + ' somente pelo backend. Configure MASTER2_MASTER1_SECRET nos dois servidores com o mesmo segredo privado de pelo menos 32 caracteres e cadastre o grupo autorizado no Master 2.',
    'Use Content-Type application/json, x-master1-mode: live, x-master1-timestamp com Date.now() e x-master1-signature com o HMAC-SHA256 hexadecimal de master1:master2-live:<timestamp>:<corpo JSON exato>.',
    'Envie apenas os campos abaixo. Use o UUID oficial, domínio sem protocolo, ID de evento estável por operação e revisão inteira crescente por loja. Use a referência do grupo, sem URLs de banco ou credenciais.',
    JSON.stringify(example, null, 2),
    'Confirme HTTP 200 e received:true, eventId, officialStoreId e revision. Em falha de rede ou 503, repita o mesmo evento e corpo com timestamp e assinatura novos. Em 409, revise event_conflict ou stale_revision antes de reenviar. Em 401 confira assinatura e relógio. Em 422 confira contrato e grupo.',
    'Consulte status pelo mesmo POST assinado com o corpo { "schemaVersion": 1, "eventType": "kit.status", "officialStoreId": "<UUID>" }. Leia store.status, store.revision e store.updated_at. HTTP 404 significa loja ainda não recebida.',
    'Homologue com loja fictícia, assinatura inválida, timestamp expirado, grupo desconhecido, evento repetido, conflito de ID e revisão atrasada. Comprove que receber a loja apenas cria a pendência técnica e preserva a instalação existente.',
  ].join('\n\n');

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
    <h2 className="text-2xl font-black">Conectar Painel Master 1</h2>
    <p role="status">{configured === undefined ? 'Consultando configuração…' : !configured ? 'Aguardando configuração da chave e dos grupos Supabase.' : events.some(event => event.outcome === 'received') ? 'Envio oficial registrado.' : 'Configurado. Aguardando primeiro envio oficial.'}</p>
    <p className="break-all text-sm text-zinc-300">POST {endpoint}</p>
    <label className="block">Contrato e prompt para o Codex do Master 1<textarea readOnly value={prompt} rows={14} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" /></label>
    <div className="flex flex-wrap gap-2">
      <button className="rounded-xl bg-fuchsia-700 px-4 py-3" onClick={async () => {
        try { await navigator.clipboard.writeText(prompt); setMessage('Prompt copiado.'); }
        catch { setMessage('Selecione o texto para copiar manualmente.'); }
      }}>Copiar prompt para integrar Master 1</button>
      <button className="rounded-xl border border-zinc-700 px-4 py-3" disabled={busy} onClick={() => void runDemo()}>Testar com loja fictícia</button>
      <button className="rounded-xl border border-zinc-700 px-4 py-3" onClick={() => void refresh()}>Atualizar</button>
    </div>
    {message && <p role="status">{message}</p>}
    <h3 className="font-bold">Lojas recebidas oficialmente</h3>
    {stores.length ? <ul className="space-y-2">{stores.map(store => <li key={store.id} className="rounded-xl border border-zinc-700 p-3 break-words">
      <p>{store.profile.name} · {store.id}</p><p className="text-sm text-zinc-400">Revisão {store.revision} · {store.status === 'pending_diagnosis' ? 'Pendente de diagnóstico' : store.status}</p>
      <button className="mt-2 rounded-lg bg-zinc-800 px-3 py-2" onClick={() => onSelect(store)}>Abrir instalação</button>
    </li>)}</ul> : <p>Nenhuma loja oficial recebida.</p>}
    <h3 className="font-bold">Histórico de comunicação</h3>
    {[...attempts.map(attempt => ({ key: attempt.at + attempt.message, text: attempt.at + ' · ' + attempt.message })), ...events.map(event => ({ key: event.event_id, text: new Date(event.created_at).toLocaleString('pt-BR') + ' · ' + event.event_id + ' · ' + event.outcome }))].map(item => <p key={item.key} className="break-words text-sm text-zinc-300">{item.text}</p>)}
    {!attempts.length && !events.length && <p>Nenhuma tentativa registrada.</p>}
  </section>;
}
