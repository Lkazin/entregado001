// Manual integration check against the configured local/private gateway.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const path = require('node:path');
const env = { ...process.env };
env.VALHALLA_BASE_URL ||= 'http://127.0.0.1:8003';
env.VALHALLA_API_KEY ||= fs.readFileSync(path.join(__dirname,'../infra/valhalla-canoas/.secrets/valhalla_api_key'),'utf8').trim();
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/logistics/valhalla-client.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const client = {};
vm.runInNewContext(code,{exports:client,fetch,process:{env},URL,AbortController,AbortSignal,setTimeout,clearTimeout});
(async()=>{
  assert.equal((await fetch(env.VALHALLA_BASE_URL+'/status')).status,401);
  const from={latitude:-29.9189,longitude:-51.1781},to={latitude:-29.9239,longitude:-51.1826};
  const route=await client.valhallaRoute(from,to);
  const matrix=await client.valhallaMatrixBlock([from],[to],Date.now()+15000);
  assert.ok(route.coordinates.length>1 && route.distanceKm>0 && route.durationMin>0);
  assert.ok(matrix.distances[0][0]>0 && matrix.durations[0][0]>0);
  console.log(JSON.stringify({authenticated:true,routeKm:route.distanceKm,routeMinutes:route.durationMin,matrixMeters:matrix.distances[0][0],matrixSeconds:matrix.durations[0][0]}));
})().catch(()=>{console.error('Falha na integração com o Valhalla/gateway.');process.exitCode=1;});
