/**
 * Harness do MAPA DE FUNDO da planta (plano 2026-10-12-camadas-mapa-de-fundo).
 *
 * Um lote de ~288 × 248 m no terreno do pedido, georreferenciado pela gaveta
 * do mapa (`areaParaLote`), e o `BlueprintCanvas` com o mapa ligado.
 * `window.__mapa` expõe o que o portão precisa para conferir a POSIÇÃO:
 *   - `limites` (o retângulo visível em mm, pelo `onVistaMudou` do canvas) e o
 *     tamanho — com eles lat/lon → mm (`geoParaLocal`) → pixel de tela, sem
 *     passar pela afim do ladrilho, que é o que está sendo testado;
 *   - `corDoLadrilho(lat, lon, z)`: a cor do ponto no ladrilho ORIGINAL,
 *     baixado à parte e lido pelo Mercator (validado contra a wiki do OSM).
 *
 *   ?fonte=RELEVO   ?giro=30   ?meio=1 (meio-tom)
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { areaParaLote, retanguloGeoPorCantos } from '../../../utils/blueprintMapaDoLote';
import { FONTE_DO_MAPA, ladrilhoFracionario, urlDoLadrilho, zoomDoLadrilho, type FonteDoMapa } from '../../../utils/blueprintMapaDeFundo';
import { geoParaLocal, localParaGeo } from '../../../utils/blueprintTopografia';

const q = new URLSearchParams(location.search);
const fonte = (q.get('fonte') === 'RELEVO' ? 'RELEVO' : 'RUAS') as FonteDoMapa;
const giro = Number(q.get('giro') ?? 0) || 0;
const opacidade = q.get('meio') ? 0.45 : 1;
/** O portão mede sem o lote: o preenchimento verde dele tinge as cores do mapa. */
const semLote = !!q.get('semLote');

// O retângulo do `contours (1).kml` do pedido.
const area = areaParaLote(retanguloGeoPorCantos({ lat: -22.615333, lon: -46.042601 }, { lat: -22.617571, lon: -46.039801 }), null);
if (!area.ok) throw new Error(area.erro);
const geo = { ...area.georreferencia, rotacaoNorteDeg: giro };
// Com giro, os pontos do lote mudam: recalcula pela georreferência girada.
const pontos = retanguloGeoPorCantos({ lat: -22.615333, lon: -46.042601 }, { lat: -22.617571, lon: -46.039801 }).map((v) => geoParaLocal(v, geo));

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
const levelId = base.model.levels[0].id;
const lados: Command[] = pontos.map((p, i) => ({
  type: 'AddBoundary' as const,
  levelId,
  a: point(Math.round(p.x), Math.round(p.y)),
  b: point(Math.round(pontos[(i + 1) % 4].x), Math.round(pontos[(i + 1) % 4].y)),
  kind: 'TERRENO' as const,
}));
// Sem lote, um ponto só no canto, para o ENQUADRAR ter o que enquadrar na mesma área.
const marcos: Command[] = semLote
  ? [{ type: 'AddBoundary' as const, levelId, a: point(Math.round(pontos[0].x), Math.round(pontos[0].y)), b: point(Math.round(pontos[2].x), Math.round(pontos[2].y)), kind: 'TERRENO' as const }]
  : lados;
const model = applyBatch(base.model, [{ type: 'SetGeorreferencia', georreferencia: geo }, ...marcos]).model;

declare global {
  interface Window {
    __mapa?: {
      limites: { x0: number; y0: number; x1: number; y1: number } | null;
      enquadrado?: boolean;
      tamanho: { w: number; h: number };
      telaDe: (lat: number, lon: number) => { x: number; y: number } | null;
      geoDe: (x: number, y: number) => { lat: number; lon: number } | null;
      zoom: () => number | null;
      corDoLadrilho: (lat: number, lon: number) => Promise<[number, number, number]>;
    };
  }
}

const imagens = new Map<string, Promise<HTMLImageElement>>();
const carregar = (url: string) => {
  let p = imagens.get(url);
  if (!p) {
    p = new Promise((ok, falha) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error(url));
      i.src = url;
    });
    imagens.set(url, p);
  }
  return p;
};

const TAMANHO = { w: 900, h: 600 };
window.__mapa = {
  limites: null,
  tamanho: TAMANHO,
  telaDe(lat, lon) {
    const l = window.__mapa!.limites;
    if (!l) return null;
    const p = geoParaLocal({ lat, lon }, geo);
    return { x: ((p.x - l.x0) / (l.x1 - l.x0)) * TAMANHO.w, y: ((l.y1 - p.y) / (l.y1 - l.y0)) * TAMANHO.h };
  },
  geoDe(x, y) {
    const l = window.__mapa!.limites;
    if (!l) return null;
    return localParaGeo({ x: l.x0 + (x / TAMANHO.w) * (l.x1 - l.x0), y: l.y1 - (y / TAMANHO.h) * (l.y1 - l.y0) }, geo);
  },
  zoom() {
    const l = window.__mapa!.limites;
    if (!l) return null;
    const escala = TAMANHO.w / (l.x1 - l.x0);
    return zoomDoLadrilho(escala, geo.latitude, FONTE_DO_MAPA[fonte].maxNativeZoom);
  },
  async corDoLadrilho(lat, lon) {
    const z = window.__mapa!.zoom()!;
    const f = ladrilhoFracionario({ lat, lon }, z);
    const t = { z, x: Math.floor(f.x), y: Math.floor(f.y) };
    const img = await carregar(urlDoLadrilho(fonte, t));
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.floor((f.x - t.x) * 256), Math.floor((f.y - t.y) * 256), 1, 1).data;
    return [d[0], d[1], d[2]];
  },
};

/** Enquadra o lote depois que o canvas mediu o contêiner (como o editor faz ao abrir). */
function Harness() {
  const [seq, setSeq] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setSeq(1), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ width: TAMANHO.w, height: TAMANHO.h }}>
      <BlueprintCanvas
        model={model}
        tool="selecionar"
        levelId={levelId}
        selectedIds={[]}
        onSelecionar={() => {}}
        navegacao={seq ? { seq, acao: 'ENQUADRAR' } : null}
        mapaDeFundo={{ georreferencia: geo, fontes: [{ fonte, opacidade }] }}
        onVistaMudou={(l) => {
          window.__mapa!.limites = l;
          if (seq) window.__mapa!.enquadrado = true;
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
