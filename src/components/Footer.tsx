import React from 'react';
import { Flame, ShieldCheck, MapPin, Clock, Phone, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-zinc-950 border-t border-zinc-900 text-zinc-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Coluna 1: Sobre */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white">
                <Flame className="w-5 h-5 text-amber-300" />
              </div>
              <span className="text-base font-extrabold text-white">BELLA PIZZA</span>
            </div>
            <p className="text-zinc-500 leading-relaxed">
              Tradição italiana, fermentação lenta e forno a lenha. Monte combinações exclusivas de até 4 sabores em uma pizza com código seguro de entrega.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Ambiente Oficial de Homologação NovaesWeb
            </div>
          </div>

          {/* Coluna 2: Horários */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-sm">Horário de Funcionamento</h4>
            <div className="space-y-1 text-zinc-400">
              <p className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-red-500" />
                <span>Terça a Domingo: 18h00 às 23h30</span>
              </p>
              <p className="text-zinc-600 pl-5.5">Segunda-feira: Fechado para descanso</p>
              <p className="text-zinc-500 text-[11px] pt-1">
                Pedidos imediatos • Não trabalhamos com agendamento prévio.
              </p>
            </div>
          </div>

          {/* Coluna 3: Localização e Contato */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-sm">Atendimento & Endereço</h4>
            <div className="space-y-1 text-zinc-400">
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                <span>Rua das Pizzas, 100 - Jardins, SP</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-red-500" />
                <span>(11) 98765-4321 • WhatsApp Loja</span>
              </p>
              <p className="text-zinc-500 text-[11px] pt-1">
                Atendemos Centro, Jardins, Bela Vista, Vila Mariana, Pinheiros e Perdizes.
              </p>
            </div>
          </div>

          {/* Coluna 4: Informações de Segurança */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-sm">Segurança na Entrega</h4>
            <p className="text-zinc-500 leading-relaxed">
              Cada pedido possui um código PIN exclusivo gerado para você. Entregue o código ao motoboy apenas na entrega para concluir a corrida com segurança.
            </p>
            <p className="text-zinc-600 text-[11px]">
              Pagamentos Pix manuais conferidos antes do envio. Pagamentos na maquininha processados presencialmente.
            </p>
          </div>

        </div>

        <div className="mt-10 pt-6 border-t border-zinc-900 text-center text-zinc-600 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Bella Pizza • Desenvolvido com padrão NovaesWeb de Engenharia.</p>
          <p className="text-[11px] text-zinc-600">
            Ambiente Isolado de Testes • Supabase Test Database
          </p>
        </div>
      </div>
    </footer>
  );
}
