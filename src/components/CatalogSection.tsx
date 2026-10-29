'use client';

import React, { useState } from 'react';
import { PIZZA_FLAVORS, DRINKS, PizzaFlavorMock } from '@/lib/constants';
import { Plus, Flame, Wine, Sparkles } from 'lucide-react';

interface CatalogSectionProps {
  onSelectFlavorForBuilder: (flavor: PizzaFlavorMock) => void;
  onAddDrink: (drink: any) => void;
}

export default function CatalogSection({ onSelectFlavorForBuilder, onAddDrink }: CatalogSectionProps) {
  const [activeTab, setActiveTab] = useState<'todos' | 'tradicional' | 'especial' | 'doce'>('todos');

  const filteredFlavors = PIZZA_FLAVORS.filter(flavor => {
    if (activeTab === 'todos') return true;
    return flavor.category === activeTab;
  });

  return (
    <section id="cardapio" className="py-16 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Cabeçalho do Cardápio */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Nossos Sabores Artesanais
          </h2>
          <p className="mt-2 text-zinc-400 text-sm">
            Clique em qualquer sabor para personalizar tamanho, bordas e combinar com outros sabores no montador.
          </p>

          {/* Abas de Categoria */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {[
              { id: 'todos', label: 'Todos os Sabores' },
              { id: 'tradicional', label: 'Tradicionais' },
              { id: 'especial', label: 'Especiais do Chef' },
              { id: 'doce', label: 'Pizzas Doces' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 ${
                  activeTab === tab.id
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grade de Sabores de Pizza */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {filteredFlavors.map((flavor) => (
            <div
              key={flavor.id}
              className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-300 flex flex-col group shadow-lg"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={flavor.image}
                  alt={flavor.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
                <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  {flavor.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-950/80 backdrop-blur-md text-amber-300 border border-amber-500/30">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-white text-base group-hover:text-red-400 transition">
                    {flavor.name}
                  </h3>
                  <p className="text-zinc-400 text-xs mt-2 line-clamp-2 leading-relaxed">
                    {flavor.description}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase font-medium">A partir de</span>
                    <span className="text-base font-black text-white">
                      R$ {flavor.prices.broto.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <a
                    href="#montar-pizza"
                    onClick={() => onSelectFlavorForBuilder(flavor)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-red-600 text-zinc-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Montar Pizza
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SEÇÃO DE BEBIDAS */}
        <div id="bebidas" className="pt-10 border-t border-zinc-900">
          <div className="text-center max-w-xl mx-auto mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-800/40 text-blue-400 text-xs font-semibold mb-2">
              <Wine className="w-3.5 h-3.5" />
              Bebidas Geladas
            </div>
            <h3 className="text-2xl font-bold text-white">Para Acompanhar sua Pizza</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {DRINKS.map((drink) => (
              <div
                key={drink.id}
                className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition"
              >
                <div>
                  <h4 className="font-bold text-sm text-white">{drink.name}</h4>
                  <p className="text-[11px] text-zinc-500 mt-1">{drink.desc}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="font-bold text-sm text-amber-400">
                    R$ {drink.price.toFixed(2).replace('.', ',')}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddDrink(drink)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition"
                    title="Adicionar ao carrinho"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
