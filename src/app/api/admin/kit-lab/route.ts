import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';

export const dynamic = 'force-dynamic';

/** Local operator workspace only. This does not grant a Premium contract. */
export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!auth.valid || !auth.storeId) return NextResponse.json({ success: false }, { status: 401, headers });
  const labStore = process.env.NOVAESWEB_KIT_LAB_STORE_ID;
  if (process.env.NOVAESWEB_KIT_LAB_ENABLED !== 'true' || !labStore || timelineStoreKey(auth.storeId) !== timelineStoreKey(labStore)) {
    return NextResponse.json({ success: false }, { status: 404, headers });
  }
  return NextResponse.json({ success: true, enabled: true, storeId: auth.storeId, mode: 'planning', masterConnected: false }, { headers });
}
