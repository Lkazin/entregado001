import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  MASTER2_COOKIE, MASTER2_SESSION_SECONDS, equalDigest, isMaster2Pin, master2Configured,
  pinDigest, readMaster2Pin, signMaster2Session, verifyMaster2Session,
} from '@/lib/auth/master2';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/api/master2' };

function sameOrigin(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin && req.headers.get('sec-fetch-site') !== 'cross-site';
}

async function authenticate(req: NextRequest, change: boolean) {
  if (!sameOrigin(req)) return reply({ error: 'Origem não autorizada.' }, 403);
  if (!master2Configured()) return reply({ error: 'Master 2 indisponível neste painel.' }, 404);

  try {
    if (change && !await verifyMaster2Session(req.cookies.get(MASTER2_COOKIE)?.value)) {
      return reply({ error: 'Entre novamente para trocar o PIN.' }, 401);
    }
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc('driver_auth_consume_limit', {
      p_key: createHash('sha256').update('master2:pin:' + ip).digest('hex'),
      p_limit: 5,
      p_window_seconds: 900,
    });
    if (limitError) throw limitError;
    if (allowed !== true) return reply({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);

    const body = await req.json().catch(() => ({}));
    const current = await readMaster2Pin();
    if (!isMaster2Pin(body.password) || !equalDigest(pinDigest(body.password), current.digest)) {
      return reply({ error: 'PIN do Master 2 incorreto.' }, 401);
    }
    let digest = current.digest;
    if (change) {
      if (!isMaster2Pin(body.newPin) || body.newPin === body.password) {
        return reply({ error: 'Escolha um PIN diferente, com até seis dígitos.' }, 400);
      }
      digest = pinDigest(body.newPin);
      const table = supabaseAdmin.from('master2_credentials');
      const result = current.stored
        ? await table.update({ pin_digest: digest }).eq('id', 'master2').eq('pin_digest', current.digest).select('id')
        : await table.insert({ id: 'master2', pin_digest: digest }).select('id');
      if (result.error || result.data?.length !== 1) return reply({ error: 'Não foi possível confirmar a troca. Entre novamente e tente de novo.' }, 409);
    }

    const response = reply({ authenticated: true });
    response.cookies.set(MASTER2_COOKIE, signMaster2Session(digest), { ...cookie, maxAge: MASTER2_SESSION_SECONDS });
    return response;
  } catch {
    return reply({ error: 'Não foi possível validar o PIN agora.' }, 503);
  }
}

export async function GET(req: NextRequest) {
  const authenticated = await verifyMaster2Session(req.cookies.get(MASTER2_COOKIE)?.value);
  return reply({ authenticated }, authenticated ? 200 : 401);
}
export const POST = (req: NextRequest) => authenticate(req, false);
export const PATCH = (req: NextRequest) => authenticate(req, true);
export function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'Origem não autorizada.' }, 403);
  const response = reply({ authenticated: false });
  response.cookies.set(MASTER2_COOKIE, '', { ...cookie, maxAge: 0 });
  return response;
}
