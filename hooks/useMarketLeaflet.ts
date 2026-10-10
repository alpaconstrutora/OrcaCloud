import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {
  OpuraMarketCity,
  OpuraMarketListing,
  OpuraMarketNeighborhood,
  OpuraMarketNeighborhoodStats,
} from '../types';
import type { Ponto } from './useMarketVocacao';
import type { IndicadoresDoBairro } from '../utils/opuraMarketIndicadores';

/**
 * Texto que entra em HTML do Leaflet (tooltip, divIcon). Nome de bairro e
 * endereço podem vir de feed de terceiros (Fase 3): sem escapar, um feed
 * conseguiria injetar HTML na tela. O check-xss-sinks.sh não enxerga esse caso
 * porque quem interpreta a string é o Leaflet.
 */
export const escHtml = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export type CamadaMercado = 'preco' | 'saturacao' | 'concorrencia' | 'oportunidade';

interface OpcoesMapa {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** O contêiner já está no DOM (carga inicial terminou). */
  pronto: boolean;
  /** A aba do mapa está à vista. Escondido, o Leaflet mede 0×0. */
  visivel: boolean;
  cidadeAtual: OpuraMarketCity | null;
  neighborhoods: OpuraMarketNeighborhood[];
  listings: OpuraMarketListing[];
  statsPorBairro: Record<string, OpuraMarketNeighborhoodStats>;
  /** Saturação e Score calculados por organização (plano 2026-10-10, item 3). */
  indicadoresPorBairro: Record<string, IndicadoresDoBairro>;
  camada: CamadaMercado;
  terrainPin: Ponto | null;
  raioMetros: string;
  isDrawingPolygon: boolean;
  drawingPoints: [number, number][];
  polygonPoints: [number, number][] | null;
  onClique: (p: Ponto) => void;
}

/**
 * Mapa do ÒPURA Market (Fase 6.2 do plano 2026-10-07-opura-market-intelligence.md).
 *
 * Até a Fase 5 o mapa era destruído e recriado a cada troca de aba (o efeito de
 * criação dependia da aba ativa), e "Ver no Mapa" da tabela chamava setView num
 * mapa que ia ser jogado fora logo em seguida: não focava nada. Agora o mapa é
 * criado uma vez e fica escondido nas outras abas. Enquadrar a cidade ou focar um
 * anúncio com o mapa escondido vira pendência, aplicada quando ele reaparece.
 */
