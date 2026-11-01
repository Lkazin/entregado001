import { NextRequest, NextResponse } from 'next/server';
import { AccountSessionError } from '@/lib/auth/driver-account';
import { issueFirstAccess, startFirstAccess, completeFirstAccess, revokeFirstAccess, listFirstAccess } from '@/lib/auth/driver-first-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function failure(error: unknown) {
  if (error instanceof AccountSessionError) return json({ success: false, error: error.message, code: error.code }, error.status);
  return json({ success: false, error: 'Não foi possível concluir o primeiro acesso. Tente novamente.', code: 'FIRST_ACCESS_UNAVAILABLE' }, 503);
}
export async function GET(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    if ((await context.params).action !== 'list') return json({ success: false, error: 'Operação não encontrada.' }, 404);
    return json({ success: true, invites: await listFirstAccess(req) });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (!['issue', 'start', 'complete', 'revoke'].includes(action)) return json({ success: false, error: 'Operação não encontrada.' }, 404);
    if (Number(req.headers.get('content-length') || 0) > 8192) return json({ success: false, error: 'Dados muito grandes.' }, 413);
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: 'Dados inválidos.' }, 400); }
    if (action === 'issue') return json({ success: true, ...await issueFirstAccess(req, body) });
    if (action === 'start') return json({ success: true, ...await startFirstAccess(req, body) });
    if (action === 'complete') return json({ success: true, ...await completeFirstAccess(req, body) });
    await revokeFirstAccess(req, body);
    return json({ success: true });
  } catch (error) { return failure(error); }
}
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
