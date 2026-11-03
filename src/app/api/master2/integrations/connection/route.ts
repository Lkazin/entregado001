import { createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MASTER2_COOKIE, verifyMaster2Session } from '@/lib/auth/master2';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyMaster1Signature } from '@/lib/master2-connection';
import { generateInstallationPrompts } from '@/lib/master2-prompts';

const headers = { 'Cache-Control': 'private, no-store' };
const reply = (data: object, status = 200) => NextResponse.json(data, { headers, status });

export async function GET(request: NextRequest) {
  if (!await verifyMaster2Session(request.cookies.get(MASTER2_COOKIE)?.value)) return reply({ error: 'Sessão inválida.' }, 401);
  const configured = (process.env.MASTER2_MASTER1_SECRET?.length ?? 0) >= 32 && !!process.env.MASTER2_SUPABASE_GROUPS;
  if (!configured) return reply({ configured, stores: [], events: [] });
  const [stores, events] = await Promise.all([
    supabaseAdmin.from('master2_received_stores').select('id,profile,status,revision,updated_at').order('updated_at', { ascending: false }).limit(200),
    supabaseAdmin.from('master2_connection_events').select('event_id,store_id,outcome,created_at').order('created_at', { ascending: false }).limit(30),
  ]);
  if (stores.error || events.error) return reply({ error: 'Não foi possível consultar a conexão.' }, 503);
  return reply({
    configured,
    stores: stores.data, events: events.data,
  });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Origem inválida.' }, 403);
  if (!await verifyMaster2Session(request.cookies.get(MASTER2_COOKIE)?.value)) return reply({ error: 'Sessão inválida.' }, 401);
  // Exercises the same signed-event validator using a server-only demo key.
  return reply(receiveEventSimulation());
}

function receiveEventSimulation() {
  const body = JSON.stringify({
    schemaVersion: 1, eventType: 'kit.authorized', eventId: 'master2-demo',
    officialStoreId: 'd0e00000-0000-4000-8000-000000000001', name: 'Hamburgueria Horizonte',
    basePlan: 'business', storeStatus: 'active', kitAuthorized: true,
  });
  const secret = randomBytes(32).toString('hex');
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update('master1:master2-demo:' + timestamp + ':' + body).digest('hex');
  const event = JSON.parse(body);
  generateInstallationPrompts({ id: event.officialStoreId, name: event.name, plan: event.basePlan });
  const tested = verifyMaster1Signature(secret, 'demo', timestamp, body, signature)
    && !verifyMaster1Signature(secret, 'demo', timestamp, body + ' ', signature);
  return { mode: 'demo', tested, message: tested ? 'Simulação local aprovada: assinatura válida aceita e payload alterado recusado. Nenhum cadastro gravado.' : 'A validação local falhou.' };
}
