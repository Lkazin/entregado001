# Contas de entregadores e acesso unico

## Estado da entrega

Backend publicado e banco ativado em 01/11/2026. A integridade da transferencia
foi confirmada (3 vinculos e 2 atribuicoes preservados); o arquivo original continua
intacto. Frontend publicado e conferido na URL publica, com novo cadastro, cabecalho de
sessao e cache v5. Backend 024d04a e frontend cf2363b publicados com sucesso.

Projeto efetivo do lojista, confirmado pela configuracao local e pelas requisicoes
de producao: ngrkqutqmlhdenrxyaos (entregador). O projeto nrdbporbyujwtgnpiejz,
informado no inicio, e outro projeto. O setup aditivo tambem foi aplicado nele antes
de detectar a divergencia; suas tabelas novas ficaram vazias e nenhum estado ou
cadastro foi transferido para la. Nao houve exclusao de dados em nenhum projeto.

PIN e segredo de sessao foram configurados pelo proprietario. A chave exposta
anteriormente era do projeto nrdbporbyujwtgnpiejz; a troca dessa chave foi adiada
pelo proprietario. Nao confundir essa credencial com a chave privada do projeto
ngrkqutqmlhdenrxyaos, usada no backend efetivo.

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

Validacao adicional em producao: conta tecnica descartavel criada pela API,
identidade estavel, senha incorreta rejeitada sem expulsar sessao valida, bootstrap,
sessao antiga revogada, logout atrasado preservando sessao nova e dois logins
simultaneos com apenas um token valido. Conta tecnica saiu e foi removida com
conferencia de ID/nome e ausencia de vinculos; nenhuma conta ou entrega real mudou.
No banco efetivo, grants de leitura anon/authenticated e execute anon da RPC
foram conferidos e negados. RLS sem policies e intencional: acesso so pelo servidor.

No projeto inicialmente informado, um teste transacional real de commit, troca de
hash de sessao e CAS foi executado com rollback integral. A concorrencia do fluxo
de login foi testada pela API de producao do banco efetivo.

Ainda nao executado: teste funcional com os aparelhos fisicos do proprietario,
associacao de conta real a vinculo antigo ou confirmacao de entrega real.

## Comandos de verificacao

Lojista:

    node --test --test-isolation=none scripts/driver-account.test.cjs scripts/logistics-invite.test.cjs scripts/logistics-account.test.cjs scripts/logistics-state-store.test.cjs
    npm run build

Entregador:

    node --test --test-isolation=none scripts/account-session.test.cjs scripts/logistics-connection.test.cjs
    npm run build
