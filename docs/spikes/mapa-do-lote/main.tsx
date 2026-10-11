/**
 * Harness da gaveta "Desenhar o lote no mapa" (plano 2026-10-11, item 2.2),
 * com o Leaflet e os mapas DE VERDADE — o teste de componente usa um Leaflet
 * falso, então só aqui se vê se o mapa aparece, os fundos carregam e o clique
 * desenha. `window.__area` guarda o que "Usar esta área" entregou.
 *
 *   npx vite --port 3197   →   http://localhost:3197/docs/spikes/mapa-do-lote/index.html
 *   ?geo=-22.6164,-46.0412  abre com "Onde fica" já informado
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PainelMapaDoLote from '../../../components/blueprint/PainelMapaDoLote';

const geo = new URLSearchParams(location.search).get('geo');
const [lat, lon] = (geo ?? '').split(',').map(Number);
const georreferencia = geo && Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;

declare global {
  interface Window {
    __area?: unknown;
  }
}

createRoot(document.getElementById('raiz')!).render(
  <PainelMapaDoLote
    georreferencia={georreferencia}
    onUsar={(area) => {
      window.__area = area;
      return null;
    }}
  />,
);
