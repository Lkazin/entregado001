import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readLogisticsState, writeLogisticsState } from '@/lib/logistics/state-store';

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string;
  deviceType?: string;
  accountId?: string;
  updatedAt?: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, any>;
}

// Chaves VAPID padrão do sistema NovaesWeb (para fallback resiliente quando variáveis de ambiente não forem injetadas no host)
export const DEFAULT_VAPID_PUBLIC_KEY =
  'BI07ZQtHW3jjOz1BoDHw8QXL1tjmF1ZxVln2MZSUClRE4Bb4BOU-ahEEqUQkVK9JSeV4ja9enmR3CErXrviab3c';
export const DEFAULT_VAPID_PRIVATE_KEY =
  'NtO_xCaK1aYyWdCxiCICxuM_2TRZtlKi8uVETK7uEY4';
export const DEFAULT_VAPID_SUBJECT =
  'mailto:contato@novaesweb.com.br';

// Inicializa VAPID caso as chaves estejam presentes no ambiente
let vapidConfigured = false;

function ensureVapidConfig(): boolean {
  if (vapidConfigured) return true;

  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY).trim();
  const subject = (process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT).trim();

  if (!publicKey || !privateKey) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error('[WebPush] Erro ao configurar VAPID details:', err);
    return false;
  }
}

export function getVapidPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim();
}

export function isWebPushEnabled(): boolean {
  if (process.env.ENABLE_WEB_PUSH === 'false') return false;
  return ensureVapidConfig();
}

/**
 * Salva ou atualiza a inscrição push do motoboy.
 * Utiliza a tabela 'driver_push_subscriptions' se existir no Supabase,
 * ou mantém persistência no JSON de 'driver_logistics_state' de forma transparente.
 */
export async function saveDriverSubscription(
  accountId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  deviceInfo?: { userAgent?: string; deviceType?: string }
): Promise<boolean> {
  if (!accountId || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return false;
  }

  const endpoint = sub.endpoint.trim();
  const p256dh = sub.keys.p256dh.trim();
  const auth = sub.keys.auth.trim();
  const userAgent = deviceInfo?.userAgent || '';
  const deviceType = deviceInfo?.deviceType || 'unknown';
  const now = new Date().toISOString();

  // 1. Tenta salvar na tabela 'driver_push_subscriptions'
  try {
    const { error: dbError } = await supabaseAdmin.from('driver_push_subscriptions').upsert(
      {
        account_id: accountId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        device_type: deviceType,
        is_active: true,
        updated_at: now,
      },
      { onConflict: 'endpoint' }
    );

    if (!dbError) {
      return true;
    }
  } catch {
    // Se a tabela ainda não foi criada via SQL, prossegue com o fallback persistente
  }

  // 2. Fallback de alta disponibilidade: persiste no 'driver_logistics_state'
  try {
    const { state, revision } = await readLogisticsState();
    const subs: PushSubscriptionData[] = Array.isArray(state.pushSubscriptions)
      ? state.pushSubscriptions
      : [];

    const existingIdx = subs.findIndex((s) => s.endpoint === endpoint);
    const subRecord: PushSubscriptionData = {
      accountId,
      endpoint,
      keys: { p256dh, auth },
      userAgent,
      deviceType,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      subs[existingIdx] = subRecord;
    } else {
      subs.push(subRecord);
    }

    state.pushSubscriptions = subs;
    await writeLogisticsState(state, revision);
    return true;
  } catch (err) {
    console.error('[WebPush] Falha ao persistir inscrição no fallback:', err);
    return false;
  }
}

/**
 * Remove uma inscrição push (ex: ao deslogar ou revogar permissão)
 */
