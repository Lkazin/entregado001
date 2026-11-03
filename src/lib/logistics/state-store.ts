import { supabaseAdmin } from '@/lib/supabase/server';
import { publishTrackingInvalidation } from './tracking-realtime';

export class StateStoreError extends Error {
  constructor(message: string, public status = 503, public code = 'LOGISTICS_UNAVAILABLE') {
    super(message);
    this.name = 'StateStoreError';
  }
}

function unavailable(): StateStoreError {
  return new StateStoreError('Não foi possível acessar os dados de logística. Tente novamente.');
}

function validRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) throw unavailable();
  return revision;
}

export async function readLogisticsState(): Promise<{ state: any; revision: number }> {
  const { data, error } = await supabaseAdmin.from('driver_logistics_state')
    .select('state,revision').eq('id', 'primary').maybeSingle();
  if (error || !data || !data.state || typeof data.state !== 'object' || Array.isArray(data.state)) throw unavailable();
  return { state: data.state, revision: validRevision(data.revision) };
}

export async function writeLogisticsState(
  state: any,
  expectedRevision: number,
  auth?: { accountId: string; sessionHash: string }
): Promise<number> {
  const revision = validRevision(expectedRevision);
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw unavailable();
  const nextRevision = revision + 1;
  const { data, error } = await supabaseAdmin.rpc('driver_logistics_commit', {
    p_state: state, p_revision: revision,
    p_account_id: auth?.accountId || null, p_session_hash: auth?.sessionHash || null,
  });
  if (error?.message?.includes('ACCOUNT_SESSION_REPLACED')) {
    throw new StateStoreError('Sua conta foi acessada em outro aparelho. Entre novamente.', 401, 'ACCOUNT_SESSION_REPLACED');
  }
  if (error?.message?.includes('LOGISTICS_CONFLICT')) {
    throw new StateStoreError('Os dados foram atualizados por outra operação. Atualize e tente novamente.', 409, 'LOGISTICS_CONFLICT');
  }
  if (error || data === null || data === undefined || validRevision(data) !== nextRevision) throw unavailable();
  await publishTrackingInvalidation(state, nextRevision);
  return nextRevision;
}
