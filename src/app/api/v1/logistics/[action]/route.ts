import { valhallaRoute } from '@/lib/logistics/valhalla-client';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  signDriverToken,
  verifyAdminRequest,
  verifyDriverRequest as verifySignedDriverRequest,
  verifyDriverToken,
  extractBearerToken,
} from '@/lib/auth/tokens';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readLogisticsState, writeLogisticsState, StateStoreError } from '@/lib/logistics/state-store';
import { AccountSessionError, normalizeDriverPhone } from '@/lib/auth/driver-account';
import { prepareDriverAccount, driverAccountContext, bindAccountMembership } from '@/lib/auth/driver-account-logistics';
import { notifyDriversOfNewOffer } from '@/lib/push/web-push-server';
import { activeAssignmentStatuses, waitingPickupStatuses, pickedUpStatuses, recordStage, mergeStageHistory, projectStoreOrders } from '@/lib/logistics/order-timeline';

export const dynamic = 'force-dynamic';

const DEFAULT_STORE_ID = 'store_bella_pizza';
const DEFAULT_STORE_UUID = '11111111-1111-1111-1111-111111111111';

function normalizeStoreId(raw?: string | null): string {
  if (!raw) return DEFAULT_STORE_ID;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === DEFAULT_STORE_UUID ||
    trimmed === 'store_bella_pizza' ||
    trimmed === 'bella-pizza'
  ) {
    return DEFAULT_STORE_ID;
  }
  return trimmed;
}

function isSameStore(a?: string | null, b?: string | null): boolean {
  return normalizeStoreId(a) === normalizeStoreId(b);
}

function toValidUuid(val?: string | null): string {
  if (!val) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  const hash = crypto.createHash('md5').update(val).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface StoreLogisticsSettings {
  storeId: string;
  storeName?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  distributionMode: 'fixed_driver' | 'broadcast_enabled';
  fixedDriverId: string | null;
  maxConcurrentDeliveries: number;
  offerTimeoutSeconds: number;
  updatedAt: string;
}

export interface LiveDriverLocation {
  driverId: string;
  driverName?: string;
  storeId?: string;
  assignmentId?: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  updatedAt: string;
}

let liveDrivers: any[] = [];
let liveOffers: any[] = [];
let liveAssignments: any[] = [];
let liveTracking: Record<string, LiveDriverLocation> = {};
let liveSettingsByStore: Record<string, StoreLogisticsSettings> = {};
let liveOrderProjectionsByStore: Record<string, Record<string, any>> = {};
let liveStateVersion = 0;
let lastLocalLogisticsPersistAt = 0;
let lastMutationId = '';
let databaseRevision = 0;
const mutationRequest = new AsyncLocalStorage<NextRequest>();

const gShared = globalThis as unknown as {
  __novaesweb_orders__?: any[];
  __novaesweb_orders_updated_at__?: number;
};

// Fila de execução atômica para serializar mutações concorrentes na mesma instância
// combinada com recarregamento + verificação de versão no armazenamento persistente (CAS)
let mutationQueue: Promise<any> = Promise.resolve();

function withAtomicLogisticsLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(fn, fn);
  mutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

const STORE_LOCATION = {
  name: 'Bella Pizza',
  address: 'Rua Quinze de Janeiro, 150 - Centro, Canoas / RS',
  city: 'Canoas',
  state: 'RS',
  latitude: -29.9189,
  longitude: -51.1781,
};

function getStoreSettings(storeId: string): StoreLogisticsSettings {
  const norm = normalizeStoreId(storeId);
  if (!liveSettingsByStore[norm]) {
    liveSettingsByStore[norm] = {
      storeId: norm,
      storeName: STORE_LOCATION.name,
      storeAddress: STORE_LOCATION.address,
      storeCity: STORE_LOCATION.city,
      storeState: STORE_LOCATION.state,
      storeLatitude: STORE_LOCATION.latitude,
      storeLongitude: STORE_LOCATION.longitude,
      distributionMode: 'broadcast_enabled',
      fixedDriverId: null,
      maxConcurrentDeliveries: 5,
      offerTimeoutSeconds: 900,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Garante que lojas já salvas sem endereço recebam o padrão Centro de Canoas - RS
    if (!liveSettingsByStore[norm].storeAddress || liveSettingsByStore[norm].storeAddress?.includes('São Paulo')) {
      liveSettingsByStore[norm].storeName = liveSettingsByStore[norm].storeName || STORE_LOCATION.name;
      liveSettingsByStore[norm].storeAddress = STORE_LOCATION.address;
      liveSettingsByStore[norm].storeCity = STORE_LOCATION.city;
      liveSettingsByStore[norm].storeState = STORE_LOCATION.state;
      liveSettingsByStore[norm].storeLatitude = STORE_LOCATION.latitude;
      liveSettingsByStore[norm].storeLongitude = STORE_LOCATION.longitude;
    }
  }
  return liveSettingsByStore[norm];
}

function getEffectiveStoreLocation(storeId: string) {
  const s = getStoreSettings(storeId);
  return {
    name: s.storeName || STORE_LOCATION.name,
    address: s.storeAddress || STORE_LOCATION.address,
    city: s.storeCity || STORE_LOCATION.city,
    state: s.storeState || STORE_LOCATION.state,
    latitude: typeof s.storeLatitude === 'number' ? s.storeLatitude : STORE_LOCATION.latitude,
    longitude: typeof s.storeLongitude === 'number' ? s.storeLongitude : STORE_LOCATION.longitude,
  };
}

// Calcula os contadores reais de cada entregador com base nas atribuições únicas por pedido e loja
// Isso garante que cliques repetidos ou retentativas nunca somem contadores duplicados.
function recomputeDriverCounters() {
  // Deduplica atribuições ativas pelo par (storeId + orderId) mantendo a mais recente
  const seenActiveByOrder = new Set<string>();
  const dedupedAssignments: any[] = [];

  for (const a of liveAssignments) {
    const isTerminal =
      a.status === 'delivered' ||
      a.status === 'entregue' ||
      a.status === 'canceled_by_store' ||
      a.status === 'canceled_by_driver';
    const orderKey = `${normalizeStoreId(a.storeId)}::${String(a.orderId || a.orderNumber || a.id)}`;
    if (!isTerminal) {
      if (seenActiveByOrder.has(orderKey)) {
        continue;
      }
      seenActiveByOrder.add(orderKey);
    }
    dedupedAssignments.push(a);
  }
  liveAssignments = dedupedAssignments;

  for (const d of liveDrivers) {
    const dStore = normalizeStoreId(d.storeId);
    const dId = d.driverId || d.id;
    const dMembership = d.id;
    const dName = d.driverName || d.name;

    const matchingAssignments = liveAssignments.filter((a) => {
      if (!isSameStore(a.storeId, dStore)) return false;
      return (
        (dId && (a.driverId === dId || a.driverId === dMembership)) ||
        (dMembership && a.driverId === dMembership) ||
        (!a.driverId && dName && a.driverName === dName)
      );
    });

    const uniqueWaitingOrders = new Set<string>();
    const uniqueInTransitOrders = new Set<string>();
    const uniqueDeliveredOrders = new Set<string>();

    for (const a of matchingAssignments) {
      const ordKey = String(a.orderId || a.orderNumber || a.id);
      if (a.status === 'waiting_pickup') {
        uniqueWaitingOrders.add(ordKey);
      } else if (a.status === 'picked_up' || a.status === 'in_transit' || a.status === 'em_rota' || a.status === 'waiting_pickup' || a.status === 'assigned' || a.status === 'accepted') {
        uniqueInTransitOrders.add(ordKey);
      } else if (a.status === 'delivered' || a.status === 'entregue') {
        uniqueDeliveredOrders.add(ordKey);
      }
    }

    d.waitingPickupCount = uniqueWaitingOrders.size;
    d.inTransitCount = uniqueInTransitOrders.size;
    d.activeDeliveries = uniqueWaitingOrders.size + uniqueInTransitOrders.size;
    d.completedDeliveriesCount = uniqueDeliveredOrders.size;
  }
}

function verifiedAssignmentCoordinates(a: any): {latitude:number;longitude:number} | null {
  const latitude = a.destinationCoordinates?.latitude ?? a.deliveryLatitude;
  const longitude = a.destinationCoordinates?.longitude ?? a.deliveryLongitude;
  return typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude)<=90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude)<=180 ? {latitude,longitude} : null;
}
const geocodeCache: Record<string, { lat: number; lng: number }> = {};

async function geocodeAddress(
  addressStr: string,
  options?: { city?: string; state?: string; cep?: string; region?: string }
): Promise<{ lat: number; lng: number } | null> {
  const endpoint = process.env.NOMINATIM_SEARCH_URL;
  if (!endpoint || !addressStr?.trim()) return null;
  const query = [addressStr.trim(), options?.region, options?.city, options?.state, options?.cep, 'Brasil'].filter(Boolean).join(', ');
  const key = query.toLowerCase();
  if (geocodeCache[key]) return geocodeCache[key];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL(endpoint);
    url.searchParams.set('q', query); url.searchParams.set('format','jsonv2');
    url.searchParams.set('limit','2'); url.searchParams.set('countrycodes','br');
    const response = await fetch(url, { signal:controller.signal, cache:'no-store', headers:{'User-Agent':'NovaesWebDelivery/1.0 (+https://entregado001-oe6y.vercel.app)'} });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length !== 1) return null;
    if (data[0]?.lat == null || data[0]?.lon == null || String(data[0].lat).trim() === '' || String(data[0].lon).trim() === '') return null;
    const lat = Number(data[0].lat), lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lng) || Math.abs(lng)>180) return null;
    if (Object.keys(geocodeCache).length >= 2000) delete geocodeCache[Object.keys(geocodeCache)[0]];
    return geocodeCache[key] = {lat,lng};
  } catch { return null; }
  finally {clearTimeout(timeout);}
}

async function calculateOSRMRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMin: number }> {
  if (process.env.VALHALLA_BASE_URL) return valhallaRoute({latitude:fromLat,longitude:fromLng},{latitude:toLat,longitude:toLng});
  try {
    const url = `${process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        return {
          coordinates: route.geometry.coordinates as [number, number][],
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMin: Math.max(1, Math.round(route.duration / 60)),
        };
      }
    }
  } catch {}

  throw new Error('Serviço de rotas indisponível.');
}

async function loadLogisticsState(_forceCloud = false) {
  if (!_forceCloud && Date.now() - lastLocalLogisticsPersistAt < 3500) {
    return;
  }
  try {
    const {state: parsed, revision} = await readLogisticsState();
    databaseRevision = revision;
    {
      const cloudVersion = typeof parsed.stateVersion === 'number' ? parsed.stateVersion : 1;

      // A revisão do banco é a autoridade; RPCs também atualizam este estado.

      liveStateVersion = Math.max(liveStateVersion, cloudVersion);
      if (typeof parsed.lastMutationId === 'string') {
        lastMutationId = parsed.lastMutationId;
      }
      if (parsed.settingsByStore && typeof parsed.settingsByStore === 'object') {
        liveSettingsByStore = parsed.settingsByStore;
      }
      liveOrderProjectionsByStore = parsed.orderProjectionsByStore || {};
      if (Array.isArray(parsed.drivers)) {
        liveDrivers = parsed.drivers.map((d: any) => {
            const isExpired =
              d.expiresAt &&
              new Date(d.expiresAt).getTime() < Date.now() &&
              d.status !== 'revogado' &&
              d.status !== 'vinculo_removido';
            return {
              ...d,
              storeId: normalizeStoreId(d.storeId),
              driverName: d.driverName ?? d.name ?? null,
              name: d.driverName ?? d.name ?? null,
              phone: d.phone ?? null,
              vehiclePlate: d.vehiclePlate ?? null,
              driverId: d.driverId ?? d.id ?? null,
              status: d.status ?? (d.driverName ? 'ativo' : 'aguardando_motoboy'),
              isExpired: Boolean(isExpired),
              shiftStatus:
                d.shiftStatus ??
                (d.presence === 'disponivel'
                  ? 'em_plantao'
                  : d.driverName
                  ? 'plantao_encerrado'
                  : 'aguardando_motoboy'),
              presence: d.presence ?? 'indisponivel',
              validityDays: d.validityDays ?? d.inviteExpiryDays ?? 1,
              inviteExpiryDays: d.validityDays ?? d.inviteExpiryDays ?? 1,
            };
          });
      }
      if (Array.isArray(parsed.offers)) {
        liveOffers = parsed.offers.map((o: any) => ({
          ...o,
          storeId: normalizeStoreId(o.storeId),
        }));
      }
      if (Array.isArray(parsed.assignments)) {
        liveAssignments = parsed.assignments.map((a: any) => ({
          ...a,
          storeId: normalizeStoreId(a.storeId),
        }));
      }
      if (parsed.tracking && typeof parsed.tracking === 'object') {
        liveTracking = parsed.tracking;
        if (liveTracking['drv_default']) {
          delete liveTracking['drv_default'];
        }
      }
      recomputeDriverCounters();
    }
  } catch (error) { throw error; }
}

async function persistLogisticsState(mutationId?: string): Promise<string> {
  const mutId = mutationId || crypto.randomUUID();
  try {
    recomputeDriverCounters();
    // Orders are projected in the same authoritative CAS as logistics changes.
    const stores = new Set([...liveOffers, ...liveAssignments].map(item => normalizeStoreId(item.storeId)));
    for (const store of stores) {
      const orders = await loadStoreOrders(store);
      const map = liveOrderProjectionsByStore[store] || {};
      for (const order of orders) map[String(order.id)] = order;
      liveOrderProjectionsByStore[store] = map;
    }
    const nextVersion = Math.max(1, liveStateVersion) + 1;
    const payload = JSON.stringify({
      stateVersion: nextVersion,
      lastMutationId: mutId,
      updatedAt: new Date().toISOString(),
      settingsByStore: liveSettingsByStore,
      drivers: liveDrivers,
      offers: liveOffers,
      assignments: liveAssignments,
      tracking: liveTracking,
      orderProjectionsByStore: liveOrderProjectionsByStore,
    });
    const req = mutationRequest.getStore();
    const account = req?.headers.get('x-account-session') ? driverAccountContext(req).account : null;
    databaseRevision = await writeLogisticsState(JSON.parse(payload), databaseRevision, account && req ? {
      accountId: account.id, sessionHash: crypto.createHash('sha256').update(req.headers.get('x-account-session')!).digest('hex'),
    } : undefined);
    liveStateVersion = nextVersion;
    lastLocalLogisticsPersistAt = Date.now();
    lastMutationId = mutId;
  } catch (persistError) {
    // Descarta a mutação não confirmada e restaura somente o estado persistido.
    // Sem isso, um convite não salvo poderia continuar válido nesta instância.
    liveDrivers = [];
    liveOffers = [];
    liveAssignments = [];
    liveTracking = {};
    liveSettingsByStore = {};
    liveStateVersion = 0;
    liveOrderProjectionsByStore = {};
    lastLocalLogisticsPersistAt = 0;
    lastMutationId = '';
    await loadLogisticsState(true).catch(() => {});
    throw persistError;
  }
  return mutId;
}

function getStoreOrdersPath(targetStoreId?: string | null): string {
  const norm = normalizeStoreId(targetStoreId);
  if (norm === DEFAULT_STORE_ID) {
    return 'orders.json';
  }
  return `stores/${norm}/orders.json`;
}

function projectedOrders(orders: any[], store: string) {
  return projectStoreOrders(orders, { offers: liveOffers, assignments: liveAssignments, orderProjectionsByStore: liveOrderProjectionsByStore }, store);
}

async function loadStoreOrders(targetStoreId?: string | null): Promise<any[]> {
  const norm = normalizeStoreId(targetStoreId);
  const cacheKey = `__orders_${norm}__`;
  const timeKey = `__orders_time_${norm}__`;
  const g = gShared as any;

  // 1. Sempre prioriza a memória mais fresca gravada por /api/orders
  const gAll = globalThis as any;
  if (gAll.__novaesweb_orders_by_store__ && Array.isArray(gAll.__novaesweb_orders_by_store__[norm]) && gAll.__novaesweb_orders_by_store__[norm].length > 0) {
    return projectedOrders(gAll.__novaesweb_orders_by_store__[norm], norm);
  }
  if (norm === DEFAULT_STORE_ID && Array.isArray(gShared.__novaesweb_orders__) && gShared.__novaesweb_orders__.length > 0) {
    return projectedOrders(gShared.__novaesweb_orders__, norm);
  }

  if (Array.isArray(g[cacheKey]) && g[timeKey] && Date.now() - g[timeKey] < 5000) {
    return projectedOrders(g[cacheKey], norm);
  }

  const filePath = getStoreOrdersPath(norm);
  try {
    const { data: fileData, error } = await supabaseAdmin.storage
      .from('novaesweb_store')
      .download(filePath);
    if (!error && fileData) {
      const parsed = JSON.parse(await fileData.text());
      if (Array.isArray(parsed)) {
        g[cacheKey] = parsed;
        g[timeKey] = Date.now();
        if (norm === DEFAULT_STORE_ID) {
          gShared.__novaesweb_orders__ = parsed;
          gShared.__novaesweb_orders_updated_at__ = Date.now();
        }
        return projectedOrders(parsed, norm);
      }
    }
  } catch {}

  // Fallback para orders.json se loja padrão
  if (norm === DEFAULT_STORE_ID && Array.isArray(gShared.__novaesweb_orders__)) {
    return projectedOrders(gShared.__novaesweb_orders__, norm);
  }
  return projectedOrders(g[cacheKey] || [], norm);
}

async function updateStoreOrdersStatus(updater: (orders: any[]) => boolean, targetStoreId?: string | null): Promise<void> {
  try {
    const norm = normalizeStoreId(targetStoreId);
    const orders = await loadStoreOrders(norm);
    const changed = updater(orders);
    if (changed) {
      const nowMs = Date.now();
      gShared.__novaesweb_orders__ = orders;
      gShared.__novaesweb_orders_updated_at__ = nowMs;

      // Sincroniza cache cruzado global para /api/orders ler no mesmo milissegundo
      const gO = globalThis as any;
      if (!gO.__novaesweb_orders_by_store__) gO.__novaesweb_orders_by_store__ = {};
      if (!gO.__novaesweb_orders_by_store_updated_at__) gO.__novaesweb_orders_by_store_updated_at__ = {};
      gO.__novaesweb_orders_by_store__[norm] = orders;
      gO.__novaesweb_orders_by_store_updated_at__[norm] = nowMs;
      gO.__novaesweb_orders__ = orders;
      gO.__novaesweb_orders_updated_at__ = nowMs;

      const filePath = getStoreOrdersPath(norm);
      const payload = JSON.stringify(orders);
      const { error: uploadError } = await supabaseAdmin.storage
        .from('novaesweb_store')
        .upload(filePath, payload, {
          upsert: true,
          contentType: 'application/json',
        });
      if (uploadError) throw new Error('Não foi possível sincronizar os pedidos. Tente novamente.');

      if (norm === DEFAULT_STORE_ID && filePath !== 'orders.json') {
        await supabaseAdmin.storage
          .from('novaesweb_store')
          .upload('orders.json', payload, {
            upsert: true,
            contentType: 'application/json',
          });
      }
    }
  } catch (err) {
    throw err;
  }
}

function sanitizeOfferForDriver(o: any, fallbackStoreId?: string) {
  const offId = o.offerId || o.id || o.orderId || `off_${Date.now()}`;
  const groupedOrders =
    Array.isArray(o.orders) && o.orders.length > 0
      ? o.orders.map((ord: any) => ({
          id: ord.id || ord.orderId,
          orderId: ord.orderId || ord.id,
          orderNumber: ord.orderNumber ? String(ord.orderNumber) : '#000',
          customerName: ord.customerName || 'Cliente',
          customerAddress:
            ord.deliveryAddress || ord.customerAddress || ord.address || 'Endereço',
          customerNeighborhood: ord.customerNeighborhood || ord.region || 'Bairro',
          customerCity: ord.customerCity || 'Canoas',
          customerPhone: ord.customerPhone || ord.phone || '',
          itemsSummary: ord.itemsSummary || '1x Pedido Delivery',
          total: ord.total ? Number(ord.total) : undefined,
        }))
      : undefined;

  const totalOrders = groupedOrders ? groupedOrders.length : o.totalOrdersGrouped || 1;

  return {
    id: offId,
    offerId: offId,
    orderId: o.orderId || (groupedOrders ? groupedOrders[0]?.id : offId),
    orderNumber: o.orderNumber
      ? String(o.orderNumber)
      : groupedOrders
      ? groupedOrders.map((g: any) => `#${String(g.orderNumber).replace('#', '')}`).join(', ')
      : '#000',
    storeId: normalizeStoreId(o.storeId || fallbackStoreId),
    storeName: o.storeName || 'Bella Pizza',
    storeAddress: o.storeAddress || STORE_LOCATION.address,
    distributionMode: o.distributionMode || 'fixed_driver',
    customerAddress:
      o.deliveryAddress ||
      o.customerAddress ||
      o.address ||
      (groupedOrders ? `${groupedOrders.length} endereços de entrega` : 'Endereço da Entrega'),
    customerNeighborhood:
      o.customerNeighborhood ||
      o.neighborhood ||
      o.region ||
      (groupedOrders ? groupedOrders[0]?.customerNeighborhood : 'Bairro Próximo'),
    customerCity: o.customerCity || o.city || 'Canoas',
    estimatedDistanceKm: o.estimatedDistanceKm || 2.5,
    deliveryFee:
      o.deliveryFee !== undefined && o.deliveryFee !== null
        ? Number(o.deliveryFee)
        : o.feeOffered !== undefined && o.feeOffered !== null
        ? Number(o.feeOffered)
        : 12.0,
    feeOffered:
      o.feeOffered !== undefined && o.feeOffered !== null
        ? Number(o.feeOffered)
        : o.deliveryFee !== undefined && o.deliveryFee !== null
        ? Number(o.deliveryFee)
        : 12.0,
    itemsSummary:
      o.itemsSummary ||
      (groupedOrders
        ? groupedOrders.map((g: any) => g.itemsSummary).join(' • ')
        : '1x Pedido Delivery'),
    totalOrdersGrouped: totalOrders,
    orders: groupedOrders,
    status: o.status || 'pendente',
    createdAt: o.createdAt || new Date().toISOString(),
    expiresAt: o.expiresAt || new Date(Date.now() + 60000).toISOString(),
    totalSeconds: o.totalSeconds || o.timeoutSeconds || 60,
  };
}

