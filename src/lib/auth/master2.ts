import { verifyAdminToken } from './tokens';
import { timelineStoreKey } from '../logistics/order-timeline';
export const MASTER2_COOKIE = 'novaes_master2_session';
export function master2Configured() { return process.env.NOVAESWEB_KIT_LAB_ENABLED === 'true' && !!process.env.NOVAESWEB_KIT_LAB_STORE_ID; }
export function verifyMaster2Session(token?: string) {
  if (!master2Configured()) return false;
  const auth = verifyAdminToken(token);
  return auth.valid && !!auth.storeId && timelineStoreKey(auth.storeId) === timelineStoreKey(process.env.NOVAESWEB_KIT_LAB_STORE_ID!);
}
