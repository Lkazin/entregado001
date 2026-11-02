import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { readLogisticsState, writeLogisticsState, StateStoreError } from '@/lib/logistics/state-store';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';
import { deriveStoreNotices, noticeLimits } from '@/lib/site-notifications';

export const dynamic = 'force-dynamic';
const reply = (body: any, status = 200) => NextResponse.json(body, {status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req: NextRequest) {
  try {
    const auth = verifyAdminRequest(req);
    if (!auth.valid || !auth.storeId) return reply({success:false,error:'Entre no painel da loja.'},401);
    const store = timelineStoreKey(auth.storeId), {state} = await readLogisticsState();
    return reply({success:true,storeId:store,serverNow:new Date().toISOString(),notifications:deriveStoreNotices(state,store),limits:noticeLimits(state.settingsByStore?.[store]?.siteNoticeLimits)});
  } catch { return reply({success:false,error:'Não foi possível atualizar os avisos.'},503); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = verifyAdminRequest(req);
    if (!auth.valid || !auth.storeId) return reply({success:false,error:'Entre no painel da loja.'},401);
    if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return reply({success:false,error:'Origem não autorizada.'},403);
    const body = await req.json(), store = timelineStoreKey(auth.storeId);
    if (!['read','limits'].includes(body.action)) return reply({success:false,error:'Ação inválida.'},400);
    for(let attempt=0;attempt<3;attempt++) {
      const {state,revision} = await readLogisticsState(); state.settingsByStore ||= {}; state.settingsByStore[store] ||= {};
      const settings = state.settingsByStore[store];
      if (body.action === 'limits') {
        if (!['preparing','pickup','transit'].every(key=>Number.isInteger(body.limits?.[key]) && body.limits[key]>=1 && body.limits[key]<=240)) return reply({success:false,error:'Use limites de 1 a 240 minutos.'},400);
        settings.siteNoticeLimits = noticeLimits(body.limits);
      } else {
        const notices = deriveStoreNotices(state,store), allowed = new Set(notices.map(n=>n.id));
        const requested = body.all === true ? [...allowed] : Array.isArray(body.ids) ? body.ids.filter((id: any)=>typeof id==='string' && allowed.has(id)).slice(0,150) : [];
        settings.notificationReadIds = [...new Set([...(settings.notificationReadIds || []).filter((id: any)=>allowed.has(id)), ...requested])].slice(-500);
      }
      try { await writeLogisticsState(state,revision); return reply({success:true}); }
      catch(error) { if (!(error instanceof StateStoreError) || error.status!==409 || attempt===2) throw error; }
    }
  } catch { return reply({success:false,error:'Não foi possível salvar os avisos.'},503); }
}
