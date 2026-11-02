'use client';
import { useCallback, useEffect, useState } from 'react';

export default function CustomerAdminPanel({getHeaders}:{getHeaders:()=>Record<string,string>}) {
  const [customers,setCustomers]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[addresses,setAddresses]=useState<any[]>([]);
  const [query,setQuery]=useState(''),[page,setPage]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function request(action:string,method='GET',body?:any){const r=await fetch(`/api/customer-account/${action}`,{method,headers:getHeaders(),cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||'Não foi possível concluir a operação.');return j;}
  const load=useCallback(async()=>{setError('');try{const r=await fetch(`/api/customer-account/admin-list?page=${page}&q=${encodeURIComponent(query)}`,{headers:getHeaders(),cache:'no-store'});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error);setCustomers(j.customers||j.profiles||[]);setMore(Boolean(j.hasMore));}catch{setError('Não foi possível carregar os clientes. Confira a configuração do banco.');}},[page,query,getHeaders]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer);},[load]);
  async function detail(id:string){setBusy(true);setError('');try{const j=await request(`admin-detail?customerId=${encodeURIComponent(id)}`);setSelected(j.profile);setAddresses(j.addresses||[]);}catch(e){setError(e instanceof Error?e.message:'Falha ao abrir cliente.');}finally{setBusy(false);}}
  async function save(){if(!selected)return;setBusy(true);setError('');try{await request('admin-update','PATCH',{customerId:selected.id,name:selected.name,phone:selected.phone});setSelected(null);await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  async function remove(){if(!selected||!window.confirm('Excluir este perfil e encerrar seus acessos? Os pedidos já realizados serão preservados.'))return;setBusy(true);try{await request('admin-delete','DELETE',{customerId:selected.id});setSelected(null);await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível excluir.');}finally{setBusy(false);}}
  async function saveAddress(address:any){setBusy(true);setError('');try{await request('admin-addresses','POST',{customerId:selected.id,...address});await detail(selected.id);}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o endereço.');}finally{setBusy(false);}}
  return <section className="space-y-5">
    <div><h2 className="text-xl font-bold text-white">Clientes da loja</h2><p className="mt-1 text-sm text-zinc-400">Perfis, WhatsApp e endereços. Alterações não modificam pedidos anteriores.</p></div>
    <label className="block text-sm text-zinc-300">Buscar cliente<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Nome ou WhatsApp" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white"/></label>
    {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{customers.map(customer=><button key={customer.id} type="button" disabled={busy} onClick={()=>void detail(customer.id)} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left disabled:opacity-50"><strong className="block text-white">{customer.name||'Cliente'}</strong><span className="mt-1 block text-sm text-zinc-400">{customer.phone}</span><span className="mt-2 block text-xs text-red-300">Abrir perfil</span></button>)}</div>
    {!customers.length&&<p className="text-sm text-zinc-400">Nenhum cliente encontrado.</p>}
    <div className="flex items-center gap-3"><button type="button" disabled={page===0} onClick={()=>setPage(page-1)} className="rounded-lg border border-zinc-700 p-2 text-sm disabled:opacity-40">Anterior</button><span className="text-xs text-zinc-400">Página {page+1}</span><button type="button" disabled={!more} onClick={()=>setPage(page+1)} className="rounded-lg border border-zinc-700 p-2 text-sm disabled:opacity-40">Próxima</button></div>
    {selected&&<div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-3 sm:p-8"><div role="dialog" aria-modal="true" aria-label="Editar cliente" className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-white">
      <div className="flex items-center justify-between"><h3 className="font-bold">Editar perfil</h3><button type="button" aria-label="Fechar edição" onClick={()=>setSelected(null)} className="min-h-10 min-w-10">×</button></div>
      <form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-3">
        <label className="block text-sm">Nome<input required maxLength={100} value={selected.name||''} onChange={e=>setSelected({...selected,name:e.target.value})} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base"/></label>
        <label className="block text-sm">WhatsApp<input required inputMode="tel" value={selected.phone||''} onChange={e=>setSelected({...selected,phone:e.target.value})} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base"/></label>
        <p className="text-xs text-zinc-400">Acesso pelo número, sem verificação de titularidade. Alterar o telefone encerra os acessos anteriores.</p>
        <button disabled={busy} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold disabled:opacity-40">Salvar perfil</button>
      </form>
      <h4 className="pt-2 text-sm font-bold">Endereços salvos</h4>
      {addresses.map((address,index)=><form key={address.id} onSubmit={e=>{e.preventDefault();void saveAddress(address);}} className="grid gap-2 rounded-xl border border-zinc-800 p-3 sm:grid-cols-2">
        {([['label','Apelido'],['street','Rua'],['number','Número'],['neighborhood','Bairro'],['complement','Complemento'],['reference','Referência'],['city','Cidade'],['state','UF'],['cep','CEP']] as const).map(([field,label])=><label key={field} className="block text-xs text-zinc-400">{label}<input value={address[field]||''} required={['street','number','city','state'].includes(field)} onChange={e=>setAddresses(addresses.map((a,i)=>i===index?{...a,[field]:e.target.value}:a))} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-base text-white"/></label>)}
        <button disabled={busy} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40">Salvar endereço</button>
      </form>)}
      {!addresses.length&&<p className="text-sm text-zinc-400">Este cliente ainda não salvou endereços.</p>}
      {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
      <button type="button" disabled={busy} onClick={()=>void remove()} className="rounded-xl border border-red-800 px-4 py-3 text-sm text-red-300 disabled:opacity-40">Excluir perfil</button>
    </div></div>}
  </section>;
}
