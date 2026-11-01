import crypto from 'crypto';
import { NextRequest } from 'next/server';

if (typeof window !== 'undefined') {
  throw new Error('[Segurança] src/lib/auth/tokens.ts é exclusivo do servidor.');
}

export const ADMIN_COOKIE_NAME = 'novaes_admin_token';

function normalizedStoreId(value?: string | null): string {
  const storeId = typeof value === 'string' ? value.trim() : '';
  return ['11111111-1111-1111-1111-111111111111','bella-pizza','store_bella_pizza'].includes(storeId)
    ? 'store_bella_pizza' : storeId;
}

function adminStoreMatches(req: NextRequest, storeId?: string): boolean {
  const authorizedStore = normalizedStoreId(storeId);
  if (!authorizedStore) return false;
  return [req.headers.get('x-store-id'), req.nextUrl?.searchParams.get('storeId')]
    .every(requested => !requested || normalizedStoreId(requested) === authorizedStore);
}

function getHmacSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'Defina ADMIN_SESSION_SECRET privado com pelo menos 32 caracteres no servidor.'
    );
  }
  return secret;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function signPayload(prefix: 'adm_v1' | 'drv_v1', payload: Record<string, any>): string {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`${prefix}.${payloadB64}`)
    .digest();
  const sigB64 = base64UrlEncode(sig);
  return `${prefix}.${payloadB64}.${sigB64}`;
}

function verifySignedToken(
  expectedPrefix: 'adm_v1' | 'drv_v1',
  token?: string | null
): { valid: boolean; payload?: any } {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== expectedPrefix) {
    return { valid: false };
  }
  const [prefix, payloadB64, sigB64] = parts;
  try {
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', getHmacSecret())
        .update(`${prefix}.${payloadB64}`)
        .digest()
    );
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }
    const parsed = JSON.parse(base64UrlDecode(payloadB64));
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return { valid: false };
    }
    return { valid: true, payload: parsed };
  } catch {
    return { valid: false };
  }
}

export function signAdminToken(
  storeId = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || '11111111-1111-1111-1111-111111111111',
  ttlMs = 24 * 60 * 60 * 1000
): string {
  const now = Date.now();
  return signPayload('adm_v1', {
    role: 'admin',
    storeId,
    iat: now,
    exp: now + ttlMs,
  });
}

export function verifyAdminToken(token?: string | null): { valid: boolean; storeId?: string } {
  const res = verifySignedToken('adm_v1', token);
  if (!res.valid || res.payload?.role !== 'admin' || !normalizedStoreId(res.payload?.storeId)) {
    return { valid: false };
  }
  return { valid: true, storeId: normalizedStoreId(res.payload.storeId) };
}

export function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function verifyAdminRequest(req: NextRequest): { valid: boolean; storeId?: string } {
  const cookieToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (cookieToken) {
    const check = verifyAdminToken(cookieToken);
    if (check.valid && adminStoreMatches(req, check.storeId)) return check;
  }

  const headerToken = req.headers.get('x-admin-token') || extractBearerToken(req);
  if (headerToken) {
    const check = verifyAdminToken(headerToken);
    if (check.valid && adminStoreMatches(req, check.storeId)) return check;
  }

  return { valid: false };
}

export function signDriverToken(params: {
  driverId: string;
  membershipId: string;
  inviteCode?: string;
  storeId?: string;
  ttlMs?: number;
}): string {
  const now = Date.now();
  const ttl = params.ttlMs || 24 * 60 * 60 * 1000;
  return signPayload('drv_v1', {
    role: 'driver',
    driverId: params.driverId,
    membershipId: params.membershipId,
    inviteCode: params.inviteCode || null,
    storeId: params.storeId || '11111111-1111-1111-1111-111111111111',
    iat: now,
    exp: now + ttl,
  });
}