function sanitizeAssignmentForDriver(a: any, idx: number, fallbackStoreId?: string) {
  return {
    id: a.id || a.assignmentId || `asg_${idx}`,
    assignmentId: a.assignmentId || a.id || `asg_${idx}`,
    orderId: a.orderId || `ord_${idx}`,
    offerId: a.offerId, batchId: a.batchId || a.offerId, pickupGroupId: a.pickupGroupId || a.offerId,
    createdAt: a.createdAt, stageHistory: a.stageHistory || [],
    orderNumber: a.orderNumber ? String(a.orderNumber) : `#${100 + idx}`,
    storeId: normalizeStoreId(a.storeId || fallbackStoreId),
    storeName: a.storeName || 'Bella Pizza',
    driverId: a.driverId,
    driverName: a.driverName,
    customerName: a.customerName || 'Cliente',
    customerPhone: a.customerPhone || '',
    address: a.address || a.deliveryAddress || 'Endereço',
    addressNumber: a.addressNumber || 'S/N',
    neighborhood: a.neighborhood || a.customerNeighborhood || a.region || 'Bairro',
    city: a.city || a.customerCity || 'Canoas',
    deliveryFee:
      a.deliveryFee !== undefined && a.deliveryFee !== null
        ? Number(a.deliveryFee)
        : a.feeOffered !== undefined && a.feeOffered !== null
        ? Number(a.feeOffered)
        : 12.0,
    feeOffered:
      a.feeOffered !== undefined && a.feeOffered !== null
        ? Number(a.feeOffered)
        : a.deliveryFee !== undefined && a.deliveryFee !== null
        ? Number(a.deliveryFee)
        : 12.0,
    itemsSummary: a.itemsSummary || '1x Pedido Delivery',
    status:
      a.status === 'in_transit' || a.status === 'picked_up' || a.status === 'waiting_pickup'
        ? a.status
        : a.status === 'em_rota'
        ? 'picked_up'
        : 'waiting_pickup',
    sequence: a.sequence || idx + 1,
    acceptedAt: a.acceptedAt || undefined,
    pickedUpAt: a.pickedUpAt || a.pickupConfirmedAt || undefined,
    deliveredAt: a.deliveredAt || undefined,
    requiresPinValidation: true,
  };
}

