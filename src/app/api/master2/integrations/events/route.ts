import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { master2Configured } from '@/lib/auth/master2';
import { generateInstallationPrompts } from '@/lib/master2-prompts';

// Contract preview only. No event is persisted or applied by this endpoint.
export async function POST(request: NextRequest) {
  const secret = process.env.MASTER2_DEMO_EVENT_SECRET;
  const headers = { 'Cache-Control': 'private, no-store' };
  const reply = (body: object, status: number) => NextResponse.json(body, { status, headers });
  if (!master2Configured() || process.env.VERCEL_ENV === 'production' || !secret || secret.length < 32) {
    return reply({ error: 'Receptor de demonstração desabilitado.' }, 404);
  }
  const timestamp = request.headers.get('x-master1-timestamp') ?? '';
  const signature = request.headers.get('x-master1-signature') ?? '';
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300_000 || !/^[a-f0-9]{64}$/.test(signature)) {
    return reply({ error: 'Assinatura inválida ou expirada.' }, 401);
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > 4096) return reply({ error: 'Evento muito longo.' }, 413);
  const expected = createHmac('sha256', secret).update('master1:master2-demo:' + timestamp + ':' + body).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) return reply({ error: 'Assinatura inválida.' }, 401);
  try {
    const event = JSON.parse(body);
    if (event.schemaVersion !== 1 || event.eventType !== 'kit.authorized' || event.storeStatus !== 'active' || event.kitAuthorized !== true || typeof event.eventId !== 'string' || !/^[\w-]{1,100}$/.test(event.eventId)) {
      return reply({ error: 'Evento incompatível ou loja sem autorização.' }, 422);
    }
    generateInstallationPrompts({
      id: event.officialStoreId, name: event.name, plan: event.basePlan,
      group: event.supabaseGroupId, staging: event.stagingProjectRef, production: event.productionProjectRef,
    });
    return reply({ mode: 'demo', applied: false, eventId: event.eventId, officialStoreId: event.officialStoreId, receipt: createHash('sha256').update(body).digest('hex') }, 200);
  } catch {
    return reply({ error: 'Dados da loja inválidos.' }, 422);
  }
}
