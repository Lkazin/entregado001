'use client';

import React from 'react';
import Link from 'next/link';
import { Flame, Sparkles, Cake, Wine, ArrowRight } from 'lucide-react';

const CATEGORIES = [
  {
    slug: 'tradicional',
    title: 'Tradicionais',
    desc: 'Os clássicos que nunca saem de moda. Calabresa, Mussarela, Margherita e mais.',
    icon: Flame,
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80',
    count: '6 sabores',
  },
  {
    slug: 'especial',
    title: 'Especiais do Chef',
    desc: 'Combinações exclusivas criadas pelo nosso chef com ingredientes premium.',
    icon: Sparkles,
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80',
    count: '6 sabores',
  },
  {
    slug: 'doce',
    title: 'Pizzas Doces',
    desc: 'Sobremesas em forma de pizza. Chocolate, Morango, Banana e mais.',
    icon: Cake,
    image: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600&auto=format&fit=crop&q=80',
    count: '4 sabores',
  },
  {
    slug: 'bebidas',
    title: 'Bebidas Geladas',
    desc: 'Refrigerantes, sucos e cervejas para acompanhar sua pizza.',
    icon: Wine,
    image: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&auto=format&fit=crop&q=80',
    count: '5 opções',
  },
];

export default function CategoryGrid() {
  return (
    <section id="categorias" className="py-16 bg-pizza-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="text-xs font-bold text-pizza-gold uppercase tracking-wider">Navegue por</span>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight mt-2">
            Categorias do Cardápio
          </h2>
          <p className="mt-2 text-zinc-400 text-sm font-light">
            Escolha uma categoria e explore todos os sabores. Clique para ver a página completa.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.slug}
                href={`/cardapio/${cat.slug}`}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-pizza-border hover:border-pizza-gold/50 transition duration-300 shadow-luxury"
              >
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-pizza-black via-pizza-black/60 to-pizza-black/20" />
                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
                  <div className="w-10 h-10 rounded-xl bg-pizza-gold/20 backdrop-blur border border-pizza-gold/40 flex items-center justify-center mb-3 group-hover:bg-pizza-gold group-hover:scale-110 transition duration-300">
                    <Icon className="w-5 h-5 text-pizza-gold group-hover:text-pizza-black transition" />
                  </div>
                  <h3 className="font-serif font-bold text-white text-lg sm:text-xl leading-tight">{cat.title}</h3>
                  <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 line-clamp-2 font-light">{cat.desc}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] font-bold text-pizza-gold uppercase tracking-wider">{cat.count}</span>
                    <ArrowRight className="w-4 h-4 text-pizza-gold group-hover:translate-x-1 transition" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
