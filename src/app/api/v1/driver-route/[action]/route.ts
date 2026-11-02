import { NextRequest, NextResponse } from 'next/server';
import { requireAccountSession } from '@/lib/auth/driver-account';
import { accountMemberships } from '@/lib/auth/driver-account-logistics';
import { verifyDriverRequest } from '@/lib/auth/tokens';
import { readLogisticsState } from '@/lib/logistics/state-store';
import { activeRouteAssignments, coordinates, normalizeRouteStore, optimizeRoute, RouteError } from '@/lib/logistics/route-optimizer';

export const runtime = 'nodejs';
export const maxDuration = 30;
const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorized(req: NextRequest, body: any) {
  const account = await requireAccountSession(req);
  const { state } = await readLogisticsState();
  const auth = verifyDriverRequest(req, state.drivers || [], body);
  if (!auth.valid) throw new RouteError(auth.error || 'Sessão inválida.', auth.status || 401, 'DRIVER_SESSION_INVALID');
  const memberships = await accountMemberships(account.id);
  if (!memberships.some(m => m.membership_id === auth.membershipId && m.driver_id === auth.driverId && normalizeRouteStore(m.store_id) === normalizeRouteStore(auth.storeId || ''))) throw new RouteError('Este vínculo pertence a outra conta.', 403, 'DRIVER_MEMBERSHIP_FORBIDDEN');
  return { state, auth, account };
}
const fingerprint = (items: any[]) => JSON.stringify(items.map(a => [a.assignmentId || a.id, a.status, a.driverId, a.storeId, a.address, a.addressNumber, a.neighborhood, a.city, a.state, a.deliveryLatitude, a.deliveryLongitude, a.destinationCoordinates, a.createdAt, a.acceptedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
// Additive driver-only contract: POST {mode, origin?}. No assignment IDs or store IDs
// accepted as routing authority. Suggestions are persisted by route-reorder separately.
export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    if ((await context.params).action !== 'optimize') return json({ success: false, error: 'Ação não encontrada.', code: 'NOT_FOUND' }, 404);
    const body = await req.json().catch(() => null);
    if (!body || !['shortest_distance', 'oldest_wait'].includes(body.mode)) throw new RouteError('Selecione uma forma válida de organizar a rota.', 400, 'INVALID_ROUTE_MODE');
    const deadline = Date.now() + 24000;
    const initial = await authorized(req, body);
    const assignments = activeRouteAssignments(initial.state, initial.auth);
    const settings = Object.entries(initial.state.settingsByStore || {}).find(([store]) => normalizeRouteStore(store) === normalizeRouteStore(initial.auth.storeId || ''))?.[1] as any;
    const gps = body.origin === undefined ? null : coordinates(body.origin);
    if (body.origin !== undefined && !gps) throw new RouteError('A localização enviada é inválida.', 422, 'INVALID_ORIGIN');
    const origin = gps || coordinates({ latitude: settings?.storeLatitude, longitude: settings?.storeLongitude });
    if (!origin) throw new RouteError('Informe sua localização ou configure as coordenadas reais da loja para organizar a rota.', 422, 'ROUTE_ORIGIN_REQUIRED');
    const result = await optimizeRoute(assignments, body.mode, origin, deadline);
    const latest = await authorized(req, body);
    if (latest.account.id !== initial.account.id || fingerprint(activeRouteAssignments(latest.state, latest.auth)) !== fingerprint(assignments)) throw new RouteError('Suas entregas mudaram durante o cálculo. Atualize a rota.', 409, 'ROUTE_STALE');
    return json({ success: true, mode: body.mode, ...result, calculatedAt:new Date().toISOString(), vehicle:result.source === 'valhalla' ? 'motorcycle' : 'driving', hasLiveTraffic:false, origin: { ...origin, source: gps ? 'gps' : 'store' }, attribution: `© OpenStreetMap contributors; ${result.source === 'valhalla' ? 'Valhalla' : 'OSRM'}` });
  } catch (error: any) {
    return json({ success: false, error: error?.status ? error.message : 'Não foi possível organizar a rota. Use a organização manual.', code: error?.code || 'ROUTE_UNAVAILABLE' }, error?.status || 503);
  }
}
