# Rastreamento do cliente

## Fluxo implementado

GPS existente do entregador → POST autenticado → commit logístico confirmado → Broadcast privado `updated` (somente revisão) → consulta autorizada `/api/customer-tracking` → mapa MapLibre existente.

O cliente não assina o estado global nem recebe atribuições, endereços ou trajetos de outros pedidos. O acesso usa o token exato do pedido; ID e número não autorizam. Novos tokens são aleatórios de 256 bits gerados pelo servidor. O checkout utiliza os dados confirmados pelo servidor.

Aceite não libera mapa. Somente atribuição `picked_up`, `in_transit` ou `em_rota`, da loja e do entregador corretos, permite GPS. Finalização, cancelamento, retirada de vínculo e interrupção removem o acesso. Cada pedido é independente, preservando outras entregas do motoboy.

GPS é validado por precisão, faixa, horário de captura e vínculo; posição antiga não sobrescreve nova. Após 30 segundos a posição é sinalizada como desatualizada, sem ETA. Após 120 segundos ela deixa de aparecer. Realtime tem consulta de recuperação a cada 10 segundos. O trajeto/ETA direto é recalculado com limite de frequência; não representa trânsito ao vivo nem revela outras paradas.

## Permissões e configuração para publicação

Nenhum dos passos abaixo foi executado em produção nesta implementação. Exigem autorização do proprietário para publicar.

1. Aplicar o SQL aditivo `supabase/customer_tracking_setup.sql` no projeto **entregador / ngrkqutqmlhdenrxyaos**. A CLI local não está instalada; o arquivo é setup SQL, não uma migration CLI inventada.
2. Configurar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` da mesma instância na Vercel do lojista (ou manter `NEXT_PUBLIC_SUPABASE_ANON_KEY` se já houver). A chave pública não substitui nem expõe a chave privilegiada do servidor.
3. Habilitar sessões anônimas no Supabase Auth, com os limites de abuso adequados. Isso cria identidade de visualização, sem cadastro visível e sem criar conta de motoboy. Falha nessa configuração mantém a consulta automática, mas não o canal privado.
4. Provisionar a permissão `customer_live_tracking` em `store_feature_entitlements` somente para a loja autorizada. Ausência, desativação ou expiração negam acesso por padrão. Somente servidor/Master pode administrar essa permissão. O lojista pode desligar ou religar a preferência, sem conceder a si próprio o adicional.
5. Publicar os dois repositórios juntos: `Lkazin/entregado001` e `Lkazin/painel-moto`. Confirmar ambientes Vercel e validar com celulares reais antes de anunciar rastreamento contínuo.

As concessões de canal duram 15 minutos e são renovadas a cada 10 minutos. Policies RLS isolam cada identidade/tópico e impedem publicação pelo cliente. Como autorização Broadcast pode permanecer em cache durante uma conexão, eventos contêm somente invalidação: a consulta HTTP sempre revalida a permissão atual. Ao desativar o adicional, nenhum novo snapshot retorna GPS. A interface aplica o encerramento ao receber a atualização ou, na recuperação, na próxima consulta; não há garantia de revogação instantânea da imagem já exibida em um dispositivo sem rede.

## Verificações realizadas

- Testes VM de autorização por token, loja, vínculo, retirada, término, Premium, precisão, atualidade, revogação durante cálculo e payload restrito.
- Testes de componente: bloqueado → ativo → encerrado, falha/reconexão, troca de token e consultas sem sobreposição.
- Testes do serviço GPS e regressões existentes de contas, sincronização e organização de rota.
- SQL aplicado em PostgreSQL 15 temporário, sem portas públicas, com identidades/tópicos fictícios: próprio canal permitido; outro cliente e concessão expirada negados; gravação de concessão, leitura de permissões comerciais e publicação pelo cliente negadas; canais não relacionados preservados. O teste usa stand-ins de `auth.uid()` e `realtime.topic()`, não prova configuração ou integração do Supabase publicado.
- Compilação dos dois aplicativos e TypeScript.

Falta validação do fluxo completo no ambiente publicado e percurso com aparelho real: negar GPS, ficar sem internet, retornar, minimizar e bloquear tela. O navegador/PWA pode suspender localização em segundo plano; não foi instalado rastreamento nativo. Valhalla e geocodificador dependem da disponibilidade do computador que os hospeda.

Para executar o teste SQL em banco descartável: aplicar primeiro `scripts/customer-tracking-rls-bootstrap.sql`, depois o setup e por fim `scripts/customer-tracking-rls.test.sql`. Nunca executar o bootstrap em produção.
