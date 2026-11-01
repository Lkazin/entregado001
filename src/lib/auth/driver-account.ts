import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

// Opaque sessions are checked against the database on every request. There is
// deliberately no process-local session cache: replacing a session revokes it
// across all server instances as soon as the database update commits.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const ACCOUNT_FIELDS = 'id,name,phone,vehicle_plate,vehicle_model,home_address,created_at';

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export interface DriverAccount {
  id: string;
  name: string;
  phone: string;
  vehiclePlate: string;
  vehicleModel: string;
  createdAt: string;
  address?: string;
}

export class AccountSessionError extends Error {
  constructor(message: string, public status = 401, public code = 'ACCOUNT_SESSION_REQUIRED') {
    super(message);
    this.name = 'AccountSessionError';
  }
}

export function normalizeDriverPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55[1-9]\d{9,10}$/.test(digits)) {
    throw new AccountSessionError('Informe seu telefone com DDD.', 400, 'INVALID_PHONE');
  }
  return `+${digits}`;
}

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function accountFromRow(row: any): DriverAccount {
  return {
    id: row.id, name: row.name, phone: row.phone,
    vehiclePlate: row.vehicle_plate || '', vehicleModel: row.vehicle_model || '',
    createdAt: row.created_at,
    address: row.home_address || '',
  };
}

function unavailable(): AccountSessionError {
  return new AccountSessionError('Não foi possível acessar sua conta. Tente novamente.', 503, 'ACCOUNT_UNAVAILABLE');
}

function sessionHash(req: { headers: { get(name: string): string | null } }): string {
  const token = req.headers.get('x-account-session') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new AccountSessionError('Entre na sua conta para continuar.');
  }
  return hashToken(token);
}

export async function requireAccountSession(req: { headers: { get(name: string): string | null } }): Promise<DriverAccount> {
  const tokenHash = sessionHash(req);
  const { data, error } = await supabaseAdmin.from('driver_accounts')
    .select(`${ACCOUNT_FIELDS},session_expires_at`)
    .eq('active_session_hash', tokenHash).maybeSingle();
  if (error) throw unavailable();
  if (!data || !data.session_expires_at || Date.parse(data.session_expires_at) <= Date.now()) {
    throw new AccountSessionError(
      'Sua conta foi acessada em outro aparelho ou a sessão expirou. Entre novamente.',
      401, 'ACCOUNT_SESSION_REPLACED'
    );
  }
  return accountFromRow(data);
}

async function audit(event: string, accountId: string | null, keyHash: string | null = null): Promise<void> {
  const { error } = await supabaseAdmin.from('driver_auth_events').insert({
    event, account_id: accountId, key_hash: keyHash,
  });
  // Logging failure cannot accidentally grant access; avoid logging PII/tokens.
  if (error) console.warn('[driver-auth] Não foi possível registrar evento de autenticação.');
}

export async function checkAccountRateLimit(req: { headers: { get(name: string): string | null } }, identifier: unknown): Promise<void> {
  // Vercel overwrites the forwarded IP header at its trusted ingress.
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  let normalizedIdentifier: string;
  try { normalizedIdentifier = normalizeDriverPhone(identifier); }
  catch { normalizedIdentifier = String(identifier || '').replace(/\D/g, ''); }
  const idHash = hashToken(normalizedIdentifier);
  for (const [key, limit] of [[`ip:${hashToken(ip)}`, 10], [`identity:${idHash}`, 5]] as const) {
    const { data, error } = await supabaseAdmin.rpc('driver_auth_consume_limit', {
      p_key: hashToken(key), p_limit: limit, p_window_seconds: 900,
    });
    if (error) throw unavailable();
    if (data !== true) {
      await audit('rate_limited', null, idHash);
      throw new AccountSessionError('Muitas tentativas. Aguarde 15 minutos e tente novamente.', 429, 'RATE_LIMITED');
    }
  }
}

export async function hashDriverPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await derivePassword(password, salt);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyDriverPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const key = await derivePassword(password, salt);
  return crypto.timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

export async function verifyAuthorizationCode(_rawCode: unknown): Promise<never> {
  throw new AccountSessionError('Use Primeiro acesso com seu telefone e o código enviado pelo lojista.', 410, 'FIRST_ACCESS_REQUIRED');
}

export async function registerDriverAccount(_body: any): Promise<never> {
  throw new AccountSessionError('Use Primeiro acesso com seu telefone e o código enviado pelo lojista.', 410, 'FIRST_ACCESS_REQUIRED');
}

export async function loginDriverAccount(body: any): Promise<{ account: DriverAccount; accountToken: string }> {
  let phone: string;
  try { phone = normalizeDriverPhone(body?.identifier); } catch {
    throw new AccountSessionError('Telefone ou senha incorretos.', 401, 'INVALID_CREDENTIALS');
  }
  const password = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : '';
  const { data: row, error: readError } = await supabaseAdmin.from('driver_accounts')
    .select(`${ACCOUNT_FIELDS},password_hash`).eq('phone', phone).maybeSingle();
  if (readError) throw unavailable();
  // An absent account still runs scrypt to avoid a cheap timing oracle.
  const dummyHash = 'scrypt$32768$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid = await verifyDriverPassword(password, row?.password_hash || dummyHash);
  if (!row || !valid) {
    await audit('login_failed', null, hashToken(phone));
    throw new AccountSessionError('Telefone ou senha incorretos.', 401, 'INVALID_CREDENTIALS');
  }
  const accountToken = crypto.randomBytes(32).toString('hex');
  const { data, error } = await supabaseAdmin.from('driver_accounts').update({
    active_session_hash: hashToken(accountToken),
    session_expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).select(ACCOUNT_FIELDS).single();
  if (error || !data) throw unavailable();
  await audit('login_session_replaced', row.id);
  return { account: accountFromRow(data), accountToken };
}

export async function logoutDriverAccount(req: { headers: { get(name: string): string | null } }): Promise<void> {
  const tokenHash = sessionHash(req);
  // A delayed logout from device A cannot revoke the newer session on device B.
  const { data, error } = await supabaseAdmin.from('driver_accounts').update({
    active_session_hash: null, session_expires_at: null, updated_at: new Date().toISOString(),
  }).eq('active_session_hash', tokenHash).select('id');
  if (error) throw unavailable();
  if (data?.[0]?.id) await audit('logout', data[0].id);
}
