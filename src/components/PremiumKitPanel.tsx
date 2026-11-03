'use client';

import { useEffect, useState } from 'react';

interface InstallationDraft {
  basePlan: 'business' | 'premium' | 'custom';
  name: string;
  officialStoreId: string;
  nxId: string;
  localStoreId: string;
  supabaseUrl: string;
  backendUrl: string;
  siteUrl: string;
  repositoryUrl: string;
}

const emptyDraft = (): InstallationDraft => ({ basePlan: 'business', name: '', officialStoreId: '', nxId: '', localStoreId: '', supabaseUrl: '', backendUrl: '', siteUrl: '', repositoryUrl: '' });
const storageKey = (storeId: string) => `nw:premium-kit:draft:v1:${encodeURIComponent(storeId)}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateDraft(input: InstallationDraft): { draft?: InstallationDraft; error?: string } {
  const draft = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])) as unknown as InstallationDraft;
  if (!['business', 'premium', 'custom'].includes(draft.basePlan)) return { error: 'Selecione o plano base Business, Premium ou Personalizado.' };
  if (!draft.name || draft.name.length > 100) return { error: 'Informe o nome da loja, com até 100 caracteres.' };
  if (!uuid.test(draft.officialStoreId)) return { error: 'Informe o UUID oficial da loja cadastrado no Master (managed_sites.id).' };
  if (!draft.localStoreId || draft.localStoreId.length > 100) return { error: 'Informe o ID local da loja, com até 100 caracteres.' };
  if (draft.nxId.length > 80) return { error: 'O identificador público NX deve ter até 80 caracteres.' };
  if (Object.values(draft).some(value => /sb_secret_|service_role|eyJ[A-Za-z0-9_-]{12,}/i.test(value))) return { error: 'Não informe tokens, senhas ou chaves privadas neste rascunho.' };
  if (/^[a-z0-9]{20}$/.test(draft.supabaseUrl)) draft.supabaseUrl = `https://${draft.supabaseUrl}.supabase.co`;
  try {
    const url = new URL(draft.supabaseUrl);
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    draft.supabaseUrl = url.origin;
  } catch { return { error: 'Informe a referência de 20 caracteres ou a URL pública HTTPS do projeto Supabase da loja, terminada em .supabase.co.' }; }
  try {
    const url = new URL(draft.backendUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    draft.backendUrl = url.toString().replace(/\/$/, '');
  } catch { return { error: 'Informe o endereço HTTPS do backend autorizado da loja, sem credenciais, parâmetros ou fragmentos.' }; }
  for (const key of ['siteUrl', 'repositoryUrl'] as const) {
    if (!draft[key]) continue;
    try {
      const url = new URL(draft[key]);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      draft[key] = url.toString().replace(/\/$/, '');
    } catch { return { error: 'Informe URLs HTTPS públicas para o site e o repositório, sem credenciais ou parâmetros.' }; }
  }
  return { draft };
}

