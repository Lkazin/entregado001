'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Flame, LayoutDashboard, ShoppingCart, UtensilsCrossed, Bike, Settings, 
  CheckCircle2, Clock, AlertTriangle, ArrowRight, Printer, XCircle, Search, 
  UserPlus, ShieldAlert, KeyRound, Check, RefreshCw, Send, Lock, PlusCircle,
  Copy, MessageSquare, Trash2, CheckSquare, Square, X, MapPin, Package, Users
} from 'lucide-react';
import { PIZZA_FLAVORS } from '@/lib/constants';

import AdminPinAuth from '@/components/AdminPinAuth';
import { printThermalOrder, testPrintThermal, PaperWidth } from '@/lib/thermalPrinter';

const SUPABASE_STORAGE_URL = 'https://nrdbporbyujwtgnpiejz.supabase.co/storage/v1/object/novaesweb_store/logistics.json';
const SUPABASE_ANON_KEY = 'sb_publishable_ynzw0icpmaxAhkCJWDYDGg_nTQCPUeY';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZGJwb3JieXVqd3RnbnBpZWp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzE3NjI1MiwiZXhwIjoyMTA4NzUyMjUyfQ.14LuRaZIPmmRCyHz9uD6PiTajpH0ap5vGphW2_d0YrA';

interface AdminOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  address: string;
  region: string;
  itemsSummary: string;
  total: number;
  status: 'recebido' | 'preparando' | 'pronto' | 'em_entrega' | 'concluido' | 'cancelado';
  dispatchStatus?: 'disponivel' | 'aguardando_aceite' | 'aceito_aguardando_retirada' | 'em_entrega' | 'concluido';
  paymentMethod: 'pix_manual' | 'cash_delivery' | 'card_terminal';
  paymentStatus: 'aguardando_conferencia' | 'confirmado_manual' | 'recebido_entrega';
  deliveryPin: string;
  driverName?: string | null;
  assignedDriverName?: string | null;
  offerGroupId?: string | null;
  createdAt: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  cancellationReason?: string;
  canceledAt?: string;
  forcedDelivery?: boolean;
  forcedDeliveryReason?: string;
  forcedByDriverName?: string;
  forcedAt?: string;
  // Detalhes completos (pedidos novos)
  createdAtISO?: string;
  notes?: string;
  subtotal?: number;
  deliveryFee?: number;
  changeFor?: number | null;
  trackingToken?: string;
  addressDetail?: { street?: string; number?: string; complement?: string; reference?: string; region?: string };
  items?: Array<{ type?: string; name?: string; quantity?: number; size?: string | null; flavors?: string[]; crust?: string | null; unitPrice?: number; totalPrice?: number }>;
}

