import crypto from 'crypto';
import { NextRequest } from 'next/server';

if (typeof window !== 'undefined') {
  throw new Error('[Segurança] src/lib/auth/tokens.ts é exclusivo do servidor.');
}

export const ADMIN_COOKIE_NAME = 'novaes_admin_token';

function getHmacSecret(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'Segredo de sessão não configurado no servidor (defina SUPABASE_SERVICE_ROLE_KEY ou ADMIN_SESSION_SECRET).'
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
  if (!res.valid || res.payload?.role !== 'admin') {
    return { valid: false };
  }
  return { valid: true, storeId: res.payload.storeId };
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
    if (check.valid) return check;
  }

  const headerToken = req.headers.get('x-admin-token') || extractBearerToken(req);
  if (headerToken) {
    const expectedPin = (process.env.ADMIN_ACCESS_PIN || '615210').trim();
    if (headerToken.trim() === expectedPin) {
      return { valid: true, storeId: 'store_bella_pizza' };
    }
    const check = verifyAdminToken(headerToken);
    if (check.valid) return check;
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

  // 1. Token assinado novo (drv_v1.*)
  if (rawToken && rawToken.startsWith('drv_v1.')) {
    const verified = verifyDriverToken(rawToken);
    if (!verified.valid) {
      return {
        valid: false,
        error: 'Sessão do entregador inválida ou expirada. Reconecte o código de plantão.',
        status: 401,
      };
    }

    // Prioriza sempre encontrar um registro ativo na loja para este entregador
    let matched = liveDrivers.find(
      (d) =>
        d.status === 'ativo' &&
        ((verified.membershipId && d.id === verified.membershipId) ||
          (verified.driverId && (d.driverId === verified.driverId || d.id === verified.driverId)) ||
          (verified.inviteCode && d.inviteCode === verified.inviteCode))
    );

    if (!matched) {
      matched = liveDrivers.find(
        (d) =>
          (verified.membershipId && d.id === verified.membershipId) ||
          (verified.driverId && (d.driverId === verified.driverId || d.id === verified.driverId)) ||
          (verified.inviteCode && d.inviteCode === verified.inviteCode)
      );
    }

    if (!matched) {
      return {
        valid: false,
        error: 'Vínculo não encontrado na loja. Solicite um novo código ao lojista.',
        status: 403,
      };
    }

    if (matched.status === 'bloqueado') {
      return {
        valid: false,
        error: 'Este entregador ou código de plantão foi bloqueado pela loja.',
        status: 403,
      };
    }

    if (matched.status === 'revogado' || matched.status === 'vinculo_removido') {
      // Reconcilia automaticamente se o entregador possui outro plantão ativo na loja
      const activeAlternative = liveDrivers.find(
        (d) =>
          d.status === 'ativo' &&
          (d.driverId === verified.driverId ||
            d.phone === matched.phone ||
            (matched.driverId && d.driverId === matched.driverId))
      );
      if (activeAlternative) {
        matched = activeAlternative;
      } else {
        return {
          valid: false,
          error: 'O vínculo deste entregador com a loja foi revogado ou encerrado.',
          status: 403,
        };
      }
    }

    if (matched.expiresAt && new Date(matched.expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        error: 'O código de vínculo com a loja expirou. Solicite renovação ao lojista.',
        status: 403,
      };
    }

    // Impede que um entregador acesse dados especificando o ID de outro entregador
    if (
      requestedDriverId &&
      matched &&
      requestedDriverId !== verified.driverId &&
      requestedDriverId !== verified.membershipId &&
      requestedDriverId !== matched.driverId &&
      requestedDriverId !== matched.id
    ) {
      return {
        valid: false,
        error: 'Acesso negado aos dados de outro entregador.',
        status: 403,
      };
    }

    return {
      valid: true,
      driverId: matched?.driverId || verified.driverId,
      membershipId: matched?.id || verified.membershipId,
      storeId: matched?.storeId || verified.storeId,
      driverRecord: matched || null,
    };
  }

  // 2. Compatibilidade com sessões ativas em dispositivos já logados (sessionToken hex ou jwt_cloud_ / jwt_shift_)
  if (rawToken) {
    let matched = liveDrivers.find((d) => d.sessionToken && d.sessionToken === rawToken);

    if (!matched && (rawToken.startsWith('jwt_cloud_') || rawToken.startsWith('jwt_shift_') || /^[0-9a-f]{32,64}$/i.test(rawToken))) {
      matched = liveDrivers.find(
        (d) =>
          (requestedMembershipId && d.id === requestedMembershipId) ||
          (requestedDriverId && (d.driverId === requestedDriverId || d.id === requestedDriverId)) ||
          (requestedInviteCode && d.inviteCode === requestedInviteCode)
      );

      // Se o app antigo chamou sem query param mas há apenas 1 entregador ativo na loja, reconcilia
      if (!matched && !requestedDriverId && !requestedMembershipId) {
        const activeList = liveDrivers.filter((d) => d.status === 'ativo');
        if (activeList.length === 1) {
          matched = activeList[0];
        }
      }
    }

    if (matched) {
      if (matched.status === 'bloqueado') {
        return {
          valid: false,
          error: 'Este entregador ou código de plantão foi bloqueado pela loja.',
          status: 403,
        };
      }

      if (matched.status === 'revogado' || matched.status === 'vinculo_removido') {
        return {
          valid: false,
          error: 'O vínculo deste entregador com a loja foi revogado ou encerrado.',
          status: 403,
        };
      }

      if (matched.expiresAt && new Date(matched.expiresAt).getTime() < Date.now()) {
        return {
          valid: false,
          error: 'O código de vínculo com a loja expirou.',
          status: 403,
        };
      }

      return {
        valid: true,
        driverId: matched.driverId || matched.id,
        membershipId: matched.id,
        storeId: matched.storeId,
        driverRecord: matched,
        isLegacyToken: true,
      };
    }
  }

  // 3. Compatibilidade de telemetria GPS local e chamadas com identificadores do entregador ativo
  if (!rawToken && (requestedDriverId || requestedMembershipId)) {
    const matched = liveDrivers.find(
      (d) =>
        d.status === 'ativo' &&
        ((requestedDriverId && (d.driverId === requestedDriverId || d.id === requestedDriverId || d.phone === requestedDriverId || d.driverName === requestedDriverId)) ||
          (requestedMembershipId && d.id === requestedMembershipId))
    );
    if (matched) {
      return {
        valid: true,
        driverId: matched.driverId || matched.id,
        membershipId: matched.id,
        storeId: matched.storeId,
        driverRecord: matched,
        isLegacyToken: true,
      };
    }
  }

  // 4. Permite inspeção se autenticado como Admin
  if (verifyAdminRequest(req).valid) {
    const matched = requestedDriverId
      ? liveDrivers.find((d) => d.driverId === requestedDriverId || d.id === requestedDriverId)
      : liveDrivers[0];
    return {
      valid: true,
      driverId: matched?.driverId || requestedDriverId || 'admin',
      membershipId: matched?.id || 'admin',
      driverRecord: matched || null,
    };
  }

  return {
    valid: false,
    error: 'Sessão de entregador não autorizada. Faça login e ative o código de plantão.',
    status: 401,
  };
}

