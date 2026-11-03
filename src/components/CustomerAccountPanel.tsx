'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Clock, Home, LogOut, MapPin, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { CustomerAddress, CustomerHistoryOrder, CustomerProfile, customerRequest, emptyCustomerAddress, formatCustomerMoney, validCustomerPhone } from '@/lib/customer-client';
import { normalizeOrderStatus } from '@/lib/logistics/order-timeline';

const fieldClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-pizza-gold';
const statuses: Record<string, string> = { recebido: 'Recebido', preparando: 'Em preparo', pronto: 'Aguardando retirada', em_entrega: 'Em entrega', concluido: 'Entregue', cancelado: 'Cancelado' };

export default function CustomerAccountPanel() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orders, setOrders] = useState<CustomerHistoryOrder[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<CustomerAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const revision = useRef(0);

  const applyAccount = (data: {profile: CustomerProfile; addresses: CustomerAddress[]}) => {
    setProfile(data.profile); setName(data.profile.name); setPhone(data.profile.phone); setAddresses(data.addresses || []);
  };
  const loadHistory = useCallback(async (expected: number) => {
    try { const data = await customerRequest<{success: boolean; orders: CustomerHistoryOrder[]}>('history'); if (revision.current === expected) setOrders(data.orders || []); }
    catch { if (revision.current === expected) setError('Não foi possível atualizar o histórico. Tente novamente.'); }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); const expected = ++revision.current;
    customerRequest<{success: boolean; profile: CustomerProfile; addresses: CustomerAddress[]}>('me', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && revision.current === expected) { applyAccount(data); void loadHistory(expected); } })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { revision.current++; controller.abort(); };
  }, [loadHistory]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!validCustomerPhone(phone)) { setError('Informe o WhatsApp com DDD.'); return; }
    setBusy(true); setError(''); setMessage(''); const expected = ++revision.current;
    try { const data = await customerRequest<{success: boolean; profile: CustomerProfile; addresses: CustomerAddress[]}>('login', {method: 'POST', body: JSON.stringify({phone})});
      if (revision.current !== expected) return; applyAccount(data); setAddress(null); setOrders([]); await loadHistory(expected);
    } catch (e) { if (revision.current === expected) setError(e instanceof Error ? e.message : 'Não foi possível entrar.'); }
    finally { if (revision.current === expected) setBusy(false); }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    try { const data = await customerRequest('profile', {method: 'PATCH', body: JSON.stringify({name, phone})});
      if (data.sessionEnded) {
        revision.current++; setProfile(null); setAddresses([]); setOrders([]); setAddress(null); setName('');
        setPhone(data.profile?.phone || phone); setMessage('Telefone atualizado. Entre novamente com o novo WhatsApp.');
      } else {
        if (data.profile) applyAccount({profile: data.profile, addresses: data.addresses || addresses});
        setMessage('Perfil atualizado. Pedidos anteriores mantêm os dados usados na compra.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  async function saveAddress(event: React.FormEvent) {
    event.preventDefault(); if (busy || !address) return; setBusy(true); setError(''); setMessage('');
    try { await customerRequest('addresses', {method: 'POST', body: JSON.stringify(address)}); const data = await customerRequest('me'); applyAccount(data); setAddress(null); setMessage('Endereço salvo.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o endereço.'); } finally { setBusy(false); }
  }
  async function removeAddress(item: CustomerAddress) {
    if (busy || !window.confirm(`Remover o endereço “${item.label}” do seu perfil? Seus pedidos continuam no histórico.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await customerRequest('addresses', {method: 'DELETE', body: JSON.stringify({id: item.id})}); const data = await customerRequest('me'); applyAccount(data); if (address?.id === item.id) setAddress(null); setMessage('Endereço removido do perfil.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível remover.'); } finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return; setBusy(true); setError('');
    try { await customerRequest('logout', {method: 'POST'}); revision.current++; setProfile(null); setOrders([]); setAddresses([]); setAddress(null); setName(''); setPhone(''); setMessage('Você saiu deste navegador.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível sair.'); } finally { setBusy(false); }
  }

  if (loading) return <p role="status" className="py-12 text-center text-zinc-400">Carregando sua conta…</p>;
  return <div className="space-y-6">
    {message && <p role="status" className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</p>}
    {!profile ? <section className="mx-auto max-w-lg rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <UserRound className="mb-4 h-8 w-8 text-pizza-gold" /><h2 className="text-2xl font-bold text-white">Seu pedido, do seu jeito</h2>
      <p className="mt-3 text-sm text-zinc-400">Seu perfil é criado no primeiro pedido. Use o mesmo WhatsApp para consultar seus dados e próximos pedidos.</p>
      <form onSubmit={login} className="mt-6 space-y-4"><label className="block text-sm text-zinc-300">WhatsApp com DDD<input className={fieldClass + ' mt-2'} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={20} placeholder="(51) 99999-9999" /></label>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-pizza-gold px-4 py-3 font-bold text-pizza-black disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar com WhatsApp'}<ArrowRight className="h-4 w-4" /></button>
      </form><Link href="/#cardapio" className="mt-5 inline-block text-sm text-pizza-gold underline">Fazer meu primeiro pedido</Link>
    </section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-zinc-400">Minha conta</p><h2 className="text-2xl font-bold text-white">Olá, {profile.name.split(' ')[0] || 'cliente'}</h2></div><button type="button" onClick={logout} disabled={busy} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 disabled:opacity-50"><LogOut className="h-4 w-4" />Sair</button></div>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"><h3 className="mb-4 flex items-center gap-2 font-bold text-white"><UserRound className="h-5 w-5 text-pizza-gold" />Meus dados</h3>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-zinc-300">Nome<input className={fieldClass + ' mt-2'} value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={100} /></label><label className="text-sm text-zinc-300">WhatsApp<input className={fieldClass + ' mt-2'} type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" required maxLength={20} /></label><div className="sm:col-span-2"><button disabled={busy} className="flex items-center gap-2 rounded-xl bg-pizza-gold px-4 py-3 text-sm font-bold text-pizza-black disabled:opacity-50"><Save className="h-4 w-4" />Salvar meus dados</button></div></form>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold text-white"><MapPin className="h-5 w-5 text-pizza-gold" />Meus endereços</h3><button type="button" onClick={() => setAddress({...emptyCustomerAddress(),isDefault:addresses.length===0})} disabled={busy} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200"><Plus className="h-4 w-4" />Adicionar endereço</button></div>
        <div className="grid gap-3 sm:grid-cols-2">{addresses.map(item => <article key={item.id} className="rounded-2xl border border-zinc-700 p-4"><div className="flex items-center gap-2 font-semibold text-white"><Home className="h-4 w-4 text-pizza-gold" />{item.label}{item.isDefault && <span className="rounded-md bg-emerald-950 px-2 py-1 text-xs text-emerald-300">Principal</span>}</div><p className="mt-2 break-words text-sm text-zinc-300">{item.street}, {item.number}{item.complement ? ` · ${item.complement}` : ''}</p><p className="mt-1 text-sm text-zinc-500">{item.neighborhood} · {item.city}/{item.state}</p>{item.reference && <p className="mt-1 text-xs text-zinc-400">Referência: {item.reference}</p>}<div className="mt-3 flex gap-3"><button type="button" onClick={() => setAddress({...item})} disabled={busy} className="min-h-11 text-sm text-pizza-gold underline">Editar</button><button type="button" onClick={() => removeAddress(item)} disabled={busy} aria-label={`Remover endereço ${item.label}`} className="min-h-11 px-2 text-zinc-400"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
        {!addresses.length && <p className="text-sm text-zinc-400">Salve um endereço para preencher sua próxima compra mais rápido.</p>}
        {address && <form onSubmit={saveAddress} className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-2">
          {([['label','Apelido'],['cep','CEP'],['street','Rua / avenida'],['number','Número'],['neighborhood','Bairro'],['city','Cidade'],['state','Estado'],['complement','Complemento'],['reference','Referência']] as const).map(([key,label]) => <label key={key} className={'text-sm text-zinc-300 ' + (key === 'street' || key === 'reference' ? 'sm:col-span-2' : '')}>{label}<input className={fieldClass + ' mt-1'} value={address[key]} onChange={e => setAddress({...address,[key]:e.target.value})} required={['label','street','number','neighborhood','city','state'].includes(key)} maxLength={key === 'state' ? 2 : 160} /></label>)}
          <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300 sm:col-span-2"><input type="checkbox" checked={address.isDefault} onChange={e => setAddress({...address,isDefault:e.target.checked})} />Usar como endereço principal</label><div className="flex flex-wrap gap-3 sm:col-span-2"><button disabled={busy} className="rounded-xl bg-pizza-gold px-4 py-3 text-sm font-bold text-pizza-black disabled:opacity-50">Salvar endereço</button><button type="button" onClick={() => setAddress(null)} disabled={busy} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300">Cancelar</button></div>
        </form>}
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold text-white"><Clock className="h-5 w-5 text-pizza-gold" />Meus pedidos</h3><button type="button" disabled={busy} onClick={() => void loadHistory(revision.current)} className="min-h-11 text-sm text-pizza-gold underline">Atualizar histórico</button></div>
        <div className="space-y-3">{orders.map(order => <article key={order.id} className="rounded-2xl border border-zinc-700 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-white">Pedido #{String(order.orderNumber).replace('#','')}</strong><span className="text-xs text-zinc-400">{statuses[normalizeOrderStatus(order.status)] || 'Recebido'}</span></div><p className="mt-2 text-sm text-zinc-400">{order.itemsSummary || 'Confira os detalhes do seu pedido.'}</p><p className="mt-2 font-semibold text-white">{formatCustomerMoney(order.total)}</p>{order.createdAt && Number.isFinite(Date.parse(order.createdAt)) && <p className="mt-1 text-xs text-zinc-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>}<div className="mt-3 flex flex-wrap gap-3">{order.trackingToken && <Link href={`/pedido/${encodeURIComponent(order.trackingToken)}`} className="min-h-11 rounded-xl bg-zinc-800 px-3 py-3 text-sm text-zinc-100">{normalizeOrderStatus(order.status) === 'concluido' ? 'Ver pedido' : 'Acompanhar pedido'}</Link>}<Link href="/#cardapio" className="min-h-11 rounded-xl border border-zinc-700 px-3 py-3 text-sm text-pizza-gold">Pedir novamente</Link></div></article>)}</div>{!orders.length && <p className="text-sm text-zinc-400">Seus pedidos confirmados aparecerão aqui.</p>}<p className="mt-4 text-xs text-zinc-500">Ao pedir novamente, escolha os itens no cardápio. Disponibilidade e preços atuais serão conferidos antes de confirmar.</p>
      </section>
    </>}
  </div>;
}
