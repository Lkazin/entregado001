import React from 'react';
import { Pizza, CreditCard, Bike, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: Pizza,
    num: '01',
    title: 'Monte sua Pizza',
    desc: 'Escolha o tamanho, combine até 4 sabores e adicione bordas recheadas no nosso montador interativo.',
  },
  {
    icon: CreditCard,
    num: '02',
    title: 'Pague com Segurança',
    desc: 'Pix, dinheiro ou cartão na entrega. Cada pedido gera um código PIN exclusivo para você.',
  },
  {
    icon: Bike,
    num: '03',
    title: 'Receba em Casa',
    desc: 'Acompanhe o pedido em tempo real e informe o PIN ao entregador para concluir com segurança.',
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 bg-pizza-card/40 border-y border-pizza-border relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pizza-gold/40 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold text-pizza-gold uppercase tracking-wider">Simples e rápido</span>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight mt-2">
            Como Funciona
          </h2>
          <p className="mt-2 text-zinc-400 text-sm font-light">
            Em apenas 3 passos você tem uma pizza artesanal quentinha na sua porta.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Linha conectora (desktop) */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-pizza-gold/0 via-pizza-gold/40 to-pizza-gold/0" />

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.num} className="relative text-center group">
                <div className="relative mx-auto w-24 h-24 rounded-2xl bg-pizza-card border border-pizza-border flex items-center justify-center mb-6 group-hover:border-pizza-gold/50 group-hover:shadow-gold-sm transition duration-300">
                  <Icon className="w-10 h-10 text-pizza-gold" />
                  <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light text-pizza-black text-xs font-black flex items-center justify-center shadow-gold-sm">
                    {step.num}
                  </span>
                </div>
                <h3 className="font-serif font-bold text-white text-xl mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 font-light leading-relaxed max-w-xs mx-auto">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden md:block absolute top-10 -right-4 w-5 h-5 text-pizza-gold/40" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
