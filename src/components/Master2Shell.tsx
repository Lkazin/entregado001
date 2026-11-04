'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen, ChevronRight, ClipboardCheck, FileClock, Layers3,
  LayoutDashboard, Link2, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
  Search, ShieldCheck, Store, Workflow, X, KeyRound, ArrowRight,
} from 'lucide-react';

export type Master2Section = 'overview' | 'plans' | 'integrate' | 'stores' | 'tests' | 'contract' | 'library' | 'diagnostic' | 'history';
type StoreLink = { id: string; name: string; stage: string; completed: number[] };
const logo = 'https://raw.githubusercontent.com/Novaesweb/painel-novaes-27/main/public/images/novaesweb-logo.jpeg';
const menu = [
  { id: 'overview', text: 'Visão geral', icon: LayoutDashboard, group: 'Operação' },
  { id: 'stores', text: 'Lojas recebidas', icon: Store, group: 'Operação' },
  { id: 'integrate', text: 'Integração por loja', icon: Workflow, group: 'Implantação' },
  { id: 'library', text: 'Prompts de instalação', icon: BookOpen, group: 'Implantação' },
  { id: 'diagnostic', text: 'Diagnóstico técnico', icon: Search, group: 'Implantação' },
  { id: 'tests', text: 'Testes e homologação', icon: ClipboardCheck, group: 'Implantação' },
  { id: 'plans', text: 'Planos e recursos', icon: Layers3, group: 'Gestão' },
  { id: 'history', text: 'Histórico e auditoria', icon: FileClock, group: 'Gestão' },
  { id: 'contract', text: 'Conexão Master 1', icon: Link2, group: 'Gestão' },
] as const;

