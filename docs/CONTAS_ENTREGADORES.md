# Contas de entregadores e acesso unico

## Estado da entrega

Implementacao local concluida. A versao nova ainda nao foi publicada e o SQL novo
nao foi aplicado. A configuracao do PIN na Vercel foi confirmada pelo proprietario.
Falta confirmar ADMIN_SESSION_SECRET. O proprietario decidiu adiar a troca da
service_role antiga exposta. Essa chave continua permitindo acesso privilegiado
ao banco; RLS e o controle de sessao nao protegem contra seu portador.

## Comportamento

- Cadastro central por telefone brasileiro e senha de 8 a 128 caracteres.
- Senha protegida com scrypt no servidor; nunca salva em claro no navegador.
- Conta e identificador fixos entre aparelhos, com uma sessao opaca ativa por conta.
- Novo login substitui a sessao anterior no banco, inclusive entre instancias.
- Uma operacao ja em andamento precisa validar a sessao na mesma transacao do
  commit. O login novo e o commit disputam o bloqueio da mesma conta.
- O aviso no aparelho antigo aparece em ate 10 segundos com internet, ao voltar
  para o aplicativo ou ao tentar uma acao. Sem internet, aparece ao reconectar.
- Sair da conta para GPS e revoga a sessao; nao encerra plantao nem entregas.
- Historico e valores sao calculados com IDs de atribuicao/vinculo, nunca por nome.
- Contas sem plantao tambem consultam a validade de sua sessao.
- Confirmacoes offline guardam a sessao original e nao migram para um novo login.
- SMS, verificacao de titularidade do telefone e recuperacao de senha foram adiados
  explicitamente pelo proprietario. Nao sao recursos entregues nesta etapa.

## Migracao dos cadastros antigos

Os cadastros antigos eram locais ao navegador, sem autenticacao central confiavel.
Tokens antigos estavam num arquivo publico e nao comprovam titularidade.

1. O entregador cria sua conta central com telefone e senha.
2. No painel do lojista, ao lado do entregador existente, usar **Associar conta cadastrada**.
3. Informar o telefone, conferir pessoalmente nome/telefone mascarado e confirmar.
4. O entregador atualiza o aplicativo: IDs, entregas e historico existentes sao preservados.

A associacao e unica. Uma conta diferente nao pode tomar o mesmo vinculo.
Convites novos sao privados e podem ser ativados pela conta autenticada. Convites
antigos exigem a associacao assistida acima.

## Ativacao coordenada

1. No projeto Vercel do lojista, configurar ADMIN_ACCESS_PIN (6 numeros) e
   ADMIN_SESSION_SECRET (segredo novo aleatorio com pelo menos 32 caracteres).
   Nenhuma dessas variaveis usa prefixo NEXT_PUBLIC_ ou VITE_.
2. Recomendado invalidar a service_role antiga e atualizar SUPABASE_SERVICE_ROLE_KEY
   privada. Nao basta adicionar uma chave nova e manter a anterior ativa.
3. Aplicar supabase/driver_accounts_setup.sql como uma migracao unica revisada.
   O CLI estava indisponivel; o arquivo e um setup SQL, nao uma migracao CLI inventada.
4. Durante uma janela sem emissao/aceite/alteracao de entregas, executar:
   node scripts/migrate-logistics-state.cjs
   O script usa o ambiente privado local, copia o estado para o banco, valida
   integridade e preserva a origem. Nunca sobrescreve estado de banco ja existente.
5. Publicar primeiro o lojista. Conferir autenticacao administrativa, armazenamento
   protegido e preservacao dos IDs antes de liberar novas operacoes.
6. Publicar o entregador. Novos aparelhos usam cadastro central. Aparelhos antigos
   precisam criar sua conta e receber a associacao do lojista.
7. Testar com contas de teste proprias em dois aparelhos antes de contas reais.

Os handlers novos nao leem nem gravam logistics.json publico. O arquivo legado
permanece intacto como copia antiga; sua exposicao anterior e uma limitacao pendente,
nao evidência de isolamento integral. Nao restaurar nele o estado novo do banco.

Nao publicar apenas um frontend novo contra backend antigo, nem backend novo sem
schema/estado/segredos prontos. Evitar rollback parcial: o backend antigo escreveria
no arquivo publico, enquanto o novo escreve no banco.

## Evidencias locais

28 testes locais passaram: 22 no lojista e 6 no entregador. Handlers e helpers reais,
banco/RPC/transporte simulados. As duas compilacoes de producao passaram.
Tela de login e campos do cadastro conferidos no navegador local.

| Usuario | Loja/recurso | Operacao | Esperado | Observado local |
| --- | --- | --- | --- | --- |
| A, sessao atual | Vinculos/historico de A | Bootstrap em outro aparelho | Mesmos IDs e valores | Passou |
| A, sessao anterior | Leitura, mutacao e GPS | Requisicao apos login novo | 401 sem gravacao | Passou |
| A | Entrega de B na mesma loja | Retirar, reordenar, desistir, concluir | 403 sem gravacao | Passou |
| A | Entrega de outra loja | Mesmas operacoes | 403 sem gravacao | Passou |
| A | Token logistico de B | Consultar dados | 403 | Passou |
| Lojista A | Vinculo da loja B | Associar conta antiga | Negado | Passou |
| A e B | Sessao propria | Logout atrasado de A | Nova sessao preservada | Passou |

Nao executados nesta etapa: corrida transacional em Postgres real, testes de RLS
com papeis anon/authenticated no banco real, teste funcional completo entre dois
aparelhos reais, ou validacao de producao da versao nova.

## Comandos de verificacao

Lojista:

    node --test --test-isolation=none scripts/driver-account.test.cjs scripts/logistics-invite.test.cjs scripts/logistics-account.test.cjs scripts/logistics-state-store.test.cjs
    npm run build

Entregador:

    node --test --test-isolation=none scripts/account-session.test.cjs scripts/logistics-connection.test.cjs
    npm run build
