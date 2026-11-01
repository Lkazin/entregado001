'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PIZZA_FLAVORS, DRINKS } from '@/lib/constants';
import { ArrowLeft, Plus, Flame, Sparkles, Cake, Wine, Star } from 'lucide-react';

const CATEGORY_META: Record<string, { title: string; desc: string; icon: any }> = {
  tradicional: { title: 'Tradicionais', desc: 'Os clássicos que nunca saem de moda.', icon: Flame },
  especial: { title: 'Especiais do Chef', desc: 'Combinações exclusivas com ingredientes premium.', icon: Sparkles },
  doce: { title: 'Pizzas Doces', desc: 'Sobremesas em forma de pizza.', icon: Cake },
  bebidas: { title: 'Bebidas Geladas', desc: 'Para acompanhar sua pizza.', icon: Wine },
};

export default function CategoryPage() {
  const params = useParams();
  const slug = (params?.slug as string) || 'tradicional';
  const meta = CATEGORY_META[slug] || CATEGORY_META.tradicional;
  const Icon = meta.icon;

  const isDrinks = slug === 'bebidas';
  const flavors = isDrinks ? [] : PIZZA_FLAVORS.filter((f) => f.category === slug);
  const drinks = isDrinks ? DRINKS : [];

  return (
    <div className="min-h-screen bg-pizza-black text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-pizza-border">
        <div className="absolute inset-0 bg-gradient-to-b from-pizza-gold/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10">
          <Link
            href="/#categorias"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-pizza-gold transition mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar às categorias
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-pizza-gold/10 border border-pizza-gold/30 flex items-center justify-center">
              <Icon className="w-7 h-7 text-pizza-gold" />
            </div>
            <div>
              <span className="text-xs font-bold text-pizza-gold uppercase tracking-wider">Categoria</span>
              <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white tracking-tight">{meta.title}</h1>
            </div>
          </div>
          <p className="mt-4 text-zinc-400 font-light max-w-2xl">{meta.desc}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {isDrinks ? `${drinks.length} opções disponíveis` : `${flavors.length} sabores disponíveis`}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isDrinks ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {drinks.map((drink) => (
              <div
                key={drink.id}
                className="p-5 rounded-2xl bg-pizza-card border border-pizza-border flex flex-col justify-between hover:border-pizza-gold/40 transition"
              >
                <div>
                  <h4 className="font-serif font-bold text-white text-base">{drink.name}</h4>
                  <p className="text-xs text-zinc-500 mt-1 font-light">{drink.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-pizza-border flex items-center justify-between">
                  <span className="font-bold text-pizza-gold">R$ {drink.price.toFixed(2).replace('.', ',')}</span>
                  <Link
                    href="/#montar-pizza"
                    className="p-2 rounded-lg bg-pizza-gold/10 hover:bg-pizza-gold text-pizza-gold hover:text-pizza-black transition"
                    title="Adicionar ao carrinho"
                  >
                    <Plus className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {flavors.map((flavor) => (
              <div
                key={flavor.id}
                className="bg-pizza-card border border-pizza-border rounded-2xl overflow-hidden hover:border-pizza-gold/40 transition-all duration-300 flex flex-col group shadow-luxury"
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={flavor.image}
                    alt={flavor.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                    {flavor.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pizza-black/80 backdrop-blur-md text-pizza-gold border border-pizza-gold/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-serif font-bold text-white text-lg group-hover:text-pizza-gold transition">
                      {flavor.name}
                    </h3>
                    <p className="text-zinc-400 text-xs mt-2 line-clamp-3 leading-relaxed font-light">
                      {flavor.description}
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-pizza-border flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-medium">A partir de</span>
                      <span className="text-base font-bold text-white">
                        R$ {flavor.prices.broto.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <Link
                      href="/#montar-pizza"
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light text-pizza-black text-xs font-bold transition flex items-center gap-1.5 shadow-gold-sm hover:brightness-110"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Montar
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/#montar-pizza"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 text-pizza-black font-extrabold text-base shadow-gold transition"
          >
            <span>Montar Minha Pizza</span>
            <Star className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
