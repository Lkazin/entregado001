# NovaesWeb Entregador — auditoria de prontidão de integração (2026-11-03)

## Fontes auditadas
- Master 1: `Novaesweb/painel-novaes-27`, envio autenticado, fila de sincronização, autorização comercial
- Master 2 / Bella Pizza: `Lkazin/entregado001`, oito prompts, receptor oficial, backend do modelo e rotas logísticas
- Aplicativo universal: `Lkazin/painel-moto`, `src/services/logisticsConfig.ts`, `api.ts`, `accountClient.ts`

## Confirmado em código
1. Master 1 envia uma loja por UUID oficial com HMAC, plano e revisão; Master 2 grava recebimentos oficiais.
2. O modelo implementa endpoints de logística para convites, ofertas, aceite, retirada, confirmação por código, histórico e rotas. Isso prova existência das rotas, não homologação interprojeto.
3. O app Entregador usa URL de backend central configurável; quando ausente, utiliza a URL da Bella Pizza. Não troca de origem por loja.
4. Uma loja pode ter repositório e Supabase separados; contas e vínculos do motoboy pertencem ao serviço central.
5. A tela do Master 2 mantém rascunhos/checklists locais; recebimento oficial é persistido no backend.

## Falhas/riscos detectados e medidas
- **Geração com cadastro local falsificado**: o endpoint de prompts agora valida UUID contra `master2_received_stores` e deriva nome, plano e projeto do recibo oficial. Não aceita dados comerciais falsificados no navegador.
- **Falsa conclusão de etapa**: exigir evidência textual de execução, progresso sequencial e declaração explícita de que é validação manual; não marcar "homologado" automaticamente.
- **Integração multi-Supabase não comprovada**: prompts exigem design e homologação de gateway servidor-servidor autenticado entre loja e serviço central. Nunca copiar a conta do motoboy, passar service-role ao frontend ou alterar a URL global do app para uma loja.
- **Permissão de Kit sem guard confirmado na rota logística de referência**: `src/app/api/v1/logistics/[action]/route.ts` não faz leitura direta da tabela `store_feature_entitlements`. Exigir guard efetivo no servidor, com fonte oficial do Master 1, suspensão e revogação antes de autorizar uso em uma loja cliente.
- **Versões e autorizações históricas**: recebimento no Master 2 não equivale à autorização comercial vigente.
- **Sincronização contínua**: confirmar processamento do cron de Master 1 e reconciliação de domínio, plano e revogação; recebimento manual isolado não basta.

## Critérios obrigatórios antes de instalar em loja real
1. UUID oficial, autorização vigente do Kit, plano, fonte de verdade e projeto Supabase corretamente mapeados.
2. Projeto de homologação real, isolado do banco de produção, e rollback/backup validados.
3. Gateway autenticado por loja e autorizado pelo servidor central, sem token global de administrador no frontend.
4. Auditoria de ações e escopo por loja: convites, motoboys, pedidos e eventos; rejeitar chamadas cruzadas.
5. Sincronizar estados reais: pedido despachável → oferta → aceite/recusa → retirada → entrega com PIN → finalização. Idempotência nos reenvios.
6. Provar push em aparelho, multi-loja, concorrência, cancelamento, rede offline e isolamento de dados.
7. Testes automatizados e manuais com evidências, deploy controlado e monitoramento.

## Regra de implantação
Prompts são **roteiros de adaptação**, não instalação automática. Etapa 1 pode ser usada para auditoria em leitura. Não aplicar migrations, ativar Kit ou publicar em produção até satisfazer os bloqueios acima e identificar os projetos Supabase por vínculo verificado (não pelo nome).
