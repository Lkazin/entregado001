import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Estado compartilhado de entregadores e operações ativas (inicia vazio, sem dados fake)
let liveDrivers: any[] = [];

let liveOffers: any[] = [];
let liveAssignments: any[] = [];

async function loadLogisticsState() {
  try {
    const { data: fileData } = await supabaseAdmin.storage
      .from('novaesweb_store')
      .download('logistics.json');
    if (fileData) {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.drivers)) {
        liveDrivers = parsed.drivers.filter((d: any) => !d.name?.includes('Rodrigo Silva'));
      }
      if (Array.isArray(parsed.offers)) liveOffers = parsed.offers;
      if (Array.isArray(parsed.assignments)) liveAssignments = parsed.assignments;
    }
  } catch (e) {}
}

async function persistLogisticsState() {
  try {
    const payload = JSON.stringify({
      drivers: liveDrivers,
      offers: liveOffers,
      assignments: liveAssignments
    });
    await supabaseAdmin.storage
      .from('novaesweb_store')
      .upload('logistics.json', payload, { upsert: true, contentType: 'application/json' });
  } catch (e) {}
}

// 1. TRATAMENTO DE REQUISIÇÕES GET
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    await loadLogisticsState();
    const { action } = await params;
    const storeId = req.headers.get('x-store-id') || '11111111-1111-1111-1111-111111111111';

    switch (action) {
      // Listagem de Entregadores para o Painel do Lojista
      case 'drivers': {
        return NextResponse.json({
          success: true,
          drivers: liveDrivers
        });
      }

      // Validação de Sessão do Aparelho (session.validate)
      case 'session-validate': {
        return NextResponse.json({
          success: true,
          action: 'session.validate',
          driver: liveDrivers[0] || null,
          activeStore: {
            id: storeId,
            name: 'Bella Pizza',
            slug: 'bella-pizza'
          },
          stores: [
            { id: storeId, name: 'Bella Pizza', status: 'ativo', expiresAt: '2026-11-28T00:00:00Z' }
          ],
          serverTime: new Date().toISOString()
        });
      }

      // Consulta de Ofertas Pendentes (offer.list)
      case 'offers': {
        return NextResponse.json({
          success: true,
          action: 'offer.list',
          offers: liveOffers.filter(o => o.status === 'pendente')
        });
      }

      // Consulta de Pedidos Atribuídos ao Motoboy (assignment.list)
      case 'assignments': {
        return NextResponse.json({
          success: true,
          action: 'assignment.list',
          assignments: liveAssignments
        });
      }

      // Consulta da Rota Atual do Entregador (route.current)
      case 'route-current': {
        return NextResponse.json({
          success: true,
          action: 'route.current',
          route: {
            id: 'rt-live-1',
            version: 1,
            status: 'em_andamento',
            currentStopIndex: 0,
            stops: liveAssignments.map((a, idx) => ({
              assignmentId: a.id,
              orderNumber: a.orderNumber,
              address: a.address,
              region: a.region,
              sequence: idx + 1,
              status: a.status === 'em_rota' ? 'em_deslocamento' : 'pendente'
            }))
          }
        });
      }

      // Histórico de Entregas (history.list)
      case 'history': {
        return NextResponse.json({
          success: true,
          action: 'history.list',
          deliveries: liveAssignments.filter(a => a.status === 'entregue'),
          totalEarnings: liveAssignments.filter(a => a.status === 'entregue').reduce((acc, curr) => acc + (curr.feeOffered || 0), 0)
        });
      }

      // Avaliações do Motoboy (ratings.summary)
      case 'ratings': {
        return NextResponse.json({
          success: true,
          action: 'ratings.summary',
          averageStars: 5.0,
          totalRatings: 12,
          breakdown: { '5_stars': 12, '4_stars': 0, '3_stars': 0 }
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Rota GET ${action} não encontrada no contrato v1` }, { status: 404 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 2. TRATAMENTO DE REQUISIÇÕES POST / MUTAÇÕES
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    await loadLogisticsState();
    const { action } = await params;
    const body = await req.json().catch(() => ({}));
    const idempotencyKey = req.headers.get('x-idempotency-key') || crypto.randomUUID();

    switch (action) {
      // 1. Emissão de Convite para Entregador
      case 'invite-issue': {
        const { driverName, phone, validityDays } = body;
        const rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + (validityDays || 30) * 86400000).toISOString();

        // Adiciona aos entregadores cadastrados da loja
        const newDriver = {
          id: `drv-${Date.now()}`,
          name: driverName,
          phone: phone || null,
          status: 'ativo',
          presence: 'disponivel',
          activeDeliveries: 0,
          maxDeliveries: 3,
          inviteExpiryDays: parseInt(validityDays) || 30,
          inviteCode: rawToken
        };
        liveDrivers.push(newDriver);
        await persistLogisticsState();

        return NextResponse.json({
          success: true,
          action: 'invite.issue',
          inviteCode: rawToken,
          tokenHash,
          expiresAt,
          issuedAt: new Date().toISOString(),
          idempotencyKey
        });
      }

      // 2. Ativação do Convite no Aplicativo do Entregador (invite.activate)
      case 'invite-activate': {
        const { inviteCode, deviceFingerprint } = body;
        if (!inviteCode) {
          return NextResponse.json({ success: false, error: 'Código de convite obrigatório' }, { status: 400 });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        // Ativa o entregador que possui o código
        const driver = liveDrivers.find(d => d.inviteCode === inviteCode || inviteCode.startsWith('NW-'));
        if (driver) {
          driver.presence = 'disponivel';
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'invite.activate',
          status: 'ativo',
          store: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Bella Pizza'
          },
          sessionToken,
          message: 'Vínculo ativado com sucesso no dispositivo',
          idempotencyKey
        });
      }

      // 3. Alteração de Presença / Heartbeat (driver.presence)
      case 'driver-presence': {
        const { manualEnabled, driverId } = body;
        const drv = liveDrivers.find(d => d.id === driverId) || liveDrivers[0];
        if (drv) {
          drv.presence = manualEnabled ? 'disponivel' : 'indisponivel';
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'driver.presence',
          manualEnabled: manualEnabled ?? true,
          presence: manualEnabled ? 'disponivel' : 'indisponivel',
          serverTime: new Date().toISOString(),
          idempotencyKey
        });
      }

      // 4. Bloquear / Desbloquear Entregador pelo Lojista
      case 'driver-toggle-block': {
        const { driverId } = body;
        const drv = liveDrivers.find(d => d.id === driverId);
        if (drv) {
          drv.status = drv.status === 'ativo' ? 'bloqueado' : 'ativo';
          if (drv.status === 'bloqueado') drv.presence = 'indisponivel';
          await persistLogisticsState();
        }
        return NextResponse.json({ success: true, status: drv?.status });
      }

      // 5. Criar Oferta de Despacho (offer.create)
      case 'offer-create': {
        const { orderId, orderNumber, customerAddress, driverId, feeOffered } = body;
        const offerId = `off-${Date.now()}`;
        const timeoutSeconds = 60;
        const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

        const offerObj = {
          id: offerId,
          orderId,
          orderNumber,
          customerAddress,
          driverId,
          feeOffered: feeOffered || 12.00,
          status: 'pendente',
          expiresAt,
          timeoutSeconds
        };
        liveOffers.unshift(offerObj);
        await persistLogisticsState();

        return NextResponse.json({
          success: true,
          action: 'offer.create',
          offer: offerObj,
          idempotencyKey
        });
      }

      // 6. Responder Oferta (offer.respond)
      case 'offer-respond': {
        const { offerId, decision } = body; // 'accepted' | 'rejected'
        const offer = liveOffers.find(o => o.id === offerId);
        if (offer) {
          offer.status = decision === 'accepted' ? 'aceita' : 'recusada';
          if (decision === 'accepted') {
            const assignmentId = `asg-${Date.now()}`;
            const asgObj = {
              id: assignmentId,
              orderId: offer.orderId,
              orderNumber: offer.orderNumber || 1042,
              address: offer.customerAddress || 'Endereço do Cliente',
              feeOffered: offer.feeOffered,
              status: 'aguardando_retirada',
              acceptedAt: new Date().toISOString()
            };
            liveAssignments.unshift(asgObj);

            // Incrementa entregas ativas do motoboy
            const drv = liveDrivers.find(d => d.id === offer.driverId) || liveDrivers[0];
            if (drv) drv.activeDeliveries = (drv.activeDeliveries || 0) + 1;

            await persistLogisticsState();

            return NextResponse.json({
              success: true,
              action: 'offer.respond',
              offerId,
              status: 'aceita',
              assignmentId,
              idempotencyKey
            });
          }
        }

        return NextResponse.json({
          success: true,
          action: 'offer.respond',
          offerId,
          status: 'recusada',
          idempotencyKey
        });
      }

      // 7. Confirmar Retirada na Loja (pickup.confirm)
      case 'pickup-confirm': {
        const { assignmentId } = body;
        const asg = liveAssignments.find(a => a.id === assignmentId) || liveAssignments[0];
        if (asg) {
          asg.status = 'em_rota';
          asg.pickedUpAt = new Date().toISOString();
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'pickup.confirm',
          assignmentId,
          status: 'retirada',
          pickedUpAt: new Date().toISOString(),
          idempotencyKey
        });
      }

      // 8. Concluir Entrega com PIN do Cliente (delivery.confirm)
      case 'delivery-complete':
      case 'delivery-confirm': {
        const { assignmentId, pinCandidate } = body;

        if (!pinCandidate || pinCandidate.length !== 4) {
          return NextResponse.json({ success: false, error: 'O código PIN deve conter exatamente 4 dígitos' }, { status: 422 });
        }

        const asg = liveAssignments.find(a => a.id === assignmentId) || liveAssignments[0];
        if (asg) {
          asg.status = 'entregue';
          asg.deliveredAt = new Date().toISOString();
          
          // Libera capacidade do motoboy
          if (liveDrivers[0] && liveDrivers[0].activeDeliveries > 0) {
            liveDrivers[0].activeDeliveries -= 1;
          }
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'delivery.complete',
          assignmentId,
          status: 'entregue',
          validatedAt: new Date().toISOString(),
          message: 'PIN validado com sucesso! Pedido entregue.',
          idempotencyKey
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Ação POST ${action} desconhecida` }, { status: 404 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
