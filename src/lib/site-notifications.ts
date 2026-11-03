import { DEFAULT_ORDER_ALARM, orderDelay } from './order-delay-alerts';
import { normalizeOrderStatus, projectStoreOrders, timelineStoreKey } from './logistics/order-timeline';

export interface StoreNotice { id: string; kind: 'delivered' | 'delay' | 'rating'; orderId: string; orderNumber: string; message: string; at: string; read: boolean }
export const DEFAULT_NOTICE_LIMITS = { preparing: 25, pickup: 10, transit: 45 };
export function noticeLimits(value: any) {
  return Object.fromEntries(Object.entries(DEFAULT_NOTICE_LIMITS).map(([key, fallback]) => {
    const n = Number(value?.[key]); return [key, Number.isInteger(n) && n >= 1 && n <= 240 ? n : fallback];
  })) as typeof DEFAULT_NOTICE_LIMITS;
}
function timestamp(...values: any[]): number {
  for (const value of values) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) continue; const n = Date.parse(value); if (Number.isFinite(n)) return n; }
  return NaN;
}
export function deriveStoreNotices(state: any, rawStore: string, now = Date.now()): StoreNotice[] {
  const store = timelineStoreKey(rawStore);
  const settings = state.settingsByStore?.[store] || {};
  const read = new Set(Array.isArray(settings.notificationReadIds) ? settings.notificationReadIds : []);
  const limits = noticeLimits(settings.siteNoticeLimits);
  const orders = projectStoreOrders([], state, store);
  const notices: StoreNotice[] = [];
  for (const order of orders) {
    if (order.deletedAt || (order.storeId && timelineStoreKey(order.storeId) !== store)) continue;
    const status = normalizeOrderStatus(order.status), number = String(order.orderNumber || '').replace(/^#/, '');
    const assignments = (state.assignments || []).filter((a: any) => timelineStoreKey(a.storeId) === store && String(a.orderId) === String(order.id));
    const delivered = assignments.filter((a: any) => ['delivered','entregue'].includes(a.status)).sort((a: any,b: any) => (timestamp(b.deliveredAt)||0)-(timestamp(a.deliveredAt)||0))[0];
    const at = timestamp(delivered?.deliveredAt, order.deliveredAt);
    if (status === 'concluido' && Number.isFinite(at) && at <= now && now-at < 30*86400000) {
      const id = `delivered:${order.id}:${at}`;
      notices.push({ id, kind:'delivered', orderId:String(order.id), orderNumber:number,
        message:`${delivered?.driverName || order.assignedDriverName || order.driverName || 'O entregador'} entregou o pedido #${number}.`, at:new Date(at).toISOString(), read:read.has(id) });
    }
    const phase = status === 'recebido' || status === 'preparando' ? 'preparing' : status === 'pronto' ? 'pickup' : status === 'em_entrega' ? 'transit' : null;
    if (!phase) continue;
    const limit = limits[phase];
    const delay = orderDelay({...order,status},now,{...DEFAULT_ORDER_ALARM,warningMinutes:limit,criticalMinutes:limit+1});
    if (delay && now-delay.since < 86400000) {
      const id = `delay:${order.id}:${phase}:${delay.since}`;
      notices.push({ id, kind:'delay', orderId:String(order.id), orderNumber:number, message:`Pedido #${number} está ${delay.label} há mais de ${limit} min. Confira o andamento.`, at:new Date(delay.since+limit*60000).toISOString(), read:read.has(id) });
    }
  }
  // Feedback stays inside the server-authorized store projection.
  const ratings = new Map<string, any>();
  for (const [id, projection] of Object.entries<any>(state.orderProjectionsByStore?.[store] || {})) {
    if (projection?.rating && !projection.deletedAt && (!projection.storeId || timelineStoreKey(projection.storeId) === store) && (!projection.rating.storeId || timelineStoreKey(projection.rating.storeId) === store)) ratings.set(id, { ...projection.rating, orderId: id, orderNumber: projection.orderNumber || id });
  }
  const indexed = state.ratingsByStore?.[store];
  for (const rating of Array.isArray(indexed) ? indexed : Object.values(indexed || {}) as any[]) {
    if (rating?.orderId && !state.orderProjectionsByStore?.[store]?.[rating.orderId]?.deletedAt && (!rating.storeId || timelineStoreKey(rating.storeId) === store) && !ratings.has(String(rating.orderId))) ratings.set(String(rating.orderId), rating);
  }
  for (const [orderId, rating] of ratings) {
    const at = timestamp(rating.ratedAt, rating.createdAt, rating.created_at), stars = Number(rating.orderStars || rating.stars);
    if (!Number.isFinite(at) || at > now || now-at >= 30*86400000 || !Number.isInteger(stars) || stars < 1 || stars > 5) continue;
    const id = `rating:${orderId}:${at}`, number = String(rating.orderNumber || orderId).replace(/^#/, '');
    notices.push({id,kind:'rating',orderId,orderNumber:number,message:`Nova avaliação do pedido #${number}: ${stars} de 5 estrelas${rating.comment ? ' · com comentário' : ''}.`,at:new Date(at).toISOString(),read:read.has(id)});
  }
  return notices.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,150);
}