export function verifyDriverToken(token?: string | null): {
  valid: boolean;
  driverId?: string;
  membershipId?: string;
  inviteCode?: string;
  storeId?: string;
} {
  const res = verifySignedToken('drv_v1', token);
  if (!res.valid || res.payload?.role !== 'driver') {
    return { valid: false };
  }
  return {
    valid: true,
    driverId: res.payload.driverId,
    membershipId: res.payload.membershipId,
    inviteCode: res.payload.inviteCode,
    storeId: res.payload.storeId,
  };
}

export function verifyDriverRequest(
  req: NextRequest,
  liveDrivers: any[],
  body?: any
): {
  valid: boolean;
  driverId?: string;
  membershipId?: string;
  storeId?: string;
  driverRecord?: any;
  isLegacyToken?: boolean;
  error?: string;
  status?: number;
} {
  const rawToken =
    extractBearerToken(req) ||
    req.headers.get('x-session-token') ||
    (typeof body?.sessionToken === 'string' ? body.sessionToken : null);

  const requestedDriverId =
    req.headers.get('x-driver-id') ||
    req.nextUrl.searchParams.get('driverId') ||
    body?.driverId ||
    body?.id ||
    null;

  const requestedMembershipId =
    req.nextUrl.searchParams.get('membershipId') ||
    body?.membershipId ||
    null;

  const requestedInviteCode =
    req.headers.get('x-invite-code') ||
    req.nextUrl.searchParams.get('inviteCode') ||
    body?.inviteCode ||
    null;

  // Operações logísticas exigem um token assinado exato do vínculo.
  // A sessão exclusiva da conta é verificada separadamente em cada requisição.
  const admin = verifyAdminRequest(req);
  if (admin.valid) {
    const authorizedStore = normalizedStoreId(admin.storeId);
    if (body?.storeId && normalizedStoreId(body.storeId) !== authorizedStore) {
      return { valid: false, status: 403, error: 'Acesso negado aos dados de outra loja.' };
    }
    const hasDriverTarget = Boolean(requestedDriverId || requestedMembershipId);
    const matched = liveDrivers.find(d => normalizedStoreId(d.storeId) === authorizedStore &&
      (!requestedMembershipId || d.id === requestedMembershipId) &&
      (!requestedDriverId || d.driverId === requestedDriverId || d.id === requestedDriverId));
    if (hasDriverTarget && !matched) return { valid: false, status: 403, error: 'Entregador não encontrado na loja autorizada.' };
    return { valid: true, driverId: matched?.driverId || matched?.id || 'admin', membershipId: matched?.id || 'admin',
      storeId: authorizedStore, driverRecord: matched || null };
  }
  const verified = verifyDriverToken(rawToken);
  if (!verified.valid) return {valid:false,status:401,error:'Entre na sua conta e conecte-se à loja para continuar.'};
  const matched = liveDrivers.find(d => d.id === verified.membershipId && (d.driverId || d.id) === verified.driverId && d.storeId === verified.storeId);
  if (!matched) return {valid:false,status:403,error:'Vínculo não encontrado na loja.'};
  if (['bloqueado','revogado','vinculo_removido'].includes(matched.status)) return {valid:false,status:403,error:'O vínculo foi bloqueado ou encerrado pela loja.'};
  if (matched.expiresAt && Date.parse(matched.expiresAt) <= Date.now()) return {valid:false,status:403,error:'O vínculo com a loja expirou. Solicite renovação.'};
  if ((requestedDriverId && requestedDriverId !== verified.driverId && requestedDriverId !== verified.membershipId) ||
      (requestedMembershipId && requestedMembershipId !== verified.membershipId) ||
      (req.headers.get('x-store-id') && req.headers.get('x-store-id') !== verified.storeId)) {
    return {valid:false,status:403,error:'Acesso negado aos dados de outro entregador ou loja.'};
  }
  return {valid:true,driverId:verified.driverId,membershipId:verified.membershipId,storeId:verified.storeId,driverRecord:matched};
}
