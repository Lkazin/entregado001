import { timelineStoreKey, projectStoreOrders, pickedUpStatuses } from './order-timeline';
import { isPickupOrder } from '../order-fulfillment';

export const TRACKING_FEATURE = 'customer_live_tracking';
const terminal = new Set(['concluido', 'entregue', 'delivered', 'cancelado']);
const blockedDrivers = new Set(['bloqueado', 'revogado', 'vinculo_removido']);

/** Exact capability lookup; IDs and display numbers never authorize a customer. */
export function trackingContext(state: any, token: string, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 200) return null;
  const matches: { order: any; storeId: string }[] = [];
  for (const [rawStore, projections] of Object.entries(state.orderProjectionsByStore || {})) {
    const storeId = timelineStoreKey(rawStore);
    const orders = Object.values(projections || {}).filter((o: any) => o?.trackingToken === token && !o.deletedAt &&
      (!o.storeId || timelineStoreKey(o.storeId) === storeId));
    const terminalOrders = new Map(orders.filter((o: any) => terminal.has(o.status)).map((o: any) => [String(o.id), o.status]));
    for (const order of projectStoreOrders(orders, state, storeId)) {
      if (order.trackingToken === token && (!order.storeId || timelineStoreKey(order.storeId) === storeId)) {
        // A stale active assignment cannot reopen an explicitly finalized order.
        matches.push({ order: terminalOrders.has(String(order.id)) ? { ...order, status: terminalOrders.get(String(order.id)) } : order, storeId });
      }
    }
  }
  if (matches.length !== 1) return null;
  const { order, storeId } = matches[0];
  const assignments = (state.assignments || []).filter((a: any) => timelineStoreKey(a.storeId) === storeId && String(a.orderId) === String(order.id))
    .sort((a: any, b: any) => (Date.parse(b.createdAt || b.acceptedAt || '') || 0) - (Date.parse(a.createdAt || a.acceptedAt || '') || 0));
  const assignment = assignments[0];
  const driver = assignment && (state.drivers || []).find((d: any) => timelineStoreKey(d.storeId) === storeId &&
    [d.id, d.driverId].filter(Boolean).includes(assignment.driverId));
  const ended = terminal.has(order.status) || Boolean(assignment && ['delivered', 'entregue', 'canceled_by_store', 'canceled_by_driver', 'withdrawn', 'returned_to_dispatch'].includes(assignment.status));
  const active = !ended && !isPickupOrder(order) && Boolean(assignment?.id && driver && !blockedDrivers.has(driver.status) && pickedUpStatuses.includes(assignment.status));
  const candidate = active ? (state.tracking?.[assignment.driverId] || state.tracking?.[driver.id] || state.tracking?.[driver.driverId]) : null;
  const capturedAt = Date.parse(candidate?.capturedAt || candidate?.updatedAt || '');
  const receivedAt = Date.parse(candidate?.updatedAt || '');
  const pickupAt = Date.parse(assignment?.pickupConfirmedAt || assignment?.pickedUpAt || order.pickedUpAt || '');
  const validPoint = candidate && candidate.storeId && timelineStoreKey(candidate.storeId) === storeId &&
    [driver?.id, driver?.driverId].filter(Boolean).includes(candidate.driverId) &&
    Number.isFinite(candidate.latitude) && Math.abs(candidate.latitude) <= 90 &&
    Number.isFinite(candidate.longitude) && Math.abs(candidate.longitude) <= 180 &&
    Number.isFinite(capturedAt) && capturedAt <= now + 5000 && now - capturedAt <= 120000 &&
    Number.isFinite(receivedAt) && receivedAt <= now + 5000 && now - receivedAt <= 120000 &&
    (!Number.isFinite(pickupAt) || capturedAt >= pickupAt) &&
    (candidate.accuracy == null || (Number.isFinite(candidate.accuracy) && candidate.accuracy >= 0 && candidate.accuracy <= 100));
  return { order, storeId, assignment, driver, stage: ended ? 'ended' as const : active ? 'active' as const : 'locked' as const,
    location: validPoint ? { latitude: candidate.latitude, longitude: candidate.longitude, accuracy: candidate.accuracy ?? null,
      updatedAt: new Date(capturedAt).toISOString() } : null };
}

export function trackingEntitlementAllowed(entitlement: any, now = Date.now()) {
  return entitlement?.enabled === true && (!entitlement.expires_at || Date.parse(entitlement.expires_at) > now);
}
