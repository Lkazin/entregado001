export type OrderStage = 'recebido' | 'preparando' | 'despacho' | 'retirada' | 'em_entrega' | 'concluido';
export const waitingPickupStatuses = ['accepted', 'assigned', 'waiting_pickup'];
export const pickedUpStatuses = ['picked_up', 'in_transit', 'em_rota'];
export const activeAssignmentStatuses = [...waitingPickupStatuses, ...pickedUpStatuses];
export const releasedAssignmentStatuses = ['withdrawn', 'returned_to_dispatch', 'canceled_by_driver', 'canceled_by_store'];
const terminalOrderStatuses = ['cancelado', 'concluido', 'entregue', 'delivered'];
const aliases = new Set(['11111111-1111-1111-1111-111111111111', 'store_bella_pizza', 'bella-pizza']);
export function timelineStoreKey(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  return !id || aliases.has(id) ? 'store_bella_pizza' : id;
}

export function mergeStageHistory(...lists: any[]): any[] {
  const unique = new Map<string, any>();
  for (const list of lists) for (const event of Array.isArray(list) ? list : []) {
    if (!event || typeof event !== 'object') continue;
    const key = event.eventId || `${event.stage}|${event.at}|${event.attemptId || ''}|${event.reason || ''}`;
    if (!unique.has(key)) unique.set(key, { ...event });
  }
  return [...unique.values()].sort((a,b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
}

/** Records a real transition without replacing original timestamps/history. */
export function recordStage(target: any, stage: OrderStage, date: string, metadata: { attemptId?: string; reason?: string } = {}): boolean {
  if (!target || !Number.isFinite(Date.parse(date))) return false;
  const history = mergeStageHistory(target.stageHistory);
  const key = metadata.attemptId ? `${stage}:${metadata.attemptId}:${metadata.reason || ''}` : undefined;
  const last = history.at(-1);
  if ((key && history.some(event => event.eventId === key)) ||
    (!key && last?.stage === stage && (last.reason || '') === (metadata.reason || ''))) return false;
  const event = { stage, at: date, ...metadata, ...(key ? { eventId: key } : {}) };
  target.stageHistory = mergeStageHistory(history, [event]);
  const field = stage === 'recebido' ? 'receivedAt' : stage === 'preparando' ? 'preparingAt' :
    stage === 'despacho' ? (metadata.reason === 'ready' ? 'readyAt' : metadata.reason === 'accepted' ? 'acceptedAt' : 'dispatchedAt') :
    stage === 'retirada' ? 'pickedUpAt' : stage === 'em_entrega' ? 'departedAt' : 'deliveredAt';
  if (!target[field]) target[field] = date;
  return true;
}

function matchesOrder(candidate: any, order: any): boolean {
  const id = candidate.orderId || candidate.id;
  return String(id) === String(order.id) || Boolean(candidate.orderNumber && order.orderNumber &&
    String(candidate.orderNumber).replace(/^#/, '') === String(order.orderNumber).replace(/^#/, ''));
}
function eventTime(value: any): number {
  return Date.parse(value.releasedAt || value.canceledAt || value.deliveredAt || value.pickedUpAt || value.acceptedAt || value.createdAt || '') || 0;
}

export function projectOrderFromLogistics(order: any, state: any, storeId: string): any {
  const result = { ...order, stageHistory: mergeStageHistory(order.stageHistory) };
  const assignments = (state.assignments || []).filter((a: any) => timelineStoreKey(a.storeId) === timelineStoreKey(storeId) && matchesOrder(a, order));
  const offers = (state.offers || []).filter((o: any) => timelineStoreKey(o.storeId) === timelineStoreKey(storeId) &&
    (Array.isArray(o.orders) ? o.orders.some((item: any) => matchesOrder(item, order)) : matchesOrder(o, order)));
  result.stageHistory = mergeStageHistory(result.stageHistory, ...assignments.map((a: any) => a.stageHistory));
  const completed = assignments.filter((a: any) => ['delivered','entregue'].includes(a.status)).sort((a: any,b: any) => eventTime(b)-eventTime(a))[0];
  const active = assignments.filter((a: any) => activeAssignmentStatuses.includes(a.status))
    .sort((a: any,b: any) => Number(pickedUpStatuses.includes(b.status))-Number(pickedUpStatuses.includes(a.status)) || eventTime(b)-eventTime(a))[0];
  const released = assignments.filter((a: any) => releasedAssignmentStatuses.includes(a.status)).sort((a: any,b: any) => eventTime(b)-eventTime(a))[0];
  const pending = offers.filter((o: any) => o.status === 'pendente' && (!o.expiresAt || Date.parse(o.expiresAt)>Date.now())).sort((a: any,b: any) => eventTime(b)-eventTime(a))[0];
  if (order.status === 'cancelado') return result;
  const selected = completed || active;
  if (selected) {
    result.driverId = selected.driverId; result.driverName = selected.driverName; result.assignedDriverName = selected.driverName;
    result.offerGroupId = selected.offerId || selected.batchId;
    if (!result.acceptedAt && selected.acceptedAt) result.acceptedAt = selected.acceptedAt;
    if (completed) {
      result.status = 'concluido'; result.dispatchStatus = 'entregue';
      if (selected.deliveredAt) { result.deliveredAt ||= selected.deliveredAt; recordStage(result,'concluido',selected.deliveredAt,{attemptId:selected.id}); }
    } else if (pickedUpStatuses.includes(selected.status)) {
      result.status = 'em_entrega'; result.dispatchStatus = 'em_entrega';
      if (selected.pickedUpAt) { result.pickedUpAt ||= selected.pickedUpAt; recordStage(result,'retirada',selected.pickedUpAt,{attemptId:selected.id}); recordStage(result,'em_entrega',selected.pickedUpAt,{attemptId:selected.id}); }
    } else {
      result.status = 'pronto'; result.dispatchStatus = 'aceito_aguardando_retirada';
      if (selected.acceptedAt) recordStage(result,'despacho',selected.acceptedAt,{attemptId:selected.id,reason:'accepted'});
    }
  } else if (!terminalOrderStatuses.includes(order.status) && pending && (!released || eventTime(pending)>eventTime(released))) {
    result.status = 'pronto'; result.dispatchStatus = 'aguardando_aceite'; result.offerGroupId = pending.offerId || pending.id;
    result.driverId = pending.targetDriverId || null; result.driverName = pending.driverName; result.assignedDriverName = pending.driverName;
    if (pending.createdAt) recordStage(result,'despacho',pending.createdAt,{attemptId:pending.offerId || pending.id});
  } else if (!terminalOrderStatuses.includes(order.status) && released && !order.pickedUpAt && !pickedUpStatuses.includes(order.status)) {
    result.status = 'pronto'; result.dispatchStatus = 'disponivel';
    result.driverId = null; result.driverName = null; result.assignedDriverName = null; result.offerGroupId = null;
  }
  return result;
}

const STATUS_RANK: Record<string, number> = {
  'recebido': 1,
  'preparando': 2,
  'pronto': 3,
  'retirada': 3,
  'em_entrega': 4,
  'concluido': 5,
  'cancelado': 99,
};

export function projectStoreOrders(orders: any[], state: any, storeId: string): any[] {
  const store = timelineStoreKey(storeId);
  const projections = state.orderProjectionsByStore?.[store] || {};
  const map = new Map<string, any>();
  for (const order of orders) if (order?.id && (!order.storeId || timelineStoreKey(order.storeId) === store)) map.set(String(order.id), { ...order });
  for (const projected of Object.values(projections) as any[]) if (projected?.id) {
    const previous = map.get(String(projected.id));
    if (!previous) {
      map.set(String(projected.id), { ...projected });
    } else {
      const prevRank = STATUS_RANK[previous.status] || 0;
      const projRank = STATUS_RANK[projected.status] || 0;
      const resolvedStatus = previous.status === 'cancelado' || projected.status === 'cancelado'
        ? 'cancelado'
        : prevRank >= projRank
        ? previous.status
        : projected.status;

      map.set(String(projected.id), {
        ...projected,
        ...previous,
        status: resolvedStatus,
        dispatchStatus: previous.dispatchStatus || projected.dispatchStatus,
        stageHistory: mergeStageHistory(previous?.stageHistory, projected.stageHistory),
      });
    }
  }
  return [...map.values()].map(order => projectOrderFromLogistics(order,state,store));
}
