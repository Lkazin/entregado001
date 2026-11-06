import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const STORE = 'store_bella_pizza';
const noCache = { 'Cache-Control': 'private, no-store' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: noCache });

function localClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  return { day: part('year') + '-' + part('month') + '-' + part('day'), hour: Number(part('hour')) };
}
function hoursFor(day: string) {
  return [10, 12, 15, 18, 21].map((hour, i) =>
    hour + (createHash('md5').update(day + ':' + (i + 1)).digest('hex').charCodeAt(0) % 2));
}
function admin(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  return auth.valid && auth.storeId === STORE;
}
export async function GET(req: NextRequest) {
  if (!admin(req)) return json({ error: 'unauthorized' }, 401);
  try {
    const { day } = localClock();
    const [setting, orders] = await Promise.all([
      supabaseAdmin.from('bella_demo_settings').select('enabled,updated_at').eq('store_id', STORE).single(),
      supabaseAdmin.from('bella_demo_orders')
        .select('id,business_day,slot_hour,source,customer_label,items,status,created_at')
        .eq('store_id', STORE).order('created_at', { ascending: false }).limit(100)
    ]);
    if (setting.error) throw setting.error;
    if (orders.error) throw orders.error;
    return json({
      enabled: setting.data.enabled === true, day, scheduledHours: hoursFor(day),
      todayCount: (orders.data || []).filter(o => o.business_day === day && o.source === 'daily_schedule').length,
      orders: orders.data || [], database: 'connected', dispatchDisabled: true, checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[bella-demo-lab] read failed', error);
    return json({ error: 'database_unavailable' }, 503);
  }
}
export async function POST(req: NextRequest) {
  if (!admin(req)) return json({ error: 'unauthorized' }, 401);
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return json({ error: 'invalid_origin' }, 403);
  try {
    const body = await req.json();
    if (body.action === 'toggle' && typeof body.enabled === 'boolean') {
      const { error } = await supabaseAdmin.from('bella_demo_settings').upsert({
        store_id: STORE, enabled: body.enabled, updated_at: new Date().toISOString()
      }, { onConflict: 'store_id' });
      if (error) throw error;
      return json({ success: true, enabled: body.enabled });
    }
    if (body.action === 'manual') {
      const { data: setting, error: settingError } = await supabaseAdmin.from('bella_demo_settings')
        .select('enabled').eq('store_id', STORE).single();
      if (settingError) throw settingError;
      if (!setting.enabled) return json({ error: 'lab_paused' }, 409);
      const { day, hour } = localClock();
      const { data, error } = await supabaseAdmin.from('bella_demo_orders').upsert({
        store_id: STORE, business_day: day, slot_hour: hour, source: 'manual',
        kind: 'simulation', status: 'recebido', customer_label: 'Cliente fictício (teste manual)',
        items: [{ name: 'Pizza fictícia de teste', quantity: 1, price: 0 }],
        metadata: { non_billable: true, no_dispatch: true, no_notifications: true }
      }, { onConflict: 'store_id,business_day,slot_hour,source', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      return json({ success: true, created: data?.length || 0 });
    }
    return json({ error: 'invalid_action' }, 400);
  } catch (error) {
    console.error('[bella-demo-lab] operation failed', error);
    return json({ error: 'database_unavailable' }, 503);
  }
}
