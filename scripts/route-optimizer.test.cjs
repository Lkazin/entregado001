const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/logistics/route-optimizer.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const valhallaCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/logistics/valhalla-client.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function load(fetch, env = {}) {
  const client = {};
  vm.runInNewContext(valhallaCode, { exports:client, fetch, process:{env}, URL, AbortController, setTimeout, clearTimeout });
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { if(name === './valhalla-client') return client; throw new Error(name); }, fetch, process: { env }, URL, AbortController, setTimeout, clearTimeout });
  return exports;
}
const deliveries = [
  { id: 'old', storeId: 's', driverId: 'd', status: 'picked_up', destinationCoordinates: { latitude: -30, longitude: -51 }, createdAt: '2026-11-01T10:00:00Z' },
  { id: 'near', storeId: 's', driverId: 'd', status: 'in_transit', destinationCoordinates: { latitude: -31, longitude: -52 }, createdAt: '2026-11-01T11:00:00Z' },
];
const origin = { latitude: -29, longitude: -50 };
const distances = [[0, 900, 100], [900, 0, 200], [100, 200, 0]];
function matrixFetch(url) {
  const u = new URL(url), sources = u.searchParams.get('sources').split(';').length, dests = u.searchParams.get('destinations').split(';').length;
  assert.equal(sources, 3); assert.equal(dests, 3);
  return Promise.resolve({ ok: true, json: async () => ({ code: 'Ok', distances, durations: distances.map(row => row.map(n => n / 10)) }) });
}
test('uses provider road matrix for distance and actual creation for wait priority', async () => {
  const m = load(matrixFetch);
  const shortest = await m.optimizeRoute(deliveries, 'shortest_distance', origin);
  assert.equal(shortest.stops.map(a => a.assignmentId).join(','), 'near,old');
  assert.equal(shortest.stops[0].distanceMeters, 100);
  assert.equal(shortest.stops[1].durationSeconds, 20);
  assert.equal(shortest.stops[1].cumulativeDurationSeconds, 30);
  assert.equal(shortest.stops[1].distanceFromOriginMeters, 900);
  assert.equal(shortest.totalDistanceMeters, 300); assert.equal(shortest.totalDurationSeconds, 30);
  const oldest = await m.optimizeRoute(deliveries, 'oldest_wait', origin);
  assert.equal(oldest.stops.map(a => a.assignmentId).join(','), 'old,near'); assert.equal(oldest.totalDistanceMeters, 1100);
});
test('missing address and unknown origin fail without synthetic coordinates', async () => {
  const m = load(() => { throw new Error('must not fetch'); });
  assert.equal(m.coordinates({ latitude: 91, longitude: 0 }), null);
  await assert.rejects(m.optimizeRoute([{ id: 'x' }], 'shortest_distance', origin), /endereço completo/);
  await assert.rejects(m.optimizeRoute([{ id: 'x', address: 'Rua real', city: 'Cidade' }], 'shortest_distance', origin), e => e.code === 'ROUTE_GEOCODER_REQUIRED');
});
test('provider failures do not produce a fake route', async () => {
  const m = load(async () => { throw new Error('offline'); });
  await assert.rejects(m.optimizeRoute(deliveries, 'shortest_distance', origin), e => e.code === 'ROUTE_PROVIDER_UNAVAILABLE');
});
test('waiting, other-store and other-driver deliveries are excluded', () => {
  const m = load(matrixFetch);
  const state = { assignments: [...deliveries, { ...deliveries[0], id: 'waiting', status: 'waiting_pickup' }, { ...deliveries[0], id: 'otherstore', storeId: 'other' }, { ...deliveries[0], id: 'otherdriver', driverId: 'other' }] };
  assert.equal(m.activeRouteAssignments(state, { storeId: 's', driverId: 'd' }).map(a => a.id).join(','), 'old,near');
});
const endpointCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/api/v1/driver-route/[action]/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function endpoint({ owned = true, stale = false, noOrigin = false } = {}) {
  const exports = {}, helper = load(matrixFetch);
  let reads = 0;
  const imports = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    '@/lib/auth/driver-account': { requireAccountSession: async () => ({ id: 'account' }) },
    '@/lib/auth/driver-account-logistics': { accountMemberships: async () => [{ membership_id: 'm', driver_id: owned ? 'd' : 'other', store_id: 's' }] },
    '@/lib/auth/tokens': { verifyDriverRequest: () => ({ valid: true, driverId: 'd', membershipId: 'm', storeId: 's' }) },
    '@/lib/logistics/state-store': { readLogisticsState: async () => ({ state: { drivers: [], assignments: stale && reads++ ? [] : deliveries, settingsByStore: noOrigin ? {} : { s: { storeLatitude: -29, storeLongitude: -50 } } } }) },
    '@/lib/logistics/route-optimizer': helper,
  };
  vm.runInNewContext(endpointCode, { exports, require: name => imports[name] });
  return exports.POST({ json: async () => ({ mode: 'shortest_distance' }) }, { params: Promise.resolve({ action: 'optimize' }) });
}
test('endpoint enforces account membership and real origin', async () => {
  assert.equal((await endpoint({ owned: false })).status, 403);
  assert.equal((await endpoint({ noOrigin: true })).body.code, 'ROUTE_ORIGIN_REQUIRED');
  assert.equal((await endpoint()).status, 200);
});
test('endpoint refuses a suggestion when active assignments change during provider calls', async () => {
  const response = await endpoint({ stale: true });
  assert.equal(response.status, 409); assert.equal(response.body.code, 'ROUTE_STALE');
});

