import crypto from 'crypto';
import { timelineStoreKey } from './order-timeline';

/** Opaque per-attempt topic. No token, address, driver or order ID leaves the server. */
export function trackingTopic(storeId: string, orderId: string, assignmentId: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Tracking configuration unavailable');
  return `customer-tracking:${crypto.createHmac('sha256', secret)
    .update(JSON.stringify([timelineStoreKey(storeId), String(orderId), String(assignmentId)]))
    .digest('hex')}`;
}

/** Broadcast contains invalidation only; every snapshot must recheck authorization. */
export async function publishTrackingInvalidation(state: any, revision: number): Promise<boolean> {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key || !Number.isSafeInteger(revision) || revision < 1) return false;
  try {
    const now = Date.now();
    const active = new Set(['picked_up', 'in_transit', 'em_rota']);
    const assignments = (Array.isArray(state?.assignments) ? state.assignments : [])
      .filter((a: any) => a?.id && a.orderId && a.storeId && (active.has(a.status) ||
        [a.deliveredAt, a.canceledAt, a.releasedAt, a.updatedAt].some(value => {
          const at = Date.parse(value || '');
          return Number.isFinite(at) && at <= now && now - at <= 15 * 60_000;
        })))
      .sort((a: any, b: any) => Number(active.has(b.status)) - Number(active.has(a.status)))
      .slice(0, 200);
    const topics = new Set<string>(assignments.map((a: any) => trackingTopic(a.storeId, a.orderId, a.id)));
    if (topics.size === 0) return true;
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...topics].map(topic => ({ topic, event: 'updated', private: true, payload: { revision } })) }),
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    // Delivery state is already committed. Polling recovers missed notifications.
    return false;
  }
}
