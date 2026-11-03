'use client';
import { useEffect, useState } from 'react';

export default function CustomerTrackingSettings({ getHeaders }: { getHeaders: () => Record<string, string> }) {
  const [config, setConfig] = useState<{ eligible: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/customer-tracking/settings', { headers: getHeaders(), cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(); if (!controller.signal.aborted) setConfig(data); })
      .catch(() => { if (!controller.signal.aborted) setMessage('Não foi possível carregar a disponibilidade do rastreamento.'); });
    return () => controller.abort();
  }, [getHeaders]);
  async function toggle() {
    if (!config?.eligible || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/customer-tracking/settings', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ enabled: !config.enabled }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível salvar.');
      setConfig({ ...config, enabled: data.enabled }); setMessage('Configuração salva.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
    <h3 className="font-bold text-white">Rastreamento para o cliente</h3>
    <p className="text-sm text-zinc-400">Após a retirada, o cliente acompanha somente a própria entrega. O mapa encerra automaticamente ao finalizar ou cancelar.</p>
    {config && <button type="button" role="switch" aria-checked={config.enabled} disabled={!config.eligible || busy} onClick={toggle}
      className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
      {busy ? 'Salvando…' : !config.eligible ? 'Disponível com o adicional Premium' : config.enabled ? 'Ativado — desativar' : 'Desativado — ativar'}
    </button>}
    <p className="text-xs text-zinc-500">A disponibilidade depende do plano da loja. A previsão de chegada é aproximada, sem trânsito ao vivo.</p>
    {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
  </section>;
}
