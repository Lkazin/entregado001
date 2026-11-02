import { valhallaMatrixBlock } from './valhalla-client';
// OSRM table returns road distances (metres) and durations (seconds), not aerial estimates.
// Reference: https://project-osrm.org/docs/v5.24.0/api/#table-service
export type RouteMode = 'shortest_distance' | 'oldest_wait';
export type Coordinates = { latitude: number; longitude: number; approximate?: boolean };
export class RouteError extends Error {
  constructor(message: string, public status = 422, public code = 'ROUTE_UNAVAILABLE') { super(message); }
}
export function coordinates(value: any): Coordinates | null {
  return value && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
    ? { latitude: value.latitude, longitude: value.longitude, ...(value.approximate === true ? {approximate:true} : {}) } : null;
}
export function normalizeRouteStore(value: string) {
  return ['11111111-1111-1111-1111-111111111111', 'bella-pizza', 'store_bella_pizza'].includes(value) ? 'store_bella_pizza' : value;
}
export function activeRouteAssignments(state: any, auth: { storeId?: string; driverId?: string; membershipId?: string }) {
  return (state.assignments || []).filter((a: any) => normalizeRouteStore(a.storeId || '') === normalizeRouteStore(auth.storeId || '') &&
    [auth.driverId, auth.membershipId].filter(Boolean).includes(a.driverId) && ['picked_up', 'in_transit', 'em_rota'].includes(a.status));
}
const cache = new Map<string, { point: Coordinates; expires: number }>();
let geocodeQueue: Promise<void> = Promise.resolve();
let nextGeocodeAt = 0;
async function request(url: string, deadline: number, extraHeaders: Record<string,string> = {}) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new RouteError('Tempo de cálculo excedido. Organize a rota manualmente.', 503, 'ROUTE_TIMEOUT');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(8000, remaining));
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect:'error', headers: { 'User-Agent': 'NovaesWebDelivery/1.0 (+https://entregado001-oe6y.vercel.app)', 'ngrok-skip-browser-warning':'true', ...extraHeaders } });
    if (!response.ok) throw new Error('provider');
    return await response.json();
  } catch { throw new RouteError('Serviço de mapas indisponível. Use a organização manual.', 503, 'ROUTE_PROVIDER_UNAVAILABLE'); }
  finally { clearTimeout(timer); }
}
export async function resolveRouteDestination(a: any, deadline: number): Promise<Coordinates> {
  const direct = coordinates(a.destinationCoordinates) || coordinates({ latitude: a.deliveryLatitude, longitude: a.deliveryLongitude });
  if (direct) return direct;
  const street = typeof a.address === 'string' ? a.address.split(',')[0].trim() : '';
  const city = typeof a.city === 'string' ? a.city.trim() : '';
  if (!street || /^(Endereço do Cliente|Bairro)$/i.test(street) || !city) throw new RouteError('Uma entrega está sem endereço completo. Confira o endereço antes de organizar a rota.');
  const query = [street, a.addressNumber && a.addressNumber !== 'S/N' ? a.addressNumber : '', a.neighborhood === 'Bairro' ? '' : a.neighborhood, city, a.state, 'Brasil'].filter(Boolean).join(', ');
  const hit = cache.get(query);
  if (hit && hit.expires > Date.now()) return hit.point;
  // Configure an authorized/self-hosted Nominatim-compatible instance. Public Nominatim
  // is deliberately NOT enabled: its app-wide limits cannot be enforced by serverless memory.
  // https://operations.osmfoundation.org/policies/nominatim/
  const endpoint = process.env.NOMINATIM_SEARCH_URL;
  if (!endpoint) throw new RouteError('Endereço sem coordenadas verificadas. Configure o serviço de mapas ou organize a rota manualmente.', 422, 'ROUTE_GEOCODER_REQUIRED');
  let release!: () => void;
  const previous = geocodeQueue;
  geocodeQueue = new Promise<void>(resolve => { release = resolve; });
  try {
    await previous;
    const delay = Math.max(0, nextGeocodeAt - Date.now());
    if (Date.now() + delay >= deadline) throw new RouteError('Tempo de consulta excedido. Organize a rota manualmente.', 503, 'ROUTE_TIMEOUT');
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextGeocodeAt = Date.now() + (process.env.NOMINATIM_API_KEY ? 0 : 1000);
    const url = new URL(endpoint);
    url.searchParams.set('q', query); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '2'); url.searchParams.set('countrycodes', 'br');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new RouteError('O serviço de endereços precisa usar HTTPS.');
    const results = await request(url.toString(), deadline, process.env.NOMINATIM_API_KEY ? {'x-api-key':process.env.NOMINATIM_API_KEY} : {});
    const point = Array.isArray(results) && results.length === 1 && Number(results[0].place_rank) >= 26 ? coordinates({ latitude: Number(results[0].lat), longitude: Number(results[0].lon) }) : null;
    if (!point) throw new RouteError(`Pedido #${a.orderNumber || a.orderId || a.id || '?'}: rua não localizada em Canoas ou com nomes diferentes. Confira o nome da rua e a cidade.`,422,'ROUTE_ADDRESS_REVIEW_REQUIRED');
    point.approximate = results[0].approximate === true || Number(results[0].place_rank) < 30;
    if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
    cache.set(query, { point, expires: Date.now() + 86400000 });
    return point;
  } finally { release(); }
}
export async function optimizeRoute(assignments: any[], mode: RouteMode, origin: Coordinates, deadline = Date.now() + 24000) {
  if (!assignments.length) throw new RouteError('Confirme a retirada de pelo menos uma entrega antes de organizar a rota.', 422, 'ROUTE_NO_DELIVERIES');
  const points = [origin];
  for (const assignment of assignments) points.push(await resolveRouteDestination(assignment, deadline));
  const count = points.length;
  const distances: number[][] = Array.from({ length: count }, () => []);
  const durations: number[][] = Array.from({ length: count }, () => []);
  const source = process.env.VALHALLA_BASE_URL ? 'valhalla' as const : 'osrm' as const;
  // 25x25 pairs fit the local Valhalla limits; chunking does not cap deliveries.
  for (let s = 0; s < count; s += 25) for (let d = 0; d < count; d += 25) {
    const sources = points.slice(s, s + 25), destinations = points.slice(d, d + 25);
    if (source === 'valhalla') {
      const matrix = await valhallaMatrixBlock(sources, destinations, deadline);
      for (let i=0;i<sources.length;i++) for (let j=0;j<destinations.length;j++) {
        distances[s+i][d+j]=matrix.distances[i][j]; durations[s+i][d+j]=matrix.durations[i][j];
      }
      continue;
    }
    const combined = [...sources, ...destinations];
    const url = new URL(`${process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'}/table/v1/driving/${combined.map(p => `${p.longitude},${p.latitude}`).join(';')}`);
    url.searchParams.set('sources', sources.map((_, i) => i).join(';'));
    url.searchParams.set('destinations', destinations.map((_, i) => i + sources.length).join(';'));
    url.searchParams.set('annotations', 'distance,duration');
    const matrix = await request(url.toString(), deadline);
    if (matrix.code !== 'Ok') throw new RouteError('Não foi possível calcular um percurso pelas ruas.', 503);
    for (let i = 0; i < sources.length; i++) for (let j = 0; j < destinations.length; j++) {
      const distance = matrix.distances?.[i]?.[j], duration = matrix.durations?.[i]?.[j];
      if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) throw new RouteError('Uma entrega não tem percurso viável pelas ruas. Use a rota manual.');
      distances[s + i][d + j] = distance; durations[s + i][d + j] = duration;
    }
  }
  const ages = assignments.map(a => Date.parse(a.createdAt || a.acceptedAt || ''));
  if (mode === 'oldest_wait' && ages.some(t => !Number.isFinite(t))) throw new RouteError('Há uma entrega sem horário de recebimento. Use a organização manual.');
  const remaining = assignments.map((_, i) => i + 1), order: number[] = [];
  let current = 0, totalDistanceMeters = 0, totalDurationSeconds = 0;
  while (remaining.length) {
    remaining.sort((a, b) => (mode === 'oldest_wait' ? Math.floor(ages[a - 1] / 300000) - Math.floor(ages[b - 1] / 300000) : 0) || distances[current][a] - distances[current][b] || durations[current][a] - durations[current][b] || a - b);
    const next = remaining.shift()!; order.push(next);
    totalDistanceMeters += distances[current][next]; totalDurationSeconds += durations[current][next]; current = next;
  }
  let cumulativeDistanceMeters = 0, cumulativeDurationSeconds = 0;
  return { stops: order.map((index, i) => {
    const previous = i === 0 ? 0 : order[i - 1];
    const distanceMeters = distances[previous][index], durationSeconds = durations[previous][index];
    cumulativeDistanceMeters += distanceMeters; cumulativeDurationSeconds += durationSeconds;
    return { assignmentId: assignments[index - 1].assignmentId || assignments[index - 1].id, sequence: i + 1,
      distanceMeters, durationSeconds, cumulativeDistanceMeters, cumulativeDurationSeconds,
      locationApproximate: points[index].approximate === true,
      destinationCoordinates:{latitude:points[index].latitude,longitude:points[index].longitude},
      distanceFromOriginMeters: distances[0][index], durationFromOriginSeconds: durations[0][index] };
  }), totalDistanceMeters, totalDurationSeconds,
    rule: mode === 'shortest_distance' ? 'Sugestão por vizinho mais próximo usando distâncias pelas ruas; não garante ótimo global.' : 'Horário de criação (ou aceite quando ausente), em faixas de 5 minutos; distância pelas ruas desempata.', source };
}
