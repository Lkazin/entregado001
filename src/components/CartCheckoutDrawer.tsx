'use client';

import React, { useState, useMemo } from 'react';
import { X, Trash2, ArrowRight, ShieldCheck, QrCode, Banknote, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DELIVERY_REGIONS, DeliveryRegionMock } from '@/lib/constants';

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
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');

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

  // Busca automática de endereço por CEP (ViaCEP)
  const handleCepLookup = async (cepInput: string) => {
    setCep(cepInput);
    setCepError(null);
    const clean = cepInput.replace(/\D/g, '');
    if (clean.length === 8) {
      setIsCepLoading(true);
      try {
        const res = await fetch(`/api/v1/logistics/viacep-lookup?cep=${clean}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.success) {
            if (data.street) {
              setStreet(data.street);
            }
            if (data.neighborhood) setCepNeighborhood(data.neighborhood);
            if (data.city) setCepCity(data.city);
            if (data.state) setCepState(data.state);

            if (data.neighborhood) {
              const match = DELIVERY_REGIONS.find(r =>
                r.name.toLowerCase().includes(data.neighborhood.toLowerCase()) ||
                data.neighborhood.toLowerCase().includes(r.name.toLowerCase())
              );
              if (match) {
                setSelectedRegion(match);
                setIsOutsideArea(false);
              }
            }
          } else {
            setCepError('CEP não localizado no ViaCEP. Você pode preencher a rua manualmente.');
          }
        } else {
          setCepError('CEP não localizado. Preencha o endereço manualmente.');
        }
      } catch (e) {
        setCepError('Falha ao consultar o CEP. Preencha o endereço manualmente.');
      } finally {
        setIsCepLoading(false);
      }
    }
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
    if (isOutsideArea || !selectedRegion) return 0;
    return selectedRegion.fee;
  }, [selectedRegion, isOutsideArea]);

  const total = useMemo(() => {
    return subtotal + deliveryFee;
  }, [subtotal, deliveryFee]);

  if (!isOpen) return null;

  // Finalizar Pedido
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (items.length === 0) {
      setErrorMsg('Seu carrinho está vazio.');
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMsg('Por favor, informe seu nome e telefone WhatsApp.');
      return;
    }

    if (!street.trim() || !number.trim()) {
      setErrorMsg('Por favor, informe a rua e o número para entrega.');
      return;
    }

    if (isOutsideArea || !selectedRegion) {
      setErrorMsg('Desculpe, seu endereço está fora da nossa área atendida.');
      return;
    }

    if (subtotal < selectedRegion.minOrder) {
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

    setIsSubmitting(true);

    try {
      const trackingToken = `tk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const orderNumber = Math.floor(1000 + Math.random() * 9000);
      const effectiveRegion = cepNeighborhood || selectedRegion.name;

      const orderPayload = {
        orderNumber,
        trackingToken,
        customer: { name: customerName, phone: customerPhone },
        address: {
          street,
          number,
          complement,
          reference,
          region: effectiveRegion,
          neighborhood: cepNeighborhood || selectedRegion.name,
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
          changeFor: needsChange ? parseFloat(changeFor.replace(',', '.')) : null
        },
        deliveryPin: String(Math.floor(1000 + Math.random() * 9000)),
        createdAt: new Date().toISOString()
      };

      let serverOrderId: string | null = null;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...orderPayload, notes })
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.orderId) {
          serverOrderId = String(data.orderId);
          orderPayload.trackingToken = data.trackingToken;
          orderPayload.orderNumber = data.orderNumber;
          orderPayload.deliveryPin = data.deliveryPin;
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
            phone: customerPhone,
            address: `${street}, ${number} ${complement ? '- ' + complement : ''}`,
            region: effectiveRegion,
            city: cepCity || 'Canoas',
            state: cepState || 'RS',
            cep: cep.replace(/\D/g, ''),
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
            addressDetail: {
              street,
              number,
              complement,
              reference,
              region: effectiveRegion,
              neighborhood: cepNeighborhood || selectedRegion.name,
              city: cepCity || 'Canoas',
              state: cepState || 'RS',
              cep: cep.replace(/\D/g, '')
            }
          };
          localStorage.setItem('novaesweb_orders', JSON.stringify([newOrder, ...current.filter((o: any) => o.id !== newOrder.id)]));
        } catch (e) {}
      }

      onOrderSuccess(orderPayload);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar o pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-zinc-950 border-l border-zinc-800 text-white flex flex-col shadow-2xl">

          {/* Header */}
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{step === 'cart' ? 'Seu Carrinho' : 'Finalizar Pedido'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pizza-card text-pizza-gold border border-pizza-gold/30 font-semibold">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
              </span>
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Erro */}
          {errorMsg && (
            <div className="p-3 m-4 rounded-xl bg-pizza-card/60 border border-pizza-gold/30 text-pizza-gold-light text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Conteúdo Dinâmico */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            {step === 'cart' ? (
              items.length === 0 ? (
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
                          onClick={() => onRemoveItem(item.id)}
                          className="text-zinc-500 hover:text-pizza-gold p-1"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                        <div className="flex items-center gap-2 bg-zinc-950 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
                          <button
                            onClick={() => onUpdateQty(item.id, -1)}
                            className="text-zinc-400 hover:text-white font-bold px-1"
                          >
                            -
                          </button>
                          <span className="font-bold text-white">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQty(item.id, 1)}
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
              )
            ) : (
              <form id="checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-5 text-xs">

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
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">WhatsApp / Telefone</label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                </div>

                {/* Endereço de Entrega */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pizza-gold text-pizza-black flex items-center justify-center text-xs">2</span>
                    Endereço de Entrega
                  </h3>

                  {/* Seletor de Região/Bairro atendido */}
                  <div>
                    <label className="text-zinc-400 block mb-1">Bairro / Região</label>
                    <select
                      value={isOutsideArea ? 'outside' : selectedRegion?.id}
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
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
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
                        value={cep}
                        onChange={(e) => handleCepLookup(e.target.value)}
                        placeholder="Ex: 01001-000"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold font-mono"
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
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Nome da rua"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Número</label>
                      <input
                        type="text"
                        required
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="123"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-zinc-400 block mb-1">Complemento (Apto/Bloco)</label>
                      <input
                        type="text"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        placeholder="Ex: Apto 42"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Ponto de Referência</label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ex: Próximo à padaria"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-pizza-gold"
                      />
                    </div>
                  </div>
                </div>

                {/* Forma de Pagamento */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pizza-gold text-pizza-black flex items-center justify-center text-xs">3</span>
                    Forma de Pagamento
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix_manual')}
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
                      onClick={() => setPaymentMethod('cash_delivery')}
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
                      onClick={() => setPaymentMethod('card_terminal')}
                      className={`p-3 rounded-xl border text-center transition ${paymentMethod === 'card_terminal'
                          ? 'bg-pizza-card/40 border-pizza-gold text-white'
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                    >
                      <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                      <span className="font-semibold block text-[11px]">Cartão</span>
                    </button>
                  </div>

                  {paymentMethod === 'pix_manual' && (
                    <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-2">
                      <p className="font-semibold text-zinc-200">Chave Pix CNPJ:</p>
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-800 font-mono text-zinc-300 select-all">
                        12.345.678/0001-90
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Beneficiário: Bella Pizza Testes Ltda • Banco Central
                      </p>
                      <div className="text-[10px] text-amber-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        O pedido entrará na cozinha após conferência manual do comprovante.
                      </div>
                    </div>
                  )}

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
                            value={changeFor}
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
                      O entregador levará a maquininha (Débito, Crédito ou Refeição) até a sua porta.
                    </div>
                  )}

                  <div>
                    <label className="text-zinc-400 block mb-1">Observações do Pedido (Opcional)</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Tocar o interfone 2 vezes, retirar cebola..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-pizza-gold"
                    />
                  </div>
                </div>

              </form>
            )}

          </div>

          {/* Rodapé Fixo */}
          {items.length > 0 && (
            <div className="p-5 border-t border-zinc-800 bg-zinc-900/90 space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal:</span>
                  <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Taxa de Entrega:</span>
                  <span>{deliveryFee === 0 ? 'A calcular' : `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-zinc-800">
                  <span>Total:</span>
                  <span className="text-pizza-gold">R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>

              {step === 'cart' ? (
                <button
                  type="button"
                  onClick={() => setStep('checkout')}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 text-pizza-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-gold-sm transition active:scale-[0.98]"
                >
                  <span>Avançar para Entrega</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('cart')}
                    className="py-3.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    form="checkout-form"
                    disabled={isSubmitting || isOutsideArea}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 disabled:opacity-50 text-pizza-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-gold-sm transition active:scale-[0.98]"
                  >
                    {isSubmitting ? 'Enviando Pedido...' : 'Confirmar e Enviar Pedido'}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
