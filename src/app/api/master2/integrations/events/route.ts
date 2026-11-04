import { createHash } from 'node:crypto';
import { verifyMaster1Signature } from '@/lib/master2-connection';
import { NextRequest, NextResponse } from 'next/server';
import { master2Configured } from '@/lib/auth/master2';
import { generateInstallationPrompts } from '@/lib/master2-prompts';
import { supabaseAdmin } from '@/lib/supabase/server';

// Contract preview only. No event is persisted or applied by this endpoint.
export async function POST(request: NextRequest) {
  if (request.headers.get('x-master1-mode') === 'live') return receiveOfficial(request);
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
  if (!verifyMaster1Signature(secret, 'demo', timestamp, body, signature)) return replySignatureError();
  function replySignatureError() { return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401, headers }); }
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

async function receiveOfficial(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const secret = process.env.MASTER2_MASTER1_SECRET;
  if (!master2Configured() || !secret || secret.length < 32) return reply({ error: 'Conexão oficial indisponível.' }, 503);
  const timestamp = request.headers.get('x-master1-timestamp') ?? '';
  const signature = request.headers.get('x-master1-signature') ?? '';
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return reply({ error: 'Assinatura inválida ou expirada.' }, 401);
  const body = await request.text();
  if (Buffer.byteLength(body) > 4096) return reply({ error: 'Evento muito longo.' }, 413);
  if (!verifyMaster1Signature(secret, 'live', timestamp, body, signature)) return reply({ error: 'Assinatura inválida.' }, 401);

  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return reply({ error: 'JSON inválido.' }, 400); }
  if (!event || typeof event !== 'object' || event.schemaVersion !== 1 || typeof event.officialStoreId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.officialStoreId)) return reply({ error: 'Versão ou ID oficial inválido.' }, 422);
  try {
    if (event.eventType === 'kit.status') {
      if (Object.keys(event).some(key => !['schemaVersion', 'eventType', 'officialStoreId'].includes(key))) return reply({ error: 'Campos inesperados.' }, 422);
      const { data, error } = await supabaseAdmin.from('master2_received_stores').select('id,status,revision,updated_at,profile').eq('id', event.officialStoreId).maybeSingle();
      if (error) throw error;
      return data ? reply({ store: data }) : reply({ error: 'Loja não recebida.' }, 404);
    }
    const allowed = ['schemaVersion','eventType','eventId','officialStoreId','name','domain','domainCandidate','domainVerificationStatus','basePlan','storeStatus','kitAuthorized','supabaseGroupId','revision'];
    if (Object.keys(event).some(key => !allowed.includes(key)) || event.eventType !== 'kit.authorized' || event.storeStatus !== 'active' || event.kitAuthorized !== true ||
      !['business','premium'].includes(String(event.basePlan)) || typeof event.eventId !== 'string' || !/^[\w-]{1,100}$/.test(event.eventId) ||
      typeof event.revision !== 'number' || !Number.isSafeInteger(event.revision) || event.revision < 1 ||
      (event.domain != null && (typeof event.domain !== 'string' || event.domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(event.domain))) ||
      (event.domainCandidate != null && (typeof event.domainCandidate !== 'string' || event.domainCandidate.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(event.domainCandidate))) ||
      (event.domainVerificationStatus != null && !['none', 'pending', 'verified'].includes(String(event.domainVerificationStatus))) ||
      (event.domainVerificationStatus === 'verified' && typeof event.domain !== 'string') ||
      (event.domainVerificationStatus === 'pending' && typeof event.domainCandidate !== 'string') ||
      (event.domainVerificationStatus === 'none' && (event.domain != null || event.domainCandidate != null)) ||
      (event.domain != null && event.domainCandidate != null) ||
      (event.supabaseGroupId != null && (typeof event.supabaseGroupId !== 'string' || !/^[\w-]{1,80}$/.test(event.supabaseGroupId)))) return reply({ error: 'Evento inválido ou loja sem autorização.' }, 422);
    const groups = JSON.parse(process.env.MASTER2_SUPABASE_GROUPS || '{}');
    const groupId = typeof event.supabaseGroupId === 'string' ? event.supabaseGroupId : null;
    const group = groupId && Object.hasOwn(groups, groupId) ? groups[groupId] : null;
    if (groupId && (!group || !/^[a-z0-9]{20}$/.test(group.production) || (group.staging && (!/^[a-z0-9]{20}$/.test(group.staging) || group.staging === group.production)))) return reply({ error: 'Grupo Supabase não autorizado.' }, 422);
    // A loja pode ser cadastrada antes de ter um domínio verificado; não gerar domínio fictício.
    const domain = typeof event.domain === 'string' ? event.domain.toLowerCase() : '';
    const domainCandidate = typeof event.domainCandidate === 'string' ? event.domainCandidate.toLowerCase() : '';
    const domainVerificationStatus = domain ? 'verified' : domainCandidate ? 'pending' : 'none';
    const profile = { name: event.name, domain, domainCandidate, domainVerificationStatus, plan: event.basePlan, group: groupId || '', staging: group?.staging || '', production: group?.production || '' };
    try { generateInstallationPrompts({ id: event.officialStoreId, ...profile }); }
    catch { return reply({ error: 'Dados da loja inválidos.' }, 422); }
    const fingerprint = createHash('sha256').update(JSON.stringify([event.officialStoreId.toLowerCase(), event.revision, event.eventType, profile])).digest('hex');
    const { data, error } = await supabaseAdmin.rpc('master2_receive_store', {
      p_event: event.eventId, p_id: event.officialStoreId, p_revision: event.revision, p_profile: profile, p_fingerprint: fingerprint,
    });
    if (error) throw error;
    if (data !== 'received') return reply({ error: data }, 409);
    return reply({ received: true, eventId: event.eventId, officialStoreId: event.officialStoreId, revision: event.revision });
  } catch { return reply({ error: 'Não foi possível consultar ou registrar a conexão.' }, 503); }
}
