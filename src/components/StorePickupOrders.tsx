'use client';
import { useState } from 'react';

export interface StorePickupOrder {
  id: string; orderNumber: number; customerName: string; phone: string; itemsSummary: string; total: number;
  status: 'recebido' | 'preparando' | 'pronto' | 'em_entrega' | 'concluido' | 'cancelado';
  readyAt?: string; collectedAt?: string; createdAtISO?: string; notes?: string;
}
const labels: Record<string, string> = { recebido: 'Recebido', preparando: 'Preparando', pronto: 'Pronto para retirar', concluido: 'Retirado', cancelado: 'Cancelado' };
export default function StorePickupOrders({ orders, now, onStatus, onDetails, onCancel }: {
  orders: StorePickupOrder[]; now: number;
  onStatus: (id: string, status: StorePickupOrder['status']) => Promise<void>;
  onDetails: (id: string) => void; onCancel: (id: string) => void;
}) {
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const matches = orders.filter(order => (filter === 'all' || filter === 'active' ? filter === 'all' || !['concluido', 'cancelado'].includes(order.status) : order.status === filter) && `${order.orderNumber} ${order.customerName} ${order.phone}`.toLowerCase().includes(query.toLowerCase()));
  async function advance(order: StorePickupOrder) {
    if (busy) return;
    if (order.status === 'pronto' && !window.confirm(`Confirmar que o cliente retirou o pedido #${order.orderNumber}? Confira o número do pedido e a pessoa no balcão.`)) return;
    const next = order.status === 'recebido' ? 'preparando' : order.status === 'preparando' ? 'pronto' : order.status === 'pronto' ? 'concluido' : null;
    if (!next) return;
    setBusy(order.id); setError('');
    try { await onStatus(order.id, next); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível confirmar. Atualize o pedido.'); }
    finally { setBusy(null); }
  }
  return <section className="space-y-5 text-white" aria-label="Pedidos para retirar na loja">
    <header className="rounded-2xl border border-cyan-700/40 bg-cyan-950/20 p-5"><h2 className="text-xl font-black">Pedidos para retirar na loja</h2><p className="mt-2 text-sm text-zinc-300">Atendimento no balcão, separado das entregas por motoboy. Sem frete, despacho ou rastreamento de motorista.</p><p className="mt-3 text-sm font-bold text-cyan-200">{orders.filter(order => order.status === 'pronto').length} pronto(s) aguardando o cliente</p></header>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar retiradas">{[['active','Em atendimento'],['recebido','Recebidos'],['preparando','Preparando'],['pronto','Prontos'],['concluido','Retirados'],['cancelado','Cancelados'],['all','Todos']].map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${filter === value ? 'bg-cyan-600 text-white' : 'bg-zinc-900 text-zinc-300'}`}>{label}</button>)}</div>
    <label className="block text-sm text-zinc-300">Buscar por número, nome ou telefone<input value={query} onChange={e => setQuery(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white" /></label>
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/20 p-3 text-amber-200">{error}</p>}
    {!matches.length && <p className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-400">Nenhum pedido de retirada neste filtro.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{matches.map(order => {
      const readyAt = Date.parse(order.readyAt || '');
      const minutes = Number.isFinite(readyAt) && now >= readyAt ? Math.floor((now - readyAt) / 60000) : null;
      return <article key={order.id} className={`rounded-2xl border p-5 ${order.status === 'pronto' ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-zinc-800 bg-zinc-900/60'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-black">Pedido #{order.orderNumber}</h3><span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-cyan-200">{labels[order.status] || 'Conferir situação'}</span></div>
        <p className="mt-3 font-bold">{order.customerName}</p><p className="text-sm text-zinc-400">{order.phone}</p><p className="mt-3 whitespace-pre-line text-sm text-zinc-300">{order.itemsSummary}</p>
        {order.notes && <p className="mt-3 rounded-xl bg-amber-950/20 p-3 text-sm text-amber-200">{order.notes}</p>}
        <p className="mt-3 font-bold">{order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} <span className="text-xs font-normal text-zinc-400">· retirada sem frete</span></p>
        {order.status === 'pronto' && <p className="mt-2 text-sm text-cyan-200">{minutes === null ? 'Aguardando retirada no balcão.' : `Pronto há ${minutes} min. Confira o número do pedido ao entregar.`}</p>}
        {order.collectedAt && <p className="mt-2 text-xs text-zinc-400">Retirado em {new Date(order.collectedAt).toLocaleString('pt-BR')}</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => onDetails(order.id)} className="min-h-11 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">Ver pedido</button>
          {['recebido','preparando','pronto'].includes(order.status) && <button type="button" disabled={busy !== null} onClick={() => void advance(order)} className="min-h-11 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold disabled:opacity-50">{busy === order.id ? 'Confirmando…' : order.status === 'recebido' ? 'Iniciar preparo' : order.status === 'preparando' ? 'Pronto para retirar' : 'Confirmar retirada no balcão'}</button>}
          {!['concluido','cancelado'].includes(order.status) && <button type="button" disabled={busy !== null} onClick={() => onCancel(order.id)} className="min-h-11 rounded-xl border border-red-900 px-4 py-2 text-sm text-red-300 disabled:opacity-50">Cancelar</button>}
        </div>
      </article>;
    })}</div>
  </section>;
}
