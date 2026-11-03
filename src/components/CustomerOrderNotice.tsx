'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isPickupOrder } from '@/lib/order-fulfillment';

export default function CustomerOrderNotice({token,status,confirmed,fulfillmentType}:{token:string;status:string;confirmed:boolean;fulfillmentType?:string}) {
  const [visible,setVisible] = useState(false);
  const currentNotice = useRef('');
  const pickup = isPickupOrder({fulfillmentType});
  const event = pickup && status === 'pronto' ? 'pickup-ready' : !pickup && status === 'em_entrega' ? 'on-route' : ['recebido','preparando','pronto'].includes(status) ? 'received' : null;
  useEffect(()=>{
    setVisible(false);
    if (!confirmed || !token || !event) return;
    const key = `nw:order-notice:${token}:${event}`;
    try { if(localStorage.getItem(key) && currentNotice.current!==key) return; localStorage.setItem(key,'seen'); } catch { /* Page state still bounds the notice lifetime. */ }
    currentNotice.current=key;
    setVisible(true);
    const timer=setTimeout(()=>setVisible(false),8000);
    return()=>clearTimeout(timer);
  },[confirmed,token,event]);
  if (!visible || !event) return null;
  return <aside role="status" aria-live="polite" className="fixed top-3 left-3 right-3 sm:left-auto sm:w-96 z-[80] rounded-2xl border border-emerald-700 bg-zinc-950 p-4 shadow-xl text-white">
    <div className="flex items-start justify-between gap-3"><strong className="text-sm">{event==='received'?'A loja recebeu seu pedido!':event==='pickup-ready'?'Seu pedido está pronto para retirar!':'Seu pedido está a caminho!'}</strong><button type="button" aria-label="Fechar aviso" onClick={()=>setVisible(false)} className="min-h-8 min-w-8 rounded-lg border border-zinc-700">×</button></div>
    {event==='pickup-ready' && <p className="mt-2 text-sm text-zinc-300">Retire no balcão da loja e apresente o número do seu pedido para a conferência.</p>}
    {event==='on-route' && <><p className="mt-2 text-sm text-zinc-300">Acompanhe pelo mapa seu entregador chegando. Esteja no local combinado para receber seu pedido.</p><Link href={`/pedido/${encodeURIComponent(token)}`} className="mt-3 inline-block text-sm font-bold text-emerald-300 underline">Acompanhar entrega</Link></>}
  </aside>;
}
