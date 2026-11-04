'use client';

import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock3, Globe2, Layers3, Store, Workflow } from 'lucide-react';

type Stage = 'Não iniciado' | 'Preparação' | 'Aguardando implementação' | 'Testes' | 'Homologação' | 'Erro/Pendência';
type StorePreview = { id: string; name: string; plan: string; stage: Stage; pending: string; history: { at: string; action: string }[] };
type Section = 'overview' | 'plans' | 'integrate' | 'stores' | 'tests' | 'contract' | 'library' | 'diagnostic' | 'history';

export default function Master2Dashboard({ stores, goTo, openStore }: { stores: StorePreview[]; goTo: (section: Section) => void; openStore: (id: string) => void }) {
  const prep = stores.filter(s => ['Preparação', 'Aguardando implementação'].includes(s.stage)).length;
  const tests = stores.filter(s => ['Testes', 'Homologação'].includes(s.stage)).length;
  const pending = stores.filter(s => s.stage === 'Erro/Pendência').length;
  const started = stores.filter(s => s.stage !== 'Não iniciado').length;
  const progress = stores.length ? Math.round(started / stores.length * 100) : 0;
  const events = stores.flatMap(s => s.history.map(h => ({ ...h, storeName: s.name }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const card = 'rounded-2xl border border-fuchsia-900/40 bg-[#1a102a] shadow-xl shadow-black/10';
  const metrics = [
    { title: 'Rascunhos locais', count: stores.length, note: 'Lojas neste navegador', Icon: Store, tone: 'text-purple-300', target: 'stores' as Section },
    { title: 'Em preparação', count: prep, note: 'Etapas em andamento', Icon: Layers3, tone: 'text-fuchsia-300', target: 'integrate' as Section },
    { title: 'Em testes', count: tests, note: 'Ainda sem homologação oficial', Icon: CheckCircle2, tone: 'text-emerald-300', target: 'tests' as Section },
    { title: 'Pendências', count: pending, note: 'Precisam de atenção', Icon: AlertTriangle, tone: 'text-rose-300', target: 'diagnostic' as Section },
  ];
  return <section className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ title, count, note, Icon, tone, target }) => <button type="button" key={title} onClick={() => goTo(target)} title={"Abrir " + title} className={card + ' flex min-h-32 w-full items-center gap-4 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-fuchsia-500 hover:bg-[#241334] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400'}><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-fuchsia-950/50"><Icon size={26} className={tone} /></div><div><p className="text-sm text-zinc-300">{title}</p><p className="mt-1 text-3xl font-black tabular-nums">{count}</p><p className="text-xs text-zinc-500">{note}</p></div><ArrowRight size={16} className="ml-auto shrink-0 text-fuchsia-400" /></button>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <article className={card + ' min-w-0 overflow-hidden'}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-fuchsia-900/30 p-5"><div><h2 className="text-xl font-black">Lojas da Central</h2><p className="mt-1 text-xs text-zinc-400">Preparação local • recebimentos oficiais na aba Lojas recebidas</p></div><button className="min-h-11 rounded-xl bg-fuchsia-700 px-4 font-bold hover:bg-fuchsia-600" onClick={() => goTo('stores')}>Ver lojas recebidas</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[610px] text-left text-sm"><thead className="bg-fuchsia-950/25 text-xs uppercase text-zinc-400"><tr><th className="px-5 py-4">Loja / ID</th><th className="px-4 py-4">Plano</th><th className="px-4 py-4">Etapa manual</th><th className="px-4 py-4">Ação</th></tr></thead><tbody>{stores.slice(0, 8).map(s => <tr key={s.id} className="border-t border-fuchsia-900/20"><td className="px-5 py-4"><p className="font-bold">{s.name}</p><p className="mt-1 font-mono text-xs text-zinc-500">{s.id.slice(0, 13)}…</p></td><td className="px-4 py-4"><span className="rounded-full bg-purple-900/50 px-3 py-1 text-xs font-bold capitalize">{s.plan}</span></td><td className="px-4 py-4"><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (s.stage === 'Erro/Pendência' ? 'bg-rose-900/40 text-rose-200' : ['Testes','Homologação'].includes(s.stage) ? 'bg-sky-900/40 text-sky-200' : 'bg-amber-900/30 text-amber-200')}>{s.stage}</span></td><td className="px-4 py-4"><button className="min-h-11 rounded-xl border border-fuchsia-700/40 px-3 text-fuchsia-200" aria-label={'Abrir integração de ' + s.name} onClick={() => openStore(s.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table>{stores.length === 0 && <p className="p-8 text-center text-sm text-zinc-400">Nenhum rascunho neste navegador. Consulte as lojas oficiais em Lojas recebidas.</p>}</div></article>
      <div className="space-y-5"><article className={card + ' p-5'}><h2 className="text-lg font-bold">Status da preparação</h2><div className="mt-5 flex items-center gap-5"><div className="grid h-28 w-28 shrink-0 place-items-center rounded-full p-3" style={{ background: 'conic-gradient(#c026d3 ' + progress + '%, #312243 0)' }}><div className="grid h-full w-full place-items-center rounded-full bg-[#1a102a] text-xl font-black">{progress}%</div></div><div className="space-y-2 text-xs text-zinc-300"><p>● Preparação: {prep}</p><p>● Em testes: {tests}</p><p>● Pendências: {pending}</p><p>● Total de rascunhos: {stores.length}</p></div></div><p className="mt-4 text-xs text-zinc-500">Indicador local. Não representa integrações oficialmente homologadas.</p></article>
      <article className={card + ' p-5'}><h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle size={19} className="text-amber-400" /> Pendências</h2><p className="mt-3 text-sm text-zinc-300">{pending ? pending + ' rascunho(s) em erro ou pendência.' : 'Nenhum rascunho marcado com erro.'}</p><button className="mt-4 text-sm font-bold text-fuchsia-300" onClick={() => goTo('diagnostic')}>Abrir diagnóstico →</button></article></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <article className={card + ' p-5'}><h2 className="text-xl font-black">Ações rápidas</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Integrar loja', detail: 'Iniciar ou continuar', Icon: Workflow, section: 'integrate' as Section },
        { label: 'Domínios', detail: 'Ver dados oficiais', Icon: Globe2, section: 'stores' as Section },
        { label: 'Gerar prompts', detail: 'Oito etapas técnicas', Icon: BookOpen, section: 'library' as Section },
        { label: 'Homologação', detail: 'Checklist e evidências', Icon: ClipboardCheck, section: 'tests' as Section },
      ].map(({ label, detail, Icon, section }) => <button key={label} onClick={() => goTo(section)} className="min-h-36 rounded-xl border border-fuchsia-700/40 bg-gradient-to-br from-fuchsia-950/50 to-purple-950/40 p-4 text-center hover:border-fuchsia-400"><Icon className="mx-auto text-fuchsia-300" size={26}/><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-zinc-400">{detail}</p></button>)}</div></article>
      <article className={card + ' p-5'}><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-black">Últimos eventos locais</h2><button className="text-xs text-fuchsia-300" onClick={() => goTo('history')}>Ver histórico →</button></div><div className="mt-4 space-y-3">{events.length ? events.map((event,index) => <div className="flex gap-3 text-sm" key={event.at + index}><Clock3 size={17} className="mt-0.5 shrink-0 text-fuchsia-400" /><div><p>{event.storeName}: {event.action}</p><p className="mt-1 text-xs text-zinc-500">{new Date(event.at).toLocaleString('pt-BR')}</p></div></div>) : <p className="text-sm text-zinc-400">Nenhuma alteração local. Eventos oficiais ficam em Lojas recebidas.</p>}</div></article>
    </div>
    <p className="text-xs text-zinc-500">O Master 1 autoriza comercialmente. Um rascunho ou uma marcação manual não ativa o Kit Entregador.</p>
  </section>;
}
