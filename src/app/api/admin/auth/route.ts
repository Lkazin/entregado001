import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  signAdminToken,
  verifyAdminRequest,
} from '@/lib/auth/tokens';

export const dynamic = 'force-dynamic';

// Controle simples de tentativas por IP em memória para proteção contra força bruta no PIN
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}

export async function GET(req: NextRequest) {
  const check = verifyAdminRequest(req);
  if (!check.valid) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    authenticated: true,
    storeId: check.storeId,
  });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = attemptsByIp.get(ip);

    if (record && now < record.resetAt && record.count >= 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas tentativas incorretas. Aguarde 1 minuto e tente novamente.',
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const candidatePin = String(body?.pin || '').trim();
    const expectedPin = (process.env.ADMIN_ACCESS_PIN || '615210').trim();

    if (!candidatePin || candidatePin !== expectedPin) {
      const nextCount = record && now < record.resetAt ? record.count + 1 : 1;
      attemptsByIp.set(ip, { count: nextCount, resetAt: now + 60_000 });
      return NextResponse.json(
        {
          success: false,
          error: 'Código de acesso incorreto. Tente novamente.',
        },
        { status: 401 }
      );
    }

    attemptsByIp.delete(ip);
    const token = signAdminToken();

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      token,
    });

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24, // 24h
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Erro interno na autenticação.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, authenticated: false });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}

