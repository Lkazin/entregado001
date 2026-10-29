'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import PizzaBuilder from '@/components/PizzaBuilder';
import CatalogSection from '@/components/CatalogSection';
import CartCheckoutDrawer from '@/components/CartCheckoutDrawer';
import Footer from '@/components/Footer';
import { useRouter } from 'next/navigation';
import { PizzaFlavorMock } from '@/lib/constants';
import { CheckCircle2, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<any | null>(null);

  // Adicionar pizza montada ao carrinho
  const handleAddToCart = (item: any) => {
    setCartItems(prev => [...prev, item]);
    setIsCartOpen(true);
  };

  // Adicionar bebida diretamente
  const handleAddDrink = (drink: any) => {
    const existing = cartItems.find(i => i.id === drink.id);
    if (existing) {
      setCartItems(cartItems.map(i => i.id === drink.id ? { ...i, quantity: i.quantity + 1, totalPrice: (i.quantity + 1) * i.unitPrice } : i));
    } else {
      setCartItems(prev => [
        ...prev,
        {
          id: drink.id,
          type: 'drink',
          name: drink.name,
          quantity: 1,
          unitPrice: drink.price,
          totalPrice: drink.price
        }
      ]);
    }
    setIsCartOpen(true);
  };

  // Remover item
  const handleRemoveItem = (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  };

  // Atualizar quantidade
  const handleUpdateQty = (id: string, delta: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return {
          ...item,
          quantity: newQty,
          totalPrice: newQty * item.unitPrice
        };
      }
      return item;
    }));
  };

  // Pedido criado com sucesso
  const handleOrderSuccess = (orderData: any) => {
    setCartItems([]);
    setIsCartOpen(false);
    setLastCreatedOrder(orderData);
  };

  const cartTotal = cartItems.reduce((acc, item) => acc + item.totalPrice, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <Navbar
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        cartTotal={cartTotal}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1">
        <Hero />
        <PizzaBuilder onAddToCart={handleAddToCart} />
        <CatalogSection
          onSelectFlavorForBuilder={(flavor: PizzaFlavorMock) => {
            // Rola suavemente até o montador
            const el = document.getElementById('montar-pizza');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onAddDrink={handleAddDrink}
        />
      </main>

      <Footer />

      {/* Drawer do Carrinho e Checkout */}
      <CartCheckoutDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={handleRemoveItem}
        onUpdateQty={handleUpdateQty}
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Modal de Confirmação do Pedido */}
      {lastCreatedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Pedido Recebido</span>
              <h3 className="text-2xl font-black text-white mt-1">Pedido #{lastCreatedOrder.orderNumber}</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Seu pedido foi encaminhado para a cozinha da Bella Pizza!
              </p>
            </div>

            {/* Código PIN de Entrega */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Código de Entrega (PIN):</span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-950 text-red-400 font-semibold border border-red-800/40">
                  Segredo
                </span>
              </div>
              <div className="text-center py-2 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-3xl font-black tracking-widest text-amber-400">
                {lastCreatedOrder.deliveryPin}
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                ⚠️ Guarde este código. Você deverá informá-lo ao entregador no momento em que a pizza chegar.
              </p>
            </div>

            <div className="text-xs text-zinc-400 text-left space-y-1 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/60">
              <p><span className="text-zinc-500">Destino:</span> {lastCreatedOrder.address.street}, {lastCreatedOrder.address.number} ({lastCreatedOrder.address.region})</p>
              <p><span className="text-zinc-500">Total:</span> <span className="text-white font-bold">R$ {lastCreatedOrder.total.toFixed(2).replace('.', ',')}</span></p>
              <p><span className="text-zinc-500">Pagamento:</span> {lastCreatedOrder.payment.method === 'pix_manual' ? 'Pix Manual (Aguardando conferência)' : lastCreatedOrder.payment.method === 'cash_delivery' ? 'Dinheiro na entrega' : 'Cartão na maquininha'}</p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href={`/pedido/${lastCreatedOrder.trackingToken}`}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition"
              >
                <span>Acompanhar Pedido ao Vivo</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={() => setLastCreatedOrder(null)}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