export default function Master2Shell({
  section, onNavigate, stores, selectedId, onSelectStore, onChangePin, onLogout, children,
}: {
  section: Master2Section;
  onNavigate: (section: Master2Section) => void;
  stores: StoreLink[];
  selectedId: string;
  onSelectStore: (id: string) => void;
  onChangePin: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');

  useEffect(() => {
    try { setCompact(localStorage.getItem('nw:master2:sidebar-compact') === 'true'); } catch {}
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === 'Escape') { setMobileOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const selected = stores.find(store => store.id === selectedId);
  const pending = stores.filter(store => store.stage === 'Erro/Pendência' || store.stage === 'Não iniciado').length;
  const matching = stores.filter(store =>
    (filter === 'all' || ['Erro/Pendência', 'Não iniciado'].includes(store.stage)) &&
    (store.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')) || store.id.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const currentTitle = menu.find(item => item.id === section)?.text || 'Visão geral';
  function navigate(next: Master2Section) {
    onNavigate(next); setMobileOpen(false); setSearchOpen(false); setSearch('');
  }
  function toggleCompact() {
    setCompact(previous => {
      try { localStorage.setItem('nw:master2:sidebar-compact', String(!previous)); } catch {}
      return !previous;
    });
  }

  function renderSidebar(isMobile = false) {
    const collapsed = compact && !isMobile;
    return <div className="flex h-full flex-col">
    <div className={'flex items-center border-b border-fuchsia-900/30 p-3 ' + (collapsed ? 'justify-center' : 'justify-between gap-3')}>
      <button type="button" onClick={() => navigate('overview')} title="Início do Master 2" className="flex min-w-0 items-center gap-3 text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-fuchsia-700/40 bg-white">
          {!logoFailed ? <img src={logo} alt="Logo oficial NovaesWeb" className="h-full w-full object-contain" onError={() => setLogoFailed(true)} /> : <span className="text-2xl font-black text-purple-700">N</span>}
        </span>
        {!collapsed && <span className="min-w-0"><span className="block truncate font-black tracking-tight text-white">NovaesWeb</span><span className="block text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300">Painel Master 2</span></span>}
      </button>
      {!collapsed && <button type="button" aria-label="Recolher menu" title="Recolher menu" onClick={toggleCompact} className="hidden min-h-11 min-w-11 place-items-center rounded-xl text-zinc-400 hover:bg-fuchsia-900/30 hover:text-white lg:grid"><PanelLeftClose size={19}/></button>}
    </div>
    {collapsed && <button type="button" aria-label="Expandir menu" title="Expandir menu" onClick={toggleCompact} className="mx-auto my-2 hidden min-h-11 min-w-11 place-items-center rounded-xl text-fuchsia-300 hover:bg-fuchsia-900/30 lg:grid"><PanelLeftOpen size={20}/></button>}
    <nav aria-label="Navegação principal do Master 2" className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {menu.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || menu[index - 1].group !== item.group;
        return <div key={item.id}>
          {showGroup && !collapsed && <p className="px-3 pb-2 pt-4 text-[10px] font-black uppercase tracking-[.19em] text-zinc-500">{item.group}</p>}
          {showGroup && collapsed && index !== 0 && <div className="my-3 border-t border-fuchsia-900/30"/>}
          <button type="button" title={item.text} aria-label={item.text} aria-current={section === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)} className={'flex min-h-11 w-full items-center rounded-xl text-sm font-semibold transition-colors ' +
              (collapsed ? 'justify-center px-2' : 'gap-3 px-3') + ' ' +
              (section === item.id ? 'bg-gradient-to-r from-fuchsia-700 to-purple-800 text-white shadow-lg shadow-fuchsia-950/30' : 'text-zinc-300 hover:bg-fuchsia-950/50 hover:text-white')}>
            <Icon size={19} className="shrink-0" aria-hidden="true"/>{!collapsed && <span className="flex-1 text-left">{item.text}</span>}
            {!collapsed && item.id === 'diagnostic' && pending > 0 && <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs text-amber-100">{pending}</span>}
          </button>
        </div>;
      })}
    </nav>
    {!collapsed && <div className="mx-3 mb-3 rounded-xl border border-fuchsia-800/30 bg-fuchsia-950/20 p-3">
      <p className="flex items-center gap-2 text-xs font-bold text-fuchsia-200"><ShieldCheck size={15}/> Central técnica</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">Master 1 autoriza. Master 2 acompanha a integração e a homologação.</p>
    </div>}
    <button type="button" title="Sair do Master 2" onClick={onLogout} className={'m-3 flex min-h-11 items-center rounded-xl border border-rose-900/30 px-3 text-sm font-semibold text-rose-200 hover:bg-rose-900/20 ' + (collapsed ? 'justify-center' : 'gap-3')}><LogOut size={18}/>{!collapsed && 'Sair com segurança'}</button>
  </div>;
  }

  return <main className="min-h-screen bg-[#0b0614] text-white">
    <div className={'mx-auto min-h-screen max-w-[1920px] lg:grid ' + (compact ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[270px_minmax(0,1fr)]')}>
      <aside className="hidden h-screen border-r border-fuchsia-900/30 bg-[#140d21] lg:sticky lg:top-0 lg:block">{renderSidebar()}</aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-fuchsia-900/30 bg-[#140c21]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" aria-label="Abrir menu lateral" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-fuchsia-900/50 lg:hidden"><Menu size={21}/></button>
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-fuchsia-700/30 bg-white lg:hidden">{!logoFailed ? <img src={logo} alt="NovaesWeb" className="h-full w-full object-contain" onError={() => setLogoFailed(true)}/> : <span className="font-black text-purple-700">N</span>}</span>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-fuchsia-300">Master 2 · Central de Integração</p><h1 className="truncate text-lg font-black sm:text-xl">{currentTitle}</h1></div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Buscar loja" title="Buscar loja (Ctrl+K)" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="flex min-h-11 items-center gap-2 rounded-xl border border-fuchsia-900/50 px-3 text-sm text-zinc-300 hover:bg-fuchsia-950/30"><Search size={19}/><span className="hidden xl:inline">Buscar loja</span><kbd className="hidden rounded bg-zinc-800 px-1.5 text-xs xl:inline">Ctrl K</kbd></button>
              <button type="button" title="Alterar PIN" onClick={onChangePin} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-fuchsia-900/50 text-fuchsia-200 hover:bg-fuchsia-950/30"><KeyRound size={19}/><span className="sr-only">Trocar PIN</span></button>
              <button type="button" onClick={onLogout} className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-900/40 px-3 text-sm font-bold text-rose-200 hover:bg-rose-950/30"><LogOut size={18}/><span className="hidden sm:inline">Sair</span></button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-fuchsia-900/30 px-3 py-1.5 font-semibold text-fuchsia-200">Central ativa</span>
            <button type="button" onClick={() => navigate('stores')} className="rounded-full border border-fuchsia-800/30 px-3 py-1.5 text-zinc-300 hover:border-fuchsia-500">Recebimentos oficiais</button>
            <span className="text-zinc-500">Rascunhos locais: {stores.length}</span>
            {selected && <button type="button" onClick={() => navigate('integrate')} className="max-w-full truncate rounded-full border border-fuchsia-800/40 px-3 py-1.5 text-fuchsia-200 hover:border-fuchsia-400">Loja: {selected.name} <ArrowRight size={12} className="inline"/></button>}
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </div>

    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/75"/>
      <aside className="absolute inset-y-0 left-0 w-[min(310px,88vw)] overflow-y-auto border-r border-fuchsia-900/40 bg-[#140d21] shadow-2xl">
        <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral" className="absolute right-2 top-3 z-10 grid min-h-11 min-w-11 place-items-center rounded-xl bg-zinc-900"><X size={20}/></button>
        <div className="h-full">{renderSidebar(true)}</div>
      </aside>
    </div>}

    {searchOpen && <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 px-3 pt-[8vh]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Localizar loja" className="w-full max-w-xl overflow-hidden rounded-2xl border border-fuchsia-700/50 bg-[#1a102a] shadow-2xl shadow-black">
        <div className="flex items-center gap-3 border-b border-fuchsia-900/40 p-4">
          <Search size={21} className="text-fuchsia-300"/>
          <input ref={searchRef} autoFocus aria-label="Buscar loja por nome ou UUID" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou ID da loja..." className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-500"/>
          <button type="button" aria-label="Fechar busca" onClick={() => setSearchOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-fuchsia-950/50"><X size={20}/></button>
        </div>
        <div className="flex gap-2 border-b border-fuchsia-900/30 px-4 py-3 text-xs">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={'rounded-full px-3 py-2 ' + (filter === 'all' ? 'bg-fuchsia-700 text-white' : 'bg-zinc-800 text-zinc-300')}>Todos ({stores.length})</button>
          <button type="button" aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')} className={'rounded-full px-3 py-2 ' + (filter === 'pending' ? 'bg-fuchsia-700 text-white' : 'bg-zinc-800 text-zinc-300')}>Pendentes ({pending})</button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {matching.length ? matching.map(store => <button key={store.id} type="button" onClick={() => { onSelectStore(store.id); navigate('integrate'); }} className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-fuchsia-950/50">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-purple-900/50 text-fuchsia-200"><Store size={19}/></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{store.name}</span><span className="block truncate text-xs text-zinc-400">{store.stage} · {store.completed.length}/8 etapas · {store.id}</span></span>
            <ChevronRight className="shrink-0 text-fuchsia-300" size={18}/>
          </button>) : <div className="space-y-3 px-5 py-8 text-center"><p className="text-sm text-zinc-300">Nenhum rascunho local encontrado.</p><p className="text-xs text-zinc-500">Para consultar lojas oficiais ainda não abertas neste navegador, use Lojas recebidas.</p><button type="button" onClick={() => navigate('stores')} className="rounded-xl bg-fuchsia-700 px-4 py-3 text-sm font-semibold">Abrir lojas recebidas</button></div>}
        </div>
      </section>
    </div>}
  </main>;
}