interface AdminDriver {
  id: string;
  inviteCode: string;
  driverName: string | null;
  name: string | null;
  phone: string | null;
  vehiclePlate: string | null;
  driverId?: string | null;
  status: 'aguardando_motoboy' | 'ativo' | 'bloqueado';
  shiftStatus?: 'aguardando_motoboy' | 'em_plantao' | 'plantao_encerrado';
  presence: 'disponivel' | 'indisponivel';
  activeDeliveries: number;
  maxDeliveries: number;
  validityDays: number;
  inviteExpiryDays?: number;
  expiresAt?: string;
  createdAt?: string;
}

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'kanban' | 'menu' | 'logistics' | 'settings' | 'canceled'>('kanban');
  const [canceledSearch, setCanceledSearch] = useState('');

  // Estado REAL sem dados fakes (carregados da API e do banco)
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Detalhes do pedido e aviso de novo pedido
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState<{ id: string; orderNumber: number } | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('novaesweb_autoprint') === 'true';
    }
    return false;
  });
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('novaesweb_paper_width');
      if (saved === '58mm' || saved === '80mm') return saved;
    }
    return '80mm';
  });
  const knownOrderIdsRef = React.useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const currentIds = new Set(orders.map(o => o.id));
    if (knownOrderIdsRef.current === null) {
      // Primeira carga: tudo o que ja existe nao e "novo"
      knownOrderIdsRef.current = currentIds;
      return;
    }
    const known = knownOrderIdsRef.current;
    const fresh = orders.find(o => !known.has(o.id) && o.status === 'recebido');
    currentIds.forEach(id => known.add(id));
    if (fresh) {
      setNewOrderAlert({ id: fresh.id, orderNumber: fresh.orderNumber });
      if (autoPrint) {
        printThermalOrder(fresh, paperWidth);
      }
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.6);
        }
      } catch (e) {}
    }
  }, [orders, isLoading]);

  // Checar autenticação via PIN 615210
  useEffect(() => {
    const auth = typeof window !== 'undefined' ? sessionStorage.getItem('novaesweb_admin_auth') : null;
    setIsAuthenticated(auth === 'authenticated');
  }, []);

  // Carregar cache local de pedidos para nunca sumir nada
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('novaesweb_orders');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            // Filtrar pedidos de demonstração antigos
            const realOnly = parsed.filter((o: any) => 
              !o.customerName?.includes('Teste') && 
              !o.customerName?.includes('Fictício') &&
              !o.customerName?.includes('João') &&
              !o.customerName?.includes('Maria')
            );
            setOrders(realOnly);
            localStorage.setItem('novaesweb_orders', JSON.stringify(realOnly));
          }
        }
      } catch (e) {}

      // Ouvir criação de novos pedidos em outras abas
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'novaesweb_orders' && e.newValue) {
          try {
            const newOrders = JSON.parse(e.newValue);
            if (Array.isArray(newOrders)) setOrders(newOrders);
          } catch (err) {}
        }
      };
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
  }, []);

  // Estados de Despacho e Seleção Múltipla
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDispatchDrawerOpen, setIsDispatchDrawerOpen] = useState(false);
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [isInlineInviteOpen, setIsInlineInviteOpen] = useState(false);
  const [selectedOrderToDispatch, setSelectedOrderToDispatch] = useState<AdminOrder | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [deliveryFeeOffered, setDeliveryFeeOffered] = useState<string>('12,00');
  const [dispatchAlert, setDispatchAlert] = useState<string | null>(null);
  const [isSendingDispatch, setIsSendingDispatch] = useState(false);

  // Estados para Código de Plantão Dinâmico
  const [shiftValidity, setShiftValidity] = useState<string>('1');
  const [generatedShiftCode, setGeneratedShiftCode] = useState<string | null>(null);
  const [isGeneratingShiftCode, setIsGeneratingShiftCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // FUNÇÃO DE BUSCA DOS DADOS REAIS
  const fetchData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // 1. Buscar Pedidos Reais
      const resOrders = await fetch('/api/orders');
      const dataOrders = await resOrders.json();
      if (dataOrders.success && Array.isArray(dataOrders.orders)) {
        setOrders(prevOrders => {
          // Filtrar quaisquer pedidos de demonstração remanescentes
          const incoming: AdminOrder[] = dataOrders.orders.filter((o: any) => 
            !o.customerName?.includes('Teste') && 
            !o.customerName?.includes('Fictício') &&
            !o.customerName?.includes('João') &&
            !o.customerName?.includes('Maria')
          );
          
          // Se a API retornou vazia mas temos pedidos locais, mantemos os locais
          if (incoming.length === 0 && prevOrders.length > 0) {
            return prevOrders;
          }

          // Mesclar pedidos garantindo que nenhum status avançado seja perdido
          const mergedMap = new Map<string, AdminOrder>();
          
          // Carregar do localStorage se existir
          let localSaved: AdminOrder[] = [];
          if (typeof window !== 'undefined') {
            try {
              const c = localStorage.getItem('novaesweb_orders');
              if (c) localSaved = JSON.parse(c);
            } catch (e) {}
          }

          [...localSaved, ...prevOrders].forEach(o => mergedMap.set(o.id, o));

          // Atualizar com pedidos que vieram do servidor preservando substatus de despacho
          incoming.forEach(o => {
            const existing = mergedMap.get(o.id);
            if (existing) {
              // Se o estado local já está mais avançado, preserva o local
              const sequence: AdminOrder['status'][] = ['recebido', 'preparando', 'pronto', 'em_entrega', 'concluido', 'cancelado'];
              const localIdx = sequence.indexOf(existing.status);
              const serverIdx = sequence.indexOf(o.status);
              if (localIdx > serverIdx) {
                mergedMap.set(o.id, { 
                  ...o, 
                  status: existing.status,
                  dispatchStatus: existing.dispatchStatus || o.dispatchStatus,
                  assignedDriverName: existing.assignedDriverName || o.assignedDriverName || o.driverName,
                  offerGroupId: existing.offerGroupId || o.offerGroupId
                });
              } else {
                mergedMap.set(o.id, {
                  ...o,
                  dispatchStatus: o.dispatchStatus || existing.dispatchStatus,
                  assignedDriverName: o.assignedDriverName || existing.assignedDriverName || o.driverName || existing.driverName,
                  offerGroupId: o.offerGroupId || existing.offerGroupId
                });
              }
            } else {
              mergedMap.set(o.id, o);
            }
          });

          const result = Array.from(mergedMap.values());
          if (typeof window !== 'undefined') {
            localStorage.setItem('novaesweb_orders', JSON.stringify(result));
          }
          return result;
        });
      }

      // 2. Sincronização em Tempo Real com o Supabase Logistics (Ofertas, Entregadores e Entregas)
      try {
        const cloudRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
          headers: {
          }
        });
        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          if (Array.isArray(cloudData.drivers)) {
            const validDrivers = cloudData.drivers.filter((d: any) => !d.name?.includes('Rodrigo Silva'));
            setDrivers(validDrivers);
            if (!selectedDriverId && validDrivers.length > 0) {
              setSelectedDriverId(validDrivers[0].id);
            }
          }

          // SINCRONIZAÇÃO AUTOMÁTICA EM TEMPO REAL: Aceite, Retirada e Conclusão das Entregas
          const cloudOffers = Array.isArray(cloudData.offers) ? cloudData.offers : [];
          const cloudAssignments = Array.isArray(cloudData.assignments) ? cloudData.assignments : [];

          setOrders(prevOrders => {
            let hasChanged = false;
            const updated = prevOrders.map(order => {
              const orderIdStr = String(order.id);
              const orderNumStr = String(order.orderNumber).replace('#', '');

              // 1. Verificar em Assignments (tarefas do motoboy)
              const asg = cloudAssignments.find((a: any) => 
                String(a.orderId) === orderIdStr ||
                String(a.orderNumber).replace('#', '') === orderNumStr
              );

              if (asg) {
                const asgDriver = asg.driverName || asg.driverId || order.assignedDriverName || order.driverName;

                // Status: Concluído com validação de PIN
                if (asg.status === 'delivered' || asg.status === 'entregue') {
                  if (order.status !== 'concluido' || order.dispatchStatus !== 'concluido') {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'concluido' as const,
                      dispatchStatus: 'concluido' as const,
                      driverName: asgDriver,
                      assignedDriverName: asgDriver,
                      deliveredAt: asg.deliveredAt || new Date().toISOString()
                    };
                  }
                  return order;
                }

                // Status: Retirada confirmada na loja -> Em Rota de Entrega
                if (asg.status === 'picked_up' || asg.status === 'in_transit') {
                  if (order.status !== 'em_entrega' || order.dispatchStatus !== 'em_entrega') {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'em_entrega' as const,
                      dispatchStatus: 'em_entrega' as const,
                      driverName: asgDriver,
                      assignedDriverName: asgDriver,
                      pickedUpAt: asg.pickupConfirmedAt || order.pickedUpAt
                    };
                  }
                  return order;
                }

                // Status: Aceito pelo motoboy -> Aguardando Retirada no Balcão
                if (asg.status === 'waiting_pickup') {
                  if (order.dispatchStatus !== 'aceito_aguardando_retirada' || order.driverName !== asgDriver) {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'pronto' as const,
                      dispatchStatus: 'aceito_aguardando_retirada' as const,
                      driverName: asgDriver,
                      assignedDriverName: asgDriver
                    };
                  }
                  return order;
                }
              }

              // 2. Verificar em Offers (ofertas enviadas)
              const offer = cloudOffers.find((o: any) => {
                if (String(o.orderId) === orderIdStr || String(o.orderNumber).replace('#', '') === orderNumStr) return true;
                if (Array.isArray(o.orderIds) && o.orderIds.some((id: any) => String(id) === orderIdStr)) return true;
                if (Array.isArray(o.orders) && o.orders.some((item: any) => 
                  String(item.orderId || item.id) === orderIdStr || 
                  String(item.orderNumber).replace('#', '') === orderNumStr
                )) return true;
                return false;
              });

              if (offer) {
                const offerDriver = offer.driverName || offer.targetDriverName || order.assignedDriverName || order.driverName;

                // Oferta aceita pelo motoboy
                if (offer.status === 'atribuida' || offer.status === 'accepted') {
                  if (order.dispatchStatus !== 'aceito_aguardando_retirada' || order.driverName !== offerDriver) {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'pronto' as const,
                      dispatchStatus: 'aceito_aguardando_retirada' as const,
                      driverName: offerDriver,
                      assignedDriverName: offerDriver
                    };
                  }
                  return order;
                }

                // Oferta aguardando aceite
                if (offer.status === 'pendente') {
                  if (order.dispatchStatus !== 'aguardando_aceite') {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'pronto' as const,
                      dispatchStatus: 'aguardando_aceite' as const,
                      assignedDriverName: offerDriver,
                      driverName: offerDriver
                    };
                  }
                  return order;
                }

                // Oferta recusada ou expirada
                if (offer.status === 'recusada' || offer.status === 'expirada' || offer.status === 'cancelada') {
                  if (order.dispatchStatus === 'aguardando_aceite') {
                    hasChanged = true;
                    return {
                      ...order,
                      status: 'pronto' as const,
                      dispatchStatus: 'disponivel' as const,
                      assignedDriverName: null,
                      driverName: null
                    };
                  }
                  return order;
                }
              }

              return order;
            });

            if (hasChanged) {
              if (typeof window !== 'undefined') {
                localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
              }
              return updated;
            }
            return prevOrders;
          });
        }
      } catch (cloudErr) {
        console.warn('Erro ao sincronizar logistics.json do Supabase:', cloudErr);
      }
    } catch (err) {
      console.error('Erro ao sincronizar dados:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // POLLING AUTOMÁTICO A CADA 3 SEGUNDOS (Tempo Real Conectado ao App do Entregador)
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Transições do Kanban Conectadas à API
  const handleAdvanceStatus = async (orderId: string, currentStatus: AdminOrder['status']) => {
    const sequence: AdminOrder['status'][] = ['recebido', 'preparando', 'pronto', 'em_entrega', 'concluido'];
    const currentIdx = sequence.indexOf(currentStatus);
    if (currentIdx < sequence.length - 1) {
      const nextStatus = sequence[currentIdx + 1];
      
      // Atualização imediata otimista no estado e no cache local
      setOrders(prev => {
        const updated = prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o);
        if (typeof window !== 'undefined') {
          localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
        }
        return updated;
      });

      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status: nextStatus })
        });
      } catch (err) {
        console.error('Erro ao comunicar com o servidor:', err);
      }

      setTimeout(() => fetchData(true), 600);
    }
  };

  // Confirmar Pix Manual Conectado à API
  const handleConfirmPix = async (orderId: string) => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, paymentStatus: 'confirmado_manual' as const } : o);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentStatus: 'confirmado_manual' })
      });
    } catch (err) {}
    setTimeout(() => fetchData(true), 600);
  };

  // Cancelar com Justificativa Conectado à API e Sincronizado
  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt('Informe a justificativa do cancelamento (opcional):');
    if (reason !== null) {
      const cancelReason = reason.trim() || 'Cancelado pelo lojista';
      const cancelTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date().toLocaleDateString('pt-BR');

      setOrders(prev => {
        const updated = prev.map(o => o.id === orderId ? { 
          ...o, 
          status: 'cancelado' as const,
          cancellationReason: cancelReason,
          canceledAt: cancelTime
        } : o);
        if (typeof window !== 'undefined') {
          localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
        }
        return updated;
      });

      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            orderId, 
            status: 'cancelado',
            cancellationReason: cancelReason,
            canceledAt: cancelTime
          })
        });
      } catch (err) {}

      // Retira ofertas ou entregas ativas deste pedido no Supabase Storage
      try {
        const logRes = await fetch(SUPABASE_STORAGE_URL, {
          headers: { 'apikey': SUPABASE_ANON_KEY }
        });
        if (logRes.ok) {
          const logData = await logRes.json();
          let changed = false;
          if (Array.isArray(logData.offers)) {
            logData.offers = logData.offers.filter((off: any) => {
              const match = off.orderId === orderId || (Array.isArray(off.orders) && off.orders.some((o: any) => o.id === orderId));
              if (match) changed = true;
              return !match;
            });
          }
          if (Array.isArray(logData.assignments)) {
            logData.assignments.forEach((asg: any) => {
              if (asg.orderId === orderId) {
                asg.status = 'canceled_by_store';
                changed = true;
              }
            });
          }
          if (changed) {
            await fetch(SUPABASE_STORAGE_URL, {
              method: 'PUT',
              headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(logData)
            });
          }
        }
      } catch (eLog) {
        console.warn('Erro ao sincronizar cancelamento na nuvem:', eLog);
      }

      setDispatchAlert('Pedido cancelado com sucesso e transferido para a aba de Pedidos Cancelados.');
      setTimeout(() => setDispatchAlert(null), 4000);
      setTimeout(() => fetchData(true), 600);
    }
  };

  // Restaurar Pedido Cancelado de volta para "Recebido"
  const handleRestoreOrder = async (orderId: string) => {
    if (!confirm('Deseja restaurar este pedido de volta para a coluna "1. Recebido" do Kanban?')) return;

    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { 
        ...o, 
        status: 'recebido' as const, 
        dispatchStatus: 'disponivel' as const,
        cancellationReason: undefined,
        canceledAt: undefined
      } : o);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId, 
          status: 'recebido', 
          dispatchStatus: 'disponivel',
          cancellationReason: null,
          canceledAt: null
        })
      });
    } catch (err) {}

    setDispatchAlert('Pedido restaurado com sucesso! Já está visível na coluna Recebido do Kanban.');
    setTimeout(() => setDispatchAlert(null), 4000);
    setTimeout(() => fetchData(true), 600);
  };

  // Excluir Definitivamente Registro de Pedido Cancelado
  const handleDeleteOrderPermanently = async (orderId: string) => {
    if (!confirm('Tem certeza que deseja excluir definitivamente este registro do histórico de cancelados?')) return;

    setOrders(prev => {
      const updated = prev.filter(o => o.id !== orderId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
    } catch (err) {}

    setDispatchAlert('Registro de pedido cancelado excluído com sucesso.');
    setTimeout(() => setDispatchAlert(null), 3000);
  };

  // Handlers de Seleção Múltipla de Pedidos para Despacho
  const handleToggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const readyOrders = orders.filter(o => 
    o.status === 'pronto' && 
    o.dispatchStatus !== 'aguardando_aceite' && 
    o.dispatchStatus !== 'aceito_aguardando_retirada'
  );

  const handleToggleSelectAllReady = () => {
    if (readyOrders.length === 0) return;
    const allSelected = readyOrders.every(o => selectedOrderIds.includes(o.id));
    if (allSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !readyOrders.some(ro => ro.id === id)));
    } else {
      const readyIds = readyOrders.map(o => o.id);
      setSelectedOrderIds(prev => Array.from(new Set([...prev, ...readyIds])));
    }
  };

  const handleOpenDispatchForSingle = (order: AdminOrder) => {
    setSelectedOrderIds([order.id]);
    setSelectedOrderToDispatch(order);
    setIsDispatchDrawerOpen(true);
  };

  const handleOpenDispatchForSelected = () => {
    if (selectedOrderIds.length === 0) return;
    setIsDispatchDrawerOpen(true);
  };

  // Cancelar ou Retirar Despacho de Pedido em "Aguardando Aceite"
  const handleCancelDispatch = async (orderId: string) => {
    if (!confirm('Deseja retirar este pedido do despacho e torná-lo disponível novamente?')) return;
    
    // Atualização otimista local
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? {
        ...o,
        dispatchStatus: 'disponivel' as const,
        assignedDriverName: null,
        driverName: null,
        offerGroupId: null
      } : o);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          dispatchStatus: 'disponivel',
          assignedDriverName: null,
          driverName: null,
          offerGroupId: null
        })
      });

      // Remove a oferta do Supabase Storage
      const getRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
        headers: {
        }
      });
      if (getRes.ok) {
        const state = await getRes.json();
        if (Array.isArray(state.offers)) {
          state.offers = state.offers.filter((off: any) => 
            off.orderId !== orderId && 
            (!off.orders || !off.orders.some((item: any) => item.orderId === orderId))
          );
          await fetch(SUPABASE_STORAGE_URL, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'x-upsert': 'true',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(state)
          });
        }
      }
    } catch (err) {
      console.error('Erro ao cancelar oferta de despacho:', err);
    }

    setDispatchAlert('Despacho cancelado com sucesso. O pedido está pronto para nova seleção.');
    setTimeout(() => setDispatchAlert(null), 4000);
    fetchData(true);
  };

  // Disparar Oferta de Despacho em Lote (Agrupando 1 ou Vários Pedidos)
  const handleSendGroupedDispatchOffer = async () => {
    const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) {
      alert('Nenhum pedido selecionado para despacho.');
      return;
    }

    const driver = drivers.find(d => d.id === selectedDriverId);
    if (!driver) {
      alert('Selecione um entregador para enviar a oferta.');
      return;
    }

    const driverName = driver.driverName || driver.name;
    if (!driverName) {
      alert('Aguarde o motoboy conectar seu aplicativo através do código de plantão antes de despachar.');
      return;
    }

    if (driver.status === 'bloqueado') {
      alert(`O entregador ${driverName} está bloqueado.`);
      return;
    }

    if (driver.activeDeliveries >= driver.maxDeliveries) {
      alert(`O entregador ${driverName} atingiu a capacidade máxima de ${driver.maxDeliveries} entregas simultâneas!`);
      return;
    }

    setIsSendingDispatch(true);
    const feeNum = parseFloat(deliveryFeeOffered.replace(',', '.')) || 12.00;
    const offerUniqueId = `off_${Date.now()}`;
    const targetDriverId = driver.driverId || driver.id;

    const offerOrders = selectedOrders.map(o => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName || 'Cliente',
      customerPhone: o.phone || '',
      customerAddress: o.address,
      deliveryAddress: o.address,
      customerNeighborhood: o.region || 'Região Central',
      itemsSummary: o.itemsSummary || '1x Pedido Delivery',
      total: o.total,
      deliveryFee: Number((feeNum / selectedOrders.length).toFixed(2)),
      deliveryPin: o.deliveryPin || '****'
    }));

    // 1. Tentar API local
    try {
      await fetch('/api/v1/logistics/offer-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrders[0].id,
          orderNumber: selectedOrders[0].orderNumber,
          orderIds: selectedOrders.map(o => o.id),
          orders: offerOrders,
          customerAddress: selectedOrders.map(o => `#${o.orderNumber}: ${o.address}`).join(' | '),
          driverId: targetDriverId,
          feeOffered: feeNum,
          totalOrdersGrouped: selectedOrders.length
        })
      });
    } catch (e) {
      console.warn('API local falhou, prosseguindo com nuvem Supabase:', e);
    }

    // 2. Sincronizar oferta no Supabase Storage (logistics.json)
    try {
      const getRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
        headers: {
        }
      });
      let state: { drivers: any[]; offers: any[]; assignments: any[] } = { drivers: [], offers: [], assignments: [] };
      if (getRes.ok) {
        state = await getRes.json();
      }

      const newOffer = {
        id: offerUniqueId,
        offerId: offerUniqueId,
        orderId: selectedOrders[0].id,
        orderNumber: selectedOrders.map(o => `#${o.orderNumber}`).join(', '),
        orderIds: selectedOrders.map(o => o.id),
        orders: offerOrders,
        customerAddress: selectedOrders.map(o => `#${o.orderNumber}: ${o.address}`).join(' | '),
        deliveryAddress: selectedOrders.map(o => `#${o.orderNumber}: ${o.address}`).join(' | '),
        customerNeighborhood: selectedOrders[0].region || 'Bairro Atendido',
        customerCity: 'São Paulo',
        customerName: selectedOrders.length === 1 ? selectedOrders[0].customerName : `${selectedOrders.length} Clientes (Lote)`,
        customerPhone: selectedOrders[0].phone || '',
        itemsSummary: selectedOrders.map(o => `#${o.orderNumber} (${o.itemsSummary})`).join(' • '),
        targetDriverId,
        driverId: targetDriverId,
        feeOffered: feeNum,
        deliveryFee: feeNum,
        estimatedDistanceKm: Number((2.0 + selectedOrders.length * 1.2).toFixed(1)),
        totalOrdersGrouped: selectedOrders.length,
        status: 'pendente',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };

      state.offers = [newOffer as any, ...(state.offers || [])];

      await fetch(SUPABASE_STORAGE_URL, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'x-upsert': 'true',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      });
    } catch (err) {
      console.warn('Erro ao sincronizar logistics.json no Supabase:', err);
    }

    // 3. Atualizar pedidos selecionados: dispatchStatus = 'aguardando_aceite'
    // Preserva status 'pronto' até o motoboy aceitar e retirar
    setOrders(prev => {
      const updated = prev.map(o => {
        if (selectedOrderIds.includes(o.id)) {
          return {
            ...o,
            dispatchStatus: 'aguardando_aceite' as const,
            assignedDriverName: driverName,
            driverName: driverName,
            offerGroupId: offerUniqueId
          };
        }
        return o;
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    for (const order of selectedOrders) {
      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            dispatchStatus: 'aguardando_aceite',
            assignedDriverName: driverName,
            driverName: driverName,
            offerGroupId: offerUniqueId
          })
        });
      } catch (err) {}
    }

    // Atualiza diretamente no orders.json do Supabase Storage
    try {
      const ordersRes = await fetch('https://nrdbporbyujwtgnpiejz.supabase.co/storage/v1/object/novaesweb_store/orders.json', {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (ordersRes.ok) {
        let cloudOrders = await ordersRes.json();
        if (Array.isArray(cloudOrders)) {
          cloudOrders = cloudOrders.map((o: any) => {
            if (selectedOrderIds.includes(o.id) || selectedOrderIds.includes(String(o.orderNumber))) {
              return {
                ...o,
                dispatchStatus: 'aguardando_aceite',
                assignedDriverName: driverName,
                driverName: driverName,
                offerGroupId: offerUniqueId
              };
            }
            return o;
          });
          await fetch('https://nrdbporbyujwtgnpiejz.supabase.co/storage/v1/object/novaesweb_store/orders.json', {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'x-upsert': 'true',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(cloudOrders)
          });
        }
      }
    } catch (err) {}

    setIsSendingDispatch(false);
    setIsDispatchDrawerOpen(false);
    setSelectedOrderIds([]);
    setSelectedOrderToDispatch(null);
    setDispatchAlert(`Oferta de ${selectedOrders.length} pedido(s) enviada para ${driverName}! Aguardando aceite no aplicativo.`);
    setTimeout(() => setDispatchAlert(null), 5000);
    fetchData(true);
  };

  const handleSendDispatchOffer = async () => {
    if (selectedOrderToDispatch) {
      setSelectedOrderIds([selectedOrderToDispatch.id]);
    }
    await handleSendGroupedDispatchOffer();
  };

  // Gerar Código de Plantão Dinâmico (Uso Único no App do Motoboy)
  const handleGenerateShiftCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGeneratingShiftCode(true);
    let codeGenerated: string | null = null;
    const days = parseInt(shiftValidity) || 1;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    // 1. Tenta API local
    try {
      const res = await fetch('/api/v1/logistics/invite-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validityDays: days })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.inviteCode) {
          codeGenerated = data.inviteCode;
        }
      }
    } catch (err) {
      console.warn('API local invite-issue falhou, gerando na nuvem Supabase...');
    }

    // 2. Se a API local não retornou código, grava direto na nuvem Supabase
    if (!codeGenerated) {
      try {
        const rawToken = `NW-${Math.floor(100000 + Math.random() * 900000)}`;
        const getRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
          headers: {
          }
        });
        let state: { drivers: any[]; offers: any[]; assignments: any[] } = { drivers: [], offers: [], assignments: [] };
        if (getRes.ok) {
          state = await getRes.json();
        }

        const newShift = {
          id: `shift-${Date.now()}`,
          inviteCode: rawToken,
          driverName: null,
          name: null,
          phone: null,
          vehiclePlate: null,
          driverId: null,
          status: 'aguardando_motoboy',
          shiftStatus: 'aguardando_motoboy',
          presence: 'indisponivel',
          activeDeliveries: 0,
          maxDeliveries: 3,
          validityDays: days,
          expiresAt,
          createdAt: new Date().toISOString()
        };
        state.drivers.unshift(newShift as any);

        await fetch(SUPABASE_STORAGE_URL, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'x-upsert': 'true',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(state)
        });

        codeGenerated = rawToken;
      } catch (cloudErr) {
        console.error('Erro ao salvar código no Supabase Cloud:', cloudErr);
      }
    }

    if (codeGenerated) {
      setGeneratedShiftCode(codeGenerated);
      fetchData(true);
    }
    setIsGeneratingShiftCode(false);
  };

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  const getWhatsAppShareUrl = (code: string) => {
    const text = `Olá! Seu código de plantão para hoje na Bella Pizza é: ${code}. Abra seu app NovaesWeb Entregador e insira o código para iniciar.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  // Alternar Bloqueio do Entregador
  const handleToggleBlockDriver = async (driverId: string) => {
    await fetch('/api/v1/logistics/driver-toggle-block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId })
    });
    fetchData(true);
  };

  // Remover Código de Plantão
  const handleDeleteDriverShift = async (driverId: string) => {
    if (confirm('Deseja realmente remover este código de plantão / entregador?')) {
      await fetch('/api/v1/logistics/driver-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });
      if (generatedShiftCode === driverId) setGeneratedShiftCode(null);
      fetchData(true);
    }
  };



  if (isAuthenticated === false) {
    return <AdminPinAuth onSuccess={() => setIsAuthenticated(true)} />;
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      
      {/* Aviso de novo pedido */}
      {newOrderAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] p-4 rounded-2xl bg-emerald-950/95 border border-emerald-600/60 shadow-2xl shadow-emerald-900/40 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 animate-pulse">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-emerald-300">Novo pedido #{newOrderAlert.orderNumber}</p>
              <p className="text-[11px] text-zinc-300">Chegou agora. Veja os detalhes do pedido.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    setDetailOrderId(newOrderAlert.id);
                    setNewOrderAlert(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition"
                >
                  Ver pedido
                </button>
                <button
                  onClick={() => setNewOrderAlert(null)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition"
                >
                  Dispensar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topo do Painel Administrativo */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white">
                <Flame className="w-5 h-5 text-amber-300" />
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                BELLA <span className="text-red-500">PIZZA</span>
              </span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              Painel do Lojista
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sincronização em Tempo Real Ativa</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData()}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              title="Atualizar agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-500' : ''}`} />
            </button>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition"
            >
              Ver Site Público
            </Link>
            <button
              onClick={() => {
                sessionStorage.removeItem('novaesweb_admin_auth');
                setIsAuthenticated(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-xs font-semibold text-red-300 transition flex items-center gap-1.5"
              title="Bloquear Painel"
            >
              <Lock className="w-3 h-3" />
              <span>Bloquear</span>
            </button>
          </div>

        </div>

        {/* Abas Principais de Navegação */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800/80 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'kanban'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Kanban de Pedidos ({orders.filter(o => o.status !== 'concluido' && o.status !== 'cancelado').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('logistics')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'logistics'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Módulo de Logística ({drivers.filter(d => d.presence === 'disponivel').length} Online)</span>
          </button>

          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'overview'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'menu'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Cardápio & Preços</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'settings'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </button>

          <button
            onClick={() => setActiveTab('canceled')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'canceled'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <XCircle className="w-4 h-4 text-red-400" />
            <span>Pedidos Cancelados ({orders.filter(o => o.status === 'cancelado').length})</span>
          </button>
        </div>
      </header>

      {/* Alerta de Despacho */}
      {dispatchAlert && (
        <div className="bg-emerald-950/80 border-b border-emerald-800 p-3 text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-2 animate-pulse">
          <CheckCircle2 className="w-4 h-4" />
          <span>{dispatchAlert}</span>
        </div>
      )}

      {/* Conteúdo Dinâmico por Aba */}
      <main className="flex-1 p-3 sm:p-5 lg:p-6 w-full max-w-none mx-auto">
        
        {/* ABA 1: KANBAN DE PEDIDOS */}
        {activeTab === 'kanban' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Kanban Operacional de Pedidos</h2>
                <p className="text-xs text-zinc-400">
                  Os pedidos caem aqui em tempo real conforme os clientes compram no site.
                </p>
              </div>

              {/* Controles de Impressao Termica 80mm/58mm */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                  <Printer className="w-4 h-4 text-zinc-400" />
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-zinc-200 select-none">
                    <input
                      type="checkbox"
                      checked={autoPrint}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoPrint(val);
                        localStorage.setItem('novaesweb_autoprint', String(val));
                      }}
                      className="w-4 h-4 rounded text-red-600 focus:ring-0 bg-zinc-800 border-zinc-700"
                    />
                    <span>Impressão Automática</span>
                  </label>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                    autoPrint
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {autoPrint ? 'LIGADA' : 'DESLIGADA'}
                  </span>
                </div>

                <select
                  value={paperWidth}
                  onChange={(e) => {
                    const val = e.target.value as PaperWidth;
                    setPaperWidth(val);
                    localStorage.setItem('novaesweb_paper_width', val);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-200 focus:outline-none"
                  title="Tamanho da bobina da impressora termica"
                >
                  <option value="80mm">Bobina 80mm</option>
                  <option value="58mm">Bobina 58mm</option>
                </select>

                <button
                  type="button"
                  onClick={() => testPrintThermal(paperWidth)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition"
                  title="Enviar cupom de teste para validar a impressora"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Testar Cupom</span>
                </button>
              </div>
            </div>

            {/* As 5 Colunas do Kanban */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              
              {[
                { key: 'recebido', label: '1. Recebido', color: 'border-blue-500/40 text-blue-400' },
                { key: 'preparando', label: '2. Preparando', color: 'border-amber-500/40 text-amber-400' },
                { key: 'pronto', label: '3. Pronto / Despacho', color: 'border-purple-500/40 text-purple-400' },
                { key: 'em_entrega', label: '4. Em Entrega', color: 'border-orange-500/40 text-orange-400' },
                { key: 'concluido', label: '5. Concluído', color: 'border-emerald-500/40 text-emerald-400' },
              ].map((col) => {
                const colOrders = orders.filter(o => o.status === col.key);

                return (
                  <div key={col.key} className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col h-[calc(100vh-210px)] min-h-[680px] w-full">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black uppercase tracking-wider ${col.color}`}>
                          {col.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-bold">
                          {colOrders.length}
                        </span>
                      </div>

                      {col.key === 'pronto' && readyOrders.length > 0 && (
                        <button
                          type="button"
                          onClick={handleToggleSelectAllReady}
                          className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 transition"
                          title="Selecionar ou desmarcar todos os pedidos prontos disponíveis"
                        >
                          {readyOrders.every(o => selectedOrderIds.includes(o.id)) ? (
                            <>
                              <CheckSquare className="w-3 h-3 text-red-500" />
                              <span>Desmarcar ({readyOrders.length})</span>
                            </>
                          ) : (
                            <>
                              <Square className="w-3 h-3 text-zinc-400" />
                              <span>Todos ({readyOrders.length})</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {colOrders.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs">
                          Nenhum pedido nesta etapa
                        </div>
                      ) : (
                        colOrders.map((order) => (
                          <div
                            key={order.id}
                            className={`p-3.5 rounded-xl bg-zinc-900 border transition shadow-md space-y-2 text-xs ${
                              selectedOrderIds.includes(order.id) 
                                ? 'border-red-600/80 bg-red-950/20' 
                                : 'border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {/* Checkbox de seleção para despacho em lote */}
                            {col.key === 'pronto' && order.dispatchStatus !== 'aguardando_aceite' && order.dispatchStatus !== 'aceito_aguardando_retirada' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectOrder(order.id);
                                }}
                                className={`flex items-center gap-1.5 text-left w-full pb-1.5 border-b border-zinc-800/70 mb-1 cursor-pointer transition ${
                                  selectedOrderIds.includes(order.id) ? 'text-red-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {selectedOrderIds.includes(order.id) ? (
                                  <CheckSquare className="w-4 h-4 text-red-500 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-zinc-500 shrink-0" />
                                )}
                                <span className="text-[11px]">
                                  {selectedOrderIds.includes(order.id) ? 'Selecionado para Envio' : 'Selecionar para Despacho'}
                                </span>
                              </button>
                            )}

                            {/* Substatus Badges de Despacho */}
                            {order.dispatchStatus === 'aguardando_aceite' && (
                              <div className="p-2 rounded-lg bg-amber-950/70 border border-amber-600/60 text-amber-300 text-[11px] space-y-1 animate-pulse">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-400" />
                                    Aguardando Aceite
                                  </span>
                                  <button
                                    onClick={() => handleCancelDispatch(order.id)}
                                    className="text-[10px] underline text-amber-400 hover:text-white"
                                    title="Retirar pedido do despacho e trocar motoboy"
                                  >
                                    Trocar / Retirar
                                  </button>
                                </div>
                                <p className="text-[10px] text-zinc-300">
                                  Oferta enviada para: <strong className="text-amber-300">{order.assignedDriverName || order.driverName}</strong>
                                </p>
                              </div>
                            )}

                            {order.dispatchStatus === 'aceito_aguardando_retirada' && (
                              <div className="p-2 rounded-lg bg-blue-950/70 border border-blue-600/60 text-blue-300 text-[11px] space-y-1">
                                <span className="font-bold flex items-center gap-1 text-blue-400">
                                  <Bike className="w-3.5 h-3.5" />
                                  Aceito — Aguardando Retirada
                                </span>
                                <p className="text-[10px] text-zinc-300">
                                  Entregador <strong className="text-white">{order.assignedDriverName || order.driverName}</strong> a caminho da loja para retirar.
                                </p>
                              </div>
                            )}

                            <div className="flex justify-between items-center">
                              <span className="font-black text-white text-sm">#{order.orderNumber}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">{order.createdAt}</span>
                            </div>

                            <div>
                              <p className="font-bold text-zinc-200">{order.customerName}</p>
                              <p className="text-[11px] text-zinc-400 truncate">{order.address}</p>
                              <p className="text-[10px] text-zinc-500">{order.region}</p>
                            </div>

                            <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/80 text-[11px] text-zinc-300">
                              {order.itemsSummary}
                            </div>

                            {/* Informações de Pagamento */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="font-black text-white">
                                R$ {order.total.toFixed(2).replace('.', ',')}
                              </span>
                              
                              {order.paymentMethod === 'pix_manual' && (
                                order.paymentStatus === 'aguardando_conferencia' ? (
                                  <button
                                    onClick={() => handleConfirmPix(order.id)}
                                    className="px-2 py-1 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-bold hover:bg-amber-900 transition"
                                    title="Clique para confirmar o recebimento do Pix"
                                  >
                                    Conferir Pix
                                  </button>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                                    Pix Pago ✓
                                  </span>
                                )
                              )}

                              {order.paymentMethod === 'cash_delivery' && (
                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                                  Dinheiro na entrega
                                </span>
                              )}

                              {order.paymentMethod === 'card_terminal' && (
                                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900 text-[10px]">
                                  Maquininha
                                </span>
                              )}
                            </div>

                            {/* Entregador atribuído (se houver) */}
                            {order.driverName && (
                              <div className="p-1.5 bg-orange-950/40 border border-orange-800/50 rounded text-[10px] text-orange-300 font-semibold flex items-center gap-1">
                                <Bike className="w-3 h-3" />
                                <span>{order.driverName}</span>
                              </div>
                            )}

                            {/* Alerta de Entrega Forçada sem PIN */}
                            {order.forcedDelivery && (
                              <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-700/60 text-[10px] text-amber-300 font-bold flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>Entrega sem PIN ({order.forcedByDriverName || 'Motoboy'})</span>
                              </div>
                            )}

                            {/* Ações Operacionais */}
                            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setDetailOrderId(order.id)}
                                className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-[10px] font-bold transition"
                                title="Ver todas as informações do pedido"
                              >
                                Detalhes
                              </button>
                              <button
                                onClick={() => printThermalOrder(order, paperWidth)}
                                className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                                title="Imprimir Cupom Térmico (80mm/58mm)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                className="text-zinc-500 hover:text-red-400 p-1 text-[10px]"
                                title="Cancelar Pedido"
                              >
                                Cancelar
                              </button>
                            </div>

                              {col.key === 'pronto' ? (
                                order.dispatchStatus === 'aguardando_aceite' ? (
                                  <button
                                    onClick={() => handleCancelDispatch(order.id)}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[10px] font-bold transition flex items-center gap-1"
                                    title="Cancelar despacho e escolher outro motoboy"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Trocar Motoboy</span>
                                  </button>
                                ) : order.dispatchStatus === 'aceito_aguardando_retirada' ? (
                                  <span className="text-[10px] text-blue-400 font-bold px-2 py-1 rounded bg-blue-950/60 border border-blue-900 flex items-center gap-1">
                                    <Clock className="w-3 h-3 animate-spin" />
                                    <span>Aguardando Retirada...</span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleOpenDispatchForSingle(order)}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-md"
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>Despachar</span>
                                  </button>
                                )
                              ) : col.key !== 'concluido' ? (
                                <button
                                  onClick={() => handleAdvanceStatus(order.id, order.status)}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-[10px] flex items-center gap-1 transition"
                                >
                                  <span>Avançar</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : null}
                            </div>

                          </div>
                        ))
                      )}
                    </div>

                    {/* Botão de Despacho em Lote Fixo na Coluna 3 */}
                    {col.key === 'pronto' && selectedOrderIds.length > 0 && (
                      <div className="pt-2 sticky bottom-0 bg-zinc-900/95 -mx-1 px-1 pb-1 border-t border-zinc-800">
                        <button
                          type="button"
                          onClick={handleOpenDispatchForSelected}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-600 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/40 transition transform active:scale-95"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Despachar ({selectedOrderIds.length}) Selecionados</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>
        )}

        {/* ABA 2: MÓDULO DE LOGÍSTICA */}
        {activeTab === 'logistics' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Módulo Integrado de Logística</h2>
                <p className="text-xs text-zinc-400">
                  Gerencie os motoboys e envie ofertas de corrida diretamente para o aplicativo do entregador.
                </p>
              </div>

              <div className="text-xs font-semibold text-zinc-400">
                Entregadores conectados: <strong className="text-emerald-400">{drivers.length}</strong>
              </div>
            </div>

            {/* ÁREA DE DESPACHO MANUAL DE PEDIDO */}
            {selectedOrderToDispatch ? (
              <div className="p-6 rounded-2xl bg-red-950/30 border border-red-800/60 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <Send className="w-4 h-4 text-red-400" />
                    <span>Despachar Pedido #{selectedOrderToDispatch.orderNumber}</span>
                  </h3>
                  <button
                    onClick={() => setSelectedOrderToDispatch(null)}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block mb-1">Cliente & Destino:</span>
                    <p className="font-bold text-white">{selectedOrderToDispatch.customerName}</p>
                    <p className="text-zinc-300">{selectedOrderToDispatch.address}</p>
                    <p className="text-zinc-400">{selectedOrderToDispatch.region}</p>
                  </div>

                  <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <label className="text-zinc-400 block mb-1">Selecione o Entregador Elegível:</label>
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-semibold"
                    >
                      {drivers.filter(d => d.driverName && d.status === 'ativo').length === 0 ? (
                        <option value="">Nenhum motoboy com app conectado ativo</option>
                      ) : (
                        drivers.filter(d => d.driverName && d.status === 'ativo').map((drv) => (
                          <option key={drv.id} value={drv.id}>
                            {drv.driverName || drv.name} ({drv.vehiclePlate || 'Sem placa'}) — {drv.activeDeliveries}/{drv.maxDeliveries} corridas ({drv.presence === 'disponivel' ? '🟢 Online' : '⚪ Offline'})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <label className="text-zinc-400 block mb-1">Valor da Corrida (Opcional):</label>
                    <input
                      type="text"
                      value={deliveryFeeOffered}
                      onChange={(e) => setDeliveryFeeOffered(e.target.value)}
                      placeholder="Ex: 12,00"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-bold"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Enviado na notificação da oferta ao motoboy.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setSelectedOrderToDispatch(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendDispatchOffer}
                    className="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar Oferta em Tempo Real (Timeout 60s)
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-400">
                  Para despachar um pedido, selecione o botão <strong>"Despachar"</strong> na coluna "Pronto / Despacho" do Kanban.
                </span>
                <button
                  onClick={() => setActiveTab('kanban')}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                >
                  Ir para o Kanban
                </button>
              </div>
            )}

            {/* TABELA DE ENTREGADORES CONECTADOS EM TEMPO REAL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-white">Equipe de Entregadores & Códigos de Plantão</h3>
                  <span className="text-xs text-zinc-400">
                    Sincronizado em tempo real com o aplicativo do entregador
                  </span>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">Código do Plantão</th>
                      <th className="p-4">Entregador (Nome)</th>
                      <th className="p-4">WhatsApp / Tel</th>
                      <th className="p-4">Placa do Veículo</th>
                      <th className="p-4">Status do Plantão</th>
                      <th className="p-4">Carga Atual</th>
                      <th className="p-4">Validade</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {drivers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-zinc-500 text-xs">
                          Nenhum código de plantão gerado. Use o botão abaixo para gerar o primeiro código e compartilhar com o motoboy.
                        </td>
                      </tr>
                    ) : (
                      drivers.map((drv) => {
                        const isWaiting = !drv.driverName || drv.status === 'aguardando_motoboy';
                        const isBlocked = drv.status === 'bloqueado';
                        const isOnline = drv.presence === 'disponivel';

                        return (
                          <tr key={drv.id} className="hover:bg-zinc-800/30 transition">
                            {/* Código do Plantão */}
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-amber-400 bg-zinc-950 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs tracking-wider">
                                  {drv.inviteCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(drv.inviteCode)}
                                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
                                  title="Copiar Código"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* Nome do Entregador */}
                            <td className="p-4">
                              {isWaiting ? (
                                <span className="text-zinc-600 font-mono text-xs">—</span>
                              ) : (
                                <p className="font-bold text-white text-xs">{drv.driverName || drv.name}</p>
                              )}
                            </td>

                            {/* WhatsApp / Tel */}
                            <td className="p-4">
                              {isWaiting || !drv.phone ? (
                                <span className="text-zinc-600 font-mono text-xs">—</span>
                              ) : (
                                <a
                                  href={`https://wa.me/55${drv.phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs text-zinc-300 hover:text-emerald-400 transition underline underline-offset-2"
                                >
                                  {drv.phone}
                                </a>
                              )}
                            </td>

                            {/* Placa do Veículo */}
                            <td className="p-4">
                              {isWaiting || !drv.vehiclePlate ? (
                                <span className="text-zinc-600 font-mono text-xs">—</span>
                              ) : (
                                <span className="font-mono font-bold uppercase text-[11px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">
                                  {drv.vehiclePlate}
                                </span>
                              )}
                            </td>

                            {/* Status do Plantão */}
                            <td className="p-4">
                              {isBlocked ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-950/80 border border-red-800 text-red-300">
                                  <span className="w-2 h-2 rounded-full bg-red-400" />
                                  🔴 Bloqueado
                                </span>
                              ) : isWaiting ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                  🟡 Aguardando Entrada do Motoboy
                                </span>
                              ) : isOnline ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  🟢 Em Plantão (Disponível)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                  ⚪ Plantão Encerrado / Offline
                                </span>
                              )}
                            </td>

                            {/* Carga Atual */}
                            <td className="p-4 font-semibold text-zinc-200">
                              {drv.activeDeliveries || 0} de {drv.maxDeliveries || 3} pedidos
                            </td>

                            {/* Validade */}
                            <td className="p-4 text-zinc-400">
                              {drv.validityDays ? `${drv.validityDays} dia(s)` : `${drv.inviteExpiryDays || 1} dia(s)`}
                            </td>

                            {/* Ações */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isWaiting && (
                                  <a
                                    href={getWhatsAppShareUrl(drv.inviteCode)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition"
                                    title="Enviar Código no WhatsApp"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>WhatsApp</span>
                                  </a>
                                )}

                                {!isWaiting && (
                                  <button
                                    onClick={() => handleToggleBlockDriver(drv.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                                      isBlocked
                                        ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300'
                                        : 'bg-zinc-800 hover:bg-red-950 hover:text-red-300 text-zinc-300'
                                    }`}
                                  >
                                    {isBlocked ? 'Desbloquear' : 'Bloquear'}
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDeleteDriverShift(drv.id)}
                                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                                  title="Remover Código de Plantão"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FORMULÁRIO DE GERAÇÃO DE CÓDIGO DE PLANTÃO */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-red-500" />
                    <span>Gerar Código de Plantão</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    O motoboy conecta seu próprio cadastro e aplicativo através deste código dinâmico.
                  </p>
                </div>
              </div>

              <form onSubmit={handleGenerateShiftCode} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs items-end">
                <div className="sm:col-span-2">
                  <label className="text-zinc-300 font-semibold block mb-1.5">
                    Validade do Plantão
                  </label>
                  <select
                    value={shiftValidity}
                    onChange={(e) => setShiftValidity(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl p-3 text-white font-medium focus:border-red-500 focus:outline-none transition"
                  >
                    <option value="1">Hoje / 1 dia</option>
                    <option value="3">3 dias</option>
                    <option value="7">7 dias</option>
                    <option value="30">30 dias</option>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isGeneratingShiftCode}
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{isGeneratingShiftCode ? 'Gerando...' : 'Gerar Código de Plantão'}</span>
                  </button>
                </div>
              </form>

              {/* Exibição do Código Gerado com Copiar e Compartilhar no WhatsApp */}
              {generatedShiftCode && (
                <div className="mt-4 p-5 rounded-2xl bg-zinc-950 border border-amber-500/40 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="font-bold text-amber-300 text-sm">Código de Plantão Gerado:</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
                      Validade: {shiftValidity === '1' ? 'Hoje / 1 dia' : `${shiftValidity} dias`}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="text-3xl font-mono font-black text-amber-400 tracking-wider select-all">
                      {generatedShiftCode}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(generatedShiftCode)}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition w-full sm:w-auto ${
                          codeCopied 
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' 
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                      >
                        {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{codeCopied ? 'Código Copiado!' : 'Copiar Código'}</span>
                      </button>

                      <a
                        href={getWhatsAppShareUrl(generatedShiftCode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition w-full sm:w-auto text-center"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Compartilhar no WhatsApp</span>
                      </a>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
                    Mensagem enviada: <span className="text-zinc-200 italic">"Olá! Seu código de plantão para hoje na Bella Pizza é: <strong className="text-amber-400">{generatedShiftCode}</strong>. Abra seu app NovaesWeb Entregador e insira o código para iniciar."</span>
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ABA 3: VISÃO GERAL */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-white">Indicadores Operacionais</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase font-bold">Faturamento Total</span>
                <p className="text-2xl font-black text-white mt-1">
                  R$ {orders.filter(o => o.status === 'concluido').reduce((acc, curr) => acc + curr.total, 0).toFixed(2).replace('.', ',')}
                </p>
                <span className="text-[10px] text-emerald-400 mt-1 block">
                  {orders.filter(o => o.status === 'concluido').length} pedidos concluídos
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase font-bold">Pedidos em Andamento</span>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {orders.filter(o => o.status !== 'concluido' && o.status !== 'cancelado').length}
                </p>
                <span className="text-[10px] text-zinc-400 mt-1 block">Na fila de preparo e entrega</span>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase font-bold">Entregas em Rota</span>
                <p className="text-2xl font-black text-orange-400 mt-1">
                  {orders.filter(o => o.status === 'em_entrega').length}
                </p>
                <span className="text-[10px] text-zinc-400 mt-1 block">Motoboys em trânsito</span>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase font-bold">Pix a Conferir</span>
                <p className="text-2xl font-black text-blue-400 mt-1">
                  {orders.filter(o => o.paymentMethod === 'pix_manual' && o.paymentStatus === 'aguardando_conferencia').length}
                </p>
                <span className="text-[10px] text-blue-400 mt-1 block">Requer ação do operador</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA 4: CARDÁPIO */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Cardápio & Ativação de Sabores</h2>
                <p className="text-xs text-zinc-400">
                  Ative ou desative produtos e sabores instantaneamente sem controle de estoque.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {PIZZA_FLAVORS.map((flv) => (
                <div key={flv.id} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-bold text-white">{flv.name}</h4>
                    <span className="text-zinc-500 text-[10px] uppercase">{flv.category}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 5: CONFIGURAÇÕES */}
        {activeTab === 'settings' && (
          <div className="space-y-6 text-xs max-w-3xl">
            <h2 className="text-xl font-black text-white">Parâmetros Operacionais da Pizzaria</h2>
            
            <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4">
              <h3 className="font-bold text-sm text-white">Regras de Negócio e Entrega</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-400 block mb-1">Regra de Preço Pizza Multissabor</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white font-semibold">
                    <option value="maior_valor">Maior Valor entre os sabores (Padrão)</option>
                    <option value="media">Média dos sabores</option>
                    <option value="soma_proporcional">Soma Proporcional das frações</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Timeout de Oferta de Entrega</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white font-semibold">
                    <option value="45">45 segundos</option>
                    <option value="60">60 segundos (Recomendado)</option>
                    <option value="90">90 segundos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Limite Máximo de Pedidos Simultâneos por Motoboy</label>
                <input
                  type="number"
                  defaultValue={3}
                  min={1}
                  max={6}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* ABA 6: PEDIDOS CANCELADOS */}
        {activeTab === 'canceled' && (() => {
          const canceledOrders = orders.filter(o => o.status === 'cancelado');
          const filteredCanceled = canceledOrders.filter(o => {
            if (!canceledSearch.trim()) return true;
            const term = canceledSearch.toLowerCase();
            return (
              String(o.orderNumber).includes(term) ||
              (o.customerName && o.customerName.toLowerCase().includes(term)) ||
              (o.phone && o.phone.includes(term)) ||
              (o.address && o.address.toLowerCase().includes(term)) ||
              (o.cancellationReason && o.cancellationReason.toLowerCase().includes(term))
            );
          });
          const totalLost = canceledOrders.reduce((acc, o) => acc + (o.total || 0), 0);

          return (
            <div className="space-y-6">
              {/* Cabeçalho */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    Histórico de Pedidos Cancelados
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Consulte os pedidos cancelados, justificativas de cancelamento e restaure pedidos para o Kanban quando necessário.
                  </p>
                </div>

                {/* Resumo Rápido */}
                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-right">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">Total Cancelados</span>
                    <span className="text-sm font-black text-red-400">{canceledOrders.length} {canceledOrders.length === 1 ? 'pedido' : 'pedidos'}</span>
                  </div>
                  <div className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-right">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">Valor Total</span>
                    <span className="text-sm font-black text-white">R$ {totalLost.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              </div>

              {/* Barra de Busca e Filtro */}
              <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
                <Search className="w-4 h-4 text-zinc-500 ml-1 shrink-0" />
                <input
                  type="text"
                  value={canceledSearch}
                  onChange={(e) => setCanceledSearch(e.target.value)}
                  placeholder="Filtrar por número do pedido, cliente, telefone, endereço ou motivo..."
                  className="bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none w-full font-medium"
                />
                {canceledSearch && (
                  <button
                    onClick={() => setCanceledSearch('')}
                    className="text-xs text-zinc-500 hover:text-white px-2 py-0.5 rounded bg-zinc-800"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Lista de Pedidos Cancelados */}
              {filteredCanceled.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mx-auto text-zinc-500">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Nenhum pedido cancelado encontrado</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    {canceledSearch ? 'Nenhum resultado corresponde à sua busca.' : 'Todos os pedidos estão ativos ou foram concluídos no fluxo de atendimento.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCanceled.map((order) => {
                    const phoneClean = (order.phone || '').replace(/\D/g, '');
                    const waLink = phoneClean ? `https://wa.me/55${phoneClean}` : null;

                    return (
                      <div
                        key={order.id}
                        className="bg-zinc-900/80 border border-red-950/80 hover:border-red-900/60 rounded-2xl p-4 space-y-3 shadow-lg relative overflow-hidden transition"
                      >
                        {/* Faixa lateral decorativa de cancelado */}
                        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-red-600/80" />

                        {/* Topo do Card */}
                        <div className="flex items-center justify-between pl-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">#{order.orderNumber}</span>
                            <span className="px-2 py-0.5 rounded-full bg-red-950 border border-red-800/80 text-[10px] font-bold text-red-400 uppercase tracking-wide">
                              Cancelado
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {order.createdAt}
                          </span>
                        </div>

                        {/* Justificativa do Cancelamento */}
                        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-[11px] text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Motivo do Cancelamento:</span>
                          </div>
                          <p className="text-[11px] text-zinc-200 italic pl-5">
                            "{order.cancellationReason || 'Cancelado pelo lojista'}"
                          </p>
                          {order.canceledAt && (
                            <p className="text-[10px] text-zinc-400 pl-5">
                              Cancelado em: <strong className="text-zinc-300">{order.canceledAt}</strong>
                            </p>
                          )}
                        </div>

                        {/* Dados do Cliente */}
                        <div className="space-y-1 text-xs pl-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-white text-sm">{order.customerName}</strong>
                            {waLink && (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-md transition"
                                title="Falar com o cliente no WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>
                          <p className="text-zinc-400 text-[11px] truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span>{order.address}</span>
                          </p>
                          <p className="text-zinc-500 text-[10px] pl-4">{order.region}</p>
                        </div>

                        {/* Resumo dos Itens */}
                        <div className="p-2 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-[11px] text-zinc-300">
                          {order.itemsSummary}
                        </div>

                        {/* Valor e Pagamento */}
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 pl-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">Valor do Pedido</span>
                            <span className="text-sm font-black text-white">
                              R$ {order.total.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-medium px-2 py-1 rounded bg-zinc-800">
                            {order.paymentMethod === 'pix_manual' ? 'Pix' : order.paymentMethod === 'cash_delivery' ? 'Dinheiro' : 'Cartão'}
                          </span>
                        </div>

                        {/* Botões de Ação */}
                        <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestoreOrder(order.id)}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
                            title="Recolocar pedido no Kanban na etapa Recebido"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Restaurar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteOrderPermanently(order.id)}
                            className="w-full py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-red-950/80 hover:border-red-800 border border-zinc-700/80 text-zinc-400 hover:text-red-400 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                            title="Excluir definitivamente este registro de cancelamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir</span>
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      </main>

      {/* MODAL / DRAWER INTEGRADO DE DESPACHO (SELEÇÃO DE 1 OU MÚLTIPLOS PEDIDOS) */}
      {isDispatchDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Despachar Pedidos em Lote
                    <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
                      {selectedOrders.length} {selectedOrders.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Selecione o motoboy e envie a oferta com todos os destinos agrupados em tempo real.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDispatchDrawerOpen(false)}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do Modal com Scroll */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* Seção 1: Lista dos Pedidos Selecionados */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold text-zinc-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-red-500" />
                    Pedidos Selecionados para esta Corrida ({selectedOrders.length})
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    Subtotal dos pedidos: R$ {selectedOrders.reduce((acc, o) => acc + o.total, 0).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedOrders.length === 0 ? (
                    <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-zinc-500">
                      Nenhum pedido selecionado. Feche o modal e marque os pedidos prontos.
                    </div>
                  ) : (
                    selectedOrders.map((order) => (
                      <div
                        key={order.id}
                        className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-700 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono font-black text-white px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs">
                            #{order.orderNumber}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-zinc-200 truncate">{order.customerName}</p>
                            <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                              {order.address} ({order.region})
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-white text-xs">
                            R$ {order.total.toFixed(2).replace('.', ',')}
                          </span>
                          {selectedOrders.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleToggleSelectOrder(order.id)}
                              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                              title="Remover pedido deste lote"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Seção 2: Escolher Entregador */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-zinc-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Bike className="w-4 h-4 text-amber-400" />
                    Escolher Entregador para este Lote
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsInlineInviteOpen(!isInlineInviteOpen)}
                    className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 underline underline-offset-2"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isInlineInviteOpen ? 'Fechar Gerador de Plantão' : '+ Convidar / Vincular Entregador'}</span>
                  </button>
                </div>

                {/* Sub-painel retrátil de convite rápido de motoboy sem sair da tela */}
                {isInlineInviteOpen && (
                  <div className="p-4 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        Gerar Código de Plantão Instantâneo
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        O motoboy conecta pelo app usando este código
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={shiftValidity}
                        onChange={(e) => setShiftValidity(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs font-semibold"
                      >
                        <option value="1">Validade: 1 dia</option>
                        <option value="3">Validade: 3 dias</option>
                        <option value="7">Validade: 7 dias</option>
                      </select>

                      <button
                        type="button"
                        onClick={(e) => handleGenerateShiftCode(e)}
                        disabled={isGeneratingShiftCode}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{isGeneratingShiftCode ? 'Gerando...' : 'Gerar Código'}</span>
                      </button>
                    </div>

                    {generatedShiftCode && (
                      <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40 flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-amber-400 text-base">
                          {generatedShiftCode}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(generatedShiftCode)}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[11px] flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{codeCopied ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                          <a
                            href={getWhatsAppShareUrl(generatedShiftCode)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Campo de Busca de Entregadores */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={driverSearchQuery}
                    onChange={(e) => setDriverSearchQuery(e.target.value)}
                    placeholder="Buscar entregador por nome, placa ou telefone..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white placeholder-zinc-500 text-xs focus:border-red-500 focus:outline-none transition"
                  />
                </div>

                {/* Grid / Lista de Entregadores */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {drivers
                    .filter(d => {
                      const name = (d.driverName || d.name || '').toLowerCase();
                      const plate = (d.vehiclePlate || '').toLowerCase();
                      const phone = (d.phone || '').toLowerCase();
                      const q = driverSearchQuery.toLowerCase();
                      return name.includes(q) || plate.includes(q) || phone.includes(q);
                    })
                    .map((drv) => {
                      const isSelected = selectedDriverId === drv.id;
                      const isWaiting = !drv.driverName || drv.status === 'aguardando_motoboy';
                      const isBlocked = drv.status === 'bloqueado';
                      const isOnline = drv.presence === 'disponivel';
                      const isMaxReached = (drv.activeDeliveries || 0) >= (drv.maxDeliveries || 3);

                      return (
                        <div
                          key={drv.id}
                          onClick={() => {
                            if (!isBlocked && !isWaiting) {
                              setSelectedDriverId(drv.id);
                            }
                          }}
                          className={`p-3 rounded-2xl border transition text-xs cursor-pointer relative ${
                            isSelected 
                              ? 'bg-red-950/40 border-red-500 shadow-md shadow-red-600/20' 
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                          } ${isBlocked || isWaiting ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                              <span className="font-bold text-white truncate text-xs">
                                {drv.driverName || drv.name || 'Aguardando Motoboy'}
                              </span>
                            </div>

                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-extrabold text-[10px]">
                                Selecionado ✓
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-[11px] text-zinc-400">
                            <div className="flex items-center justify-between">
                              <span>Placa: <strong className="text-zinc-200 font-mono uppercase">{drv.vehiclePlate || 'N/A'}</strong></span>
                              <span className={`font-semibold ${isOnline ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                {isOnline ? '🟢 Online' : '⚪ Offline'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span>Carga ativa:</span>
                              <span className={`font-bold ${isMaxReached ? 'text-red-400' : 'text-zinc-200'}`}>
                                {drv.activeDeliveries || 0} de {drv.maxDeliveries || 3} corridas
                              </span>
                            </div>
                          </div>

                          {isWaiting && (
                            <p className="text-[10px] text-amber-400/90 mt-1 font-semibold">
                              Código: {drv.inviteCode} (Aguardando login no app)
                            </p>
                          )}
                          {isBlocked && (
                            <p className="text-[10px] text-red-400 mt-1 font-semibold">
                              🔴 Entregador bloqueado
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Seção 3: Valor da Taxa de Repasse */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="font-extrabold text-zinc-300 text-xs uppercase tracking-wider block mb-1">
                    Taxa de Repasse Total do Lote (R$)
                  </label>
                  <input
                    type="text"
                    value={deliveryFeeOffered}
                    onChange={(e) => setDeliveryFeeOffered(e.target.value)}
                    placeholder="Ex: 12,00"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-black text-sm focus:border-red-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Valor total que aparecerá na notificação do app do entregador.
                  </p>
                </div>

                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1 text-[11px]">
                  <div className="flex justify-between text-zinc-400">
                    <span>Média por entrega:</span>
                    <strong className="text-zinc-200">
                      R$ {((parseFloat(deliveryFeeOffered.replace(',', '.')) || 12.00) / (selectedOrders.length || 1)).toFixed(2).replace('.', ',')}
                    </strong>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Paradas / Entregas no Lote:</span>
                    <strong className="text-white font-bold">{selectedOrders.length} paradas</strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Rodapé com Botões de Ação */}
            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-zinc-400">
                {selectedOrders.length} pedido(s) selecionado(s) para despacho
              </span>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsDispatchDrawerOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs transition flex-1 sm:flex-none text-center"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSendGroupedDispatchOffer}
                  disabled={isSendingDispatch || selectedOrders.length === 0 || !selectedDriverId}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition transform active:scale-95 flex-1 sm:flex-none"
                >
                  <Send className={`w-4 h-4 ${isSendingDispatch ? 'animate-spin' : ''}`} />
                  <span>
                    {isSendingDispatch 
                      ? 'Enviando Oferta...' 
                      : `Confirmar e Enviar Oferta com ${selectedOrders.length} ${selectedOrders.length === 1 ? 'Entrega' : 'Entregas'}`}
                  </span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* Modal: Detalhes do Pedido */}
      {(() => {
        const detail = detailOrderId ? orders.find(o => o.id === detailOrderId) : null;
        if (!detail) return null;

        const money = (n?: number | null) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
        const phoneDigits = String(detail.phone || '').replace(/\D/g, '');
        const ad = detail.addressDetail;
        const fullAddress = ad && (ad.street || ad.number)
          ? `${ad.street || ''}, ${ad.number || ''}${ad.complement ? ' - ' + ad.complement : ''}`
          : detail.address;
        const itemLines = Array.isArray(detail.items) && detail.items.length > 0
          ? detail.items
          : null;
        const paymentLabel =
          detail.paymentMethod === 'pix_manual' ? 'Pix' :
          detail.paymentMethod === 'cash_delivery' ? 'Dinheiro na entrega' :
          detail.paymentMethod === 'card_terminal' ? 'Maquininha' : detail.paymentMethod;
        const statusLabels: Record<string, string> = {
          recebido: 'Recebido', preparando: 'Preparando', pronto: 'Pronto / Despacho',
          em_entrega: 'Em entrega', concluido: 'Concluído', cancelado: 'Cancelado'
        };
        const dispatchLabels: Record<string, string> = {
          disponivel: 'Disponível', aguardando_aceite: 'Aguardando aceite do motoboy',
          aceito_aguardando_retirada: 'Aceito — aguardando retirada', em_entrega: 'Em entrega', concluido: 'Entregue'
        };
        const driver = detail.assignedDriverName || detail.driverName;
        const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR') : null;

        const handleCopyDetail = async () => {
          const lines = [
            `Pedido #${detail.orderNumber}`,
            `Cliente: ${detail.customerName}`,
            `Telefone: ${detail.phone}`,
            `Endereço: ${fullAddress}${ad?.reference ? ` (Ref.: ${ad.reference})` : ''} - ${detail.region}`,
            `Itens: ${itemLines ? itemLines.map(i => `${i.quantity}x ${i.name}${i.size ? ' ' + i.size : ''}${i.flavors && i.flavors.length ? ' (' + i.flavors.join(' + ') + ')' : ''}`).join(' | ') : detail.itemsSummary}`,
            detail.notes ? `Obs.: ${detail.notes}` : null,
            `Pagamento: ${paymentLabel}${detail.changeFor ? ` (troco para ${money(detail.changeFor)})` : ''}`,
            `Total: ${money(detail.total)}`
          ].filter(Boolean).join('\n');
          try {
            await navigator.clipboard.writeText(lines);
            setCopiedDetail(true);
            setTimeout(() => setCopiedDetail(false), 2000);
          } catch (e) {}
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setDetailOrderId(null)}
          >
            <div
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                <div>
                  <h3 className="text-lg font-black text-white">Pedido #{detail.orderNumber}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200">
                      {statusLabels[detail.status] || detail.status}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {fmtDate(detail.createdAtISO) || detail.createdAt}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDetailOrderId(null)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-sm">
                {/* Cliente */}
                <section className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Cliente</h4>
                  <p className="font-bold text-white">{detail.customerName}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-300">{detail.phone || 'Sem telefone'}</span>
                    {phoneDigits && (
                      <a
                        href={`https://wa.me/55${phoneDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900 transition"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </section>

                {/* Endereço */}
                <section className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Endereço de entrega
                  </h4>
                  <p className="text-zinc-200">{fullAddress}</p>
                  <p className="text-zinc-400 text-xs">Bairro/região: {detail.region}</p>
                  {ad?.reference && <p className="text-zinc-400 text-xs">Referência: {ad.reference}</p>}
                </section>

                {/* Itens */}
                <section className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <Package className="w-3 h-3" /> Itens do pedido
                  </h4>
                  {itemLines ? (
                    <ul className="space-y-2">
                      {itemLines.map((it, idx) => (
                        <li key={idx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-zinc-100">
                              {it.quantity}x {it.name}{it.size ? ` ${it.size}` : ''}
                            </span>
                            {typeof it.totalPrice === 'number' && it.totalPrice > 0 && (
                              <span className="text-zinc-300 font-semibold shrink-0">{money(it.totalPrice)}</span>
                            )}
                          </div>
                          {it.flavors && it.flavors.length > 0 && (
                            <p className="text-xs text-zinc-400 mt-1">Sabores: {it.flavors.join(' + ')}</p>
                          )}
                          {it.crust && <p className="text-xs text-zinc-400">Borda: {it.crust}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-1.5">
                      {String(detail.itemsSummary || '').split(' • ').filter(Boolean).map((line, idx) => (
                        <li key={idx} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200">{line}</li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Observações */}
                {detail.notes && (
                  <section className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Observações do cliente
                    </h4>
                    <p className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-200">{detail.notes}</p>
                  </section>
                )}

                {/* Pagamento */}
                <section className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Pagamento</h4>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-zinc-300">
                    <div className="flex justify-between"><span>Forma</span><span className="font-semibold text-white">{paymentLabel}</span></div>
                    {detail.paymentMethod === 'pix_manual' && (
                      <div className="flex justify-between">
                        <span>Situação</span>
                        <span className={detail.paymentStatus === 'aguardando_conferencia' ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                          {detail.paymentStatus === 'aguardando_conferencia' ? 'Aguardando conferência' : 'Pix confirmado'}
                        </span>
                      </div>
                    )}
                    {detail.changeFor ? (
                      <div className="flex justify-between"><span>Troco para</span><span className="font-semibold text-white">{money(detail.changeFor)}</span></div>
                    ) : null}
                    {typeof detail.subtotal === 'number' && detail.subtotal > 0 && (
                      <div className="flex justify-between"><span>Subtotal</span><span>{money(detail.subtotal)}</span></div>
                    )}
                    {typeof detail.deliveryFee === 'number' && detail.deliveryFee > 0 && (
                      <div className="flex justify-between"><span>Taxa de entrega</span><span>{money(detail.deliveryFee)}</span></div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-zinc-800 text-base">
                      <span className="font-bold text-white">Total</span>
                      <span className="font-black text-white">{money(detail.total)}</span>
                    </div>
                  </div>
                </section>

                {/* Entrega / Despacho */}
                <section className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <Bike className="w-3 h-3" /> Entrega
                  </h4>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-zinc-300">
                    <div className="flex justify-between">
                      <span>PIN de entrega</span>
                      <span className="font-mono font-black text-white tracking-widest">{detail.deliveryPin || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Despacho</span>
                      <span className="text-right">{detail.dispatchStatus ? (dispatchLabels[detail.dispatchStatus] || detail.dispatchStatus) : 'Ainda não despachado'}</span>
                    </div>
                    {driver && <div className="flex justify-between"><span>Motoboy</span><span className="font-semibold text-white">{driver}</span></div>}
                    {fmtDate(detail.pickedUpAt) && <div className="flex justify-between"><span>Retirado em</span><span>{fmtDate(detail.pickedUpAt)}</span></div>}
                    {fmtDate(detail.deliveredAt) && <div className="flex justify-between"><span>Entregue em</span><span>{fmtDate(detail.deliveredAt)}</span></div>}
                    {detail.cancellationReason && (
                      <div className="flex justify-between"><span>Motivo do cancelamento</span><span className="text-red-400 text-right">{detail.cancellationReason}</span></div>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500">O PIN é informado pelo cliente ao motoboy para confirmar a entrega.</p>
                    {detail.forcedDelivery && (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/60 text-amber-200 text-xs space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-amber-300">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Entrega Concluída com Termo de Responsabilidade</span>
                        </div>
                        <p className="text-[11px] text-zinc-300">
                          Finalizada sem o código PIN por <strong>{detail.forcedByDriverName || detail.driverName || 'Motoboy'}</strong> em {fmtDate(detail.forcedAt || detail.deliveredAt)}.
                        </p>
                      </div>
                    )}
                </section>
              </div>

              <div className="p-4 border-t border-zinc-800 flex gap-2 justify-end sticky bottom-0 bg-zinc-900">
                <button
                  onClick={() => printThermalOrder(detail, paperWidth)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition"
                  title="Imprimir comanda térmica deste pedido"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Comanda</span>
                </button>
                <button
                  onClick={handleCopyDetail}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedDetail ? 'Copiado!' : 'Copiar pedido'}</span>
                </button>
                <button
                  onClick={() => setDetailOrderId(null)}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

