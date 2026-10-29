import React from 'react';
import { Flame, Sparkles, ShieldCheck, ArrowRight, Award } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-8 pb-16 lg:py-24 bg-gradient-to-b from-zinc-950 via-zinc-900/40 to-zinc-950">
      
      {/* Luz ambiente de fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Texto e Chamada */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Forno a lenha aquecido a 450°C</span>
              <span className="text-zinc-600">•</span>
              <span className="text-amber-400 font-bold">Pizzaria Oficial de Testes</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.1]">
              A Verdadeira <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-600 to-amber-500">
                Pizza Artesanal
              </span> <br />
              com até 4 Sabores!
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Massa de fermentação natural de 48h, molho de tomates italianos San Marzano e queijos nobres selecionados. Monte a sua combinação perfeita e acompanhe a entrega com código seguro.
            </p>

            {/* Destaques Rápidos */}
            <div className="grid grid-cols-3 gap-3 pt-2 max-w-lg mx-auto lg:mx-0">
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-center">
                <Flame className="w-5 h-5 mx-auto text-red-500 mb-1" />
                <span className="text-xs font-bold text-white block">Forno a Lenha</span>
                <span className="text-[10px] text-zinc-500">Massa Crocante</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-center">
                <Sparkles className="w-5 h-5 mx-auto text-amber-400 mb-1" />
                <span className="text-xs font-bold text-white block">Até 4 Sabores</span>
                <span className="text-[10px] text-zinc-500">Sem complicação</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-center">
                <ShieldCheck className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
                <span className="text-xs font-bold text-white block">Código PIN</span>
                <span className="text-[10px] text-zinc-500">Entrega 100% Segura</span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <a
                href="#montar-pizza"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-base flex items-center justify-center gap-3 shadow-xl shadow-red-600/30 transition duration-150"
              >
                <span>Montar Minha Pizza</span>
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="#cardapio"
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-semibold text-base border border-zinc-800 transition duration-150 text-center"
              >
                Ver Todas as Pizzas
              </a>
            </div>

          </div>

          {/* Imagem em Destaque com Efeito de Card Flutuante */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              
              {/* Moldura da Pizza */}
              <div className="relative rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-900 group">
                <img
                  src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&auto=format&fit=crop&q=80"
                  alt="Pizza Napolitana Assada a Lenha"
                  className="w-full h-[380px] sm:h-[450px] object-cover group-hover:scale-105 transition duration-500"
                />
                
                {/* Gradiente de sobreposição */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-80" />

                {/* Badge Flutuante no Card */}
                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider">Mais Pedida da Semana</span>
                      <h3 className="font-extrabold text-white text-base">Pizza Família 4 Sabores</h3>
                      <p className="text-xs text-zinc-400">Calabresa, Quatro Queijos, Costela e Frango c/ Catupiry</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500 line-through">R$ 115,00</span>
                      <p className="text-lg font-black text-amber-400">R$ 96,00</p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
