import { NextRequest, NextResponse } from 'next/server';
import { requireAccountSession, AccountSessionError } from '@/lib/auth/driver-account';
import {
  getVapidPublicKey,
  isWebPushEnabled,
  saveDriverSubscription,
  removeDriverSubscription,
  sendPushToDriverAccount,
} from '@/lib/push/web-push-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function failure(error: unknown) {
  if (error instanceof AccountSessionError) {
    return json({ success: false, error: error.message, code: error.code }, error.status);
  }
  return json(
    { success: false, error: 'Não foi possível processar a notificação push.', code: 'PUSH_ERROR' },
    500
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  try {
    const { action } = await context.params;

    if (action === 'vapid-public-key' || action === 'config') {
      const publicKey = getVapidPublicKey();
      const enabled = isWebPushEnabled();
      return json({
        success: true,
        publicKey,
        enabled,
      });
    }

    return json({ success: false, error: 'Operação não encontrada.' }, 404);
  } catch (err) {
    return failure(err);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  try {
    const { action } = await context.params;

    // 1. Obter configuração pública (sem exigir autenticação)
    if (action === 'vapid-public-key' || action === 'config') {
      return json({
        success: true,
        publicKey: getVapidPublicKey(),
        enabled: isWebPushEnabled(),
      });
    }

    // 2. Ações autenticadas exigem sessão ativa da conta do motoboy
    const account = await requireAccountSession(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: 'Dados JSON inválidos.' }, 400);
    }

    if (action === 'subscribe') {
      const fcmToken = body?.fcmToken || body?.token;
      if (fcmToken && typeof fcmToken === 'string') {
        const endpoint = 'fcm:' + fcmToken.trim();
        const userAgent = req.headers.get('user-agent') || body?.userAgent || '';
        const saved = await saveDriverSubscription(
          account.id,
          {
            endpoint,
            keys: { p256dh: 'fcm', auth: 'fcm' },
            fcmToken: fcmToken.trim(),
          },
          {
            userAgent,
            deviceType: 'android',
          }
        );
        return json({
          success: saved,
          registered: saved,
          accountId: account.id,
          platform: 'fcm',
        });
      }

      const subscription = body?.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json(
          {
            success: false,
            error: 'Dados de inscrição push inválidos (endpoint ou keys ausentes).',
          },
          400
        );
      }

      const userAgent = req.headers.get('user-agent') || body?.userAgent || '';
      const deviceType = body?.deviceType || (userAgent.includes('Android') ? 'android' : userAgent.includes('iPhone') ? 'ios' : 'desktop');

      const saved = await saveDriverSubscription(account.id, subscription, {
        userAgent,
        deviceType,
      });

      return json({
        success: saved,
        registered: saved,
        accountId: account.id,
      });
    }

    if (action === 'unsubscribe') {
      const endpoint = body?.endpoint;
      const removed = await removeDriverSubscription(account.id, endpoint);
      return json({
        success: true,
        unsubscribed: removed,
      });
    }

    if (action === 'test') {
      const result = await sendPushToDriverAccount(account.id, {
        title: '🔔 Teste de Notificação NovaesWeb',
        body: 'As notificações push estão configuradas e funcionando perfeitamente no seu aparelho!',
        icon: '/icon-192.png',
        badge: '/favicon.svg',
        tag: `test-push-${Date.now()}`,
        url: '/',
        data: {
          type: 'TEST_PUSH',
          timestamp: Date.now(),
        },
      });

      return json({
        success: true,
        message: result.sent > 0
          ? 'Notificação de teste enviada com sucesso!'
          : 'Nenhum dispositivo ativo encontrado para receber o teste. Ative as notificações no botão acima.',
        sent: result.sent,
        failed: result.failed,
      });
    }

    return json({ success: false, error: 'Operação não encontrada.' }, 404);
  } catch (err) {
    return failure(err);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-account-session, x-session-token, x-store-id',
    },
  });
}