test('Valhalla converts road kilometres to metres, keeps seconds and sends gateway key only server side', async () => {
  let calls=0;
  const m=load(async (url, options) => {
    calls++; assert.equal(String(url),'https://maps.example.test/sources_to_targets');
    assert.equal(options.headers['x-api-key'],'private-fixture'); assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body); assert.equal(body.costing,'motor_scooter'); assert.equal(body.verbose,false);
    assert.equal(body.sources[0].lat, origin.latitude);
    return {ok:true,json:async()=>({units:'kilometers', sources_to_targets:{distances:distances.map(row=>row.map(n=>n/1000)),durations:distances.map(row=>row.map(n=>n/10))}})};
  },{VALHALLA_BASE_URL:'https://maps.example.test',VALHALLA_API_KEY:'private-fixture'});
  const result=await m.optimizeRoute(deliveries,'shortest_distance',origin);
  assert.equal(calls,1); assert.equal(result.source,'valhalla'); assert.equal(result.totalDistanceMeters,300); assert.equal(result.totalDurationSeconds,30);
  assert.equal(result.stops[1].cumulativeDurationSeconds,30);
});
test('Valhalla failure never silently switches to OSRM and unreachable cells are rejected', async () => {
  for(const invalid of [{ok:false}, {ok:true,json:async()=>({units:'kilometers',sources_to_targets:{distances:[[null]],durations:[[null]]}})}]) {
    let calls=0;
    const m=load(async()=>{calls++;return invalid;},{VALHALLA_BASE_URL:'https://maps.example.test'});
    await assert.rejects(m.optimizeRoute(deliveries,'shortest_distance',origin),e=>e.code==='ROUTE_PROVIDER_UNAVAILABLE');
    assert.equal(calls,1);
  }
});
test('Valhalla gateway credentials cannot be sent over external HTTP', async () => {
  const m=load(()=>{throw new Error('must not fetch');},{VALHALLA_BASE_URL:'http://maps.example.test',VALHALLA_API_KEY:'private-fixture'});
  await assert.rejects(m.optimizeRoute(deliveries,'shortest_distance',origin),/HTTPS/);
});
if (process.env.TEST_REAL_VALHALLA === '1') test('real local Canoas Valhalla matrix returns road metres and seconds', async()=> {
  const m=load(fetch,{VALHALLA_BASE_URL:'http://127.0.0.1:8002'});
  const result=await m.optimizeRoute([{id:'canoas',status:'picked_up',createdAt:'2026-11-01T10:00:00Z',destinationCoordinates:{latitude:-29.9239,longitude:-51.1826}}],'shortest_distance',{latitude:-29.9189,longitude:-51.1781});
  assert.equal(result.source,'valhalla'); assert.ok(result.totalDistanceMeters>500); assert.ok(result.totalDurationSeconds>30);
  console.log('Valhalla local:',JSON.stringify({meters:result.totalDistanceMeters,seconds:result.totalDurationSeconds}));
});
