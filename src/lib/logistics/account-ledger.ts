/** Historical ownership comes from account memberships, never a name/phone match. */
export function buildAccountLedger(accountId: string, memberships: any[], drivers: any[], assignments: any[], settingsFor: (store: string) => any, activeStores: string[]) {
  const storeKey = (id: string) => ['11111111-1111-1111-1111-111111111111','bella-pizza','store_bella_pizza'].includes(id) ? 'store_bella_pizza' : id;
  const owned = memberships.filter(m => m.account_id === accountId);
  return [...new Set(owned.map(m => storeKey(m.store_id)))].map(storeId => {
    const links = owned.filter(m => storeKey(m.store_id) === storeId);
    const ids = new Set(links.flatMap(m => [m.membership_id,m.driver_id]));
    const records = drivers.filter(d => storeKey(d.storeId) === storeId && ids.has(d.id));
    const rows = assignments.filter(a => storeKey(a.storeId) === storeId && ids.has(a.driverId));
    const completed = rows.filter(a => ['delivered','entregue'].includes(a.status));
    const deliveries = completed.map(a => {
      const raw = a.feeOffered ?? a.deliveryFee;
      const amount = raw == null || raw === '' || !Number.isFinite(Number(raw)) || Number(raw)<0 ? null : Number(raw);
      return {assignmentId:a.id || a.assignmentId,orderNumber:a.orderNumber,amount,status:a.status,
        acceptedAt:a.acceptedAt,pickedUpAt:a.pickedUpAt || a.pickupConfirmedAt,deliveredAt:a.deliveredAt || null};
    }).sort((a,b) => (Date.parse(b.deliveredAt || '') || 0)-(Date.parse(a.deliveredAt || '') || 0));
    const settings = settingsFor(storeId) || {};
    return {storeId,storeName:settings.storeName || records[0]?.storeName || 'Loja',storeAddress:settings.storeAddress,
      completedCount:completed.length,canceledCount:rows.filter(a => ['withdrawn','canceled_by_store','canceled_by_driver','cancelada','cancelled','canceled'].includes(a.status)).length,
      totalToReceive:deliveries.reduce((sum,a) => sum+(a.amount ?? 0),0),uninformedCount:deliveries.filter(a=>a.amount==null).length,
      deliveries,lastShiftDate:records.map(d=>d.activatedAt || d.createdAt).filter(Boolean).sort().at(-1) || deliveries[0]?.deliveredAt || null,
      isActiveShift:activeStores.some(id=>storeKey(id)===storeId)};
  });
}
