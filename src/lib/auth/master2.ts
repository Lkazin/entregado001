import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

export const MASTER2_COOKIE = 'novaes_master2_session';
export const MASTER2_SESSION_SECONDS = 86400;
export const isMaster2Pin = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,6}$/.test(value);
export function master2Configured() {
  return process.env.NOVAESWEB_KIT_LAB_ENABLED === 'true' && !!process.env.NOVAESWEB_KIT_LAB_STORE_ID;
}

function mac(value: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Sessão indisponível.');
  return createHmac('sha256', secret).update(value).digest('hex');
}
export const pinDigest = (pin: string) => mac('master2:pin:' + pin);
export function equalDigest(a: string, b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export async function readMaster2Pin() {
  const { data, error } = await supabaseAdmin.from('master2_credentials').select('pin_digest').eq('id', 'master2').maybeSingle();
  if (error) throw error;
  if (data) return { digest: data.pin_digest as string, stored: true };
  const initial = process.env.MASTER2_INITIAL_PIN;
  if (!isMaster2Pin(initial)) throw new Error('PIN indisponível.');
  return { digest: pinDigest(initial), stored: false };
}
export function signMaster2Session(digest: string) {
  const expiry = String(Date.now() + MASTER2_SESSION_SECONDS * 1000);
  return expiry + '.' + mac('master2:session:' + expiry + ':' + digest);
}
export async function verifyMaster2Session(token?: string) {
  if (!master2Configured() || !token || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split('.');
  if (Number(expiry) <= Date.now()) return false;
  try {
    const { digest } = await readMaster2Pin();
    return equalDigest(signature, mac('master2:session:' + expiry + ':' + digest));
  } catch { return false; }
}
