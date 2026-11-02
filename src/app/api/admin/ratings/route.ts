import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { readLogisticsState } from '@/lib/logistics/state-store';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
};

export async function GET(req: NextRequest) {
  try {
    // 1. Verificação estrita de autenticação administrativa do lojista
    const auth = verifyAdminRequest(req);
    if (!auth.valid || !auth.storeId) {
      return NextResponse.json(
        { success: false, error: 'Acesso restrito ao painel da loja.' },
        { status: 401, headers }
      );
    }

    const storeId = timelineStoreKey(auth.storeId);
    const { searchParams } = new URL(req.url);

    const period = searchParams.get('period')?.trim() || 'all'; // 'today' | '7d' | '30d' | 'all'
    const driverFilter = searchParams.get('driverId')?.trim() || 'all';
    const searchQuery = (searchParams.get('search') || '').trim().toLowerCase();

    // 2. Consulta autoritativa no banco de dados isolada pela loja (tenant-scoped)
    const ratingsMap = new Map<string, any>();

    try {
      const { data: dbRows, error: dbErr } = await supabaseAdmin
        .from('order_delivery_ratings')
        .select('id, order_id, order_number, store_id, driver_id, driver_name, stars, order_stars, driver_stars, comment, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (!dbErr && Array.isArray(dbRows)) {
        for (const row of dbRows) {
          const item = {
            id: String(row.id || row.order_id),
            orderId: String(row.order_id),
            orderNumber: row.order_number || row.order_id,
            storeId: row.store_id,
            driverId: row.driver_id || null,
            driverName: row.driver_name || null,
            orderStars: Number(row.order_stars || row.stars || 5),
            driverStars: row.driver_stars !== null && row.driver_stars !== undefined ? Number(row.driver_stars) : null,
            comment: row.comment || null,
            createdAt: row.created_at || new Date().toISOString(),
          };
          ratingsMap.set(item.orderId, item);
        }
      }
    } catch (dbErr) {
      console.warn('[AdminRatings] Erro ao consultar tabela, usando projeções em memória:', dbErr);
    }

    // 3. Fallback/Complemento das projeções de logística da própria loja
    try {
      const { state } = await readLogisticsState();
      // Projeções da loja
      const storeProjections = state.orderProjectionsByStore?.[storeId] || {};
      for (const [orderId, proj] of Object.entries<any>(storeProjections)) {
        if (proj?.rating && !ratingsMap.has(orderId)) {
          const r = proj.rating;
          ratingsMap.set(orderId, {
            id: orderId,
            orderId,
            orderNumber: r.orderNumber || proj.orderNumber || orderId,
            storeId,
            driverId: r.driverId || proj.driverId || null,
            driverName: r.driverName || proj.driverName || null,
            orderStars: Number(r.orderStars || r.stars || 5),
            driverStars: r.driverStars !== null && r.driverStars !== undefined ? Number(r.driverStars) : null,
            comment: r.comment || null,
            createdAt: r.ratedAt || proj.orderProjectionUpdatedAt || new Date().toISOString(),
          });
        }
      }

      // Ratings indexados no state
      const stateStoreRatings = state.ratingsByStore?.[storeId] || [];
      for (const r of stateStoreRatings) {
        if (r?.orderId && !ratingsMap.has(r.orderId)) {
          ratingsMap.set(r.orderId, {
            id: r.orderId,
            orderId: r.orderId,
            orderNumber: r.orderNumber || r.orderId,
            storeId,
            driverId: r.driverId || null,
            driverName: r.driverName || null,
            orderStars: Number(r.orderStars || r.stars || 5),
            driverStars: r.driverStars !== null && r.driverStars !== undefined ? Number(r.driverStars) : null,
            comment: r.comment || null,
            createdAt: r.ratedAt || new Date().toISOString(),
          });
        }
      }
    } catch {}

    const allList = Array.from(ratingsMap.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );

    // 4. Cálculo das médias gerais de cada motoboy da própria loja (antes dos filtros de busca/período)
    const driverStatsMap = new Map<string, { driverId: string; driverName: string; totalRatings: number; starsSum: number }>();

    for (const item of allList) {
      if (item.driverName && item.driverStars !== null) {
        const key = item.driverId || item.driverName;
        const cur = driverStatsMap.get(key) || {
          driverId: item.driverId || key,
          driverName: item.driverName,
          totalRatings: 0,
          starsSum: 0,
        };
        cur.totalRatings += 1;
        cur.starsSum += item.driverStars;
        driverStatsMap.set(key, cur);
      }
    }

    const driversList = Array.from(driverStatsMap.values()).map((d) => ({
      driverId: d.driverId,
      driverName: d.driverName,
      totalRatings: d.totalRatings,
      averageStars: d.totalRatings > 0 ? Number((d.starsSum / d.totalRatings).toFixed(1)) : 0,
    })).sort((a, b) => b.totalRatings - a.totalRatings);

    // 5. Aplicação dos filtros solicitados pelo lojista
    const now = Date.now();
    const filteredList = allList.filter((item) => {
      // Filtro por período
      if (period !== 'all') {
        const itemTime = Date.parse(item.createdAt);
        if (Number.isFinite(itemTime)) {
          const diffMs = now - itemTime;
          if (period === 'today' && diffMs > 24 * 60 * 60 * 1000) return false;
          if (period === '7d' && diffMs > 7 * 24 * 60 * 60 * 1000) return false;
          if (period === '30d' && diffMs > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      // Filtro por motoboy
      if (driverFilter !== 'all') {
        const matchId = item.driverId === driverFilter;
        const matchName = item.driverName?.toLowerCase() === driverFilter.toLowerCase();
        if (!matchId && !matchName) return false;
      }

      // Filtro por busca (número do pedido, comentário ou nome do entregador)
      if (searchQuery) {
        const numMatch = String(item.orderNumber || '').toLowerCase().includes(searchQuery);
        const commentMatch = (item.comment || '').toLowerCase().includes(searchQuery);
        const driverMatch = (item.driverName || '').toLowerCase().includes(searchQuery);
        if (!numMatch && !commentMatch && !driverMatch) return false;
      }

      return true;
    });

    // 6. Métricas do conjunto filtrado
    let totalOrderStars = 0;
    let countOrderStars = 0;
    let totalDriverStars = 0;
    let countDriverStars = 0;

    for (const item of filteredList) {
      if (item.orderStars) {
        totalOrderStars += item.orderStars;
        countOrderStars += 1;
      }
      if (item.driverStars) {
        totalDriverStars += item.driverStars;
        countDriverStars += 1;
      }
    }

    const metrics = {
      totalRatings: filteredList.length,
      averageOrderStars: countOrderStars > 0 ? Number((totalOrderStars / countOrderStars).toFixed(1)) : 0,
      averageDriverStars: countDriverStars > 0 ? Number((totalDriverStars / countDriverStars).toFixed(1)) : 0,
      totalComments: filteredList.filter((item) => Boolean(item.comment)).length,
    };

    return NextResponse.json(
      {
        success: true,
        storeId,
        metrics,
        drivers: driversList,
        ratings: filteredList,
      },
      { headers }
    );
  } catch (err: any) {
    console.error('[AdminRatings] Erro ao listar avaliações:', err);
    return NextResponse.json(
      { success: false, error: 'Não foi possível carregar as avaliações no momento.' },
      { status: 500, headers }
    );
  }
}
