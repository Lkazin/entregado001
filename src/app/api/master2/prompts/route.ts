import { NextRequest, NextResponse } from 'next/server';
import { MASTER2_COOKIE, verifyMaster2Session } from '@/lib/auth/master2';
import { generateInstallationPrompts } from '@/lib/master2-prompts';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!verifyMaster2Session(request.cookies.get(MASTER2_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Sessão inválida. Entre novamente.' }, { status: 401, headers });
  }
  try {
    const body = await request.text();
    if (body.length > 4096) return NextResponse.json({ error: 'Referências muito longas.' }, { status: 413, headers });
    return NextResponse.json({ prompts: generateInstallationPrompts(JSON.parse(body)) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Dados inválidos.' : (error as Error).message }, { status: 400, headers });
  }
}