export async function removeDriverSubscription(accountId: string, endpoint?: string): Promise<boolean> {
  if (!accountId) return false;

  try {
    let query = supabaseAdmin.from('driver_push_subscriptions').delete().eq('account_id', accountId);
    if (endpoint) {
      query = query.eq('endpoint', endpoint);
    }
    await query;
  } catch { }

  try {
    const { state, revision } = await readLogisticsState();
    if (Array.isArray(state.pushSubscriptions)) {
      state.pushSubscriptions = state.pushSubscriptions.filter(
        (s: PushSubscriptionData) => s.accountId !== accountId || (endpoint && s.endpoint !== endpoint)
      );
      await writeLogisticsState(state, revision);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtém todas as inscrições push ativas de uma conta de entregador
 */
export async function getActiveSubscriptionsForAccount(accountId: string): Promise<PushSubscriptionData[]> {
  if (!accountId) return [];

  // Tenta obter da tabela
  try {
    const { data, error } = await supabaseAdmin
      .from('driver_push_subscriptions')
      .select('endpoint, p256dh, auth, user_agent, device_type, account_id')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((row) => ({
        accountId: row.account_id,
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
        userAgent: row.user_agent,
        deviceType: row.device_type,
      }));
    }
  } catch { }

  // Fallback: busca em 'driver_logistics_state'
  try {
    const { state } = await readLogisticsState();
    const subs: PushSubscriptionData[] = Array.isArray(state.pushSubscriptions)
      ? state.pushSubscriptions
      : [];

    return subs.filter((s) => s.accountId === accountId && s.endpoint && s.keys?.p256dh);
  } catch {
    return [];
  }
}

/**
 * Dispara uma notificação para uma inscrição específica com tratamento de expiração (404/410)
 */
export async function sendWebPush(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload
): Promise<{ success: boolean; expired?: boolean; statusCode?: number; error?: string }> {
  if (!ensureVapidConfig()) {
    return { success: false, error: 'VAPID não configurado no servidor.' };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'novaesweb-notification',
    url: payload.url || '/',
    data: payload.data || {},
  });

  try {
    const res = await webpush.sendNotification(pushSubscription, payloadString, {
      TTL: 60 * 60, // 1 hora
      urgency: 'high',
    });

    return { success: true, statusCode: res.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode || 0;
    // 404 (Not Found) ou 410 (Gone) indicam que a inscrição expirou no FCM/Apple/Mozilla
    const expired = statusCode === 404 || statusCode === 410;

    if (expired && subscription.accountId) {
      console.warn(`[WebPush] Inscrição expirada detectada (${statusCode}). Removendo endpoint ${subscription.endpoint.slice(0, 40)}...`);
      void removeDriverSubscription(subscription.accountId, subscription.endpoint);
    }

    return {
      success: false,
      statusCode,
      expired,
      error: err?.message || 'Falha ao enviar notificação push.',
    };
  }
}

/**
 * Dispara notificação push para todas as inscrições ativas de uma conta de entregador
 */
export async function sendPushToDriverAccount(
  accountId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getActiveSubscriptionsForAccount(accountId);
  if (!subscriptions.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const res = await sendWebPush(sub, payload);
      if (res.success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  return { sent, failed };
}

/**
 * Dispara notificação push para entregadores autorizados de uma oferta de despacho
 */
export async function notifyDriversOfNewOffer(params: {
  storeId: string;
  storeName: string;
  offerId: string;
  orderNumber?: string;
  deliveryFee?: number;
  totalOrders?: number;
  distributionMode: 'fixed_driver' | 'broadcast_enabled';
  targetDriverId?: string | null;
  eligibleDriverIds?: string[];
  liveDrivers: any[];
}): Promise<{ totalNotified: number }> {
  if (!isWebPushEnabled()) {
    return { totalNotified: 0 };
  }

  const {
    storeId,
    storeName,
    offerId,
    orderNumber,
    deliveryFee,
    totalOrders,
    distributionMode,
    targetDriverId,
    eligibleDriverIds,
    liveDrivers,
  } = params;

  // 1. Localiza os motoristas destinatários
  let targetDrivers: any[] = [];

  if (distributionMode === 'fixed_driver' && targetDriverId) {
    const found = liveDrivers.find(
      (d) => d.id === targetDriverId || d.driverId === targetDriverId
    );
    if (found) targetDrivers = [found];
  } else if (Array.isArray(eligibleDriverIds) && eligibleDriverIds.length > 0) {
    targetDrivers = liveDrivers.filter(
      (d) => eligibleDriverIds.includes(d.id) || (d.driverId && eligibleDriverIds.includes(d.driverId))
    );
  } else {
    // Modo broadcast padrão: todos os entregadores ativos desta loja
    targetDrivers = liveDrivers.filter(
      (d) => d.storeId === storeId && d.status === 'ativo'
    );
  }

  if (!targetDrivers.length) {
    return { totalNotified: 0 };
  }

  // 2. Extrai IDs de conta únicos dos motoristas
  const candidateAccountIds = new Set<string>();
  for (const drv of targetDrivers) {
    if (drv.driverId && drv.driverId.startsWith('3e') || drv.driverId?.length === 36) {
      candidateAccountIds.add(drv.driverId);
    }
  }

  // Se os driverId forem IDs legados, busca na tabela 'driver_account_memberships'
  const membershipIds = targetDrivers.map((d) => d.id).filter(Boolean);
  if (membershipIds.length > 0) {
    try {
      const { data: mems } = await supabaseAdmin
        .from('driver_account_memberships')
        .select('account_id, membership_id')
        .in('membership_id', membershipIds);

      if (Array.isArray(mems)) {
        for (const m of mems) {
          if (m.account_id) candidateAccountIds.add(m.account_id);
        }
      }
    } catch { }
  }

  // Também verifica inscrições salvas no fallback pelo membershipId ou driverId
  try {
    const { state } = await readLogisticsState();
    const subs: PushSubscriptionData[] = Array.isArray(state.pushSubscriptions)
      ? state.pushSubscriptions
      : [];

    for (const sub of subs) {
      if (
        sub.accountId &&
        (candidateAccountIds.has(sub.accountId) ||
          targetDrivers.some((d) => d.id === sub.accountId || d.driverId === sub.accountId))
      ) {
        candidateAccountIds.add(sub.accountId);
      }
    }
  } catch { }

  const accountIdsArray = Array.from(candidateAccountIds);
  if (!accountIdsArray.length) {
    return { totalNotified: 0 };
  }

  // 3. Monta o payload oficial de acordo com a especificação (Requisito 3)
  // Título: Nova entrega disponível!
  // Mensagem: Bella Pizza enviou uma entrega para você. Toque para visualizar.
  const cleanStoreName = (storeName || 'Sua Loja').trim();
  const feeText = deliveryFee ? ` • R$ ${Number(deliveryFee).toFixed(2).replace('.', ',')}` : '';

  const payload: PushNotificationPayload = {
    title: 'Nova entrega disponível!',
    body: `${cleanStoreName} enviou uma entrega para você. Toque para visualizar.${feeText}`,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    tag: `offer-${offerId}`,
    url: `/?offerId=${offerId}&storeId=${encodeURIComponent(storeId)}`,
    data: {
      type: 'NEW_OFFER',
      offerId,
      storeId,
      storeName: cleanStoreName,
      orderNumber: orderNumber || '',
      deliveryFee: deliveryFee ?? 0,
      totalOrders: totalOrders ?? 1,
      createdAt: new Date().toISOString(),
    },
  };

  let totalNotified = 0;

  // Envio assíncrono para todas as contas elegíveis
  await Promise.all(
    accountIdsArray.map(async (accId) => {
      const result = await sendPushToDriverAccount(accId, payload);
      totalNotified += result.sent;
    })
  );

  return { totalNotified };
}

