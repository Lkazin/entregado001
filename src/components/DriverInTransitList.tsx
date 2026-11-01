'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Bike, Navigation, MapPin, Phone, RefreshCw, CheckCircle2, Clock, AlertTriangle, User } from 'lucide-react';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-500 animate-pulse">
      Carregando mapa logístico...
    </div>
  )
});

interface DriverInTransit {
  driverId: string;
  name: string;
  phone: string | null;
  vehiclePlate: string | null;
  presence: string;
  activeOrdersCount: number;
  location: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    updatedAt?: string;
  } | null;
  assignments: Array<{
    id: string;
    orderId?: string;
    orderNumber: number | string;
    address: string;
    region: string;
    status: string;
  }>;
}

interface DriverInTransitListProps {
  focusedDriverId?: string | null;
  onOpenOrderDetail?: (orderIdOrNum: string) => void;
}

export default function DriverInTransitList({ focusedDriverId, onOpenOrderDetail }: DriverInTransitListProps = {}) {
  const [drivers, setDrivers] = useState<DriverInTransit[]>([]);
  const [storeLocation, setStoreLocation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDriverRoute, setSelectedDriverRoute] = useState<[number, number][]>([]);

  useEffect(() => {
    if (focusedDriverId) {
      const matched = drivers.find(d => d.driverId === focusedDriverId);
      if (matched) {
        handleSelectDriver(matched);
      } else {
        setSelectedDriverId(focusedDriverId);
      }
    }
  }, [focusedDriverId, drivers]);

  const fetchTracking = async () => {
    try {
      const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem('novaesweb_admin_token') : null;
      const res = await fetch('/api/v1/logistics/tracking-store-drivers', {
        headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setDrivers(data.driversInTransit || []);
          setStoreLocation(data.store);
        }
      }
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 4000);
    return () => clearInterval(interval);
  }, []);

  // Quando seleciona um motoboy, busca a rota dele até a primeira entrega
  const handleSelectDriver = async (drv: DriverInTransit) => {
    setSelectedDriverId(drv.driverId);
    if (drv.location && drv.assignments && drv.assignments.length > 0 && storeLocation) {
      try {
        const geoRes = await fetch(`/api/v1/logistics/osrm-route?from=${drv.location.longitude},${drv.location.latitude}&to=${storeLocation.longitude + 0.01},${storeLocation.latitude + 0.01}`);
        if (geoRes.ok) {
          const rData = await geoRes.json().catch(() => null);
          if (rData && rData.coordinates) {
            setSelectedDriverRoute(rData.coordinates);
          }
        }
      } catch (e) {}
    } else {
      setSelectedDriverRoute([]);
    }
  };

  const selectedDriver = drivers.find(d => d.driverId === selectedDriverId) || drivers[0];

  return (
    <div className="space-y-6">
      
      {/* Topo: Estatísticas e Atualizar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-base text-white flex items-center gap-2">
            <Bike className="w-5 h-5 text-orange-500" />
            <span>Motoboys em Percurso & Rastreamento ao Vivo</span>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-700/60 text-orange-400 text-xs font-bold">
              {drivers.length} {drivers.length === 1 ? 'em rota' : 'em rota'}
            </span>
          </h3>
          <p className="text-xs text-zinc-400">
            Acompanhe o deslocamento real de cada motoboy pelo GPS do aplicativo com MapLibre GL e OSRM.
          </p>
        </div>

        <button
          onClick={fetchTracking}
          className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-bold text-zinc-300 flex items-center gap-1.5 self-start sm:self-auto transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />
          <span>Atualizar Posições</span>
        </button>
      </div>

      {/* Grid: Mapa Amplo e Lista de Entregadores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna 1 e 2: Mapa MapLibre GL Interativo */}
        <div className="lg:col-span-2 space-y-3">
          <TrackingMap
            height="440px"
            storeLocation={storeLocation ? {
              latitude: storeLocation.latitude,
              longitude: storeLocation.longitude,
              label: storeLocation.name || 'Bella Pizza'
            } : null}
            driverLocation={selectedDriver?.location ? {
              latitude: selectedDriver.location.latitude,
              longitude: selectedDriver.location.longitude,
              name: selectedDriver.name
            } : null}
            routeCoordinates={selectedDriverRoute}
          />

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
              <span>
                {selectedDriver ? `Focando em: ${selectedDriver.name} (${selectedDriver.vehiclePlate || 'Sem placa'})` : 'Pizzaria Bella Pizza'}
              </span>
            </div>
            {selectedDriver?.location?.updatedAt && (
              <span className="text-[11px] text-zinc-500 font-mono">
                GPS: {new Date(selectedDriver.location.updatedAt).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        {/* Coluna 3: Lista de Motoboys em Trânsito */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>Entregadores Ativos ({drivers.length})</span>
            <span className="text-[10px] text-zinc-500">Clique para focar no mapa</span>
          </h4>

          {drivers.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
                <Bike className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-zinc-300">Nenhum motoboy em rota no momento</p>
              <p className="text-[11px] text-zinc-500">
                Assim que um motoboy confirmar a retirada de pedidos no app, ele aparecerá aqui com rastreamento contínuo.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
              {drivers.map(drv => {
                const isSelected = drv.driverId === selectedDriver?.driverId;

                return (
                  <div
                    key={drv.driverId}
                    onClick={() => handleSelectDriver(drv)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-orange-950/30 border-orange-600/80 ring-1 ring-orange-500/30'
                        : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold text-xs">
                          🏍️
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs">{drv.name}</p>
                          <p className="text-[11px] text-zinc-400 font-mono">
                            {drv.vehiclePlate || 'Sem placa cadastrada'}
                          </p>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold">
                        {drv.activeOrdersCount} {drv.activeOrdersCount === 1 ? 'pedido' : 'pedidos'}
                      </span>
                    </div>

                    {/* Pedidos em entrega */}
                    {drv.assignments && drv.assignments.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-800/80 space-y-1">
                        {drv.assignments.map(asg => (
                          <div key={asg.id} className="flex items-center gap-1.5 text-[11px] text-zinc-300 truncate">
                            <span className="font-bold text-amber-400 font-mono">#{asg.orderNumber}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="truncate text-zinc-400">{asg.address}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ações Rápidas */}
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs">
                      {drv.location ? (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Transmitindo GPS Real
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Aguardando permissão de GPS
                        </span>
                      )}

                      {drv.phone && (
                        <a
                          href={`https://wa.me/55${drv.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60 hover:bg-emerald-900 text-emerald-300 text-[10px] font-bold flex items-center gap-1 transition"
                        >
                          <Phone className="w-3 h-3" />
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
