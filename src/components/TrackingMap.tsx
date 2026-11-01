'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation } from 'lucide-react';

export interface MapPoint {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface TrackingMapProps {
  storeLocation?: MapPoint | null;
  destinationLocation?: MapPoint | null;
  driverLocation?: (MapPoint & { heading?: number | null; speed?: number | null; name?: string }) | null;
  routeCoordinates?: [number, number][]; // Array de [lng, lat]
  className?: string;
  height?: string;
  interactive?: boolean;
}

export default function TrackingMap({
  storeLocation,
  destinationLocation,
  driverLocation,
  routeCoordinates,
  className = '',
  height = '360px',
  interactive = true,
}: TrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const storeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFittedBoundsRef = useRef<boolean>(false);

  const [mapLoaded, setMapLoaded] = useState(false);

  // 1. Inicializa o Mapa MapLibre GL com tiles OpenStreetMap oficiais (100% livres, sem API Key)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLng =
      driverLocation?.longitude ||
      destinationLocation?.longitude ||
      storeLocation?.longitude ||
      -51.1781;
    const initialLat =
      driverLocation?.latitude ||
      destinationLocation?.latitude ||
      storeLocation?.latitude ||
      -29.9189;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [initialLng, initialLat],
      zoom: 13.5,
      interactive,
      attributionControl: false,
    });

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    }

    map.on('load', () => {
      setMapLoaded(true);
      map.resize();
    });

    mapRef.current = map;

    return () => {
      storeMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      driverMarkerRef.current?.remove();
      storeMarkerRef.current = null;
      destMarkerRef.current = null;
      driverMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Atualiza marcadores customizados HTML (Loja, Destino e Motoboy)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // --- Marcador da Loja (Pizzaria) ---
    if (
      storeLocation &&
      typeof storeLocation.longitude === 'number' &&
      typeof storeLocation.latitude === 'number'
    ) {
      if (!storeMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'store-marker-pin';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.innerHTML = `
          <div style="background:#dc2626;color:#ffffff;width:34px;height:34px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:18px;">
            🍕
          </div>
          <div style="font-size:10px;font-weight:800;background:rgba(24,24,27,0.92);color:#ffffff;padding:2px 6px;border-radius:6px;margin-top:2px;white-space:nowrap;border:1px solid rgba(255,255,255,0.2);">
            ${storeLocation.label || 'Bella Pizza'}
          </div>
        `;
        storeMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([storeLocation.longitude, storeLocation.latitude])
          .addTo(map);
      } else {
        storeMarkerRef.current.setLngLat([storeLocation.longitude, storeLocation.latitude]);
      }

      if (!driverLocation && !destinationLocation) {
        map.easeTo({
          center: [storeLocation.longitude, storeLocation.latitude],
          duration: 600,
        });
      }
    }

    // --- Marcador do Destino (Cliente) ---
    if (
      destinationLocation &&
      typeof destinationLocation.longitude === 'number' &&
      typeof destinationLocation.latitude === 'number'
    ) {
      if (!destMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'dest-marker-pin';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.innerHTML = `
          <div style="background:#059669;color:#ffffff;width:34px;height:34px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:18px;">
            📍
          </div>
          <div style="font-size:10px;font-weight:800;background:rgba(24,24,27,0.92);color:#34d399;padding:2px 6px;border-radius:6px;margin-top:2px;white-space:nowrap;border:1px solid rgba(52,211,153,0.3);max-width:160px;overflow:hidden;text-overflow:ellipsis;">
            ${destinationLocation.label || 'Seu Endereço'}
          </div>
        `;
        destMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([destinationLocation.longitude, destinationLocation.latitude])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([
          destinationLocation.longitude,
          destinationLocation.latitude,
        ]);
      }
    }

    // --- Marcador do Motoboy em Trânsito ---
    if (
      driverLocation &&
      typeof driverLocation.longitude === 'number' &&
      typeof driverLocation.latitude === 'number'
    ) {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'driver-marker-pin';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.innerHTML = `
          <div style="background:#ea580c;color:#ffffff;width:38px;height:38px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(234,88,12,0.65);display:flex;align-items:center;justify-content:center;font-size:20px;">
            🏍️
          </div>
          <div style="font-size:10px;font-weight:800;background:rgba(24,24,27,0.92);color:#fb923c;padding:2px 6px;border-radius:6px;margin-top:2px;white-space:nowrap;border:1px solid rgba(251,146,60,0.3);text-align:center;">
            ${driverLocation.name || 'Entregador'}
          </div>
        `;
        driverMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([driverLocation.longitude, driverLocation.latitude])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([driverLocation.longitude, driverLocation.latitude]);
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }
  }, [storeLocation, destinationLocation, driverLocation, mapLoaded]);

  // 3. Traçado da Linha de Rota OSRM na camada do mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const sourceId = 'route-source';
    const layerId = 'route-layer';

    if (routeCoordinates && routeCoordinates.length > 1) {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates,
        },
      };

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojson,
        });

        map.addLayer({
          id: `${layerId}-glow`,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#f97316',
            'line-width': 7,
            'line-opacity': 0.4,
          },
        });

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ea580c',
            'line-width': 4,
          },
        });
      }

      if (!hasFittedBoundsRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        routeCoordinates.forEach((coord) => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 55, maxZoom: 16 });
        hasFittedBoundsRef.current = true;
      }
    } else if (!hasFittedBoundsRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      let hasPoints = false;
      if (storeLocation) {
        bounds.extend([storeLocation.longitude, storeLocation.latitude]);
        hasPoints = true;
      }
      if (destinationLocation) {
        bounds.extend([destinationLocation.longitude, destinationLocation.latitude]);
        hasPoints = true;
      }
      if (driverLocation) {
        bounds.extend([driverLocation.longitude, driverLocation.latitude]);
        hasPoints = true;
      }

      if (hasPoints) {
        map.fitBounds(bounds, { padding: 55, maxZoom: 15 });
        hasFittedBoundsRef.current = true;
      }
    }
  }, [routeCoordinates, mapLoaded, storeLocation, destinationLocation, driverLocation]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-zinc-800 shadow-xl ${className}`}
      style={{ height }}
    >
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Badge Flutuante de Provedor & Tecnologia */}
      <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded-md bg-zinc-950/85 backdrop-blur-sm border border-zinc-800 text-[10px] text-zinc-400 flex items-center gap-1.5 pointer-events-none">
        <Navigation className="w-3 h-3 text-orange-400" />
        <span className="font-semibold text-zinc-300">MapLibre GL</span>
        <span className="text-zinc-600">•</span>
        <span>OpenStreetMap & OSRM</span>
      </div>
    </div>
  );
}
