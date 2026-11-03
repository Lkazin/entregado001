'use client';

import { useEffect, useRef, useState } from 'react';
import Master2Prompts from '@/components/Master2Prompts';

type Section = 'overview' | 'plans' | 'integrate' | 'stores' | 'tests' | 'contract' | 'library' | 'diagnostic' | 'history';
type Stage = 'Não iniciado' | 'Preparação' | 'Aguardando implementação' | 'Testes' | 'Homologação' | 'Erro/Pendência';
type Check = { checked: boolean; evidence: string };
type HistoryEntry = { at: string; action: string; version: string };
type StoreDraft = { findings: Record<string, string>; history: HistoryEntry[]; completed: number[]; id: string; name: string; plan: string; group: string; staging: string; production: string; version: string; stage: Stage; pending: string; checks: Check[] };
const diagnosticItems = ['Projeto Supabase e ambiente', 'Tabelas e funções', 'Permissões e RLS', 'API e eventos', 'Pedidos e checkout', 'Despacho e vínculo de motoboys', 'Aplicativo universal e notificações'];
const diagnosticStatuses = ['Não verificado', 'Existente e funcional', 'Existente e incompleto', 'Ausente', 'Incompatível'];
const storageKey = 'nw:master2:manual-installations:v1';
const stages: Stage[] = ['Não iniciado', 'Preparação', 'Aguardando implementação', 'Testes', 'Homologação', 'Erro/Pendência'];
const checks = ['Loja identificada corretamente', 'Entregador vinculado à loja correta', 'Pedido de teste recebido', 'Solicitação de entrega enviada', 'Notificação recebida no aparelho', 'Aceite e recusa funcionando', 'Status sincronizados', 'Retirada e entrega confirmadas', 'Ausência de pedidos duplicados', 'Isolamento entre duas lojas', 'Falhas e reconexões', 'Fluxo anterior preservado'];
const nav: [Section, string][] = [['overview', 'Visão geral'], ['plans', 'Planos e recursos'], ['integrate', 'Integrar nova loja'], ['stores', 'Lojas recebidas'], ['library', 'Biblioteca de prompts'], ['diagnostic', 'Diagnóstico técnico'], ['tests', 'Testes e homologação'], ['history', 'Histórico e auditoria'], ['contract', 'Configurações de integração']];
const input = 'mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400';
const button = 'min-h-11 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50';
function emptyStore(): StoreDraft { return { findings: {}, history: [], completed: [], id: '', name: '', plan: 'business', group: '', staging: '', production: '', version: '', stage: 'Não iniciado', pending: 'Aguardando validação oficial do Master 1 e diagnóstico do site.', checks: checks.map(() => ({ checked: false, evidence: '' })) }; }
function safeDraft(value: unknown): StoreDraft | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<StoreDraft>;
  if (typeof source.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.id) || typeof source.name !== 'string' || !source.name.trim()) return null;
  const draft = emptyStore();
  for (const key of ['id', 'name', 'plan', 'group', 'staging', 'production', 'version', 'pending'] as const) if (typeof source[key] === 'string') draft[key] = source[key]!.slice(0, key === 'pending' ? 2000 : 150);
  if (!['business', 'premium', 'custom'].includes(draft.plan)) return null;
  draft.id = draft.id.toLowerCase();
  draft.stage = stages.includes(source.stage as Stage) ? source.stage as Stage : 'Não iniciado';
  draft.checks = checks.map((_, index) => { const check = source.checks?.[index]; return { checked: check?.checked === true && typeof check.evidence === 'string' && check.evidence.trim().length > 0, evidence: typeof check?.evidence === 'string' ? check.evidence.slice(0, 2000) : '' }; });
  draft.findings = Object.fromEntries(diagnosticItems.flatMap(item => {
    const status = source.findings?.[item];
    return diagnosticStatuses.includes(status ?? '') ? [[item, status]] : [];
  })) as Record<string, string>;
  draft.completed = Array.isArray(source.completed) ? [...new Set(source.completed.filter(n => Number.isInteger(n) && n >= 0 && n < 8))] : [];
  draft.history = Array.isArray(source.history) ? source.history.slice(0, 100).filter(entry => entry && typeof entry.at === 'string' && typeof entry.action === 'string' && typeof entry.version === 'string') : [];
  if (/sb_secret_|service_role|eyJ[A-Za-z0-9_-]{12,}/i.test(JSON.stringify(draft))) return null;
  return draft;
}

