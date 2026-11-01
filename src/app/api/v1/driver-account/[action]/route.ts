import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSessionError, checkAccountRateLimit, loginDriverAccount,
  logoutDriverAccount, registerDriverAccount, requireAccountSession,
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
    if (action !== 'me') return json({ success: false, error: 'Operação não encontrada.' }, 404);
    return json({ success: true, account: await requireAccountSession(req) });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (action === 'logout') {
      await logoutDriverAccount(req);
      return json({ success: true });
    }
    if (action !== 'register' && action !== 'login') return json({ success: false, error: 'Operação não encontrada.' }, 404);
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 8192) return json({ success: false, error: 'Dados de cadastro muito grandes.' }, 413);
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: 'Dados inválidos.' }, 400); }
    await checkAccountRateLimit(req, action === 'register' ? body?.phone : body?.identifier);
    const result = action === 'register' ? await registerDriverAccount(body) : await loginDriverAccount(body);
    return json({ success: true, ...result });
  } catch (error) { return failure(error); }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
