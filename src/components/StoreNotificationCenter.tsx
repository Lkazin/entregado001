'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { StoreNotice } from '@/lib/site-notifications';

export default function StoreNotificationCenter({getHeaders,onOpenOrder}:{getHeaders:()=>Record<string,string>;onOpenOrder:(id:string)=>void}) {
  const [notices,setNotices]=useState<StoreNotice[]>([]),[open,setOpen]=useState(false),[toast,setToast]=useState<StoreNotice|null>(null);
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [limits,setLimits]=useState({preparing:25,pickup:10,transit:45});
  const configured=useRef(false),seen=useRef(new Set<string>()),reload=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let disposed=false,request:AbortController|null=null;
    async function load(){
      if(disposed||request)return; const controller=new AbortController();request=controller;
      const timeout=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch('/api/store-notifications',{headers:getHeaders(),cache:'no-store',signal:controller.signal});
        const data=await response.json();if(disposed||controller.signal.aborted)return;
        if(!response.ok||!data.success)throw new Error('Não foi possível atualizar os avisos.');
        setNotices(data.notifications);setError('');
        if(!configured.current){setLimits(data.limits);configured.current=true;}
        const key=`nw:store-notice-seen:${data.storeId}`;
        try{for(const id of JSON.parse(localStorage.getItem(key)||'[]'))if(typeof id==='string')seen.current.add(id);}catch{}
        const fresh=data.notifications.find((n:StoreNotice)=>!n.read&&!seen.current.has(n.id)&&Date.parse(data.serverNow)-Date.parse(n.at)<60000);
        if(fresh)setToast(fresh);
        for(const n of data.notifications)seen.current.add(n.id);
        try{localStorage.setItem(key,JSON.stringify([...seen.current].slice(-500)));}catch{}
      }catch{if(!disposed)setError('Avisos sem atualização. Tentando reconectar…');}
      finally{clearTimeout(timeout);if(request===controller)request=null;}
    }
    reload.current=()=>{void load();};void load();const timer=setInterval(load,5000);
    return()=>{disposed=true;clearInterval(timer);request?.abort();reload.current=()=>{};};
  },[getHeaders]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),8000);return()=>clearTimeout(timer);},[toast]);
  async function save(body:any){
    setSaving(true);setError('');
    try{const r=await fetch('/api/store-notifications',{method:'POST',headers:getHeaders(),body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error);reload.current();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setSaving(false);}
  }
  function openOrder(n:StoreNotice){onOpenOrder(n.orderId);setOpen(false);setToast(null);void save({action:'read',ids:[n.id]});}
  const unread=notices.filter(n=>!n.read).length;
  return <>
    <div className="relative">
      <button type="button" aria-label={`Central de avisos, ${unread} não lidos`} aria-expanded={open} onClick={()=>setOpen(!open)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"><Bell className="h-4 w-4"/>Avisos{unread>0&&<span className="rounded-full bg-red-600 px-2 text-xs">{unread}</span>}</button>
      {open&&<section aria-label="Central de avisos" className="fixed left-3 right-3 top-20 z-[65] max-h-[78vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-white shadow-xl sm:left-auto sm:w-[28rem]">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Central de avisos</h2><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar central" className="min-h-10 min-w-10"><X className="mx-auto h-4 w-4"/></button></div>
        <p className="text-xs text-zinc-400">Avisos silenciosos desta loja. Atualização automática.</p>
        <button type="button" disabled={saving||!unread} onClick={()=>void save({action:'read',all:true})} className="my-3 rounded-lg border border-zinc-700 px-3 py-2 text-xs disabled:opacity-50">Marcar todos como lidos</button>
        <ul className="space-y-2">{notices.map(n=><li key={n.id}><button type="button" onClick={()=>openOrder(n)} className={`w-full rounded-xl border p-3 text-left text-sm ${n.read?'border-zinc-800 text-zinc-400':'border-amber-800 bg-amber-950/20 text-white'}`}><span>{n.message}</span><span className="mt-1 block text-xs text-zinc-500">{new Date(n.at).toLocaleString('pt-BR')} · {n.read?'Lido':'Não lido'} · Ver pedido</span></button></li>)}</ul>
        {!notices.length&&<p className="py-5 text-sm text-zinc-400">Nenhum aviso neste momento.</p>}
        <form onSubmit={e=>{e.preventDefault();void save({action:'limits',limits});}} className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-bold">Alertas de demora</h3>
          {([['preparing','Preparo'],['pickup','Retirada'],['transit','Entrega']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 text-xs">{label} (minutos)<input type="number" min={1} max={240} required value={limits[key]} onChange={e=>setLimits({...limits,[key]:Number(e.target.value)})} className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-base"/></label>)}
          <button disabled={saving} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold disabled:opacity-50">Salvar limites</button>
        </form>
        {error&&<p role="status" className="mt-3 text-xs text-amber-300">{error}</p>}
      </section>}
    </div>
    {toast&&<aside role="status" aria-live="polite" className="fixed left-3 right-3 top-3 z-[75] rounded-2xl border border-emerald-700 bg-zinc-950 p-4 shadow-xl sm:left-auto sm:w-96"><div className="flex items-start justify-between gap-3"><button type="button" onClick={()=>openOrder(toast)} className="text-left text-sm font-semibold text-white">{toast.message}<span className="mt-1 block text-xs text-zinc-400">{new Date(toast.at).toLocaleTimeString('pt-BR')} · Ver pedido</span></button><button aria-label="Fechar aviso" type="button" onClick={()=>setToast(null)} className="min-h-8 min-w-8 text-white">×</button></div></aside>}
  </>;
}
