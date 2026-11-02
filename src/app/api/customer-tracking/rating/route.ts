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
    const driverName =
      context.driver?.driverName ||
      context.driver?.name ||
      context.assignment?.driverName ||
      context.order.driverName ||
      null;

    // Consulta na fonte autoritativa (tabela order_delivery_ratings)
    let existingRating: any = null;
    const { data: dbRow, error: dbErr } = await supabaseAdmin
      .from('order_delivery_ratings')
      .select('stars, order_stars, driver_stars, comment, created_at, driver_name, order_number')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!dbErr && dbRow) {
      existingRating = {
        stars: dbRow.order_stars || dbRow.stars,
        orderStars: dbRow.order_stars || dbRow.stars,
        driverStars: dbRow.driver_stars ?? null,
        comment: dbRow.comment ?? null,
        driverName: dbRow.driver_name || driverName,
        orderNumber: dbRow.order_number || String(context.order.orderNumber || '').replace('#', ''),
        ratedAt: dbRow.created_at,
      };
    } else if (context.order.rating) {
      // Recuperação definida caso a tabela ainda não tenha sido consultada
      existingRating = context.order.rating;
    }

    return NextResponse.json(
      {
        success: true,
        delivered: isDelivered,
        hasDriver: Boolean(driverName),
        driverName: driverName || undefined,
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

    // Aceita orderStars ou fallback retrocompatível stars
    const rawOrderStars = body?.orderStars !== undefined && body?.orderStars !== null ? body.orderStars : body?.stars;
    const orderStars = Number(rawOrderStars);

    // Avaliação opcional do motoboy (se houver entregador vinculado)
    const rawDriverStars = body?.driverStars;
    const driverStars =
      rawDriverStars !== undefined && rawDriverStars !== null && rawDriverStars !== ''
        ? Number(rawDriverStars)
        : null;

    // Comentário opcional do cliente sobre a experiência (até 500 caracteres)
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 500) : null;

    // 1. Validação estrita dos dados enviados pelo cliente
    if (token.length < 8 || token.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Link de acompanhamento ou token inválido.' },
        { status: 400, headers }
      );
    }

    if (!Number.isInteger(orderStars) || orderStars < 1 || orderStars > 5) {
      return NextResponse.json(
        { success: false, error: 'Avaliação do pedido inválida. Escolha entre 1 e 5 estrelas.' },
        { status: 400, headers }
      );
    }

    if (driverStars !== null && (!Number.isInteger(driverStars) || driverStars < 1 || driverStars > 5)) {
      return NextResponse.json(
        { success: false, error: 'Avaliação do motoboy inválida. Escolha entre 1 e 5 estrelas.' },
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
      null;

    const orderNumber = String(context.order.orderNumber || context.order.id).replace('#', '').trim();

    // 5. Verifica se já existe avaliação confirmada no banco
    const { data: existingRating, error: checkErr } = await supabaseAdmin
      .from('order_delivery_ratings')
      .select('stars, order_stars, driver_stars, comment, created_at, driver_name, order_number')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!checkErr && existingRating) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este pedido já foi avaliado anteriormente.',
          alreadyRated: true,
          rating: {
            stars: existingRating.order_stars || existingRating.stars,
            orderStars: existingRating.order_stars || existingRating.stars,
            driverStars: existingRating.driver_stars ?? null,
            comment: existingRating.comment ?? null,
            driverName: existingRating.driver_name || driverName,
            orderNumber: existingRating.order_number || orderNumber,
            ratedAt: existingRating.created_at,
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
    const insertPayload: any = {
      order_id: orderId,
      order_number: orderNumber,
      tracking_token: token,
      store_id: storeId,
      driver_id: driverId ? String(driverId) : null,
      driver_name: driverName || null,
      stars: orderStars,
      order_stars: orderStars,
      driver_stars: driverStars,
      comment: comment || null,
      created_at: nowIso,
    };

    const insertRes = await supabaseAdmin
      .from('order_delivery_ratings')
      .insert(insertPayload)
      .select('stars, order_stars, driver_stars, comment, created_at, driver_name, order_number')
      .single();

    let inserted: {
      stars?: any;
      order_stars?: any;
      driver_stars?: any;
      comment?: any;
      created_at?: any;
      driver_name?: any;
      order_number?: any;
    } | null = insertRes.data;
    let insertErr = insertRes.error;

    // Se o banco ainda não tiver as novas colunas, fallback seguro para colunas legadas
    if (insertErr && (insertErr.message?.includes('column') || insertErr.code === '42703')) {
      const fallbackPayload = {
        order_id: orderId,
        tracking_token: token,
        store_id: storeId,
        driver_id: driverId ? String(driverId) : null,
        driver_name: driverName || null,
        stars: orderStars,
        created_at: nowIso,
      };
      const fallbackRes = await supabaseAdmin
        .from('order_delivery_ratings')
        .insert(fallbackPayload)
        .select('stars, created_at, driver_name')
        .single();

      inserted = fallbackRes.data
        ? {
            ...fallbackRes.data,
            order_stars: orderStars,
            driver_stars: driverStars,
            comment,
            order_number: orderNumber,
          }
        : null;
      insertErr = fallbackRes.error;
    }

    if (insertErr) {
      // Conflito de concorrência: duas solicitações competiram e a outra venceu
      if (insertErr.code === '23505') {
        const { data: winner } = await supabaseAdmin
          .from('order_delivery_ratings')
          .select('stars, order_stars, driver_stars, comment, created_at, driver_name, order_number')
          .eq('order_id', orderId)
          .maybeSingle();

        return NextResponse.json(
          {
            success: false,
            error: 'Este pedido já foi avaliado anteriormente.',
            alreadyRated: true,
            rating: winner
              ? {
                  stars: winner.order_stars || winner.stars,
                  orderStars: winner.order_stars || winner.stars,
                  driverStars: winner.driver_stars ?? null,
                  comment: winner.comment ?? null,
                  driverName: winner.driver_name || driverName,
                  orderNumber: winner.order_number || orderNumber,
                  ratedAt: winner.created_at,
                }
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
      stars: inserted?.order_stars || inserted?.stars || orderStars,
      orderStars: inserted?.order_stars || inserted?.stars || orderStars,
      driverStars: inserted?.driver_stars !== undefined ? inserted.driver_stars : driverStars,
      comment: inserted?.comment !== undefined ? inserted.comment : comment,
      driverName: inserted?.driver_name || driverName,
      driverId: driverId ? String(driverId) : null,
      orderNumber: inserted?.order_number || orderNumber,
      ratedAt: inserted?.created_at || nowIso,
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

      // Armazena no índice de avaliações da loja no estado
      freshState.ratingsByStore ||= {};
      freshState.ratingsByStore[storeKey] ||= [];
      const storeRatings = freshState.ratingsByStore[storeKey];
      const existIdx = storeRatings.findIndex((r: any) => r.orderId === orderId);
      if (existIdx >= 0) {
        storeRatings[existIdx] = { ...ratingObj, orderId, storeId };
      } else {
        storeRatings.push({ ...ratingObj, orderId, storeId });
      }

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