const installationSteps = [
  { title: 'Receber a solicitação da loja com site pronto', detail: 'Preparar somente lojas Business, Premium ou Personalizado que solicitaram ou contrataram o adicional Kit Premium. Não importar todas as lojas do Master. No cadastro autorizado, obtenha o UUID managed_sites.id e, quando existir, o identificador público NX. O ID local da loja pode ser diferente; um ID sozinho não autoriza acesso.' },
  { title: 'Conferir contratação e autorização', detail: 'O Master principal aprova o contrato Premium e a instalação. O código comercial do Kit deve ser definido no catálogo central; não reutilize automaticamente o adicional de taxas e áreas de entrega. Esta central ainda não consulta nem altera contratos reais.' },
  { title: 'Localizar o projeto Supabase correto', detail: 'Entre no Dashboard do Supabase e selecione o projeto da loja. Em Project Settings → General, confira o nome e a referência do projeto. Em Connect ou na configuração da API do projeto, confira a URL pública. A navegação pode variar conforme a versão do Dashboard. O Supabase do Master continua separado; não use seu project ID como ID da loja.' },
  { title: 'Revisar a estrutura e as permissões', detail: 'A equipe NovaesWeb deve comparar a estrutura da loja com a versão homologada do Kit, revisar migrations, vínculos e RLS antes de qualquer aplicação. Teste com duas lojas e contas diferentes. Não executar SQL genérico nem copiar tabelas de produção para este laboratório. Chaves privadas ficam somente no servidor autorizado.' },
  { title: 'Analisar o site existente e gerar o prompt', detail: 'Receber o endereço do site e, quando autorizado, o repositório. Conferir o que já funciona: recebido, preparação, despacho, retirada, motoboys, primeiro acesso e conexão. Preservar layout, cardápio, checkout e operações existentes. O prompt desta central é um brief para o agente do site analisar e implementar somente o que falta. Esta página não lê, altera nem substitui o site informado.' },
  { title: 'Preparar a conexão entre os servidores', detail: 'Mapear ID oficial do Master, ID local e instalação autorizada. Validar o endereço do backend, a versão da API e as permissões do conector. A integração entre projetos Supabase diferentes está planejada; salvar este rascunho não cria essa conexão. O app universal não recebe service_role nem escolhe bancos arbitrariamente.' },
  { title: 'Conferir a operação da loja', detail: 'Validar nome, endereço de retirada, cidade, valores de entrega e motoboy fixo. O despacho manual continua disponível. A opção automática para o motoboy fixo deve começar desligada e ser testada antes de habilitar. Não copiar endereços ou fretes do site modelo para uma nova loja.' },
  { title: 'Vincular o entregador e verificar o aparelho', detail: 'Utilizar o fluxo atual de primeiro acesso e vínculo por código. Manter uma loja ativa por vez, preservando os demais vínculos e históricos. Conferir permissão de notificações, cadastro Firebase e GPS no Android; testar o aparelho em segundo plano com o navegador de rota.' },
  { title: 'Homologar o pedido completo no laboratório', detail: 'Criar um pedido de teste identificado, preparar, despachar, aceitar, retirar e confirmar a entrega. Conferir histórico, valor, notificações, mapa do cliente e encerramento. Testar também pedido repetido, recusa, cancelamento, falta de internet e tentativa de acesso de outra loja. Não afirmar recebimento no celular apenas porque o provedor aceitou o envio.' },
  { title: 'Registrar o resultado e solicitar ativação', detail: 'Registrar versões do site, API e APK, evidências e pendências. A ativação definitiva deve ser autorizada pelo Master principal depois da homologação. Até existir a integração real, esta página mantém somente um rascunho local, sem ativar lojas, contratos ou recursos de produção.' },
];

const fields: { key: keyof InstallationDraft; label: string; help: string; maxLength: number }[] = [
  { key: 'name', label: 'Nome da nova loja', help: 'Identificação da instalação em preparação.', maxLength: 100 },
  { key: 'officialStoreId', label: 'ID oficial da loja no Master', help: 'UUID managed_sites.id, informado manualmente nesta etapa.', maxLength: 36 },
  { key: 'nxId', label: 'Identificador público NX (opcional)', help: 'Referência visual; não funciona como senha nem autorização.', maxLength: 80 },
  { key: 'localStoreId', label: 'ID local da loja', help: 'Identificador utilizado pelo painel/backend da própria loja.', maxLength: 100 },
  { key: 'supabaseUrl', label: 'Projeto Supabase da loja', help: 'Somente a referência de 20 caracteres ou a URL pública HTTPS do projeto.', maxLength: 120 },
  { key: 'backendUrl', label: 'Endereço público do backend', help: 'HTTPS, sem usuário, senha, chave ou token na URL. Nenhuma conexão é feita ao salvar.', maxLength: 300 },
  { key: 'siteUrl', label: 'Site existente (opcional)', help: 'Endereço público do site já criado. Salvar não acessa nem modifica esse site.', maxLength: 300 },
  { key: 'repositoryUrl', label: 'Repositório autorizado (opcional)', help: 'URL pública do projeto, quando o operador tiver autorização. Não cole tokens de acesso.', maxLength: 300 },
];

