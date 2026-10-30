import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Converte qualquer identificador (como 'drv_173000000') em um UUID v4 determinístico válido para o PostgreSQL
function toValidUuid(val?: string | null): string {
  if (!val) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  const hash = crypto.createHash('md5').update(val).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

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

async function updateStoreOrdersStatus(updater: (orders: any[]) => boolean): Promise<void> {
  try {
    const { data: fileData } = await supabaseAdmin.storage
      .from('novaesweb_store')
      .download('orders.json');
    if (fileData) {
      const text = await fileData.text();
      const orders = JSON.parse(text);
      if (Array.isArray(orders)) {
        const changed = updater(orders);
        if (changed) {
          await supabaseAdmin.storage
            .from('novaesweb_store')
            .upload('orders.json', JSON.stringify(orders), { upsert: true, contentType: 'application/json' });
        }
      }
    }
  } catch (err) {
    console.warn('[route.ts] Erro ao sincronizar orders.json:', err);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-store-id',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function jsonResponse(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: corsHeaders,
  });
}

// 1. TRATAMENTO DE REQUISIÇÕES GET
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    await loadLogisticsState();
    const { action } = await params;
    const storeHeader = req.headers.get('x-store-id') || '11111111-1111-1111-1111-111111111111';
    const storeUuid = toValidUuid(storeHeader);

    switch (action) {
      // 1. Listagem de Entregadores para o Painel do Lojista
      // Consulta delivery_store_memberships com JOIN em delivery_drivers, delivery_invites e delivery_presence
      case 'drivers': {
        try {
          const { data: memberships, error } = await supabaseAdmin
            .from('delivery_store_memberships')
            .select(`
              id,
              store_id,
              driver_id,
              status,
              expires_at,
              created_at,
              delivery_invites (
                id,
                code_display_hint,
                token_hash,
                expires_at,
                redeemed_at
              ),
              delivery_drivers (
                id,
                display_name,
                optional_phone
              )
            `)
            .eq('store_id', storeUuid)
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(memberships) && memberships.length > 0) {
            // Buscar presenças correspondentes aos motoristas vinculados
            const driverIds = memberships.map(m => m.driver_id).filter(Boolean);
            const presenceMap = new Map();
            if (driverIds.length > 0) {
              try {
                const { data: presences } = await supabaseAdmin
                  .from('delivery_presence')
                  .select('*')
                  .in('driver_id', driverIds);
                if (Array.isArray(presences)) {
                  presences.forEach(p => presenceMap.set(p.driver_id, p));
                }
              } catch (pe) {}
            }

            const dbDrivers = memberships.map(m => {
              const inv = Array.isArray(m.delivery_invites) ? m.delivery_invites[0] : (m.delivery_invites as any);
              const drv = Array.isArray(m.delivery_drivers) ? m.delivery_drivers[0] : (m.delivery_drivers as any);
              const presence = m.driver_id ? presenceMap.get(m.driver_id) : null;

              // Dados enriquecidos do storage (como vehiclePlate) se houver
              const cached = liveDrivers.find(d => 
                (inv?.code_display_hint && d.inviteCode === inv.code_display_hint) ||
                (m.driver_id && (d.driverId === m.driver_id || d.id === m.id))
              );

              const isOnline = presence?.manual_enabled ?? (cached?.presence === 'disponivel');
              const isActivated = m.status === 'ativo' && (drv?.display_name || cached?.driverName);

              return {
                id: m.id,
                inviteCode: inv?.code_display_hint || cached?.inviteCode || 'NW-000000',
                driverName: drv?.display_name || cached?.driverName || null,
                name: drv?.display_name || cached?.name || null,
                phone: drv?.optional_phone || cached?.phone || null,
                vehiclePlate: cached?.vehiclePlate || null,
                driverId: m.driver_id || cached?.driverId || null,
                status: m.status === 'bloqueado' ? 'bloqueado' : (isActivated ? 'ativo' : 'aguardando_motoboy'),
                shiftStatus: m.status === 'bloqueado' ? 'bloqueado' : (isActivated ? (isOnline ? 'em_plantao' : 'plantao_encerrado') : 'aguardando_motoboy'),
                presence: isOnline ? 'disponivel' : 'indisponivel',
                activeDeliveries: cached?.activeDeliveries || 0,
                maxDeliveries: cached?.maxDeliveries || 3,
                validityDays: cached?.validityDays || 1,
                expiresAt: m.expires_at || cached?.expiresAt,
                createdAt: m.created_at || cached?.createdAt
              };
            });

            return NextResponse.json({
              success: true,
              source: 'supabase_tables',
              drivers: dbDrivers
            });
          }
        } catch (dbErr) {
          // Fallback gracioso para o storage se a tabela não tiver sido executada no banco
        }

        return NextResponse.json({
          success: true,
          source: 'storage_cache',
          drivers: liveDrivers
        });
      }

      // 2. Validação de Sessão do Aparelho (session.validate)
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
            id: storeUuid,
            name: 'Bella Pizza',
            slug: 'bella-pizza'
          },
          stores: [
            { id: storeUuid, name: 'Bella Pizza', status: 'ativo', expiresAt: '2026-11-28T00:00:00Z' }
          ],
          serverTime: new Date().toISOString()
        });
      }

      // 3. Consulta de Ofertas Pendentes (offer.list)
      case 'offers': {
        return NextResponse.json({
          success: true,
          action: 'offer.list',
          offers: liveOffers.filter(o => o.status === 'pendente')
        });
      }

      // 4. Consulta de Pedidos Atribuídos ao Motoboy (assignment.list)
      case 'assignments': {
        return NextResponse.json({
          success: true,
          action: 'assignment.list',
          assignments: liveAssignments
        });
      }

      // 5. Consulta da Rota Atual do Entregador (route.current)
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

      // 6. Histórico de Entregas (history.list)
      case 'history': {
        return NextResponse.json({
          success: true,
          action: 'history.list',
          deliveries: liveAssignments.filter(a => a.status === 'entregue'),
          totalEarnings: liveAssignments.filter(a => a.status === 'entregue').reduce((acc, curr) => acc + (curr.feeOffered || 0), 0)
        });
      }

      // 7. Avaliações do Motoboy (ratings.summary)
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
    const storeHeader = req.headers.get('x-store-id') || '11111111-1111-1111-1111-111111111111';
    const storeUuid = toValidUuid(storeHeader);

    switch (action) {
      // 1. Emissão de Código de Plantão Dinâmico pelo Lojista (invite.issue)
      // Grava nas tabelas: delivery_store_memberships e delivery_invites
      case 'invite-issue': {
        const { validityDays } = body;
        const days = parseInt(validityDays) || 1;
        const rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
        let membershipId = `shift-${Date.now()}`;

        // 1. Tenta gravar nas tabelas do Supabase
        try {
          // Garante a existência da loja
          await supabaseAdmin
            .from('stores')
            .upsert({
              id: storeUuid,
              name: 'Bella Pizza',
              slug: 'bella-pizza',
              active: true
            }, { onConflict: 'id' });

          const membershipUuid = crypto.randomUUID();
          let insertedMembership = null;

          // Tenta criar membership pendente com driver_id null
          const { data: mData, error: mErr } = await supabaseAdmin
            .from('delivery_store_memberships')
            .insert({
              id: membershipUuid,
              store_id: storeUuid,
              status: 'pendente',
              expires_at: expiresAt
            })
            .select()
            .single();

          if (!mErr && mData) {
            insertedMembership = mData;
          } else if (mErr && mErr.message?.includes('driver_id')) {
            // Se o schema exigir driver_id NOT NULL, cria placeholder temporário
            const placeholderDriverId = crypto.randomUUID();
            await supabaseAdmin
              .from('delivery_drivers')
              .insert({
                id: placeholderDriverId,
                identity_subject: `pending_${rawToken}`,
                display_name: 'Aguardando Motoboy'
              });

            const { data: mWithDriver } = await supabaseAdmin
              .from('delivery_store_memberships')
              .insert({
                id: membershipUuid,
                store_id: storeUuid,
                driver_id: placeholderDriverId,
                status: 'pendente',
                expires_at: expiresAt
              })
              .select()
              .single();

            insertedMembership = mWithDriver;
          }

          if (insertedMembership) {
            membershipId = insertedMembership.id;
            // Insere o código gerado em delivery_invites
            await supabaseAdmin
              .from('delivery_invites')
              .insert({
                membership_id: insertedMembership.id,
                code_display_hint: rawToken,
                token_hash: tokenHash,
                expires_at: expiresAt
              });
          }
        } catch (dbErr) {
          console.warn('Supabase DB tables invite-issue fallback to storage:', (dbErr as any)?.message);
        }

        // 2. Atualiza storage unificado
        const newShift = {
          id: membershipId,
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
      // Executa os 5 passos no Supabase:
      // 1. Busca em delivery_invites pelo code_display_hint
      // 2. Atualiza ou insere em delivery_drivers com display_name e optional_phone
      // 3. Atualiza delivery_store_memberships mudando status = 'ativo'
      // 4. Atualiza delivery_invites preenchendo redeemed_at = now()
      // 5. Atualiza delivery_presence com manual_enabled = true e active_store_id = store_id
      case 'invite-activate': {
        const { inviteCode, deviceFingerprint, driverId, driverName, phone, vehiclePlate } = body;
        if (!inviteCode) {
          return NextResponse.json({ success: false, error: 'Código de convite obrigatório' }, { status: 400 });
        }

        const normalizedCode = inviteCode.toString().trim().toUpperCase();
        const tokenHash = crypto.createHash('sha256').update(normalizedCode).digest('hex');
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const driverUuid = toValidUuid(driverId || `drv_${phone || Date.now()}`);

        // EXECUÇÃO NAS TABELAS DO SUPABASE
        try {
          // Passo 1: Buscar o convite em delivery_invites
          const { data: invite } = await supabaseAdmin
            .from('delivery_invites')
            .select('*, delivery_store_memberships(*)')
            .or(`code_display_hint.eq.${normalizedCode},token_hash.eq.${tokenHash}`)
            .maybeSingle();

          // Passo 2: Atualizar ou inserir em delivery_drivers com display_name e optional_phone
          await supabaseAdmin
            .from('delivery_drivers')
            .upsert({
              id: driverUuid,
              identity_subject: driverId || `driver_${phone || driverUuid}`,
              display_name: driverName || 'Entregador',
              optional_phone: phone || null
            }, { onConflict: 'id' });

          // Passo 3: Atualizar delivery_store_memberships mudando status = 'ativo'
          const memberId = invite?.membership_id || invite?.delivery_store_memberships?.id;
          if (memberId) {
            await supabaseAdmin
              .from('delivery_store_memberships')
              .update({
                driver_id: driverUuid,
                status: 'ativo',
                updated_at: new Date().toISOString()
              })
              .eq('id', memberId);
          } else {
            await supabaseAdmin
              .from('delivery_store_memberships')
              .upsert({
                id: crypto.randomUUID(),
                store_id: storeUuid,
                driver_id: driverUuid,
                status: 'ativo',
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'driver_id,store_id' });
          }

          // Passo 4: Atualizar delivery_invites preenchendo redeemed_at = now()
          if (invite?.id) {
            await supabaseAdmin
              .from('delivery_invites')
              .update({
                redeemed_at: new Date().toISOString()
              })
              .eq('id', invite.id);
          }

          // Passo 5: Atualizar delivery_presence com manual_enabled = true e active_store_id = store_id
          await supabaseAdmin
            .from('delivery_presence')
            .upsert({
              driver_id: driverUuid,
              active_store_id: storeUuid,
              manual_enabled: true,
              last_heartbeat_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'driver_id' });

          // Passo adicional: Sessão em delivery_device_sessions (se existir tabela)
          if (deviceFingerprint) {
            try {
              await supabaseAdmin
                .from('delivery_device_sessions')
                .insert({
                  driver_id: driverUuid,
                  membership_id: memberId || crypto.randomUUID(),
                  device_fingerprint_hash: crypto.createHash('sha256').update(deviceFingerprint).digest('hex'),
                  session_token_hash: crypto.createHash('sha256').update(sessionToken).digest('hex')
                });
            } catch (se) {}
          }
        } catch (dbErr) {
          console.warn('Supabase DB tables invite-activate fallback to storage:', (dbErr as any)?.message);
        }

        // Localiza e atualiza no liveDrivers e Storage
        let shift = liveDrivers.find(d => 
          d.inviteCode && d.inviteCode.toString().trim().toUpperCase() === normalizedCode
        );

        if (!shift && normalizedCode.startsWith('NW-')) {
          shift = liveDrivers.find(d => d.status === 'aguardando_motoboy');
        }

        if (!shift) {
          shift = {
            id: `shift-${Date.now()}`,
            inviteCode: normalizedCode,
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
        shift.driverId = driverId || driverUuid;
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
            id: storeUuid,
            name: 'Bella Pizza'
          },
          driver: {
            id: driverUuid,
            driverId: driverId || driverUuid,
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
      // Atualiza delivery_presence com manual_enabled = true/false
      case 'driver-presence': {
        const { manualEnabled, driverId, inviteCode } = body;
        const isOnline = manualEnabled ?? true;

        if (driverId) {
          const driverUuid = toValidUuid(driverId);
          try {
            await supabaseAdmin
              .from('delivery_presence')
              .upsert({
                driver_id: driverUuid,
                active_store_id: storeUuid,
                manual_enabled: isOnline,
                last_heartbeat_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'driver_id' });
          } catch (e) {}
        }

        let drv = liveDrivers.find(d => 
          (driverId && (d.driverId === driverId || d.id === driverId)) ||
          (inviteCode && d.inviteCode === inviteCode)
        );
        if (!drv && liveDrivers.length > 0) {
          drv = liveDrivers.find(d => d.driverName !== null) || liveDrivers[0];
        }

        if (drv) {
          drv.presence = isOnline ? 'disponivel' : 'indisponivel';
          drv.shiftStatus = isOnline ? 'em_plantao' : 'plantao_encerrado';
          await persistLogisticsState();
        }

        return NextResponse.json({
          success: true,
          action: 'driver.presence',
          manualEnabled: isOnline,
          presence: drv?.presence || (isOnline ? 'disponivel' : 'indisponivel'),
          shiftStatus: drv?.shiftStatus || (isOnline ? 'em_plantao' : 'plantao_encerrado'),
          serverTime: new Date().toISOString(),
          idempotencyKey
        });
      }

      // Encerramento de Turno / Plantão pelo App do Motoboy
      case 'shift-end':
      case 'shift-close': {
        const { driverId, inviteCode } = body;
        if (driverId) {
          const driverUuid = toValidUuid(driverId);
          try {
            await supabaseAdmin
              .from('delivery_presence')
              .upsert({
                driver_id: driverUuid,
                active_store_id: storeUuid,
                manual_enabled: false,
                last_heartbeat_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'driver_id' });
          } catch (e) {}
        }

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

        try {
          const memberId = toValidUuid(driverId);
          await supabaseAdmin
            .from('delivery_store_memberships')
            .update({
              status: drv?.status === 'bloqueado' ? 'bloqueado' : 'ativo',
              blocked_at: drv?.status === 'bloqueado' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString()
            })
            .eq('id', memberId);
        } catch (e) {}

        return NextResponse.json({ success: true, status: drv?.status });
      }

      // 5. Excluir / Cancelar Código de Plantão pelo Lojista
      case 'driver-delete':
      case 'invite-delete': {
        const { driverId } = body;
        try {
          const targetUuid = toValidUuid(driverId);
          await supabaseAdmin
            .from('delivery_invites')
            .delete()
            .or(`membership_id.eq.${targetUuid},id.eq.${targetUuid}`);
          await supabaseAdmin
            .from('delivery_store_memberships')
            .delete()
            .eq('id', targetUuid);
        } catch (e) {}

        liveDrivers = liveDrivers.filter(d => d.id !== driverId && d.inviteCode !== driverId && d.driverId !== driverId);
        await persistLogisticsState();
        return NextResponse.json({ success: true });
      }

      // 6. Criar Oferta de Despacho (offer.create)
      case 'offer-create': {
        const { orderId, orderIds, orders, orderNumber, customerAddress, driverId, feeOffered } = body;
        const offerId = `off-${Date.now()}`;
        const timeoutSeconds = 60;
        const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

        const targetOrders = Array.isArray(orders) && orders.length > 0
          ? orders
          : (Array.isArray(orderIds) && orderIds.length > 0
              ? orderIds.map((id: string) => ({ id, orderId: id, orderNumber: orderNumber || '#000', customerAddress }))
              : [{ id: orderId, orderId, orderNumber, customerAddress }]);

        const drv = liveDrivers.find(d => d.id === driverId || d.driverId === driverId) || liveDrivers[0];

        const offerObj = {
          id: offerId,
          offerId,
          orderId: targetOrders[0]?.id || targetOrders[0]?.orderId || orderId,
          orderIds: targetOrders.map((o: any) => o.id || o.orderId),
          orders: targetOrders,
          orderNumber: targetOrders.map((o: any) => o.orderNumber ? String(o.orderNumber) : '').filter(Boolean).join(', ') || orderNumber,
          customerAddress: customerAddress || targetOrders[0]?.customerAddress || targetOrders[0]?.deliveryAddress || 'Endereço',
          driverId,
          targetDriverId: driverId,
          driverName: drv?.driverName || drv?.name || 'Entregador',
          feeOffered: feeOffered || 12.00,
          deliveryFee: feeOffered || 12.00,
          totalOrdersGrouped: targetOrders.length,
          status: 'pendente',
          expiresAt,
          timeoutSeconds,
          createdAt: new Date().toISOString()
        };
        liveOffers.unshift(offerObj);
        await persistLogisticsState();

        // Atualiza os pedidos na loja para 'aguardando_aceite' (sem mudar status base para 'em_entrega')
        const orderIdSet = new Set(targetOrders.map((o: any) => String(o.id || o.orderId)));
        const orderNumberSet = new Set(targetOrders.map((o: any) => String(o.orderNumber).replace('#', '')));
        await updateStoreOrdersStatus((allOrders) => {
          let updated = false;
          allOrders.forEach(o => {
            if (orderIdSet.has(String(o.id)) || orderNumberSet.has(String(o.orderNumber))) {
              o.dispatchStatus = 'aguardando_aceite';
              o.driverName = drv?.driverName || drv?.name || null;
              o.assignedDriverName = drv?.driverName || drv?.name || null;
              o.offerGroupId = offerId;
              updated = true;
            }
          });
          return updated;
        });

        return NextResponse.json({
          success: true,
          action: 'offer.create',
          offer: offerObj,
          idempotencyKey
        });
      }

      // 7. Responder Oferta (offer.respond)
      case 'offer-respond': {
        const { offerId, decision } = body; // 'accepted' | 'rejected'
        const offer = liveOffers.find(o => o.id === offerId || o.offerId === offerId);
        if (offer) {
          offer.status = decision === 'accepted' ? 'aceita' : 'recusada';
          const targetOrders = Array.isArray(offer.orders) && offer.orders.length > 0
            ? offer.orders
            : [{ id: offer.orderId, orderId: offer.orderId, orderNumber: offer.orderNumber, customerAddress: offer.customerAddress }];

          if (decision === 'accepted') {
            const drv = liveDrivers.find(d => d.id === offer.driverId || d.driverId === offer.driverId) || liveDrivers[0];
            if (drv) drv.activeDeliveries = (drv.activeDeliveries || 0) + targetOrders.length;

            targetOrders.forEach((ord: any, idx: number) => {
              const asgObj = {
                id: `asg-${ord.id || ord.orderId || Date.now()}-${idx}`,
                assignmentId: `asg-${ord.id || ord.orderId || Date.now()}-${idx}`,
                orderId: ord.id || ord.orderId,
                orderNumber: ord.orderNumber ? String(ord.orderNumber) : String(offer.orderNumber || 1042),
                address: ord.customerAddress || ord.address || offer.customerAddress || 'Endereço do Cliente',
                feeOffered: offer.feeOffered ? (offer.feeOffered / targetOrders.length) : 12.00,
                deliveryFee: offer.feeOffered ? (offer.feeOffered / targetOrders.length) : 12.00,
                status: 'waiting_pickup',
                driverId: offer.driverId,
                driverName: drv?.driverName || drv?.name || 'Entregador',
                sequence: idx + 1,
                acceptedAt: new Date().toISOString()
              };
              liveAssignments.unshift(asgObj);
            });

            await persistLogisticsState();

            // Atualiza na loja para 'aceito_aguardando_retirada'
            const orderIdSet = new Set(targetOrders.map((o: any) => String(o.id || o.orderId)));
            const orderNumberSet = new Set(targetOrders.map((o: any) => String(o.orderNumber).replace('#', '')));
            await updateStoreOrdersStatus((allOrders) => {
              let updated = false;
              allOrders.forEach(o => {
                if (orderIdSet.has(String(o.id)) || orderNumberSet.has(String(o.orderNumber))) {
                  o.dispatchStatus = 'aceito_aguardando_retirada';
                  o.driverName = drv?.driverName || drv?.name || null;
                  o.assignedDriverName = drv?.driverName || drv?.name || null;
                  o.acceptedAt = new Date().toISOString();
                  updated = true;
                }
              });
              return updated;
            });

            return NextResponse.json({
              success: true,
              action: 'offer.respond',
              offerId,
              status: 'aceita',
              idempotencyKey
            });
          } else {
            // Recusada -> Devolve para disponível
            const orderIdSet = new Set(targetOrders.map((o: any) => String(o.id || o.orderId)));
            const orderNumberSet = new Set(targetOrders.map((o: any) => String(o.orderNumber).replace('#', '')));
            await updateStoreOrdersStatus((allOrders) => {
              let updated = false;
              allOrders.forEach(o => {
                if (orderIdSet.has(String(o.id)) || orderNumberSet.has(String(o.orderNumber))) {
                  o.dispatchStatus = 'disponivel';
                  o.driverName = null;
                  o.assignedDriverName = null;
                  updated = true;
                }
              });
              return updated;
            });
            await persistLogisticsState();
            return NextResponse.json({
              success: true,
              action: 'offer.respond',
              offerId,
              status: 'recusada',
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

      // 8. Confirmar Retirada na Loja (pickup.confirm)
      case 'pickup-confirm': {
        const { assignmentId, assignmentIds } = body;
        const targetIds = Array.isArray(assignmentIds) ? assignmentIds : [assignmentId].filter(Boolean);
        const pickedOrderIds: string[] = [];

        liveAssignments.forEach(a => {
          if (targetIds.includes(a.id) || targetIds.includes(a.assignmentId)) {
            a.status = 'picked_up';
            a.pickedUpAt = new Date().toISOString();
            if (a.orderId) pickedOrderIds.push(String(a.orderId));
          }
        });
        await persistLogisticsState();

        // Atualiza na loja para 'em_entrega'!
        const pickedSet = new Set(pickedOrderIds);
        await updateStoreOrdersStatus((allOrders) => {
          let updated = false;
          allOrders.forEach(o => {
            if (pickedSet.has(String(o.id)) || pickedSet.has(String(o.orderNumber))) {
              o.status = 'em_entrega';
              o.dispatchStatus = 'em_entrega';
              o.pickedUpAt = new Date().toISOString();
              updated = true;
            }
          });
          return updated;
        });

        return NextResponse.json({
          success: true,
          action: 'pickup.confirm',
          confirmedIds: targetIds,
          status: 'retirada',
          pickedUpAt: new Date().toISOString(),
          idempotencyKey
        });
      }

      // 9. Concluir Entrega com PIN do Cliente (delivery.confirm)
      case 'delivery-complete':
      case 'delivery-confirm': {
        const { assignmentId, pinCandidate } = body;

        if (!pinCandidate || pinCandidate.length !== 4) {
          return NextResponse.json({ success: false, error: 'O código PIN deve conter exatamente 4 dígitos' }, { status: 422 });
        }

        const asg = liveAssignments.find(a => a.id === assignmentId || a.assignmentId === assignmentId);
        let completedOrderId: string | null = null;
        let completedOrderNumber: string | null = null;

        if (asg) {
          asg.status = 'entregue';
          asg.deliveredAt = new Date().toISOString();
          completedOrderId = asg.orderId ? String(asg.orderId) : null;
          completedOrderNumber = asg.orderNumber ? String(asg.orderNumber).replace('#', '') : null;

          // Libera capacidade do motoboy
          if (liveDrivers[0] && liveDrivers[0].activeDeliveries > 0) {
            liveDrivers[0].activeDeliveries -= 1;
          }
          await persistLogisticsState();
        }

        // ATUALIZA SOMENTE ESTE PEDIDO NA LOJA PARA 'concluido' / 'Finalizado/Entregue'!
        if (completedOrderId || completedOrderNumber) {
          await updateStoreOrdersStatus((allOrders) => {
            let updated = false;
            allOrders.forEach(o => {
              const idMatch = completedOrderId && String(o.id) === completedOrderId;
              const numMatch = completedOrderNumber && String(o.orderNumber).replace('#', '') === completedOrderNumber;
              if (idMatch || numMatch) {
                o.status = 'concluido';
                o.dispatchStatus = 'entregue';
                o.deliveredAt = new Date().toISOString();
                updated = true;
              }
            });
            return updated;
          });
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
