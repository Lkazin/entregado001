import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { AccountSessionError, checkAccountRateLimit, hashDriverPassword, normalizeDriverPhone, DriverAccount } from '@/lib/auth/driver-account';

const PREFIX = 'onboard_v1';
const CHALLENGE_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 86400000;
const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const aliases = new Set(['11111111-1111-1111-1111-111111111111', 'bella-pizza', 'store_bella_pizza']);
type Challenge = { inviteId: string; phone: string; codeHash: string; iat: number; exp: number };

function unavailable(): AccountSessionError {
  return new AccountSessionError('Não foi possível concluir o primeiro acesso. Tente novamente.', 503, 'FIRST_ACCESS_UNAVAILABLE');
}
function invalid(): AccountSessionError {
  return new AccountSessionError('Telefone ou código inválido, expirado ou já utilizado. Confira com o lojista.', 400, 'INVALID_FIRST_ACCESS_CODE');
}
function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) throw unavailable();
  return value;
}
function adminStore(req: NextRequest): string {
  const auth = verifyAdminRequest(req);
  if (!auth.valid || !auth.storeId?.trim()) throw new AccountSessionError('Acesso restrito ao lojista.', 401, 'ADMIN_SESSION_REQUIRED');
  const id = auth.storeId.trim();
  return aliases.has(id) ? 'store_bella_pizza' : id;
}
function rpcFailure(error: any): never {
  const message = String(error?.message || '');
  if (message.includes('INVALID_FIRST_ACCESS_CODE')) throw invalid();
  if (message.includes('ACCOUNT_EXISTS') || error?.code === '23505') throw new AccountSessionError('Este telefone já possui uma conta. Entre com sua senha.', 409, 'ACCOUNT_EXISTS');
  if (message.includes('DRIVER_LINK_FORBIDDEN')) throw new AccountSessionError('Este entregador precisa de reativação ou conferência manual pela loja.', 403, 'DRIVER_LINK_FORBIDDEN');
  throw unavailable();
}
function signChallenge(payload: Challenge): string {
  const content = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(`${PREFIX}.${content}`).digest('base64url');
  return `${PREFIX}.${content}.${signature}`;
}
function readChallenge(raw: unknown): Challenge {
  if (typeof raw !== 'string' || raw.length > 2048) throw invalid();
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) throw invalid();
  const expected = crypto.createHmac('sha256', secret()).update(`${PREFIX}.${parts[1]}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) throw invalid();
  let value: any;
  try { value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw invalid(); }
  if (!/^[a-f0-9-]{36}$/i.test(value?.inviteId || '') || !/^\+55[1-9]\d{9,10}$/.test(value?.phone || '') || !/^[a-f0-9]{64}$/.test(value?.codeHash || '')
    || !Number.isSafeInteger(value?.iat) || !Number.isSafeInteger(value?.exp) || value.exp <= Date.now()
    || value.iat > Date.now() + 30000 || value.exp > value.iat + CHALLENGE_MS || value.exp <= value.iat) throw invalid();
  return value;
}
async function issueLimit(req: NextRequest, storeId: string): Promise<void> {
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  for (const key of [`first-access:ip:${ip}`, `first-access:store:${storeId}`]) {
    const { data, error } = await supabaseAdmin.rpc('driver_auth_consume_limit', { p_key: sha(key), p_limit: 20, p_window_seconds: 900 });
    if (error) throw unavailable();
    if (data !== true) throw new AccountSessionError('Muitos códigos emitidos. Aguarde 15 minutos.', 429, 'RATE_LIMITED');
  }
}
export async function issueFirstAccess(req: NextRequest, body: any) {
  const storeId = adminStore(req);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 3 || name.length > 100) throw new AccountSessionError('Informe o nome do entregador, entre 3 e 100 caracteres.', 400, 'INVALID_NAME');
  const phone = normalizeDriverPhone(body?.phone);
  await issueLimit(req, storeId);
  const accessCode = `AC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const { data, error } = await supabaseAdmin.rpc('driver_first_access_issue', {
    p_name: name, p_phone: phone, p_store_id: storeId, p_code_hash: sha(accessCode),
    p_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error) rpcFailure(error);
  if (!data) throw unavailable();
  return { inviteId: data.id, accessCode, name: data.name, phone: data.phone, expiresAt: data.expires_at };
}
export async function startFirstAccess(req: NextRequest, body: any) {
  const phone = normalizeDriverPhone(body?.phone);
  await checkAccountRateLimit(req, phone);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^AC-[A-F0-9]{12}$/.test(code)) throw invalid();
  const codeHash = sha(code);
  const { data, error } = await supabaseAdmin.rpc('driver_first_access_start', { p_code_hash: codeHash, p_phone: phone });
  if (error) rpcFailure(error);
  if (!data) throw unavailable();
  const now = Date.now();
  const exp = Math.min(now + CHALLENGE_MS, Date.parse(data.expires_at));
  if (!Number.isSafeInteger(exp) || exp <= now) throw invalid();
  const onboardingToken = signChallenge({ inviteId: data.invite_id, phone, codeHash, iat: now, exp });
  return { onboardingToken, name: data.name, phone: data.phone, storeName: data.store_name, expiresAt: new Date(exp).toISOString() };
}
export async function completeFirstAccess(req: NextRequest, body: any): Promise<{ account: DriverAccount; accountToken: string }> {
  const challenge = readChallenge(body?.onboardingToken);
  await checkAccountRateLimit(req, challenge.phone);
  const password = typeof body?.password === 'string' ? body.password : '';
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  const model = typeof body?.vehicleModel === 'string' ? body.vehicleModel.trim() : '';
  const plate = typeof body?.vehiclePlate === 'string' ? body.vehiclePlate.trim().toUpperCase() : '';
  if (password.length < 8 || password.length > 128) throw new AccountSessionError('A senha deve ter entre 8 e 128 caracteres.', 400, 'INVALID_PASSWORD');
  if (address.length < 8 || address.length > 500 || model.length < 2 || model.length > 100 || plate.length > 12) {
    throw new AccountSessionError('Informe seu endereço e o nome/modelo da moto. A placa é opcional.', 400, 'INVALID_PROFILE');
  }
  const accountToken = crypto.randomBytes(32).toString('hex');
  const { data, error } = await supabaseAdmin.rpc('driver_first_access_complete', {
    p_invite_id: challenge.inviteId, p_code_hash: challenge.codeHash, p_phone: challenge.phone,
    p_password_hash: await hashDriverPassword(password), p_home_address: address,
    p_vehicle_model: model, p_vehicle_plate: plate, p_session_hash: sha(accountToken),
    p_session_expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
    p_challenge_expires_at: new Date(challenge.exp).toISOString(),
  });
  if (error) rpcFailure(error);
  if (!data) throw unavailable();
  return { account: { id: data.id, name: data.name, phone: data.phone, vehiclePlate: data.vehicle_plate || '',
    vehicleModel: data.vehicle_model, address: data.home_address, createdAt: data.created_at }, accountToken };
}
export async function revokeFirstAccess(req: NextRequest, body: any): Promise<void> {
  const storeId = adminStore(req);
  const id = String(body?.inviteId || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new AccountSessionError('Código não encontrado.', 404, 'FIRST_ACCESS_NOT_FOUND');
  const { data, error } = await supabaseAdmin.from('driver_first_access_invites')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('store_id', storeId).is('redeemed_at', null).select('id');
  if (error) throw unavailable();
  if (!data?.length) throw new AccountSessionError('Código não encontrado ou já utilizado.', 404, 'FIRST_ACCESS_NOT_FOUND');
}
export async function listFirstAccess(req: NextRequest) {
  const storeId = adminStore(req);
  const { data, error } = await supabaseAdmin.from('driver_first_access_invites')
    .select('id,name,phone,expires_at,redeemed_at,revoked_at,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100);
  if (error) throw unavailable();
  return (data || []).map(row => ({ id: row.id, name: row.name, phone: row.phone, expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at, revokedAt: row.revoked_at, createdAt: row.created_at }));
}