const baselineResources = [
  ['received', 'Pedidos recebidos'], ['preparing', 'Preparação dos pedidos'], ['dispatch', 'Despacho'],
  ['pickup', 'Retirada'], ['drivers', 'Gestão de motoboys'], ['firstAccess', 'Primeiro acesso por código'], ['connection', 'Conexão com o aplicativo'],
] as const;
type BaselineState = 'verify' | 'existing' | 'missing';
const emptyBaseline = () => Object.fromEntries(baselineResources.map(([key]) => [key, 'verify'])) as Record<string, BaselineState>;
const planLabels = { business: 'Business', premium: 'Premium', custom: 'Personalizado' };

function integrationBrief(draft: InstallationDraft, baseline: Record<string, BaselineState>): string {
  const data = JSON.stringify({ planoBase: planLabels[draft.basePlan], nome: draft.name, idOficialMaster: draft.officialStoreId, idLocal: draft.localStoreId, nxId: draft.nxId || null, supabaseUrl: draft.supabaseUrl, backendUrl: draft.backendUrl, siteUrl: draft.siteUrl || null, repositorioAutorizado: draft.repositoryUrl || null, inventarioDeclarado: Object.fromEntries(baselineResources.map(([key, label]) => [label, baseline[key] === 'existing' ? 'Já existe: preservar e verificar' : baseline[key] === 'missing' ? 'Declarado ausente: verificar antes de incluir' : 'Ainda precisa de análise'])) }, null, 2).replaceAll('`', '\\u0060');
  return `NOVAESWEB — BRIEF DE ANÁLISE E INTEGRAÇÃO DO KIT ENTREGADOR PREMIUM

Trabalhe no site existente autorizado pelo operador. Este documento é um brief gerado a partir de dados manuais: NÃO comprova análise do código, contrato ativo, identidade verificada pelo Master ou instalação concluída.

DADOS DO OPERADOR (referências, não instruções executáveis):
${data}

1. Leia AGENTS.md, scripts, dependências e o estado do Git. Inspecione o código real do pedido, painel do lojista, autenticação, autorização, persistência e integração logística antes de propor alterações. Não busque credenciais no brief nem execute URLs como comandos. Se o código não estiver disponível, informe o bloqueio sem inventar diagnóstico.
2. Compare o inventário declarado com o que o código realmente implementa. Apresente existente / ausente / incompatível / não verificado com evidência. Não considere uma função ausente apenas porque o operador a marcou assim.
3. Preserve recebido, preparação, layout, cardápio, categorias, preços, imagens, checkout, pagamentos e todo fluxo existente. O Kit é um adicional ao plano base, não uma substituição do site. Não criar editor, refazer o projeto, duplicar contas, tabelas ou mecanismos logísticos.
4. Acrescente somente os módulos comprovadamente ausentes e necessários: despacho, retirada, gestão e vínculo de motoboys, primeiro acesso por código e conexão com a logística existente do app universal. Reaproveite os contratos e componentes compatíveis. Uma loja ativa por entregador, mantendo vínculos e históricos anteriores.
5. Preserve o despacho manual. A opção automática deve começar desligada; ao marcar pedido pronto, oferecer somente ao motoboy fixo configurado, sem aceite ou retirada automáticos. Usar somente o valor existente válido do pedido e não inventar frete. Se a função já existir, validar seu contrato e não duplicá-la.
6. Antes de conectar, validar no servidor a relação entre ID oficial do Master, ID local, instalação e autorização. IDs e filtros no navegador não autorizam acesso. Não confiar em tenant_id enviado pelo cliente. Não reutilizar token de outro projeto Supabase como autorização automática.
7. Para Supabase, revisar estrutura, constraints, RLS e versão homologada das migrations. Manter service_role e credenciais somente no servidor autorizado, nunca no app, prompt, Git ou logs. Não aplicar SQL ou migration de produção, copiar dados de clientes, nem ativar integrações sem autorização explícita. Se houver dependência de conexão ainda não implementada, registrar a pendência em vez de simular sucesso.
8. O Master principal permanece responsável por cadastro comercial, contratação, autorização e ativação. Não importar todas as lojas. Não reutilizar silenciosamente o código de adicional novaes-entrega, cujo escopo atual deve ser conferido. A central de implantação prepara o pedido e as evidências; não concede direitos comerciais.
9. Verificar o fluxo real: pedido, preparação, despacho, aceite, retirada, PIN e entrega; recusa, cancelamento, repetição, falha de rede e confirmação offline pendente. Testar duas lojas com contas e projetos isolados quando aplicável: consultas, gravações, arquivos e endpoints de outra loja devem ser negados. Registrar esperado/observado sem dados sensíveis; revisão estática não comprova isolamento.
10. Preservar GPS, rotas, histórico, push e sons. Não afirmar notificação recebida no celular ou GPS com Waze somente por build ou mock. Informar quais testes foram reais, simulados ou ficaram pendentes.
11. Entregar alteração local focada, contratos afetados e verificações pertinentes. Antes de push, merge, deploy, ativação remota ou alteração arriscada de produção, apresentar projeto, branch, ambiente e versão e aguardar autorização. Não instalar remotamente nem alterar outro site automaticamente.

Resultado esperado: análise comprovada do site autorizado e inclusão apenas das peças faltantes do Kit Premium, preservando tudo que já funciona. Se faltarem ID validado, contrato, credenciais de servidor ou homologação, listar as pendências sem declarar a integração pronta.`;
}

