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

Valhalla recebe coordenadas e devolve rotas/distâncias/tempos. Não converte
endereços em coordenadas: pedidos sem localização ainda exigem um provedor
compatível com Nominatim em `NOMINATIM_SEARCH_URL`, ou coordenadas reais já
salvas. Não são criadas localizações/estimativas fictícias em falhas.

Verificação real local a partir da raiz do repositório:
`node scripts/valhalla-live-smoke.cjs`.
Teste de regressão: `node scripts/route-optimizer.test.cjs`.

Imagem oficial: https://github.com/valhalla/valhalla/blob/master/docker/README.md
