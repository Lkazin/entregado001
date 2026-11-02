import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import crypto from 'crypto';
import { readLogisticsState, writeLogisticsState, StateStoreError } from '@/lib/logistics/state-store';
import { projectStoreOrders, mergeStageHistory } from '@/lib/logistics/order-timeline';

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

function getOrdersStoragePath(storeId?: string | null): string {
  const norm = normalizeStoreId(storeId);
  if (norm === DEFAULT_STORE_ID) {
    return 'orders.json';
  }
  return `stores/${norm}/orders.json`;
}

const gOrders = globalThis as unknown as {
  __novaesweb_orders__?: any[];
  __novaesweb_orders_updated_at__?: number;
  __novaesweb_orders_by_store__?: Record<string, any[]>;
  __novaesweb_orders_by_store_updated_at__?: Record<string, number>;
};

if (!gOrders.__novaesweb_orders_by_store__) {
  gOrders.__novaesweb_orders_by_store__ = {};
  gOrders.__novaesweb_orders_by_store_updated_at__ = {};
}


const STATUS_HIERARCHY: Record<string, number> = {
  'recebido': 1,
  'preparando': 2,
  'pronto': 3,
  'em_entrega': 4,
  'concluido': 5,
  'cancelado': 99,
};

function mergeOrdersLists(localOrders: any[], incomingOrders: any[]): any[] {
  const map = new Map<string, any>();

  // 1. Insere pedidos recebidos do Storage
  for (const inc of incomingOrders || []) {
    if (inc && inc.id) {
      map.set(String(inc.id), inc);
      if (inc.orderNumber) {
        map.set(String(inc.orderNumber).replace('#', ''), inc);
      }
    }
  }

  // 2. Mescla com pedidos locais garantindo que status mais avançados nunca regridam
  for (const loc of localOrders || []) {
    if (!loc || !loc.id) continue;
    const key = String(loc.id);
    const inc = map.get(key) || (loc.orderNumber ? map.get(String(loc.orderNumber).replace('#', '')) : null);

    if (!inc) {
      // Pedido novo em memoria que o CDN do Storage ainda nao propagou: PRESERVA!
      map.set(key, loc);
    } else {
      const locRank = STATUS_HIERARCHY[loc.status] || 0;
      const incRank = STATUS_HIERARCHY[inc.status] || 0;

      // Preserva sempre o status mais avancado (NUNCA regride de concluido para recebido ou preparando para recebido)
      let finalStatus = inc.status;
      if (loc.status === 'cancelado' || inc.status === 'cancelado') {
        finalStatus = 'cancelado';
      } else if (locRank > incRank) {
        finalStatus = loc.status;
      }

      const merged = {
        ...inc,
        ...loc,
        status: finalStatus,
        dispatchStatus: loc.dispatchStatus || inc.dispatchStatus,
        assignedDriverName: loc.assignedDriverName || inc.assignedDriverName,
        driverName: loc.driverName || inc.driverName,
        deliveryPin: loc.deliveryPin || inc.deliveryPin,
        trackingToken: loc.trackingToken || inc.trackingToken,
      };
      map.set(key, merged);
    }
  }

  // Remove chaves de orderNumber duplicadas e retorna lista de pedidos unicos
  const uniqueList: any[] = [];
  const seenIds = new Set<string>();
  for (const item of map.values()) {
    if (item && item.id && !seenIds.has(String(item.id))) {
      seenIds.add(String(item.id));
      uniqueList.push(item);
    }
  }

  return uniqueList.sort((a, b) => {
    const tA = new Date(a.createdAtISO || a.createdAt || 0).getTime() || 0;
    const tB = new Date(b.createdAtISO || b.createdAt || 0).getTime() || 0;
    return tB - tA;
  });
}

