# Kit NovaesWeb Entregador Premium — central de implantação do laboratório

## Escopo atual

Esta central é uma área da equipe NovaesWeb no painel modelo. O Kit Premium é um adicional para sites existentes dos planos Business, Premium e Personalizado. O Master principal continua responsável pelo cadastro das lojas, contratação, autorização e ativação.

Não importar todas as lojas do Master. A preparação começa por uma solicitação de uma loja que pediu ou contratou o Kit. A central recebe referências públicas manualmente e ajuda o operador a montar um brief para o agente do site autorizado inspecionar o código e acrescentar somente o que falta.

## Acesso e dados

A rota `GET /api/admin/kit-lab` exige a autenticação atual de administrador e a habilitação privada `NOVAESWEB_KIT_LAB_ENABLED=true`. A loja autenticada deve corresponder à variável privada `NOVAESWEB_KIT_LAB_STORE_ID`. Essas configurações não concedem contratos Premium e não devem ser habilitadas em sites de lojistas para simular uma função de Master.

`PremiumKitPanel` recebe o `storeId` autorizado pelo fluxo superior. O rascunho é salvo apenas no navegador sob uma chave escopada por esse ID. Não há sincronização para o banco nem importação de lojas reais. Limpar os dados do navegador remove o rascunho; abrir em outro aparelho não o recupera.

Campos públicos: plano base, nome, UUID oficial `managed_sites.id`, NX opcional, ID local, referência/URL pública Supabase, backend HTTPS, site e repositório opcionais. Não informar tokens, senhas, service_role ou arquivos de credenciais. A validação de formato não comprova propriedade do domínio, contrato ativo ou identidade no Master.

Situação persistida sempre: `draft`, origem `manual`, `verifiedByMaster=false`. O estado não pode ser promovido a ativo por esta página. O inventário existente/falta/verificar é uma declaração do operador, não resultado de uma análise de código.

## Processo de implantação

1. Receber somente a solicitação autorizada do adicional para o site existente.
2. Relacionar ID oficial do Master, ID local e instalação; NX é referência visual, não credencial.
3. Conferir contrato e código de adicional no catálogo principal. Não reutilizar automaticamente `novaes-entrega`, cujo escopo de taxas/áreas/checkout não garante logística de entregadores.
4. No Dashboard Supabase, selecionar o projeto da loja e conferir referência em Project Settings → General e URL pública em Connect/configuração de API. O nome dos menus pode variar. O projeto do Master e o projeto da loja têm responsabilidades diferentes.
5. Revisar no ambiente autorizado schema, constraints, RLS e versão homologada das migrations. Uma URL pública não dá autorização para consultar ou alterar bancos.
6. Inspecionar o site e confirmar recebido, preparação, despacho, retirada, motoboys, primeiro acesso e conexão. Preservar layout, catálogo, checkout e demais operações existentes.
7. Gerar o brief na central e entregá-lo ao agente do site. O agente deve realizar sua própria análise antes de implementar. O brief instrui a acrescentar apenas os módulos comprovadamente faltantes e não executa uma instalação remota.
8. A API logística deve validar usuário, loja, instalação e autorização no servidor. O app não recebe chaves privadas nem escolhe arbitrariamente o banco de destino. Reaproveitar o app universal com um plantão ativo por vez e históricos preservados.
9. Homologar pedido completo, recebimento das notificações no aparelho, retirada, PIN, histórico, GPS e mapa do cliente, com recusa, cancelamento, duplicação e offline. Testar negações entre duas lojas/contas, inclusive arquivos e endpoints. Revisão estática ou mock não prova isolamento real.
10. Enviar evidências e pendências ao Master principal quando a conexão futura existir. A ativação comercial permanece lá. Não ativar antes da homologação.

## Entrega do prompt

O botão Gerar prompt utiliza os dados e o inventário locais, sem buscar os URLs informados. Não declara o site analisado. O texto é mostrado integralmente, com cópia por clipboard e alternativa de seleção manual quando o navegador bloquear a operação. Alterar o rascunho invalida o prompt anterior.

O agente de destino deve preservar todos os fluxos existentes e pedir autorização antes de push, merge, deploy, migração de produção ou ação arriscada. Nenhum código do prompt pode converter o ID informado manualmente em permissão de acesso.

## Pendências deliberadas

- Contrato servidor-servidor assinado e consulta autenticada do Master.
- Recebimento persistente e aprovado das solicitações do adicional.
- Descoberta e verificação real da instalação e do vínculo entre projetos Supabase.
- Ativação remota e homologação integrada entre duas lojas reais.

Essas etapas não estão implementadas pela página de planejamento. Não existe cópia automática de tabelas, leitura automática dos repositórios informados ou substituição dos sites.
