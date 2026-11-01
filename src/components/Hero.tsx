import React from 'react';
import { Flame, Sparkles, ShieldCheck, ArrowRight, Award, Star } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-10 pb-20 lg:py-28 bg-pizza-black grain">
      {/* Luz ambiente de fundo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-pizza-gold/5 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-pizza-red/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Linha decorativa superior */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pizza-gold/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Texto e Chamada */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pizza-card border border-pizza-gold/20 text-xs font-semibold text-zinc-200 backdrop-blur">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Forno a lenha aquecido a 450°C</span>
              <span className="text-pizza-border">•</span>
              <span className="text-pizza-gold font-bold">Pizzaria de Testes Oficial</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-serif font-bold text-white tracking-tight leading-[1.05]">
              A Verdadeira <br />
              <span className="text-gold-gradient italic">
                Pizza Artesanal
              </span> <br />
              com até 4 Sabores!
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-light">
              Massa de fermentação natural de 48h, molho de tomates italianos San Marzano e queijos nobres selecionados. Monte a sua combinação perfeita e acompanhe a entrega com código seguro.
            </p>

            {/* Destaques Rápidos */}
            <div className="grid grid-cols-3 gap-4 pt-2 max-w-lg mx-auto lg:mx-0">
              {[
                { icon: Flame, title: 'Forno a Lenha', sub: 'Massa Crocante', color: 'text-pizza-gold' },
                { icon: Sparkles, title: 'Até 4 Sabores', sub: 'Sem complicação', color: 'text-pizza-gold-light' },
                { icon: ShieldCheck, title: 'Código PIN', sub: 'Entrega 100% Segura', color: 'text-emerald-400' },
              ].map((f, i) => (
                <div key={i} className="p-4 rounded-2xl bg-pizza-card/60 border border-pizza-border hover:border-pizza-gold/30 text-center transition duration-300 backdrop-blur">
                  <f.icon className={`w-6 h-6 mx-auto ${f.color} mb-2`} />
                  <span className="text-xs font-bold text-white block">{f.title}</span>
                  <span className="text-[10px] text-zinc-500">{f.sub}</span>
                </div>
              ))}
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <a
                href="#montar-pizza"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light hover:brightness-110 active:scale-95 text-pizza-black font-extrabold text-base flex items-center justify-center gap-3 shadow-gold transition duration-200"
              >
                <span>Montar Minha Pizza</span>
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="#cardapio"
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-transparent hover:bg-pizza-card text-zinc-200 hover:text-pizza-gold font-semibold text-base border border-pizza-border hover:border-pizza-gold/40 transition duration-200 text-center"
              >
                Ver Todas as Pizzas
              </a>
            </div>
          </div>

          {/* Imagem em Destaque */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none animate-float">
              <div className="relative rounded-3xl overflow-hidden border border-pizza-gold/20 shadow-luxury bg-pizza-card group">
                <img
                  src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&auto=format&fit=crop&q=80"
                  alt="Pizza Napolitana Assada a Lenha"
                  className="w-full h-[380px] sm:h-[450px] object-cover group-hover:scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-pizza-black via-pizza-black/30 to-transparent opacity-90" />

                {/* Badge Flutuante */}
                <div className="absolute bottom-6 left-6 right-6 p-5 rounded-2xl bg-pizza-card/90 backdrop-blur-md border border-pizza-gold/20 shadow-luxury">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-pizza-gold tracking-wider flex items-center gap-1">
                        <Star className="w-3 h-3 fill-pizza-gold" /> Mais Pedida da Semana
                      </span>
                      <h3 className="font-serif font-bold text-white text-lg mt-1">Pizza Família 4 Sabores</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">Calabresa, Quatro Queijos, Costela e Frango c/ Catupiry</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-zinc-500 line-through">R$ 115,00</span>
                      <p className="text-xl font-serif font-bold text-gold-gradient">R$ 96,00</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decoração de canto */}
              <div className="absolute -top-4 -right-4 w-24 h-24 border-t border-r border-pizza-gold/30 rounded-tr-3xl pointer-events-none" />
              <div className="absolute -bottom-4 -left-4 w-24 h-24 border-b border-l border-pizza-gold/30 rounded-bl-3xl pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
