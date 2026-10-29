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
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80">
      
      {/* Barra de Aviso Superior */}
      <div className="bg-red-950/60 border-b border-red-900/40 text-xs py-1.5 px-4 text-center text-red-200 flex items-center justify-center gap-4">
        <span className="flex items-center gap-1.5 font-medium">
          <Clock className="w-3.5 h-3.5 text-red-400" />
          Aberto hoje das 18:00 às 23:30 • Entrega expressa na sua porta
        </span>
        <span className="hidden sm:inline text-zinc-600">|</span>
        <span className="hidden sm:flex items-center gap-1 text-zinc-300">
          <Phone className="w-3 h-3 text-red-400" />
          (11) 98765-4321
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logotipo da Pizzaria */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center text-white shadow-lg shadow-red-600/30 group-hover:scale-105 transition duration-200">
            <Flame className="w-7 h-7 text-amber-300 fill-amber-300/30" />
          </div>
          <div>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white block leading-none">
              BELLA <span className="text-red-500">PIZZA</span>
            </span>
            <span className="text-[10px] tracking-widest text-zinc-400 uppercase font-semibold block mt-0.5">
              Forno a Lenha Artesanal
            </span>
          </div>
        </Link>

        {/* Links Centrais */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-zinc-300">
          <a href="#cardapio" className="hover:text-red-400 transition">
            Cardápio
          </a>
          <a href="#montar-pizza" className="hover:text-red-400 transition flex items-center gap-1.5 text-amber-400">
            <span>Monte até 4 Sabores</span>
          </a>
          <a href="#bebidas" className="hover:text-red-400 transition">
            Bebidas
          </a>
          <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
            <LayoutDashboard className="w-3.5 h-3.5" />
            Painel Lojista
          </Link>
        </nav>

        {/* Botão do Carrinho */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenCart}
            className="flex items-center gap-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-red-600/30 transition duration-150"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-red-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-bounce">
                  {cartCount}
                </span>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-[10px] text-red-200 block uppercase tracking-wider leading-none">Meu Pedido</span>
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
