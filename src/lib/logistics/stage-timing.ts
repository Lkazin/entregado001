export const stageLabels: Record<string, string> = {
  recebido: 'Recebido', preparando: 'Em preparo', despacho: 'Despacho → aceite',
  retirada: 'Aceite → retirada', em_entrega: 'Em entrega', concluido: 'Concluído',
};
type Event = { stage: string; at: string; reason?: string; attemptId?: string };
type TimedOrder = { status: string; dispatchStatus?: string; stageHistory?: Event[];
  createdAt?: string; createdAtISO?: string; receivedAt?: string; preparingAt?: string;
  readyAt?: string; dispatchedAt?: string; acceptedAt?: string; pickedUpAt?: string;
  deliveredAt?: string; canceledAt?: string; };
export function orderTiming(order: TimedOrder, now: number) {
  const events = (order.stageHistory || []).filter(e => Number.isFinite(Date.parse(e.at)))
    .map(e => ({ ...e, stage: e.reason === 'accepted' ? 'retirada' : e.stage === 'retirada' ? 'em_entrega' : e.stage }));
  const known: [string, string | undefined][] = [
    ['recebido', order.receivedAt || order.createdAtISO || order.createdAt],
    ['preparando', order.preparingAt], ['despacho', order.readyAt || order.dispatchedAt],
    ['retirada', order.acceptedAt], ['em_entrega', order.pickedUpAt], ['concluido', order.deliveredAt],
  ];
  for (const [stage, at] of known) if (at && Number.isFinite(Date.parse(at)) && !events.some(e => e.stage === stage)) events.push({stage, at});
  events.sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
  const endDate = order.status === 'concluido' ? order.deliveredAt : order.status === 'cancelado' ? order.canceledAt : undefined;
  const end = endDate && Number.isFinite(Date.parse(endDate)) ? Date.parse(endDate) :
    ['concluido','cancelado'].includes(order.status) ? events.length ? Date.parse(events.at(-1)!.at) : 0 : now;
  const durations: Record<string, number> = {};
  events.forEach((event, i) => {
    const until = i+1 < events.length ? Date.parse(events[i+1].at) : end;
    if (event.stage !== 'concluido') durations[event.stage] = (durations[event.stage] || 0) + Math.max(0, until-Date.parse(event.at));
  });
  const received = events.find(e => e.stage === 'recebido');
  const pickup = events.find(e => e.stage === 'em_entrega');
  const current = order.status === 'pronto' ? order.dispatchStatus === 'aceito_aguardando_retirada' ? 'retirada' : 'despacho' : order.status;
  return {events, durations, current, total: received && end ? Math.max(0,end-Date.parse(received.at)) : null,
    untilPickup: received && pickup ? Math.max(0,Date.parse(pickup.at)-Date.parse(received.at)) : null};
}
export function formatStageDuration(ms: number | null | undefined) {
  if (ms == null) return 'Não registrado';
  const minutes = Math.floor(Math.max(0,ms)/60000);
  return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}min` : `${minutes}min`;
}
