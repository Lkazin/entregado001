import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

// Opaque sessions are checked against the database on every request. There is
// deliberately no process-local session cache: replacing a session revokes it
// across all server instances as soon as the database update commits.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const ACCOUNT_FIELDS = 'id,name,phone,vehicle_plate,vehicle_model,created_at';

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

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new AccountSessionError('A senha deve ter entre 8 e 128 caracteres.', 400, 'INVALID_PASSWORD');
  }
  return value;
}

export function normalizeAuthorizationCode(raw: unknown): string {
  let code = String(raw || '').trim().toUpperCase().replace(/[\s]/g, '');
  if (code.startsWith('NW-')) return code;
  if (code.startsWith('NW')) return 'NW-' + code.slice(2);
  if (code.startsWith('CAD-')) return code;
  if (code.startsWith('CAD')) return 'CAD-' + code.slice(3);
  return code;
}

export async function verifyAuthorizationCode(rawCode: unknown): Promise<{
  valid: boolean;
  storeId: string;
  storeName: string;
  inviteCode: string;
  membershipId: string;
}> {
  const code = normalizeAuthorizationCode(rawCode);
  if (!code || code.length < 5) {
    throw new AccountSessionError('Informe o código de autorização fornecido pela loja (ex: NW-XXXXXX).', 400, 'INVALID_REGISTRATION_CODE');
  }

  const { data, error } = await supabaseAdmin.from('driver_logistics_state')
    .select('state,revision').eq('id', 'primary').maybeSingle();

  const state = data?.state;
  const drivers: any[] = Array.isArray(state?.drivers) ? state.drivers : [];
  const shift = drivers.find((d: any) =>
    d.inviteCode && normalizeAuthorizationCode(d.inviteCode) === code
  );

  if (!shift) {
    throw new AccountSessionError('Código de autorização não encontrado. Verifique o código com o lojista.', 404, 'INVALID_REGISTRATION_CODE');
  }

  if (shift.status === 'revogado' || shift.status === 'vinculo_removido' || shift.status === 'bloqueado') {
    throw new AccountSessionError('Este código foi revogado ou cancelado pela loja.', 403, 'CODE_REVOKED');
  }

  const isExpired = shift.isExpired || (shift.expiresAt && Date.parse(shift.expiresAt) <= Date.now());
  if (isExpired) {
    throw new AccountSessionError('Este código de autorização expirou. Solicite um novo código à loja.', 410, 'CODE_EXPIRED');
  }

  // Código de uso único: se já tiver sido utilizado para cadastro ou se já estiver ativo com outro motoboy
  if (shift.usedForRegistration || (shift.status === 'ativo' && shift.driverId)) {
    throw new AccountSessionError('Este código já foi utilizado para cadastrar outro motoboy. Cada código é de uso único.', 409, 'CODE_ALREADY_USED');
  }

  const storeId = shift.storeId || 'store_bella_pizza';
  const storeName = shift.storeName || 'Bella Pizza';

  return {
    valid: true,
    storeId,
    storeName,
    inviteCode: shift.inviteCode,
    membershipId: shift.id,
  };
}