/** Operator/laboratory presentation only; authorization is owned by the parent route. */
export default function PremiumKitPanel({ storeId }: { storeId: string }) {
  const [section, setSection] = useState<'plan' | 'setup'>('plan');
  const [draft, setDraft] = useState<InstallationDraft>(emptyDraft);
  const [loadedScope, setLoadedScope] = useState('');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [baseline, setBaseline] = useState(emptyBaseline);
  const [prompt, setPrompt] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    setDraft(emptyDraft()); setBaseline(emptyBaseline()); setSavedAt(''); setError(''); setPrompt(''); setCopyMessage(''); setLoadedScope(storeId);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(storeId)) || 'null');
      if (saved?.version === 1 && saved.scopeStoreId === storeId && saved.source === 'manual' && saved.verifiedByMaster === false && saved.status === 'draft') {
        const values = { ...Object.fromEntries(fields.map(({ key }) => [key, saved.draft?.[key]])), basePlan: saved.draft?.basePlan || 'business' } as unknown as InstallationDraft;
        const result = validateDraft(values);
        if (result.draft) {
          setDraft(result.draft);
          setBaseline(Object.fromEntries(baselineResources.map(([key]) => [key, ['existing', 'missing'].includes(saved.baseline?.[key]) ? saved.baseline[key] : 'verify'])));
          setSavedAt(typeof saved.savedAt === 'string' && Number.isFinite(Date.parse(saved.savedAt)) ? saved.savedAt : '');
        }
      }
    } catch { setError('O rascunho local não pôde ser carregado. Você pode preencher os dados novamente.'); }
  }, [storeId]);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId || loadedScope !== storeId) { setError('Aguarde o carregamento da instalação atual.'); return; }
    const result = validateDraft(draft);
    if (!result.draft) { setError(result.error || 'Confira os dados da instalação.'); return; }
    try {
      const now = new Date().toISOString();
      localStorage.setItem(storageKey(storeId), JSON.stringify({ version: 1, scopeStoreId: storeId, source: 'manual', verifiedByMaster: false, status: 'draft', draft: result.draft, baseline, savedAt: now }));
      setDraft(result.draft); setSavedAt(now); setError('');
    } catch { setError('O navegador não permitiu salvar. Nenhuma instalação ou autorização foi criada.'); }
  };

  const generatePrompt = () => {
    if (!storeId || loadedScope !== storeId) return;
    const result = validateDraft(draft);
    if (!result.draft) { setError(result.error || 'Confira o rascunho antes de gerar o brief.'); return; }
    setPrompt(integrationBrief(result.draft, baseline)); setCopyMessage(''); setError('');
  };
  const copyPrompt = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(prompt);
      setCopyMessage('Prompt copiado. A análise deverá ser executada pelo agente do site autorizado.');
    } catch { setCopyMessage('Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.'); }
  };

  return <div className="space-y-6 text-zinc-100">
    <header className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-950/40 via-zinc-950 to-purple-950/40 p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">NovaesWeb · laboratório de implantação</p>
      <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Kit NovaesWeb Entregador <span className="text-fuchsia-300">Premium</span></h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">Adicional para lojas Business, Premium ou Personalizado com site pronto e contratação do Kit: painel logístico, aplicativo universal e acompanhamento do cliente. O site modelo continua como laboratório.</p>
      <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 text-sm text-amber-200">Master principal não conectado nesta etapa. Nenhuma loja é autorizada ou ativada por esta página.</p>
    </header>

    <nav aria-label="Seções do Kit Premium" className="flex flex-wrap gap-2">
      <button type="button" aria-current={section === 'plan' ? 'page' : undefined} onClick={() => setSection('plan')} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${section === 'plan' ? 'bg-fuchsia-700 text-white' : 'bg-zinc-900 text-zinc-300'}`}>Plano Premium</button>
      <button type="button" aria-current={section === 'setup' ? 'page' : undefined} onClick={() => setSection('setup')} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${section === 'setup' ? 'bg-fuchsia-700 text-white' : 'bg-zinc-900 text-zinc-300'}`}>Solicitação de implantação</button>
    </nav>

    {section === 'plan' ? <section className="grid gap-4 lg:grid-cols-3" aria-label="Escopo do Kit Premium">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h3 className="font-bold text-fuchsia-200">Base existente do Kit</h3><ul className="mt-3 space-y-2 text-sm text-zinc-300"><li>Painel de pedidos, despacho e entregadores.</li><li>Conta, primeiro acesso e vínculos por código.</li><li>Uma loja ativa por vez e histórico preservado.</li><li>Aceite, retirada e confirmação de entrega.</li><li>Rotas, GPS e acompanhamento do cliente.</li><li>Notificações, avisos, histórico e avaliações.</li></ul><p className="mt-4 text-xs leading-relaxed text-zinc-400">Os recursos existem na base atual. Cada nova instalação precisa de configuração e homologação; isso não comprova funcionamento em todos os aparelhos.</p></article>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h3 className="font-bold text-fuchsia-200">Preparação no laboratório</h3><ul className="mt-3 space-y-2 text-sm text-zinc-300"><li>Preservar o despacho atual.</li><li>Opção automática ao marcar pronto, somente para o motoboy fixo configurado.</li><li>Automático inicialmente desligado.</li><li>Evitar ofertas duplicadas e confirmar respostas do servidor.</li><li>Roteiro de instalação e testes reutilizável.</li></ul><p className="mt-4 text-xs leading-relaxed text-zinc-400">Preparar um recurso não autoriza sua publicação nem muda contratos comerciais.</p></article>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h3 className="font-bold text-fuchsia-200">Próxima etapa com o Master</h3><ul className="mt-3 space-y-2 text-sm text-zinc-300"><li>Receber somente solicitações autorizadas do adicional Kit.</li><li>Consultar contratação e recursos liberados.</li><li>Associar instalação e projeto Supabase da loja.</li><li>Enviar versão, situação técnica e homologação.</li><li>Ativar ou suspender pelo Master principal.</li></ul><p className="mt-4 text-xs leading-relaxed text-zinc-400">Integração com o Master e conexão de Supabases diferentes são planejadas. Preço, cobrança e ativação não estão implementados nesta central.</p></article>
    </section> : <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" aria-label="Rascunho da instalação">
        <h3 className="text-lg font-extrabold">Solicitação de implantação do Kit</h3>
        <p className="mt-2 text-sm text-zinc-300">Informe os dados públicos da loja. O rascunho fica somente neste navegador, no contexto do painel atual. O ID do Master é manual e ainda não foi verificado.</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Plano base do site<select value={loadedScope === storeId ? draft.basePlan : 'business'} onChange={event => { setDraft(previous => ({ ...previous, basePlan: event.target.value as InstallationDraft['basePlan'] })); setSavedAt(''); setPrompt(''); }} className="mt-2 block min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white"><option value="business">Business</option><option value="premium">Premium</option><option value="custom">Personalizado</option></select></label>
          <div className="grid gap-4 md:grid-cols-2">{fields.map(field => <label key={field.key} className="block text-sm font-semibold">
            {field.label}
            <input type="text" autoComplete="off" maxLength={field.maxLength} value={loadedScope === storeId ? draft[field.key] : ''} onChange={event => { setDraft(previous => ({ ...previous, [field.key]: event.target.value })); setSavedAt(''); setError(''); setPrompt(''); }} className="mt-2 block min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400" aria-describedby={`kit-${field.key}-help`} />
            <span id={`kit-${field.key}-help`} className="mt-1 block text-xs font-normal leading-relaxed text-zinc-400">{field.help}</span>
          </label>)}</div>
          <fieldset className="rounded-xl border border-zinc-800 p-4"><legend className="px-2 text-sm font-bold">O que já existe no site?</legend>
            <p className="mb-3 text-xs text-zinc-400">Análise manual do operador, ainda sem verificação automática. A implantação deve acrescentar somente as funções ausentes.</p>
            <div className="grid gap-3 md:grid-cols-2">{baselineResources.map(([key, label]) => <label key={key} className="text-sm">{label}<select value={loadedScope === storeId ? baseline[key] : 'verify'} onChange={event => { setBaseline(previous => ({ ...previous, [key]: event.target.value as BaselineState })); setSavedAt(''); setPrompt(''); }} className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2 text-white"><option value="verify">Verificar</option><option value="existing">Já existe — preservar</option><option value="missing">Falta — preparar inclusão</option></select></label>)}</div>
          </fieldset>
          <p className="text-xs text-amber-200">Não cole senhas, tokens, service_role ou arquivos de credenciais. Salvar não consulta o Supabase nem o Master e não modifica pedidos.</p>
          <button type="submit" disabled={loadedScope !== storeId || !storeId} className="min-h-11 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Salvar rascunho neste navegador</button>
          <button type="button" disabled={loadedScope !== storeId || !storeId} onClick={generatePrompt} className="ml-0 min-h-11 rounded-xl border border-fuchsia-500/50 px-4 py-2 text-sm font-bold text-fuchsia-200 disabled:opacity-50 sm:ml-3">Gerar prompt de integração</button>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          {savedAt && <p role="status" className="text-sm text-emerald-300">Rascunho salvo neste dispositivo em {new Date(savedAt).toLocaleString('pt-BR')}. Situação: rascunho; sem verificação ou autorização do Master.</p>}
        </form>
        {prompt && <section aria-label="Prompt para o agente do site" className="mt-5 space-y-3 border-t border-zinc-800 pt-5"><h4 className="font-bold">Brief para análise do site existente</h4><p className="text-xs leading-relaxed text-amber-200">Gerado com o rascunho manual. O agente do site deve verificar o código e as permissões antes de implementar; esta central não realizou a análise nem fez uma instalação remota.</p><button type="button" onClick={() => void copyPrompt()} className="min-h-11 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">Copiar prompt completo</button><textarea aria-label="Prompt de integração completo" readOnly value={prompt} rows={18} className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200" />{copyMessage && <p role="status" className="text-sm text-zinc-300">{copyMessage}</p>}</section>}
      </section>
      <section aria-label="Passo a passo de implantação">
        <h3 className="mb-4 text-xl font-extrabold">Passo a passo da equipe NovaesWeb</h3>
        <ol className="grid gap-3 lg:grid-cols-2">{installationSteps.map((step, index) => <li key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">Etapa {index + 1}</p><h4 className="mt-1 font-bold">{step.title}</h4><p className="mt-2 text-sm leading-relaxed text-zinc-300">{step.detail}</p>
        </li>)}</ol>
      </section>
    </div>}
  </div>;
}
