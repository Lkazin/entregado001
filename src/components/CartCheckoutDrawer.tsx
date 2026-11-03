'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Trash2, ArrowRight, ShieldCheck, QrCode, Banknote, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DELIVERY_REGIONS, DeliveryRegionMock } from '@/lib/constants';
import Link from 'next/link';
import { CustomerAddress, CustomerProfile, customerRequest, formatCustomerMoney } from '@/lib/customer-client';

interface CartItem {
  id: string;
  type: 'pizza' | 'drink';
  name?: string;
  size?: any;
  flavors?: any[];
  crust?: any;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onOrderSuccess: (orderData: any) => void;
}

export default function CartCheckoutDrawer({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onUpdateQty,
  onOrderSuccess
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<'delivery' | 'payment' | 'review'>('delivery');
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');
  const isPickup = fulfillmentType === 'pickup';

  // Dados do Cliente e Endereço
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cep, setCep] = useState('');
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [cepNeighborhood, setCepNeighborhood] = useState('');
  const [cepCity, setCepCity] = useState('');
  const [cepState, setCepState] = useState('');
  const [cepError, setCepError] = useState<string | null>(null);
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<DeliveryRegionMock | null>(DELIVERY_REGIONS[0]);
  const [isOutsideArea, setIsOutsideArea] = useState(false);
  const [notes, setNotes] = useState('');

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [addressLabel, setAddressLabel] = useState('Casa');
  const dirty = useRef(false);
  const sendGuard = useRef(false);
  const draftNumber = useRef<number | null>(null);
  const cepSequence = useRef(0);
  const cepRequest = useRef<AbortController | null>(null);
  const orderRequest = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function fillAddress(address: CustomerAddress) {
    cepSequence.current++; cepRequest.current?.abort(); setIsCepLoading(false);
    setSelectedAddressId(address.id); setAddressLabel(address.label || 'Casa');
    setStreet(address.street); setNumber(address.number); setComplement(address.complement || ''); setReference(address.reference || '');
    setCep(address.cep || ''); setCepNeighborhood(address.neighborhood); setCepCity(address.city || 'Canoas'); setCepState(address.state || 'RS');
    const matched = DELIVERY_REGIONS.find(r=>r.name.toLowerCase() === address.neighborhood.toLowerCase());
    setSelectedRegion(matched || null); setIsOutsideArea(!matched);
  }
  useEffect(()=>{
    if(!isOpen)return;
    let controller: AbortController | null=null;
    function loadAccount(){
      controller?.abort();const request=new AbortController();controller=request;
      customerRequest<{success:boolean;profile:CustomerProfile;addresses:CustomerAddress[]}>('me',{signal:request.signal})
        .then(data=>{if(request.signal.aborted)return;setProfile(data.profile);setSavedAddresses(data.addresses || []);
          if(!dirty.current){setCustomerName(data.profile.name);setCustomerPhone(data.profile.phone);const address=data.addresses?.find(a=>a.isDefault)||data.addresses?.[0];if(address)fillAddress(address);}
        }).catch(()=>{if(!request.signal.aborted){setProfile(null);setSavedAddresses([]);}});
    }
    loadAccount();window.addEventListener('focus',loadAccount);
    return()=>{controller?.abort();window.removeEventListener('focus',loadAccount);};
  },[isOpen]);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement | null; const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    return()=>{document.body.style.overflow=overflow;previous?.focus();cepRequest.current?.abort();};
  },[isOpen]);

  // Busca automática de endereço por CEP (ViaCEP)
  const handleCepLookup = async (cepInput: string) => {
    dirty.current=true; const sequence=++cepSequence.current; cepRequest.current?.abort();
    setCep(cepInput);
    setCepError(null);
    const clean = cepInput.replace(/\D/g, '');
    if (clean.length === 8) {
      setIsCepLoading(true);
      const controller=new AbortController();cepRequest.current=controller;
      const timeout=setTimeout(()=>controller.abort(),10000);
      try {
        const res = await fetch(`/api/v1/logistics/viacep-lookup?cep=${clean}`,{signal:controller.signal});
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if(sequence!==cepSequence.current)return;
          if (data && data.success) {
            if (data.street) {
              setStreet(data.street);
            }
            if (data.neighborhood) setCepNeighborhood(data.neighborhood);
            if (data.city) setCepCity(data.city);
            if (data.state) setCepState(data.state);

            if (data.neighborhood) {
              const match = DELIVERY_REGIONS.find(r => r.name.toLowerCase() === data.neighborhood.toLowerCase());
              if (match) {
                setSelectedRegion(match);
                setIsOutsideArea(false);
              } else {
                setSelectedRegion(null); setIsOutsideArea(true);
              }
            }
          } else {
            setCepError('CEP não localizado no ViaCEP. Você pode preencher a rua manualmente.');
          }
        } else {
          setCepError('CEP não localizado. Preencha o endereço manualmente.');
        }
      } catch (e) {
        if(sequence!==cepSequence.current)return;
        setCepError('Falha ao consultar o CEP. Preencha o endereço manualmente.');
      } finally {
        clearTimeout(timeout);
        if(sequence===cepSequence.current)setIsCepLoading(false);
      }
    } else setIsCepLoading(false);
  };

  // Forma de Pagamento
  const [paymentMethod, setPaymentMethod] = useState<'pix_manual' | 'cash_delivery' | 'card_terminal'>('pix_manual');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cálculos de Subtotal, Frete e Total
  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [items]);

  const deliveryFee = useMemo(() => {
    if (isPickup || isOutsideArea || !selectedRegion) return 0;
    return selectedRegion.fee;
  }, [selectedRegion, isOutsideArea, isPickup]);

  const total = useMemo(() => {
    return subtotal + deliveryFee;
  }, [subtotal, deliveryFee]);

  if (!isOpen) return null;

  // Finalizar Pedido
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(step!=='review' || sendGuard.current)return;
    setErrorMsg(null);

    if (items.length === 0) {
      setErrorMsg('Seu carrinho está vazio.');
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMsg('Por favor, informe seu nome e telefone WhatsApp.');
      return;
    }

    if (!isPickup && (!street.trim() || !number.trim())) {
      setErrorMsg('Por favor, informe a rua e o número para entrega.');
      return;
    }

    if (!isPickup && (isOutsideArea || !selectedRegion)) {
      setErrorMsg('Desculpe, seu endereço está fora da nossa área atendida.');
      return;
    }

    if (!isPickup && selectedRegion && subtotal < selectedRegion.minOrder) {
      setErrorMsg(`O pedido mínimo para o bairro ${selectedRegion.name} é de R$ ${selectedRegion.minOrder.toFixed(2).replace('.', ',')}.`);
      return;
    }

    if (paymentMethod === 'cash_delivery' && needsChange) {
      const changeNum = parseFloat(changeFor.replace(',', '.'));
      if (isNaN(changeNum) || changeNum < total) {
        setErrorMsg(`O valor do troco deve ser maior ou igual ao total do pedido (R$ ${total.toFixed(2).replace('.', ',')}).`);
        return;
      }
    }

    sendGuard.current=true; setIsSubmitting(true);
    const controller=new AbortController(); orderRequest.current=controller;
    const timeout=setTimeout(()=>controller.abort(),25000);

    try {
      const trackingToken = '';
      const orderNumber = draftNumber.current || Math.floor(1000 + Math.random() * 9000); draftNumber.current=orderNumber;
      const effectiveRegion = isPickup ? '' : selectedRegion!.name;

      const orderPayload = {
        orderNumber,
        trackingToken,
        fulfillmentType,
        customer: { name: customerName, phone: customerPhone },
        address: isPickup ? {} : {
          street,
          number,
          complement,
          reference,
          region: effectiveRegion,
          neighborhood: selectedRegion!.name,
          city: cepCity || 'Canoas',
          state: cepState || 'RS',
          cep: cep.replace(/\D/g, ''),
          fee: deliveryFee
        },
        items,
        subtotal,
        deliveryFee,
        total,
        payment: {
          method: paymentMethod,
          status: paymentMethod === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
          changeFor: paymentMethod === 'cash_delivery' && needsChange ? parseFloat(changeFor.replace(',', '.')) : null
        },
        deliveryPin: String(Math.floor(1000 + Math.random() * 9000)),
        createdAt: new Date().toISOString()
      };

      let serverOrderId: string | null = null;
      let customerProfileSaved = false;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...orderPayload, notes, saveCustomerAddress: !isPickup && saveAddress, addressLabel }),
          credentials: 'same-origin'
          ,signal: controller.signal
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.orderId && typeof data.trackingToken === 'string' && data.trackingToken && data.deliveryPin) {
          clearTimeout(timeout);
          serverOrderId = String(data.orderId);
          customerProfileSaved = data.customerProfileSaved === true;
          orderPayload.trackingToken = data.trackingToken;
          orderPayload.orderNumber = data.orderNumber;
          orderPayload.deliveryPin = data.deliveryPin;
          if (data.fulfillmentType === 'pickup' || data.fulfillmentType === 'delivery') orderPayload.fulfillmentType = data.fulfillmentType;
        } else {
          throw new Error('Não foi possível confirmar o pedido. Tente novamente.');
        }
      } catch (e) {
        throw new Error('Não foi possível confirmar o pedido. Confira sua conexão e tente novamente.');
      }

      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('novaesweb_orders');
          const current = cached ? JSON.parse(cached) : [];
          const newOrder = {
            id: serverOrderId || `ord-${Date.now()}-${orderPayload.orderNumber}`,
            orderNumber: orderPayload.orderNumber,
            customerName: customerName,
            fulfillmentType: orderPayload.fulfillmentType,
            phone: customerPhone,
            address: isPickup ? '' : `${street}, ${number} ${complement ? '- ' + complement : ''}`,
            region: effectiveRegion,
            city: isPickup ? '' : cepCity || 'Canoas',
            state: isPickup ? '' : cepState || 'RS',
            cep: isPickup ? '' : cep.replace(/\D/g, ''),
            itemsSummary: items.map((i: any) => `${i.quantity}x ${i.name || 'Pizza'}`).join(' • '),
            total,
            status: 'recebido' as const,
            paymentMethod: paymentMethod,
            paymentStatus: paymentMethod === 'pix_manual' ? 'aguardando_conferencia' : 'pendente',
            deliveryPin: orderPayload.deliveryPin,
            trackingToken: orderPayload.trackingToken,
            driverName: null,
            createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            notes,
            subtotal,
            deliveryFee,
            changeFor: orderPayload.payment.changeFor,
            addressDetail: isPickup ? undefined : {
              street,
              number,
              complement,
              reference,
              region: effectiveRegion,
              neighborhood: selectedRegion!.name,
              city: cepCity || 'Canoas',
              state: cepState || 'RS',
              cep: cep.replace(/\D/g, '')
            }
          };
          localStorage.setItem('novaesweb_orders', JSON.stringify([newOrder, ...current.filter((o: any) => o.id !== newOrder.id)]));
        } catch (e) {}
      }

      let profileSaveWarning='';
      if(!isPickup && saveAddress && customerProfileSaved){try{await customerRequest('addresses',{method:'POST',body:JSON.stringify({id:selectedAddressId || undefined,label:addressLabel || 'Casa',...orderPayload.address,isDefault:savedAddresses.length===0 || savedAddresses.find(a=>a.id===selectedAddressId)?.isDefault === true})});}catch{profileSaveWarning='Pedido confirmado. O endereço não pôde ser salvo no perfil agora.';}}
      else if(!isPickup && saveAddress && !customerProfileSaved){profileSaveWarning='Pedido confirmado. O perfil não pôde ser salvo agora.';}
      window.dispatchEvent(new Event('novaesweb:customer-account-changed'));
      onOrderSuccess({...orderPayload,profileSaveWarning});
      draftNumber.current=null; dirty.current=false; setStep('delivery');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar o pedido. Tente novamente.');
    } finally {
      clearTimeout(timeout); if(orderRequest.current===controller)orderRequest.current=null;
      sendGuard.current=false; setIsSubmitting(false);
    }
  };

  function advanceStep() {
    setErrorMsg(null);
    if(!items.length){setErrorMsg('Seu carrinho está vazio.');return;}
    if(step==='delivery'){
      const phone=customerPhone.replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
      if(!customerName.trim() || !/^\d{10,11}$/.test(phone)){setErrorMsg('Informe seu nome e WhatsApp com DDD.');return;}
      if(!isPickup && (!street.trim() || !number.trim())){setErrorMsg('Informe a rua e o número para entrega.');return;}
      if(!isPickup && (isOutsideArea || !selectedRegion)){setErrorMsg('Selecione um bairro atendido pela loja.');return;}
      if(!isPickup && cepCity && (cepCity.trim().toLowerCase()!=='canoas' || (cepState && cepState.toUpperCase()!=='RS'))){setErrorMsg('Este endereço está fora da área atendida.');return;}
      if(!isPickup && selectedRegion && subtotal<selectedRegion.minOrder){setErrorMsg('O valor mínimo para este bairro é '+formatCustomerMoney(selectedRegion.minOrder)+'.');return;}
      setStep('payment');
    }else{
      if(paymentMethod==='cash_delivery' && needsChange){const change=Number(changeFor.replace(',','.'));if(!Number.isFinite(change)||change<total){setErrorMsg('Informe um troco a partir de '+formatCustomerMoney(total)+'.');return;}}
      setStep('review');
    }
  }
  return <div className="fixed inset-0 z-50 bg-black/80 sm:p-5" onClick={e=>{if(e.target===e.currentTarget&&!isSubmitting)onClose();}}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-heading" className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-zinc-950 text-white shadow-2xl sm:rounded-3xl sm:border sm:border-zinc-700" onKeyDown={e=>{if(e.key==='Escape'&&!isSubmitting){e.preventDefault();onClose();}if(e.key==='Tab'){const list=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || []).filter(el=>el.getClientRects().length>0);const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-4 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-widest text-pizza-gold">Bella Pizza</p><h2 id="checkout-heading" className="mt-1 text-xl font-bold">Seu pedido, do seu jeito</h2></div><button ref={closeRef} type="button" disabled={isSubmitting} onClick={onClose} aria-label="Fechar checkout" className="rounded-xl border border-zinc-800 p-3 text-zinc-400 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button></header>
      {!items.length?<div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"><p className="text-lg font-bold">Seu carrinho está vazio.</p><button type="button" onClick={onClose} className="rounded-xl bg-pizza-gold px-4 py-3 font-bold text-pizza-black">Voltar ao cardápio</button></div>:<>
      <nav aria-label="Etapas do checkout" className="grid grid-cols-3 gap-2 border-b border-zinc-800 px-4 py-3 sm:px-7">{(['delivery','payment','review'] as const).map((id,index)=><div key={id} aria-current={step===id?'step':undefined} className={'rounded-xl px-2 py-3 text-center text-sm '+(step===id?'bg-pizza-gold font-bold text-pizza-black':'text-zinc-500')}>{index+1}. {[isPickup?'Retirada':'Entrega','Pagamento','Revisão'][index]}</div>)}</nav>
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px]">
        <form id="checkout-form" onSubmit={handleCheckoutSubmit} onChange={()=>{dirty.current=true;}} className="min-w-0 space-y-5 p-4 sm:p-7">
          {errorMsg&&<p role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{errorMsg}</p>}
          {step==='delivery'&&<>
            <div><h3 className="text-xl font-bold">Como deseja receber?</h3><p className="mt-2 text-sm text-zinc-400">Seu perfil é criado após a confirmação do primeiro pedido.</p></div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm"><span>{profile?'Perfil de '+profile.name:'Já tem perfil? Entre com seu WhatsApp.'}</span><Link href="/minha-conta" target="_blank" rel="noopener noreferrer" className="text-pizza-gold underline" aria-label="Abrir minha conta em outra aba">Minha conta</Link></div>
            <fieldset className="grid grid-cols-2 gap-3"><legend className="mb-2 text-sm font-semibold text-zinc-300">Recebimento do pedido</legend>{([{id:'delivery',label:'Entrega no endereço'},{id:'pickup',label:'Retirar na loja'}] as const).map(option=><button key={option.id} type="button" aria-pressed={fulfillmentType===option.id} onClick={()=>{dirty.current=true;setFulfillmentType(option.id);setErrorMsg(null);if(option.id==='pickup'){cepSequence.current++;cepRequest.current?.abort();setIsCepLoading(false);}}} className={"min-h-12 rounded-xl border p-3 text-sm font-bold "+(fulfillmentType===option.id?'border-pizza-gold bg-pizza-gold/10 text-pizza-gold':'border-zinc-700 bg-zinc-900 text-zinc-300')}>{option.label}</button>)}</fieldset>
            {isPickup&&<div className="rounded-xl border border-pizza-gold/30 bg-pizza-gold/5 p-4 text-sm text-zinc-300"><strong className="text-pizza-gold">Retirada na loja — sem frete</strong><p className="mt-2">Aguarde a confirmação de que está pronto para retirar. Apresente o número do pedido no balcão.</p></div>}
            {!isPickup && savedAddresses.length>0&&<label className="block text-sm text-zinc-300">Endereço salvo<select className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-base text-white" value={selectedAddressId} onChange={e=>{const a=savedAddresses.find(x=>x.id===e.target.value);if(a)fillAddress(a);else setSelectedAddressId('');}}><option value="">Usar outro endereço neste pedido</option>{savedAddresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.street}, {a.number}{a.isDefault?' · Principal':''}</option>)}</select></label>}
                {/* Dados Pessoais */}
                <div className="space-y-3">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pizza-gold text-pizza-black flex items-center justify-center text-xs">1</span>
                    Seus Dados
                  </h3>
                  <div>
                    <label className="text-zinc-400 block mb-1">Nome Completo</label>
                    <input
                      type="text"
                      required
                      aria-label="Nome completo" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">WhatsApp / Telefone</label>
                    <input
                      type="tel"
                      required
                      aria-label="WhatsApp com DDD" value={customerPhone}
                      onChange={(e) => {setSelectedAddressId('');setCustomerPhone(e.target.value);}}
                      placeholder="(11) 98765-4321"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                </div>

                {/* Endereço de Entrega */}
                {!isPickup && <>
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pizza-gold text-pizza-black flex items-center justify-center text-xs">2</span>
                    Endereço de Entrega
                  </h3>

                  {/* Seletor de Região/Bairro atendido */}
                  <div>
                    <label className="text-zinc-400 block mb-1">Bairro / Região</label>
                    <select
                      aria-label="Bairro atendido" value={isOutsideArea ? 'outside' : selectedRegion?.id}
                      onChange={(e) => {
                        if (e.target.value === 'outside') {
                          setIsOutsideArea(true);
                          setSelectedRegion(null);
                        } else {
                          setIsOutsideArea(false);
                          const reg = DELIVERY_REGIONS.find(r => r.id === e.target.value) || null;
                          setSelectedRegion(reg);
                        }
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                    >
                      {DELIVERY_REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} — Taxa: R$ {r.fee.toFixed(2).replace('.', ',')} (Mín: R$ {r.minOrder.toFixed(2).replace('.', ',')})
                        </option>
                      ))}
                      <option value="outside">Outro Bairro (Fora da área atendida)</option>
                    </select>
                  </div>

                  {isOutsideArea && (
                    <div className="p-3 bg-pizza-card/60 border border-pizza-gold/30 rounded-lg text-pizza-gold-light">
                      ⚠️ Não realizamos entregas na sua região no momento.
                    </div>
                  )}

                  {/* Busca Rápida por CEP (ViaCEP) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-zinc-400 block">CEP (Preenchimento Automático)</label>
                      {isCepLoading && (
                        <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                          Consultando ViaCEP...
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={9}
                        aria-label="CEP" value={cep}
                        onChange={(e) => handleCepLookup(e.target.value)}
                        placeholder="Ex: 01001-000"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold font-mono"
                      />
                    </div>
                    {cepCity && (
                      <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          Localizado: {cepNeighborhood ? `${cepNeighborhood}, ` : ''}{cepCity}/{cepState}
                        </span>
                      </p>
                    )}
                    {cepError && (
                      <p className="text-[11px] text-amber-400 mt-1">{cepError}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-zinc-400 block mb-1">Rua / Avenida</label>
                      <input
                        type="text"
                        required
                        aria-label="Rua ou avenida" value={street}
                        onChange={(e) => {cepSequence.current++;setStreet(e.target.value);setIsCepLoading(false);}}
                        placeholder="Nome da rua"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Número</label>
                      <input
                        type="text"
                        required
                        aria-label="Número do imóvel" value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="123"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-zinc-400 block mb-1">Complemento (Apto/Bloco)</label>
                      <input
                        type="text"
                        aria-label="Complemento" value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        placeholder="Ex: Apto 42"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Ponto de Referência</label>
                      <input
                        type="text"
                        aria-label="Referência" value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ex: Próximo à padaria"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                  </div>
                </div>


            <div className="space-y-3 rounded-xl border border-zinc-800 p-4"><label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={saveAddress} onChange={e=>setSaveAddress(e.target.checked)} />Salvar este endereço no meu perfil</label>{saveAddress?<label className="block text-sm text-zinc-400">Apelido<input className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white" value={addressLabel} onChange={e=>setAddressLabel(e.target.value)} maxLength={40} placeholder="Casa ou trabalho" /></label>:<p className="text-xs text-zinc-500">Este endereço será usado somente neste pedido.</p>}</div>
                </>}
          </>}
          {step==='payment'&&<><h3 className="text-xl font-bold">Como prefere pagar?</h3><p className="text-sm text-zinc-400">Nenhum pagamento será realizado automaticamente.</p>
                {/* Forma de Pagamento */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pizza-gold text-pizza-black flex items-center justify-center text-xs">3</span>
                    Forma de Pagamento
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      aria-pressed={paymentMethod === 'pix_manual'} onClick={() => setPaymentMethod('pix_manual')}
                      className={`p-3 rounded-xl border text-center transition ${paymentMethod === 'pix_manual'
                          ? 'bg-pizza-card/40 border-pizza-gold text-white'
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                    >
                      <QrCode className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
                      <span className="font-semibold block text-[11px]">Pix Manual</span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={paymentMethod === 'cash_delivery'} onClick={() => setPaymentMethod('cash_delivery')}
                      className={`p-3 rounded-xl border text-center transition ${paymentMethod === 'cash_delivery'
                          ? 'bg-pizza-card/40 border-pizza-gold text-white'
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                    >
                      <Banknote className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                      <span className="font-semibold block text-[11px]">Dinheiro</span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={paymentMethod === 'card_terminal'} onClick={() => setPaymentMethod('card_terminal')}
                      className={`p-3 rounded-xl border text-center transition ${paymentMethod === 'card_terminal'
                          ? 'bg-pizza-card/40 border-pizza-gold text-white'
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                    >
                      <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                      <span className="font-semibold block text-[11px]">Cartão</span>
                    </button>
                  </div>

                  {paymentMethod === 'pix_manual' && <p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-300">O Pix será conferido manualmente pela loja. Confira os dados de pagamento com a loja antes de transferir.</p>}
                  {paymentMethod === 'cash_delivery' && (
                    <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-2">
                      <label className="flex items-center gap-2 text-zinc-300">
                        <input
                          type="checkbox"
                          checked={needsChange}
                          onChange={(e) => setNeedsChange(e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-950 text-pizza-gold focus:ring-0"
                        />
                        <span>Precisa de troco?</span>
                      </label>
                      {needsChange && (
                        <div>
                          <label className="text-zinc-400 block mb-1">Troco para quanto?</label>
                          <input
                            type="text"
                            aria-label="Troco para" value={changeFor}
                            onChange={(e) => setChangeFor(e.target.value)}
                            placeholder="Ex: 100,00"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === 'card_terminal' && (
                    <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-[11px] text-zinc-300">
                      {isPickup ? 'O pagamento com cartão será feito no balcão da loja.' : 'O entregador levará a maquininha (Débito, Crédito ou Refeição) até a sua porta.'}
                    </div>
                  )}

                  <div>
                    <label className="text-zinc-400 block mb-1">Observações do Pedido (Opcional)</label>
                    <textarea
                      rows={2}
                      aria-label="Observações do pedido" value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Tocar o interfone 2 vezes, retirar cebola..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                </div>

          </>}
          {step==='review'&&<>
            <h3 className="text-xl font-bold">Revise antes de confirmar</h3>
            <section className="rounded-2xl border border-zinc-800 p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{isPickup?'Retirada na loja — sem frete':'Entrega'}</h4><button type="button" onClick={()=>setStep('delivery')} className="min-h-11 text-sm text-pizza-gold underline">Editar</button></div><p className="text-sm text-zinc-200">{customerName} · {customerPhone}</p>{isPickup?<p className="mt-2 text-sm text-zinc-300">Aguarde a confirmação de que está pronto para retirar e apresente o número do pedido no balcão.</p>:<><p className="mt-2 break-words text-sm text-zinc-300">{street}, {number}{complement?' · '+complement:''}</p><p className="mt-1 text-sm text-zinc-500">{selectedRegion?.name} · {cepCity || 'Canoas'}/{cepState || 'RS'}</p>{reference&&<p className="mt-2 text-xs text-zinc-400">Referência: {reference}</p>}</>}</section>
            <section className="rounded-2xl border border-zinc-800 p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Pagamento</h4><button type="button" onClick={()=>setStep('payment')} className="min-h-11 text-sm text-pizza-gold underline">Editar</button></div><p className="text-sm text-zinc-300">{paymentMethod==='pix_manual'?'Pix com conferência da loja':paymentMethod==='card_terminal'?(isPickup?'Cartão no balcão':'Cartão na entrega'):(isPickup?'Dinheiro no balcão':'Dinheiro na entrega')}</p>{paymentMethod==='cash_delivery'&&needsChange&&<p className="mt-2 text-sm text-zinc-400">Troco para {changeFor}</p>}{notes&&<p className="mt-3 break-words text-sm text-zinc-400">Observações: {notes}</p>}</section>
            <p className="text-sm text-zinc-400">O pedido será enviado somente ao tocar em confirmar.</p>
          </>}
        </form>
        <aside className="min-w-0 space-y-4 border-t border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 lg:border-l lg:border-t-0"><h3 className="font-bold text-white">Seu pedido · {items.reduce((sum,item)=>sum+item.quantity,0)} itens</h3>
          {items.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <p className="text-sm">Seu carrinho está vazio.</p>
                  <p className="text-xs mt-1 text-zinc-600">Monte uma pizza artesanal para começar!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          {item.type === 'pizza' ? (
                            <>
                              <h4 className="font-bold text-sm text-white">Pizza {item.size?.name}</h4>
                              <p className="text-xs text-zinc-400 mt-1">
                                {item.flavors?.map((f: any) => f.name).join(' + ')}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">Borda: {item.crust?.name}</p>
                            </>
                          ) : (
                            <>
                              <h4 className="font-bold text-sm text-white">{item.name}</h4>
                              <p className="text-xs text-zinc-500 mt-0.5">Bebida gelada</p>
                            </>
                          )}
                        </div>

                        <button
                          disabled={isSubmitting} aria-label="Remover item" onClick={() => onRemoveItem(item.id)}
                          className="text-zinc-500 hover:text-pizza-gold p-1"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                        <div className="flex items-center gap-2 bg-zinc-950 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
                          <button
                            disabled={isSubmitting || item.quantity<=1} aria-label="Diminuir quantidade" onClick={() => onUpdateQty(item.id, -1)}
                            className="text-zinc-400 hover:text-white font-bold px-1"
                          >
                            -
                          </button>
                          <span className="font-bold text-white">{item.quantity}</span>
                          <button
                            disabled={isSubmitting} aria-label="Aumentar quantidade" onClick={() => onUpdateQty(item.id, 1)}
                            className="text-zinc-400 hover:text-white font-bold px-1"
                          >
                            +
                          </button>
                        </div>

                        <span className="font-bold text-sm text-white">
                          R$ {item.totalPrice.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          <dl className="space-y-2 border-t border-zinc-800 pt-4 text-sm"><div className="flex justify-between gap-2 text-zinc-400"><dt>Produtos</dt><dd>{formatCustomerMoney(subtotal)}</dd></div><div className="flex justify-between gap-2 text-zinc-400"><dt>{isPickup?'Retirada na loja':'Entrega'}</dt><dd>{isPickup?'Sem frete':selectedRegion?formatCustomerMoney(deliveryFee):'Selecione o bairro'}</dd></div><div className="flex justify-between gap-2 pt-2 text-lg font-bold"><dt>Total</dt><dd className="text-pizza-gold">{formatCustomerMoney(total)}</dd></div></dl>
        </aside>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7"><div><p className="text-xs text-zinc-500">Total do pedido</p><p className="text-lg font-bold">{formatCustomerMoney(total)}</p></div><div className="flex gap-2">{step!=='delivery'&&<button type="button" disabled={isSubmitting} onClick={()=>{setErrorMsg(null);setStep(step==='review'?'payment':'delivery');}} className="min-h-12 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 disabled:opacity-50">Voltar</button>}{step==='review'?<button type="submit" form="checkout-form" disabled={isSubmitting} className="min-h-12 rounded-xl bg-pizza-gold px-4 text-sm font-bold text-pizza-black disabled:opacity-50">{isSubmitting?'Confirmando…':'Confirmar pedido'}</button>:<button type="button" onClick={advanceStep} className="flex min-h-12 items-center gap-2 rounded-xl bg-pizza-gold px-4 text-sm font-bold text-pizza-black">{step==='delivery'?'Escolher pagamento':'Revisar pedido'}<ArrowRight className="h-4 w-4" /></button>}</div></footer>
      </>}
    </div>
  </div>;
}
