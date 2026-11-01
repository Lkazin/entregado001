import { supabaseAdmin } from '@/lib/supabase/server';
import { AccountSessionError, DriverAccount, requireAccountSession } from './driver-account';

export interface AccountMembership {
  membership_id: string;
  account_id: string;
  driver_id: string;
  store_id: string;
}

const contexts = new WeakMap<object, { account: DriverAccount; memberships: AccountMembership[] }>();

export async function accountMemberships(accountId: string): Promise<AccountMembership[]> {
  const { data, error } = await supabaseAdmin.from('driver_account_memberships')
    .select('membership_id,account_id,driver_id,store_id').eq('account_id', accountId);
  if (error) throw new AccountSessionError('Não foi possível carregar seus vínculos.', 503, 'ACCOUNT_UNAVAILABLE');
  return data || [];
}

export async function prepareDriverAccount(req: { headers: { get(name: string): string | null } }) {
  const account = await requireAccountSession(req);
  const memberships = await accountMemberships(account.id);
  contexts.set(req, { account, memberships });
  return { account, memberships };
}

export function driverAccountContext(req: object) {
  const context = contexts.get(req);
  if (!context) throw new AccountSessionError('Entre na sua conta para continuar.');
  return context;
}

// A chave única impede duas contas de reivindicarem o mesmo vínculo, mesmo
// quando as requisições chegam a instâncias diferentes do servidor.
export async function bindAccountMembership(account: DriverAccount, driver: any) {
  const membership: AccountMembership = {
    membership_id: driver.id, account_id: account.id,
    driver_id: driver.driverId || driver.id, store_id: driver.storeId,
  };
  const { error } = await supabaseAdmin.from('driver_account_memberships').insert(membership);
  if (!error) return membership;
  if (error.code !== '23505') {
    throw new AccountSessionError('Não foi possível salvar o vínculo da sua conta.', 503, 'ACCOUNT_UNAVAILABLE');
  }
  const { data: existing, error: lookupError } = await supabaseAdmin.from('driver_account_memberships')
    .select('membership_id,account_id,driver_id,store_id').eq('membership_id', driver.id).maybeSingle();
  if (lookupError) throw new AccountSessionError('Não foi possível conferir o vínculo.', 503, 'ACCOUNT_UNAVAILABLE');
  if (!existing || existing.account_id !== account.id || existing.driver_id !== membership.driver_id || existing.store_id !== membership.store_id) {
    throw new AccountSessionError('Este código já está vinculado a outra conta de entregador.', 403, 'DRIVER_MEMBERSHIP_FORBIDDEN');
  }
  return existing as AccountMembership;
}
