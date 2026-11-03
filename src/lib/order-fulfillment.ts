/** Canonical fulfillmentType plus legacy aliases; absent fields retain delivery behavior. */
export function isPickupOrder(order: any): boolean {
  if (order?.fulfillmentType === 'pickup') return true;
  if (order?.fulfillmentType === 'delivery') return false;
  return [order?.fulfillment_type, order?.deliveryType, order?.orderType]
    .some(value => typeof value === 'string' && ['pickup', 'retirada', 'takeout', 'collection'].includes(value.trim().toLowerCase()));
}
