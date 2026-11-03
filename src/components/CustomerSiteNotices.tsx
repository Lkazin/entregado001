'use client';
import { useEffect, useState } from 'react';
import CustomerOrderNotice from './CustomerOrderNotice';
import { normalizeOrderStatus } from '@/lib/logistics/order-timeline';
import { isPickupOrder } from '@/lib/order-fulfillment';

/** Watches only the capability returned by this browser's own confirmed checkout. */
export default function CustomerSiteNotices({token:checkoutToken}:{token?:string}) {
  const [current,setCurrent]=useState<{token:string;status:string;fulfillmentType:'pickup'|'delivery'}|null>(null);
  useEffect(()=>{
    let token=checkoutToken||'';
    try{if(token)localStorage.setItem('nw:active-order',token);else token=localStorage.getItem('nw:active-order')||'';}catch{}
    setCurrent(null);
    if(!token)return;
    let disposed=false,ended=false,request:AbortController|null=null;
    async function load(){
      if(disposed||ended||request)return;const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),8000);
      try{const r=await fetch(`/api/orders?token=${encodeURIComponent(token)}`,{cache:'no-store',signal:controller.signal});const j=await r.json();if(disposed||controller.signal.aborted||!r.ok)return;
        const order=(j.orders||[j.order]).find((o:any)=>o?.trackingToken===token);if(!order)return;
        const status=normalizeOrderStatus(order.status);setCurrent({token,status,fulfillmentType:isPickupOrder(order)?'pickup':'delivery'});
        if(status==='concluido'||status==='cancelado'){ended=true;try{if(localStorage.getItem('nw:active-order')===token)localStorage.removeItem('nw:active-order');}catch{}}
      }catch{ /* Connection failures never invent a new order status. */ }
      finally{clearTimeout(timeout);if(request===controller)request=null;}
    }
    void load();const poll=setInterval(load,10000);const visible=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('online',load);document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;request?.abort();clearInterval(poll);window.removeEventListener('online',load);document.removeEventListener('visibilitychange',visible);};
  },[checkoutToken]);
  return current?<CustomerOrderNotice token={current.token} status={current.status} fulfillmentType={current.fulfillmentType} confirmed/>:null;
}
