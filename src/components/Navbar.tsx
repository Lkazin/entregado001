'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, Clock, Phone, ShieldCheck, Flame, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
}

export default function Navbar({ cartCount, cartTotal, onOpenCart }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-pizza-black/80 backdrop-blur-xl border-b border-pizza-border">
      {/* Barra de Aviso Superior */}
      <div className="bg-gradient-to-r from-pizza-red-dark/40 via-pizza-red/20 to-pizza-red-dark/40 border-b border-pizza-gold/10 text-xs py-2 px-4 text-center text-zinc-200 flex items-center justify-center gap-4">
        <span className="flex items-center gap-1.5 font-medium tracking-wide">
          <Clock className="w-3.5 h-3.5 text-pizza-gold" />
          Aberto hoje das 18:00 às 23:30 • Entrega expressa na sua porta
        </span>
        <span className="hidden sm:inline text-pizza-border">|</span>
        <span className="hidden sm:flex items-center gap-1 text-zinc-300">
          <Phone className="w-3 h-3 text-pizza-gold" />
          (11) 98765-4321
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logotipo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pizza-gold via-pizza-gold-dark to-pizza-black flex items-center justify-center text-white shadow-gold-sm group-hover:scale-105 transition duration-300 border border-pizza-gold/30">
            <Flame className="w-7 h-7 text-pizza-black fill-pizza-black/20" />
          </div>
          <div>
            <span className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-white block leading-none">
              BELLA <span className="text-gold-gradient">PIZZA</span>
            </span>
            <span className="text-[10px] tracking-[0.3em] text-pizza-gold/70 uppercase font-semibold block mt-1">
              Forno a Lenha Artesanal
            </span>
          </div>
        </Link>

        {/* Links Centrais */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-300">
          <a href="#cardapio" className="hover:text-pizza-gold transition relative after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-pizza-gold hover:after:w-full after:transition-all">
            Cardápio
          </a>
          <a href="#montar-pizza" className="hover:text-pizza-gold transition flex items-center gap-1.5 text-pizza-gold/90">
            <span>Monte até 4 Sabores</span>
          </a>
          <a href="#bebidas" className="hover:text-pizza-gold transition relative after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-pizza-gold hover:after:w-full after:transition-all">
            Bebidas
          </a>
          <Link href="/admin" className="text-xs text-zinc-500 hover:text-pizza-gold transition flex items-center gap-1 bg-pizza-card px-3 py-1.5 rounded-lg border border-pizza-border hover:border-pizza-gold/40">
            <LayoutDashboard className="w-3.5 h-3.5" />
            Painel Lojista
          </Link>
        </nav>

        {/* Botão do Carrinho */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenCart}
            className="flex items-center gap-3 bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 active:scale-95 text-pizza-black px-5 py-2.5 rounded-xl font-bold text-sm shadow-gold transition duration-200"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-pizza-black text-pizza-gold text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-bounce border border-pizza-gold/40">
                  {cartCount}
                </span>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-[10px] text-pizza-black/70 block uppercase tracking-wider leading-none font-semibold">Meu Pedido</span>
              <span className="text-xs font-black">
                {cartTotal > 0 ? `R$ ${cartTotal.toFixed(2).replace('.', ',')}` : 'Carrinho'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
