'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type DemoOrder = {
  id: string; business_day: string; slot_hour: number; source: string;
  customer_label: string; status: string; items: {name: string}[]; created_at: string;
};
type LabData = {
  enabled: boolean; day: string; scheduledHours: number[]; todayCount: number;
  orders: DemoOrder[]; database: string; dispatchDisabled: boolean; checkedAt: string;
};
export default function BellaPizzaLaboratorio() {
  const [data, setData] = useState<LabData|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = () => {
    const token = sessionStorage.getItem('novaesweb_admin_token') || '';
    return { 'Content-Type': 'application/json', 'x-store-id': 'store_bella_pizza',
      ...(token ? { 'x-admin-token': token } : {}) };
  };
  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/bella-lab', { headers: headers(), cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401
      ? 'Entre no painel administrativo da Bela Pizza antes de acessar esta área.'
      : 'Laboratório indisponível. Verifique a conexão com o Supabase.');
    setData(await response.json());
  }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  async function perform(action: 'toggle'|'manual', enabled?: boolean) {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/bella-lab', {
        method: 'POST', headers: headers(), body: JSON.stringify({ action, enabled })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha inesperada.');
    } finally { setLoading(false); }
  }
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white md:p-10">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin" className="text-fuchsia-300 hover:underline">← Voltar ao painel da Bela Pizza</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Laboratório Bela Pizza</h1>
        <p className="text-zinc-400">Somente demonstração. Nenhum pedido deste laboratório entra nas vendas ou é enviado aos motoboys.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950 p-4">{error}</p>}
      {data && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Pedidos automáticos hoje</p><p className="mt-2 text-3xl font-bold">{data.todayCount} / 5</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Agendamento</p><p className="mt-2 text-xl font-bold">{data.enabled ? 'Ativo' : 'Pausado'}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Supabase</p><p className="mt-2 text-xl font-bold text-emerald-400">Conectado</p>
          </div>
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <p className="text-sm text-zinc-400">Cinco pedidos fictícios por dia, em horários variáveis de Brasília: {data.scheduledHours.map(h => h + 'h').join(' · ')}.</p>
          <p className="text-xs text-zinc-500">A agenda do Supabase roda a cada hora; se houver atraso, os horários vencidos do mesmo dia serão recuperados, sem duplicação.</p>
          <div className="flex flex-wrap gap-3">
            <button disabled={loading} onClick={() => perform('toggle', !data.enabled)}
              className="rounded-xl bg-fuchsia-700 px-5 py-3 font-semibold disabled:opacity-50">
              {data.enabled ? 'Pausar pedidos fictícios' : 'Ativar pedidos fictícios'}
            </button>
            <button disabled={loading || !data.enabled} onClick={() => perform('manual')}
              className="rounded-xl bg-zinc-700 px-5 py-3 font-semibold disabled:opacity-50">
              Criar teste manual
            </button>
            <button disabled={loading} onClick={() => refresh().catch(e => setError(e.message))}
              className="rounded-xl border border-zinc-600 px-5 py-3 disabled:opacity-50">
              Atualizar status
            </button>
          </div>
        </section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Pedidos de demonstração</h2>
          <p className="mt-1 text-sm text-zinc-400">Sem faturamento, notificações, rastreamento ou despacho real.</p>
          <div className="mt-4 space-y-2">
            {data.orders.length ? data.orders.map(order => <div key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-800 p-3">
              <div><p className="font-medium">{order.customer_label}</p>
                <p className="text-sm text-zinc-400">{order.items?.[0]?.name || 'Pizza fictícia'}</p></div>
              <p className="text-sm text-fuchsia-300">{order.business_day} · {order.slot_hour}h · {order.status} · {order.source === 'manual' ? 'Manual' : 'Automático'}</p>
            </div>) : <p className="text-zinc-400">Nenhum pedido fictício criado ainda.</p>}
          </div>
        </section>
      </>}
    </div>
  </main>;
}