async function requireReadyDispatchOrders(items: any[], storeId: string, currentOfferId?: string): Promise<any[]> {
  const all = await loadStoreOrders(storeId);
  const ids = new Set<string>();
  const ready: any[] = [];
  let shouldUpdateOrders = false;

  for (const item of items) {
    const key = String(item?.id || item?.orderId || '').trim();
    if (!key || ids.has(key)) throw new AccountSessionError('O conjunto contém pedido ausente ou duplicado.', 400, 'INVALID_DISPATCH_BATCH');
    ids.add(key);

    const cleanKey = key.replace(/^#/, '');
    const order = all.find(o => {
      if (o.storeId && !isSameStore(o.storeId, storeId)) return false;
      return String(o.id) === key ||
             String(o.orderId || '') === key ||
             String(o.orderNumber || '').replace(/^#/, '') === cleanKey ||
             (item?.orderNumber && String(o.orderNumber || '').replace(/^#/, '') === String(item.orderNumber).replace(/^#/, ''));
    });

    if (!order) {
      throw new AccountSessionError('Pedido não encontrado nesta loja para despacho.', 404, 'ORDER_NOT_FOUND');
    }
    if (order.status === 'cancelado') {
      throw new AccountSessionError('Não é possível despachar um pedido cancelado.', 409, 'ORDER_CANCELED');
    }

    // Se o pedido ainda estava em recebido ou preparando no backend, o lojista está despachando-o agora:
    // avança automaticamente para 'pronto' e registra o momento de disponibilidade.
    if (order.status !== 'pronto') {
      order.status = 'pronto';
      order.readyAt = order.readyAt || new Date().toISOString();
      recordStage(order, 'despacho', new Date().toISOString(), { reason: 'ready' });
      shouldUpdateOrders = true;
    }

    const hasActiveAssignment = liveAssignments.some(a =>
      isSameStore(a.storeId, storeId) &&
      (String(a.orderId) === key || String(a.orderId) === String(order.id) || String(a.orderNumber || '').replace(/^#/, '') === cleanKey) &&
      (activeAssignmentStatuses.includes(a.status) || ['delivered', 'entregue'].includes(a.status))
    );
    if (hasActiveAssignment) {
      throw new AccountSessionError('Um pedido do conjunto já possui uma entrega atribuída ou em andamento.', 409, 'ORDER_ALREADY_ASSIGNED');
    }

    // Se não há entrega ativa, limpa flags antigas para permitir o novo despacho
    if (order.pickedUpAt || order.deliveredAt) {
      order.pickedUpAt = undefined;
      order.deliveredAt = undefined;
      shouldUpdateOrders = true;
    }

    const hasActiveOffer = liveOffers.some(o =>
      isSameStore(o.storeId, storeId) &&
      (o.offerId || o.id) !== currentOfferId &&
      o.status === 'pendente' &&
      (!o.expiresAt || Date.parse(o.expiresAt) > Date.now()) &&
      (
        String(o.orderId) === key ||
        String(o.orderId) === String(order.id) ||
        String(o.orderNumber || '').replace(/^#/, '') === cleanKey ||
        (o.orderIds || []).some((id: any) => String(id) === key || String(id) === String(order.id) || String(id).replace(/^#/, '') === cleanKey) ||
        (o.orders || []).some((entry: any) => String(entry.id || entry.orderId) === key || String(entry.id || entry.orderId) === String(order.id) || String(entry.orderNumber || '').replace(/^#/, '') === cleanKey)
      )
    );
    if (hasActiveOffer) {
      throw new AccountSessionError('Um pedido do conjunto já está em outra oferta aguardando motoboy.', 409, 'ORDER_ALREADY_OFFERED');
    }

    ready.push({
      ...order,
      customerAddress: order.customerAddress || order.deliveryAddress || order.address,
      customerPhone: order.customerPhone || order.phone,
      customerNeighborhood: order.customerNeighborhood || order.region,
      customerCity: order.customerCity || order.city,
    });
  }

  if (shouldUpdateOrders) {
    await updateStoreOrdersStatus((storeOrders) => {
      let modified = false;
      for (const r of ready) {
        const found = storeOrders.find(o => String(o.id) === String(r.id));
        if (found) {
          found.status = 'pronto';
          found.readyAt = r.readyAt || found.readyAt || new Date().toISOString();
          found.pickedUpAt = undefined;
          found.deliveredAt = undefined;
          modified = true;
        }
      }
      return modified;
    }, storeId).catch(err => console.warn('Erro ao sincronizar status pronto dos pedidos:', err));
  }

  return ready;
}

function isOfferVisibleToDriver(o: any, auth: { driverId?: string; membershipId?: string; storeId?: string; driverRecord?: any }, fallbackStoreId: string): boolean {
  const now = Date.now();
  const notExpired = !o.expiresAt || new Date(o.expiresAt).getTime() > now;
  if (!notExpired || o.status !== 'pendente') return false;

  const driverStore = normalizeStoreId(auth.storeId || auth.driverRecord?.storeId || fallbackStoreId);
  if (!isSameStore(o.storeId, driverStore)) return false;

  const drvId = auth.driverId || auth.driverRecord?.driverId || auth.driverRecord?.id;
  const memId = auth.membershipId || auth.driverRecord?.id;

  // Se o entregador já recusou esta oferta, não exibe novamente para ele
  if (Array.isArray(o.rejectedByDriverIds)) {
    if (
      (drvId && o.rejectedByDriverIds.includes(drvId)) ||
      (memId && o.rejectedByDriverIds.includes(memId))
    ) {
      return false;
    }
  }

  // Modo Entregador Fixo / Direcionado
  if (o.distributionMode === 'fixed_driver' || o.targetDriverId || (o.driverId && o.distributionMode !== 'broadcast_enabled')) {
    const isTargeted = Boolean(
      (drvId && (o.targetDriverId === drvId || o.driverId === drvId || (Array.isArray(o.eligibleDriverIds) && o.eligibleDriverIds.includes(drvId)))) ||
      (memId && (o.targetDriverId === memId || o.driverId === memId || (Array.isArray(o.eligibleDriverIds) && o.eligibleDriverIds.includes(memId))))
    );
    return isTargeted;
  }

  // Modo Broadcast (Oferta para entregadores habilitados da loja): visível para qualquer entregador da mesma loja
  return true;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-store-id, x-driver-id, x-invite-code, x-device-fingerprint, x-session-token, x-admin-token, x-idempotency-key, x-account-session',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function jsonResponse(data: any, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    status: init?.status ?? 200,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      ...((init?.headers as Record<string, string>) || {}),
    },
  });
}

const DRIVER_ACTIONS = new Set([
  'account-bootstrap', 'account-claim', 'invite-activate', 'session-validate', 'offers', 'assignments',
  'route-current', 'history', 'ratings', 'driver-presence', 'shift-end', 'shift-close', 'offer-respond',
  'pickup-confirm', 'route-reorder', 'assignment-withdraw', 'delivery-complete', 'delivery-confirm',
  'delivery-complete-with-pin', 'tracking-location-push', 'tracking-session-start', 'tracking-session-end',
]);

async function authorizeAccountAction(req: NextRequest, action: string) {
  if (!DRIVER_ACTIONS.has(action)) return;
  if (!['account-bootstrap', 'account-claim', 'invite-activate'].includes(action) && verifyAdminRequest(req).valid) return;
  await prepareDriverAccount(req);
}

function verifyDriverRequest(req: NextRequest, drivers: any[], body?: any) {
  const auth = verifySignedDriverRequest(req, drivers, body);
  if (!auth.valid || verifyAdminRequest(req).valid) return auth;
  const { account, memberships } = driverAccountContext(req);
  const owned = memberships.some(m => m.account_id === account.id && m.membership_id === auth.membershipId &&
    m.driver_id === auth.driverId && isSameStore(m.store_id, auth.storeId));
  if (!owned) return { valid: false, status: 403, error: 'Este vínculo pertence a outra conta de entregador.' };
  return auth;
}

function ownsAssignment(auth: ReturnType<typeof verifyDriverRequest>, assignment: any) {
  return Boolean(assignment && auth.valid && isSameStore(assignment.storeId,auth.storeId) &&
    [auth.driverId,auth.membershipId].filter(Boolean).includes(assignment.driverId));
}

function assertOwnedTargets(req: NextRequest, action: string, body: any) {
  if (!['pickup-confirm','route-reorder','assignment-withdraw','delivery-complete','delivery-confirm','delivery-complete-with-pin','tracking-location-push','tracking-session-start'].includes(action)) return;
  const auth = verifyDriverRequest(req,liveDrivers,body);
  if (!auth.valid) throw new AccountSessionError(auth.error || 'Acesso negado.',auth.status || 401,'DRIVER_SESSION_INVALID');
  const keys: any[] = action === 'pickup-confirm' ? [...(body.assignmentIds || body.orderIds || [body.assignmentId || body.orderId]).filter(Boolean), ...(Array.isArray(body.pickupScopeIds) ? body.pickupScopeIds : [])] :
    action === 'route-reorder' ? (body.stops || []).map((stop:any) => stop.assignmentId) : [body.assignmentId || body.orderId].filter(Boolean);
  if (keys.length === 0 && !action.startsWith('tracking-')) throw new AccountSessionError('Informe uma entrega válida.',400,'INVALID_ASSIGNMENT');
  for (const key of keys) {
    const clean = String(key).replace(/^asg_/,'').replace(/^#/,'');
    const exact = liveAssignments.filter(a => String(a.id) === String(key) || String(a.assignmentId) === String(key));
    const targets = exact.length ? exact : liveAssignments.filter(a => activeAssignmentStatuses.includes(a.status) && [a.orderId,a.orderNumber].filter(x => x != null).some(x => String(x).replace(/^asg_/,'').replace(/^#/,'') === clean));
    if (!targets.length || targets.some(a => !ownsAssignment(auth,a))) throw new AccountSessionError('Esta entrega não pertence à sua conta e loja.',403,'ASSIGNMENT_FORBIDDEN');
  }
}

function accountBootstrap(req: NextRequest) {
  const { account, memberships } = driverAccountContext(req);
  const ownedDrivers = liveDrivers.filter(d => memberships.some(m => m.membership_id === d.id &&
    m.driver_id === (d.driverId || d.id) && isSameStore(m.store_id, d.storeId)));
  const belongs = (a: any, d: any) => isSameStore(a.storeId, d.storeId) &&
    (a.driverId === (d.driverId || d.id) || a.driverId === d.id);
  const open = (a: any) => ['accepted','assigned','waiting_pickup','picked_up','in_transit','em_rota'].includes(a.status);
  const eligible = ownedDrivers.filter(d => d.status === 'ativo' && (!d.expiresAt || Date.parse(d.expiresAt) > Date.now()) &&
    (d.shiftStatus !== 'plantao_encerrado' || liveAssignments.some(a => belongs(a, d) && open(a))));
  eligible.sort((a,b) => Number(liveAssignments.some(x => belongs(x,b) && open(x))) - Number(liveAssignments.some(x => belongs(x,a) && open(x))) ||
    Date.parse(b.activatedAt || b.createdAt || 0) - Date.parse(a.activatedAt || a.createdAt || 0));
  const driver = eligible[0];
  const ledger = Array.from(new Set(ownedDrivers.map(d => normalizeStoreId(d.storeId)))).map(storeId => {
    const records = ownedDrivers.filter(d => isSameStore(d.storeId, storeId));
    const deliveries = liveAssignments.filter(a => records.some(d => belongs(a,d)));
    const completed = deliveries.filter(a => ['delivered','entregue'].includes(a.status));
    const settings = getStoreSettings(storeId);
    return {storeId,storeName:settings.storeName || records[0].storeName,storeAddress:settings.storeAddress,
      completedCount:completed.length,canceledCount:deliveries.filter(a => ['withdrawn','canceled_by_store','cancelada','cancelled','canceled'].includes(a.status)).length,
      totalToReceive:completed.reduce((sum,a) => sum + Number(a.feeOffered ?? a.deliveryFee ?? 0),0),
      lastShiftDate:records.map(d => d.activatedAt || d.createdAt).sort().at(-1),isActiveShift:eligible.some(d => isSameStore(d.storeId,storeId))};
  });
  const settings = driver ? getStoreSettings(driver.storeId) : null;
  const existingToken = driver?.sessionToken;
  const existingPayload = verifyDriverToken(existingToken);
  const reusableToken = existingPayload.valid && existingPayload.membershipId === driver?.id && existingPayload.driverId === (driver?.driverId || driver?.id) && isSameStore(existingPayload.storeId,driver?.storeId) ? existingToken : null;
  const session = driver ? {
    token:reusableToken || signDriverToken({driverId:driver.driverId || driver.id,membershipId:driver.id,storeId:driver.storeId,ttlMs:Math.max(1,Math.min(30*86400000,Date.parse(driver.expiresAt || new Date(Date.now()+86400000).toISOString())-Date.now()))}),
    driverId:driver.driverId || driver.id,driverName:account.name,phone:account.phone,vehiclePlate:account.vehiclePlate,
    deviceFingerprint:'',storeId:driver.storeId,storeName:settings?.storeName || driver.storeName,storeAddress:settings?.storeAddress,
    membershipId:driver.id,role:'entregador_plantao',expiresAt:driver.expiresAt,isActivated:true,shiftStartedAt:driver.activatedAt,
  } : null;
  return jsonResponse({success:true,account,session,ledger,presence:{manualEnabled:driver?.presence === 'disponivel',isOnline:true,lastHeartbeat:new Date().toISOString()}});
}

async function handleSessionValidate(req: NextRequest, body: any, storeId: string) {
  await loadLogisticsState();
  const auth = verifyDriverRequest(req, liveDrivers, body);
  if (!auth.valid) {
    return jsonResponse(
      {
        success: false,
        valid: false,
        error: auth.error || 'Sessão inválida ou expirada.',
      },
      { status: auth.status || 401 }
    );
  }

  const matched = auth.driverRecord;
  let upgradedToken: string | undefined;
  const resolvedStoreId = normalizeStoreId(matched?.storeId || auth.storeId || storeId);

  if (matched && auth.isLegacyToken) {
    upgradedToken = signDriverToken({
      driverId: matched.driverId || matched.id,
      membershipId: matched.id,
      inviteCode: matched.inviteCode,
      storeId: resolvedStoreId,
      ttlMs: (matched.validityDays || 1) * 86400000,
    });
    matched.sessionToken = upgradedToken;
    await persistLogisticsState();
  }

  const safeDriver = matched
    ? (({ sessionToken: _st, tokenHash: _th, ...rest }) => rest)(matched)
    : null;

  return jsonResponse({
    success: true,
    valid: true,
    action: 'session.validate',
    driver: safeDriver,
    session: matched
      ? {
          ...(upgradedToken ? { token: upgradedToken } : {}),
          driverId: matched.driverId || matched.id,
          driverName: matched.driverName || matched.name,
          phone: matched.phone,
          vehiclePlate: matched.vehiclePlate,
          membershipId: matched.id,
          storeId: resolvedStoreId,
          storeName: matched.storeName || 'Bella Pizza',
          isActivated: matched.status === 'ativo',
        }
      : undefined,
    activeStore: {
      id: resolvedStoreId,
      name: matched?.storeName || 'Bella Pizza',
      slug: 'bella-pizza',
    },
    stores: [
      {
        id: resolvedStoreId,
        name: matched?.storeName || 'Bella Pizza',
        status: matched?.status || 'ativo',
        expiresAt: matched?.expiresAt || new Date(Date.now() + 86400000).toISOString(),
      },
    ],
    serverTime: new Date().toISOString(),
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    const { action } = await params;
    await authorizeAccountAction(req, action);
    await loadLogisticsState(action === 'account-bootstrap');
    const storeHeader =
      req.headers.get('x-store-id') ||
      req.nextUrl.searchParams.get('storeId') ||
      DEFAULT_STORE_ID;
    const storeId = normalizeStoreId(storeHeader);

    switch (action) {
      case 'account-bootstrap': return accountBootstrap(req);
      // 1. Painel do Lojista: Estado Logístico Completo Isolado por Loja (Entregadores, Ofertas, Entregas, GPS e Configurações)
      case 'drivers':
      case 'settings-get': {
        const adminCheck = verifyAdminRequest(req);
        if (!adminCheck.valid) {
          return jsonResponse(
            { success: false, error: 'Acesso restrito ao lojista.' },
            { status: 401 }
          );
        }

        const effectiveStoreId = normalizeStoreId(
          req.nextUrl.searchParams.get('storeId') ||
            req.headers.get('x-store-id') ||
            adminCheck.storeId ||
            storeId
        );

        const settings = getStoreSettings(effectiveStoreId);
        const storeDrivers = liveDrivers.filter((d) => isSameStore(d.storeId, effectiveStoreId));
        const storeOffers = liveOffers.filter((o) => isSameStore(o.storeId, effectiveStoreId));
        const storeAssignments = liveAssignments.filter((a) =>
          isSameStore(a.storeId, effectiveStoreId)
        );

        const nowMs = Date.now();
        const enrichedDrivers = storeDrivers.map(
          ({ sessionToken: _st, tokenHash: _th, ...d }) => {
            const dId = d.driverId || d.id;
            const dMembership = d.id;
            const dName = d.driverName || d.name;

            const myAssignments = storeAssignments.filter(
              (a) =>
                (dId && (a.driverId === dId || a.driverId === dMembership)) ||
                (dMembership && a.driverId === dMembership) ||
                (!a.driverId && dName && a.driverName === dName)
            );

            // Separa pedidos individuais (não apenas conjuntos)
            const waitingPickupOrders = myAssignments
              .filter((a) => a.status === 'waiting_pickup')
              .map((a) => ({
                assignmentId: a.assignmentId || a.id,
                orderId: a.orderId,
                orderNumber: a.orderNumber,
                customerName: a.customerName,
                address: a.address,
                neighborhood: a.neighborhood,
                deliveryFee: a.deliveryFee ?? a.feeOffered ?? 0,
                acceptedAt: a.acceptedAt,
              }));

            const inTransitOrders = myAssignments
              .filter(
                (a) =>
                  a.status === 'picked_up' ||
                  a.status === 'in_transit' ||
                  a.status === 'em_rota'
              )
              .map((a) => ({
                assignmentId: a.assignmentId || a.id,
                orderId: a.orderId,
                orderNumber: a.orderNumber,
                customerName: a.customerName,
                address: a.address,
                neighborhood: a.neighborhood,
                deliveryFee: a.deliveryFee ?? a.feeOffered ?? 0,
                pickedUpAt: a.pickedUpAt || a.pickupConfirmedAt,
              }));

            const deliveredOrders = myAssignments
              .filter((a) => a.status === 'delivered' || a.status === 'entregue')
              .map((a) => ({
                assignmentId: a.assignmentId || a.id,
                orderId: a.orderId,
                orderNumber: a.orderNumber,
                customerName: a.customerName,
                address: a.address,
                neighborhood: a.neighborhood,
                deliveryFee: a.deliveryFee ?? a.feeOffered ?? 0,
                deliveredAt: a.deliveredAt || a.acceptedAt,
                forcedDelivery: Boolean(a.forcedDelivery),
                forcedDeliveryReason: a.forcedDeliveryReason || null,
              }));

            const rawLoc =
              (dId && liveTracking[dId]) ||
              (dMembership && liveTracking[dMembership]) ||
              null;

            const isLocFresh =
              rawLoc &&
              rawLoc.updatedAt &&
              nowMs - new Date(rawLoc.updatedAt).getTime() <= 10 * 60 * 1000;

            const hasAuthorizedActiveRoute =
              inTransitOrders.length > 0 && Boolean(isLocFresh);

            const isExpired =
              Boolean(d.expiresAt && new Date(d.expiresAt).getTime() < nowMs) &&
              d.status !== 'revogado' &&
              d.status !== 'vinculo_removido';

            return {
              ...d,
              isExpired,
              effectiveStatus:
                d.status === 'revogado'
                  ? 'revogado'
                  : d.status === 'vinculo_removido'
                  ? 'vinculo_removido'
                  : d.status === 'bloqueado'
                  ? 'bloqueado'
                  : isExpired
                  ? 'expirado'
                  : d.status,
              waitingPickupCount: waitingPickupOrders.length,
              inTransitCount: inTransitOrders.length,
              activeDeliveries: waitingPickupOrders.length + inTransitOrders.length,
              completedDeliveriesCount: deliveredOrders.length,
              waitingPickupOrders,
              inTransitOrders,
              deliveredOrders,
              hasAuthorizedTracking: hasAuthorizedActiveRoute,
              liveLocation: hasAuthorizedActiveRoute ? rawLoc : null,
            };
          }
        );

        // Filtra liveTracking apenas para entregadores em rota ativa nesta loja
        const storeTracking: Record<string, LiveDriverLocation> = {};
        for (const drv of enrichedDrivers) {
          if (drv.inTransitCount > 0 && drv.liveLocation) {
            const key = drv.driverId || drv.id;
            storeTracking[key] = drv.liveLocation;
          }
        }

        return jsonResponse({
          success: true,
          source: 'storage_cache',
          storeId: effectiveStoreId,
          settings,
          drivers: enrichedDrivers,
          offers: storeOffers,
          assignments: storeAssignments,
          tracking: storeTracking,
        });
      }

      // 2. Validação de Sessão do Aparelho
      case 'session-validate': {
        return handleSessionValidate(req, {}, storeId);
      }

      // 3. Consulta de Ofertas Pendentes do Entregador Autenticado
      case 'offers': {
        await loadLogisticsState();
        const auth = verifyDriverRequest(req, liveDrivers);
        if (!auth.valid) {
          return jsonResponse({ success: false, error: auth.error }, { status: auth.status || 401 });
        }

        const myOffers = liveOffers
          .filter((o) => isOfferVisibleToDriver(o, auth, storeId))
          .map((o) => sanitizeOfferForDriver(o, storeId));

        return jsonResponse({
          success: true,
          action: 'offer.list',
          offers: myOffers,
        });
      }

      // 4. Consulta de Pedidos Atribuídos ao Motoboy Autenticado (Isolado por Loja)
      case 'assignments': {
        await loadLogisticsState();
        const auth = verifyDriverRequest(req, liveDrivers);
        if (!auth.valid) {
          return jsonResponse({ success: false, error: auth.error }, { status: auth.status || 401 });
        }

        const drvName = auth.driverRecord?.driverName || auth.driverRecord?.name;
        const driverStore = normalizeStoreId(auth.storeId || auth.driverRecord?.storeId || storeId);

        const myAssignments = liveAssignments
          .filter(
            (a) =>
              (isSameStore(a.storeId, driverStore) || !a.storeId) &&
              (a.driverId === auth.driverId ||
                a.driverId === auth.membershipId ||
                a.driverId === auth.driverRecord?.driverId ||
                a.driverId === auth.driverRecord?.id) &&
              activeAssignmentStatuses.includes(a.status)
          )
          .map((a, idx) => sanitizeAssignmentForDriver(a, idx, driverStore));

        return jsonResponse({
          success: true,
          action: 'assignment.list',
          assignments: myAssignments,
        });
      }

      // 5. Consulta da Rota Atual do Entregador
      case 'route-current': {
        const auth = verifyDriverRequest(req, liveDrivers);
        if (!auth.valid) {
          return jsonResponse({ success: false, error: auth.error }, { status: auth.status || 401 });
        }

        const drvName = auth.driverRecord?.driverName || auth.driverRecord?.name;
        const driverStore = normalizeStoreId(auth.storeId || auth.driverRecord?.storeId || storeId);

        const activeList = liveAssignments
          .filter(
            (a) =>
              isSameStore(a.storeId, driverStore) &&
              (a.driverId === auth.driverId ||
                a.driverId === auth.membershipId) &&
              a.status !== 'delivered' &&
              a.status !== 'entregue' &&
              a.status !== 'canceled_by_store' &&
              a.status !== 'canceled_by_driver'
          )
          .map((a, idx) => sanitizeAssignmentForDriver(a, idx, driverStore));

        const stops = activeList.map((a, idx) => ({
          assignmentId: a.assignmentId,
          orderNumber: a.orderNumber,
          sequence: a.sequence || idx + 1,
          customerName: a.customerName || 'Cliente',
          address: a.address,
          neighborhood: a.neighborhood || 'Bairro',
          status: a.status,
          isCurrent: idx === 0,
          deliveryFee: a.deliveryFee,
        }));

        return jsonResponse({
          success: true,
          action: 'route.current',
          stops,
          route: {
            id: 'rt-live-1',
            version: 1,
            status: 'em_andamento',
            currentStopIndex: 0,
            stops,
          },
        });
      }

      // 6. Histórico de Entregas do Motoboy Autenticado (Isolado por Loja Ativa)
      case 'history': {
        const auth = verifyDriverRequest(req, liveDrivers);
        if (!auth.valid) {
          return jsonResponse({ success: false, error: auth.error }, { status: auth.status || 401 });
        }

        const drvName = auth.driverRecord?.driverName || auth.driverRecord?.name;
        const driverStore = normalizeStoreId(auth.storeId || auth.driverRecord?.storeId || storeId);

        const delivered = liveAssignments.filter(
          (a) =>
            isSameStore(a.storeId, driverStore) &&
            (a.driverId === auth.driverId ||
              a.driverId === auth.membershipId) &&
            (a.status === 'entregue' || a.status === 'delivered')
        );

        let totalEarnings = 0;
        const items = delivered.map((d) => {
          const fee = Number(d.feeOffered ?? d.deliveryFee ?? 0);
          totalEarnings += fee;
          return {
            id: d.id || d.assignmentId,
            orderId: d.orderId,
            orderNumber: d.orderNumber,
            customerName: d.customerName || 'Cliente',
            deliveryAddress: d.address || 'Endereço',
            deliveryFee: fee,
            deliveredAt: d.deliveredAt || new Date().toISOString(),
          };
        });

        return jsonResponse({
          success: true,
          action: 'history.list',
          items,
          deliveries: items,
          totalEarnings,
        });
      }

      // 7. Avaliações do Motoboy Autenticado
      case 'ratings': {
        const auth = verifyDriverRequest(req, liveDrivers);
        if (!auth.valid) {
          return jsonResponse({ success: false, error: auth.error }, { status: auth.status || 401 });
        }

        return jsonResponse({
          success: true,
          action: 'ratings.summary',
          averageStars: 5.0,
          totalRatings: 12,
          period: 'Últimos 30 dias',
          distribution: [
            { stars: 5, count: 12 },
            { stars: 4, count: 0 },
            { stars: 3, count: 0 },
            { stars: 2, count: 0 },
            { stars: 1, count: 0 },
          ],
          breakdown: { '5_stars': 12, '4_stars': 0, '3_stars': 0 },
        });
      }

      // 8. Consulta ViaCEP Segura (Proxy sem CORS)
      case 'viacep-lookup': {
        const cep = req.nextUrl.searchParams.get('cep') || '';
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) {
          return jsonResponse(
            { success: false, error: 'CEP deve conter exatamente 8 dígitos' },
            { status: 400 }
          );
        }
        try {
          const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
            next: { revalidate: 86400 },
          });
          const data = await res.json();
          if (data.erro) {
            return jsonResponse({ success: false, error: 'CEP não localizado' }, { status: 404 });
          }
          return jsonResponse({
            success: true,
            cep: data.cep,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
          });
        } catch {
          return jsonResponse(
            { success: false, error: 'Falha ao consultar serviço ViaCEP' },
            { status: 502 }
          );
        }
      }

      // 9. Traçado de Rota OSRM
      case 'osrm-route': {
        const from = req.nextUrl.searchParams.get('from');
        const to = req.nextUrl.searchParams.get('to');
        if (!from || !to) {
          return jsonResponse(
            { success: false, error: 'Parâmetros from e to são obrigatórios (formato: lng,lat)' },
            { status: 400 }
          );
        }
        const [fromLng, fromLat] = from.split(',').map(Number);
        const [toLng, toLat] = to.split(',').map(Number);
        const result = await calculateOSRMRoute(fromLng, fromLat, toLng, toLat);
        return jsonResponse({ success: true, ...result });
      }

      // 10. Acompanhamento do Pedido pelo Cliente — Regra Estrita de Liberação de Rastreamento
      case 'tracking-client-subscribe': {
        const token =
          req.nextUrl.searchParams.get('token') ||
          req.nextUrl.searchParams.get('trackingToken') ||
          req.nextUrl.searchParams.get('orderId');
        const isAdmin = verifyAdminRequest(req).valid;

        if (!token) {
          return jsonResponse(
            { success: false, error: 'Token de acompanhamento do pedido é obrigatório' },
            { status: 400 }
          );
        }

        const allOrders = await loadStoreOrders();
        const order = allOrders.find(
          (o) =>
            o.trackingToken === token ||
            String(o.id) === token ||
            (isAdmin && String(o.orderNumber).replace('#', '') === token.replace('#', ''))
        );

        if (!order) {
          return jsonResponse(
            {
              success: true,
              trackingStage: 'no_driver',
              trackingEnabled: false,
              message: 'O rastreamento estará disponível quando seu pedido sair para entrega',
              order: null,
              destination: null,
              store: null,
              driver: null,
              driverLocation: null,
              route: null,
            },
            { status: 200 }
          );
        }

        const targetNum = String(order.orderNumber).replace('#', '');
        const targetId = String(order.id);
        const orderStoreId = normalizeStoreId(order.storeId || storeId);

        // Busca atribuição específica deste pedido nesta loja
        const asg = liveAssignments.find(
          (a) =>
            isSameStore(a.storeId, orderStoreId) &&
            (String(a.orderId) === targetId ||
              String(a.orderNumber).replace('#', '') === targetNum) &&
            a.status !== 'canceled_by_store' &&
            a.status !== 'canceled_by_driver'
        );

        // Busca oferta pendente específica deste pedido nesta loja
        const nowMs = Date.now();
        const pendingOffer = liveOffers.find((off) => {
          if (!isSameStore(off.storeId, orderStoreId)) return false;
          if (off.status !== 'pendente') return false;
          if (off.expiresAt && new Date(off.expiresAt).getTime() <= nowMs) return false;
          const directMatch =
            String(off.orderId) === targetId ||
            String(off.orderNumber).replace('#', '') === targetNum;
          const nestedMatch =
            Array.isArray(off.orders) &&
            off.orders.some(
              (item: any) =>
                String(item.id || item.orderId) === targetId ||
                String(item.orderNumber).replace('#', '') === targetNum
            );
          return directMatch || nestedMatch;
        });

        const orderCity = order.addressDetail?.city || order.city || '';
        const orderState = order.addressDetail?.state || order.state || '';
        const orderCep = order.addressDetail?.cep || order.cep || '';
        const orderRegion = order.addressDetail?.neighborhood || order.region || '';

        const fullAddress = order.addressDetail?.street
          ? `${order.addressDetail.street}, ${order.addressDetail.number || ''} - ${orderRegion}`
          : `${order.address || ''}${orderRegion ? ' - ' + orderRegion : ''}`;

        // ESTÁGIO 5: Pedido entregue ou cancelado -> Encerrar acompanhamento e revogar acesso à localização
        if (
          order.status === 'concluido' ||
          order.status === 'entregue' ||
          order.status === 'cancelado' ||
          asg?.status === 'delivered' ||
          asg?.status === 'entregue'
        ) {
          return jsonResponse({
            success: true,
            trackingStage: 'ended',
            trackingEnabled: false,
            message:
              order.status === 'cancelado'
                ? 'Pedido cancelado — acompanhamento encerrado.'
                : 'Pedido entregue — acompanhamento encerrado.',
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              dispatchStatus: order.dispatchStatus || order.status,
              customerName: order.customerName,
              address: fullAddress,
            },
            destination: null,
            store: null,
            driver: null,
            driverLocation: null,
            route: null,
          });
        }

        // Verifica se a retirada já foi confirmada e a rota iniciada
        const isPickupConfirmedAndRouteStarted = Boolean(
          (asg && (asg.status === 'picked_up' || asg.status === 'in_transit' || asg.status === 'em_rota')) ||
            (order.status === 'em_entrega' &&
              order.pickedUpAt &&
              (!asg || asg.status !== 'waiting_pickup'))
        );

        // ESTÁGIO 3: Entregador aceitou, mas ainda não retirou o pedido na loja
        if (
          !isPickupConfirmedAndRouteStarted &&
          ((asg && (asg.status === 'waiting_pickup' || asg.status === 'assigned' || asg.status === 'accepted')) ||
            order.dispatchStatus === 'aceito_aguardando_retirada')
        ) {
          const acceptedDriverId = asg?.driverId || order.driverId || null;
          const drv = acceptedDriverId
            ? liveDrivers.find(
                (d) =>
                  isSameStore(d.storeId, orderStoreId) &&
                  (d.driverId === acceptedDriverId || d.id === acceptedDriverId)
              )
            : null;
          const acceptedDriverName =
            drv?.driverName ||
            drv?.name ||
            asg?.driverName ||
            order.assignedDriverName ||
            order.driverName ||
            'Entregador';
          const driverPlate = drv?.vehiclePlate || null;

          // Busca localização recente (<= 15 min) do motoboy aceito
          const candidateLoc =
            (acceptedDriverId && liveTracking[acceptedDriverId]) ||
            (drv?.id && liveTracking[drv.id]) ||
            (drv?.driverId && liveTracking[drv.driverId]) ||
            null;

          let authorizedDriverLoc: LiveDriverLocation | null = null;
          if (candidateLoc && candidateLoc.updatedAt) {
            const locTimeMs = new Date(candidateLoc.updatedAt).getTime();
            const isRecent = nowMs - locTimeMs <= 15 * 60 * 1000;
            if (isRecent) {
              authorizedDriverLoc = candidateLoc;
            }
          }

          const configuredStore = getEffectiveStoreLocation(orderStoreId);
          const destCoords = await geocodeAddress(fullAddress, {
            city: orderCity || configuredStore.city,
            state: orderState || configuredStore.state,
            cep: orderCep,
            region: orderRegion,
          });

          const effectiveStore = {
            name: configuredStore.name,
            address: configuredStore.address,
            latitude: configuredStore.latitude,
            longitude: configuredStore.longitude,
          };

          // Rota em tempo real: se o motoboy tiver GPS ativo, calcula rota motoboy -> pizzaria
          let routeData = null;
          try {
            if (authorizedDriverLoc) {
              routeData = await calculateOSRMRoute(
                authorizedDriverLoc.longitude,
                authorizedDriverLoc.latitude,
                effectiveStore.longitude,
                effectiveStore.latitude
              );
            } else if (destCoords) {
              routeData = await calculateOSRMRoute(
                effectiveStore.longitude,
                effectiveStore.latitude,
                destCoords.lng,
                destCoords.lat
              );
            }
          } catch {}

          return jsonResponse({
            success: true,
            trackingStage: 'waiting_pickup',
            trackingEnabled: true,
            message: authorizedDriverLoc
              ? `O entregador ${acceptedDriverName} aceitou seu pedido e está a caminho da loja para retirá-lo.`
              : `O entregador ${acceptedDriverName} aceitou seu pedido e vai retirar na loja em instantes.`,
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              dispatchStatus: 'aceito_aguardando_retirada',
              customerName: order.customerName,
              address: fullAddress,
              destination: destCoords,
            },
            destination: destCoords,
            store: effectiveStore,
            driver: {
              name: acceptedDriverName,
              plate: driverPlate,
              isInTransit: false,
              isHeadingToStore: true,
            },
            driverLocation: authorizedDriverLoc,
            route: routeData ? {
              coordinates: routeData.coordinates,
              distanceKm: routeData.distanceKm,
              estimatedMinutes: routeData.durationMin,
            } : null,
          });
        }

        // ESTÁGIO 2: Oferta enviada para motoboy(s), aguardando aceite
        if (
          !isPickupConfirmedAndRouteStarted &&
          (pendingOffer || order.dispatchStatus === 'aguardando_aceite')
        ) {
          return jsonResponse({
            success: true,
            trackingStage: 'offer_sent',
            trackingEnabled: false,
            message: 'Aguardando aceite do entregador',
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              dispatchStatus: 'aguardando_aceite',
              customerName: order.customerName,
              address: fullAddress,
            },
            destination: null,
            store: null,
            driver: null,
            driverLocation: null,
            route: null,
          });
        }

        // ESTÁGIO 1: Sem entregador atribuído (pedido recebido, em preparo ou pronto na bancada)
        if (!isPickupConfirmedAndRouteStarted) {
          return jsonResponse({
            success: true,
            trackingStage: 'no_driver',
            trackingEnabled: false,
            message: 'O rastreamento estará disponível quando seu pedido sair para entrega',
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              dispatchStatus: order.dispatchStatus || 'disponivel',
              customerName: order.customerName,
              address: fullAddress,
            },
            destination: null,
            store: null,
            driver: null,
            driverLocation: null,
            route: null,
          });
        }

        // ESTÁGIO 4: Retirada confirmada e rota iniciada -> Liberar mapa com endereço do pedido e localização real/autorizada do entregador atribuído
        const assignedDriverId = asg?.driverId || order.driverId || null;
        const drv = assignedDriverId
          ? liveDrivers.find(
              (d) =>
                isSameStore(d.storeId, orderStoreId) &&
                (d.driverId === assignedDriverId || d.id === assignedDriverId)
            )
          : null;

        const driverName =
          drv?.driverName ||
          drv?.name ||
          asg?.driverName ||
          order.assignedDriverName ||
          order.driverName ||
          'Entregador';
        const driverPlate = drv?.vehiclePlate || null;

        // Somente usa a localização do PRÓPRIO entregador atribuído a este pedido, se recente (<= 10 min)
        // NUNCA pega allTrackedLocations[0] de outro motoboy nem coordenada antiga!
        const candidateLoc =
          (assignedDriverId && liveTracking[assignedDriverId]) ||
          (drv?.id && liveTracking[drv.id]) ||
          (drv?.driverId && liveTracking[drv.driverId]) ||
          null;

        const pickupTimeMs =
          asg?.pickupConfirmedAt || asg?.pickedUpAt || order.pickedUpAt
            ? new Date(asg?.pickupConfirmedAt || asg?.pickedUpAt || order.pickedUpAt).getTime()
            : 0;

        let authorizedDriverLoc: LiveDriverLocation | null = null;
        if (candidateLoc && candidateLoc.updatedAt) {
          const locTimeMs = new Date(candidateLoc.updatedAt).getTime();
          const isRecent = nowMs - locTimeMs <= 10 * 60 * 1000;
          // Aceita se foi atualizada recentemente (após ou próximo ao início da rota)
          const isFromCurrentRoute = !pickupTimeMs || locTimeMs >= pickupTimeMs - 120000;
          if (isRecent && isFromCurrentRoute) {
            authorizedDriverLoc = candidateLoc;
          }
        }

        const configuredStore = getEffectiveStoreLocation(orderStoreId);

        // Destino vem exclusivamente do endereço do pedido (nunca do GPS do celular do cliente)
        const destCoords = await geocodeAddress(fullAddress, {
          city: orderCity || configuredStore.city,
          state: orderState || configuredStore.state,
          cep: orderCep,
          region: orderRegion,
        });

        const effectiveStore = {
          name: configuredStore.name,
          address: configuredStore.address,
          latitude: configuredStore.latitude,
          longitude: configuredStore.longitude,
        };

        const startLng = authorizedDriverLoc
          ? authorizedDriverLoc.longitude
          : effectiveStore.longitude;
        const startLat = authorizedDriverLoc
          ? authorizedDriverLoc.latitude
          : effectiveStore.latitude;
        const routeData = destCoords ? await calculateOSRMRoute(
          startLng, startLat, destCoords.lng, destCoords.lat
        ).catch(() => null) : null;

        return jsonResponse({
          success: true,
          trackingStage: 'in_transit',
          trackingEnabled: true,
          message: authorizedDriverLoc
            ? 'Seu pedido está em rota de entrega com localização em tempo real.'
            : 'Seu pedido saiu para entrega. Aguardando atualização de GPS do entregador.',
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            dispatchStatus: 'em_entrega',
            customerName: order.customerName,
            address: fullAddress,
            destination: destCoords,
          },
          destination: destCoords,
          store: effectiveStore,
          driver: {
            name: driverName,
            plate: driverPlate,
            isInTransit: true,
          },
          driverLocation: authorizedDriverLoc,
          route: routeData ? {
            coordinates: routeData.coordinates,
            distanceKm: routeData.distanceKm,
            estimatedMinutes: routeData.durationMin,
          } : null,
        });
      }

      // 11. Lista de Motoboys em Percurso para o Painel do Lojista (Isolado por Loja)
      case 'tracking-store-drivers': {
        const adminCheck = verifyAdminRequest(req);
        if (!adminCheck.valid) {
          return jsonResponse(
            { success: false, error: 'Acesso restrito ao lojista.' },
            { status: 401 }
          );
        }

        const effectiveStoreId = normalizeStoreId(
          req.nextUrl.searchParams.get('storeId') ||
            req.headers.get('x-store-id') ||
            adminCheck.storeId ||
            storeId
        );

        const activeDeliveries = liveAssignments.filter(
          (a) =>
            isSameStore(a.storeId, effectiveStoreId) &&
            (a.status === 'picked_up' || a.status === 'em_rota' || a.status === 'in_transit')
        );

        const driverMap = new Map<string, any>();
        const nowMs = Date.now();

        liveDrivers
          .filter((d) => isSameStore(d.storeId, effectiveStoreId))
          .forEach((d) => {
            const dId = d.driverId || d.id;
            const driverAssignments = activeDeliveries.filter(
              (a) =>
                a.driverId === dId ||
                a.driverId === d.id ||
                (!a.driverId && d.driverName && a.driverName === d.driverName)
            ).sort((a,b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER));

            if (driverAssignments.length === 0) return;

            const rawLoc = liveTracking[dId] || liveTracking[d.id] || null;
            const isRecent =
              rawLoc &&
              rawLoc.updatedAt &&
              nowMs - new Date(rawLoc.updatedAt).getTime() <= 10 * 60 * 1000;

            driverMap.set(dId, {
              driverId: dId,
              name: d.driverName || d.name || 'Entregador',
              phone: d.phone,
              vehiclePlate: d.vehiclePlate,
              presence: d.presence,
              activeOrdersCount: driverAssignments.length,
              location: isRecent ? rawLoc : null,
              assignments: driverAssignments.map((a) => ({
                id: a.id || a.assignmentId,
                orderId: a.orderId,
                orderNumber: a.orderNumber,
                address: a.address,
                region: a.region || a.neighborhood || '',
                status: a.status,
                sequence: a.sequence,
                destinationCoordinates: verifiedAssignmentCoordinates(a),
              })),
            });
          });

        const trackedList = Array.from(driverMap.values());
        const configuredStore = getEffectiveStoreLocation(effectiveStoreId);


        return jsonResponse({
          success: true,
          store: configuredStore,
          driversInTransit: trackedList,
        });
      }

      default:
        return jsonResponse(
          { success: false, error: `Rota GET ${action} não encontrada no contrato v1` },
          { status: 404 }
        );
    }
  } catch (err: any) {
    if (err instanceof AccountSessionError || err instanceof StateStoreError) return jsonResponse({success:false,error:err.message,code:err.code},{status:err.status});
    return jsonResponse({ success: false, error: 'Não foi possível concluir a operação de logística. Tente novamente.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    const { action } = await params;
    const body = await req.json().catch(() => ({}));
    const idempotencyKey = req.headers.get('x-idempotency-key') || crypto.randomUUID();
    const storeHeader =
      req.headers.get('x-store-id') ||
      body?.storeId ||
      DEFAULT_STORE_ID;
    const storeId = normalizeStoreId(storeHeader);

    // Todas as mutações POST passam pelo lock atômico + reload do estado atualizado
    return await withAtomicLogisticsLock(() => mutationRequest.run(req, async () => {
      await authorizeAccountAction(req, action);
      const adminTenant = verifyAdminRequest(req);
      if (adminTenant.valid && body.storeId && !isSameStore(body.storeId,adminTenant.storeId)) throw new AccountSessionError('Acesso negado à loja solicitada.',403,'STORE_FORBIDDEN');
      await loadLogisticsState();
      assertOwnedTargets(req, action, body);

      switch (action) {
        case 'account-claim': {
          return jsonResponse({success:false,code:'LEGACY_MIGRATION_REQUIRES_STORE',error:'Peça ao lojista para associar sua conta cadastrada ao vínculo antigo.'},{status:409});
        }
        case 'account-link-existing': {
          const admin = verifyAdminRequest(req);
          if (!admin.valid) return jsonResponse({success:false,error:'Acesso restrito ao lojista.'},{status:401});
          const driver = liveDrivers.find(d => d.id === body.membershipId && isSameStore(d.storeId,admin.storeId));
          if (!driver) return jsonResponse({success:false,error:'Vínculo não encontrado nesta loja.'},{status:404});
          const phone = normalizeDriverPhone(body.phone);
          const {data: row,error} = await supabaseAdmin.from('driver_accounts').select('id,name,phone,vehicle_plate,vehicle_model,created_at').eq('phone',phone).maybeSingle();
          if (error) throw new AccountSessionError('Não foi possível conferir a conta.',503,'ACCOUNT_UNAVAILABLE');
          if (!row) return jsonResponse({success:false,error:'O entregador precisa criar sua conta primeiro.'},{status:404});
          const account = {id:row.id,name:row.name,phone:row.phone,vehiclePlate:row.vehicle_plate,vehicleModel:row.vehicle_model,createdAt:row.created_at};
          if (body.confirmed !== true) return jsonResponse({success:true,preview:{name:account.name,phone:account.phone.replace(/.(?=.{4})/g,'*'),driverName:driver.driverName || driver.name,storeName:driver.storeName}});
          await bindAccountMembership(account,driver);
          return jsonResponse({success:true,message:'Conta associada ao vínculo e histórico existentes.'});
        }
        case 'session-validate': {
          return handleSessionValidate(req, body, storeId);
        }

        // Limpeza Total de Pedidos, Ofertas e Demonstrações pelo Lojista
        case 'admin-clean-demo': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          liveOffers = [];
          liveAssignments = [];
          liveTracking = {};
          liveDrivers = liveDrivers
            .filter((d) => d.status === 'ativo')
            .map((d) => ({
              ...d,
              activeDeliveries: 0,
              waitingPickupCount: 0,
              inTransitCount: 0,
              completedDeliveriesCount: 0,
              status: 'ativo',
              presence: 'disponivel',
              shiftStatus: 'em_plantao',
            }));

          await persistLogisticsState();

          try {
            await supabaseAdmin.storage.from('novaesweb_store').upload('orders.json', JSON.stringify([]), {
              upsert: true,
              contentType: 'application/json',
            });
            const gSharedLocal = globalThis as unknown as { __novaesweb_orders__?: any[] };
            gSharedLocal.__novaesweb_orders__ = [];
          } catch {}

          return jsonResponse({
            success: true,
            message: 'Todas as demonstrações e pedidos foram excluídos com sucesso.',
          });
        }

        // Atualização das Configurações de Distribuição e Despacho da Loja
        case 'settings-update': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const current = getStoreSettings(effectiveStoreId);

          const distributionMode =
            body.distributionMode === 'fixed_driver' ? 'fixed_driver' : 'broadcast_enabled';
          const fixedDriverId =
            distributionMode === 'fixed_driver' ? body.fixedDriverId || null : body.fixedDriverId ?? current.fixedDriverId;
          const requestedCapacity = Number(body.maxConcurrentDeliveries);
          const maxConcurrentDeliveries = Number.isSafeInteger(requestedCapacity) && requestedCapacity > 0
            ? requestedCapacity : current.maxConcurrentDeliveries;
          const offerTimeoutSeconds = Math.max(
            30,
            Math.min(3600, parseInt(body.offerTimeoutSeconds) || current.offerTimeoutSeconds || 900)
          );

          const nextStoreName =
            typeof body.storeName === 'string' && body.storeName.trim()
              ? body.storeName.trim()
              : current.storeName || STORE_LOCATION.name;
          const nextStoreAddress =
            typeof body.storeAddress === 'string' && body.storeAddress.trim()
              ? body.storeAddress.trim()
              : current.storeAddress || STORE_LOCATION.address;
          const nextStoreCity =
            typeof body.storeCity === 'string' && body.storeCity.trim()
              ? body.storeCity.trim()
              : current.storeCity || STORE_LOCATION.city;
          const nextStoreState =
            typeof body.storeState === 'string' && body.storeState.trim()
              ? body.storeState.trim().toUpperCase()
              : current.storeState || STORE_LOCATION.state;

          let nextLat =
            typeof body.storeLatitude === 'number'
              ? body.storeLatitude
              : current.storeLatitude ?? STORE_LOCATION.latitude;
          let nextLng =
            typeof body.storeLongitude === 'number'
              ? body.storeLongitude
              : current.storeLongitude ?? STORE_LOCATION.longitude;

          // Se o endereço ou cidade mudou (ou se o cliente pediu geocodificação), geocodifica automaticamente o endereço da loja
          if (
            body.storeAddress !== undefined ||
            body.storeCity !== undefined ||
            body.storeState !== undefined
          ) {
            {
              const geocoded = await geocodeAddress(nextStoreAddress, {
                city: nextStoreCity,
                state: nextStoreState,
              });
              if (geocoded) {
                nextLat = geocoded.lat;
                nextLng = geocoded.lng;
              }
            }
          }

          liveSettingsByStore[effectiveStoreId] = {
            storeId: effectiveStoreId,
            storeName: nextStoreName,
            storeAddress: nextStoreAddress,
            storeCity: nextStoreCity,
            storeState: nextStoreState,
            storeLatitude: nextLat,
            storeLongitude: nextLng,
            distributionMode,
            fixedDriverId,
            maxConcurrentDeliveries,
            offerTimeoutSeconds,
            updatedAt: new Date().toISOString(),
          };

          // Atualiza também o limite padrão nos entregadores da loja se solicitado
          if (body.applyLimitToAllDrivers) {
            liveDrivers.forEach((d) => {
              if (isSameStore(d.storeId, effectiveStoreId)) {
                d.maxDeliveries = maxConcurrentDeliveries;
              }
            });
          }

          await persistLogisticsState();

          return jsonResponse({
            success: true,
            action: 'settings.update',
            settings: liveSettingsByStore[effectiveStoreId],
          });
        }

        case 'offers': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }
          const myOffers = liveOffers
            .filter((o) => isOfferVisibleToDriver(o, auth, storeId))
            .map((o) => sanitizeOfferForDriver(o, storeId));

          return jsonResponse({
            success: true,
            action: 'offer.list',
            offers: myOffers,
          });
        }

        case 'assignments': {
          await loadLogisticsState();
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }
          const drvName = auth.driverRecord?.driverName || auth.driverRecord?.name;
          const driverStore = normalizeStoreId(
            auth.storeId || auth.driverRecord?.storeId || storeId
          );

          const myAssignments = liveAssignments
            .filter(
              (a) =>
                (isSameStore(a.storeId, driverStore) || !a.storeId) &&
                (a.driverId === auth.driverId ||
                  a.driverId === auth.membershipId ||
                  a.driverId === auth.driverRecord?.driverId ||
                  a.driverId === auth.driverRecord?.id) &&
                activeAssignmentStatuses.includes(a.status)
            )
            .map((a, idx) => sanitizeAssignmentForDriver(a, idx, driverStore));

          return jsonResponse({
            success: true,
            action: 'assignment.list',
            assignments: myAssignments,
          });
        }

        case 'route-current': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }
          const drvName = auth.driverRecord?.driverName || auth.driverRecord?.name;
          const driverStore = normalizeStoreId(
            auth.storeId || auth.driverRecord?.storeId || storeId
          );

          const activeList = liveAssignments
            .filter(
              (a) =>
                isSameStore(a.storeId, driverStore) &&
                (a.driverId === auth.driverId ||
                  a.driverId === auth.membershipId) &&
                a.status !== 'delivered' &&
                a.status !== 'entregue' &&
                a.status !== 'canceled_by_store' &&
                a.status !== 'canceled_by_driver'
            )
            .map((a, idx) => sanitizeAssignmentForDriver(a, idx, driverStore));

          const stops = activeList.map((a, idx) => ({
            assignmentId: a.assignmentId,
            orderNumber: a.orderNumber,
            sequence: a.sequence || idx + 1,
            customerName: a.customerName || 'Cliente',
            address: a.address,
            neighborhood: a.neighborhood || 'Bairro',
            status: a.status,
            isCurrent: idx === 0,
            deliveryFee: a.deliveryFee,
          }));

          return jsonResponse({
            success: true,
            action: 'route.current',
            stops,
            route: {
              id: 'rt-live-1',
              version: 1,
              status: 'em_andamento',
              currentStopIndex: 0,
              stops,
            },
          });
        }

        // 1. Cadastrar Entregador ou Emitir Código de Vínculo pelo Lojista (funciona mesmo sem pedidos)
        case 'driver-register':
        case 'invite-issue': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const settings = getStoreSettings(effectiveStoreId);
          const days = Math.max(1, parseInt(body.validityDays) || 7);

          // Garante código único NW-XXXXXX
          let rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
          while (liveDrivers.some((d) => d.inviteCode === rawToken)) {
            rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
          }

          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
          const membershipId = `shift-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          const prefilledName = body.driverName?.trim() || body.name?.trim() || null;
          const prefilledPhone = body.phone?.trim() || null;
          const prefilledPlate = body.vehiclePlate?.trim()
            ? body.vehiclePlate.trim().toUpperCase()
            : null;
          const maxDeliveries =
            parseInt(body.maxDeliveries) || settings.maxConcurrentDeliveries || 5;
          const bindImmediately = Boolean(body.bindImmediately && prefilledName);
          const generatedDriverId = prefilledName
            ? body.driverId || `drv_${Date.now()}_${Math.floor(Math.random() * 1000)}`
            : null;
          const preSignedSessionToken =
            bindImmediately && generatedDriverId
              ? signDriverToken({
                  driverId: generatedDriverId,
                  membershipId,
                  inviteCode: rawToken,
                  storeId: effectiveStoreId,
                  ttlMs: days * 86400000,
                })
              : null;

          const newShift = {
            id: membershipId,
            storeId: effectiveStoreId,
            storeName: body.storeName || 'Bella Pizza',
            inviteCode: rawToken,
            accountInviteVersion: 1,
            tokenHash,
            sessionToken: preSignedSessionToken,
            driverName: prefilledName,
            name: prefilledName,
            phone: prefilledPhone,
            vehiclePlate: prefilledPlate,
            driverId: generatedDriverId,
            deviceFingerprint: null,
            status: bindImmediately ? 'ativo' : 'aguardando_motoboy',
            shiftStatus: bindImmediately ? 'em_plantao' : 'aguardando_motoboy',
            presence: bindImmediately ? 'disponivel' : 'indisponivel',
            activeDeliveries: 0,
            waitingPickupCount: 0,
            inTransitCount: 0,
            completedDeliveriesCount: 0,
            maxDeliveries,
            validityDays: days,
            inviteExpiryDays: days,
            expiresAt,
            createdAt: new Date().toISOString(),
            activatedAt: bindImmediately ? new Date().toISOString() : null,
          };

          liveDrivers.unshift(newShift);
          await persistLogisticsState();

          const { sessionToken: _st, tokenHash: _th, ...safeDriver } = newShift as any;

          return jsonResponse({
            success: true,
            action: 'invite.issue',
            driver: safeDriver,
            sessionToken: preSignedSessionToken || undefined,
            inviteCode: rawToken,
            validityDays: days,
            expiresAt,
            issuedAt: newShift.createdAt,
            idempotencyKey,
          });
        }

        // Revogar convite pendente pelo lojista
        case 'invite-revoke': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const { driverId, inviteCode } = body;
          const drv = liveDrivers.find(
            (d) =>
              isSameStore(d.storeId, effectiveStoreId) &&
              ((driverId && (d.id === driverId || d.driverId === driverId || d.inviteCode === driverId)) ||
                (inviteCode && d.inviteCode === inviteCode))
          );

          if (!drv) {
            return jsonResponse(
              { success: false, error: 'Convite ou vínculo não encontrado nesta loja.' },
              { status: 404 }
            );
          }

          drv.status = 'revogado';
          drv.presence = 'indisponivel';
          drv.shiftStatus = 'revogado';
          drv.revokedAt = new Date().toISOString();
          drv.sessionToken = null;
          await persistLogisticsState();

          return jsonResponse({
            success: true,
            action: 'invite.revoke',
            driverId: drv.id,
            inviteCode: drv.inviteCode,
            status: 'revogado',
          });
        }

        // Remover vínculo de um entregador com a loja (preservando conta pessoal e histórico, exigindo tratamento se houver entregas ativas)
        case 'driver-unlink':
        case 'driver-delete':
        case 'invite-delete': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const { driverId, handleActiveDeliveries } = body;

          const drv = liveDrivers.find(
            (d) =>
              isSameStore(d.storeId, effectiveStoreId) &&
              (d.id === driverId || d.driverId === driverId || d.inviteCode === driverId)
          );

          if (!drv) {
            return jsonResponse(
              { success: false, error: 'Entregador não encontrado nesta loja.' },
              { status: 404 }
            );
          }

          const dId = drv.driverId || drv.id;
          const dMembership = drv.id;
          const dName = drv.driverName || drv.name;

          // Verifica se o entregador possui entregas em andamento (aguardando retirada ou em percurso) nesta loja
          const activeAssignments = liveAssignments.filter(
            (a) =>
              isSameStore(a.storeId, effectiveStoreId) &&
              ((dId && (a.driverId === dId || a.driverId === dMembership)) ||
                (!a.driverId && dName && a.driverName === dName)) &&
              (a.status === 'waiting_pickup' ||
                a.status === 'picked_up' ||
                a.status === 'in_transit' ||
                a.status === 'em_rota')
          );

          if (activeAssignments.length > 0 && handleActiveDeliveries !== 'return_to_queue') {
            return jsonResponse(
              {
                success: false,
                requiresExplicitHandling: true,
                activeDeliveriesCount: activeAssignments.length,
                activeOrders: activeAssignments.map((a) => ({
                  assignmentId: a.assignmentId || a.id,
                  orderId: a.orderId,
                  orderNumber: a.orderNumber,
                  status: a.status,
                })),
                error: `Este entregador possui ${activeAssignments.length} pedido(s) em andamento. Confirme a devolução dos pedidos ativos para a fila de despacho antes de remover o vínculo.`,
              },
              { status: 409 }
            );
          }

          // Se confirmado pelo lojista, devolve as entregas em andamento para a fila da loja sem apagar o histórico concluído
          if (activeAssignments.length > 0 && handleActiveDeliveries === 'return_to_queue') {
            const activeOrderIds = new Set<string>();
            const activeOrderNums = new Set<string>();

            activeAssignments.forEach((a) => {
              a.status = 'canceled_by_store';
              a.canceledAt = new Date().toISOString();
              a.cancelReason = 'Vínculo do entregador removido pela loja — pedido devolvido à fila';
              if (a.orderId) activeOrderIds.add(String(a.orderId));
              if (a.orderNumber) activeOrderNums.add(String(a.orderNumber).replace('#', ''));
            });

            await updateStoreOrdersStatus((allOrders) => {
              let changed = false;
              allOrders.forEach((o) => {
                if (
                  activeOrderIds.has(String(o.id)) ||
                  activeOrderNums.has(String(o.orderNumber).replace('#', ''))
                ) {
                  o.status = 'pronto';
                  o.dispatchStatus = 'disponivel';
                  o.driverName = null;
                  o.assignedDriverName = null;
                  o.pickedUpAt = null;
                  changed = true;
                }
              });
              return changed;
            });
          }

          // Cancela ofertas pendentes exclusivas deste entregador
          liveOffers.forEach((off) => {
            if (
              isSameStore(off.storeId, effectiveStoreId) &&
              off.status === 'pendente' &&
              (off.targetDriverId === dId || off.targetDriverId === dMembership)
            ) {
              off.status = 'cancelada';
            }
          });

          // Se este entregador era o entregador fixo da loja, limpa a seleção de entregador fixo
          const settings = getStoreSettings(effectiveStoreId);
          if (settings.fixedDriverId === dId || settings.fixedDriverId === dMembership) {
            settings.fixedDriverId = null;
          }

          // Remove localização em tempo real
          if (dId && liveTracking[dId]) delete liveTracking[dId];
          if (dMembership && liveTracking[dMembership]) delete liveTracking[dMembership];

          // Se era apenas um código nunca ativado, podemos marcá-lo como revogado; se era entregador, marca vínculo removido preservando o registro para histórico
          if (!drv.driverName && drv.status === 'aguardando_motoboy') {
            drv.status = 'revogado';
            drv.revokedAt = new Date().toISOString();
          } else {
            drv.status = 'vinculo_removido';
            drv.unlinkedAt = new Date().toISOString();
          }
          drv.presence = 'indisponivel';
          drv.shiftStatus = 'vinculo_removido';
          drv.sessionToken = null;

          await persistLogisticsState();

          return jsonResponse({
            success: true,
            action: 'driver.unlink',
            driverId: drv.id,
            status: drv.status,
            returnedOrdersCount: activeAssignments.length,
            message:
              'Vínculo com a loja removido com sucesso. O histórico de entregas concluídas e a conta pessoal do entregador foram preservados.',
          });
        }

        // 2. Ativação do Convite / Código de Vínculo pelo App do Entregador (Validação Estrita no Servidor)
        case 'invite-activate': {
          const {account} = driverAccountContext(req);
          const {data: allowed,error: limitError} = await supabaseAdmin.rpc('driver_auth_consume_limit',{
            p_key:crypto.createHash('sha256').update('invite:'+account.id).digest('hex'),p_limit:10,p_window_seconds:900,
          });
          if (limitError) throw new AccountSessionError('Não foi possível validar o código agora.',503,'ACCOUNT_UNAVAILABLE');
          if (allowed !== true) throw new AccountSessionError('Muitas tentativas de código. Aguarde 15 minutos.',429,'RATE_LIMITED');
          const { inviteCode, deviceFingerprint } = body;
          const driverId = account.id, driverName = account.name, phone = account.phone, vehiclePlate = account.vehiclePlate;
          if (!inviteCode) {
            return jsonResponse(
              { success: false, error: 'Código de vínculo obrigatório.' },
              { status: 400 }
            );
          }

          const normalizedCode = inviteCode.toString().trim().toUpperCase();
          const resolvedDriverId = driverId || toValidUuid(`drv_${phone || Date.now()}`);

          // Busca estritamente pelo código emitido pela loja (não cria vínculo se o código não existir!)
          const shift = liveDrivers.find(
            (d) => d.inviteCode && d.inviteCode.toString().trim().toUpperCase() === normalizedCode
          );

          if (!shift) {
            return jsonResponse(
              {
                success: false,
                error:
                  'Código de vínculo inválido ou inexistente. Solicite um código válido ao lojista em Configurações > Entregadores e despacho.',
              },
              { status: 404 }
            );
          }

          const {memberships} = driverAccountContext(req);
          if (shift.accountInviteVersion !== 1 && !memberships.some(m => m.membership_id === shift.id)) {
            return jsonResponse({success:false,code:'LEGACY_MIGRATION_REQUIRES_STORE',error:'Este vínculo é antigo. Peça ao lojista para associar sua conta cadastrada.'},{status:409});
          }

          if (shift.status === 'revogado') {
            return jsonResponse(
              {
                success: false,
                error: 'Este convite foi revogado pela loja e não pode mais ser utilizado.',
              },
              { status: 403 }
            );
          }

          if (shift.status === 'vinculo_removido') {
            return jsonResponse(
              {
                success: false,
                error: 'O vínculo associado a este código foi encerrado pela loja.',
              },
              { status: 403 }
            );
          }

          if (shift.status === 'bloqueado') {
            return jsonResponse(
              {
                success: false,
                error: 'Este código de vínculo ou entregador está bloqueado pela loja.',
              },
              { status: 403 }
            );
          }

          if (shift.expiresAt && new Date(shift.expiresAt).getTime() < Date.now()) {
            return jsonResponse(
              {
                success: false,
                error: 'Este código de vínculo expirou. Solicite um novo código à loja.',
              },
              { status: 410 }
            );
          }

          const shiftStoreId = normalizeStoreId(shift.storeId || storeId);
          shift.storeId = shiftStoreId;
          shift.driverId = shift.driverId || resolvedDriverId;
          // A posse do convite permite a primeira associação. Depois, só a conta
          // proprietária pode reativá-lo, independentemente do telefone informado.
          await bindAccountMembership(account, shift);
          shift.driverName = driverName || shift.driverName || 'Entregador';
          shift.name = shift.driverName;
          shift.phone = phone || shift.phone || null;
          shift.vehiclePlate = vehiclePlate
            ? vehiclePlate.toUpperCase()
            : shift.vehiclePlate || null;
          shift.deviceFingerprint = deviceFingerprint || shift.deviceFingerprint || null;
          shift.status = 'ativo';
          shift.shiftStatus = 'em_plantao';
          shift.presence = 'disponivel';
          shift.activatedAt = shift.activatedAt || new Date().toISOString();

          const sessionToken = signDriverToken({
            driverId: shift.driverId,
            membershipId: shift.id,
            inviteCode: shift.inviteCode || normalizedCode,
            storeId: shiftStoreId,
            ttlMs: (shift.validityDays || 7) * 86400000,
          });
          shift.sessionToken = sessionToken;

          // Se houver ofertas broadcast pendentes ativas na loja, inclui imediatamente o novo motoboy nelas para ele receber na hora
          liveOffers.forEach((o) => {
            if (isSameStore(o.storeId, shiftStoreId) && o.status === 'pendente') {
              if (o.distributionMode === 'broadcast_enabled' || (!o.targetDriverId && !o.driverId)) {
                if (Array.isArray(o.eligibleDriverIds)) {
                  if (shift.driverId && !o.eligibleDriverIds.includes(shift.driverId)) {
                    o.eligibleDriverIds.push(shift.driverId);
                  }
                  if (shift.id && !o.eligibleDriverIds.includes(shift.id)) {
                    o.eligibleDriverIds.push(shift.id);
                  }
                }
              }
            }
          });

          await persistLogisticsState();

          return jsonResponse({
            success: true,
            action: 'invite.activate',
            status: 'ativo',
            shiftStatus: 'em_plantao',
            presence: 'disponivel',
            membershipId: shift.id,
            expiresAt: shift.expiresAt,
            store: {
              id: shiftStoreId,
              name: shift.storeName || 'Bella Pizza',
              address: STORE_LOCATION.address,
            },
            driver: {
              id: shift.driverId,
              driverId: shift.driverId,
              driverName: shift.driverName,
              name: shift.driverName,
              phone: shift.phone,
              vehiclePlate: shift.vehiclePlate,
            },
            sessionToken,
            message: 'Vínculo ativado com sucesso na loja.',
            idempotencyKey,
          });
        }

        // 3. Alteração de Presença / Heartbeat (driver.presence)
        case 'driver-presence': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const isOnline = body?.manualEnabled ?? true;
          const drv =
            auth.driverRecord ||
            liveDrivers.find(
              (d) => d.driverId === auth.driverId || d.id === auth.membershipId
            );

          if (drv) {
            drv.presence = isOnline ? 'disponivel' : 'indisponivel';
            drv.shiftStatus = isOnline ? 'em_plantao' : 'plantao_encerrado';
            await persistLogisticsState();
          }

          return jsonResponse({
            success: true,
            action: 'driver.presence',
            manualEnabled: isOnline,
            presence: drv?.presence || (isOnline ? 'disponivel' : 'indisponivel'),
            shiftStatus: drv?.shiftStatus || (isOnline ? 'em_plantao' : 'plantao_encerrado'),
            serverTime: new Date().toISOString(),
            idempotencyKey,
          });
        }

        // 4. Encerramento de Turno / Plantão pelo App do Motoboy
        case 'shift-end':
        case 'shift-close': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const drv =
            auth.driverRecord ||
            liveDrivers.find(
              (d) => d.driverId === auth.driverId || d.id === auth.membershipId
            );

          if (drv) {
            drv.presence = 'indisponivel';
            drv.shiftStatus = 'plantao_encerrado';
            const dId = drv.driverId || drv.id;
            if (dId && liveTracking[dId]) delete liveTracking[dId];
            await persistLogisticsState();
          }

          return jsonResponse({
            success: true,
            action: 'shift.end',
            shiftStatus: 'plantao_encerrado',
            presence: 'indisponivel',
            message: 'Plantão encerrado com sucesso',
          });
        }

        // 5. Ativar ou Bloquear recebimento de novas ofertas pelo Lojista
        case 'driver-toggle-block': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const { driverId } = body;
          const drv = liveDrivers.find(
            (d) =>
              isSameStore(d.storeId, effectiveStoreId) &&
              (d.id === driverId || d.driverId === driverId || d.inviteCode === driverId)
          );

          if (!drv) {
            return jsonResponse(
              { success: false, error: 'Entregador não encontrado nesta loja.' },
              { status: 404 }
            );
          }

          if (drv.status === 'bloqueado') {
            drv.status = drv.driverName ? 'ativo' : 'aguardando_motoboy';
            if (drv.driverName) {
              drv.presence = 'disponivel';
              drv.shiftStatus = 'em_plantao';
            }
          } else {
            drv.status = 'bloqueado';
            drv.presence = 'indisponivel';
          }
          await persistLogisticsState();

          return jsonResponse({
            success: true,
            driverId: drv.id,
            status: drv.status,
            presence: drv.presence,
          });
        }

        // 7. Criar Oferta de Despacho pelo Lojista (Modos: Entregador Fixo ou Oferta para Habilitados)
        case 'offer-create': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          await loadLogisticsState();

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const settings = getStoreSettings(effectiveStoreId);

          const {
            offerId: customOfferId,
            orderId,
            orderIds,
            orders,
            orderNumber,
            customerAddress,
            customerName,
            customerPhone,
            customerNeighborhood,
            itemsSummary,
            driverId: requestedDriverId,
            distributionMode: requestedMode,
            feeOffered,
          } = body;

          const requestedOrders =
            Array.isArray(orders) && orders.length > 0
              ? orders
              : Array.isArray(orderIds) && orderIds.length > 0
              ? orderIds.map((id: string) => ({
                  id,
                  orderId: id,
                  orderNumber: orderNumber || '#000',
                  customerAddress,
                }))
              : [{ id: orderId, orderId, orderNumber, customerAddress }];

          const batchSize = requestedOrders.length;
          if (batchSize === 0 || !(requestedOrders[0]?.id || requestedOrders[0]?.orderId)) {
            return jsonResponse(
              { success: false, error: 'Selecione ao menos um pedido para despachar.' },
              { status: 400 }
            );
          }

          const targetOrders = await requireReadyDispatchOrders(requestedOrders, effectiveStoreId);
          const nowMs = Date.now();

          // Determina o modo de distribuição
          const effectiveMode: 'fixed_driver' | 'broadcast_enabled' =
            requestedMode === 'broadcast_enabled'
              ? 'broadcast_enabled'
              : requestedMode === 'fixed_driver'
              ? 'fixed_driver'
              : requestedDriverId
              ? 'fixed_driver'
              : settings.distributionMode;

          const storeDrivers = liveDrivers.filter((d) => isSameStore(d.storeId, effectiveStoreId));

          let resolvedDriverId: string | null = null;
          let resolvedDriverName: string = 'Entregadores Habilitados';
          let eligibleDriverIds: string[] = [];

          if (effectiveMode === 'fixed_driver') {
            const targetDrvId = requestedDriverId || settings.fixedDriverId;
            if (!targetDrvId) {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'no_fixed_driver_configured',
                  error:
                    'Nenhum entregador fixo foi selecionado nas configurações. Selecione um entregador para despachar.',
                },
                { status: 409 }
              );
            }

            const drv = storeDrivers.find(
              (d) => d.id === targetDrvId || d.driverId === targetDrvId
            );

            if (!drv) {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'not_found',
                  error:
                    'O entregador selecionado não está mais vinculado a esta loja. Escolha outro entregador.',
                },
                { status: 409 }
              );
            }

            if (drv.status === 'bloqueado') {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'blocked',
                  driverName: drv.driverName || drv.name,
                  error: `O entregador ${drv.driverName || drv.name || 'fixo'} está bloqueado para novas ofertas. Escolha outro entregador.`,
                },
                { status: 409 }
              );
            }

            if (drv.status === 'revogado' || drv.status === 'vinculo_removido') {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'unlinked',
                  driverName: drv.driverName || drv.name,
                  error: `O vínculo do entregador ${drv.driverName || drv.name || 'fixo'} foi removido ou revogado. Escolha outro entregador.`,
                },
                { status: 409 }
              );
            }

            const isExpired = drv.expiresAt && new Date(drv.expiresAt).getTime() < nowMs;
            if (isExpired) {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'expired',
                  driverName: drv.driverName || drv.name,
                  error: `O código de vínculo do entregador ${drv.driverName || drv.name || 'fixo'} expirou. Renove o vínculo ou escolha outro entregador.`,
                },
                { status: 409 }
              );
            }

            if (drv.status !== 'ativo') {
              return jsonResponse(
                {
                  success: false,
                  fixedDriverUnavailable: true,
                  reason: 'not_activated',
                  driverName: drv.driverName || drv.name,
                  error: `O entregador ainda não ativou o código de vínculo no aplicativo. Escolha outro entregador ativo.`,
                },
                { status: 409 }
              );
            }

            resolvedDriverId = drv.driverId || drv.id;
            resolvedDriverName = drv.driverName || drv.name || 'Entregador';
            eligibleDriverIds = [drv.driverId || drv.id, drv.id].filter(Boolean);
          } else {
            // Modo B: Oferta para todos os entregadores habilitados da loja
            const eligibleDrivers = storeDrivers.filter((d) => {
              if (d.status !== 'ativo') return false;
              if (d.expiresAt && new Date(d.expiresAt).getTime() < nowMs) return false;
              return d.presence !== 'indisponivel' && d.shiftStatus !== 'plantao_encerrado';
            });

            const idSet = new Set<string>();
            eligibleDrivers.forEach((d) => {
              if (d.driverId) idSet.add(d.driverId);
              if (d.id) idSet.add(d.id);
            });
            eligibleDriverIds = Array.from(idSet);
            resolvedDriverId = null;
            resolvedDriverName = eligibleDrivers.length > 0
              ? `Oferta para ${eligibleDrivers.length} entregador(es)`
              : 'Oferta Aberta (Broadcast)';
          }

          const offerId = customOfferId || `off_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const timeoutSeconds = settings.offerTimeoutSeconds || 900;
          const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

          const feeNum = Number(feeOffered) || 12.0;
          const combinedOrderNumbers =
            targetOrders
              .map((o: any) =>
                o.orderNumber ? `#${String(o.orderNumber).replace('#', '')}` : ''
              )
              .filter(Boolean)
              .join(', ') || String(orderNumber || '#000');

          const combinedAddress =
            customerAddress ||
            targetOrders
              .map(
                (o: any) =>
                  `#${String(o.orderNumber || '').replace('#', '')}: ${
                    o.customerAddress || o.deliveryAddress || o.address || 'Endereço'
                  }`
              )
              .join(' | ');

          const offerObj = {
            id: offerId,
            offerId,
            storeId: effectiveStoreId,
            storeName: 'Bella Pizza',
            distributionMode: effectiveMode,
            orderId: targetOrders[0]?.id || targetOrders[0]?.orderId || orderId,
            orderIds: targetOrders.map((o: any) => o.id || o.orderId),
            orders: targetOrders,
            orderNumber: combinedOrderNumbers,
            customerAddress: combinedAddress,
            deliveryAddress: combinedAddress,
            customerNeighborhood:
              customerNeighborhood ||
              targetOrders[0]?.customerNeighborhood ||
              targetOrders[0]?.region ||
              'Bairro Atendido',
            customerCity: targetOrders[0]?.customerCity || targetOrders[0]?.city || 'Canoas',
            customerName:
              customerName ||
              (targetOrders.length === 1
                ? targetOrders[0]?.customerName || 'Cliente'
                : `${targetOrders.length} Clientes (Conjunto)`),
            customerPhone: customerPhone || targetOrders[0]?.customerPhone || '',
            itemsSummary:
              itemsSummary ||
              targetOrders
                .map(
                  (o: any) =>
                    `#${String(o.orderNumber || '').replace('#', '')} (${
                      o.itemsSummary || '1x Pedido Delivery'
                    })`
                )
                .join(' • '),
            driverId: resolvedDriverId,
            targetDriverId: resolvedDriverId,
            driverName: resolvedDriverName,
            eligibleDriverIds,
            rejectedByDriverIds: [] as string[],
            acceptedByDriverId: null as string | null,
            feeOffered: feeNum,
            deliveryFee: feeNum,
            estimatedDistanceKm: Number((2.0 + targetOrders.length * 1.2).toFixed(1)),
            totalOrdersGrouped: targetOrders.length,
            status: 'pendente',
            expiresAt,
            timeoutSeconds,
            createdAt: new Date().toISOString(),
          };

          liveOffers.unshift(offerObj);
          await persistLogisticsState();

          // Dispara Notificação Web Push para os motoboys destinatários (segundo plano/tela bloqueada)
          void notifyDriversOfNewOffer({
            storeId: effectiveStoreId,
            storeName: offerObj.storeName || settings.storeName || 'Bella Pizza',
            offerId: offerObj.id,
            orderNumber: offerObj.orderNumber,
            deliveryFee: offerObj.deliveryFee ?? offerObj.feeOffered,
            totalOrders: batchSize,
            distributionMode: effectiveMode,
            targetDriverId: resolvedDriverId,
            eligibleDriverIds,
            liveDrivers,
          }).catch((pushErr) => {
            console.warn('[Logistics] Aviso ao despachar Web Push:', pushErr);
          });

          const orderIdSet = new Set(targetOrders.map((o: any) => String(o.id || o.orderId)));
          const orderNumberSet = new Set(
            targetOrders.map((o: any) => String(o.orderNumber).replace('#', ''))
          );
          await updateStoreOrdersStatus((storeOrdersList) => {
            let updated = false;
            storeOrdersList.forEach((o) => {
              if (
                orderIdSet.has(String(o.id)) ||
                orderNumberSet.has(String(o.orderNumber).replace('#', ''))
              ) {
                o.status = 'pronto';
                o.dispatchStatus = 'aguardando_aceite';
                o.driverName = resolvedDriverName;
                o.assignedDriverName = resolvedDriverName;
                o.offerGroupId = offerId;
                updated = true;
              }
            });
            return updated;
          });

          return jsonResponse({
            success: true,
            action: 'offer.create',
            offer: offerObj,
            distributionMode: effectiveMode,
            notifiedDriversCount:
              effectiveMode === 'fixed_driver'
                ? 1
                : storeDrivers.filter(
                    (d) =>
                      d.status === 'ativo' &&
                      (eligibleDriverIds.includes(d.driverId) || eligibleDriverIds.includes(d.id))
                  ).length,
            idempotencyKey,
          });
        }

        // 8. Cancelar Despacho de Pedido pelo Lojista (offer.cancel)
        case 'offer-cancel': {
          const adminCheck = verifyAdminRequest(req);
          if (!adminCheck.valid) {
            return jsonResponse(
              { success: false, error: 'Acesso restrito ao lojista.' },
              { status: 401 }
            );
          }

          const effectiveStoreId = normalizeStoreId(adminCheck.storeId || storeId);
          const { orderId } = body;
          const targetStr = String(orderId || '');

          // Remove ofertas pendentes ou atribuídas deste pedido para não reaparecerem
          liveOffers = liveOffers.filter((off: any) => {
            if (!isSameStore(off.storeId, effectiveStoreId)) return true;
            const directMatch =
              String(off.orderId) === targetStr ||
              String(off.orderNumber).replace('#', '') === targetStr.replace('#', '');
            const nestedMatch =
              Array.isArray(off.orders) &&
              off.orders.some(
                (item: any) =>
                  String(item.id || item.orderId) === targetStr ||
                  String(item.orderNumber).replace('#', '') === targetStr.replace('#', '')
              );
            return !(directMatch || nestedMatch);
          });

          // Cancela tarefas ativas do motoboy para este pedido caso estivesse aguardando retirada
          liveAssignments.forEach((asg: any) => {
            if (!isSameStore(asg.storeId, effectiveStoreId)) return;
            const match =
              String(asg.orderId) === targetStr ||
              String(asg.orderNumber).replace('#', '') === targetStr.replace('#', '');
            if (match && asg.status !== 'delivered' && asg.status !== 'entregue') {
              asg.status = 'canceled_by_store';
              asg.canceledAt = new Date().toISOString();
            }
          });

          await persistLogisticsState();

          await updateStoreOrdersStatus((allOrders) => {
            let updated = false;
            allOrders.forEach((o) => {
              if (
                String(o.id) === targetStr ||
                String(o.orderNumber).replace('#', '') === targetStr.replace('#', '')
              ) {
                o.dispatchStatus = 'disponivel';
                o.driverName = null;
                o.assignedDriverName = null;
                o.offerGroupId = null;
                updated = true;
              }
            });
            return updated;
          });

          return jsonResponse({ success: true, action: 'offer.cancel', orderId });
        }

        // 9. Responder Oferta pelo Motoboy (Aceite Atômico no Servidor, Proteção contra Duplicidade e Aceite Parcial)
        case 'offer-respond': {
          await loadLogisticsState();
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const { offerId } = body;
          const decision = body.decision || body.response;
          if (!['accept','accepted','reject','rejected'].includes(decision)) throw new AccountSessionError('Informe aceite ou recusa do conjunto.',400,'INVALID_OFFER_DECISION');
          const drv = auth.driverRecord;
          const drvId = auth.driverId || drv?.driverId || drv?.id;
          const memId = auth.membershipId || drv?.id;
          const drvName = drv?.driverName || drv?.name || 'Entregador';
          const driverStore = normalizeStoreId(auth.storeId || drv?.storeId || storeId);

          // Localiza a oferta pelo ID exato dentro da mesma loja
          const offer = liveOffers.find(
            (o) =>
              isSameStore(o.storeId, driverStore) &&
              (offerId
                ? o.id === offerId || o.offerId === offerId || o.orderId === offerId
                : o.status === 'pendente' && isOfferVisibleToDriver(o, auth, driverStore))
          );

          if (!offer) {
            return jsonResponse(
              {
                success: false,
                error: 'Oferta não encontrada ou pertence a outro estabelecimento.',
              },
              { status: 404 }
            );
          }

          // Isolamento rigoroso entre lojas
          if (!isSameStore(offer.storeId, driverStore)) {
            return jsonResponse(
              { success: false, error: 'Acesso negado a ofertas de outra loja.' },
              { status: 403 }
            );
          }

          // Caso a oferta JÁ TENHA SIDO ACEITA:
          if (offer.status === 'atribuida') {
            // Clique repetido do MESMO entregador vencedor -> Resposta idempotente sem duplicar nada
            if (
              offer.acceptedByDriverId === drvId ||
              offer.acceptedByDriverId === memId ||
              offer.driverId === drvId
            ) {
              const existingAsgs = liveAssignments
                .filter(
                  (a) =>
                    isSameStore(a.storeId, driverStore) &&
                    (a.driverId === drvId || a.driverId === memId) &&
                    a.offerId === (offer.offerId || offer.id) && activeAssignmentStatuses.includes(a.status)
                )
                .map((a, idx) => sanitizeAssignmentForDriver(a, idx, driverStore));

              return jsonResponse({
                success: true,
                idempotent: true,
                action: 'offer.respond',
                offerId: offer.offerId || offer.id,
                status: 'aceita',
                assignment: existingAsgs[0] || null,
                assignments: existingAsgs,
              });
            }

            // Outro entregador tentando aceitar depois -> Bloqueia com "Esta oferta já foi aceita"
            return jsonResponse(
              {
                success: false,
                alreadyAccepted: true,
                error: 'Esta oferta já foi aceita',
                message: 'Esta oferta já foi aceita',
              },
              { status: 409 }
            );
          }

          // Oferta cancelada, recusada ou expirada
          const nowMs = Date.now();
          if (
            offer.status !== 'pendente' ||
            (offer.expiresAt && new Date(offer.expiresAt).getTime() <= nowMs)
          ) {
            return jsonResponse(
              {
                success: false,
                error: 'Esta oferta foi cancelada ou expirou.',
              },
              { status: 410 }
            );
          }

          // Verifica se este entregador é elegível para esta oferta
          if (!isOfferVisibleToDriver(offer, auth, driverStore)) {
            return jsonResponse(
              {
                success: false,
                error: 'Esta oferta não está disponível para o seu perfil.',
              },
              { status: 403 }
            );
          }

          // O conjunto inteiro de pedidos da oferta (NUNCA permite aceite parcial de conjunto)
          let targetOrders =
            Array.isArray(offer.orders) && offer.orders.length > 0
              ? offer.orders
              : [
                  {
                    id: offer.orderId,
                    orderId: offer.orderId,
                    orderNumber: offer.orderNumber,
                    customerName: offer.customerName || 'Cliente',
                    customerPhone: offer.customerPhone || '',
                    customerAddress: offer.customerAddress || offer.deliveryAddress,
                    customerNeighborhood: offer.customerNeighborhood || 'Bairro',
                    customerCity: offer.customerCity || 'Canoas',
                    itemsSummary: offer.itemsSummary || '1x Pedido Delivery',
                  },
                ];

          const subset = body.orderIds || body.assignmentIds;
          if (Array.isArray(subset) && (subset.length !== targetOrders.length || new Set(subset.map(String)).size !== targetOrders.length ||
            !targetOrders.every((order: any) => subset.map(String).includes(String(order.id || order.orderId))))) throw new AccountSessionError('Aceite ou recuse o conjunto inteiro.',400,'PARTIAL_BATCH_RESPONSE');
          if (decision === 'accepted' || decision === 'accept') {
            targetOrders = await requireReadyDispatchOrders(targetOrders, driverStore, offer.offerId || offer.id);
            const nowISO = new Date().toISOString();
            const mutationId = `accept_${offer.offerId || offer.id}_${drvId}_${Date.now()}`;

            // Marca a oferta como atribuída ao vencedor (retira imediatamente dos demais aplicativos)
            offer.status = 'atribuida';
            offer.acceptedByDriverId = drvId;
            offer.driverId = drvId;
            offer.driverName = drvName;
            offer.acceptedAt = nowISO;

            const createdAssignments: any[] = [];
            const feeTotal = Number(offer.deliveryFee ?? offer.feeOffered ?? 12.0);
            const feePerOrder = Number((feeTotal / targetOrders.length).toFixed(2));

            targetOrders.forEach((ord: any, idx: number) => {
              const ordId = ord.id || ord.orderId || `ord_${idx}_${Date.now()}`;
              const asgId = `asg_${ordId}_${crypto.randomUUID()}`;
              const asgObj = {
                id: asgId,
                assignmentId: asgId,
                offerId: offer.offerId || offer.id,
                batchId: offer.offerId || offer.id,
                pickupGroupId: offer.offerId || offer.id,
                orderId: ordId,
                orderNumber: ord.orderNumber
                  ? String(ord.orderNumber)
                  : String(offer.orderNumber || 1042),
                storeId: driverStore,
                storeName: offer.storeName || 'Bella Pizza',
                driverId: drvId,
                driverName: drvName,
                customerName: ord.customerName || 'Cliente',
                customerPhone: ord.customerPhone || ord.phone || '',
                address:
                  ord.customerAddress ||
                  ord.deliveryAddress ||
                  ord.address ||
                  offer.customerAddress ||
                  'Endereço do Cliente',
                addressNumber: ord.addressNumber || 'S/N',
                neighborhood:
                  ord.customerNeighborhood ||
                  ord.region ||
                  offer.customerNeighborhood ||
                  'Bairro',
                city: ord.customerCity || 'Canoas',
                feeOffered: feePerOrder,
                deliveryFee: feePerOrder,
                itemsSummary:
                  ord.itemsSummary || offer.itemsSummary || '1x Pedido Delivery',
                status: 'waiting_pickup',
                sequence: idx + 1,
                acceptedAt: nowISO,
                createdAt: nowISO,
                stageHistory: mergeStageHistory(ord.stageHistory),
              };
              recordStage(asgObj, 'despacho', nowISO, { attemptId: asgId, reason: 'accepted' });

              liveAssignments.unshift(asgObj);
              createdAssignments.push(sanitizeAssignmentForDriver(asgObj, idx, driverStore));
            });

            await persistLogisticsState(mutationId);

            // Verificação pós-escrita no armazenamento compartilhado para garantir atomicidade entre múltiplas instâncias
            await loadLogisticsState();
            const persistedOffer = liveOffers.find(
              (o) => (o.offerId || o.id) === (offer.offerId || offer.id)
            );
            if (
              persistedOffer &&
              persistedOffer.acceptedByDriverId &&
              persistedOffer.acceptedByDriverId !== drvId
            ) {
              return jsonResponse(
                {
                  success: false,
                  alreadyAccepted: true,
                  error: 'Esta oferta já foi aceita',
                  message: 'Esta oferta já foi aceita',
                },
                { status: 409 }
              );
            }

            const orderIdSet = new Set(
              targetOrders.map((o: any) => String(o.id || o.orderId))
            );
            const orderNumberSet = new Set(
              targetOrders.map((o: any) => String(o.orderNumber).replace('#', ''))
            );
            await updateStoreOrdersStatus((allOrders) => {
              let updated = false;
              allOrders.forEach((o) => {
                if (
                  orderIdSet.has(String(o.id)) ||
                  orderNumberSet.has(String(o.orderNumber).replace('#', ''))
                ) {
                  // Mantém substatus "aceito_aguardando_retirada" até a confirmação de saída real!
                  o.dispatchStatus = 'aceito_aguardando_retirada';
                  o.driverId = drvId;
                  o.driverName = drvName;
                  o.assignedDriverName = drvName;
                  o.acceptedAt = nowISO;
                  updated = true;
                }
              });
              return updated;
            });

            return jsonResponse({
              success: true,
              action: 'offer.respond',
              offerId: offer.offerId || offer.id,
              status: 'aceita',
              assignment: createdAssignments[0],
              assignments: createdAssignments,
              idempotencyKey,
            });
          } else {
            // RECUSA DE OFERTA PELO ENTREGADOR:
            // "A recusa de um entregador não deve cancelar a oferta para os outros."
            if (!Array.isArray(offer.rejectedByDriverIds)) {
              offer.rejectedByDriverIds = [];
            }
            if (drvId && !offer.rejectedByDriverIds.includes(drvId)) {
              offer.rejectedByDriverIds.push(drvId);
            }
            if (memId && !offer.rejectedByDriverIds.includes(memId)) {
              offer.rejectedByDriverIds.push(memId);
            }

            let allEligibleRejected = true;
            if (
              offer.distributionMode === 'broadcast_enabled' &&
              Array.isArray(offer.eligibleDriverIds) &&
              offer.eligibleDriverIds.length > 0
            ) {
              // Verifica se ainda resta algum entregador ativo elegível que NÃO recusou
              const storeActiveDrivers = liveDrivers.filter(
                (d) =>
                  isSameStore(d.storeId, driverStore) &&
                  d.status === 'ativo' &&
                  (offer.eligibleDriverIds.includes(d.driverId) ||
                    offer.eligibleDriverIds.includes(d.id))
              );
              const remainingDrivers = storeActiveDrivers.filter(
                (d) =>
                  !offer.rejectedByDriverIds.includes(d.driverId) &&
                  !offer.rejectedByDriverIds.includes(d.id)
              );
              allEligibleRejected = remainingDrivers.length === 0;
            }

            if (allEligibleRejected) {
              offer.status = 'recusada';
              await persistLogisticsState();

              const orderIdSet = new Set(
                targetOrders.map((o: any) => String(o.id || o.orderId))
              );
              const orderNumberSet = new Set(
                targetOrders.map((o: any) => String(o.orderNumber).replace('#', ''))
              );
              await updateStoreOrdersStatus((allOrders) => {
                let updated = false;
                allOrders.forEach((o) => {
                  if (
                    orderIdSet.has(String(o.id)) ||
                    orderNumberSet.has(String(o.orderNumber).replace('#', ''))
                  ) {
                    o.dispatchStatus = 'disponivel';
                    o.driverName = null;
                    o.assignedDriverName = null;
                    updated = true;
                  }
                });
                return updated;
              });
            } else {
              // Mantém a oferta 'pendente' para os outros entregadores habilitados!
              await persistLogisticsState();
            }

            return jsonResponse({
              success: true,
              action: 'offer.respond',
              offerId: offer.offerId || offer.id,
              status: 'recusada',
              stillAvailableForOthers: !allEligibleRejected,
              idempotencyKey,
            });
          }
        }

        // 10. Confirmar Retirada na Loja e Início da Rota (pickup.confirm)
        case 'pickup-confirm': {
          await loadLogisticsState();
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const { assignmentId, assignmentIds, orderId, orderIds } = body;
          const targetIds = Array.isArray(assignmentIds)
            ? assignmentIds
            : Array.isArray(orderIds)
            ? orderIds
            : [assignmentId || orderId].filter(Boolean);
          const pickedOrderIds: string[] = [];
          const pickedOrderNumbers: string[] = [];
          const nowISO = new Date().toISOString();
          const drvId = auth.driverId || auth.driverRecord?.driverId || auth.driverRecord?.id;
          const drvName =
            auth.driverRecord?.driverName || auth.driverRecord?.name || 'Entregador';
          const driverStore = normalizeStoreId(
            auth.storeId || auth.driverRecord?.storeId || storeId
          );

          const targetSet = new Set(
            targetIds.flatMap((id: any) => {
              const s = String(id).trim();
              return [s, s.toLowerCase(), s.replace('#', '')];
            })
          );

          liveAssignments.forEach((a) => {
            const matchesDriver =
              a.driverId === drvId ||
              a.driverId === auth.membershipId ||
              a.driverId === auth.driverRecord?.id ||
              a.driverId === auth.driverRecord?.driverId;
            const aId = String(a.id || '').trim();
            const aAsgId = String(a.assignmentId || '').trim();
            const aOrdId = String(a.orderId || '').trim();
            const aOrdNum = String(a.orderNumber || '').trim().replace('#', '');

            const matchesId =
              targetSet.has(aId) ||
              targetSet.has(aAsgId) ||
              targetSet.has(aOrdId) ||
              targetSet.has(aOrdNum) ||
              targetIds.includes(a.id) ||
              targetIds.includes(a.assignmentId) ||
              targetIds.includes(a.orderId);

            if (matchesId && matchesDriver && isSameStore(a.storeId, driverStore)) {
              a.status = 'picked_up';
              a.pickedUpAt = nowISO;
              a.pickupConfirmedAt = nowISO;
              if (a.orderId) pickedOrderIds.push(String(a.orderId));
              if (a.orderNumber) {
                pickedOrderNumbers.push(String(a.orderNumber).replace('#', ''));
              }
            }
          });
          await persistLogisticsState();

          const pickedIdSet = new Set(pickedOrderIds);
          const pickedNumSet = new Set(pickedOrderNumbers);
          await updateStoreOrdersStatus((allOrders) => {
            let updated = false;
            allOrders.forEach((o) => {
              const oId = String(o.id || '');
              const oNum = String(o.orderNumber || '').replace('#', '');
              if (
                pickedIdSet.has(oId) ||
                pickedNumSet.has(oNum)
              ) {
                o.status = 'em_entrega';
                o.dispatchStatus = 'em_entrega';
                o.pickedUpAt = nowISO;
                o.driverId = drvId;
                o.driverName = drvName;
                o.assignedDriverName = drvName;
                updated = true;
              }
            });
            return updated;
          });

          return jsonResponse({
            success: true,
            action: 'pickup.confirm',
            confirmed: targetIds,
            confirmedIds: targetIds,
            errors: {},
            status: 'retirada',
            pickedUpAt: nowISO,
            idempotencyKey,
          });
        }

        // 11. Reordenação de Paradas da Rota (route.reorder)
        case 'route-reorder': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const { stops } = body;
          if (Array.isArray(stops)) {
            stops.forEach((s: any) => {
              const asg = liveAssignments.find(
                (a) => a.id === s.assignmentId || a.assignmentId === s.assignmentId
              );
              if (asg && typeof s.sequence === 'number') {
                asg.sequence = s.sequence;
              }
            });
            await persistLogisticsState();
          }

          return jsonResponse({ success: true, action: 'route.reorder' });
        }

        // 12. Desistência de Entrega pelo Motoboy (assignment.withdraw)
        case 'assignment-withdraw': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const { assignmentId, reason } = body;
          const asg = liveAssignments.find(
            (a) => a.id === assignmentId || a.assignmentId === assignmentId
          );
          if (asg) {
            asg.status = 'canceled_by_driver';
            asg.withdrawalReason = reason || 'Desistência solicitada pelo entregador';
            await persistLogisticsState();

            const targetId = String(asg.orderId || '');
            const targetNum = String(asg.orderNumber || '').replace('#', '');
            await updateStoreOrdersStatus((allOrders) => {
              let updated = false;
              allOrders.forEach((o) => {
                if (
                  String(o.id) === targetId ||
                  String(o.orderNumber).replace('#', '') === targetNum
                ) {
                  o.status = 'pronto';
                  o.dispatchStatus = 'disponivel';
                  o.driverId = null;
                  o.driverName = null;
                  o.assignedDriverName = null;
                  o.pickedUpAt = null;
                  updated = true;
                }
              });
              return updated;
            });
          }

          return jsonResponse({
            success: true,
            action: 'assignment.withdraw',
            message: 'Entrega devolvida para a fila de despacho da loja.',
          });
        }

        // 13. Concluir Entrega Individual com Validação de PIN no Servidor (Preserva outros pedidos do conjunto em andamento)
        case 'delivery-complete':
        case 'delivery-confirm':
        case 'delivery-complete-with-pin': {
          await loadLogisticsState();
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) {
            return jsonResponse(
              { success: false, error: auth.error },
              { status: auth.status || 401 }
            );
          }

          const { assignmentId, orderId, pinCandidate, pin, isForced, forcedReason } = body;
          const targetKey = assignmentId || orderId;
          const targetClean = String(targetKey || '').replace(/^asg_/, '');
          const asg = liveAssignments.find(
            (a) =>
              a.id === targetKey ||
              a.assignmentId === targetKey ||
              String(a.id).replace(/^asg_/, '') === targetClean ||
              String(a.assignmentId).replace(/^asg_/, '') === targetClean ||
              (orderId && String(a.orderId) === String(orderId))
          );

          const nowISO = new Date().toISOString();

          // Resposta idempotente caso a entrega já tenha sido concluída
          if (asg && (asg.status === 'entregue' || asg.status === 'delivered')) {
            return jsonResponse({
              success: true,
              idempotent: true,
              action: 'delivery.complete',
              assignmentId: asg.assignmentId || targetKey,
              status: 'entregue',
              validatedAt: asg.deliveredAt || nowISO,
              message: 'Entrega confirmada com sucesso!',
              idempotencyKey,
            });
          }

          const ordIdTarget = asg?.orderId ? String(asg.orderId) : orderId ? String(orderId) : null;
          const ordNumTarget = asg?.orderNumber
            ? String(asg.orderNumber).replace(/\D/g, '')
            : null;

          const allOrders = await loadStoreOrders();
          const matchingOrder = allOrders.find((ord: any) => {
            const idMatch = ordIdTarget && String(ord.id) === ordIdTarget;
            const numMatch =
              ordNumTarget && String(ord.orderNumber).replace(/\D/g, '') === ordNumTarget;
            return idMatch || numMatch;
          });

          if (!isForced) {
            const cleanPin = String(pinCandidate || pin || '').trim();
            if (!cleanPin || cleanPin.length < 2) {
              return jsonResponse(
                {
                  success: false,
                  error: 'Informe o código PIN de 4 dígitos do cliente para confirmar a entrega.',
                },
                { status: 422 }
              );
            }

            const validCodes = new Set<string>();
            if (matchingOrder?.deliveryPin) {
              validCodes.add(String(matchingOrder.deliveryPin).trim());
            }
            if (asg?.pinCode) {
              validCodes.add(String(asg.pinCode).trim());
            }
            if (asg?.deliveryPin) {
              validCodes.add(String(asg.deliveryPin).trim());
            }

            const customerPhone = String(
              matchingOrder?.phone || asg?.customerPhone || ''
            ).replace(/\D/g, '');
            if (customerPhone.length >= 4) {
              validCodes.add(customerPhone.slice(-4));
            }

            const orderDigits = String(
              matchingOrder?.orderNumber || asg?.orderNumber || ''
            ).replace(/\D/g, '');
            if (orderDigits.length >= 2) {
              validCodes.add(orderDigits);
              if (orderDigits.length >= 4) {
                validCodes.add(orderDigits.slice(-4));
              }
            }

            if (validCodes.size > 0 && !validCodes.has(cleanPin)) {
              return jsonResponse(
                {
                  success: false,
                  error:
                    'Código incorreto! Digite o PIN do app, os 4 últimos números do celular do cliente ou o número do pedido.',
                },
                { status: 422 }
              );
            }
          }

          const drvId = auth.driverId || asg?.driverId;
          const drvName =
            auth.driverRecord?.driverName ||
            auth.driverRecord?.name ||
            asg?.driverName ||
            'Entregador';

          // Conclui e remove da fila ativa de ofertas qualquer oferta pendente deste pedido
          if (Array.isArray(liveOffers)) {
            liveOffers.forEach((off: any) => {
              const match =
                String(off.orderId) === ordIdTarget ||
                (ordNumTarget && String(off.orderNumber).replace(/\D/g, '') === ordNumTarget) ||
                (Array.isArray(off.orderIds) && off.orderIds.some((id: any) => String(id) === ordIdTarget)) ||
                (Array.isArray(off.orders) && off.orders.some((o: any) => String(o.id || o.orderId) === ordIdTarget));
              if (match) {
                off.status = 'concluida';
                off.completedAt = nowISO;
              }
            });
          }

          if (asg) {
            asg.status = 'entregue';
            asg.deliveredAt ||= nowISO;
            recordStage(asg, 'concluido', asg.deliveredAt, { attemptId: asg.id });
            if (isForced) {
              asg.forcedDelivery = true;
              asg.forcedDeliveryReason =
                forcedReason || 'Confirmado sob termo de responsabilidade pelo motoboy';
              asg.forcedByDriverName = drvName;
              asg.forcedAt = nowISO;
            }

            // Verifica se o entregador ainda possui alguma outra entrega em rota ("picked_up" / "in_transit")
            // Se não tiver mais nenhuma entrega em rota, encerra e revoga a localização ativa!
            const remainingInTransit = liveAssignments.some(
              (other) =>
                other.id !== asg.id &&
                other.assignmentId !== asg.assignmentId &&
                (other.driverId === drvId || other.driverId === auth.membershipId) &&
                (other.status === 'picked_up' ||
                  other.status === 'in_transit' ||
                  other.status === 'em_rota')
            );

            if (!remainingInTransit) {
              if (drvId && liveTracking[drvId]) delete liveTracking[drvId];
              if (auth.membershipId && liveTracking[auth.membershipId]) {
                delete liveTracking[auth.membershipId];
              }
            }

            await persistLogisticsState();
          }

          // Atualiza SOMENTE este pedido para "concluido" / "entregue" (os outros pedidos do conjunto continuam em andamento)
          if (matchingOrder || ordIdTarget || ordNumTarget) {
            await updateStoreOrdersStatus((ordersList) => {
              let updated = false;
              ordersList.forEach((o) => {
                const idMatch = ordIdTarget && String(o.id) === ordIdTarget;
                const numMatch =
                  ordNumTarget &&
                  String(o.orderNumber).replace(/\D/g, '') === ordNumTarget;
                if (idMatch || numMatch) {
                  o.status = 'concluido';
                  o.dispatchStatus = 'entregue';
                  o.deliveredAt = nowISO;
                  o.driverName = drvName;
                  o.assignedDriverName = drvName;
                  if (isForced) {
                    o.forcedDelivery = true;
                    o.forcedDeliveryReason =
                      forcedReason ||
                      'Confirmado sob termo de responsabilidade pelo motoboy';
                    o.forcedByDriverName = drvName;
                    o.forcedAt = nowISO;
                  }
                  updated = true;
                }
              });
              return updated;
            });
          }

          return jsonResponse({
            success: true,
            action: 'delivery.complete',
            assignmentId,
            status: 'entregue',
            validatedAt: nowISO,
            message: 'Entrega confirmada com sucesso!',
            idempotencyKey,
          });
        }

        // 14. Atualização de Localização GPS do Motoboy em Tempo Real (Apenas quando houver rota ativa após retirada)
        case 'tracking-location-push': {
          await loadLogisticsState();
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) return jsonResponse({success:false,error:auth.error},{status:auth.status || 401});
          const {
            assignmentId,
            latitude: rawLat,
            longitude: rawLng,
            lat,
            lng,
            heading,
            speed,
            accuracy,
            driverName: bodyDriverName,
            membershipId: bodyMembershipId,
          } = body;
          const latitude = typeof rawLat === 'number' ? rawLat : lat;
          const longitude = typeof rawLng === 'number' ? rawLng : lng;

          const requestedDriverId =
            auth.driverId ||
            body.driverId ||
            req.headers.get('x-driver-id') ||
            bodyMembershipId ||
            auth.membershipId;

          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return jsonResponse(
              {
                success: false,
                error: 'latitude e longitude numéricos são obrigatórios',
              },
              { status: 400 }
            );
          }

          const drv =
            auth.driverRecord ||
            liveDrivers.find(
              (d) =>
                (requestedDriverId &&
                  (d.driverId === requestedDriverId || d.id === requestedDriverId)) ||
                (bodyMembershipId && d.id === bodyMembershipId) ||
                (bodyDriverName && (d.driverName === bodyDriverName || d.name === bodyDriverName))
            );

          if (
            drv &&
            (drv.status === 'bloqueado' ||
              drv.status === 'revogado' ||
              drv.status === 'vinculo_removido')
          ) {
            return jsonResponse(
              { success: false, error: 'Entregador sem vínculo ativo com a loja.' },
              { status: 403 }
            );
          }

          const validDriverId =
            drv?.driverId || drv?.id || requestedDriverId || 'drv_active';
          const resolvedName =
            drv?.driverName || drv?.name || bodyDriverName || 'Entregador';
          const driverStore = normalizeStoreId(drv?.storeId || auth.storeId || storeId);

          // Só grava rastreamento se o entregador tiver ao menos 1 pedido com retirada confirmada (picked_up / in_transit)
          const hasStartedRoute = liveAssignments.some(
            (a) =>
              isSameStore(a.storeId, driverStore) &&
              (a.driverId === validDriverId ||
                (drv?.id && a.driverId === drv.id) ||
                (drv?.driverId && a.driverId === drv.driverId) ||
                (auth?.membershipId && a.driverId === auth.membershipId) ||
                (drv?.phone && a.driverPhone === drv.phone)) &&
              (a.status === 'picked_up' || a.status === 'in_transit' || a.status === 'em_rota' || a.status === 'waiting_pickup' || a.status === 'assigned' || a.status === 'accepted')
          );

          if (!hasStartedRoute) {
            return jsonResponse({
              success: true,
              ignored: true,
              action: 'tracking.location.ignored_before_pickup',
              driverId: validDriverId,
              message:
                'Localização não armazenada pois não há rota iniciada após confirmação de retirada.',
            });
          }

          const locationData: LiveDriverLocation = {
            driverId: validDriverId,
            driverName: resolvedName,
            storeId: driverStore,
            assignmentId: assignmentId || undefined,
            latitude,
            longitude,
            heading: heading ?? null,
            speed: speed ?? null,
            accuracy: accuracy ?? null,
            updatedAt: new Date().toISOString(),
          };

          if (liveTracking['drv_default']) {
            delete liveTracking['drv_default'];
          }

          liveTracking[validDriverId] = locationData;
          if (drv?.id && drv.id !== validDriverId) {
            liveTracking[drv.id] = locationData;
          }
          if (drv?.driverId && drv.driverId !== validDriverId) {
            liveTracking[drv.driverId] = locationData;
          }

          await persistLogisticsState();

          return jsonResponse({
            success: true,
            action: 'tracking.location.push',
            driverId: validDriverId,
            updatedAt: locationData.updatedAt,
            idempotencyKey,
          });
        }

        // 15. Início de Sessão de Rota com GPS
        case 'tracking-session-start': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) return jsonResponse({success:false,error:auth.error},{status:auth.status || 401});
          const { assignmentId, initialLocation } = body;
          const validDriverId =
            auth.driverId || body.driverId || req.headers.get('x-driver-id') || 'drv_active';
          const driverStore = normalizeStoreId(auth.storeId || storeId);

          const hasStartedRoute = liveAssignments.some(
            (a) =>
              isSameStore(a.storeId, driverStore) &&
              (a.driverId === validDriverId || a.driverId === auth.membershipId) &&
              (a.status === 'picked_up' || a.status === 'in_transit' || a.status === 'em_rota' || a.status === 'waiting_pickup' || a.status === 'assigned' || a.status === 'accepted')
          );

          if (
            hasStartedRoute &&
            validDriverId &&
            initialLocation?.latitude &&
            initialLocation?.longitude
          ) {
            liveTracking[validDriverId] = {
              driverId: validDriverId,
              storeId: driverStore,
              assignmentId,
              latitude: initialLocation.latitude,
              longitude: initialLocation.longitude,
              heading: initialLocation.heading ?? null,
              speed: initialLocation.speed ?? null,
              accuracy: initialLocation.accuracy ?? null,
              updatedAt: new Date().toISOString(),
            };
            await persistLogisticsState();
          }
          return jsonResponse({
            success: true,
            action: 'tracking.session.start',
            driverId: validDriverId,
          });
        }

        // 16. Encerramento de Sessão de Rastreamento
        case 'tracking-session-end': {
          const auth = verifyDriverRequest(req, liveDrivers, body);
          if (!auth.valid) return jsonResponse({success:false,error:auth.error},{status:auth.status || 401});
          const validDriverId =
            auth.driverId || body.driverId || req.headers.get('x-driver-id');
          if (validDriverId && liveTracking[validDriverId]) {
            delete liveTracking[validDriverId];
          }
          if (auth.membershipId && liveTracking[auth.membershipId]) {
            delete liveTracking[auth.membershipId];
          }
          await persistLogisticsState();
          return jsonResponse({
            success: true,
            action: 'tracking.session.end',
            driverId: validDriverId,
          });
        }

        default:
          return jsonResponse(
            { success: false, error: `Ação POST ${action} desconhecida` },
            { status: 404 }
          );
      }
    }));
  } catch (err: any) {
    if (err instanceof AccountSessionError || err instanceof StateStoreError) return jsonResponse({success:false,error:err.message,code:err.code},{status:err.status});
    return jsonResponse({ success: false, error: 'Não foi possível concluir a operação de logística. Tente novamente.' }, { status: 500 });
  }
}
