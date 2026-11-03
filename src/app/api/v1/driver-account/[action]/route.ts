import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSessionError, checkAccountRateLimit, loginDriverAccount,
  logoutDriverAccount, requireAccountSession,
} from '@/lib/auth/driver-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error: unknown) {
  if (error instanceof AccountSessionError) {
    return json({ success: false, error: error.message, code: error.code }, error.status);
  }
  return json({ success: false, error: 'Não foi possível acessar sua conta. Tente novamente.', code: 'ACCOUNT_UNAVAILABLE' }, 503);
}

export async function GET(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (action === 'verify-code' || action === 'register') return json({ success: false, error: 'Use Primeiro acesso com seu telefone e o código enviado pelo lojista.', code: 'FIRST_ACCESS_REQUIRED' }, 410);
    if (action !== 'me') return json({ success: false, error: 'Operação não encontrada.' }, 404);
    return json({ success: true, account: await requireAccountSession(req) });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (action === 'register' || action === 'verify-code') return json({ success: false, error: 'Use Primeiro acesso com seu telefone e o código enviado pelo lojista.', code: 'FIRST_ACCESS_REQUIRED' }, 410);
    if (action === 'logout') {
      await logoutDriverAccount(req);
      return json({ success: true });
    }
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 8192) return json({ success: false, error: 'Dados muito grandes.' }, 413);
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: 'Dados inválidos.' }, 400); }

    if (action !== 'login') return json({ success: false, error: 'Operação não encontrada.' }, 404);
    await checkAccountRateLimit(req, body?.identifier);
    const result = await loginDriverAccount(body);
    return json({ success: true, ...result });
  } catch (error) { return failure(error); }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
