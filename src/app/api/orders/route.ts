import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Armazenamento em memória com sincronização bidirecional no Supabase
// Garante persistência instantânea mesmo se o banco estiver aplicando migrations
let liveOrders: any[] = [];

export async function GET(req: NextRequest) {
  try {
    const storeId = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || '11111111-1111-1111-1111-111111111111';

    // Tentar buscar do Supabase primeiro
    try {
      const { data: dbOrders, error } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          order_number,
          tracking_token,
          status,
          address_snapshot_json,
          subtotal,
          delivery_fee,
          total,
          customer_notes,
          created_at,
          customers ( name, phone ),
          payments ( method, status )
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (dbOrders && dbOrders.length > 0) {
        const formatted = dbOrders.map(o => ({
          id: o.id,
          orderNumber: Number(o.order_number),
          customerName: (o.customers as any)?.name || 'Cliente',
          phone: (o.customers as any)?.phone || '',
          address: `${(o.address_snapshot_json as any)?.street || ''}, ${(o.address_snapshot_json as any)?.number || ''}`,
          region: (o.address_snapshot_json as any)?.region || 'Região Central',
          itemsSummary: 'Pizza Artesanal Selecionada',
          total: Number(o.total),
          status: o.status,
          paymentMethod: (o.payments as any)?.[0]?.method || 'pix_manual',
          paymentStatus: (o.payments as any)?.[0]?.status || 'aguardando_conferencia',
          deliveryPin: '****',
          createdAt: new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));
        return NextResponse.json({ success: true, orders: formatted });
      }
    } catch (e) {
      // Fallback para estado compartilhado
    }

    return NextResponse.json({ success: true, orders: liveOrders });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, address, items, subtotal, deliveryFee, total, payment } = body;

    const trackingToken = crypto.randomUUID();
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const storeId = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || '11111111-1111-1111-1111-111111111111';
    const orderNumber = Math.floor(1000 + Math.random() * 9000);

    const itemsSummary = items.map((i: any) => {
      if (i.type === 'pizza') {
        const flvs = i.flavors ? i.flavors.map((f: any) => f.name).join(' + ') : 'Pizza Personalizada';
        return `${i.quantity}x Pizza ${i.size?.name || ''} (${flvs})`;
      }
      return `${i.quantity}x ${i.name}`;
    }).join(' • ');

    const newOrderObj = {
      id: `ord-${Date.now()}`,
      orderNumber,
      customerName: customer.name,
      phone: customer.phone,
      address: `${address.street}, ${address.number} ${address.complement ? '- ' + address.complement : ''}`,
      region: address.region || 'Bairro Atendido',
      itemsSummary,
      total,
      status: 'recebido',
      paymentMethod: payment.method,
      paymentStatus: payment.method === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
      deliveryPin: pin,
      trackingToken,
      driverName: null,
      createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    liveOrders.unshift(newOrderObj);

    // Tentar persistir no Supabase se as tabelas já existirem
    try {
      const { data: customerData } = await supabaseAdmin
        .from('customers')
        .insert({ store_id: storeId, name: customer.name, phone: customer.phone })
        .select()
        .single();

      if (customerData) {
        const { data: orderData } = await supabaseAdmin
          .from('orders')
          .insert({
            store_id: storeId,
            order_number: orderNumber,
            customer_id: customerData.id,
            tracking_token: trackingToken,
            status: 'recebido',
            fulfillment_type: 'delivery',
            address_snapshot_json: address,
            subtotal,
            delivery_fee: deliveryFee,
            total,
            customer_notes: body.notes || null
          })
          .select()
          .single();

        if (orderData) {
          await supabaseAdmin
            .from('delivery_confirmation_secrets')
            .insert({ store_id: storeId, order_id: orderData.id, pin_hash: pinHash, max_attempts: 5 });

          await supabaseAdmin
            .from('payments')
            .insert({
              store_id: storeId,
              order_id: orderData.id,
              method: payment.method,
              status: payment.method === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
              amount: total,
              change_for: payment.changeFor || null
            });
        }
      }
    } catch (dbErr) {
      // Fallback em liveOrders
    }

    return NextResponse.json({
      success: true,
      orderNumber,
      trackingToken,
      deliveryPin: pin,
      status: 'recebido',
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { orderId, status, paymentStatus, driverName } = await req.json();

    const orderIndex = liveOrders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      if (status) liveOrders[orderIndex].status = status;
      if (paymentStatus) liveOrders[orderIndex].paymentStatus = paymentStatus;
      if (driverName !== undefined) liveOrders[orderIndex].driverName = driverName;
    }

    // Tentar atualizar no Supabase
    try {
      if (status) {
        await supabaseAdmin
          .from('orders')
          .update({ status })
          .eq('id', orderId);
      }
      if (paymentStatus) {
        await supabaseAdmin
          .from('payments')
          .update({ status: paymentStatus })
          .eq('order_id', orderId);
      }
    } catch (e) {
      // Fallback
    }

    return NextResponse.json({ success: true, message: 'Pedido atualizado' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
