import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readLogisticsState, writeLogisticsState } from '@/lib/logistics/state-store';
import { trackingContext } from '@/lib/logistics/customer-tracking-policy';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() || '';
    if (token.length < 8 || token.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Link de acompanhamento ou token inválido.' },
        { status: 400, headers }
      );
    }

    const { state } = await readLogisticsState();
    const context = trackingContext(state, token);

    if (!context || !context.order) {
      return NextResponse.json(
        { success: false, error: 'Pedido não encontrado.' },
        { status: 404, headers }
      );
    }

    const isDelivered = context.order.status === 'concluido' || context.order.status === 'entregue';
    const orderId = String(context.order.id);

    // Consulta na fonte autoritativa (tabela order_delivery_ratings)
    let existingRating: { stars: number; ratedAt: string; driverName?: string } | null = null;
    const { data: dbRow, error: dbErr } = await supabaseAdmin
      .from('order_delivery_ratings')
      .select('stars, created_at, driver_name')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!dbErr && dbRow) {
      existingRating = {
        stars: dbRow.stars,
        ratedAt: dbRow.created_at,
        driverName: dbRow.driver_name || undefined,
      };
    } else if (context.order.rating) {
      // Recuperação definida caso a tabela ainda não tenha sido consultada
      existingRating = context.order.rating;
    }

    return NextResponse.json(
      {
        success: true,
        delivered: isDelivered,
        rated: Boolean(existingRating),
        rating: existingRating,
      },
      { headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Não foi possível consultar a avaliação no momento.' },
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const stars = Number(body?.stars);

    // 1. Validação estrita dos dados enviados pelo cliente (apenas token e stars)
    if (token.length < 8 || token.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Link de acompanhamento ou token inválido.' },
        { status: 400, headers }
      );
    }

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json(
        { success: false, error: 'Nota de avaliação inválida. Escolha entre 1 e 5 estrelas.' },
        { status: 400, headers }
      );
    }

    // 2. Resolução autoritativa do pedido, loja e entregador via backend (nunca confiando em orderId ou storeId do cliente)
    const { state, revision } = await readLogisticsState();
    const context = trackingContext(state, token);

    if (!context || !context.order) {
      return NextResponse.json(
        { success: false, error: 'Pedido não encontrado para este link.' },
        { status: 404, headers }
      );
    }

    // 3. Exige entrega confirmada
    const isDelivered = context.order.status === 'concluido' || context.order.status === 'entregue';
    if (!isDelivered) {
      return NextResponse.json(
        { success: false, error: 'O pedido precisa estar confirmado como entregue antes de ser avaliado.' },
        { status: 400, headers }
      );
    }

    // 4. Exige atribuição correspondente válida
    if (!context.assignment?.id) {
      return NextResponse.json(
        { success: false, error: 'Entrega não localizada para este pedido.' },
        { status: 400, headers }
      );
    }

    const orderId = String(context.order.id);
    const storeId = context.storeId;
    const storeKey = timelineStoreKey(storeId);
    const driverId = context.driver?.id || context.assignment?.driverId || null;
    const driverName =
      context.driver?.driverName ||
      context.driver?.name ||
      context.assignment?.driverName ||
      context.order.driverName ||
      'Entregador';

    // 5. Verifica se já existe avaliação confirmada no banco
    const { data: existingRating, error: checkErr } = await supabaseAdmin
      .from('order_delivery_ratings')
      .select('stars, created_at, driver_name')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!checkErr && existingRating) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este pedido já foi avaliado anteriormente.',
          alreadyRated: true,
          rating: {
            stars: existingRating.stars,
            ratedAt: existingRating.created_at,
            driverName: existingRating.driver_name || driverName,
          },
        },
        { status: 409, headers }
      );
    }

    // Também verifica no estado JSON caso haja divergência
    if (context.order.rating) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este pedido já foi avaliado anteriormente.',
          alreadyRated: true,
          rating: context.order.rating,
        },
        { status: 409, headers }
      );
    }

    // 6. Gravação na fonte autoritativa (tabela order_delivery_ratings) com tratamento explícito de error
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('order_delivery_ratings')
      .insert({
        order_id: orderId,
        tracking_token: token,
        store_id: storeId,
        driver_id: driverId ? String(driverId) : null,
        driver_name: driverName,
        stars,
        created_at: nowIso,
      })
      .select('stars, created_at, driver_name')
      .single();

    if (insertErr) {
      // Conflito de concorrência: duas solicitações competiram e a outra venceu
      if (insertErr.code === '23505') {
        const { data: winner } = await supabaseAdmin
          .from('order_delivery_ratings')
          .select('stars, created_at, driver_name')
          .eq('order_id', orderId)
          .maybeSingle();

        return NextResponse.json(
          {
            success: false,
            error: 'Este pedido já foi avaliado anteriormente.',
            alreadyRated: true,
            rating: winner
              ? { stars: winner.stars, ratedAt: winner.created_at, driverName: winner.driver_name || driverName }
              : null,
          },
          { status: 409, headers }
        );
      }

      // Falha real de persistência: NÃO retorna sucesso falso
      console.error('Falha ao persistir avaliação no banco:', insertErr);
      return NextResponse.json(
        { success: false, error: 'Não foi possível registrar a avaliação no momento. Tente novamente mais tarde.' },
        { status: 500, headers }
      );
    }

    const ratingObj = {
      stars: inserted?.stars || stars,
      ratedAt: inserted?.created_at || nowIso,
      driverName: inserted?.driver_name || driverName,
    };

    // 7. Projeção atômica no estado de logística para sincronia instantânea
    try {
      const { state: freshState, revision: freshRev } = await readLogisticsState();
      if (!freshState.orderProjectionsByStore) freshState.orderProjectionsByStore = {};
      if (!freshState.orderProjectionsByStore[storeKey]) freshState.orderProjectionsByStore[storeKey] = {};

      const proj =
        freshState.orderProjectionsByStore[storeKey][orderId] || { ...context.order };

      proj.rating = ratingObj;
      proj.orderProjectionUpdatedAt = new Date().toISOString();
      freshState.orderProjectionsByStore[storeKey][orderId] = proj;

      await writeLogisticsState(freshState, freshRev);
    } catch {
      // Projeção com recuperação definida: a gravação autoritativa no banco foi concluída
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Avaliação registrada com sucesso! Obrigado pelo seu feedback.',
        rating: ratingObj,
      },
      { headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro inesperado ao registrar sua avaliação.' },
      { status: 500, headers }
    );
  }
}
