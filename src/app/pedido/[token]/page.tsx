'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import CustomerDeliveryTracking from '@/components/CustomerDeliveryTracking';
import { useParams } from 'next/navigation';
import {
  Flame,
  Clock,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  ArrowLeft,
  Phone,
  Bike,
  AlertCircle,
  PackageCheck,
  ChefHat,
  Receipt,
  Sparkles
} from 'lucide-react';

/**
 * Normaliza os status existentes no ecossistema (entregado, painel-moto, supabase)
 * para os estados visuais padronizados da página de acompanhamento.
 */
function normalizeOrderStatus(rawStatus: unknown): 'recebido' | 'preparando' | 'pronto' | 'em_entrega' | 'concluido' | 'cancelado' {
  const s = String(rawStatus || '').toLowerCase().trim();
  if (['concluido', 'concluído', 'entregue', 'delivered', 'completed', 'finished'].includes(s)) return 'concluido';
  if (['cancelado', 'canceled', 'cancelled'].includes(s)) return 'cancelado';
  if (['em_entrega', 'in_transit', 'em_rota', 'picked_up'].includes(s)) return 'em_entrega';
  if (['pronto', 'despacho', 'retirada', 'waiting_pickup', 'ready', 'assigned', 'accepted'].includes(s)) return 'pronto';
  if (['preparando', 'em_preparo', 'preparing'].includes(s)) return 'preparando';
  return 'recebido';
}

function mapOrderData(found: any, prev: any, isServerConfirmed: boolean) {
  const normStatus = normalizeOrderStatus(found.status);
  const isFinished = normStatus === 'concluido';
  const deliveredAt = found.deliveredAt || prev?.deliveredAt || (isFinished && isServerConfirmed ? new Date().toISOString() : null);

  return {
    ...(prev || {}),
    orderNumber: String(found.orderNumber || '').replace('#', ''),
    status: normStatus,
    dispatchStatus: found.dispatchStatus || (isFinished ? 'entregue' : 'disponivel'),
    deliveredAt,
    pickedUpAt: found.pickedUpAt || prev?.pickedUpAt || null,
    driverName: found.driverName || found.assignedDriverName || prev?.driverName || null,
    isServerConfirmed,
    customer: {
      name: found.customerName || found.customer?.name || prev?.customer?.name || '',
      phone: found.phone || found.customer?.phone || prev?.customer?.phone || ''
    },
    address: {
      street: found.address?.street || found.address || prev?.address?.street || '',
      number: found.address?.number || prev?.address?.number || '',
      region: found.addressDetail?.neighborhood || found.region || found.address?.neighborhood || prev?.address?.region || 'Região Central',
      city: found.addressDetail?.city || found.city || found.address?.city || prev?.address?.city || 'Canoas',
      state: found.addressDetail?.state || found.state || found.address?.state || prev?.address?.state || 'RS',
      cep: found.addressDetail?.cep || found.cep || found.address?.cep || prev?.address?.cep || ''
    },
    items: Array.isArray(found.items) && found.items.length > 0
      ? found.items
      : prev?.items || [{ name: found.itemsSummary || 'Pizza Artesanal Selecionada', details: 'Item do pedido', price: found.total, qty: 1 }],
    subtotal: found.subtotal ?? prev?.subtotal ?? (found.total - 6),
    deliveryFee: found.deliveryFee ?? prev?.deliveryFee ?? 6.00,
    total: found.total ?? prev?.total,
    paymentMethod:
      found.paymentMethod === 'pix_manual'
        ? 'Pix Manual'
        : found.paymentMethod === 'card_terminal'
        ? 'Cartão na Entrega'
        : found.paymentMethod || prev?.paymentMethod || 'Dinheiro na Entrega',
    deliveryPin: found.deliveryPin || prev?.deliveryPin || '****',
    estimatedMinutes: found.estimatedMinutes || prev?.estimatedMinutes || 30,
    createdAt: found.createdAt || prev?.createdAt || 'Hoje'
  };
}

