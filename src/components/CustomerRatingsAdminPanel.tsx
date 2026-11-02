'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Star,
  MessageSquare,
  Bike,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  User,
  ShoppingBag,
  Clock,
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface RatingItem {
  id: string;
  orderId: string;
  orderNumber: string | number;
  storeId: string;
  driverId: string | null;
  driverName: string | null;
  orderStars: number;
  driverStars: number | null;
  comment: string | null;
  createdAt: string;
}

interface DriverSummary {
  driverId: string;
  driverName: string;
  totalRatings: number;
  averageStars: number;
}

interface RatingsMetrics {
  totalRatings: number;
  averageOrderStars: number;
  averageDriverStars: number;
  totalComments: number;
}

interface CustomerRatingsAdminPanelProps {
  getHeaders: (extra?: Record<string, string>) => Record<string, string>;
}

export default function CustomerRatingsAdminPanel({ getHeaders }: CustomerRatingsAdminPanelProps) {
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [metrics, setMetrics] = useState<RatingsMetrics>({
    totalRatings: 0,
    averageOrderStars: 0,
    averageDriverStars: 0,
    totalComments: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [period, setPeriod] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const fetchRatings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (period !== 'all') params.set('period', period);
      if (selectedDriver !== 'all') params.set('driverId', selectedDriver);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/ratings?${params.toString()}`, {
        headers: getHeaders(),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar as avaliações dos clientes.');
      }

      const data = await res.json();
      if (data.success) {
        setRatings(data.ratings || []);
        setDrivers(data.drivers || []);
        setMetrics(
          data.metrics || {
            totalRatings: 0,
            averageOrderStars: 0,
            averageDriverStars: 0,
            totalComments: 0,
          }
        );
      } else {
        throw new Error(data.error || 'Erro ao carregar avaliações.');
      }
    } catch (err: any) {
      console.error('[CustomerRatingsAdminPanel]', err);
      setError(err?.message || 'Não foi possível carregar as avaliações no momento.');
    } finally {
      setLoading(false);
    }
  }, [getHeaders, period, selectedDriver, search]);

  useEffect(() => {
    void fetchRatings();
  }, [fetchRatings]);

  // Função auxiliar para renderizar estrelas visuais
  const renderStars = (count: number, max = 5) => {
    return (
      <div className="inline-flex items-center gap-0.5" aria-label={`${count} de ${max} estrelas`}>
        {Array.from({ length: max }).map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < count ? 'fill-amber-400 text-amber-400' : 'text-zinc-600 stroke-zinc-600'
            }`}
          />
        ))}
        <span className="ml-1 text-xs font-bold text-amber-400">{count}★</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span>Avaliações dos Clientes</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Feedback dos clientes sobre pedido, atendimento e entregadores da loja
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchRatings()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition border border-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-pizza-gold' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Cards de Métricas Gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-1">
            <span>Total de Avaliações</span>
            <ShoppingBag className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalRatings}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Registradas para esta loja</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-1">
            <span>Pedido e Atendimento</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-400">
              {metrics.averageOrderStars > 0 ? metrics.averageOrderStars.toFixed(1) : '—'}
            </span>
            {metrics.averageOrderStars > 0 && <span className="text-xs text-zinc-500">/ 5.0</span>}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Média geral da loja</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-1">
            <span>Média dos Entregadores</span>
            <Bike className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400">
              {metrics.averageDriverStars > 0 ? metrics.averageDriverStars.toFixed(1) : '—'}
            </span>
            {metrics.averageDriverStars > 0 && <span className="text-xs text-zinc-500">/ 5.0</span>}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Avaliações dos motoboys</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-1">
            <span>Comentários Escritos</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalComments}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Comentários de clientes</p>
        </div>
      </div>

      {/* Seção de Desempenho e Média por Entregador */}
      {drivers.length > 0 && (
        <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Média de Avaliações por Entregador</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drivers.map((drv) => {
              const isSelected = selectedDriver === drv.driverId || selectedDriver === drv.driverName;
              return (
                <button
                  key={drv.driverId}
                  type="button"
                  onClick={() => setSelectedDriver(isSelected ? 'all' : drv.driverId)}
                  className={`p-3.5 rounded-xl border text-left transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <Bike className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{drv.driverName}</span>
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {drv.totalRatings} avaliação{drv.totalRatings !== 1 ? 'ões' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-black text-amber-400">
                      {drv.averageStars > 0 ? drv.averageStars.toFixed(1) : '—'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-zinc-900/70 p-4 rounded-2xl border border-zinc-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Filtro Período */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">Todo o período</option>
              <option value="today" className="bg-zinc-900">Hoje</option>
              <option value="7d" className="bg-zinc-900">Últimos 7 dias</option>
              <option value="30d" className="bg-zinc-900">Últimos 30 dias</option>
            </select>
          </div>

          {/* Filtro Motoboy */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800">
            <Bike className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[160px] truncate"
            >
              <option value="all" className="bg-zinc-900">Todos os motoboys</option>
              {drivers.map((d) => (
                <option key={d.driverId} value={d.driverId} className="bg-zinc-900">
                  {d.driverName}
                </option>
              ))}
            </select>
          </div>

          {/* Limpar filtros */}
          {(period !== 'all' || selectedDriver !== 'all' || search.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setPeriod('all');
                setSelectedDriver('all');
                setSearch('');
              }}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold px-2 py-1"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Campo de Busca por Pedido ou Palavra */}
        <div className="relative md:w-72">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pedido ou comentário..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pizza-gold"
          />
        </div>
      </div>

      {/* Lista de Avaliações */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-pizza-gold" />
          <span>Carregando avaliações dos clientes...</span>
        </div>
      ) : ratings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800 text-zinc-400 space-y-2">
          <Star className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-300">Nenhuma avaliação encontrada</p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {period !== 'all' || selectedDriver !== 'all' || search
              ? 'Tente ajustar os filtros ou a busca acima.'
              : 'As avaliações aparecerão aqui assim que os clientes concluírem o feedback dos pedidos.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ratings.map((item) => {
            const formattedDate = new Date(item.createdAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });
            const formattedTime = new Date(item.createdAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition space-y-3.5 shadow-sm"
              >
                {/* Linha 1: Pedido e Data da Avaliação */}
                <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3">
                  <div>
                    <span className="text-xs font-mono font-black text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg inline-block">
                      Pedido #{String(item.orderNumber).replace('#', '')}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{formattedDate} às {formattedTime}</span>
                    </p>
                  </div>

                  {item.driverName && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-950/30 border border-emerald-800/30 px-2.5 py-1 rounded-xl">
                      <Bike className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[120px]">{item.driverName}</span>
                    </div>
                  )}
                </div>

                {/* Linha 2: Estrelas (Pedido e Motoboy) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/70">
                    <span className="text-[11px] text-zinc-400 block font-medium mb-1">
                      Pedido & Atendimento:
                    </span>
                    {renderStars(item.orderStars)}
                  </div>

                  {item.driverStars !== null ? (
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/70">
                      <span className="text-[11px] text-zinc-400 block font-medium mb-1">
                        Entrega / Motoboy:
                      </span>
                      {renderStars(item.driverStars)}
                    </div>
                  ) : (
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/70 flex items-center text-zinc-500 text-[11px]">
                      <span>Retirada / Sem entregador</span>
                    </div>
                  )}
                </div>

                {/* Linha 3: Comentário do Cliente (Sempre visível diretamente) */}
                {item.comment ? (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
                      <MessageSquare className="w-3 h-3 text-purple-400" />
                      <span>Comentário do Cliente:</span>
                    </div>
                    <p className="italic text-zinc-300 leading-relaxed font-normal whitespace-pre-line">
                      &ldquo;{item.comment}&rdquo;
                    </p>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-600 italic">
                    Nenhum comentário por escrito enviado.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
