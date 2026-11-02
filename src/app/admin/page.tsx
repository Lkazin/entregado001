'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Bell, Volume2, VolumeX, Maximize2, Minimize2,
  Flame, LayoutDashboard, ShoppingCart, UtensilsCrossed, Bike, Settings, 
  CheckCircle2, Clock, AlertTriangle, ArrowRight, Printer, XCircle, Search, 
  UserPlus, ShieldAlert, KeyRound, Check, RefreshCw, Send, Lock, PlusCircle,
  Copy, MessageSquare, MessageCircle, Trash2, CheckSquare, Square, X, MapPin, Package, Users
} from 'lucide-react';
import { PIZZA_FLAVORS } from '@/lib/constants';

import AdminPinAuth from '@/components/AdminPinAuth';
import DriverInTransitList from '@/components/DriverInTransitList';
import FirstAccessInvitePanel from '@/components/FirstAccessInvitePanel';
import StoreNotificationCenter from '@/components/StoreNotificationCenter';
import CustomerAdminPanel from '@/components/CustomerAdminPanel';
import CustomerTrackingSettings from '@/components/CustomerTrackingSettings';
import OrderStageTiming from '@/components/OrderStageTiming';
import { printThermalOrder, testPrintThermal, PaperWidth } from '@/lib/thermalPrinter';

function getAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('novaesweb_admin_token') || '';
    if (token) {
      headers['x-admin-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  headers['x-store-id'] = process.env.NEXT_PUBLIC_STORE_ID || 'store_bella_pizza';
  return headers;
}

interface DriverOrderItem {
  assignmentId: string;
  orderId: string;
  orderNumber: string | number;
  customerName: string;
  address: string;
  neighborhood?: string;
  deliveryFee: number;
  acceptedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  forcedDelivery?: boolean;
  forcedDeliveryReason?: string | null;
}

interface StoreDispatchSettings {
  storeId: string;
  distributionMode: 'fixed_driver' | 'broadcast_enabled';
  fixedDriverId: string | null;
  maxConcurrentDeliveries: number;
  offerTimeoutSeconds: number;
  storeName?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeLatitude?: number;
  storeLongitude?: number;
}

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
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  dispatchedAt?: string;
  stageHistory?: Array<{stage: string; at: string; reason?: string; attemptId?: string}>;
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
  storeId?: string;
  inviteCode: string;
  driverName: string | null;
  name: string | null;
  phone: string | null;
  vehiclePlate: string | null;
  driverId?: string | null;
  status: 'aguardando_motoboy' | 'aguardando_vinculo' | 'ativo' | 'bloqueado' | 'revogado' | 'vinculo_removido' | 'expirado';
  effectiveStatus?: string;
  isExpired?: boolean;
  shiftStatus?: 'aguardando_motoboy' | 'em_plantao' | 'plantao_encerrado' | 'revogado' | 'vinculo_removido';
  presence: 'disponivel' | 'indisponivel';
  activeDeliveries: number;
  waitingPickupCount?: number;
  inTransitCount?: number;
  completedDeliveriesCount?: number;
  waitingPickupOrders?: DriverOrderItem[];
  inTransitOrders?: DriverOrderItem[];
  deliveredOrders?: DriverOrderItem[];
  hasAuthorizedTracking?: boolean;
  maxDeliveries: number;
  validityDays: number;
  inviteExpiryDays?: number;
  expiresAt?: string;
  createdAt?: string;
  revokedAt?: string;
  unlinkedAt?: string;
}