async function fetchCurrentOrders(targetStoreId?: string | null): Promise<any[]> {
  const storeId = normalizeStoreId(targetStoreId);
  const cacheMap = gOrders.__novaesweb_orders_by_store__ || {};
  const timeMap = gOrders.__novaesweb_orders_by_store_updated_at__ || {};
  const localList = Array.isArray(cacheMap[storeId]) ? cacheMap[storeId] : (storeId === DEFAULT_STORE_ID && Array.isArray(gOrders.__novaesweb_orders__) ? gOrders.__novaesweb_orders__ : []);

  // Se houve gravacao recente local (ultimos 30 segundos), mantem a versao local fresca
  if (localList.length > 0 && timeMap[storeId] && Date.now() - timeMap[storeId] < 30000) {
    return localList;
  }

  const filePath = getOrdersStoragePath(storeId);
  try {
    const { data: fileData, error } = await supabaseAdmin.storage
      .from('novaesweb_store')
      .download(filePath);
    if (!error && fileData) {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        // FUSAO INTELIGENTE: Mescla com o estado local preservando pedidos novos e status avancados
        const merged = mergeOrdersLists(localList, parsed);
        cacheMap[storeId] = merged;
        timeMap[storeId] = Date.now();
        if (storeId === DEFAULT_STORE_ID) {
          gOrders.__novaesweb_orders__ = merged;
          gOrders.__novaesweb_orders_updated_at__ = Date.now();
        }
        return merged;
      }
    }
  } catch {}

  return localList;
}

// Commit the merchant change to the same authoritative state read by dispatch.
async function persistOrderProjection(order: any, storeId: string, changes: Record<string,any>): Promise<any> {
  for (let attempt=0; attempt<3; attempt++) {
    const {state,revision} = await readLogisticsState();
    state.orderProjectionsByStore ||= {};
    state.orderProjectionsByStore[storeId] ||= {};
    const previous = state.orderProjectionsByStore[storeId][String(order.id)];
    if (previous?.deletedAt && !changes.deletedAt) throw new StateStoreError('Este pedido foi removido. Atualize o painel.',404,'ORDER_REMOVED');
    const fresh = projectStoreOrders([order],state,storeId).find(item=>String(item.id)===String(order.id)) || order;
    const payment = previous?.orderProjectionUpdatedAt && Object.prototype.hasOwnProperty.call(previous,'paymentStatus') ? {paymentStatus:previous.paymentStatus} : {};
    const committed = {...fresh,...payment,...changes,orderProjectionUpdatedAt:new Date().toISOString(),
      stageHistory:mergeStageHistory(previous?.stageHistory,fresh.stageHistory)};
    state.orderProjectionsByStore[storeId][String(order.id)] = committed;
    try { await writeLogisticsState(state,revision); return committed; }
    catch(error) { if (!(error instanceof StateStoreError) || error.status !== 409 || attempt===2) throw error; }
  }
}

async function persistOrders(ordersList: any[], targetStoreId?: string | null): Promise<void> {
  const storeId = normalizeStoreId(targetStoreId);
  const cacheMap = gOrders.__novaesweb_orders_by_store__ || {};
  const timeMap = gOrders.__novaesweb_orders_by_store_updated_at__ || {};

  const nowMs = Date.now();
  cacheMap[storeId] = ordersList;
  timeMap[storeId] = nowMs;

  // Sincroniza em todos os caches globais da memória
  gOrders.__novaesweb_orders__ = ordersList;
  gOrders.__novaesweb_orders_updated_at__ = nowMs;
  const gAll = globalThis as any;
  gAll.__novaesweb_orders__ = ordersList;
  gAll.__novaesweb_orders_updated_at__ = nowMs;
  if (!gAll.__novaesweb_orders_by_store__) gAll.__novaesweb_orders_by_store__ = {};
  if (!gAll.__novaesweb_orders_by_store_updated_at__) gAll.__novaesweb_orders_by_store_updated_at__ = {};
  gAll.__novaesweb_orders_by_store__[storeId] = ordersList;
  gAll.__novaesweb_orders_by_store_updated_at__[storeId] = nowMs;

  if (storeId === DEFAULT_STORE_ID) {
    gOrders.__novaesweb_orders__ = ordersList;
    gOrders.__novaesweb_orders_updated_at__ = Date.now();
  }

  const filePath = getOrdersStoragePath(storeId);
  try {
    const payload = JSON.stringify(ordersList);
    await supabaseAdmin.storage
      .from('novaesweb_store')
      .upload(filePath, payload, { upsert: true, contentType: 'application/json' });

    // Se for Bella Pizza, também mantém sincronizado o arquivo raiz orders.json
    if (storeId === DEFAULT_STORE_ID && filePath !== 'orders.json') {
      await supabaseAdmin.storage
        .from('novaesweb_store')
        .upload('orders.json', payload, { upsert: true, contentType: 'application/json' });
    }
  } catch (e) {
    console.error(`Erro ao persistir ${filePath} no Supabase Storage:`, e);
  }
}

