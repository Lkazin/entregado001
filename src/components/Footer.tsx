import React from 'react';
import { Flame, ShieldCheck, MapPin, Clock, Phone, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-pizza-black border-t border-pizza-border text-zinc-400 text-xs relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pizza-gold/40 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Coluna 1: Sobre */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pizza-gold-dark to-pizza-gold flex items-center justify-center text-pizza-black shadow-gold-sm">
                <Flame className="w-6 h-6 text-pizza-black" />
              </div>
              <span className="text-lg font-serif font-bold text-white">BELLA PIZZA</span>
            </div>
            <p className="text-zinc-500 leading-relaxed font-light">
              Tradição italiana, fermentação lenta e forno a lenha. Monte combinações exclusivas de até 4 sabores em uma pizza com código seguro de entrega.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-pizza-card border border-pizza-gold/20 text-[10px] text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-pizza-gold" />
              Ambiente Oficial de Homologação NovaesWeb
            </div>
          </div>

          {/* Coluna 2: Horários */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-white text-base">Horário de Funcionamento</h4>
            <div className="space-y-1.5 text-zinc-400">
              <p className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-pizza-gold" />
                <span>Terça a Domingo: 18h00 às 23h30</span>
              </p>
              <p className="text-zinc-600 pl-5.5">Segunda-feira: Fechado para descanso</p>
              <p className="text-zinc-500 text-[11px] pt-1 font-light">
                Pedidos imediatos • Não trabalhamos com agendamento prévio.
              </p>
            </div>
          </div>

          {/* Coluna 3: Localização e Contato */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-white text-base">Atendimento & Endereço</h4>
            <div className="space-y-1.5 text-zinc-400">
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-pizza-gold" />
                <span>Rua das Pizzas, 100 - Jardins, SP</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-pizza-gold" />
                <span>(11) 98765-4321 • WhatsApp Loja</span>
              </p>
              <p className="text-zinc-500 text-[11px] pt-1 font-light">
                Atendemos Centro, Jardins, Bela Vista, Vila Mariana, Pinheiros e Perdizes.
              </p>
            </div>
          </div>

          {/* Coluna 4: Segurança */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-white text-base">Segurança na Entrega</h4>
            <p className="text-zinc-500 leading-relaxed font-light">
              Cada pedido possui um código PIN exclusivo gerado para você. Entregue o código ao motoboy apenas na entrega para concluir a corrida com segurança.
            </p>
            <p className="text-zinc-600 text-[11px] font-light">
              Pagamentos Pix manuais conferidos antes do envio. Pagamentos na maquininha processados presencialmente.
            </p>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-pizza-border text-center text-zinc-600 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-light">© 2026 Bella Pizza • Desenvolvido com padrão NovaesWeb de Engenharia.</p>
          <p className="text-[11px] text-zinc-600 font-light">
            Ambiente Isolado de Testes • Supabase Test Database
          </p>
        </div>
      </div>
    </footer>
  );
}
