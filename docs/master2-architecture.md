# Master 2 — Central de Integração NovaesWeb

## Referência verificada para o Kit

| Peça | Referência na Bella Pizza | Adaptação da nova loja |
| --- | --- | --- |
| Pedido e estados | `src/app/api/orders/route.ts` cria, lista e atualiza pedidos. A implementação usa Storage e a projeção logística; as gravações relacionais são condicionais. | Manter checkout, persistência, clientes, pagamento e histórico existentes. Enviar apenas pedidos elegíveis ao despacho. |
| Estado central | `src/lib/logistics/state-store.ts` lê `driver_logistics_state` e usa `driver_logistics_commit` com revisão para evitar sobrescrita concorrente. | Não clonar o estado central em cada loja. Validar a rota autenticada entre projetos antes de qualquer liberação. |
| Vínculo e sessão | `driver_accounts`, `driver_account_memberships`, `driver_first_access_invites`, `invite-issue`, `invite-activate`, `account-bootstrap`. | Relacionar UUID comercial ao identificador operacional autorizado. Preservar múltiplos vínculos e revogação. |
| Operação | `offer-create`, `offers`, `offer-respond`, `assignments`, `pickup-confirm`, `delivery-confirm`, `history`. | Reutilizar o contrato da API, preservando identidade, escopo, idempotência e o formato confirmado na versão do aplicativo. |
| Push, rota e GPS | `/api/v1/driver-push/[action]`, `/api/v1/driver-route/optimize`, `route-current`, `tracking-location-push`. | Verificar capacidades efetivas e testar notificações no aparelho. Aplicar as autorizações do servidor. |

O checkout e a interface do lojista pertencem à loja. A URL configurada em `src/services/logisticsConfig.ts` e o cliente em `src/services/api.ts` do painel-moto apontam para a API do Entregador. A loja não deve trocar a URL de todo o app, emitir tokens de outra instalação ou copiar contas centrais. Para projetos distintos, o Kit exige um encaminhamento autenticado e homologado de projeções e eventos, sempre identificado pelo UUID oficial da loja. Não há comprovação de conexão ativa com outra loja pelo simples cadastro no assistente.

A leitura do Supabase do modelo confirmou as tabelas centrais e RLS habilitada. A consulta a pg_policies não retornou políticas explícitas para as cinco tabelas centrais mapeadas. O fluxo de referência passa pela API e pela autorização no servidor; valide também grants e RPCs no projeto de destino antes de homologar. A consulta de metadados do Master 1 foi recusada pelo conector. A validação do contrato comercial, das políticas efetivas entre projetos e de push/GPS no aparelho faz parte da homologação de cada instalação.

## Demonstração

Em Visão geral, selecione **Testar hamburgueria fictícia**. O rascunho Horizonte mantém pedidos e checkout como existentes e marca despacho e vínculo como ausentes. Use **Gerar prompts da loja**, copie Auditoria e confira, em Diagnóstico, as lacunas antes de avançar. Na etapa de logística, o Codex da loja preserva seus pedidos e adapta `offer-create` e a projeção; na etapa de vínculo, usa convites e contas centrais. Os resultados de homologação são anotados por etapa. O UUID fictício e os projetos pendentes não podem ser usados para uma instalação real.

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
