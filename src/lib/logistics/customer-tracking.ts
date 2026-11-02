import { supabaseAdmin } from '@/lib/supabase/server';
import { readLogisticsState } from './state-store';
import { trackingContext, trackingEntitlementAllowed, TRACKING_FEATURE } from './customer-tracking-policy';
import { trackingTopic } from './tracking-realtime';
import { resolveRouteDestination } from './route-optimizer';
import { valhallaRoute } from './valhalla-client';

export async function trackingFeatureEnabled(storeId: string) {
  const { data, error } = await supabaseAdmin.from('store_feature_entitlements').select('enabled,expires_at')
    .eq('store_id', storeId).eq('feature', TRACKING_FEATURE).maybeSingle();
  if (error) return false;
  return trackingEntitlementAllowed(data);
}

export async function resolveTrackingAccess(token: string) {
  const { state, revision } = await readLogisticsState();
  const context = trackingContext(state, token);
  if (!context) return { stage: 'locked' as const, topic: null, orderId: '', storeId: '', revision, state, context: null };
  const entitled = await trackingFeatureEnabled(context.storeId);
  const enabled = entitled && state.settingsByStore?.[context.storeId]?.customerLiveTrackingEnabled !== false;
  const stage = context.stage === 'ended' ? 'ended' as const : enabled ? context.stage : 'unavailable' as const;
  return { stage, topic: stage === 'active' ? trackingTopic(context.storeId, String(context.order.id), context.assignment.id) : null,
    orderId: String(context.order.id), storeId: context.storeId, assignmentId: context.assignment?.id, revision, state, context };
}

type Estimate = { destination: any; route: any; at: number; origin: { latitude: number; longitude: number } };
// Performance cache only: access is revalidated before and after all provider work.
const estimates = new Map<string, Estimate>();

export async function customerTrackingSnapshot(token: string) {
  const access = await resolveTrackingAccess(token);
  const empty = (stage: string, message: string, revision = access.revision) => ({ success: true, stage, message, revision,
    driverLocation: null, destination: null, route: null, realtime: null });
  if (access.stage !== 'active' || !access.context) return empty(access.stage, access.stage === 'ended'
    ? 'Acompanhamento da entrega encerrado.' : access.stage === 'unavailable'
    ? 'Acompanhe as atualizações do pedido nesta página.' : 'O mapa será liberado quando o entregador retirar seu pedido e iniciar a entrega.');
  const { context, state } = access;
  const location = context.location;
  if (!location) return { ...empty('active', 'Aguardando uma posição recente do entregador.'), realtime: { topic: access.topic } };
  const age = Date.now() - Date.parse(location.updatedAt);
  if (age > 30000) return { ...empty('active', 'Sinal do entregador desatualizado. Aguardando GPS.'), driverLocation: location, realtime: { topic: access.topic } };
  const order = context.order, settings = state.settingsByStore?.[context.storeId] || {};
  const address = order.addressDetail || {};
  const input = { ...context.assignment, address: address.street || context.assignment.address || order.address,
    addressNumber: address.number || context.assignment.addressNumber, city: address.city || order.city || context.assignment.city || settings.storeCity,
    state: address.state || order.state || context.assignment.state || settings.storeState,
    neighborhood: address.neighborhood || context.assignment.neighborhood || order.region,
    destinationCoordinates: context.assignment.destinationCoordinates || order.destinationCoordinates };
  const cacheKey = JSON.stringify([access.topic, input.address, input.addressNumber, input.city, input.destinationCoordinates]);
  const cached = estimates.get(cacheKey);
  const moved = cached ? Math.hypot(location.latitude - cached.origin.latitude, (location.longitude - cached.origin.longitude) * Math.cos(location.latitude * Math.PI / 180)) * 111320 : Infinity;
  let estimate: Estimate | undefined = cached && Date.now() - cached.at < 30000 && moved < 200 ? cached : undefined;
  if (!estimate) {
    try {
      const destination = await resolveRouteDestination(input, Date.now() + 10000);
      const result = await valhallaRoute(location, destination);
      estimate = { destination, route: { coordinates: result.coordinates, distanceKm: result.distanceKm,
        estimatedMinutes: result.durationMin, calculatedAt: new Date().toISOString() }, at: Date.now(), origin: location };
      if (estimates.size >= 128) estimates.delete(estimates.keys().next().value!);
      estimates.set(cacheKey, estimate);
    } catch { /* A provider failure must not hide the real GPS or invent an ETA. */ }
  }
  const latest = await resolveTrackingAccess(token);
  if (latest.stage !== 'active' || latest.topic !== access.topic) return empty(latest.stage, 'Acompanhamento atualizado. Consulte o status do pedido.', latest.revision);
  const fresh = latest.context?.location;
  const recent = fresh && Date.now() - Date.parse(fresh.updatedAt) <= 30000;
  const estimateStillApplies = recent && estimate && Math.hypot(fresh.latitude - estimate.origin.latitude,
    (fresh.longitude - estimate.origin.longitude) * Math.cos(fresh.latitude * Math.PI / 180)) * 111320 < 200;
  return { success: true, stage: 'active', revision: latest.revision, message: recent
    ? 'Localização do entregador. Trajeto e chegada são estimativas; outras entregas podem alterar a previsão.'
    : 'Aguardando atualização de GPS do entregador.', driverLocation: fresh, destination: recent ? estimate?.destination || null : null,
    route: estimateStillApplies ? estimate?.route || null : null, realtime: { topic: latest.topic } };
}
