export type AlarmPhase = 'recebido' | 'preparando' | 'pronto' | 'em_entrega';
export interface OrderAlarmSettings { enabled: boolean; volume: number; repeatSeconds: number; warningMinutes: number; criticalMinutes: number; }
export const DEFAULT_ORDER_ALARM: OrderAlarmSettings = { enabled: true, volume: 50, repeatSeconds: 30, warningMinutes: 5, criticalMinutes: 10 };
export function normalizeAlarmSettings(raw: Partial<OrderAlarmSettings> = {}): OrderAlarmSettings {
  const bounded = (value: unknown, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
  const warningMinutes = bounded(raw.warningMinutes, 1, 120, 5);
  return { enabled: raw.enabled !== false, volume: bounded(raw.volume, 0, 100, 50), repeatSeconds: bounded(raw.repeatSeconds, 10, 300, 30), warningMinutes, criticalMinutes: bounded(raw.criticalMinutes, warningMinutes + 1, 240, Math.max(10, warningMinutes + 1)) };
}
export function orderDelay(order: any, now: number, settings = DEFAULT_ORDER_ALARM) {
  const phase = order.status as AlarmPhase;
  if (!['recebido', 'preparando', 'pronto', 'em_entrega'].includes(phase)) return null;
  const awaitingPickup = phase === 'pronto' && order.dispatchStatus === 'aceito_aguardando_retirada';
  const sources: Record<AlarmPhase, unknown[]> = {
    recebido: [order.receivedAt, order.createdAtISO, order.createdAt],
    preparando: [order.preparingAt],
    pronto: awaitingPickup ? [order.acceptedAt] : [order.readyAt, order.dispatchedAt],
    em_entrega: [order.pickedUpAt, order.departedAt],
  };
  const eventStage = phase === 'pronto' ? 'despacho' : phase;
  const history = (Array.isArray(order.stageHistory) ? order.stageHistory : []).filter((e: any) => e.stage === eventStage && (phase !== 'pronto' || (awaitingPickup ? e.reason === 'accepted' : e.reason !== 'accepted'))).map((e: any) => e.at);
  const times = [...sources[phase], ...history].filter((value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)).map(value => Date.parse(value)).filter(value => Number.isFinite(value) && value <= now);
  if (!times.length) return null;
  const since = Math.max(...times), minutes = Math.floor((now - since) / 60000);
  if (minutes < settings.warningMinutes) return null;
  const level = minutes >= settings.criticalMinutes ? 'critical' : 'warning';
  const label = phase === 'recebido' ? 'aguardando aceite' : phase === 'preparando' ? 'em preparo' : phase === 'pronto' ? (awaitingPickup ? 'aguardando retirada' : 'aguardando entregador') : 'em entrega';
  return { since, id: `${order.id}:${phase}:${since}`, orderId: String(order.id), orderNumber: String(order.orderNumber || order.id), phase, minutes, level, label };
}