const STATUS_HIERARCHY: Record<string, number> = {
  'recebido': 1,
  'preparando': 2,
  'pronto': 3,
  'em_entrega': 4,
  'concluido': 5,
  'cancelado': 99
};

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'kanban' | 'menu' | 'logistics' | 'settings' | 'canceled' | 'first_access' | 'customers'>('kanban');
  const [canceledSearch, setCanceledSearch] = useState('');
  const [ordersSearch, setOrdersSearch] = useState('');

  // Estado REAL sem dados fakes (carregados da API e do banco)
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const ordersFetchInFlight = React.useRef(false);
  const ordersEpoch = React.useRef(0);
  const applyLocalOrders: typeof setOrders = update => { ordersEpoch.current++; setOrders(update); };
  const [stageNow, setStageNow] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    setStageNow(Date.now());
    const timer = setInterval(() => setStageNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreDispatchSettings>({
    storeId: 'store_bella_pizza',
    distributionMode: 'broadcast_enabled',
    fixedDriverId: null,
    maxConcurrentDeliveries: 5,
    offerTimeoutSeconds: 900,
    storeName: 'Bella Pizza',
    storeAddress: 'Rua Quinze de Janeiro, 150 - Centro, Canoas / RS',
    storeCity: 'Canoas',
    storeState: 'RS',
  });
  // Enquanto o lojista edita configurações, o polling não pode sobrescrever a escolha (causa do "entregador fixo trocar sozinho")
  const settingsDirtyRef = React.useRef(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [completedPeriodFilter, setCompletedPeriodFilter] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [focusedRouteDriverId, setFocusedRouteDriverId] = useState<string | null>(null);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverPlate, setNewDriverPlate] = useState('');
  const [newDriverBindImmediately, setNewDriverBindImmediately] = useState(false);
  const [dispatchModeChoice, setDispatchModeChoice] = useState<'fixed_driver' | 'broadcast_enabled'>('broadcast_enabled');
  const [dispatchWarningBanner, setDispatchWarningBanner] = useState<string | null>(null);
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
    // Modo Cozinha (Recolher Topo) e Fila de Novos Pedidos
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('novaesweb_kitchen_mode') === 'true';
    }
    return false;
  });
  const [pendingNewOrders, setPendingNewOrders] = useState<AdminOrder[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('novaesweb_paper_width');
      if (saved === '58mm' || saved === '80mm') return saved;
    }
    return '80mm';
  });
  const knownOrderIdsRef = React.useRef<Set<string> | null>(null);

  // Deteccao de novos pedidos para fila e impressao automatica
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const currentIds = new Set(orders.map(o => o.id));
    const initialLoad = knownOrderIdsRef.current === null;
    const known = knownOrderIdsRef.current || new Set<string>();
    knownOrderIdsRef.current = known;
    const freshOrders = orders.filter(o => !known.has(o.id) && o.status === 'recebido');
    currentIds.forEach(id => known.add(id));

    if (freshOrders.length > 0) {
      setPendingNewOrders(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const toAdd = freshOrders.filter(f => !existingIds.has(f.id));
        return [...prev, ...toAdd];
      });

      if (autoPrint && !initialLoad) {
        freshOrders.forEach(ord => printThermalOrder(ord, paperWidth));
      }
    }
  }, [orders, isLoading, isAuthenticated, autoPrint, paperWidth]);

  const alarmAudioRef = React.useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = alarmAudioRef.current || new AudioCtx();
        alarmAudioRef.current = ctx;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch {}
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void alarmAudioRef.current?.close().catch(() => {});
      alarmAudioRef.current = null;
    };
  }, []);

  // Alarme Sonoro Continuo Tipo Campainha de Delivery (Ding-Dong)
  useEffect(() => {
    if (pendingNewOrders.length === 0 || isMuted || !isAuthenticated) return;

    const playDingDong = () => {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = alarmAudioRef.current || new AudioCtx();
        alarmAudioRef.current = ctx;
        if (ctx.state === 'suspended') { void ctx.resume().catch(() => {}); return; }
        const now = ctx.currentTime;

        // Tom 1: Ding (880 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Tom 2: Dong (659 Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.22);
        gain2.gain.setValueAtTime(0.35, now + 0.22);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.22);
        osc2.stop(now + 0.85);
      } catch (e) {}
    };

    playDingDong();
    const interval = setInterval(playDingDong, 1800);
    return () => clearInterval(interval);
  }, [pendingNewOrders.length, isMuted, isAuthenticated]);

  // O marcador local não comprova que a sessão do servidor continua válida.
  useEffect(() => {
    let active = true;
    const expired = () => {
      sessionStorage.removeItem('novaesweb_admin_auth');
      sessionStorage.removeItem('novaesweb_admin_token');
      if (active) setIsAuthenticated(false);
    };
    window.addEventListener('novaesweb:admin-session-expired', expired);
    fetch('/api/admin/auth', {headers:getAdminHeaders(), cache:'no-store'})
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && data.authenticated) setIsAuthenticated(true);
        else expired();
      }).catch(() => {if (active) setIsAuthenticated(false);});
    return () => {active=false;window.removeEventListener('novaesweb:admin-session-expired', expired);};
  }, []);

  // Carregar cache local de pedidos para nunca sumir nada
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('novaesweb_orders');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            // Nomes de clientes não identificam dados de demonstração.
            setOrders(parsed);
          }
        }
      } catch (e) {}

      // Ouvir criação de novos pedidos em outras abas
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'novaesweb_orders' && e.newValue) {
          try {
            const newOrders = JSON.parse(e.newValue);
            // Other tabs may hold an older snapshot; ask the server instead.
            if (Array.isArray(newOrders) && sessionStorage.getItem('novaesweb_admin_token')) void fetchData(true);
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
  const [orderToCancel, setOrderToCancel] = useState<AdminOrder | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('Cancelado pelo lojista');
  const [isCancelingOrder, setIsCancelingOrder] = useState(false);
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
    if (ordersFetchInFlight.current) return;
    ordersFetchInFlight.current = true;
    const epoch = ordersEpoch.current;
    if (!silent) setIsRefreshing(true);
    try {
      // 1. Buscar Pedidos Reais
      const resOrders = await fetch(`/api/orders?t=${Date.now()}`, {
        headers: getAdminHeaders(),
      });
      if (!resOrders.ok) {
        console.warn('[Admin] Não autorizado ou falha ao buscar pedidos da API:', resOrders.status);
        return;
      }
      const dataOrders = await resOrders.json().catch(() => null);
      if (epoch !== ordersEpoch.current) return;
      if (dataOrders && dataOrders.success && Array.isArray(dataOrders.orders)) {
        setOrders(prevOrders => {
          if (epoch !== ordersEpoch.current) return prevOrders;
          // Todo pedido retornado pelo servidor deve ser exibido, independentemente do nome.
          const incoming: AdminOrder[] = dataOrders.orders;

          // Se a lista no servidor estiver vazia (ex: limpeza de demonstração pelo lojista), limpa tudo
          if (incoming.length === 0) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('novaesweb_orders');
            }
            return [];
          }


          // O servidor inclui as devoluções ao despacho e o estado confirmado.
          const result = incoming;

          if (typeof window !== 'undefined') {
            localStorage.setItem('novaesweb_orders', JSON.stringify(result));
          }
          return result;
        });
      }

      // 2. Sincronização em Tempo Real com o Backend Logístico Seguro (Ofertas, Entregadores, Entregas e Configurações)
      try {
        const cloudRes = await fetch(`/api/v1/logistics/drivers?t=${Date.now()}`, {
          headers: getAdminHeaders(),
        });
        if (cloudRes.ok) {
          const cloudData = await cloudRes.json().catch(() => null);
          if (cloudData && cloudData.settings && !settingsDirtyRef.current) {
            setStoreSettings(cloudData.settings);
          }
          if (Array.isArray(cloudData.drivers)) {
            // Entregadores com vínculo removido/convite revogado são tratados como excluídos (histórico segue preservado no servidor)
            const validDrivers: AdminDriver[] = cloudData.drivers.filter(
              (d: any) =>
                d.status !== 'vinculo_removido' &&
                d.status !== 'revogado'
            );
            setDrivers(validDrivers);
            const activeValid = validDrivers.filter(
              (d) => d.status === 'ativo' && !d.isExpired
            );
            if (!selectedDriverId && activeValid.length > 0) {
              setSelectedDriverId(
                cloudData.settings?.fixedDriverId || activeValid[0].id
              );
            }
          }

          // Os pedidos já vêm projetados pelo servidor com aceite, retirada e conclusão.

        }
      } catch (cloudErr) {
        console.warn('Erro ao sincronizar logistics.json do Supabase:', cloudErr);
      }
    } catch (err) {
      console.error('Erro ao sincronizar dados:', err);
    } finally {
      ordersFetchInFlight.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // POLLING AUTOMÁTICO A CADA 3 SEGUNDOS (Tempo Real Conectado ao App do Entregador)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Transições do Kanban Conectadas à API
  const handleAdvanceStatus = async (orderId: string, currentStatus: AdminOrder['status']) => {
    const sequence: AdminOrder['status'][] = ['recebido', 'preparando', 'pronto', 'em_entrega', 'concluido'];
    const currentIdx = sequence.indexOf(currentStatus);
    if (currentIdx < sequence.length - 1) {
      const nextStatus = sequence[currentIdx + 1];
      
      // Atualização imediata otimista no estado e no cache local
      applyLocalOrders(prev => {
        const updated = prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o);
        if (typeof window !== 'undefined') {
          localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
        }
        return updated;
      });

      try {
        const patchRes = await fetch('/api/orders', {
          method: 'PATCH',
          headers: getAdminHeaders(),
          body: JSON.stringify({ orderId, status: nextStatus })
        });
        if (patchRes.ok) {
          // Atualiza cache local com sucesso garantido
          if (typeof window !== 'undefined') {
            const currentCached = localStorage.getItem('novaesweb_orders');
            if (currentCached) {
              try {
                const list = JSON.parse(currentCached);
                const updated = list.map((o: any) => o.id === orderId ? { ...o, status: nextStatus } : o);
                localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
              } catch {}
            }
          }
        }
      } catch (err) {
        console.error('Erro ao comunicar com o servidor:', err);
      }

      setTimeout(() => fetchData(true), 400);
    }
  };

  // Confirmar Pix Manual Conectado à API
  const handleConfirmPix = async (orderId: string) => {
    applyLocalOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, paymentStatus: 'confirmado_manual' as const } : o);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ orderId, paymentStatus: 'confirmado_manual' })
      });
    } catch (err) {}
    setTimeout(() => fetchData(true), 600);
  };

  // Cancelar com Justificativa Conectado à API e Sincronizado (abre modal elegante sem usar window.prompt)
  const handleOpenCancelModal = (order: AdminOrder) => {
    setOrderToCancel(order);
    setCancelReasonInput('Cancelado pelo lojista');
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    const orderId = orderToCancel.id;
    const cancelReason = cancelReasonInput.trim() || 'Cancelado pelo lojista';
    const cancelTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date().toLocaleDateString('pt-BR');

    setIsCancelingOrder(true);

    applyLocalOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { 
        ...o, 
        status: 'cancelado' as const,
        dispatchStatus: 'disponivel' as const,
        driverName: null,
        assignedDriverName: null,
        offerGroupId: null,
        cancellationReason: cancelReason,
        canceledAt: cancelTime
      } : o);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    setSelectedOrderIds(prev => prev.filter(id => id !== orderId));

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ 
          orderId, 
          status: 'cancelado',
          dispatchStatus: 'disponivel',
          cancellationReason: cancelReason,
          canceledAt: cancelTime
        })
      });
    } catch (err) {}

    // Cancela ofertas pendentes deste pedido no backend logístico
    try {
      await fetch('/api/v1/logistics/offer-cancel', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ orderId })
      });
    } catch (eLog) {
      console.warn('Erro ao sincronizar cancelamento de oferta:', eLog);
    }

    setIsCancelingOrder(false);
    setOrderToCancel(null);
    setDispatchAlert('Pedido cancelado com sucesso e transferido para a aba de Pedidos Cancelados.');
    setTimeout(() => setDispatchAlert(null), 4000);
    setTimeout(() => fetchData(true), 600);
  };

  // Restaurar Pedido Cancelado de volta para "Recebido"
  const handleRestoreOrder = async (orderId: string) => {
    if (!confirm('Deseja restaurar este pedido de volta para a coluna "1. Recebido" do Kanban?')) return;

    applyLocalOrders(prev => {
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
        headers: getAdminHeaders(),
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

    applyLocalOrders(prev => {
      const updated = prev.filter(o => o.id !== orderId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: getAdminHeaders(),
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

  // Despacho inteligente respeitando o Modo de Distribuição configurado na loja:
  // Modo A (Entregador Fixo): Despacha automaticamente para o entregador fixo sem exigir nova seleção em cada pedido.
  // Se o entregador fixo estiver bloqueado, expirado ou sem capacidade, avisa o lojista e abre o modal para escolher outro (nunca troca silenciosamente!).
  // Modo B (Oferta para entregadores habilitados): Abre o painel ou envia oferta para todos os entregadores elegíveis.
  const executeDispatchOrders = async (
    targetOrders: AdminOrder[],
    options?: {
      modeOverride?: 'fixed_driver' | 'broadcast_enabled';
      driverIdOverride?: string | null;
      fromModal?: boolean;
    }
  ) => {
    if (targetOrders.length === 0) return;

    const mode = options?.modeOverride || storeSettings.distributionMode || 'broadcast_enabled';
    const targetDriverId =
      mode === 'fixed_driver'
        ? options?.driverIdOverride || storeSettings.fixedDriverId || selectedDriverId
        : null;

    const destination = targetDriverId ? drivers.find(d => d.id === targetDriverId || d.driverId === targetDriverId) : null;
    if (!window.confirm(`Enviar ${targetOrders.length} pedido(s) para ${destination?.driverName || destination?.name || (targetDriverId ? 'o entregador selecionado' : 'os entregadores habilitados')}?`)) return;
    setIsSendingDispatch(true);
    setDispatchWarningBanner(null);

    const feeNum = parseFloat(deliveryFeeOffered.replace(',', '.')) || 12.0;
    const offerOrders = targetOrders.map((o) => ({
      id: o.id,
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName || 'Cliente',
      customerPhone: o.phone || '',
      customerAddress: o.address,
      deliveryAddress: o.address,
      customerNeighborhood: o.region || 'Região Central',
      itemsSummary: o.itemsSummary || '1x Pedido Delivery',
      total: o.total,
      deliveryFee: Number((feeNum / targetOrders.length).toFixed(2)),
      deliveryPin: o.deliveryPin || '****',
    }));

    try {
      const res = await fetch('/api/v1/logistics/offer-create', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          orderId: targetOrders[0].id,
          orderNumber: targetOrders[0].orderNumber,
          orderIds: targetOrders.map((o) => o.id),
          orders: offerOrders,
          customerAddress: targetOrders.map((o) => `#${o.orderNumber}: ${o.address}`).join(' | '),
          distributionMode: mode,
          driverId: mode === 'fixed_driver' ? targetDriverId : null,
          feeOffered: feeNum,
          totalOrdersGrouped: targetOrders.length,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setIsSendingDispatch(false);
        // Se o entregador fixo estiver bloqueado, expirado ou sem capacidade, avisa e permite escolher outro no modal (sem trocar silenciosamente!)
        setDispatchWarningBanner(
          data.error ||
            'Não foi possível despachar automaticamente. Selecione outro entregador ou modo de distribuição abaixo.'
        );
        setSelectedOrderIds(targetOrders.map((o) => o.id));
        if (targetOrders.length === 1) {
          setSelectedOrderToDispatch(targetOrders[0]);
        }
        setDispatchModeChoice('fixed_driver');
        setIsDispatchDrawerOpen(true);
        return;
      }

      const assignedLabel =
        data.offer?.driverName ||
        (mode === 'broadcast_enabled'
          ? `Oferta para ${data.notifiedDriversCount || 'todos os'} entregadores habilitados`
          : 'Entregador Fixo');

      const selectedIdSet = new Set(targetOrders.map((o) => o.id));
      applyLocalOrders((prev) => {
        const updated = prev.map((o) =>
          selectedIdSet.has(o.id)
            ? {
                ...o,
                dispatchStatus: 'aguardando_aceite' as const,
                assignedDriverName: assignedLabel,
                driverName: assignedLabel,
                offerGroupId: data.offer?.offerId || data.offer?.id,
              }
            : o
        );
        if (typeof window !== 'undefined') {
          localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
        }
        return updated;
      });

      setIsSendingDispatch(false);
      setIsDispatchDrawerOpen(false);
      setSelectedOrderIds([]);
      setSelectedOrderToDispatch(null);
      setDispatchWarningBanner(null);
      setDispatchAlert(
        mode === 'fixed_driver'
          ? `Pedido(s) despachado(s) diretamente para o entregador ${assignedLabel}! Aguardando aceite.`
          : `Oferta de ${targetOrders.length} pedido(s) enviada para ${data.notifiedDriversCount || 'todos os'} entregador(es) habilitado(s) da loja!`
      );
      setTimeout(() => setDispatchAlert(null), 5000);
      fetchData(true);
    } catch (err: any) {
      setIsSendingDispatch(false);
      setDispatchWarningBanner(err.message || 'Erro de comunicação ao despachar.');
    }
  };

  const handleOpenDispatchForSingle = async (order: AdminOrder) => {
    setDispatchWarningBanner(null);
    setDispatchModeChoice(storeSettings.distributionMode || 'broadcast_enabled');
    if (storeSettings.fixedDriverId) {
      setSelectedDriverId(storeSettings.fixedDriverId);
    } else {
      const activeFirst = drivers.find(d => d.status === 'ativo');
      if (activeFirst) {
        setSelectedDriverId(activeFirst.driverId || activeFirst.id);
      }
    }
    setSelectedOrderIds([order.id]);
    setSelectedOrderToDispatch(order);
    setIsDispatchDrawerOpen(true);
  };

  const handleOpenDispatchForSelected = async () => {
    if (selectedOrderIds.length === 0) return;
    const batchOrders = orders.filter((o) => selectedOrderIds.includes(o.id));
    if (batchOrders.length === 0) return;

    setDispatchWarningBanner(null);
    setDispatchModeChoice(storeSettings.distributionMode || 'broadcast_enabled');
    if (storeSettings.fixedDriverId) {
      setSelectedDriverId(storeSettings.fixedDriverId);
    } else {
      const activeFirst = drivers.find(d => d.status === 'ativo');
      if (activeFirst) {
        setSelectedDriverId(activeFirst.driverId || activeFirst.id);
      }
    }
    setIsDispatchDrawerOpen(true);
  };

  // Cancelar ou Retirar Despacho de Pedido em "Aguardando Aceite"
  const handleCancelDispatch = async (orderId: string) => {
    if (!confirm('Deseja retirar este pedido do despacho e torná-lo disponível novamente?')) return;

    applyLocalOrders((prev) => {
      const updated = prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              dispatchStatus: 'disponivel' as const,
              assignedDriverName: null,
              driverName: null,
              offerGroupId: null,
            }
          : o
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/v1/logistics/offer-cancel', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ orderId }),
      });
    } catch (err) {
      console.error('Erro ao cancelar oferta de despacho:', err);
    }

    setDispatchAlert('Despacho cancelado com sucesso. O pedido está pronto para nova seleção.');
    setTimeout(() => setDispatchAlert(null), 4000);
    fetchData(true);
  };

  // Disparar Oferta de Despacho pelo Modal (suporta Modo Entregador Específico/Fixo ou Oferta para Todos Habilitados)
  const handleSendGroupedDispatchOffer = async () => {
    const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) {
      alert('Nenhum pedido selecionado para despacho.');
      return;
    }

    if (dispatchModeChoice === 'fixed_driver' && !selectedDriverId) {
      alert('Selecione um entregador para enviar a oferta.');
      return;
    }

    await executeDispatchOrders(selectedOrders, {
      modeOverride: dispatchModeChoice,
      driverIdOverride: dispatchModeChoice === 'fixed_driver' ? selectedDriverId : null,
      fromModal: true,
    });
  };

  const handleSendDispatchOffer = async () => {
    if (selectedOrderToDispatch) {
      await executeDispatchOrders([selectedOrderToDispatch], {
        modeOverride: dispatchModeChoice,
        driverIdOverride: dispatchModeChoice === 'fixed_driver' ? selectedDriverId : null,
        fromModal: true,
      });
      return;
    }
    await handleSendGroupedDispatchOffer();
  };

  // Salvar Configurações de Distribuição e Despacho da Loja
  const handleSaveLogisticsSettings = async (customSettings?: Partial<StoreDispatchSettings>) => {
    setIsSavingSettings(true);
    setSettingsSavedMsg(null);
    const nextSettings = {
      ...storeSettings,
      ...(customSettings || {}),
    };
    try {
      const res = await fetch('/api/v1/logistics/settings-update', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          ...nextSettings,
          applyLimitToAllDrivers: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.success) {
        settingsDirtyRef.current = false;
        setStoreSettings(data.settings);
        setSettingsSavedMsg('Configurações salvas com sucesso!');
        setTimeout(() => setSettingsSavedMsg(null), 3500);
        fetchData(true);
      }
    } catch (e) {
      console.error('Erro ao salvar configurações:', e);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Altera configuração e já salva no servidor (evita que o polling reverta a escolha)
  const updateAndSaveSettings = (patch: Partial<StoreDispatchSettings>) => {
    settingsDirtyRef.current = true;
    setStoreSettings((prev) => ({ ...prev, ...patch }));
    handleSaveLogisticsSettings(patch);
  };

  // Cadastrar / Convidar Entregador e Gerar Código de Vínculo (funciona mesmo sem pedidos)
  const handleGenerateShiftCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGeneratingShiftCode(true);
    const days = parseInt(shiftValidity) || 7;

    try {
      const res = await fetch('/api/v1/logistics/invite-issue', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          validityDays: days,
          driverName: newDriverName.trim() || undefined,
          phone: newDriverPhone.trim() || undefined,
          vehiclePlate: newDriverPlate.trim() || undefined,
          bindImmediately: false,
          maxDeliveries: storeSettings.maxConcurrentDeliveries || 5,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.success && data.inviteCode) {
          setGeneratedShiftCode(data.inviteCode);
          setNewDriverName('');
          setNewDriverPhone('');
          setNewDriverPlate('');
          setNewDriverBindImmediately(false);
          fetchData(true);
        }
      }
    } catch (err) {
      console.error('Erro ao emitir código de vínculo:', err);
    } finally {
      setIsGeneratingShiftCode(false);
    }
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  const getWhatsAppShareUrl = (code?: string) => {
    if (!code) return undefined;
    const text = `Olá! Seu código de plantão na Bella Pizza é: ${code}. Entre na sua conta do NovaesWeb Entregador e use este código para conectar-se à loja. Este código não cria uma conta nova.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const handleLinkDriverAccount = async (driver: AdminDriver) => {
    const phone = window.prompt('Telefone com DDD da conta que o entregador criou no aplicativo:', driver.phone || '');
    if (!phone?.trim()) return;
    try {
      const payload = {membershipId:driver.id,phone};
      const previewResponse = await fetch('/api/v1/logistics/account-link-existing',{method:'POST',headers:getAdminHeaders(),body:JSON.stringify(payload)});
      const preview = await previewResponse.json();
      if (!previewResponse.ok || !preview.success) throw new Error(preview.error || 'Não foi possível conferir a conta.');
      if (!window.confirm('Associar o vínculo e o histórico de ' + (driver.driverName || driver.name || 'este entregador') + ' à conta ' + preview.preview.name + ' (' + preview.preview.phone + ')? Confirme pessoalmente com o entregador.')) return;
      const response = await fetch('/api/v1/logistics/account-link-existing',{method:'POST',headers:getAdminHeaders(),body:JSON.stringify({...payload,confirmed:true})});
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível associar a conta.');
      window.alert('Conta associada. O entregador pode atualizar o aplicativo para recuperar o vínculo e o histórico.');
      fetchData(true);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não foi possível associar a conta.'); }
  };

  // Ativar ou Bloquear o recebimento de novas ofertas pelo entregador
  const handleToggleBlockDriver = async (driverId: string) => {
    await fetch('/api/v1/logistics/driver-toggle-block', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ driverId }),
    });
    fetchData(true);
  };

  // Revogar convite pendente
  const handleRevokeInvite = async (driverId: string) => {
    if (!confirm('Deseja revogar este convite? O código não poderá mais ser utilizado.')) return;
    await fetch('/api/v1/logistics/invite-revoke', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ driverId }),
    });
    fetchData(true);
  };

  // Remover vínculo de um entregador com a loja (preservando conta pessoal e histórico, exigindo tratamento se houver entregas em andamento)
  const handleDeleteDriverShift = async (driverId: string) => {
    const targetDrv = drivers.find((d) => d.id === driverId || d.driverId === driverId);
    const label = targetDrv?.driverName || targetDrv?.name || targetDrv?.inviteCode || 'este entregador';

    if (
      !confirm(
        `Deseja remover o vínculo de "${label}" com a loja?\n\nA conta pessoal do entregador e o histórico de entregas concluídas serão preservados.`
      )
    ) {
      return;
    }

    const res = await fetch('/api/v1/logistics/driver-unlink', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ driverId }),
    });

    const data = await res.json().catch(() => ({}));

    // Se houver entregas em andamento, exige tratamento explícito antes da remoção
    if (res.status === 409 && data.requiresExplicitHandling) {
      const confirmReturn = confirm(
        `ATENÇÃO: ${data.error}\n\nDeseja devolver os ${data.activeDeliveriesCount} pedido(s) em andamento para a fila de despacho da loja ("Pronto / Disponível") e concluir a remoção do vínculo agora?`
      );
      if (!confirmReturn) return;

      const retryRes = await fetch('/api/v1/logistics/driver-unlink', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          driverId,
          handleActiveDeliveries: 'return_to_queue',
        }),
      });
      const retryData = await retryRes.json().catch(() => ({}));
      if (retryRes.ok && retryData.success) {
        setDispatchAlert(
          `Vínculo removido. ${retryData.returnedOrdersCount || 0} pedido(s) ativo(s) devolvido(s) à fila da loja e histórico preservado.`
        );
        setTimeout(() => setDispatchAlert(null), 5000);
      }
    } else if (res.ok && data.success) {
      setDispatchAlert('Vínculo com a loja removido com sucesso (histórico preservado).');
      setTimeout(() => setDispatchAlert(null), 4000);
    }

    if (generatedShiftCode === driverId) setGeneratedShiftCode(null);
    fetchData(true);
  };

  // Zerar todos os pedidos e demonstrações (Limpeza total do painel para operação real)
  const handleWipeAllOrdersAndDemos = async () => {
    if (
      !confirm(
        'ATENÇÃO: Deseja realmente excluir TODOS os pedidos e demonstrações do painel?\n\nEsta ação limpa o banco de dados e o histórico local, deixando o painel zerado para iniciar pedidos reais.'
      )
    ) {
      return;
    }

    try {
      const res = await fetch('/api/v1/logistics/admin-clean-demo', {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('novaesweb_orders');
        }
        applyLocalOrders([]);
        setDispatchAlert('Todos os pedidos e demonstrações foram excluídos com sucesso. Painel 100% limpo!');
        setTimeout(() => setDispatchAlert(null), 4000);
        fetchData(true);
      }
    } catch (e) {
      alert('Erro ao limpar pedidos do servidor.');
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

      {/* Botao Flutuante para Restaurar Topo quando recolhido */}
      {isHeaderCollapsed && (
        <div className="fixed top-3 right-4 z-40 animate-fade-in">
          <button
            type="button"
            onClick={() => {
              setIsHeaderCollapsed(false);
              localStorage.setItem('novaesweb_kitchen_mode', 'false');
            }}
            className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center gap-2 shadow-2xl shadow-red-600/50 transition transform active:scale-95"
            title="Sair do modo tela cheia e exibir menu"
          >
            <Minimize2 className="w-4 h-4" />
            <span>Exibir Menu Principal</span>
          </button>
        </div>
      )}

      {/* Topo do Painel Administrativo (Recolhivel no Modo Cozinha) */}
      <header className={`border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-30 transition-all duration-300 ${
        isHeaderCollapsed ? 'hidden' : 'block'
      }`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          
          <div className="flex items-center flex-wrap gap-2 sm:gap-3">
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

          <div className="flex items-center flex-wrap gap-2">
            <StoreNotificationCenter getHeaders={getAdminHeaders} onOpenOrder={id=>setDetailOrderId(id)} />
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
              type="button"
              onClick={() => setActiveTab('first_access')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              title="Cadastrar motoboy e gerar código para o aplicativo NovaesWeb Entregador"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>+ Cadastrar Motoboy</span>
            </button>

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
        <div className="admin-tabs flex gap-2 mt-3 pt-3 border-t border-zinc-800/80 overflow-x-auto text-xs font-bold">
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
            onClick={() => setActiveTab('first_access')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${
              activeTab === 'first_access'
                ? 'bg-amber-500 text-zinc-950 font-black shadow-lg shadow-amber-500/30'
                : 'text-amber-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>Cadastrar Motoboy (Primeiro Acesso)</span>
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

          <button type="button" onClick={()=>setActiveTab('customers')} className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${activeTab==='customers'?'bg-red-600 text-white':'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}>
            <Users className="h-4 w-4"/><span>Clientes</span>
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
        {activeTab === 'customers' && <CustomerAdminPanel getHeaders={getAdminHeaders} />}
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

                <button
                  type="button"
                  onClick={() => {
                    const next = !isHeaderCollapsed;
                    setIsHeaderCollapsed(next);
                    localStorage.setItem('novaesweb_kitchen_mode', String(next));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition border border-zinc-700/60"
                  title="Recolher topo para o Kanban ocupar toda a tela da cozinha"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{isHeaderCollapsed ? 'Restaurar Menu' : 'Modo Tela Cheia (Recolher Topo)'}</span>
                </button>
              </div>
            </div>

            {/* Busca de pedidos */}
            <div className="max-w-md flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar pedido (#, nome, telefone, endereço)..."
                value={ordersSearch}
                onChange={(e) => setOrdersSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pizza-gold/50"
              />
              {ordersSearch && (
                <button
                  type="button"
                  onClick={() => setOrdersSearch('')}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Etapas do pedido */}
            <div className="admin-kanban">
              
              {[
                { key: 'recebido', label: '1. Recebido', color: 'border-blue-500/40 text-blue-400' },
                { key: 'preparando', label: '2. Preparando', color: 'border-amber-500/40 text-amber-400' },
                { key: 'pronto', label: '3. Despacho', color: 'border-purple-500/40 text-purple-400' },
                { key: 'retirada', label: '4. Retirada', color: 'border-cyan-500/40 text-cyan-400' },
                { key: 'em_entrega', label: '5. Em Entrega', color: 'border-orange-500/40 text-orange-400' },
                { key: 'concluido', label: '6. Concluídos', color: 'border-emerald-500/40 text-emerald-400' },
              ].map((col) => {
                const q = ordersSearch.toLowerCase();
                const colOrders = orders.filter(
                  (o) =>
                    (o.status === 'pronto' && o.dispatchStatus === 'aceito_aguardando_retirada' ? 'retirada' : o.status) === col.key &&
                    [
                      String(o.orderNumber),
                      o.customerName,
                      o.phone,
                      o.address,
                    ]
                      .filter(Boolean)
                      .join(' ')
                      .toLowerCase()
                      .includes(q)
                );

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
                        colOrders.map((order) => {
                          const orderTimeMs = order.createdAtISO ? new Date(order.createdAtISO).getTime() : 0;
                          const elapsedMins = orderTimeMs ? Math.max(0, Math.floor((Date.now() - orderTimeMs) / 60000)) : null;

                          // Estilo Tematico por Coluna/Status
                          const cardTheme = selectedOrderIds.includes(order.id)
                            ? 'border-red-600/90 bg-red-950/30 shadow-lg shadow-red-950/40'
                            : col.key === 'recebido'
                            ? 'border-blue-500/70 bg-gradient-to-b from-blue-950/35 to-zinc-900/95 shadow-lg shadow-blue-950/20 hover:border-blue-400'
                            : col.key === 'preparando'
                            ? 'border-amber-500/70 bg-gradient-to-b from-amber-950/35 to-zinc-900/95 shadow-lg shadow-amber-950/20 hover:border-amber-400'
                            : col.key === 'pronto'
                            ? 'border-purple-500/70 bg-gradient-to-b from-purple-950/35 to-zinc-900/95 shadow-lg shadow-purple-950/20 hover:border-purple-400'
                            : col.key === 'em_entrega'
                            ? 'border-orange-500/70 bg-gradient-to-b from-orange-950/35 to-zinc-900/95 shadow-lg shadow-orange-950/20 hover:border-orange-400'
                            : 'border-emerald-500/40 bg-zinc-900/80 hover:border-emerald-500/70';

                          return (
                          <div
                            key={order.id}
                            className={`p-3.5 rounded-xl border transition duration-150 space-y-2.5 text-xs ${cardTheme}`}
                          >
                            {/* Barra de Status & SLA de Tempo */}
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                col.key === 'recebido' ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50' :
                                col.key === 'preparando' ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50 flex items-center gap-1' :
                                col.key === 'pronto' ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50' :
                                col.key === 'em_entrega' ? 'bg-orange-900/60 text-orange-300 border border-orange-700/50' :
                                'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40'
                              }`}>
                                {col.key === 'recebido' && 'Novo Pedido'}
                                {col.key === 'preparando' && '🔥 No Forno'}
                                {col.key === 'pronto' && 'Pronto p/ Despacho'}
                                {col.key === 'retirada' && 'Aguardando retirada'}
                                {col.key === 'em_entrega' && 'Na Rua'}
                                {col.key === 'concluido' && 'Entregue ✓'}
                              </span>

                              {elapsedMins !== null && col.key !== 'concluido' && (
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                  elapsedMins > 30 
                                    ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse' 
                                    : elapsedMins > 15 
                                    ? 'bg-amber-950 text-amber-400 border border-amber-800' 
                                    : 'bg-zinc-800 text-zinc-300'
                                }`}>
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>{elapsedMins} min</span>
                                </span>
                              )}
                            </div>
                            <OrderStageTiming order={order} now={stageNow} />
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
                                onClick={() => handleOpenCancelModal(order)}
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
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-blue-400 font-bold px-2 py-1 rounded bg-blue-950/60 border border-blue-900 flex items-center gap-1">
                                      <Clock className="w-3 h-3 animate-spin" />
                                      <span>Aguardando Retirada...</span>
                                    </span>
                                    <button
                                      onClick={() => handleCancelDispatch(order.id)}
                                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-semibold transition"
                                      title="Trocar motoboy deste pedido"
                                    >
                                      Trocar
                                    </button>
                                  </div>
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
                                <div className="flex items-center gap-1">
                                  {col.key === 'em_entrega' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const phoneDigits = (order.phone || '').replace(/\D/g, '');
                                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                                        const trackUrl = `${origin}/pedido/${order.trackingToken || order.id}`;
                                        const driverMsg = order.driverName ? ` com o entregador ${order.driverName}` : '';
                                        const text = `🍕 *Bella Pizza:* Olá ${order.customerName || 'Cliente'}! Seu pedido #${order.orderNumber} está a caminho da sua casa${driverMsg}.\n\n📍 *Acompanhe em tempo real pelo mapa:*\n${trackUrl}\n\nObrigado pela preferência!`;
                                        const waUrl = phoneDigits
                                          ? `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(text)}`
                                          : `https://wa.me/?text=${encodeURIComponent(text)}`;
                                        window.open(waUrl, '_blank');
                                      }}
                                      className="px-2 py-1 rounded-md bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-bold text-[10px] flex items-center gap-1 transition shadow-sm"
                                      title="Enviar link de rastreamento no WhatsApp do cliente"
                                    >
                                      <MessageCircle className="w-3 h-3 text-emerald-400" />
                                      <span>WhatsApp Rastreio</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleAdvanceStatus(order.id, order.status)}
                                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-[10px] flex items-center gap-1 transition"
                                  >
                                    <span>Avançar</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : null}
                            </div>

                          </div>
                        );
                      })
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
            <button type="button" onClick={() => setActiveTab('first_access')} className="px-4 py-3 rounded-xl bg-amber-500 text-zinc-950 text-sm font-bold">Cadastrar motoboy e gerenciar primeiro acesso</button>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Visão dos Entregadores da Loja & Logística</h2>
                <p className="text-xs text-zinc-400">
                  Acompanhe os entregadores vinculados à loja, pedidos aceitos aguardando retirada, em percurso e entregues.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300">
                  Modo de distribuição:{' '}
                  <strong className="text-amber-400">
                    {storeSettings.distributionMode === 'fixed_driver' ? 'Entregador Fixo' : 'Oferta p/ Habilitados (Broadcast)'}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configurar Despacho</span>
                </button>
              </div>
            </div>

            {/* RASTREAMENTO AO VIVO: MOTOBBOYS EM PERCURSO */}
            <div id="live-route-map-section">
              <DriverInTransitList
                focusedDriverId={focusedRouteDriverId}
                onOpenOrderDetail={(orderId) => setDetailOrderId(orderId)}
              />
            </div>

            {/* VISÃO DOS ENTREGADORES DA LOJA (SEÇÃO 5) */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Visão dos Entregadores da Loja ({drivers.length})</span>
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Contagem individual de pedidos por entregador (apenas dados desta loja)
                  </span>
                </div>

                {/* Filtro por período para os concluídos */}
                <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-500 px-2 uppercase">Concluídos:</span>
                  {[
                    { id: 'today', label: 'Hoje' },
                    { id: '7d', label: '7 dias' },
                    { id: '30d', label: '30 dias' },
                    { id: 'all', label: 'Todos' },
                  ].map((period) => (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => setCompletedPeriodFilter(period.id as 'today' | '7d' | '30d' | 'all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        completedPeriodFilter === period.id
                          ? 'bg-red-600 text-white shadow'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-x-auto shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">Entregador & Código</th>
                      <th className="p-4">Situação do Vínculo</th>
                      <th className="p-4">Aguardando Retirada</th>
                      <th className="p-4">Em Percurso</th>
                      <th className="p-4">Entregues ({completedPeriodFilter === 'today' ? 'Hoje' : completedPeriodFilter === '7d' ? '7 dias' : completedPeriodFilter === '30d' ? '30 dias' : 'Total'})</th>
                      <th className="p-4 text-right">Rota & Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {drivers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-500 text-xs">
                          Nenhum entregador vinculado ou código gerado. Cadastre entregadores abaixo ou em Configurações → Entregadores e Despacho.
                        </td>
                      </tr>
                    ) : (
                      drivers.map((drv) => {
                        const isWaiting = (!drv.driverName && !drv.name) || drv.status === 'aguardando_motoboy' || drv.status === 'aguardando_vinculo';
                        const isBlocked = drv.status === 'bloqueado';
                        const isRevoked = drv.status === 'revogado';
                        const isUnlinked = drv.status === 'vinculo_removido';
                        const isExpired = drv.isExpired || drv.status === 'expirado';
                        const isOnline = drv.presence === 'disponivel' && !isBlocked && !isRevoked && !isUnlinked && !isExpired;

                        const waitingList = drv.waitingPickupOrders || [];
                        const transitList = drv.inTransitOrders || [];
                        const allDelivered = drv.deliveredOrders || [];

                        const nowMs = Date.now();
                        const filteredDelivered = allDelivered.filter((item) => {
                          if (completedPeriodFilter === 'all') return true;
                          const rawTs = item.deliveredAt || item.pickedUpAt || item.acceptedAt;
                          const ts = rawTs ? new Date(rawTs).getTime() : 0;
                          if (!ts) return true;
                          if (completedPeriodFilter === 'today') {
                            const startOfDay = new Date();
                            startOfDay.setHours(0, 0, 0, 0);
                            return ts >= startOfDay.getTime();
                          }
                          if (completedPeriodFilter === '7d') {
                            return nowMs - ts <= 7 * 24 * 60 * 60 * 1000;
                          }
                          if (completedPeriodFilter === '30d') {
                            return nowMs - ts <= 30 * 24 * 60 * 60 * 1000;
                          }
                          return true;
                        });

                        const hasRouteActive = transitList.length > 0 || (drv.inTransitCount || 0) > 0;

                        return (
                          <tr key={drv.id} className="hover:bg-zinc-800/30 transition align-top">
                            {/* Entregador & Código */}
                            <td className="p-4">
                              <div className="space-y-1">
                                <p className="font-bold text-white text-xs">
                                  {drv.driverName || drv.name || 'Convite Aguardando Vínculo'}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-black text-amber-400 bg-zinc-950 px-2 py-0.5 rounded border border-amber-500/30 text-[11px]">
                                    {drv.inviteCode || 'Primeiro acesso'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(drv.inviteCode)}
                                    disabled={!drv.inviteCode}
                                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
                                    title="Copiar Código"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <button type="button" onClick={() => handleLinkDriverAccount(drv)} className="text-[11px] text-sky-300 hover:text-sky-100 underline">Associar conta cadastrada</button>
                                {(drv.phone || drv.vehiclePlate) && (
                                  <p className="text-[11px] text-zinc-400 font-mono">
                                    {drv.phone || 'Sem tel'} {drv.vehiclePlate ? `• ${drv.vehiclePlate}` : ''}
                                  </p>
                                )}
                              </div>
                            </td>

                            {/* Situação do Vínculo */}
                            <td className="p-4">
                              <div className="space-y-1">
                                {isUnlinked ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-400">
                                    ⚪ Vínculo Removido
                                  </span>
                                ) : isRevoked ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-950/60 border border-red-800/60 text-red-400">
                                    🚫 Convite Revogado
                                  </span>
                                ) : isExpired ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 border border-zinc-700 text-amber-400">
                                    ⏰ Código Expirado
                                  </span>
                                ) : isBlocked ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-950/80 border border-red-800 text-red-300">
                                    🔴 Bloqueado p/ Ofertas
                                  </span>
                                ) : isWaiting ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                    🟡 Aguardando Vínculo
                                  </span>
                                ) : isOnline ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                                    🟢 Vínculo Ativo (Online)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    🟢 Vínculo Ativo
                                  </span>
                                )}
                                <p className="text-[10px] text-zinc-500">
                                  Capacidade: <strong className="text-zinc-300">{drv.activeDeliveries || 0}</strong> pedidos
                                </p>
                              </div>
                            </td>

                            {/* Pedidos Aceitos Aguardando Retirada */}
                            <td className="p-4">
                              <div className="space-y-1.5">
                                <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${waitingList.length > 0 ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'text-zinc-500'}`}>
                                  {waitingList.length} {waitingList.length === 1 ? 'pedido' : 'pedidos'}
                                </span>
                                {waitingList.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {waitingList.map((ord) => (
                                      <button
                                        key={ord.orderId}
                                        type="button"
                                        onClick={() => setDetailOrderId(ord.orderId)}
                                        className="px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/60 font-mono font-bold text-[10px] transition"
                                        title={`${ord.customerName} — ${ord.address}`}
                                      >
                                        #{ord.orderNumber}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Pedidos em Percurso */}
                            <td className="p-4">
                              <div className="space-y-1.5">
                                <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${transitList.length > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'text-zinc-500'}`}>
                                  {transitList.length} {transitList.length === 1 ? 'pedido' : 'pedidos'}
                                </span>
                                {transitList.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {transitList.map((ord) => (
                                      <button
                                        key={ord.orderId}
                                        type="button"
                                        onClick={() => setDetailOrderId(ord.orderId)}
                                        className="px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 font-mono font-bold text-[10px] transition"
                                        title={`${ord.customerName} — ${ord.address}`}
                                      >
                                        #{ord.orderNumber}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Pedidos Entregues (com filtro de período) */}
                            <td className="p-4">
                              <div className="space-y-1.5">
                                <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${filteredDelivered.length > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-zinc-500'}`}>
                                  {filteredDelivered.length} {filteredDelivered.length === 1 ? 'entregue' : 'entregues'}
                                </span>
                                {filteredDelivered.length > 0 && (
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {filteredDelivered.slice(0, 8).map((ord) => (
                                      <button
                                        key={ord.orderId}
                                        type="button"
                                        onClick={() => setDetailOrderId(ord.orderId)}
                                        className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/50 font-mono font-bold text-[10px] transition"
                                        title={`${ord.customerName} — ${ord.address}`}
                                      >
                                        #{ord.orderNumber}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Rota & Ações */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                {hasRouteActive && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFocusedRouteDriverId(drv.driverId || drv.id);
                                      const el = document.getElementById('live-route-map-section');
                                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-md shadow-emerald-600/20 transition"
                                  >
                                    <MapPin className="w-3 h-3" />
                                    <span>Ver rota</span>
                                  </button>
                                )}

                                {isWaiting && !isRevoked && !isUnlinked && (
                                  <>
                                    <a
                                      href={getWhatsAppShareUrl(drv.inviteCode)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      <span>WhatsApp</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeInvite(drv.id)}
                                      className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-800/60 text-amber-300 text-[11px] font-bold transition"
                                    >
                                      Revogar
                                    </button>
                                  </>
                                )}

                                {!isWaiting && !isUnlinked && !isRevoked && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBlockDriver(drv.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                                      isBlocked
                                        ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300'
                                        : 'bg-zinc-800 hover:bg-red-950 hover:text-red-300 text-zinc-300'
                                    }`}
                                  >
                                    {isBlocked ? 'Ativar Ofertas' : 'Bloquear'}
                                  </button>
                                )}

                                {!isUnlinked && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDriverShift(drv.id)}
                                    className="px-2 py-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 text-[11px] font-semibold flex items-center gap-1 transition"
                                    title="Remover vínculo com a loja (preserva histórico)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Desvincular</span>
                                  </button>
                                )}
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

            {/* BLOCO 4: ZONA DE LIMPEZA OPERACIONAL (ZERAR DEMONSTRAÇÕES) */}
            <div className="p-6 bg-red-950/30 border border-red-800/50 rounded-2xl space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-base text-red-400 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Zona de Limpeza (Zerar Demonstrações e Pedidos de Teste)</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Exclui todos os pedidos, ofertas e histórico do banco para começar do zero em operação real. As contas de motoboys ativos são preservadas.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleWipeAllOrdersAndDemos}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition transform active:scale-95 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Zerar Todos os Pedidos do Painel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA: CADASTRAR MOTOBOY / PRIMEIRO ACESSO */}
        {activeTab === 'first_access' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <span>Cadastrar Motoboy & Primeiro Acesso ao Aplicativo</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Gere o código de autorização e primeiro acesso para vincular entregadores ao aplicativo NovaesWeb Entregador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('kanban')}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Voltar ao Kanban</span>
              </button>
            </div>

            {/* BLOCO 1: PRIMEIRO ACESSO COM CADASTRO GUIADO */}
            <FirstAccessInvitePanel getHeaders={getAdminHeaders} onChanged={() => {void fetchData(true);}} />

            {/* BLOCO 2: CÓDIGO DE PLANTÃO / VÍNCULO RÁPIDO NW-XXXXXX */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl space-y-4">
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  <span>Código de autorização / plantão para motoboy com conta</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Para quem já possui conta, gere um código de vínculo ou plantão (<code className="text-amber-400 font-bold">NW-XXXXXX</code>) e envie pelo WhatsApp. Para novo cadastro, utilize o bloco de primeiro acesso acima.
                </p>
              </div>

              <form onSubmit={handleGenerateShiftCode} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end max-w-xl">
                <div>
                  <label htmlFor="fa-new-driver-name" className="text-zinc-300 font-semibold block mb-1">Nome do entregador (opcional)</label>
                  <input id="fa-new-driver-name" value={newDriverName} onChange={event => setNewDriverName(event.target.value)} maxLength={100} placeholder="Ex: Lucas Motoboy" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="fa-new-driver-phone" className="text-zinc-300 font-semibold block mb-1">Telefone com DDD (opcional)</label>
                  <input id="fa-new-driver-phone" type="tel" value={newDriverPhone} onChange={event => setNewDriverPhone(event.target.value)} maxLength={20} placeholder="(51) 99999-9999" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">Validade do Código</label>
                  <select value={shiftValidity} onChange={(e) => setShiftValidity(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white font-semibold">
                    <option value="1">1 dia (24h)</option>
                    <option value="3">3 dias</option>
                    <option value="7">7 dias (Recomendado)</option>
                    <option value="30">30 dias</option>
                  </select>
                </div>
                <div>
                  <button type="submit" disabled={isGeneratingShiftCode} className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition">
                    <KeyRound className="w-4 h-4" />
                    <span>{isGeneratingShiftCode ? 'Gerando...' : 'Gerar Código de Autorização'}</span>
                  </button>
                </div>
              </form>

              {generatedShiftCode && (
                <div className="mt-4 p-4 rounded-2xl bg-zinc-950 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-amber-300">Código exclusivo gerado:</span>
                    <span className="text-2xl font-mono font-black text-amber-400 tracking-wider select-all">{generatedShiftCode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleCopyCode(generatedShiftCode)} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5" />
                      <span>{codeCopied ? 'Copiado!' : 'Copiar Código'}</span>
                    </button>
                    <a href={getWhatsAppShareUrl(generatedShiftCode)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* BLOCO 3: ENTREGADORES ATIVOS DA LOJA */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl space-y-4">
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <Bike className="w-4 h-4 text-cyan-400" />
                  <span>Entregadores Vinculados à Loja ({drivers.length})</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Motoboys conectados que recebem as ofertas de entrega da Bella Pizza.
                </p>
              </div>

              {drivers.length === 0 ? (
                <p className="text-zinc-500 text-xs py-4 text-center">Nenhum motoboy vinculado no momento. Gere um código acima para cadastrar.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {drivers.map(drv => (
                    <div key={drv.id} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-bold text-white text-xs">{drv.driverName || drv.name || 'Aguardando Cadastro'}</p>
                        <p className="text-[10px] text-zinc-400">{drv.phone || 'Sem telefone'}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          drv.presence === 'disponivel' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {drv.presence === 'disponivel' ? '● Online (Disponível)' : '○ Indisponível'}
                        </span>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="text-[11px] font-mono text-amber-400 bg-zinc-900 px-2 py-1 rounded border border-amber-500/20 block">
                          {drv.inviteCode || 'Ativo'}
                        </span>
                        <span className="text-[10px] text-zinc-500 block">
                          {drv.activeDeliveries || 0} entregas ativas
                        </span>
                      </div>
                    </div>
                  ))}
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

        {/* ABA 5: CONFIGURAÇÕES — ENTREGADORES E DESPACHO */}
        {activeTab === 'settings' && (
          <div className="space-y-8 text-xs max-w-5xl">
            <CustomerTrackingSettings getHeaders={getAdminHeaders} />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Configurações • Entregadores e Despacho</h2>
                <p className="text-xs text-zinc-400">
                  Cadastre ou convide entregadores, gere códigos de vínculo, defina o modo de distribuição e gerencie os vínculos com a loja (mesmo sem pedidos cadastrados).
                </p>
              </div>
            </div>

            {/* BLOCO 0: ENDEREÇO DA LOJA */}
            <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-500" />
                  <span>Endereço e Localização da Loja</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Ponto de retirada usado no mapa e nas rotas. Padrão: Centro de Canoas - RS.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="text-zinc-300 font-semibold block mb-1">Endereço</label>
                  <input
                    type="text"
                    value={storeSettings.storeAddress || ''}
                    onChange={(e) => { settingsDirtyRef.current = true; setStoreSettings(prev => ({ ...prev, storeAddress: e.target.value })); }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">Cidade</label>
                  <input
                    type="text"
                    value={storeSettings.storeCity || ''}
                    onChange={(e) => { settingsDirtyRef.current = true; setStoreSettings(prev => ({ ...prev, storeCity: e.target.value })); }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={storeSettings.storeState || ''}
                    onChange={(e) => { settingsDirtyRef.current = true; setStoreSettings(prev => ({ ...prev, storeState: e.target.value.toUpperCase() })); }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white uppercase"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveLogisticsSettings()}
                  disabled={isSavingSettings}
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingSettings ? 'Salvando...' : 'Salvar Endereço da Loja'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    settingsDirtyRef.current = true;
                    setStoreSettings(prev => ({ ...prev, storeAddress: 'Rua Quinze de Janeiro, 150 - Centro, Canoas / RS', storeCity: 'Canoas', storeState: 'RS' }));
                  }}
                  className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
                >
                  Usar Centro de Canoas
                </button>
                {settingsSavedMsg && <span className="text-emerald-400 font-bold">{settingsSavedMsg}</span>}
              </div>
            </div>

            {/* BLOCO 1: MODOS DE DISTRIBUIÇÃO E CAPACIDADE */}
            <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <Bike className="w-4 h-4 text-amber-400" />
                    <span>Modos de Distribuição e Despacho</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Define quem recebe a oferta quando você clicar em <strong>"Despachar"</strong> em pedidos prontos. Pedidos recém-recebidos ou em preparo nunca são despachados automaticamente.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Modo A: Entregador Fixo */}
                <div
                  onClick={() => updateAndSaveSettings({ distributionMode: 'fixed_driver' })}
                  className={`p-4 rounded-2xl border cursor-pointer transition space-y-2 ${
                    storeSettings.distributionMode === 'fixed_driver'
                      ? 'bg-red-950/30 border-red-500 shadow-lg shadow-red-600/10'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-white">A. Entregador Fixo</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      storeSettings.distributionMode === 'fixed_driver' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {storeSettings.distributionMode === 'fixed_driver' ? 'Ativo ✓' : 'Selecionar'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Seleciona previamente o entregador responsável. Ao despachar, envia direto para ele sem exigir nova seleção a cada pedido. Se estiver bloqueado, expirado ou sem capacidade, o sistema avisa antes e permite escolher outro.
                  </p>

                  {storeSettings.distributionMode === 'fixed_driver' && (
                    <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                      <label className="text-[11px] font-bold text-amber-300 block mb-1">
                        Entregador Fixo Responsável:
                      </label>
                      <select
                        value={storeSettings.fixedDriverId || ''}
                        onChange={(e) => updateAndSaveSettings({ distributionMode: 'fixed_driver', fixedDriverId: e.target.value || null })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-white font-semibold"
                      >
                        <option value="">-- Selecione um entregador vinculado --</option>
                        {drivers
                          .filter(d => d.status !== 'vinculo_removido' && d.status !== 'revogado')
                          .map((drv) => (
                            <option key={drv.id} value={drv.driverId || drv.id}>
                              {drv.driverName || drv.name || `Código ${drv.inviteCode || 'Primeiro acesso'}`} ({drv.status === 'ativo' ? 'Ativo' : drv.status}) — {drv.activeDeliveries || 0} entregas
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Modo B: Oferta para os entregadores habilitados */}
                <div
                  onClick={() => updateAndSaveSettings({ distributionMode: 'broadcast_enabled' })}
                  className={`p-4 rounded-2xl border cursor-pointer transition space-y-2 ${
                    storeSettings.distributionMode === 'broadcast_enabled'
                      ? 'bg-red-950/30 border-red-500 shadow-lg shadow-red-600/10'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-white">B. Oferta para os Entregadores Habilitados</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      storeSettings.distributionMode === 'broadcast_enabled' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {storeSettings.distributionMode === 'broadcast_enabled' ? 'Ativo ✓' : 'Selecionar'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Ao despachar um pedido ou conjunto, notifica todos os entregadores elegíveis vinculados à loja. O primeiro aceite validado pelo servidor fica com toda a oferta e retira imediatamente dos demais aplicativos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/80 items-end">
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Pedidos por entregador
                  </label>
                  <p className="text-sm text-zinc-400">Sem limite fixo. Selecione a quantidade desejada no despacho.</p>
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Regra de Preço Pizza Multissabor
                  </label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white font-semibold">
                    <option value="maior_valor">Maior Valor entre os sabores (Padrão)</option>
                    <option value="media">Média dos sabores</option>
                    <option value="soma_proporcional">Soma Proporcional das frações</option>
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => handleSaveLogisticsSettings()}
                    disabled={isSavingSettings}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingSettings ? 'Salvando...' : 'Salvar Modo de Distribuição'}</span>
                  </button>
                </div>
              </div>
            </div>

            <button type="button" onClick={() => setActiveTab('first_access')} className="px-4 py-3 rounded-xl bg-amber-500 text-zinc-950 text-sm font-bold">Cadastrar motoboy e gerenciar primeiro acesso</button>

            {/* BLOCO 2: GERAR CÓDIGO PARA MOTOBOY & AUTORIZAÇÃO DE CADASTRO */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl space-y-4">
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-red-500" />
                  <span>Código de plantão para entregador com conta</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Para quem já possui conta, gere um código de vínculo ou plantão (<code className="text-amber-400 font-bold">NW-XXXXXX</code>). Para cadastrar um novo entregador, utilize o bloco de primeiro acesso acima.
                </p>
              </div>

              <form onSubmit={handleGenerateShiftCode} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end max-w-xl">
                <div><label htmlFor="new-selected-driver-name" className="text-zinc-300 font-semibold block mb-1">Nome do entregador (opcional)</label><input id="new-selected-driver-name" value={newDriverName} onChange={event => setNewDriverName(event.target.value)} maxLength={100} placeholder="Ex: Lucas Motoboy" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white" /></div>
                <div><label htmlFor="new-selected-driver-phone" className="text-zinc-300 font-semibold block mb-1">Telefone com DDD (opcional)</label><input id="new-selected-driver-phone" type="tel" value={newDriverPhone} onChange={event => setNewDriverPhone(event.target.value)} maxLength={20} placeholder="(51) 99999-9999" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white" /></div>
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Validade do Código
                  </label>
                  <select
                    value={shiftValidity}
                    onChange={(e) => setShiftValidity(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white font-semibold"
                  >
                    <option value="1">1 dia (24h)</option>
                    <option value="3">3 dias</option>
                    <option value="7">7 dias (Recomendado)</option>
                    <option value="30">30 dias</option>
                  </select>
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={isGeneratingShiftCode}
                    className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{isGeneratingShiftCode ? 'Gerando...' : 'Gerar código de plantão'}</span>
                  </button>
                </div>
              </form>

              {generatedShiftCode && (
                <div className="mt-4 p-4 rounded-2xl bg-zinc-950 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-amber-300">Código exclusivo gerado:</span>
                    <span className="text-2xl font-mono font-black text-amber-400 tracking-wider select-all">
                      {generatedShiftCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(generatedShiftCode)}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{codeCopied ? 'Copiado!' : 'Copiar Código'}</span>
                    </button>
                    <a
                      href={getWhatsAppShareUrl(generatedShiftCode)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* BLOCO 3: LISTA DE ENTREGADORES E CÓDIGOS DE VÍNCULO DA LOJA */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-white">Entregadores Vinculados e Códigos de Convite</h3>
                  <p className="text-xs text-zinc-400">
                    Consulte a validade e situação dos códigos, revogue convites pendentes, ative/bloqueie o recebimento de ofertas ou remova o vínculo com a loja (preservando a conta e o histórico).
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3.5">Código</th>
                      <th className="p-3.5">Entregador</th>
                      <th className="p-3.5">Contato / Placa</th>
                      <th className="p-3.5">Validade</th>
                      <th className="p-3.5">Situação</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {drivers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-zinc-500">
                          Nenhum entregador ou código cadastrado nesta loja ainda.
                        </td>
                      </tr>
                    ) : (
                      drivers.map((drv) => {
                        const isWaiting = (!drv.driverName && !drv.name) || drv.status === 'aguardando_motoboy' || drv.status === 'aguardando_vinculo';
                        const isBlocked = drv.status === 'bloqueado';
                        const isRevoked = drv.status === 'revogado';
                        const isUnlinked = drv.status === 'vinculo_removido';
                        const isExpired = drv.isExpired || drv.status === 'expirado';

                        return (
                          <tr key={drv.id} className="hover:bg-zinc-800/30 transition">
                            <td className="p-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-amber-400 bg-zinc-950 px-2 py-0.5 rounded border border-amber-500/30">
                                  {drv.inviteCode || 'Primeiro acesso'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(drv.inviteCode)}
                                    disabled={!drv.inviteCode}
                                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3.5 font-bold text-white">
                              {drv.driverName || drv.name || <span className="text-zinc-500 font-normal italic">Aguardando ativação</span>}
                              {storeSettings.distributionMode === 'fixed_driver' && (storeSettings.fixedDriverId === drv.id || storeSettings.fixedDriverId === drv.driverId) && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-red-600/30 border border-red-500/50 text-red-300 text-[10px]">
                                  Fixo
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-zinc-400 font-mono text-[11px]">
                              {drv.phone || '—'} {drv.vehiclePlate ? `• ${drv.vehiclePlate}` : ''}
                            </td>
                            <td className="p-3.5 text-zinc-400 text-[11px]">
                              {drv.validityDays || drv.inviteExpiryDays || 1} dia(s)
                              {drv.expiresAt && (
                                <span className="block text-[10px] text-zinc-500">
                                  Até {new Date(drv.expiresAt).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </td>
                            <td className="p-3.5">
                              {isUnlinked ? (
                                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-bold text-[10px]">
                                  Vínculo Removido
                                </span>
                              ) : isRevoked ? (
                                <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800 font-bold text-[10px]">
                                  Convite Revogado
                                </span>
                              ) : isExpired ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 font-bold text-[10px]">
                                  Expirado
                                </span>
                              ) : isBlocked ? (
                                <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800 font-bold text-[10px]">
                                  Bloqueado p/ Ofertas
                                </span>
                              ) : isWaiting ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800 font-bold text-[10px]">
                                  Aguardando Vínculo
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[10px]">
                                  Ativo (Recebendo Ofertas)
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isWaiting && !isRevoked && !isUnlinked && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeInvite(drv.id)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 font-bold text-[11px]"
                                  >
                                    Revogar Convite
                                  </button>
                                )}

                                {!isWaiting && !isRevoked && !isUnlinked && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBlockDriver(drv.id)}
                                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                                      isBlocked
                                        ? 'bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200'
                                        : 'bg-zinc-800 hover:bg-red-950 text-zinc-300 hover:text-red-300'
                                    }`}
                                  >
                                    {isBlocked ? 'Ativar Ofertas' : 'Bloquear Ofertas'}
                                  </button>
                                )}

                                {!isUnlinked && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDriverShift(drv.id)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-300 font-bold text-[11px]"
                                  >
                                    Remover Vínculo
                                  </button>
                                )}
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

            {/* BLOCO 4: ZONA DE LIMPEZA OPERACIONAL (ZERAR DEMONSTRAÇÕES) */}
            <div className="p-6 bg-red-950/30 border border-red-800/50 rounded-2xl space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-base text-red-400 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Zona de Limpeza (Zerar Demonstrações e Pedidos de Teste)</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Exclui todos os pedidos, ofertas e histórico do banco para começar do zero em operação real. As contas de motoboys ativos são preservadas.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleWipeAllOrdersAndDemos}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition transform active:scale-95 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Zerar Todos os Pedidos do Painel</span>
                </button>
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

              {/* Alerta de Indisponibilidade do Entregador Fixo (Não troca silenciosamente) */}
              {dispatchWarningBanner && (
                <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-500/60 text-amber-200 space-y-1.5 shadow-lg">
                  <div className="flex items-center gap-2 font-extrabold text-amber-300 text-xs uppercase">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Atenção: Entregador Fixo Indisponível</span>
                  </div>
                  <p className="text-xs text-amber-100 leading-relaxed">
                    {dispatchWarningBanner}
                  </p>
                </div>
              )}
              
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

                {/* Opção de Oferta para todos os entregadores habilitados (Broadcast) */}
                <div
                  onClick={() => {
                    setDispatchModeChoice('broadcast_enabled');
                    setSelectedDriverId('__BROADCAST__');
                  }}
                  className={`p-3 rounded-2xl border transition text-xs cursor-pointer flex items-center justify-between ${
                    dispatchModeChoice === 'broadcast_enabled' || selectedDriverId === '__BROADCAST__'
                      ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-600/20'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <p className="font-extrabold text-amber-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>Oferta para todos os entregadores habilitados (Broadcast)</span>
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Notifica todos os entregadores elegíveis vinculados à loja; o primeiro a aceitar leva todo o lote.
                    </p>
                  </div>
                  {(dispatchModeChoice === 'broadcast_enabled' || selectedDriverId === '__BROADCAST__') && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500 text-black font-extrabold text-[10px] shrink-0">
                      Broadcast ✓
                    </span>
                  )}
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
                      const targetKey = drv.driverId || drv.id;
                      const isSelected = dispatchModeChoice === 'fixed_driver' && (selectedDriverId === drv.id || selectedDriverId === drv.driverId);
                      const isWaiting = (!drv.driverName && !drv.name) || drv.status === 'aguardando_motoboy' || drv.status === 'aguardando_vinculo';
                      const isBlocked = drv.status === 'bloqueado' || drv.status === 'revogado' || drv.status === 'vinculo_removido';
                      const isOnline = drv.presence === 'disponivel';

                      return (
                        <div
                          key={drv.id}
                          onClick={() => {
                            if (!isBlocked && !isWaiting) {
                              setDispatchModeChoice('fixed_driver');
                              setSelectedDriverId(targetKey);
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
                              <span className="font-bold text-zinc-200">
                                {drv.activeDeliveries || 0} corridas
                              </span>
                            </div>
                          </div>

                          <button type="button" onClick={(event) => {event.stopPropagation();handleLinkDriverAccount(drv);}} className="text-[11px] text-sky-300 underline">Associar conta cadastrada</button>
                          {isWaiting && (
                            <p className="text-[10px] text-amber-400/90 mt-1 font-semibold">
                              Código: {drv.inviteCode || 'Primeiro acesso'} (Aguardando vínculo)
                            </p>
                          )}
                          {isBlocked && (
                            <p className="text-[10px] text-red-400 mt-1 font-semibold">
                              🔴 Indisponível ({drv.status})
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
                  disabled={isSendingDispatch || selectedOrders.length === 0 || (dispatchModeChoice === 'fixed_driver' && !selectedDriverId)}
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
      {/* MODAL FULL-SCREEN: NOVO PEDIDO COM ALARME SONORO E FILA EMPILHADA */}
      {pendingNewOrders.length > 0 && (() => {
        const topOrder = pendingNewOrders[0];
        const topPhoneDigits = String(topOrder.phone || '').replace(/\D/g, '');
        const topAd = topOrder.addressDetail;
        const topFullAddress = topAd && (topAd.street || topAd.number)
          ? `${topAd.street || ''}, ${topAd.number || ''}${topAd.complement ? ' - ' + topAd.complement : ''}`
          : topOrder.address;
        const topItemLines = Array.isArray(topOrder.items) && topOrder.items.length > 0
          ? topOrder.items
          : null;
        const money = (n?: number | null) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

        const handleAcceptTopOrder = async (andPrint: boolean = false) => {
          if (andPrint) {
            printThermalOrder(topOrder, paperWidth);
          }
          // Remove do topo da fila
          setPendingNewOrders(prev => prev.filter(o => o.id !== topOrder.id));
          // Avanca status para 'preparando'
          await handleAdvanceStatus(topOrder.id, 'recebido');
        };

        const handleRejectTopOrder = async () => {
          setPendingNewOrders(prev => prev.filter(o => o.id !== topOrder.id));
          handleOpenCancelModal(topOrder);
        };

        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            {/* Header com Alarme Pulsante */}
            <div className="w-full max-w-xl text-center mb-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-600/30 border border-red-500 text-red-300 text-sm font-black animate-pulse mb-2">
                <Bell className="w-4 h-4 animate-bounce text-yellow-300" />
                <span>NOVO PEDIDO RECEBIDO!</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide">
                Pedido #{topOrder.orderNumber}
              </h2>
            </div>

            {/* Card Principal de Destaque */}
            <div className="w-full max-w-xl rounded-2xl bg-zinc-900 border-2 border-red-500 shadow-2xl shadow-red-600/40 overflow-hidden flex flex-col max-h-[75vh]">
              <div className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
                {/* Cliente & Telefone */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div>
                    <h3 className="text-base font-black text-white">{topOrder.customerName}</h3>
                    <p className="text-xs text-zinc-400">{topOrder.phone || 'Sem telefone'}</p>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
                    Aguardando Aceite
                  </span>
                </div>

                {/* Endereco */}
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-500" /> Endereço de Entrega
                  </h4>
                  <p className="font-bold text-zinc-100">{topFullAddress}</p>
                  <p className="text-xs text-zinc-400">Bairro: {topOrder.region}</p>
                  {topAd?.reference && <p className="text-xs text-zinc-400">Ref: {topAd.reference}</p>}
                </div>

                {/* Itens do Pedido */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-zinc-400" /> Itens
                  </h4>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                    {topItemLines ? (
                      topItemLines.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-start text-xs border-b border-zinc-900 pb-1.5 last:border-none last:pb-0">
                          <div>
                            <strong className="text-white">{it.quantity}x {it.name}{it.size ? ' (' + it.size + ')' : ''}</strong>
                            {it.flavors && it.flavors.length > 0 && <p className="text-[11px] text-zinc-400">Sabores: {it.flavors.join(' + ')}</p>}
                            {it.crust && <p className="text-[11px] text-zinc-400">Borda: {it.crust}</p>}
                          </div>
                          {typeof it.totalPrice === 'number' && <span className="font-bold text-zinc-200">{money(it.totalPrice)}</span>}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-200">{topOrder.itemsSummary}</p>
                    )}
                  </div>
                </div>

                {/* Observacoes do Cliente */}
                {topOrder.notes && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200">
                    <strong>OBS:</strong> {topOrder.notes}
                  </div>
                )}

                {/* Total & Pagamento */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-xs text-zinc-400 block">Forma de Pagamento:</span>
                    <strong className="text-white capitalize">
                      {topOrder.paymentMethod === 'pix_manual' ? 'Pix' : topOrder.paymentMethod === 'cash_delivery' ? 'Dinheiro' : 'Cartão'}
                    </strong>
                    {topOrder.changeFor ? <span className="text-xs text-zinc-400 block">Troco para {money(topOrder.changeFor)}</span> : null}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">Total do Pedido:</span>
                    <span className="text-xl font-black text-emerald-400">{money(topOrder.total)}</span>
                  </div>
                </div>
              </div>

              {/* Botoes de Acao de Alta Eficiencia */}
              <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => handleAcceptTopOrder(true)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Aceitar e Imprimir Comanda</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAcceptTopOrder(false)}
                  className="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Aceitar sem Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={handleRejectTopOrder}
                  className="py-3 px-3 rounded-xl bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-800 text-xs font-bold transition"
                  title="Recusar pedido"
                >
                  Recusar
                </button>
              </div>
            </div>

            {/* Barra Inferior com Fila de Outros Pedidos e Mudo */}
            <div className="w-full max-w-xl mt-3 flex items-center justify-between gap-2">
              {pendingNewOrders.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto text-xs text-amber-300 font-bold">
                  <span>+{pendingNewOrders.length - 1} na fila:</span>
                  {pendingNewOrders.slice(1).map(other => (
                    <button
                      key={other.id}
                      onClick={() => setPendingNewOrders(prev => [other, ...prev.filter(o => o.id !== other.id)])}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-bold border border-zinc-700 shrink-0"
                    >
                      #{other.orderNumber}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-zinc-500">Bella Pizza • Alerta de Pedidos</span>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMuted(true);
                  setTimeout(() => setIsMuted(false), 30000);
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                title="Pausar o som por 30 segundos"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{isMuted ? 'Mudo (30s)' : 'Pausar Som'}</span>
              </button>
            </div>
          </div>
        );
      })()}

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
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://wa.me/55${phoneDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900 transition"
                        >
                          WhatsApp
                        </a>
                        {detail.trackingToken && (
                          <a
                            href={`https://wa.me/55${phoneDigits}?text=${encodeURIComponent(
                              `🍕 *Bella Pizza:* Olá ${detail.customerName || 'Cliente'}! Acompanhe a entrega do seu pedido #${detail.orderNumber} em tempo real pelo mapa:\n${typeof window !== 'undefined' ? window.location.origin : ''}/pedido/${detail.trackingToken}`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-800 transition flex items-center gap-1"
                            title="Enviar mensagem com link de rastreamento GPS"
                          >
                            <MapPin className="w-2.5 h-2.5" />
                            <span>Enviar Rastreio</span>
                          </a>
                        )}
                      </div>
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

      {/* MODAL PERSONALIZADO DE CANCELAMENTO DE PEDIDO (SEM USAR PROMPT) */}
      {orderToCancel && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !isCancelingOrder && setOrderToCancel(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-red-500 font-black text-base">
                <XCircle className="w-5 h-5" />
                <span>Cancelar Pedido #{orderToCancel.orderNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => !isCancelingOrder && setOrderToCancel(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Cliente: <strong className="text-white">{orderToCancel.customerName}</strong>
              <br />
              Total: <strong className="text-amber-400">R$ {orderToCancel.total.toFixed(2).replace('.', ',')}</strong>
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase">
                Motivo / Justificativa do Cancelamento:
              </label>
              <textarea
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="Ex: Cliente desistiu, endereço incorreto, etc."
                rows={3}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none transition resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                disabled={isCancelingOrder}
                onClick={() => setOrderToCancel(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isCancelingOrder}
                onClick={handleConfirmCancelOrder}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-600/30"
              >
                <XCircle className="w-4 h-4" />
                <span>{isCancelingOrder ? 'Cancelando...' : 'Confirmar Cancelamento'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

