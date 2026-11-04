'use client';

import { useEffect, useRef, useState } from 'react';
import Master2Connection, { type ReceivedStore } from '@/components/Master2Connection';
import Master2Prompts from '@/components/Master2Prompts';
import Master2Dashboard from '@/components/Master2Dashboard';
import { BookOpen, ClipboardCheck, FileClock, Layers3, LayoutDashboard, Link2, Search, ShieldCheck, Store, Workflow } from 'lucide-react';

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
const nav: [Section, string, typeof LayoutDashboard][] = [['overview', 'Dashboard', LayoutDashboard], ['stores', 'Lojas recebidas', Store], ['integrate', 'Integração por loja', Workflow], ['plans', 'Planos e recursos', Layers3], ['library', 'Biblioteca de prompts', BookOpen], ['diagnostic', 'Diagnóstico técnico', Search], ['tests', 'Testes / Homologação', ClipboardCheck], ['history', 'Histórico e auditoria', FileClock], ['contract', 'Conectar Master 1', Link2]];
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
  const [changePin, setChangePin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinMessage, setPinMessage] = useState('');
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
      if (!response.ok || data.authenticated !== true) throw new Error(response.status === 503 ? 'O acesso exclusivo do Master 2 ainda precisa ser configurado no servidor.' : response.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Não foi possível entrar. Confira o PIN do Master 2.');
      if (alive.current) { setPassword(''); setAuth('ready'); }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Falha ao entrar.'); }
    finally { clearTimeout(timeout); if (alive.current) setBusy(false); }
  }
  async function updatePin(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setPinMessage('');
    try {
      const response = await fetch('/api/master2/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, newPin }),
      });
      const data = await response.json();
      setPinMessage(response.ok ? 'PIN atualizado.' : data.error || 'Falha ao trocar o PIN.');
      if (response.ok) { setPassword(''); setNewPin(''); setChangePin(false); }
    } catch { setPinMessage('Falha na conexão. Confira o acesso antes de tentar novamente.'); }
    finally { setBusy(false); }
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
  function openReceivedStore(store: ReceivedStore) {
    const existing = stores.find(item => item.id === store.id);
    const next = safeDraft({ ...emptyStore(), ...existing, ...store.profile, id: store.id });
    if (!next || !persist([...stores.filter(item => item.id !== store.id), next])) return;
    setSelectedId(store.id);
    setSection('integrate');
  }

  function openDemo() {
    const id = 'd0e00000-0000-4000-8000-000000000001';
    if (!stores.some(store => store.id === id)) {
      const demo = {
        ...emptyStore(),
        id,
        name: 'Hamburgueria Horizonte (demonstração)',
        group: 'Grupo fictício',
        pending: 'Reutilizar pedidos e checkout. Preparar despacho e vínculo de motoboys.',
        findings: { 'Pedidos e checkout': 'Existente e funcional', 'Despacho e vínculo de motoboys': 'Ausente' },
        history: [{ at: new Date().toISOString(), action: 'Demonstração cadastrada', version: '' }],
      };
      if (!persist([...stores, demo])) return;
    }
    setSelectedId(id);
    setSection('integrate');
  }

  function updateSelected(change: Partial<StoreDraft>) {
    if (!selected) return;
    const action = change.stage ? 'Etapa: ' + change.stage : change.findings ? 'Diagnóstico manual atualizado' : change.completed ? 'Progresso dos prompts atualizado' : change.checks ? 'Checklist atualizado' : 'Pendência revisada';
    const history = change.stage || change.completed || change.findings ? [{ at: new Date().toISOString(), action, version: selected.version }, ...selected.history].slice(0, 100) : selected.history;
    persist(stores.map(store => store.id === selected.id ? { ...store, ...change, history } : store));
  }

  if (auth === 'checking') return <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-white"><p role="status">Conferindo acesso à Central NovaesWeb…</p></main>;
  if (auth === 'login') return <main className="grid min-h-screen bg-[#0b0614] text-white lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
    <section className="relative flex min-h-[340px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#210c38] via-[#160925] to-[#0b0614] p-7 sm:p-12 lg:min-h-screen lg:p-16">
      <div className="pointer-events-none absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" /><div className="pointer-events-none absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-purple-700/20 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-800 text-3xl font-black">N</div><div><p className="text-2xl font-black italic">NovaesWeb</p><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">Painel Master 2</p></div></div>
      <div className="relative my-8 max-w-xl"><p className="mb-4 inline-flex items-center gap-2 rounded-full border border-fuchsia-600/40 bg-fuchsia-900/25 px-4 py-2 text-xs font-bold uppercase tracking-widest text-fuchsia-200"><ShieldCheck size={14}/> Central técnica NovaesWeb</p><h1 className="text-4xl font-black leading-tight sm:text-5xl">Bem-vindo ao <span className="text-fuchsia-400">Painel Master 2</span></h1><p className="mt-5 text-base leading-relaxed text-zinc-300">Você está entrando na Central de Integração: lojas recebidas do Master 1, domínios, instalação do Kit Entregador, diagnóstico e homologação.</p>
      <div className="mt-8 space-y-4 text-sm text-zinc-200"><p className="flex items-center gap-3"><Store size={19} className="text-fuchsia-400"/> Recebimento e acompanhamento de lojas</p><p className="flex items-center gap-3"><Workflow size={19} className="text-fuchsia-400"/> Integração técnica por loja</p><p className="flex items-center gap-3"><ClipboardCheck size={19} className="text-fuchsia-400"/> Testes e homologação</p><p className="flex items-center gap-3"><Link2 size={19} className="text-fuchsia-400"/> Conexão oficial com Master 1</p></div></div>
      <p className="relative text-sm text-zinc-400">NovaesWeb • Tecnologia que impulsiona o seu negócio</p>
    </section>
    <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md rounded-3xl border border-fuchsia-900/40 bg-[#1a1129] p-7 shadow-2xl shadow-black/40">
      <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">Acesso restrito</p><h2 className="mt-3 text-3xl font-black">Entrar no Painel Master 2</h2><p className="mt-3 text-sm leading-relaxed text-zinc-400">Área exclusiva para integração e homologação. Entre com o PIN do Master 2.</p>
      <form onSubmit={login} className="mt-7 space-y-4"><label className="block text-sm font-semibold">PIN do Painel Master 2<input className={input} type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} inputMode="numeric" pattern="[0-9]{1,6}" maxLength={6} /></label>{error && <p role="alert" className="rounded-xl bg-amber-950/30 p-3 text-sm text-amber-200">{error}</p>}<button className={button + ' w-full'} disabled={busy}>{busy ? 'Validando acesso…' : 'Entrar no Painel Master 2 →'}</button></form>
      <div className="mt-8 border-t border-fuchsia-900/40 pt-5"><p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Outro ambiente disponível</p><a href="/admin" className="mt-3 flex min-h-12 items-center justify-between rounded-xl border border-fuchsia-800/40 bg-[#261537] px-4 text-sm font-bold text-fuchsia-100 hover:border-fuchsia-500"><span>Acessar painel modelo Bella Pizza</span><span aria-hidden="true">→</span></a><p className="mt-2 text-xs text-zinc-500">Acesso já existente, separado do Painel Master 2.</p></div>
    </div><p className="mt-6 text-xs text-zinc-600">© 2026 NovaesWeb • Todos os direitos reservados</p></section>
  </main>;

  return <main className="min-h-screen bg-[#0b0614] text-white"><header className="border-b border-fuchsia-900/30 bg-gradient-to-r from-[#160a27] to-[#210e31] px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-800 text-2xl font-black">N</div><div><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">NovaesWeb · Área administrativa</p><h1 className="mt-1 text-2xl font-black">Central de Integração — Master 2</h1></div></div><button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4" onClick={() => { setChangePin(!changePin); setPinMessage(''); setPassword(''); setNewPin(''); }}>Trocar PIN</button><button onClick={() => void logout()} className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-sm">Sair do Master 2</button></div></header><div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[245px_minmax(0,1fr)] lg:px-8"><aside className="self-start rounded-2xl border border-fuchsia-900/30 bg-[#170e27] p-3 lg:sticky lg:top-4"><nav aria-label="Navegação do Master 2" className="flex flex-wrap gap-2 lg:flex-col">{nav.map(([key, label, Icon]) => <button key={key} aria-current={section === key ? 'page' : undefined} onClick={() => { setSection(key); setSaved(false); setError(''); }} className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${section === key ? 'bg-gradient-to-r from-fuchsia-700 to-purple-800 text-white' : 'text-zinc-300 hover:bg-fuchsia-950/30'}`}><Icon size={17} aria-hidden="true" />{label}</button>)}</nav><p className="mt-4 text-xs leading-relaxed text-zinc-500">Master 1 autoriza comercialmente. Master 2 prepara e documenta a integração técnica.</p></aside><div className="min-w-0 space-y-5">{pinMessage && <p role="status">{pinMessage}</p>}{changePin && <form onSubmit={updatePin} className="space-y-3 rounded-xl border border-zinc-700 p-4">
    <label className="block">PIN atual<input className={input} type="password" inputMode="numeric" autoComplete="current-password" required pattern="[0-9]{1,6}" maxLength={6} value={password} onChange={event => setPassword(event.target.value.replace(/[^0-9]/g, ''))} /></label>
    <label className="block">Novo PIN (até seis dígitos)<input className={input} type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{1,6}" maxLength={6} value={newPin} onChange={event => setNewPin(event.target.value.replace(/[^0-9]/g, ''))} /></label>
    <button className={button} disabled={busy}>Salvar novo PIN</button>
  </form>}<div role="status" className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">Etapas e testes são rascunhos locais. Os recebimentos oficiais estão em Lojas recebidas.</div>{error && <p role="alert" className="rounded-xl bg-red-950/30 p-3 text-red-200">{error}</p>}{saved && <p role="status" className="text-sm text-emerald-300">Rascunho salvo neste navegador.</p>}
    {section === 'overview' && <Master2Dashboard stores={stores} goTo={setSection} openStore={id => { setSelectedId(id); setSection('integrate'); }} />}
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
    {section === 'stores' && <Master2Connection onSelect={openReceivedStore} />}
    {section === 'stores' && <section className="space-y-5"><h2 className="text-2xl font-black">Lojas recebidas</h2><p className="text-sm text-zinc-400">Cadastre apenas referências de solicitações recebidas. Nenhum registro será tratado como recebido ou aprovado pelo Master 1 até existir comunicação autenticada.</p><form onSubmit={saveStore} className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2">{([['id', 'ID oficial da loja (UUID)'], ['name', 'Nome da loja'], ['group', 'Grupo Supabase — referência pública'], ['staging', 'Projeto de homologação — referência pública'], ['production', 'Projeto de produção — referência pública'], ['version', 'Versão declarada — não verificada']] as const).map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}<input className={input} value={draft[key]} required={key === 'id' || key === 'name'} maxLength={150} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}<label className="text-sm font-semibold">Plano declarado<select className={input} value={draft.plan} onChange={event => setDraft(previous => ({ ...previous, plan: event.target.value }))}><option value="business">Business</option><option value="premium">Premium</option><option value="custom">Personalizado</option></select></label><div className="flex items-end"><button className={button}>Registrar rascunho manual</button></div></form>{!stores.length ? <p className="text-zinc-400">Nenhuma loja registrada neste navegador.</p> : <><label className="block text-sm font-semibold">Selecionar loja<select className={input} value={selectedId} onChange={event => { setSelectedId(event.target.value); setSaved(false); }}>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.id}</option>)}</select></label>{selected && <article className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="text-xl font-bold">{selected.name}</h3><dl className="grid gap-3 break-words text-sm sm:grid-cols-2">{[['ID oficial informado', selected.id], ['Plano declarado', selected.plan], ['Grupo', selected.group || 'Não informado'], ['Homologação', selected.staging || 'Não informada'], ['Produção', selected.production || 'Não informada'], ['Versão declarada', selected.version || 'Não verificada'], ['Kit', 'Autorização oficial pendente'], ['Prompts concluídos', selected.completed.length + '/8']].map(([key, value]) => <div key={key}><dt className="text-zinc-400">{key}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><label className="block text-sm font-semibold">Etapa de preparação manual<select className={input} value={selected.stage} onChange={event => updateSelected({ stage: event.target.value as Stage })}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label><label className="block text-sm font-semibold">Pendências e próximo passo<textarea className={input} rows={4} maxLength={2000} value={selected.pending} onChange={event => updateSelected({ pending: event.target.value })} /></label><p className="text-xs text-amber-300">“Integrado” não pode ser confirmado por este rascunho. Requer evidências verificadas, autorização e registro oficial no backend futuro.</p><button className={button} onClick={() => setSection('tests')}>Abrir checklist desta loja</button></article>}</> }</section>}
    {section === 'tests' && <section className="space-y-5"><h2 className="text-2xl font-black">Homologação</h2><p className="text-sm text-zinc-300">Execute primeiro em homologação. Uma marcação é apenas uma declaração do operador; não equivale a teste automatizado, isolamento comprovado ou recebimento real de notificação.</p>{stores.length > 0 && <label className="block text-sm">Loja em análise<select className={input} value={selectedId} onChange={event => setSelectedId(event.target.value)}>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.id}</option>)}</select></label>}{!selected ? <p className="rounded-xl border border-zinc-800 p-5 text-zinc-400">Registre uma loja em Lojas e pendências para preencher o checklist.</p> : <div className="space-y-3">{checks.map((label, index) => <article key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-fuchsia-600" disabled={!selected.checks[index].evidence.trim()} checked={selected.checks[index].checked} onChange={event => updateSelected({ checks: selected.checks.map((check, position) => position === index ? { ...check, checked: event.target.checked } : check) })} />{index + 1}. {label}</label><label className="mt-3 block text-xs text-zinc-400">Evidência manual sem dados pessoais ou credenciais<textarea className={input} rows={2} maxLength={2000} value={selected.checks[index].evidence} onChange={event => updateSelected({ checks: selected.checks.map((check, position) => position === index ? { evidence: event.target.value, checked: event.target.value.trim() ? check.checked : false } : check) })} /></label></article>)}<p className="text-sm text-fuchsia-200">{selected.checks.filter(check => check.checked).length}/12 itens declarados. Aprovação de produção permanece pendente.</p></div>}</section>}
    {section === 'contract' && <Master2Connection onSelect={openReceivedStore} />}
  </div></div></main>;
}