export function useMarketLeaflet(o: OpcoesMapa) {
  const mapRef = React.useRef<L.Map | null>(null);
  const camadaRef = React.useRef<L.FeatureGroup | null>(null);
  const [mapa, setMapa] = React.useState<L.Map | null>(null);

  const onCliqueRef = React.useRef(o.onClique);
  onCliqueRef.current = o.onClique;
  const visivelRef = React.useRef(o.visivel);
  visivelRef.current = o.visivel;

  const enquadrarPendente = React.useRef(false);
  const focoPendente = React.useRef<{ p: Ponto; zoom: number } | null>(null);
  const enquadrarRef = React.useRef<(map: L.Map) => void>(() => {});

  // Enquadra a cidade: os bairros com ponto, ou o centro marcado no cadastro de praça.
  enquadrarRef.current = (map: L.Map) => {
    const pontos: [number, number][] = o.neighborhoods
      .filter(n => n.centroidLat != null && n.centroidLng != null)
      .map(n => [n.centroidLat as number, n.centroidLng as number]);
    if (pontos.length >= 2) {
      map.fitBounds(L.latLngBounds(pontos).pad(0.25), { maxZoom: 15 });
    } else if (o.cidadeAtual?.centerLat != null && o.cidadeAtual?.centerLng != null) {
      map.setView([o.cidadeAtual.centerLat, o.cidadeAtual.centerLng], 14);
    } else if (pontos.length === 1) {
      map.setView(pontos[0], 15);
    }
  };

  const aplicarPendencias = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    if (enquadrarPendente.current) {
      enquadrarPendente.current = false;
      enquadrarRef.current(map);
    }
    if (focoPendente.current) {
      const { p, zoom } = focoPendente.current;
      focoPendente.current = null;
      map.setView([p.lat, p.lng], zoom);
    }
  }, []);

  /** Centraliza o mapa. Escondido, aplica quando a aba do mapa abrir. */
  const focar = React.useCallback((p: Ponto, zoom: number) => {
    focoPendente.current = { p, zoom };
    if (visivelRef.current) aplicarPendencias();
  }, [aplicarPendencias]);

  // Criação: uma vez, quando o contêiner existe.
  React.useEffect(() => {
    if (!o.pronto || !o.containerRef.current || mapRef.current) return;
    // Abre no centro do Brasil; o enquadramento leva à praça escolhida.
    const map = L.map(o.containerRef.current, { center: [-15.78, -47.93], zoom: 4, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    camadaRef.current = L.featureGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => onCliqueRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    setMapa(map);
    const t = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      camadaRef.current = null;
      setMapa(null);
    };
  }, [o.pronto, o.containerRef]);

  // Aba do mapa voltou: remede o contêiner e aplica o que ficou pendente.
  React.useEffect(() => {
    if (!o.visivel || !mapa) return;
    const id = requestAnimationFrame(aplicarPendencias);
    return () => cancelAnimationFrame(id);
  }, [o.visivel, mapa, aplicarPendencias]);

  // Trocou a cidade ou recarregou os bairros: enquadrar (agora ou ao reaparecer).
  React.useEffect(() => {
    if (!mapa) return;
    enquadrarPendente.current = true;
    if (visivelRef.current) aplicarPendencias();
  }, [mapa, o.cidadeAtual?.id, o.neighborhoods, aplicarPendencias]);

  // Marcadores e camadas.
  React.useEffect(() => {
    const grupo = camadaRef.current;
    if (!mapa || !grupo) return;
    grupo.clearLayers();

    // 1. Bairros. Sem indicador calculado o bairro fica cinza.
    const SEM_DADO = '#94A3B8';
    o.neighborhoods.forEach(bairro => {
      if (bairro.centroidLat == null || bairro.centroidLng == null) return;
      const st = o.statsPorBairro[bairro.id];
      const ind = o.indicadoresPorBairro[bairro.id];
      let cor = '#3B82F6';
      let opacidade = 0.25;
      if (o.camada === 'preco') {
        cor = st?.pricePerM2Avg == null ? SEM_DADO : '#3B82F6';
      } else if (o.camada === 'saturacao') {
        // Calculado na leitura, por organização. As colunas saturation_level e
        // potential_score de opura_market_neighborhoods são globais e ficam nulas.
        cor = ind?.saturacao === 'Saturado' ? '#EF4444'
          : ind?.saturacao === 'Atenção' ? '#F59E0B'
          : ind?.saturacao ? '#10B981' : SEM_DADO;
      } else if (o.camada === 'oportunidade') {
        // Sem faixa escondida: a intensidade do verde acompanha o Score (0–100).
        cor = ind?.score == null ? SEM_DADO : '#10B981';
        if (ind?.score != null) opacidade = 0.08 + 0.5 * (ind.score / 100);
      }
      const linhaIndicadores = ind?.saturacao
        ? `<br/>${escHtml(ind.saturacao)} · Score ${ind.score ?? '—'}`
        : (o.camada === 'saturacao' || o.camada === 'oportunidade') ? '<br/>Saturação e Score: sem histórico de saídas' : '';
      const dica = (st?.pricePerM2Avg == null
        ? `<b>${escHtml(bairro.name)}</b><br/>Sem anúncio ativo vinculado`
        : `<b>${escHtml(bairro.name)}</b><br/>R$ ${Math.round(st.pricePerM2Avg).toLocaleString('pt-BR')}/m² · ${st.total} anúncios`) + linhaIndicadores;
      L.circle([bairro.centroidLat, bairro.centroidLng], {
        color: cor, fillColor: cor, fillOpacity: opacidade, radius: 250, stroke: true, weight: 1.5, dashArray: '3, 4',
      }).bindTooltip(dica, { permanent: false, direction: 'top' }).addTo(grupo);
      L.marker([bairro.centroidLat, bairro.centroidLng], {
        interactive: false,
        icon: L.divIcon({
          html: `<div class="text-[9px] font-black uppercase tracking-wider text-slate-200 text-center drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.8)]">${escHtml(bairro.name)}</div>`,
          className: 'border-0 bg-transparent', iconSize: [80, 20], iconAnchor: [40, 10],
        }),
      }).addTo(grupo);
    });

    // 2. Concorrência: anúncio com dono (importado por uma organização) é verde; sem dono é vermelho.
    if (o.camada === 'concorrencia') {
      o.listings.forEach(l => {
        if (!l.latitude || !l.longitude) return;
        const cor = l.organizationId != null ? 'bg-emerald-500' : 'bg-rose-500';
        const dica = `<b>${escHtml(l.propertyType)}</b> - ${escHtml(l.address || 'Endereço não informado')}<br/>R$ ${l.price.toLocaleString('pt-BR')} (${l.areaPrivate}m² | ${l.bedrooms}D)`;
        L.marker([l.latitude, l.longitude], {
          icon: L.divIcon({
            html: `<div class="w-3.5 h-3.5 rounded-full ${cor} border border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold">🏢</div>`,
            className: 'border-0 bg-transparent', iconSize: [14, 14], iconAnchor: [7, 7],
          }),
        }).bindTooltip(dica, { direction: 'top' }).addTo(grupo);
      });
    }

    // 3. Pino do terreno e raio de análise.
    if (o.terrainPin) {
      L.marker([o.terrainPin.lat, o.terrainPin.lng], {
        icon: L.divIcon({
          html: `<div class="relative flex items-center justify-center">
                   <div class="absolute w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400 animate-ping"></div>
                   <div class="w-7 h-7 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-lg text-xs">📍</div>
                 </div>`,
          className: 'border-0 bg-transparent', iconSize: [28, 28], iconAnchor: [14, 14],
        }),
      }).addTo(grupo);
      L.circle([o.terrainPin.lat, o.terrainPin.lng], {
        color: '#2563EB', fillColor: '#3B82F6', fillOpacity: 0.08, radius: parseInt(o.raioMetros), weight: 1.5, dashArray: '5, 5',
      }).addTo(grupo);
    }

    // 4. Polígono em desenho.
    if (o.isDrawingPolygon && o.drawingPoints.length > 0) {
      o.drawingPoints.forEach((p, idx) => {
        L.circleMarker(p, { radius: 5, color: '#4F46E5', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2 })
          .bindTooltip(`Vértice ${idx + 1}`, { permanent: false })
          .addTo(grupo);
      });
      if (o.drawingPoints.length >= 3) {
        L.polygon(o.drawingPoints, { color: '#4F46E5', fillColor: '#6366F1', fillOpacity: 0.3, weight: 2, dashArray: '3, 3' }).addTo(grupo);
      } else if (o.drawingPoints.length === 2) {
        L.polyline(o.drawingPoints, { color: '#4F46E5', weight: 2, dashArray: '3, 3' }).addTo(grupo);
      }
    }

    // 5. Polígono definitivo do lote.
    if (!o.isDrawingPolygon && o.polygonPoints && o.polygonPoints.length >= 3) {
      L.polygon(o.polygonPoints, { color: '#1E3A8A', fillColor: '#3B82F6', fillOpacity: 0.25, weight: 2.5 })
        .bindTooltip('Área do terreno desenhada', { direction: 'top' })
        .addTo(grupo);
    }
  }, [mapa, o.neighborhoods, o.listings, o.camada, o.terrainPin, o.raioMetros, o.isDrawingPolygon, o.drawingPoints, o.polygonPoints, o.statsPorBairro, o.indicadoresPorBairro]);

  return { mapa, focar };
}
