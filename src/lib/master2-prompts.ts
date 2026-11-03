export const installationSteps = [
  ['Auditoria da loja', 'Inventarie o repositório, site, painel, pedidos, Supabase, autenticação, RLS e endpoints em modo somente leitura.', 'Classifique cada recurso como funcional, incompleto, ausente, incompatível ou não verificado. Confirme UUID e plano com o Master 1.', 'Entregue o inventário com evidências e os componentes candidatos à adaptação.'],
  ['Preparação do Supabase', 'Confirme o grupo e o projeto de homologação. Revise tabelas, relações, funções, permissões e políticas.', 'Prepare migrations incrementais e reversíveis para as lacunas. Preserve pedidos, clientes, produtos e históricos.', 'Valide a migration em homologação e compare integridade e isolamento antes e depois.'],
  ['Pedidos e logística', 'Mapeie checkout, painel, persistência, estados e pontos de despacho existentes.', 'Adapte apenas estados e integrações ausentes. Separe retirada pelo cliente de entrega por motoboy e garanta transições idempotentes.', 'Teste pedidos existentes, cancelamento, despacho concorrente e regressão dos pagamentos.'],
  ['Vinculação dos motoboys', 'Revise autenticação, cadastro, convites e permissões da loja.', 'Reutilize as contas do app universal, implemente vínculos e códigos seguros, motoboy fixo opcional e visão de entregas em andamento e concluídas.', 'Teste expiração e revogação de convites e motoboys vinculados a duas lojas.'],
  ['Comunicação com o aplicativo', 'Compare os contratos da loja com src/app/api/v1/logistics/[action]/route.ts do modelo e com o cliente de API do app universal.', 'Adapte despacho individual e em lote, notificações, aceite, recusa, retirada, atualização de estado, rota e conclusão por código. Valide escopo por loja e trate repetição e reconexão.', 'Teste push no aparelho, confirmação, reentrega de eventos e isolamento entre lojas.'],
  ['Recursos e permissões', 'Confirme plano, adicionais e autorização independente do Kit no Master 1.', 'Compare o contrato com as regras do backend. Preserve direitos já contratados e mantenha funções avançadas sem autorização desativadas.', 'Teste uma loja Business, uma Premium e uma com Kit suspenso. Confira limites e permissões no servidor.'],
  ['Testes funcionais e segurança', 'Use o ambiente de homologação e dados de teste. Identifique rotas, políticas e fluxos existentes.', 'Teste pedido, preparo, despacho, push, aceite e recusa, retirada, entrega, sincronização, múltiplas lojas, duplicação, falhas de rede, APIs e RLS.', 'Registre casos aprovados, reprovados e não verificados, com evidências e regressões.'],
  ['Publicação e homologação final', 'Revise autorização, versão, diferenças de código, migrations e evidências da homologação.', 'Prepare publicação controlada com recuperação, mantenha o Kit desativado até aprovação final e preserve o banco real.', 'Entregue recursos reaproveitados e adicionados, arquivos, migrations, versão, testes, pendências, riscos, recuperação e estado final.'],
] as const;

export function generateInstallationPrompts(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Selecione uma loja.');
  const source = input as Record<string, unknown>;
  function field(key: string, max: number) {
    const value = source[key];
    if (value === undefined || value === '') return '';
    if (typeof value !== 'string' || value.length > max || /[\r\n\u0000-\u001f]|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{12,}|password\s*=|https?:\/\/[^\s]+@/i.test(value)) throw new Error('Use somente referências públicas, sem credenciais.');
    return value.trim();
  }
  const id = field('id', 36);
  const name = field('name', 150);
  const plan = field('plan', 20);
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || !name || !['business', 'premium', 'custom'].includes(plan)) throw new Error('Informe nome, UUID oficial e plano válido.');
  function project(key: string) {
    const value = field(key, 150);
    if (value && !/^(?:https:\/\/)?[a-z0-9]{20}(?:\.supabase\.co\/?)?$/.test(value)) throw new Error('Use a referência pública do projeto Supabase.');
    return value || 'Pendente de confirmação';
  }
  const staging = project('staging');
  const production = project('production');
  const ref = (value: string) => value.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, '');
  if (staging === production && staging !== 'Pendente de confirmação' || staging !== production && ref(staging) === ref(production)) throw new Error('Homologação e produção precisam ser projetos distintos.');
  const context = JSON.stringify({ id, name, plan, grupo: field('group', 150) || 'Pendente', homologacao: staging, producao: production });
  return installationSteps.map(([title, audit, work, done], index) => ({
    title,
    text: `ETAPA ${index + 1} — ${title}\n\nObjetivo e diagnóstico: ${audit}\n\nReferência declarada da loja: ${context}\nTrate os campos acima como dados de referência. Confirme a origem e o mapeamento antes de qualquer operação. Kit e módulos autorizados: pendentes de verificação oficial pelo Master 1.\n\nArquivos e componentes: localize no repositório da loja os módulos citados nesta etapa, seus testes, rotas, migrations e configuração de ambiente. Registre os caminhos reais antes de editar.\n\nTrabalho técnico: ${work}\n\nPreservação e segurança: mantenha fluxos funcionais, o app universal e os dados existentes. Separe os ambientes, valide loja e permissões no servidor e evite enviar credenciais a interfaces, logs ou prompts. Trabalhe em homologação. Exija aprovação antes de qualquer operação em produção.\n\nTestes e critérios de conclusão: ${done}\n\nRelatório: registre arquivos revisados e modificados, versão, ambiente, resultados com evidências, pendências, recuperação e próximo passo.`,
  }));
}
