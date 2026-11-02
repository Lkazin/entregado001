import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { trackingFeatureEnabled } from '@/lib/logistics/customer-tracking';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';
import { readLogisticsState, writeLogisticsState, StateStoreError } from '@/lib/logistics/state-store';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: NextRequest) {
  try {
    const auth = verifyAdminRequest(req);
    if (!auth.valid || !auth.storeId) return reply({ success: false, error: 'Entre no painel da loja.' }, 401);
    const store = timelineStoreKey(auth.storeId);
    const { state } = await readLogisticsState();
    const eligible = await trackingFeatureEnabled(store);
    return reply({ success: true, eligible, enabled: eligible && state.settingsByStore?.[store]?.customerLiveTrackingEnabled !== false });
  } catch { return reply({ success: false, error: 'Não foi possível carregar a configuração.' }, 503); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = verifyAdminRequest(req);
    if (!auth.valid || !auth.storeId) return reply({ success: false, error: 'Entre no painel da loja.' }, 401);
    if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return reply({ success: false, error: 'Origem não autorizada.' }, 403);
    const body = await req.json();
    if (typeof body?.enabled !== 'boolean') return reply({ success: false, error: 'Configuração inválida.' }, 400);
    const store = timelineStoreKey(auth.storeId);
    if (body.enabled && !await trackingFeatureEnabled(store)) return reply({ success: false, error: 'Este recurso não está habilitado no plano da loja.' }, 403);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { state, revision } = await readLogisticsState();
      state.settingsByStore ||= {};
      state.settingsByStore[store] = { ...state.settingsByStore[store], customerLiveTrackingEnabled: body.enabled };
      try { await writeLogisticsState(state, revision); return reply({ success: true, enabled: body.enabled }); }
      catch (error) { if (!(error instanceof StateStoreError) || error.status !== 409 || attempt === 2) throw error; }
    }
  } catch { return reply({ success: false, error: 'Não foi possível salvar a configuração.' }, 503); }
}
