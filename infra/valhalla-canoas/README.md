# Valhalla local — Canoas

Servidor exclusivo de roteamento em http://127.0.0.1:8002.
Dados persistentes no volume Docker `novaesweb-valhalla-canoas-data`;
não apagar o volume para reiniciar. O PBF original está em `custom_files`.

Iniciar: `docker compose up -d` nesta pasta.
Logs: `docker compose logs --tail 50 valhalla`.
Parar: `docker compose stop`.

O recorte deve cobrir Canoas e arredores: longitude -51.32 a -51.05,
latitude -30.02 a -29.78. Dados OpenStreetMap, licença ODbL.
Fonte: https://download.geofabrik.de/south-america/brazil/sul.html
Recorte criado com `osmium extract -b -51.32,-30.02,-51.05,-29.78 -s complete_ways`.

Os painéis usam o motor configurado no servidor do lojista. Configure
`VALHALLA_BASE_URL` e `VALHALLA_API_KEY` somente nas variáveis privadas do
projeto **entregado001**, em Production/Preview. O motoboy chama a API do
lojista com sua sessão; a chave não vai ao navegador.

Para subir o acesso autenticado local:
`docker compose -f compose.yaml -f compose.gateway.yaml up -d`.
O gateway escuta em `127.0.0.1:8003` e lê a chave privada do arquivo ignorado
`.secrets/valhalla_api_key` (mínimo 32 caracteres aleatórios). Sem chave,
as requisições recebem 401. Nunca enviar esse arquivo ao GitHub.

Para produção, configure um **Cloudflare Tunnel nomeado**, com domínio HTTPS
fixo, apontando para `http://localhost:8003`. O script `iniciar-tunel.ps1`
recebe o caminho do arquivo privado com o token do túnel. A conta/domínio
Cloudflare deve pertencer ao proprietário. Quick Tunnels servem apenas para
teste: o endereço muda quando reiniciam e não deve ser fixado na Vercel.
Mantenha Docker e o conector do túnel ativos no PC.

## Alternativa sem domínio próprio: ngrok

O plano gratuito fornece um domínio atribuído à conta, sujeito aos limites
do provedor. O arquivo privado `.secrets/ngrok.yml` guarda o authtoken e
define o túnel `mapas` para `http://maps-gateway:8003`, com `inspect: false`.
Não publique esse arquivo. Para iniciar os três serviços nesta pasta:

`docker compose -f compose.yaml -f compose.gateway.yaml -f compose.ngrok.yaml up -d`

A API local do agente em `http://127.0.0.1:4040/api/tunnels` informa o
`public_url` HTTPS. Use esse endereço em `VALHALLA_BASE_URL` na Vercel,
mantendo `VALHALLA_API_KEY` privada. O token da conta ngrok é diferente da
chave do gateway e nunca deve ser configurado no painel do motoboy.

## Conversão de endereços

O Nominatim local usa o mesmo recorte de Canoas, com PostgreSQL isolado e
persistente no volume `novaesweb-geocoder-canoas-data`. Para iniciar tudo:

`docker compose -f compose.yaml -f compose.gateway.yaml -f compose.geocoder.yaml -f compose.ngrok.yaml up -d`

O arquivo ignorado `.secrets/nominatim.env` contém `NOMINATIM_PASSWORD`.
O serviço privado de busca é `https://SEU-ENDERECO-NGROK/search` e requer
`NOMINATIM_API_KEY`, com o mesmo valor da chave privada do gateway. Configure
essas duas variáveis apenas no projeto do lojista na Vercel. Na máquina,
o Nominatim é acessível em `127.0.0.1:8004` para diagnóstico local.

As buscas são limitadas à região de Canoas. Ruas/números ausentes do
OpenStreetMap ou resultados ambíguos exigem revisão do endereço; não são
substituídos por pontos fictícios ou pelo centro da cidade. Localizações
retornadas no nível da rua são aproximações da rua, não confirmação da porta.

Verificação real local a partir da raiz do repositório:
`node scripts/valhalla-live-smoke.cjs`.
Teste de regressão: `node scripts/route-optimizer.test.cjs`.

Imagem oficial: https://github.com/valhalla/valhalla/blob/master/docker/README.md
