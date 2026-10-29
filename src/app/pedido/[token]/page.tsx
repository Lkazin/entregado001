'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Flame, Clock, CheckCircle2, ShieldCheck, MapPin, ArrowLeft, Phone, Bike, AlertCircle } from 'lucide-react';

export default function OrderTrackingPage() {
  const params = useParams();
  const token = params?.token as string;

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadOrder() {
      try {
        // 1. Tentar ler do localStorage do cliente
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('novaesweb_orders');
          if (cached) {
            const list = JSON.parse(cached);
            const found = list.find((o: any) => o.trackingToken === token || o.id === token || String(o.orderNumber) === token);
            if (found) {
              setOrder({
                orderNumber: found.orderNumber,
                status: found.status,
                customer: { name: found.customerName, phone: found.phone },
                address: { street: found.address, number: '', region: found.region },
                items: [{ name: found.itemsSummary || 'Pizza Artesanal Selecionada', details: 'Item do pedido', price: found.total, qty: 1 }],
                subtotal: found.total - 6,
                deliveryFee: 6.00,
                total: found.total,
                paymentMethod: found.paymentMethod === 'pix_manual' ? 'Pix Manual' : found.paymentMethod === 'card_terminal' ? 'Cartão na Entrega' : 'Dinheiro na Entrega',
                deliveryPin: found.deliveryPin || '****',
                estimatedMinutes: 30,
                createdAt: found.createdAt
              });
              setIsLoading(false);
            }
          }
        }

        // 2. Buscar da API de pedidos
        const res = await fetch('/api/orders');
        const data = await res.json();
        if (data.orders) {
          const found = data.orders.find((o: any) => o.trackingToken === token || o.id === token || String(o.orderNumber) === token);
          if (found) {
            setOrder({
              orderNumber: found.orderNumber,
              status: found.status,
              customer: { name: found.customerName, phone: found.phone },
              address: { street: found.address, number: '', region: found.region },
              items: [{ name: found.itemsSummary || 'Pizza Artesanal Selecionada', details: 'Item do pedido', price: found.total, qty: 1 }],
              subtotal: found.total - 6,
              deliveryFee: 6.00,
              total: found.total,
              paymentMethod: found.paymentMethod === 'pix_manual' ? 'Pix Manual' : found.paymentMethod === 'card_terminal' ? 'Cartão na Entrega' : 'Dinheiro na Entrega',
              deliveryPin: found.deliveryPin || '****',
              estimatedMinutes: 30,
              createdAt: found.createdAt
            });
          }
        }
      } catch (e) {
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      loadOrder();
      const interval = setInterval(loadOrder, 3000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const steps = [
    { key: 'recebido', label: 'Pedido Recebido', desc: 'Recebido pelo sistema' },
    { key: 'preparando', label: 'Na Cozinha', desc: 'No forno a lenha' },
    { key: 'pronto', label: 'Pronto / Despacho', desc: 'Aguardando motoboy' },
    { key: 'em_entrega', label: 'Em Rota', desc: 'A caminho da sua casa' },
    { key: 'concluido', label: 'Entregue', desc: 'Bom apetite!' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-xs">Carregando dados do pedido...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold">Pedido Não Encontrado</h1>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
          Não localizamos o pedido correspondente ao link informado.
        </p>
        <Link
          href="/"
          className="mt-4 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition"
        >
          Voltar ao Cardápio
        </Link>
      </div>
    );
  }

  const currentStepIdx = steps.findIndex(s => s.key === order.status);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      
      {/* Header Simples */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 py-4 px-6 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white">
              <Flame className="w-5 h-5 text-amber-300" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">
              BELLA <span className="text-red-500">PIZZA</span>
            </span>
          </Link>

          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Início</span>
          </Link>
        </div>
      </header>

      {/* Conteúdo Principal de Acompanhamento */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Banner do Status do Pedido */}
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Acompanhamento Seguro</span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span className="text-xs text-zinc-400">Criado às {order.createdAt}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Pedido #{order.orderNumber}
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Tempo estimado restante: <span className="text-amber-400 font-bold">~{order.estimatedMinutes} minutos</span>
              </p>
            </div>

            {/* Código PIN do Cliente */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center sm:text-right">
              <div className="flex items-center sm:justify-end gap-1.5 text-xs text-zinc-400 font-semibold mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Seu Código de Entrega (PIN)</span>
              </div>
              <div className="font-mono text-3xl font-black text-amber-400 tracking-widest bg-zinc-900/90 px-4 py-1.5 rounded-lg border border-zinc-800 inline-block">
                {order.deliveryPin}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 max-w-[220px]">
                Diga este código ao entregador apenas quando ele estiver na sua porta.
              </p>
            </div>
          </div>

          {/* Barra de Progresso Kanban */}
          <div className="mt-8 pt-6 border-t border-zinc-800/80">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {steps.map((st, idx) => {
                const isPassed = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <div
                    key={st.key}
                    className={`p-3 rounded-xl border transition ${
                      isCurrent
                        ? 'bg-red-950/40 border-red-600 ring-2 ring-red-600/30'
                        : isPassed
                        ? 'bg-zinc-900 border-emerald-800/40'
                        : 'bg-zinc-950/50 border-zinc-900 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isPassed ? (
                        <CheckCircle2 className={`w-4 h-4 ${isCurrent ? 'text-red-500' : 'text-emerald-500'}`} />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-zinc-700 text-[10px] flex items-center justify-center text-zinc-500">
                          {idx + 1}
                        </div>
                      )}
                      <span className={`text-xs font-bold ${isCurrent ? 'text-white' : isPassed ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400">{st.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Detalhes do Pedido & Endereço */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Itens Comprados */}
          <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
            <h3 className="font-bold text-white text-base">Itens do Pedido</h3>
            
            <div className="space-y-3">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="pb-3 border-b border-zinc-800/60 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-white">{item.qty}x {item.name}</span>
                      <p className="text-zinc-400 text-[11px] mt-0.5">{item.details}</p>
                    </div>
                    <span className="font-bold text-zinc-300">
                      R$ {item.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-800 text-xs space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span>R$ {order.subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de Entrega:</span>
                <span>R$ {order.deliveryFee.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-zinc-800">
                <span>Total:</span>
                <span className="text-red-500">R$ {order.total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </div>

          {/* Dados de Entrega e Suporte */}
          <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 text-xs">
            <h3 className="font-bold text-white text-base">Destino & Pagamento</h3>
            
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
              <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block">Endereço de Destino</span>
                <p className="text-zinc-400 mt-0.5">
                  {order.address.street} {order.address.number}
                </p>
                <p className="text-zinc-500 text-[11px]">{order.address.region} - São Paulo / SP</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="font-semibold text-zinc-400 block text-[11px]">Forma de Pagamento</span>
              <p className="font-bold text-white mt-0.5">{order.paymentMethod}</p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-400 block text-[11px]">Precisa de ajuda com o pedido?</span>
                <span className="text-xs text-zinc-300">Fale com a nossa equipe de atendimento</span>
              </div>
              <a
                href="https://wa.me/5511987654321"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
              >
                <Phone className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