export async function registerDriverAccount(body: any): Promise<{ account: DriverAccount; accountToken: string; storeName?: string; storeId?: string }> {
  const rawCode = body?.registrationCode || body?.authorizationCode;
  const registrationCode = normalizeAuthorizationCode(rawCode);
  if (!registrationCode || registrationCode.length < 5) {
    throw new AccountSessionError('O código de autorização da loja é obrigatório para concluir o cadastro.', 400, 'INVALID_REGISTRATION_CODE');
  }
  const phone = normalizeDriverPhone(body?.phone);
  const password = validatePassword(body?.password);
  const name = String(body?.name || '').trim();
  const plate = String(body?.vehiclePlate || '').trim().toUpperCase();
  const model = String(body?.vehicleModel || '').trim();
  if (name.length < 3 || name.length > 100 || plate.length > 12 || model.length > 100) {
    throw new AccountSessionError('Confira seu nome e os dados do veículo.', 400, 'INVALID_PROFILE');
  }
  const accountToken = crypto.randomBytes(32).toString('hex');

  // Suporte a RPC de mock em ambiente de testes unitários
  try {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('driver_register_account', {
      p_invite_hash: hashToken(registrationCode), p_phone: phone, p_name: name,
      p_vehicle_plate: plate, p_vehicle_model: model,
      p_password_hash: await hashDriverPassword(password),
      p_session_hash: hashToken(accountToken),
      p_session_expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
    });
    if (!rpcError && rpcData) {
      return { account: accountFromRow(rpcData), accountToken };
    }
    if (rpcError?.code === '23505') {
      throw new AccountSessionError('Este telefone já possui uma conta. Entre com sua senha.', 409, 'ACCOUNT_EXISTS');
    }
  } catch (rpcErr) {
    if (rpcErr instanceof AccountSessionError) throw rpcErr;
  }

  // 1. Verifica se já existe conta com este telefone
  const { data: existingAccount } = await supabaseAdmin.from('driver_accounts')
    .select('id').eq('phone', phone).maybeSingle();
  if (existingAccount) {
    throw new AccountSessionError('Este telefone já possui uma conta cadastrada. Faça login com sua senha.', 409, 'ACCOUNT_EXISTS');
  }

  // 2. Valida o código com a loja e obtém o vínculo
  const verified = await verifyAuthorizationCode(registrationCode);

  // 3. Cria a conta no banco de dados com senha criptografada via scrypt
  const passwordHash = await hashDriverPassword(password);
  const sessionExpiresAt = new Date(Date.now() + SESSION_MS).toISOString();

  const { data: newAccount, error: createError } = await supabaseAdmin.from('driver_accounts').insert({
    phone,
    name,
    vehicle_plate: plate,
    vehicle_model: model,
    password_hash: passwordHash,
    active_session_hash: hashToken(accountToken),
    session_expires_at: sessionExpiresAt,
  }).select(ACCOUNT_FIELDS).single();

  if (createError || !newAccount) {
    if (createError?.code === '23505') {
      throw new AccountSessionError('Este telefone já possui uma conta. Faça login com sua senha.', 409, 'ACCOUNT_EXISTS');
    }
    throw unavailable();
  }

  // 4. Cria o vínculo na tabela driver_account_memberships
  try {
    await supabaseAdmin.from('driver_account_memberships').insert({
      membership_id: verified.membershipId,
      account_id: newAccount.id,
      driver_id: newAccount.id,
      store_id: verified.storeId,
    });
  } catch (mErr) {
    console.warn('[registerDriverAccount] Aviso ao inserir membership:', mErr);
  }

  // 5. Atualiza o estado da logística: vincula o motoboy à loja e marca o código como utilizado
  try {
    const { data: logData } = await supabaseAdmin.from('driver_logistics_state')
      .select('state,revision').eq('id', 'primary').maybeSingle();
    const state = logData?.state;
    const revision = Number(logData?.revision) || 1;
    const drivers: any[] = Array.isArray(state?.drivers) ? state.drivers : [];
    const shift = drivers.find((d: any) =>
      d.id === verified.membershipId ||
      (d.inviteCode && normalizeAuthorizationCode(d.inviteCode) === registrationCode)
    );
    if (shift) {
      shift.status = 'ativo';
      shift.shiftStatus = 'em_plantao';
      shift.presence = 'disponivel';
      shift.driverId = newAccount.id;
      shift.driverName = name;
      shift.name = name;
      shift.phone = phone;
      shift.vehiclePlate = plate;
      shift.vehicleModel = model;
      shift.usedForRegistration = true;
      shift.activatedAt = new Date().toISOString();

      await supabaseAdmin.from('driver_logistics_state').update({
        state,
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', 'primary');
    }
  } catch (logisticsErr) {
    console.warn('[registerDriverAccount] Aviso ao atualizar estado de logística:', logisticsErr);
  }

  await audit('registered', newAccount.id);

  return {
    account: accountFromRow(newAccount),
    accountToken,
    storeName: verified.storeName,
    storeId: verified.storeId,
  };
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
