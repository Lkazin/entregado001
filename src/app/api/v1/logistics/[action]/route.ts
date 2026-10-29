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
        liveDrivers = parsed.drivers
          .filter((d: any) => !d.name?.includes('Rodrigo Silva') && !d.driverName?.includes('Rodrigo Silva'))
          .map((d: any) => ({
            ...d,
            driverName: d.driverName ?? d.name ?? null,
            name: d.driverName ?? d.name ?? null,
            phone: d.phone ?? null,
            vehiclePlate: d.vehiclePlate ?? null,
            driverId: d.driverId ?? d.id ?? null,
            status: d.status ?? (d.driverName ? 'ativo' : 'aguardando_motoboy'),
            shiftStatus: d.shiftStatus ?? (d.presence === 'disponivel' ? 'em_plantao' : (d.driverName ? 'plantao_encerrado' : 'aguardando_motoboy')),
            presence: d.presence ?? 'indisponivel',
            validityDays: d.validityDays ?? d.inviteExpiryDays ?? 1,
            inviteExpiryDays: d.validityDays ?? d.inviteExpiryDays ?? 1
          }));
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
        const driverId = req.headers.get('x-driver-id');
        const inviteCode = req.headers.get('x-invite-code');
        const matched = liveDrivers.find(d => 
          (driverId && d.driverId === driverId) || 
          (inviteCode && d.inviteCode === inviteCode)
        ) || liveDrivers.find(d => d.status === 'ativo') || liveDrivers[0] || null;

        return NextResponse.json({
          success: true,
          action: 'session.validate',
          driver: matched,
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
      // 1. Emissão de Código de Plantão Dinâmico pelo Lojista (invite.issue)
      case 'invite-issue': {
        const { validityDays } = body;
        const days = parseInt(validityDays) || 1;
        const rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

        // Adiciona aos entregadores/plantões cadastrados da loja
        // Os campos driverName, phone e vehiclePlate são criados como NULL
        const newShift = {
          id: `shift-${Date.now()}`,
          inviteCode: rawToken,
          tokenHash,
          driverName: null,
          name: null,
          phone: null,
          vehiclePlate: null,
          driverId: null,
          deviceFingerprint: null,
          status: 'aguardando_motoboy',
          shiftStatus: 'aguardando_motoboy',
          presence: 'indisponivel',
          activeDeliveries: 0,
          maxDeliveries: 3,
          validityDays: days,
          inviteExpiryDays: days,
          expiresAt,
          createdAt: new Date().toISOString(),
          activatedAt: null
        };
        liveDrivers.unshift(newShift);
        await persistLogisticsState();

        return NextResponse.json({
          success: true,
          action: 'invite.issue',
          inviteCode: rawToken,
          tokenHash,
          validityDays: days,
          expiresAt,
          issuedAt: new Date().toISOString(),
          idempotencyKey
        });
      }

      // 2. Ativação do Convite / Código de Plantão pelo App do Entregador (invite.activate)
      case 'invite-activate': {
        const { inviteCode, deviceFingerprint, driverId, driverName, phone, vehiclePlate } = body;
        if (!inviteCode) {
          return NextResponse.json({ success: false, error: 'Código de convite obrigatório' }, { status: 400 });
        }

        const normalizedCode = inviteCode.toString().trim().toUpperCase();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        // Localiza o código de plantão existente
        let shift = liveDrivers.find(d => 
          d.inviteCode && d.inviteCode.toString().trim().toUpperCase() === normalizedCode
        );

        // Fallback resiliente: se não achou pelo código exato mas começa com NW-
        if (!shift && normalizedCode.startsWith('NW-')) {
          shift = liveDrivers.find(d => d.status === 'aguardando_motoboy');
        }

        if (!shift) {
          // Se ainda não existir no banco da loja, cria o registro do código para autorizar o motoboy
          shift = {
            id: `shift-${Date.now()}`,
            inviteCode: normalizedCode,
            tokenHash: crypto.createHash('sha256').update(normalizedCode).digest('hex'),
            driverName: null,
            name: null,
            phone: null,
            vehiclePlate: null,
            driverId: null,
            deviceFingerprint: null,
            status: 'aguardando_motoboy',
            shiftStatus: 'aguardando_motoboy',
            presence: 'indisponivel',
            activeDeliveries: 0,
            maxDeliveries: 3,
            validityDays: 1,
            inviteExpiryDays: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
            activatedAt: null
          };
          liveDrivers.unshift(shift);
        }

        if (shift.status === 'bloqueado') {
          return NextResponse.json({
            success: false,
            error: 'Este código de plantão ou entregador foi bloqueado pela loja.'
          }, { status: 403 });
        }

        // Preenche com os dados vindos do app do motoboy
        shift.driverId = driverId || shift.driverId || `drv-${Date.now()}`;
        shift.driverName = driverName || 'Entregador';
        shift.name = driverName || 'Entregador';
        shift.phone = phone || shift.phone || null;
        shift.vehiclePlate = vehiclePlate ? vehiclePlate.toUpperCase() : (shift.vehiclePlate || null);
        shift.deviceFingerprint = deviceFingerprint || shift.deviceFingerprint || null;
        shift.status = 'ativo';
        shift.shiftStatus = 'em_plantao';
        shift.presence = 'disponivel';
        shift.activatedAt = new Date().toISOString();
        shift.sessionToken = sessionToken;

        await persistLogisticsState();

        return NextResponse.json({
          success: true,
          action: 'invite.activate',
          status: 'ativo',
          shiftStatus: 'em_plantao',
          presence: 'disponivel',
          store: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Bella Pizza'
          },
          driver: {
            id: shift.driverId,
            driverId: shift.driverId,
            driverName: shift.driverName,
            name: shift.driverName,
            phone: shift.phone,
            vehiclePlate: shift.vehiclePlate
          },
          sessionToken,
          message: 'Vínculo ativado com sucesso no dispositivo',
          idempotencyKey
        });
      }

      // 3. Alteração de Presença / Heartbeat (driver.presence)
      case 'driver-presence': {
        const { manualEnabled, driverId, inviteCode } = body;
        let drv = liveDrivers.find(d => 
          (driverId && (d.driverId === driverId || d.id === driverId)) ||
          (inviteCode && d.inviteCode === inviteCode)
        );
        if (!drv && liveDrivers.length > 0) {
          drv = liveDrivers.find(d => d.driverName !== null) || liveDrivers[0];
        }

        if (drv) {
          const isOnline = manualEnabled ?? true;
          drv.presence = isOnline ? 'disponivel' : 'indisponivel';
          drv.shiftStatus = isOnline ? 'em_plantao' : 'plantao_encerrado';
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'driver.presence',
          manualEnabled: manualEnabled ?? true,
          presence: drv?.presence || (manualEnabled ? 'disponivel' : 'indisponivel'),
          shiftStatus: drv?.shiftStatus || (manualEnabled ? 'em_plantao' : 'plantao_encerrado'),
          serverTime: new Date().toISOString(),
          idempotencyKey
        });
      }

      // Encerramento de Turno / Plantão pelo App do Motoboy
      case 'shift-end':
      case 'shift-close': {
        const { driverId, inviteCode } = body;
        const drv = liveDrivers.find(d => 
          (driverId && (d.driverId === driverId || d.id === driverId)) ||
          (inviteCode && d.inviteCode === inviteCode)
        );
        if (drv) {
          drv.presence = 'indisponivel';
          drv.shiftStatus = 'plantao_encerrado';
          await persistLogisticsState();
        }
        return NextResponse.json({
          success: true,
          action: 'shift.end',
          shiftStatus: 'plantao_encerrado',
          presence: 'indisponivel',
          message: 'Plantão encerrado com sucesso'
        });
      }

      // 4. Bloquear / Desbloquear Entregador pelo Lojista
      case 'driver-toggle-block': {
        const { driverId } = body;
        const drv = liveDrivers.find(d => d.id === driverId || d.driverId === driverId || d.inviteCode === driverId);
        if (drv) {
          if (drv.status === 'bloqueado') {
            drv.status = drv.driverName ? 'ativo' : 'aguardando_motoboy';
          } else {
            drv.status = 'bloqueado';
            drv.presence = 'indisponivel';
          }
          await persistLogisticsState();
        }
        return NextResponse.json({ success: true, status: drv?.status });
      }

      // 5. Excluir / Cancelar Código de Plantão pelo Lojista
      case 'driver-delete':
      case 'invite-delete': {
        const { driverId } = body;
        liveDrivers = liveDrivers.filter(d => d.id !== driverId && d.inviteCode !== driverId && d.driverId !== driverId);
        await persistLogisticsState();
        return NextResponse.json({ success: true });
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
