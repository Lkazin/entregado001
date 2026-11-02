// https://valhalla.github.io/valhalla/api/matrix/
// All credentials stay on the server; Valhalla returns kilometres and seconds.
export type ValhallaPoint = { latitude: number; longitude: number };
export class ValhallaError extends Error {
  readonly status = 503;
  readonly code = 'ROUTE_PROVIDER_UNAVAILABLE';
}
function endpoint(action: string): URL {
  const value = process.env.VALHALLA_BASE_URL;
  if (!value) throw new ValhallaError('O servidor Valhalla não foi configurado.');
  let base: URL;
  try { base = new URL(value); } catch { throw new ValhallaError('O endereço do Valhalla é inválido.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local))) {
    throw new ValhallaError('Use HTTPS para conectar ao servidor Valhalla.');
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/${action}`;
  return base;
}
export async function valhallaMatrixBlock(sources: ValhallaPoint[], targets: ValhallaPoint[], deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ValhallaError('Tempo de cálculo excedido. Use a organização manual.');
  const url = endpoint('sources_to_targets');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(8000, remaining));
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (process.env.VALHALLA_API_KEY) headers['x-api-key'] = process.env.VALHALLA_API_KEY;
  try {
    const response = await fetch(url, { method:'POST', headers, redirect:'error', signal:controller.signal, cache:'no-store', body:JSON.stringify({
      sources:sources.map(p => ({lat:p.latitude,lon:p.longitude})),
      targets:targets.map(p => ({lat:p.latitude,lon:p.longitude})),
      costing:'motor_scooter', units:'kilometers', verbose:false,
    }) });
    if (!response.ok) throw new Error('provider');
    const result = await response.json();
    if (result.units !== 'kilometers') throw new Error('units');
    const matrix = result.sources_to_targets;
    // Current compact response, plus compatibility with older verbose engines.
    const distanceAt = (i:number,j:number) => Array.isArray(matrix) ? matrix[i]?.[j]?.distance : matrix?.distances?.[i]?.[j];
    const durationAt = (i:number,j:number) => Array.isArray(matrix) ? matrix[i]?.[j]?.time : matrix?.durations?.[i]?.[j];
    const distances:number[][] = [], durations:number[][] = [];
    for (let i=0;i<sources.length;i++) {
      distances[i]=[]; durations[i]=[];
      for (let j=0;j<targets.length;j++) {
        const distance=distanceAt(i,j), duration=durationAt(i,j);
        if (typeof distance !== 'number' || !Number.isFinite(distance) || distance<0 || typeof duration !== 'number' || !Number.isFinite(duration) || duration<0) throw new Error('unreachable');
        distances[i][j]=distance*1000; durations[i][j]=duration;
      }
    }
    return {distances,durations};
  } catch { throw new ValhallaError('Servidor Valhalla indisponível ou uma entrega sem percurso viável. Use a organização manual.'); }
  finally { clearTimeout(timer); }
}

/** Valhalla's OSRM-compatible response keeps the existing map contract. */
export async function valhallaRoute(from: ValhallaPoint, to: ValhallaPoint) {
  const headers: Record<string,string> = {'Content-Type':'application/json'};
  if (process.env.VALHALLA_API_KEY) headers['x-api-key'] = process.env.VALHALLA_API_KEY;
  try {
    const response = await fetch(endpoint('route'), {
      method:'POST', headers, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(8000),
      body:JSON.stringify({locations:[from,to].map(p=>({lat:p.latitude,lon:p.longitude})),
        costing:'motor_scooter',units:'kilometers',format:'osrm',shape_format:'geojson'}),
    });
    if (!response.ok) throw new Error('provider');
    const data = await response.json(), route = data.routes?.[0];
    const points = route?.geometry?.coordinates;
    if (data.code !== 'Ok' || !Array.isArray(points) || points.length < 2 ||
      points.some((p:any)=>!Array.isArray(p) || p.length<2 || !Number.isFinite(p[0]) || Math.abs(p[0])>180 || !Number.isFinite(p[1]) || Math.abs(p[1])>90) ||
      !Number.isFinite(route.distance) || route.distance<0 || !Number.isFinite(route.duration) || route.duration<0) throw new Error('invalid');
    return {coordinates:points as [number,number][],distanceKm:route.distance/1000,durationMin:route.duration/60};
  } catch { throw new ValhallaError('Não foi possível obter o trajeto real no Valhalla.'); }
}