export default function Master2Workspace() {
  const [auth, setAuth] = useState<'checking' | 'login' | 'ready'>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [stores, setStores] = useState<StoreDraft[]>([]);
  const [draft, setDraft] = useState<StoreDraft>(emptyStore);
  const [selectedId, setSelectedId] = useState('');
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  const sessionRequest = useRef<AbortController | null>(null);
  const selected = stores.find(store => store.id === selectedId);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController(); sessionRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch('/api/master2/session', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (alive.current) setAuth(response.ok && data.authenticated === true ? 'ready' : 'login');
    }).catch(() => { if (alive.current) { setAuth('login'); setError('Não foi possível conferir sua sessão. Entre novamente.'); } }).finally(() => clearTimeout(timeout));
    return () => { alive.current = false; controller.abort(); sessionRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (auth !== 'ready') { setStores([]); setSelectedId(''); setDraft(emptyStore()); return; }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const valid = Array.isArray(stored) ? stored.slice(0, 200).map(safeDraft).filter((value): value is StoreDraft => value !== null) : [];
      const unique = [...new Map(valid.map(store => [store.id, store])).values()];
      setStores(unique); setSelectedId(unique[0]?.id || '');
    } catch { setError('Não foi possível carregar os rascunhos deste navegador. Nenhuma loja foi alterada.'); }
  }, [auth]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    const controller = new AbortController(); sessionRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/master2/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.authenticated !== true) throw new Error(response.status === 503 ? 'O acesso exclusivo do Master 2 ainda precisa ser configurado no servidor.' : response.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Não foi possível entrar. Confira a senha do painel do lojista.');
      if (alive.current) { setPassword(''); setAuth('ready'); }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Falha ao entrar.'); }
    finally { clearTimeout(timeout); if (alive.current) setBusy(false); }
  }
  async function logout() {
    sessionRequest.current?.abort(); setAuth('login'); setPassword(''); setError(''); setSection('overview');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    try { const response = await fetch('/api/master2/session', { method: 'DELETE', signal: controller.signal }); if (!response.ok) throw new Error(); }
    catch { if (alive.current) setError('A sessão foi ocultada neste dispositivo, mas não foi possível confirmar a saída no servidor. Tente sair novamente ao recuperar a conexão.'); }
    finally { clearTimeout(timeout); }
  }
  function persist(next: StoreDraft[]) {
    if (next.some(store => !safeDraft(store))) { setSaved(false); setError('Não salve credenciais ou dados inválidos no rascunho.'); return false; }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStores(next); setSaved(true); setError(''); return true; }
    catch { setSaved(false); setError('Não foi possível salvar no navegador. O rascunho não foi confirmado.'); return false; }
  }
  function saveStore(event: React.FormEvent) {
    event.preventDefault(); setSaved(false);
    const valid = safeDraft(draft);
    if (!valid) { setError('Informe nome e UUID oficial válido, selecione Business, Premium ou Personalizado e não inclua credenciais.'); return; }
    if (stores.some(store => store.id === valid.id)) { setError('Este ID oficial já está na lista. Selecione a loja existente para acompanhar a implantação.'); return; }
    if (stores.length >= 200) { setError('O laboratório atingiu o limite de rascunhos locais. A persistência compartilhada será uma próxima etapa.'); return; }
    valid.history = [{ at: new Date().toISOString(), action: 'Rascunho cadastrado', version: valid.version }];
    if (persist([...stores, valid])) { setSelectedId(valid.id); setDraft(emptyStore()); }
  }
  function updateSelected(change: Partial<StoreDraft>) {
    if (!selected) return;
    const action = change.stage ? 'Etapa: ' + change.stage : change.findings ? 'Diagnóstico manual atualizado' : change.completed ? 'Progresso dos prompts atualizado' : change.checks ? 'Checklist atualizado' : 'Pendência revisada';
    const history = change.stage || change.completed || change.findings ? [{ at: new Date().toISOString(), action, version: selected.version }, ...selected.history].slice(0, 100) : selected.history;
    persist(stores.map(store => store.id === selected.id ? { ...store, ...change, history } : store));
  }

  if (auth === 'checking') return <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-white"><p role="status">Conferindo acesso à Central NovaesWeb…</p></main>;
  if (auth === 'login') return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10 text-white"><section className="w-full max-w-md rounded-3xl border border-fuchsia-900/60 bg-zinc-900 p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">NovaesWeb · acesso exclusivo</p><h1 className="mt-3 text-3xl font-black">Master 2</h1><p className="mt-2 text-zinc-300">Central de Integração do Kit Entregador</p><p className="mt-4 text-sm text-zinc-400">Área técnica separada do painel do lojista. Use a mesma senha do painel do lojista. A sessão desta Central permanece separada.</p><form onSubmit={login} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Senha do painel do lojista<input className={input} type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={256} /></label>{error && <p role="alert" className="text-sm text-amber-300">{error}</p>}<button className={`${button} w-full`} disabled={busy}>{busy ? 'Validando acesso…' : 'Entrar na Central'}</button></form><a href="/admin" className="mt-5 inline-block text-sm text-zinc-400 underline">Voltar ao painel modelo</a></section></main>;

  return <main className="min-h-screen bg-zinc-950 text-white"><header className="border-b border-zinc-800 bg-zinc-900/70 px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">NovaesWeb · laboratório</p><h1 className="mt-1 text-2xl font-black">Master 2 — Central de Integração</h1></div><button onClick={() => void logout()} className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-sm">Sair do Master 2</button></div></header><div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[240px_1fr] lg:px-8"><aside><nav aria-label="Navegação do Master 2" className="flex flex-wrap gap-2 lg:flex-col">{nav.map(([key, label]) => <button key={key} aria-current={section === key ? 'page' : undefined} onClick={() => { setSection(key); setSaved(false); setError(''); }} className={`min-h-11 rounded-xl px-4 py-3 text-left text-sm font-bold ${section === key ? 'bg-fuchsia-700 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}>{label}</button>)}</nav><p className="mt-4 text-xs leading-relaxed text-zinc-500">Master 1 autoriza comercialmente. Master 2 prepara e documenta a integração técnica.</p></aside><div className="min-w-0 space-y-5"><div role="status" className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">Master 1 não conectado. Registros e testes abaixo são declarações manuais de laboratório, salvas apenas neste navegador. Não concedem acesso, contrato ou integração verificada.</div>{error && <p role="alert" className="rounded-xl bg-red-950/30 p-3 text-red-200">{error}</p>}{saved && <p role="status" className="text-sm text-emerald-300">Rascunho salvo neste navegador.</p>}
    {section === 'overview' && <section className="space-y-5"><h2 className="text-2xl font-black">Implantar sem reconstruir</h2><p className="text-zinc-300">Receba uma solicitação autorizada, identifique a loja pelo ID oficial, confira o que existe e prepare apenas as peças faltantes. O site modelo, o lojista e o aplicativo universal continuam com seus fluxos atuais.</p><div className="grid gap-4 sm:grid-cols-3">{[['Lojas em preparação', String(stores.length)], ['Recebidas oficialmente', '0'], ['Integradas', '0'], ['Em testes', String(stores.filter(store => store.stage === 'Testes').length)], ['Com pendência', String(stores.filter(store => store.stage === 'Erro/Pendência').length)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>)}</div><button className={button} onClick={() => setSection('integrate')}>Preparar uma nova loja</button><p className="text-sm text-zinc-400">Não há importação automática, instalação remota, execução de migrations ou ativação comercial nesta versão.</p></section>}
    {section === 'plans' && <section className="space-y-4"><h2 className="text-2xl font-black">Planos e Recursos do Kit Entregador</h2><div className="grid gap-4 md:grid-cols-2">{[['Start', 'Referência institucional. Sem fluxo de pedidos online incluído; não é elegível automaticamente ao Kit.'], ['Business', 'R$ 190/mês. Até 200 produtos, 2 administradores e 340 pedidos aceitos por mês. Excedente de R$ 0,20 por pedido aceito. Gestão e histórico de pedidos, alerta sonoro, Pix manual, dinheiro e cartão na entrega, impressão manual, retirada e entrega simples.'], ['Premium', 'R$ 270/mês. Inclui Business com até 500 produtos, 5 administradores e 750 pedidos aceitos por mês. Excedente de R$ 0,15 por pedido aceito. Acrescenta cupons simples, acompanhamento de status, pedidos agendados e gráficos básicos.'], ['Personalizado', 'Escopo definido no contrato da loja. Conferir individualmente os recursos e a autorização do adicional.']].map(([title, description]) => <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="font-black text-fuchsia-200">{title}</h3><p className="mt-2 text-sm text-zinc-300">{description}</p></article>)}</div><article className="rounded-2xl border border-fuchsia-900/60 bg-fuchsia-950/10 p-5"><h3 className="text-lg font-bold">Kit NovaesWeb Entregador — adicional</h3><p className="mt-2 text-sm text-zinc-300">Integração com o aplicativo universal, vínculo de entregadores, despacho, aceite, retirada, confirmação, histórico e acompanhamento conforme os recursos autorizados. Preço do Kit a definir. A franquia conta pedidos aceitos. Excedentes não bloqueiam pedidos e são cobrados no mês seguinte.</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-400"><li>Elegibilidade comercial: somente o Master 1 poderá confirmar contrato ativo e adicional autorizado.</li><li>Elegibilidade técnica: painel e endpoints compatíveis, identificação oficial, permissões, ambiente de homologação e testes entre lojas.</li><li>Estado atual: não verificado. Plano informado manualmente não concede permissões.</li></ul></article></section>}
    {(['integrate', 'library', 'diagnostic', 'history'] as Section[]).includes(section) && <>
      <label className="block text-sm font-semibold">Loja de referência<select className={input} value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">Selecione uma loja</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.id}</option>)}</select></label>
      {!selected && <button className={button} onClick={() => setSection('stores')}>Cadastrar referência de loja</button>}
    </>}
    {(section === 'integrate' || section === 'library') && <Master2Prompts key={selectedId + section} store={selected} library={section === 'library'} onComplete={completed => updateSelected({ completed })} />}
    {section === 'diagnostic' && <section className="space-y-4">
      <h2 className="text-2xl font-black">Diagnóstico técnico</h2>
      <p className="text-zinc-300">Modelo consultado em modo somente leitura. O Supabase do modelo possui tabelas com RLS habilitada para contas e vínculos de entregadores, convites, estado logístico e permissões da loja. Isso confirma a estrutura, sem comprovar o comportamento das políticas.</p>
      <p className="text-zinc-300">O código do modelo contém despacho, aceite, recusa, retirada e conclusão. Notificação no aparelho e isolamento entre duas lojas exigem homologação.</p>
      {selected && <p className="break-words text-amber-200">{selected.name} · Grupo {selected.group || 'pendente'} · Homologação {selected.staging || 'pendente'} · Produção {selected.production || 'pendente'}. Tabelas, RLS, APIs e funções desta loja aguardam auditoria autorizada.</p>}
      {selected && <div className="grid gap-3 sm:grid-cols-2">{diagnosticItems.map(item => <label key={item} className="block text-sm font-semibold">{item}<select className={input} value={selected.findings?.[item] || 'Não verificado'} onChange={event => updateSelected({ findings: { ...selected.findings, [item]: event.target.value } })}>{diagnosticStatuses.map(status => <option key={status}>{status}</option>)}</select></label>)}</div>}
      <button className={button} onClick={() => setSection('integrate')}>Abrir instruções de auditoria</button>
    </section>}
    {section === 'history' && <section className="space-y-4">
      <h2 className="text-2xl font-black">Histórico e auditoria</h2>
      <p className="text-zinc-400">Histórico local do operador do laboratório. Auditoria central e identificação individual dependem da integração futura.</p>
      {selected?.history.length ? <ol className="space-y-2">{selected.history.map((entry, index) => <li key={entry.at + index} className="rounded-xl border border-zinc-800 p-3 break-words"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('pt-BR')}</time> · {entry.action} · Versão {entry.version || 'pendente'}</li>)}</ol> : <p>Nenhuma alteração registrada para a seleção.</p>}
    </section>}
    {section === 'stores' && <section className="space-y-5"><h2 className="text-2xl font-black">Lojas recebidas</h2><p className="text-sm text-zinc-400">Cadastre apenas referências de solicitações recebidas. Nenhum registro será tratado como recebido ou aprovado pelo Master 1 até existir comunicação autenticada.</p><form onSubmit={saveStore} className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2">{([['id', 'ID oficial da loja (UUID)'], ['name', 'Nome da loja'], ['group', 'Grupo Supabase — referência pública'], ['staging', 'Projeto de homologação — referência pública'], ['production', 'Projeto de produção — referência pública'], ['version', 'Versão declarada — não verificada']] as const).map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}<input className={input} value={draft[key]} required={key === 'id' || key === 'name'} maxLength={150} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}<label className="text-sm font-semibold">Plano declarado<select className={input} value={draft.plan} onChange={event => setDraft(previous => ({ ...previous, plan: event.target.value }))}><option value="business">Business</option><option value="premium">Premium</option><option value="custom">Personalizado</option></select></label><div className="flex items-end"><button className={button}>Registrar rascunho manual</button></div></form>{!stores.length ? <p className="text-zinc-400">Nenhuma loja registrada neste navegador.</p> : <><label className="block text-sm font-semibold">Selecionar loja<select className={input} value={selectedId} onChange={event => { setSelectedId(event.target.value); setSaved(false); }}>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.id}</option>)}</select></label>{selected && <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="text-xl font-bold">{selected.name}</h3><dl className="grid gap-3 break-words text-sm sm:grid-cols-2">{[['ID oficial informado', selected.id], ['Plano declarado', selected.plan], ['Grupo', selected.group || 'Não informado'], ['Homologação', selected.staging || 'Não informada'], ['Produção', selected.production || 'Não informada'], ['Versão declarada', selected.version || 'Não verificada'], ['Kit', 'Autorização oficial pendente'], ['Prompts concluídos', selected.completed.length + '/8']].map(([key, value]) => <div key={key}><dt className="text-zinc-400">{key}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><label className="block text-sm font-semibold">Etapa de preparação manual<select className={input} value={selected.stage} onChange={event => updateSelected({ stage: event.target.value as Stage })}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label><label className="block text-sm font-semibold">Pendências e próximo passo<textarea className={input} rows={4} maxLength={2000} value={selected.pending} onChange={event => updateSelected({ pending: event.target.value })} /></label><p className="text-xs text-amber-300">“Integrado” não pode ser confirmado por este rascunho. Requer evidências verificadas, autorização e registro oficial no backend futuro.</p><button className={button} onClick={() => setSection('tests')}>Abrir checklist desta loja</button></article>}</> }</section>}
    {section === 'tests' && <section className="space-y-5"><h2 className="text-2xl font-black">Homologação</h2><p className="text-sm text-zinc-300">Execute primeiro em homologação. Uma marcação é apenas uma declaração do operador; não equivale a teste automatizado, isolamento comprovado ou recebimento real de notificação.</p>{stores.length > 0 && <label className="block text-sm">Loja em análise<select className={input} value={selectedId} onChange={event => setSelectedId(event.target.value)}>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.id}</option>)}</select></label>}{!selected ? <p className="rounded-xl border border-zinc-800 p-5 text-zinc-400">Registre uma loja em Lojas e pendências para preencher o checklist.</p> : <div className="space-y-3">{checks.map((label, index) => <article key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-fuchsia-600" disabled={!selected.checks[index].evidence.trim()} checked={selected.checks[index].checked} onChange={event => updateSelected({ checks: selected.checks.map((check, position) => position === index ? { ...check, checked: event.target.checked } : check) })} />{index + 1}. {label}</label><label className="mt-3 block text-xs text-zinc-400">Evidência manual sem dados pessoais ou credenciais<textarea className={input} rows={2} maxLength={2000} value={selected.checks[index].evidence} onChange={event => updateSelected({ checks: selected.checks.map((check, position) => position === index ? { evidence: event.target.value, checked: event.target.value.trim() ? check.checked : false } : check) })} /></label></article>)}<p className="text-sm text-fuchsia-200">{selected.checks.filter(check => check.checked).length}/12 itens declarados. Aprovação de produção permanece pendente.</p></div>}</section>}
    {section === 'contract' && <section className="space-y-4"><h2 className="text-2xl font-black">Comunicação com o Master 1</h2><p className="text-zinc-300">Receptor de demonstração disponível apenas com configuração explícita em ambiente de teste. Ele valida a assinatura e devolve um recibo, sem cadastrar lojas. O fluxo oficial ainda aguarda conexão com o Master 1.</p><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="font-bold">Master 1 → Master 2</h3><p className="mt-2 text-sm text-zinc-400">ID do evento, ID oficial da loja, nome, domínio, plano, status, adicionais autorizados, grupo e projetos Supabase, revisão do contrato e versão da integração.</p><h3 className="mt-5 font-bold">Master 2 → Master 1</h3><p className="mt-2 text-sm text-zinc-400">Estado técnico, versão homologada, pendências e referências das evidências. O Master 1 continua responsável pela autorização comercial.</p><h3 className="mt-5 font-bold">Condições obrigatórias</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-400"><li>Autenticação entre servidores, emissor e destinatário validados, prazo curto e proteção contra repetição.</li><li>Chave única de evento e atualização idempotente pelo ID oficial da loja.</li><li>Mapeamento autorizado entre loja, instalação, ambiente e projeto. Não confiar em IDs escolhidos pelo navegador.</li><li>Auditoria de origem, versão, operador e resultado; sem tokens ou dados pessoais nos registros.</li><li>Revogação bloqueia novos acessos, preservando históricos necessários.</li></ul></div><p className="text-sm text-amber-200">Banco compartilhado, credenciais entre Masters, políticas RLS e liberação de produção serão uma etapa separada, após aprovação.</p></section>}
  </div></div></main>;
}
