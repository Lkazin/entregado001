# Master 2 — Central de Integração NovaesWeb

O assistente atual gera oito prompts no servidor em `POST /api/master2/prompts`, usando a sessão do Master 2 e referências públicas validadas. O progresso, o checklist e o histórico de etapas são locais ao navegador. As edições nos textos duram enquanto a tela está aberta.

O receptor de demonstração em `POST /api/master2/integrations/events` exige a habilitação do laboratório, um segredo separado `MASTER2_DEMO_EVENT_SECRET` de pelo menos 32 caracteres e execução fora da produção Vercel. A assinatura hexadecimal HMAC-SHA256 cobre o prefixo `master1:master2-demo:`, o timestamp em milissegundos, dois-pontos e o corpo exato. Envie timestamp e assinatura em `x-master1-timestamp` e `x-master1-signature`. O evento usa `schemaVersion: 1`, `eventType: "kit.authorized"`, `storeStatus: "active"` e `kitAuthorized: true`, além das referências da loja. Repetir o mesmo corpo devolve o mesmo recibo sem gerar cadastro ou efeito. A deduplicação persistente e a devolução de status oficial pertencem ao contrato futuro.

No Supabase do modelo, a leitura de metadados confirmou RLS habilitada em `driver_accounts`, `driver_account_memberships`, `driver_first_access_invites`, `driver_logistics_state` e `store_feature_entitlements`. A consulta não validou políticas entre duas lojas nem entrega de push. Para outro projeto, confirme seu grupo e use credenciais restritas a cada ambiente em servidor. O contrato futuro transmite eventos com UUID oficial e identificador idempotente, sem replicar contas de entregadores nem compartilhar credenciais de um projeto com outro.

## Primeira etapa implementada

Área `/master2`, fora da operação do lojista e do site público. Usa a mesma senha administrativa por escolha do proprietário, a validação e o limitador existentes, mas com cookie separado, HttpOnly, SameSite Strict e restrito a `/api/master2`. Só funciona quando o laboratório está habilitado e o ID autorizado corresponde à loja assinada. O caminho diferente sozinho não constitui autorização. Metadados impedem indexação da página.

As páginas são Visão geral, Lojas recebidas, Integrar nova loja, Planos e recursos, Biblioteca de prompts, Diagnóstico técnico, Testes e homologação, Histórico e auditoria e Configurações de integração. Dados e checklists desta etapa são rascunhos locais no navegador, não dados oficiais recebidos do Master 1. Limpar o navegador apaga os rascunhos. Não há instalação automática, ativação comercial, descoberta de bancos ou homologação comprovada.

Business, Premium e Personalizado são planos base possíveis; Start aparece como referência institucional, sem presumir elegibilidade logística. O Kit exige autorização própria do catálogo comercial. A página apresenta os valores oficiais informados para Business e Premium. O Kit tem preço pendente. Recurso declarado pelo operador não equivale a direito contratado.

## Contrato futuro Master 1 → Master 2 (não implementado)

`POST /api/master2/integrations/events` receberá `schemaVersion`, `eventId`, `eventType`, `issuedAt`, `revision`, `officialStoreId`, `name`, `domain`, `basePlan`, `storeStatus`, `authorizedAddons`, `supabaseGroupId`, `stagingProjectRef`, `productionProjectRef`, `integrationVersion`. Esses campos são referências, nunca chaves de acesso. Usar UUID oficial de `managed_sites.id`, sem gerar identidade substituta.

Autenticação servidor-servidor deverá usar credencial própria, rotacionável, com emissor, audiência e prazo; assinatura validada antes de processar. Recusar emissor não autorizado, loja suspensa, adicional ausente, assinatura inválida, esquema desconhecido e revisão antiga. Deduplicar por emissor + eventId com unicidade transacional. Mesmo ID com corpo diferente deve causar conflito, sem sobrescrever. Auditar resultado e hash do evento sem credenciais nem dados de clientes. O Master 2 não cria contratos nem ativa adicionais.

Master 2 devolverá estados técnicos e versão pelo canal autenticado de retorno, com a mesma proteção de repetição e revisão. O endpoint de entrada oferece apenas a validação de demonstração descrita acima. O processamento oficial e a rota de retorno permanecem planejados. Nenhuma URL informada pelo operador será acessada automaticamente; futura verificação de endpoints deve bloquear SSRF e exigir domínio autorizado.

## Dados propostos para aprovação (nenhuma migration executada)

- Instalações: UUID oficial único, mapeamento do ID local, plano referencial, grupo, referências homologação/produção, versão e estado técnico.
- Eventos recebidos: emissor + eventId únicos, hash, revisão e processamento.
- Execuções de homologação: instalação, ambiente, versão, caso, evidência, resultado, operador e data.
- Auditoria: operador, instalação, ação, versão e data, sem segredos.

Revisar tabelas existentes no Master antes de criar qualquer duplicação. Uma execução pertence a uma instalação; referências devem ter integridade. Dados operacionais de pedidos e entregadores permanecem nos sistemas atuais. RLS e autorização servidor devem impedir acesso de lojistas/motoboys à central; operadores recebem permissões explícitas. O Master não será consultado com service_role exposta. Nenhum projeto Supabase deve confiar no tenant enviado livremente pelo navegador.

## Homologação e liberação futuras

Preparação → Aguardando implementação → Testes → Homologação → Integrado, mais Não iniciado e Erro/Pendência. Rascunho manual não pode provar autorização ou marcar integração real. Produção exige contrato vigente confirmado pelo Master 1, execução homologada para a versão específica e aprovação explícita. Suspender o módulo preserva históricos.

Testar entre duas lojas e usuários reais: leitura, escrita, arquivos, eventos, sessão e endpoints. Executar fluxo antigo, aceite/recusa, retirada, PIN, conclusão, GPS, notificações no aparelho, duplicação e reconexão. Compilação e testes simulados não comprovam isolamento real nem notificações recebidas. Publicação ou migrations são etapas autorizadas separadamente.
