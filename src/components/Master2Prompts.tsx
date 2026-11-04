'use client';

import { useState } from 'react';
import { installationSteps } from '@/lib/master2-prompts';

type Store = { id: string; name: string; plan: string; group: string; staging: string; production: string; completed: number[]; stepEvidence?: Record<string, string>; findings: Record<string, string> };
type Prompt = { title: string; text: string };

export default function Master2Prompts({ store, library, onComplete }: {
  store?: Store;
  library: boolean;
  onComplete: (completed: number[], evidence: Record<string, string>) => void;
}) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [stepEvidence, setStepEvidence] = useState<Record<string, string>>(store?.stepEvidence || {});
  const prompt = prompts[index];

  async function generate() {
    if (!store) return;
    setBusy(true);
    setMessage('');
    try {
      const { id, name, plan, group, staging, production, findings } = store;
      const response = await fetch('/api/master2/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, plan, group, staging, production, findings }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!result.verifiedReceipt || !Array.isArray(result.prompts) || result.prompts.length !== 8) throw new Error('O Master 2 não confirmou a origem oficial dos prompts.');
      setPrompts(result.prompts);
      setIndex(store.completed.length < 8 ? installationSteps.findIndex((_, step) => !store.completed.includes(step)) : 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao gerar os prompts.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt.text);
      setMessage('Prompt copiado.');
    } catch {
      setMessage('Selecione o texto do prompt e copie manualmente.');
    }
  }

  return <section className="space-y-4">
    <h2 className="text-2xl font-black">{library ? 'Biblioteca de prompts' : 'Integrar Nova Loja'}</h2>
    <p className="text-sm text-zinc-300">Gere as oito etapas somente para lojas oficialmente recebidas do Master 1. Os dados oficiais serão conferidos novamente no servidor; o progresso é manual e local, sem homologação automática.</p>
    <ol className="grid gap-2 sm:grid-cols-2">
      {installationSteps.map(([title], step) => <li key={title}>
        <button type="button" aria-pressed={index === step} className="min-h-11 w-full rounded-xl border border-zinc-700 px-3 py-2 text-left text-sm aria-pressed:border-fuchsia-400" onClick={() => setIndex(step)}>
          {step + 1}. {title}{store?.completed.includes(step) ? ' · Concluído' : ''}
        </button>
      </li>)}
    </ol>
    <p className="text-zinc-300">{installationSteps[index][1]}</p>
    <button className="min-h-11 rounded-xl bg-fuchsia-700 px-4 py-2 disabled:opacity-50" disabled={!store || busy} onClick={() => void generate()}>{busy ? 'Gerando…' : 'Gerar prompts da loja'}</button>
    {prompt && <div className="space-y-3">
      <label className="block font-semibold">{prompt.title}
        <textarea className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" rows={16} value={prompt.text} onChange={event => setPrompts(previous => previous.map((item, step) => step === index ? { ...item, text: event.target.value } : item))} />
      </label>
      <label className="block text-sm font-semibold">Evidência da execução da etapa {index + 1} (obrigatória para marcar concluída)
        <textarea className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" rows={3} maxLength={1500} placeholder="Resuma os arquivos verificados, testes executados, resultado e pendências. Não informe tokens ou senhas." value={stepEvidence[String(index)] || ''} onChange={event => setStepEvidence(previous => ({ ...previous, [String(index)]: event.target.value }))} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button className="min-h-11 rounded-xl border border-zinc-700 px-4" onClick={() => void copy()}>Copiar prompt</button>
        <button className="min-h-11 rounded-xl border border-zinc-700 px-4" onClick={() => {
          if (!store) return;
          if (store.completed.includes(index)) { onComplete(store.completed.filter(step => step !== index), stepEvidence); return; }
          if (!stepEvidence[String(index)]?.trim() || stepEvidence[String(index)].trim().length < 20) { setMessage('Registre pelo menos 20 caracteres de evidência concreta antes de concluir.'); return; }
          if (index > 0 && !store.completed.includes(index - 1)) { setMessage('Conclua a etapa anterior com evidência antes de avançar.'); return; }
          onComplete([...store.completed, index], stepEvidence);
          setMessage('Etapa registrada como conclusão manual. A homologação continua pendente.');
        }}>{store?.completed.includes(index) ? 'Reabrir etapa' : 'Marcar etapa concluída'}</button>
      </div>
    </div>}
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
  </section>;
}
