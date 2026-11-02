import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveTrackingAccess } from '@/lib/logistics/customer-tracking';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) return reply({ success: false, error: 'Origem não autorizada.' }, 403);
    if (Number(req.headers.get('content-length') || 0) > 4096) return reply({ success: false, error: 'Solicitação inválida.' }, 400);
    const bearer = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer || bearer.length > 8192) return reply({ success: false, error: 'Sessão de visualização necessária.' }, 401);
    const { data: identity, error: identityError } = await supabaseAdmin.auth.getUser(bearer);
    if (identityError || !identity.user?.id) return reply({ success: false, error: 'Sessão de visualização inválida.' }, 401);
    const { data: allowed, error: rateError } = await supabaseAdmin.rpc('driver_auth_consume_limit', {
      p_key: crypto.createHash('sha256').update(`tracking-grant:${identity.user.id}`).digest('hex'),
      p_limit: 10, p_window_seconds: 60,
    });
    if (rateError) return reply({ success: false, error: 'Não foi possível autorizar o mapa.' }, 503);
    if (!allowed) return reply({ success: false, error: 'Aguarde antes de tentar novamente.' }, 429);
    const body = await req.json().catch(() => null);
    if (typeof body?.token !== 'string' || body.token.length < 8 || body.token.length > 200) return reply({ success: false, error: 'Link inválido.' }, 400);
    const access = await resolveTrackingAccess(body.token);
    if (access.stage !== 'active' || !access.topic) return reply({ success: false, error: 'Rastreamento indisponível para esta entrega.' }, 403);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await supabaseAdmin.from('customer_tracking_grants').upsert({
      viewer_id: identity.user.id, topic: access.topic, expires_at: expiresAt,
    }, { onConflict: 'viewer_id,topic' });
    if (error) return reply({ success: false, error: 'Atualização automática temporariamente indisponível.' }, 503);
    return reply({ success: true, topic: access.topic, expiresAt });
  } catch {
    return reply({ success: false, error: 'Não foi possível autorizar o acompanhamento.' }, 503);
  }
}
