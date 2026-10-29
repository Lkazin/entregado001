'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Flame, Clock, CheckCircle2, ShieldCheck, MapPin, ArrowLeft, Phone, Bike, AlertCircle } from 'lucide-react';

export default function OrderTrackingPage() {
  const params = useParams();
  const token = params?.token as string;

  const [order, setOrder] = useState<any>({
    orderNumber: 1042,
    status: 'preparando', // recebido, preparando, pronto, em_entrega, concluido
    customer: { name: 'Cliente Fictício Teste', phone: '(11) 98765-4321' },
    address: {
      street: 'Rua das Pizzas',
      number: '100',
      region: 'Jardins / Cerqueira César',
      complement: 'Apto 42'
    },
    items: [
      {
        name: 'Pizza Grande (8 fatias)',
        details: '1/3 Calabresa Artesanal + 1/3 Quatro Queijos + 1/3 Frango c/ Catupiry • Borda Catupiry Original',
        price: 82.00,
        qty: 1
      },
      {
        name: 'Coca-Cola Original 2L',
        details: 'Garrafa PET 2 Litros bem gelada',
        price: 15.00,
        qty: 1
      }
    ],
    subtotal: 97.00,
    deliveryFee: 7.00,
    total: 104.00,
    paymentMethod: 'Pix Manual (Conferido)',
    deliveryPin: '7391',
    estimatedMinutes: 25,
    createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  });

  const steps = [
    { key: 'recebido', label: 'Pedido Recebido', desc: 'Recebido pelo sistema' },
    { key: 'preparando', label: 'Na Cozinha', desc: 'No forno a lenha' },
    { key: 'pronto', label: 'Pronto / Despacho', desc: 'Aguardando motoboy' },
    { key: 'em_entrega', label: 'Em Rota', desc: 'A caminho da sua casa' },
    { key: 'concluido', label: 'Entregue', desc: 'Bom apetite!' },
  ];

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
              <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-zinc-800">
                <span>Total Pago/A Pagar:</span>
                <span className="text-red-500">R$ {order.total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </div>

          {/* Endereço de Entrega e Pagamento */}
          <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
            <h3 className="font-bold text-white text-base">Dados de Entrega</h3>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <MapPin className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">Endereço de Destino</span>
                  <p className="text-zinc-400 mt-0.5">
                    {order.address.street}, {order.address.number} - {order.address.complement}
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

        </div>

      </main>

    </div>
  );
}
