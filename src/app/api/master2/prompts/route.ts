import { NextRequest, NextResponse } from 'next/server';
import { MASTER2_COOKIE, verifyMaster2Session } from '@/lib/auth/master2';
import { generateInstallationPrompts } from '@/lib/master2-prompts';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return reply({ error: 'Origem não autorizada.' }, 403);
  }
  if (!await verifyMaster2Session(request.cookies.get(MASTER2_COOKIE)?.value)) {
    return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  }
  try {
    const body = await request.text();
    if (body.length > 4096) return reply({ error: 'Referências muito longas.' }, 413);
    const input: unknown = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Selecione uma loja recebida oficialmente.' }, 400);
    const source = input as Record<string, unknown>;
    const id = source.id;
    if (typeof id !== 'string' || !uuid.test(id)) return reply({ error: 'UUID oficial inválido.' }, 400);

    // Não confiar em plano, nome, grupo ou IDs de projeto enviados pelo navegador.
    // A emissão de prompts exige recebimento oficial no Master 2.
    const { data, error } = await supabaseAdmin.from('master2_received_stores')
      .select('id,status,revision,profile').eq('id', id.toLowerCase()).maybeSingle();
    if (error) return reply({ error: 'Não foi possível validar a loja no Master 2.' }, 503);
    if (!data || !data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) {
      return reply({ error: 'Loja não recebida oficialmente. Envie pelo Master 1 antes de gerar prompts.' }, 403);
    }
    const profile = data.profile as Record<string, unknown>;
    if (!['business', 'premium'].includes(String(profile.plan))) {
      return reply({ error: 'Plano oficial não elegível ao Kit Entregador.' }, 403);
    }
    const prompts = generateInstallationPrompts({
      id: data.id, name: profile.name, plan: profile.plan,
      group: profile.group, staging: profile.staging, production: profile.production,
      findings: source.findings,
    });
    return reply({ prompts, verifiedReceipt: true, officialRevision: data.revision });
  } catch (error) {
    return reply({ error: error instanceof SyntaxError ? 'Dados inválidos.' : error instanceof Error ? error.message : 'Erro ao gerar prompts.' }, 400);
  }
}
