# Keepalive do Supabase: Entregador + Bella Pizza

Projeto Supabase identificado: `ngrkqutqmlhdenrxyaos` (entregador).
O painel da Bella Pizza e o entregador compartilham esse projeto, conforme confirmado pelo proprietário.

## Objetivo
Executar 2 consultas de leitura por dia pela API REST do Supabase, para gerar atividade de banco. **Não há garantia de impedir a pausa:** segundo o Supabase, projetos gratuitos com pouca atividade ao longo de 7 dias ainda podem ser pausados.

## Segurança
- Não usa senha de banco nem chave `service_role`.
- Requer apenas a chave pública publishable/anon configurada como **GitHub Actions secret** `ENTREGADOR_SUPABASE_PUBLISHABLE_KEY`.
- Não altera pedidos, entregas, usuários ou qualquer dado de negócio. Consulta no máximo um identificador de avaliação (`limit=1`), descarta a resposta sem registrar o conteúdo e preserva a RLS.
- O endpoint consultado já existe e tem permissão SELECT para `anon`; RLS permanece habilitado.
- Falhas ficam visíveis no histórico de execução do GitHub Actions.

## Para ativar
1. No repositório `Lkazin/entregado001`, abrir **Settings → Secrets and variables → Actions → New repository secret**.
2. Criar `ENTREGADOR_SUPABASE_PUBLISHABLE_KEY` com a chave publishable do projeto `entregador` no Supabase. **Não use service_role.**
3. Revisar a branch `chore/supabase-keepalive-entregador`.
4. Após autorização do proprietário, incorporar somente o workflow e este documento na branch padrão (GitHub cron só roda na branch padrão).
5. Em **Actions**, executar manualmente `Supabase keepalive (Entregador / Bella Pizza)` e verificar resultado HTTP 200. Monitorar também execuções agendadas.

## Observações
O cron roda todos os dias às 10:17 e 22:17 UTC (07:17 e 19:17 em Brasília, UTC-3) e pode atrasar por agendamento da plataforma. Se o repositório ficar inativo por muito tempo, o GitHub pode desativar workflows agendados. O plano Pro do Supabase é a forma suportada para evitar suspensão por inatividade sem depender do keepalive.