export default function OrderTrackingPage() {
  const params = useParams();
  const token = params?.token as string;

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState<number>(Date.now());

  const inFlightRequest = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const currentTokenRef = useRef(token);
  currentTokenRef.current = token;
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isServerCompletedRef = useRef(false);

  useEffect(() => {
    isServerCompletedRef.current = false;
    currentTokenRef.current = token;

    // 1. Carga provisória inicial do localStorage (apenas na montagem ou troca de token)
    if (typeof window !== 'undefined' && token) {
      try {
        const cached = localStorage.getItem('novaesweb_orders');
        if (cached) {
          const list = JSON.parse(cached);
          const found = Array.isArray(list) ? list.find(
            (o: any) =>
              o.trackingToken === token ||
              o.id === token ||
              String(o.orderNumber).replace('#', '') === token.replace('#', '')
          ) : null;
          if (found) {
            const provStatus = normalizeOrderStatus(found.status);
            // Conclusão confirmada exige o backend; cache provisório não assume entrega
            setOrder((prev: any) => {
              if (prev?.isServerConfirmed) return prev;
              return mapOrderData(
                { ...found, status: provStatus === 'concluido' ? 'em_entrega' : provStatus },
                prev,
                false
              );
            });
            setIsLoading(false);
          }
        }
      } catch {}
    }

    // 2. Consulta autoritativa ao servidor com serialização e proteção de race conditions
    async function loadOrder() {
      if (!token || isServerCompletedRef.current) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }

      // Serialização: cancela requisição anterior se ainda estiver em andamento
      inFlightRequest.current?.abort();
      const controller = new AbortController();
      inFlightRequest.current = controller;
      const thisSeq = ++requestSeq.current;
      const requestedToken = token;

      try {
        const res = await fetch(`/api/orders?token=${encodeURIComponent(requestedToken)}&t=${Date.now()}`, {
          signal: controller.signal,
          cache: 'no-store'
        });

        // Descarte de respostas atrasadas, canceladas ou de outro token
        if (controller.signal.aborted || thisSeq !== requestSeq.current || requestedToken !== currentTokenRef.current) {
          return;
        }

        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.orders) ? data.orders : data.order ? [data.order] : [];
          // Encontra estritamente pelo trackingToken deste pedido (ou id se admin)
          const found = list.find(
            (o: any) =>
              o.trackingToken === requestedToken ||
              o.id === requestedToken ||
              String(o.orderNumber).replace('#', '') === requestedToken.replace('#', '')
          );

          if (found && requestedToken === currentTokenRef.current && thisSeq === requestSeq.current) {
            const normStatus = normalizeOrderStatus(found.status);
            const isFinished = normStatus === 'concluido';
            const isCancelled = normStatus === 'cancelado';

            if (isFinished || isCancelled) {
              isServerCompletedRef.current = true;
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
            }

            setOrder((prev: any) => {
              // Prevenção contra regressão por resposta desordenada ou cache antigo
              if (prev?.isServerConfirmed && prev?.status === 'concluido' && normStatus !== 'concluido') {
                return prev;
              }
              return mapOrderData(found, prev, true);
            });
          }
        }

        // 3. Atualiza dados do motoboy se ainda estiver ativo (e não concluído/cancelado)
        if (!isServerCompletedRef.current) {
          try {
            const trackRes = await fetch(`/api/v1/logistics/tracking-client-subscribe?token=${encodeURIComponent(requestedToken)}&t=${Date.now()}`, {
              signal: controller.signal,
              cache: 'no-store'
            });
            if (trackRes.ok && thisSeq === requestSeq.current && requestedToken === currentTokenRef.current && !isServerCompletedRef.current) {
              const trackData = await trackRes.json();
              if (trackData.success && trackData.driver?.name) {
                setOrder((prev: any) => {
                  if (!prev || prev.status === 'concluido' || prev.status === 'cancelado') return prev;
                  return {
                    ...prev,
                    driverName: trackData.driver.name
                  };
                });
              }
            }
          } catch {}
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Erro ao atualizar status do pedido:', err);
        }
      } finally {
        if (inFlightRequest.current === controller) inFlightRequest.current = null;
        setIsLoading(false);
      }
    }

    if (token) {
      void loadOrder();
      const interval = setInterval(loadOrder, 3000);
      pollTimerRef.current = interval;
      return () => {
        clearInterval(interval);
        pollTimerRef.current = null;
        inFlightRequest.current?.abort();
      };
    }
  }, [token]);

  // Lista dos 5 passos do pedido para acompanhamento visual do cliente
  const steps = [
    {
      key: 'recebido',
      stepNumber: 1,
      title: 'Pedido Recebido',
      subtitle: 'Confirmado pela loja',
      description: 'Seu pedido foi registrado no sistema e enviado para a nossa cozinha.',
      icon: Receipt,
      activeColor: 'from-blue-600 to-cyan-500',
      badgeColor: 'bg-blue-950/80 border-blue-600/50 text-blue-400'
    },
    {
      key: 'preparando',
      stepNumber: 2,
      title: 'Em Preparo',
      subtitle: 'No forno a lenha',
      description: 'Nossos pizzaiolos estão preparando sua pizza com massa fresca e ingredientes selecionados.',
      icon: ChefHat,
      activeColor: 'from-amber-600 to-orange-500',
      badgeColor: 'bg-amber-950/80 border-amber-600/50 text-amber-400'
    },
    {
      key: 'pronto',
      stepNumber: 3,
      title: 'Pronto / Despacho',
      subtitle: 'Embalado e aquecido',
      description: 'Pedido finalizado na embalagem térmica, pronto para saída com nosso entregador.',
      icon: PackageCheck,
      activeColor: 'from-purple-600 to-indigo-500',
      badgeColor: 'bg-purple-950/80 border-purple-600/50 text-purple-400'
    },
    {
      key: 'em_entrega',
      stepNumber: 4,
      title: 'Saiu para Entrega',
      subtitle: 'A caminho da sua casa',
      description: 'O entregador parceiro já retirou seu pedido na loja e está se deslocando até o seu endereço.',
      icon: Bike,
      activeColor: 'from-orange-600 to-amber-500',
      badgeColor: 'bg-orange-950/80 border-orange-600/50 text-orange-400'
    },
    {
      key: 'concluido',
      stepNumber: 5,
      title: 'Pedido Entregue',
      subtitle: 'Bom apetite!',
      description: 'Entrega finalizada com sucesso. Esperamos que aproveite cada pedaço!',
      icon: CheckCircle2,
      activeColor: 'from-emerald-600 to-teal-500',
      badgeColor: 'bg-emerald-950/80 border-emerald-600/50 text-emerald-400'
    }
  ];

  const isDelivered = order?.status === 'concluido' && order?.isServerConfirmed;
  const isCanceled = order?.status === 'cancelado';
  const deliveredAtMs = order?.deliveredAt ? Date.parse(order.deliveredAt) : null;
  const elapsedSinceDelivered = isDelivered && deliveredAtMs && Number.isFinite(deliveredAtMs)
    ? Math.max(0, now - deliveredAtMs)
    : 0;

  // Substituição da área de acompanhamento após ~10s de entrega confirmada
  const showFinalThankYou = isDelivered && elapsedSinceDelivered >= 10000;

  // Atualiza o relógio interno suavemente enquanto aguarda os 10s da entrega
  useEffect(() => {
    if (!isDelivered || showFinalThankYou) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, [isDelivered, showFinalThankYou]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-pizza-gold border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-medium">Carregando acompanhamento do pedido...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
          <AlertCircle className="w-8 h-8 text-pizza-gold" />
        </div>
        <h1 className="text-xl font-bold text-white">Pedido Não Encontrado</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-sm">
          Não conseguimos localizar as informações deste pedido. Verifique o link ou entre em contato com a pizzaria.
        </p>
        <Link
          href="/"
          className="mt-6 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 text-white text-xs font-bold transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Cardápio</span>
        </Link>
      </div>
    );
  }

  const currentIdx = steps.findIndex((s) => s.key === order.status);
  const activeStepIdx = currentIdx >= 0 ? currentIdx : 0;
  const currentStep = steps[activeStepIdx];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/70 py-4 px-6 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-700 to-red-500 flex items-center justify-center text-white shadow-lg shadow-red-900/30">
              <Flame className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-white block leading-none">
                BELLA <span className="text-pizza-gold">PIZZA</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">Acompanhamento do Pedido</span>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition border border-zinc-700/40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cardápio</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* 1. SE CANCELADO: Exibe banner específico sem agradecimento de entrega */}
        {isCanceled ? (
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-red-800/60 shadow-2xl relative overflow-hidden">
            <div className="flex items-center gap-4 text-amber-400">
              <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-red-700/60 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">Pedido Cancelado</h1>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Este pedido foi cancelado pelo lojista. Dúvidas? Fale conosco pelo WhatsApp.
                </p>
              </div>
            </div>
          </div>
        ) : showFinalThankYou ? (
          /* 2. APÓS ~10s DE ENTREGA CONFIRMADA: Substitui área de acompanhamento pela Mensagem Final */
          <section className="p-8 sm:p-12 rounded-3xl bg-zinc-900/90 border border-emerald-800/40 shadow-2xl text-center space-y-6" aria-label="Agradecimento da entrega">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500/60 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-950/50">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h1 className="text-2xl sm:text-3xl font-black text-white">Pedido entregue!</h1>
              <p className="text-base text-zinc-300 font-medium">
                Agradecemos pela sua compra e pela preferência.
              </p>
              {order.deliveredAt && (
                <p className="text-xs text-zinc-500 font-medium">
                  Entregue às {new Date(order.deliveredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 text-white text-sm font-bold transition shadow-lg shadow-amber-950/30"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar ao cardápio</span>
              </Link>
            </div>
          </section>
        ) : (
          /* 3. FLUXO ATIVO OU TRANSIÇÃO IMEDIATA (0 a 10s): Exibe progresso e etapas */
          <>
            {/* Banner do Status Principal */}
            <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800/80 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

              <div className="space-y-6">
                {/* Cabeçalho do Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-bold text-pizza-gold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Status em Tempo Real
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                      <span className="text-xs text-zinc-400">Criado às {order.createdAt}</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Pedido #{order.orderNumber}
                    </h1>
                  </div>

                  {/* Código PIN do Cliente */}
                  <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800/80 text-left sm:text-right shadow-inner">
                    <div className="flex items-center sm:justify-end gap-1.5 text-xs text-zinc-400 font-semibold mb-1">
                      <ShieldCheck className={`w-4 h-4 ${isDelivered ? 'text-emerald-400' : 'text-emerald-400'}`} />
                      <span>{isDelivered ? 'Código de Entrega Validado' : 'Seu Código de Entrega (PIN)'}</span>
                    </div>
                    <div className={`font-mono text-3xl font-black tracking-widest bg-zinc-900 px-4 py-1.5 rounded-xl border border-zinc-800 inline-block shadow-sm ${isDelivered ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {order.deliveryPin}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-[240px]">
                      {isDelivered ? 'Entrega validada com sucesso pelo entregador.' : 'Informe este código ao motoboy apenas na entrega.'}
                    </p>
                  </div>
                </div>

                {/* Status Atual em Destaque */}
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${currentStep.badgeColor} shadow-lg`}>
                      <currentStep.icon className={`w-6 h-6 ${isDelivered ? 'text-emerald-400' : 'animate-pulse'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg font-black text-white">
                          {currentStep.title}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${currentStep.badgeColor}`}>
                          {isDelivered ? '✓ Concluído' : `Passo ${currentStep.stepNumber} de 5`}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 max-w-lg leading-relaxed">
                        {currentStep.description}
                      </p>
                    </div>
                  </div>

                  {/* Tempo Estimado e Entregador (Sem previsão após entrega confirmada) */}
                  <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                    {!isDelivered && order.status !== 'em_entrega' && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>Previsão: <strong className="text-white">~{order.estimatedMinutes} min</strong></span>
                      </div>
                    )}

                    {order.driverName && (order.status === 'em_entrega' || order.status === 'pronto' || isDelivered) && (
                      <div className="flex items-center gap-2 text-xs font-bold text-orange-300 bg-orange-950/60 border border-orange-800/50 px-3 py-1.5 rounded-xl">
                        <Bike className="w-4 h-4 text-orange-400" />
                        <span>Entregador: <strong className="text-white">{order.driverName}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mapa de Rastreio (Encerra imediatamente na entrega confirmada) */}
            {!isDelivered ? (
              <CustomerDeliveryTracking key={token} token={token} />
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-emerald-900/30 text-center flex items-center justify-center gap-2.5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Rastreamento em tempo real encerrado. Pedido entregue ao destinatário!</span>
              </div>
            )}

            {/* Linha do Tempo Passo a Passo */}
            <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800/80 shadow-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-pizza-gold/40 flex items-center justify-center text-pizza-gold">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">Etapas da sua Entrega</h2>
                    <p className="text-xs text-zinc-400">Acompanhe cada etapa do seu pedido em tempo real</p>
                  </div>
                </div>
              </div>

              {/* Grid dos 5 Passos */}
              <div className="space-y-4">
                {steps.map((st, idx) => {
                  const isPassed = idx < activeStepIdx;
                  const isCurrent = idx === activeStepIdx;
                  const isFuture = idx > activeStepIdx;
                  const IconComponent = st.icon;

                  return (
                    <div
                      key={st.key}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
                        isCurrent
                          ? 'bg-zinc-950 border-pizza-gold/60 ring-2 ring-red-500/20 shadow-lg'
                          : isPassed
                          ? 'bg-zinc-950/60 border-emerald-900/40 opacity-90'
                          : 'bg-zinc-950/30 border-zinc-900 opacity-40'
                      }`}
                    >
                      {/* Indicador do Passo com Ícone */}
                      <div className="relative shrink-0">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm border transition ${
                            isCurrent
                              ? isDelivered
                                ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-400'
                                : 'bg-gradient-to-tr from-red-600 to-amber-500 border-red-400 text-white shadow-lg shadow-red-950'
                              : isPassed
                              ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-400'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                          }`}
                        >
                          {isPassed || (isDelivered && isCurrent) ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <IconComponent className="w-5 h-5" />
                          )}
                        </div>
                      </div>

                      {/* Textos da Etapa */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black ${isCurrent ? 'text-white' : isPassed ? 'text-zinc-200' : 'text-zinc-500'}`}>
                              {st.stepNumber}. {st.title}
                            </span>
                            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">•</span>
                            <span className={`text-xs ${isCurrent ? (isDelivered ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold') : 'text-zinc-400'}`}>
                              {st.subtitle}
                            </span>
                          </div>

                          {/* Tag de Estado: Retira 'Em Andamento' na etapa concluído */}
                          <div>
                            {isCurrent && (
                              isDelivered ? (
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold">
                                  ✓ Concluído
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full bg-pizza-card/90 border border-pizza-gold/60 text-pizza-gold text-[10px] font-black uppercase tracking-wider animate-pulse">
                                  ● Em Andamento
                                </span>
                              )
                            )}
                            {isPassed && (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold">
                                ✓ Concluído
                              </span>
                            )}
                            {isFuture && (
                              <span className="px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-600 text-[10px] font-semibold">
                                Aguardando
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          {st.description}
                        </p>

                        {/* Informações Extras por Etapa */}
                        {st.key === 'em_entrega' && isCurrent && !isDelivered && order.driverName && (
                          <div className="mt-3 p-3 rounded-xl bg-orange-950/40 border border-orange-800/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-orange-300">
                              <Bike className="w-4 h-4 text-orange-400 shrink-0" />
                              <span>Entregador a caminho: <strong>{order.driverName}</strong></span>
                            </div>
                            <span className="text-zinc-400 text-[11px]">Tenha o código PIN em mãos</span>
                          </div>
                        )}

                        {/* Agradecimento na etapa concluída (visível logo após entrega) */}
                        {st.key === 'concluido' && (isPassed || isDelivered) && (
                          <div className="mt-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/30 text-xs text-emerald-400 font-medium flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Pedido entregue com sucesso. Obrigado pela preferência!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Detalhes do Pedido e Endereço de Entrega (Permanecem visíveis para conferência) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Card dos Itens Comprados */}
          <div className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl space-y-4">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-pizza-gold" />
              <span>Itens do Pedido</span>
            </h3>

            <div className="space-y-3">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="pb-3 border-b border-zinc-800/60 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-white text-sm">{item.qty}x {item.name}</span>
                      <p className="text-zinc-400 text-xs mt-0.5">{item.details}</p>
                    </div>
                    <span className="font-bold text-zinc-300 text-sm">
                      R$ {Number(item.price || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-800 text-xs space-y-2">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span>R$ {Number(order.subtotal || 0).toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de Entrega:</span>
                <span>R$ {Number(order.deliveryFee || 0).toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                <span>Total:</span>
                <span className="text-pizza-gold">R$ {Number(order.total || 0).toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </div>

          {/* Card de Destino e Suporte */}
          <div className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl space-y-4 text-xs">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-pizza-gold" />
              <span>Destino & Pagamento</span>
            </h3>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-start gap-3">
              <MapPin className="w-4 h-4 text-pizza-gold flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block text-sm">Endereço de Entrega</span>
                <p className="text-zinc-300 mt-0.5 font-medium">
                  {order.address.street} {order.address.number}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {order.address.region} - {order.address.city || 'Canoas'} / {order.address.state || 'RS'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80">
              <span className="font-semibold text-zinc-400 block text-xs">Forma de Pagamento</span>
              <p className="font-bold text-white text-sm mt-0.5">{order.paymentMethod}</p>
            </div>

            {/* Suporte WhatsApp */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-white block text-xs">Precisa de ajuda com o seu pedido?</span>
                <span className="text-xs text-zinc-400">Nossa equipe está pronta para atendê-lo</span>
              </div>
              <a
                href="https://wa.me/5551981964238?text=Ol%C3%A1%2C%20gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20o%20meu%20pedido"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-950/40 shrink-0"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>WhatsApp da Loja</span>
              </a>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