async function cleanLogisticsForOrder(
  orderId: string,
  mode: 'cancel_dispatch' | 'cancel_order' | 'delete_order'
): Promise<void> {
  try {
    const {state,revision} = await readLogisticsState();
    let changed = false;
    const targetStr = String(orderId);

    if (Array.isArray(state.offers)) {
      const beforeLen = state.offers.length;
      state.offers = state.offers.filter((off: any) => {
        const directMatch = String(off.orderId) === targetStr || String(off.orderNumber).replace('#', '') === targetStr;
        const nestedMatch =
          Array.isArray(off.orders) &&
          off.orders.some(
            (item: any) =>
              String(item.id || item.orderId) === targetStr ||
              String(item.orderNumber).replace('#', '') === targetStr
          );
        const idsMatch =
          Array.isArray(off.orderIds) && off.orderIds.some((id: any) => String(id) === targetStr);
        return !(directMatch || nestedMatch || idsMatch);
      });
      if (state.offers.length !== beforeLen) {
        changed = true;
      }
    }

    if (Array.isArray(state.assignments)) {
      if (mode === 'delete_order') {
        const beforeLen = state.assignments.length;
        state.assignments = state.assignments.filter(
          (asg: any) =>
            String(asg.orderId) !== targetStr &&
            String(asg.orderNumber).replace('#', '') !== targetStr
        );
        if (state.assignments.length !== beforeLen) changed = true;
      } else if (mode === 'cancel_order' || mode === 'cancel_dispatch') {
        state.assignments.forEach((asg: any) => {
          if (
            (String(asg.orderId) === targetStr ||
              String(asg.orderNumber).replace('#', '') === targetStr) &&
            asg.status !== 'entregue' &&
            asg.status !== 'delivered'
          ) {
            asg.status = 'canceled_by_store';
            changed = true;
          }
        });
      }
    }

    if (changed) {
      await writeLogisticsState(state,revision);
    }
  } catch (e) {
    console.warn('Erro ao sincronizar logistics.json após atualização do pedido:', e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-store-id, x-admin-token',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim();
    const adminCheck = verifyAdminRequest(req);
    const isAdmin = adminCheck.valid;
    const requestedStore = normalizeStoreId(
      req.headers.get('x-store-id') ||
      req.nextUrl.searchParams.get('storeId') ||
      adminCheck.storeId ||
      process.env.NEXT_PUBLIC_STORE_ID
    );
    const rawOrders = await fetchCurrentOrders(requestedStore);
    // A Storage mirror/cache can lag behind an accepted offer. Never serve it alone.
    const {state} = await readLogisticsState();
    const orders = projectStoreOrders(rawOrders,state,requestedStore);

    // 1. Consulta pública individual por token de acompanhamento (/pedido/[token])
    if (token) {
      const found = orders.find(
        (o: any) =>
          o.trackingToken === token ||
          (isAdmin && o.id === token) ||
          (isAdmin && String(o.orderNumber) === token.replace('#', ''))
      );
      if (!found) {
        return NextResponse.json(
          { success: false, error: 'Pedido não encontrado', orders: [] },
          { status: 404, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        { success: true, order: found, orders: [found] },
        { headers: corsHeaders }
      );
    }

    // 2. Listagem completa de pedidos: exige autenticação de Admin (Painel do Lojista)
    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Não autorizado. Desbloqueie o painel do lojista com o PIN.',
          orders: [],
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const storeOrders = orders.filter((o: any) => isSameStore(o.storeId, requestedStore));
    return NextResponse.json({ success: true, orders: storeOrders }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message, orders: [] },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, address, items, subtotal, deliveryFee, total, payment } = body;

    if (!customer?.name || !customer?.phone || !address?.street || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dados obrigatórios do pedido ausentes.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const providedPin =
      typeof body.deliveryPin === 'string' && /^\d{4}$/.test(body.deliveryPin)
        ? body.deliveryPin
        : null;
    const providedNumber =
      Number.isInteger(Number(body.orderNumber)) &&
      Number(body.orderNumber) >= 1000 &&
      Number(body.orderNumber) <= 999999
        ? Number(body.orderNumber)
        : null;
    const trackingToken = `tk-${crypto.randomBytes(32).toString('hex')}`;
    const pin = providedPin || String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const storeId = normalizeStoreId(
      body.storeId ||
      req.headers.get('x-store-id') ||
      process.env.NEXT_PUBLIC_STORE_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_STORE_ID
    );
    const orderNumber = providedNumber || Math.floor(1000 + Math.random() * 9000);

    const itemsSummary = items
      .map((i: any) => {
        if (i.type === 'pizza') {
          const flvs = i.flavors
            ? i.flavors.map((f: any) => f.name).join(' + ')
            : 'Pizza Personalizada';
          return `${i.quantity}x Pizza ${i.size?.name || ''} (${flvs})`;
        }
        return `${i.quantity}x ${i.name}`;
      })
      .join(' • ');

    const itemsDetail = items.map((i: any) => ({
      type: i.type,
      name: i.type === 'pizza' ? 'Pizza' : i.name || 'Item',
      quantity: Number(i.quantity) || 1,
      size: i.size?.name || null,
      flavors: Array.isArray(i.flavors) ? i.flavors.map((f: any) => f.name) : [],
      crust: i.crust?.name || null,
      unitPrice: Number(i.unitPrice) || 0,
      totalPrice: Number(i.totalPrice) || 0,
    }));

    const newOrderObj = {
      id: `ord-${Date.now()}-${orderNumber}`,
      orderNumber,
      storeId,
      customerName: customer.name,
      phone: customer.phone,
      address: `${address.street}, ${address.number} ${address.complement ? '- ' + address.complement : ''}`,
      region: address.neighborhood || address.region || 'Centro',
      city: address.city || 'Canoas',
      state: address.state || 'RS',
      cep: address.cep || '',
      itemsSummary,
      total: Number(total) || 0,
      status: 'recebido',
      dispatchStatus: 'disponivel',
      paymentMethod: payment?.method || 'pix_manual',
      paymentStatus:
        payment?.method === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
      deliveryPin: pin,
      trackingToken,
      driverName: null,
      assignedDriverName: null,
      createdAt: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      createdAtISO: new Date().toISOString(),
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : '',
      subtotal: Number(subtotal) || 0,
      deliveryFee: Number(deliveryFee) || 0,
      changeFor: payment?.changeFor ?? null,
      addressDetail: {
        street: address.street || '',
        number: address.number || '',
        complement: address.complement || '',
        reference: address.reference || '',
        region: address.neighborhood || address.region || '',
        neighborhood: address.neighborhood || address.region || '',
        city: address.city || 'Canoas',
        state: address.state || 'RS',
        cep: address.cep || '',
      },
      items: itemsDetail,
    };

    const current = await fetchCurrentOrders(storeId);

    // Idempotência: se o mesmo pedido (número + telefone) já existe, não duplica
    const duplicate = current.find(
      (o) =>
        Number(o.orderNumber) === orderNumber &&
        String(o.phone) === String(customer.phone)
    );
    if (duplicate) {
      return NextResponse.json(
        {
          success: true,
          orderId: duplicate.id,
          orderNumber: duplicate.orderNumber,
          trackingToken: duplicate.trackingToken,
          deliveryPin: duplicate.deliveryPin,
          status: duplicate.status,
          duplicate: true,
          createdAt: new Date().toISOString(),
        },
        { headers: corsHeaders }
      );
    }

    const updated = [newOrderObj, ...current.filter((o) => o.id !== newOrderObj.id)];
    await persistOrders(updated, storeId);

    // Tenta persistir nas tabelas relacionais se existirem
    try {
      const { data: customerData } = await supabaseAdmin
        .from('customers')
        .insert({ store_id: storeId, name: customer.name, phone: customer.phone })
        .select()
        .single();

      if (customerData) {
        const { data: orderData } = await supabaseAdmin
          .from('orders')
          .insert({
            store_id: storeId,
            order_number: orderNumber,
            customer_id: customerData.id,
            tracking_token: trackingToken,
            status: 'recebido',
            fulfillment_type: 'delivery',
            address_snapshot_json: address,
            subtotal,
            delivery_fee: deliveryFee,
            total,
            customer_notes: body.notes || null,
          })
          .select()
          .single();

        if (orderData) {
          await supabaseAdmin
            .from('delivery_confirmation_secrets')
            .insert({
              store_id: storeId,
              order_id: orderData.id,
              pin_hash: pinHash,
              max_attempts: 5,
            });

          await supabaseAdmin.from('payments').insert({
            store_id: storeId,
            order_id: orderData.id,
            method: payment?.method || 'pix_manual',
            status:
              payment?.method === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
            amount: total,
            change_for: payment?.changeFor || null,
          });
        }
      }
    } catch {
      // Fallback garantido pelo Supabase Storage
    }

    return NextResponse.json(
      {
        success: true,
        orderId: newOrderObj.id,
        orderNumber,
        trackingToken,
        deliveryPin: pin,
        status: 'recebido',
        createdAt: new Date().toISOString(),
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 400, headers: corsHeaders }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyAdminRequest(req).valid) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login no painel do lojista.' },
        { status: 401, headers: corsHeaders }
      );
    }

    const {
      orderId: rawOrderId,
      id: rawId,
      status,
      paymentStatus,
      driverName,
      dispatchStatus,
      assignedDriverName,
      offerGroupId,
      cancellationReason,
      canceledAt,
    } = await req.json();
    const orderId = rawOrderId || rawId;

    const patchStoreId = normalizeStoreId(
      req.headers.get('x-store-id') ||
      req.nextUrl.searchParams.get('storeId') ||
      process.env.NEXT_PUBLIC_STORE_ID
    );
    const {state:patchState} = await readLogisticsState();
    let current = projectStoreOrders(await fetchCurrentOrders(patchStoreId),patchState,patchStoreId).map(order=>({...order}));
    let orderIndex = current.findIndex(
      (o) => o.id === orderId || String(o.orderNumber).replace('#', '') === String(orderId).replace('#', '')
    );

    // Se nao achou no arquivo da loja especifica, busca no arquivo raiz orders.json
    if (orderIndex === -1 && patchStoreId !== DEFAULT_STORE_ID) {
      const rootOrders = projectStoreOrders(await fetchCurrentOrders(DEFAULT_STORE_ID),patchState,patchStoreId);
      const rootIdx = rootOrders.findIndex(
        (o) => o.id === orderId || String(o.orderNumber).replace('#', '') === String(orderId).replace('#', '')
      );
      if (rootIdx !== -1) {
        current = rootOrders.map(order=>({...order}));
        orderIndex = rootIdx;
      }
    }

    if (orderIndex !== -1) {
      const changes: Record<string,any> = {};
      if (status) changes.status = status;
      if (paymentStatus) changes.paymentStatus = paymentStatus;
      for (const [key,value] of Object.entries({driverName,dispatchStatus,assignedDriverName,offerGroupId,cancellationReason,canceledAt})) {
        if (value !== undefined) changes[key] = value;
      }
      current[orderIndex] = await persistOrderProjection(current[orderIndex], patchStoreId, changes);
      await persistOrders(current, patchStoreId);
    }

    // Sincroniza cancelamentos de pedido ou de despacho no logistics.json no servidor
    if (status === 'cancelado') {
      await cleanLogisticsForOrder(orderId, 'cancel_order');
    } else if (dispatchStatus === 'disponivel') {
      await cleanLogisticsForOrder(orderId, 'cancel_dispatch');
    }

    return NextResponse.json(
      { success: true, message: 'Pedido atualizado com sucesso' },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!verifyAdminRequest(req).valid) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login no painel do lojista.' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId || req.nextUrl.searchParams.get('id');
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId é obrigatório' },
        { status: 400, headers: corsHeaders }
      );
    }

    const deleteStore = normalizeStoreId(verifyAdminRequest(req).storeId);
    const {state} = await readLogisticsState();
    const current = projectStoreOrders(await fetchCurrentOrders(deleteStore),state,deleteStore);
    const target = current.find(o => o.id === orderId || String(o.orderNumber) === String(orderId));
    if (target) await persistOrderProjection(target,deleteStore,{deletedAt:new Date().toISOString()});
    const filtered = current.filter(o => o.id !== target?.id);
    await persistOrders(filtered,deleteStore);
    if (target) await cleanLogisticsForOrder(target.id, 'delete_order');

    return NextResponse.json(
      { success: true, message: 'Pedido removido com sucesso' },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
