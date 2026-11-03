import { isPickupOrder } from '../order-fulfillment';

export interface AutomaticDispatchResult {
  status: 'disabled' | 'created' | 'skipped' | 'pending';
  message: string;
  offerId?: string;
}

export function automaticDispatchEnabled(settings: any): boolean {
  return settings?.automaticDispatchEnabled === true;
}

export function isCollectionOrder(order: any): boolean {
  return isPickupOrder(order);
}

/** Only a persisted transition to ready triggers this optional presentation of an offer. */
export async function dispatchReadyOrder(
  order: any,
  previousStatus: string,
  settings: any,
  createOffer: (body: Record<string, unknown>) => Promise<{ ok: boolean; data: any }>,
): Promise<AutomaticDispatchResult> {
  if (!automaticDispatchEnabled(settings)) return { status: 'disabled', message: 'Despacho manual mantido.' };
  if (order?.status !== 'pronto' || previousStatus === 'pronto' || isCollectionOrder(order)) {
    return { status: 'skipped', message: 'Este pedido não iniciou uma nova etapa de despacho.' };
  }
  const fee = order?.deliveryFee;
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
    return { status: 'pending', message: 'Pedido pronto. Confira o valor da entrega e despache manualmente.' };
  }
  try {
    const result = await createOffer({ automatic: true, orderId: order.id, feeOffered: fee });
    if (result.ok && result.data?.success) return {
      status: 'created', message: 'Oferta enviada automaticamente. Aguardando aceite do entregador.',
      offerId: result.data.offer?.offerId || result.data.offer?.id,
    };
    if (['AUTOMATIC_DISPATCH_DISABLED', 'ORDER_ALREADY_ASSIGNED', 'ORDER_ALREADY_OFFERED', 'AUTOMATIC_DISPATCH_ALREADY_ATTEMPTED'].includes(result.data?.code)) {
      return { status: 'skipped', message: 'Pedido atualizado; não foi criada outra oferta.' };
    }
    return { status: 'pending', message: 'Pedido pronto, mas o despacho automático não foi confirmado. Confira os entregadores e use o despacho manual.' };
  } catch {
    // Never roll back a confirmed kitchen status or claim that an offer was delivered.
    return { status: 'pending', message: 'Pedido pronto. Não foi possível confirmar o despacho automático; confira as ofertas antes de tentar manualmente.' };
  }
}
