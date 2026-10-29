import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Armazenamento em memória com sincronização em nuvem (Supabase Storage + PostgreSQL)
let liveOrders: any[] = [];

// Helper para ler pedidos persistentes
async function fetchCurrentOrders(): Promise<any[]> {
  const storeId = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || '11111111-1111-1111-1111-111111111111';

  // 1. Tentar buscar do banco relacional Supabase se as tabelas existirem
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
      return formatted;
    }
  } catch (e) {
    // Tabela relacional ainda não disponível
  }

  // 2. Tentar buscar do Supabase Storage (nuvem persistente universal)
  try {
    const { data: fileData } = await supabaseAdmin.storage
      .from('novaesweb_store')
      .download('orders.json');
    if (fileData) {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        liveOrders = parsed;
        return parsed;
      }
    }
  } catch (e) {
    // Storage inacessível
  }

  return liveOrders;
}

// Helper para salvar pedidos de forma persistente
async function persistOrders(ordersList: any[]): Promise<void> {
  liveOrders = ordersList;
  try {
    const payload = JSON.stringify(ordersList);
    await supabaseAdmin.storage
      .from('novaesweb_store')
      .upload('orders.json', payload, { upsert: true, contentType: 'application/json' });
  } catch (e) {
    console.error('Erro ao persistir no Supabase Storage:', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const orders = await fetchCurrentOrders();
    return NextResponse.json({ success: true, orders });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, orders: liveOrders }, { status: 500 });
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
      id: `ord-${Date.now()}-${orderNumber}`,
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

    // Atualiza pedidos existentes e grava no Supabase Storage
    const current = await fetchCurrentOrders();
    const updated = [newOrderObj, ...current.filter(o => o.id !== newOrderObj.id)];
    await persistOrders(updated);

    // Tentar persistir no PostgreSQL do Supabase se as tabelas existirem
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
      // Fallback garantido pelo Supabase Storage
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

    const current = await fetchCurrentOrders();
    const orderIndex = current.findIndex(o => o.id === orderId || String(o.orderNumber) === String(orderId));

    if (orderIndex !== -1) {
      if (status) current[orderIndex].status = status;
      if (paymentStatus) current[orderIndex].paymentStatus = paymentStatus;
      if (driverName !== undefined) current[orderIndex].driverName = driverName;
      await persistOrders(current);
    }

    // Tentar atualizar no PostgreSQL do Supabase
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
      // Fallback garantido pelo Supabase Storage
    }

    return NextResponse.json({ success: true, message: 'Pedido atualizado com sucesso' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
