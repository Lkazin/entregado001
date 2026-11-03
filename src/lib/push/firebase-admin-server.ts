import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';

let firebaseInitialized = false;

function initFirebaseAdmin(): boolean {
  if (firebaseInitialized) return true;
  if (getApps().length > 0) {
    firebaseInitialized = true;
    return true;
  }

  try {
    // 1. Tenta carregar do arquivo credentials/firebase-admin.json
    const certPath = path.resolve(process.cwd(), 'credentials/firebase-admin.json');
    if (fs.existsSync(certPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(certPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'novaesweb-47551',
      });
      firebaseInitialized = true;
      console.log('[FirebaseAdmin] Inicializado com sucesso a partir de credentials/firebase-admin.json');
      return true;
    }

    // 2. Fallback de variável de ambiente FIREBASE_SERVICE_ACCOUNT
    const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envJson) {
      const serviceAccount = JSON.parse(envJson);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'novaesweb-47551',
      });
      firebaseInitialized = true;
      return true;
    }

    console.warn('[FirebaseAdmin] Credenciais de serviço do Firebase não encontradas.');
    return false;
  } catch (err) {
    console.error('[FirebaseAdmin] Erro ao inicializar Firebase Admin:', err);
    return false;
  }
}

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  url?: string;
}

export async function sendFcmNotification(
  token: string,
  payload: FcmPayload
): Promise<{ success: boolean; expired?: boolean; messageId?: string; error?: string }> {
  if (!initFirebaseAdmin()) {
    return { success: false, error: 'Firebase Admin não configurado no servidor.' };
  }

  try {
    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [key, val] of Object.entries(payload.data)) {
        stringData[key] = typeof val === 'string' ? val : JSON.stringify(val);
      }
    }
    if (payload.url) {
      stringData.url = payload.url;
    }

    const message: Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'pedidos_entregas',
          sound: 'default',
          priority: 'max',
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
    };

    const messaging = getMessaging();
    const messageId = await messaging.send(message);
    return { success: true, messageId };
  } catch (err: any) {
    const code = err?.code || '';
    const isExpired =
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token';

    console.warn(`[FirebaseAdmin] Erro ao enviar FCM para token ${token.slice(0, 15)}...:`, err?.message);
    return {
      success: false,
      expired: isExpired,
      error: err?.message || 'Falha ao enviar notificação FCM.',
    };
  }
}
