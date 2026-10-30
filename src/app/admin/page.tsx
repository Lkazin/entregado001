'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Flame, LayoutDashboard, ShoppingCart, UtensilsCrossed, Bike, Settings, 
  CheckCircle2, Clock, AlertTriangle, ArrowRight, Printer, XCircle, Search, 
  UserPlus, ShieldAlert, KeyRound, Check, RefreshCw, Send, Lock, PlusCircle,
  Copy, MessageSquare, Trash2
} from 'lucide-react';
import { PIZZA_FLAVORS } from '@/lib/constants';

import AdminPinAuth from '@/components/AdminPinAuth';

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
  paymentMethod: 'pix_manual' | 'cash_delivery' | 'card_terminal';
  paymentStatus: 'aguardando_conferencia' | 'confirmado_manual' | 'recebido_entrega';
  deliveryPin: string;
  driverName?: string | null;
  createdAt: string;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'kanban' | 'menu' | 'logistics' | 'settings'>('kanban');

  // Estado REAL sem dados fakes (carregados da API e do banco)
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Estados de Despacho
  const [selectedOrderToDispatch, setSelectedOrderToDispatch] = useState<AdminOrder | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [deliveryFeeOffered, setDeliveryFeeOffered] = useState<string>('12,00');
  const [dispatchAlert, setDispatchAlert] = useState<string | null>(null);

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

          // Atualizar com pedidos que vieram do servidor
          incoming.forEach(o => {
            const existing = mergedMap.get(o.id);
            if (existing) {
              // Se o estado local já está mais avançado, preserva o local
              const sequence: AdminOrder['status'][] = ['recebido', 'preparando', 'pronto', 'em_entrega', 'concluido', 'cancelado'];
              const localIdx = sequence.indexOf(existing.status);
              const serverIdx = sequence.indexOf(o.status);
              if (localIdx > serverIdx) {
                mergedMap.set(o.id, { ...o, status: existing.status });
              } else {
                mergedMap.set(o.id, o);
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

      // 2. Buscar Entregadores Reais e Status de Presença
      let loadedDrivers: any[] = [];
      try {
        const resDrivers = await fetch('/api/v1/logistics/drivers');
        if (resDrivers.ok) {
          const dataDrivers = await resDrivers.json();
          if (dataDrivers.success && Array.isArray(dataDrivers.drivers)) {
            loadedDrivers = dataDrivers.drivers.filter((d: any) => !d.name?.includes('Rodrigo Silva'));
          }
        }
      } catch (e) {}

      // Fallback gracioso ao Supabase Storage caso a API local esteja indisponível
      if (loadedDrivers.length === 0) {
        try {
          const cloudRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            if (Array.isArray(cloudData.drivers)) {
              loadedDrivers = cloudData.drivers.filter((d: any) => !d.name?.includes('Rodrigo Silva'));
            }
          }
        } catch (ce) {}
      }

      if (loadedDrivers.length > 0) {
        setDrivers(loadedDrivers);
        if (!selectedDriverId) {
          setSelectedDriverId(loadedDrivers[0].id);
        }
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

  // Cancelar com Justificativa Conectado à API
  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt('Informe a justificativa do cancelamento:');
    if (reason && reason.trim()) {
      setOrders(prev => {
        const updated = prev.map(o => o.id === orderId ? { ...o, status: 'cancelado' as const } : o);
        if (typeof window !== 'undefined') {
          localStorage.setItem('novaesweb_orders', JSON.stringify(updated));
        }
        return updated;
      });

      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status: 'cancelado' })
        });
      } catch (err) {}
      setTimeout(() => fetchData(true), 600);
    }
  };

  // Disparar Oferta de Despacho Conectado à API
  const handleSendDispatchOffer = async () => {
    if (!selectedOrderToDispatch) return;
    const driver = drivers.find(d => d.id === selectedDriverId);
    if (!driver) return;

    if (!driver.driverName) {
      alert('Aguarde o motoboy conectar seu aplicativo através do código de plantão antes de despachar.');
      return;
    }

    if (driver.presence !== 'disponivel') {
      alert(`O entregador ${driver.driverName || driver.name} está offline no aplicativo. Oferta não despachada.`);
      return;
    }

    if (driver.activeDeliveries >= driver.maxDeliveries) {
      alert(`O entregador ${driver.driverName || driver.name} atingiu a capacidade máxima de ${driver.maxDeliveries} entregas simultâneas!`);
      return;
    }

    const feeNum = parseFloat(deliveryFeeOffered.replace(',', '.')) || 12.00;

    // 1. Tenta API local
    try {
      await fetch('/api/v1/logistics/offer-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderToDispatch.id,
          orderNumber: selectedOrderToDispatch.orderNumber,
          customerAddress: selectedOrderToDispatch.address,
          driverId: driver.driverId || driver.id,
          feeOffered: feeNum
        })
      });
    } catch {}

    // 2. Sincroniza oferta garantida no Supabase Storage (Nuvem)
    try {
      const getRes = await fetch(`${SUPABASE_STORAGE_URL}?t=${Date.now()}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      let state: { drivers: any[]; offers: any[]; assignments: any[] } = { drivers: [], offers: [], assignments: [] };
      if (getRes.ok) {
        state = await getRes.json();
      }

      const offerUniqueId = `off_${Date.now()}`;
      state.offers.unshift({
        id: offerUniqueId,
        offerId: offerUniqueId,
        orderId: selectedOrderToDispatch.id,
        orderNumber: String(selectedOrderToDispatch.orderNumber),
        customerAddress: selectedOrderToDispatch.address,
        deliveryAddress: selectedOrderToDispatch.address,
        customerNeighborhood: selectedOrderToDispatch.region || 'Bairro Próximo',
        customerCity: 'São Paulo',
        customerName: selectedOrderToDispatch.customerName || 'Cliente',
        customerPhone: selectedOrderToDispatch.phone || '',
        itemsSummary: selectedOrderToDispatch.itemsSummary || '1x Pedido Delivery',
        targetDriverId: driver.driverId || driver.id,
        driverId: driver.driverId || driver.id,
        feeOffered: feeNum,
        deliveryFee: feeNum,
        estimatedDistanceKm: 2.8,
        totalOrdersGrouped: 1,
        status: 'pendente',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      } as any);

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
      console.warn('Oferta gravada localmente, sincronização em nuvem falhou:', err);
    }

    await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: selectedOrderToDispatch.id,
        status: 'em_entrega',
        driverName: driver.driverName || driver.name
      })
    });

    setDispatchAlert(`Oferta enviada em tempo real para ${driver.driverName || driver.name}! Pedido movido para "Em Entrega".`);
    setSelectedOrderToDispatch(null);
    fetchData(true);
    setTimeout(() => setDispatchAlert(null), 5000);
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
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      
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
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        
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
                  <div key={col.key} className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-4 flex flex-col h-[700px]">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                      <span className={`text-xs font-black uppercase tracking-wider ${col.color}`}>
                        {col.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-bold">
                        {colOrders.length}
                      </span>
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
                            className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition shadow-md space-y-2 text-xs"
                          >
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

                            {/* Ações Operacionais */}
                            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1">
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                className="text-zinc-500 hover:text-red-400 p-1 text-[10px]"
                                title="Cancelar Pedido"
                              >
                                Cancelar
                              </button>

                              {col.key === 'pronto' ? (
                                <button
                                  onClick={() => {
                                    setSelectedOrderToDispatch(order);
                                    setActiveTab('logistics');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-md"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Despachar</span>
                                </button>
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

      </main>

    </div>
  );
}
