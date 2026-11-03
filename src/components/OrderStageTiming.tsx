import { orderTiming, stageLabels, formatStageDuration } from '@/lib/logistics/stage-timing';

export default function OrderStageTiming({order, now}: {order: Parameters<typeof orderTiming>[0]; now: number}) {
  const timing = orderTiming(order, now);
  return <details className="rounded-lg border border-zinc-800 p-2 text-[11px] text-zinc-400">
    <summary className="cursor-pointer">{stageLabels[timing.current] || timing.current}: {formatStageDuration(timing.durations[timing.current])} · Total: {formatStageDuration(timing.total)}</summary>
    <div className="mt-2 space-y-1">
      {Object.entries(stageLabels).filter(([key]) => key !== 'concluido').map(([key,label]) => <div key={key}>{label}: {formatStageDuration(timing.durations[key])}</div>)}
      <div>Até a retirada: {formatStageDuration(timing.untilPickup)}</div>
      {timing.events.map((event,i) => <div key={`${event.at}-${i}`} className="text-zinc-500">{new Date(event.at).toLocaleString('pt-BR')} · {stageLabels[event.stage] || event.stage}{event.reason === 'partial_pickup' ? ' · devolvido ao despacho' : ''}</div>)}
    </div>
  </details>;
}
