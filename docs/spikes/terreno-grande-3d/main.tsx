/**
 * Harness do 3D com TERRENO GRANDE (12/10/2026): o caso do usuário — lote de
 * ~346 × 344 m em volta da origem, relevo de 860 a 900 m (um morro), cota do
 * zero 887,94 m ("Onde fica" preenchido pelo Copernicus). Relato: *"a imagem
 * esta sendo cortada"* e *"as curvas de nivel nao esta sendo mostradas no 3d"*.
 *
 *   ?cotaZero=873.91   (a média — o comportamento antes da cota preenchida)
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { amostradorDaMalha, gerarCurvas, malhaDaGrade, planejarGrade } from '../../../utils/blueprintTopografia';
import { corArcoIrisDaCota } from '../../../utils/blueprintTopografiaAnalises';
import { curvasDeNivel3d } from '../../../utils/blueprintTopografia3dExtras';
import { planoDaTexturaDoMapa } from '../../../utils/blueprintMapaDeFundo';

const q = new URLSearchParams(location.search);
const COTA_ZERO = Number(q.get('cotaZero') ?? 887.94);

const MEIO_X = 173_000;
const MEIO_Y = 172_000;
const CANTOS = [point(-MEIO_X, -MEIO_Y), point(MEIO_X, -MEIO_Y), point(MEIO_X, MEIO_Y), point(-MEIO_X, MEIO_Y)];

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
const levelId = base.model.levels[0].id;
const lados: Command[] = CANTOS.map((c, i) => ({ type: 'AddBoundary' as const, levelId, a: c, b: CANTOS[(i + 1) % 4], kind: 'TERRENO' as const }));
const model = applyBatch(base.model, lados).model;

// O morro: 900 m a NO do centro, descendo a 860 m nas bordas SE (grade de 15 m, como a do usuário).
const grade = planejarGrade(CANTOS, 15_000);
const cotasM = grade.cotasM.map((_, k) => {
  const c = k % grade.colunas;
  const l = Math.floor(k / grade.colunas);
  const x = (grade.origem.x + c * grade.espacamentoMm) / 1000;
  const y = (grade.origem.y + l * grade.espacamentoMm) / 1000;
  const d2 = (x + 60) ** 2 + (y - 70) ** 2;
  return 860 + 40 * Math.exp(-d2 / (2 * 110 ** 2));
});
const relevo = malhaDaGrade({ ...grade, cotasM }, COTA_ZERO);
// `?curvas=1`: as linhas das curvas de 1 m sobre o relevo; `&arcoiris=1` pinta pela cota (860 → 900).
// `?mapa=RUAS` | `?mapa=RELEVO` | `?mapa=AMBOS` (`&meio=1`): o mapa colado no relevo, com "Onde fica"
// no centro do terreno do pedido (o relevo aqui é sintético — o que se confere é o mapa no lugar).
const GEO = { latitude: -22.6163977, longitude: -46.0412014 };
const fontesDoMapa = ({ RUAS: ['RUAS'], RELEVO: ['RELEVO'], AMBOS: ['RUAS', 'RELEVO'] } as Record<string, ('RUAS' | 'RELEVO')[]>)[q.get('mapa') ?? ''] ?? [];
const planoDoMapa = fontesDoMapa.length
  ? planoDaTexturaDoMapa(
      { minX: grade.origem.x, minY: grade.origem.y, maxX: grade.origem.x + (grade.colunas - 1) * grade.espacamentoMm, maxY: grade.origem.y + (grade.linhas - 1) * grade.espacamentoMm },
      GEO,
      fontesDoMapa.map((fonte) => ({ fonte, opacidade: q.get('meio') ? 0.45 : 1 })),
    )
  : null;
// `&semAssentar=1`: a linha na cota da curva, sem assentar na malha (como era — fica tracejada).
const curvas = q.get('curvas')
  ? curvasDeNivel3d(
      gerarCurvas({ ...grade, cotasM }, CANTOS, 1),
      COTA_ZERO,
      q.get('arcoiris') ? (c: number) => corArcoIrisDaCota(c, 860, 900) : null,
      q.get('semAssentar') ? null : { altura: amostradorDaMalha({ ...grade, cotasM }), passoMm: grade.espacamentoMm / 8 },
    )
  : [];

declare global {
  interface Window {
    __terreno?: { minY: number; maxY: number; triangulos: number } | null;
  }
}
window.__terreno = relevo ? { minY: relevo.minY, maxY: relevo.maxY, triangulos: relevo.triangulos } : null;

createRoot(document.getElementById('raiz')!).render(
  <div className="h-full w-full">
    {/* `?semTerreno=1`: o "Terreno" do 3D desligado (Exibir) — o padrão do editor.
        `?envelope=1`: o envelope ligado (o padrão do editor), sem gabarito = 1 pavimento de 2,8 m. */}
    <Blueprint3DViewer
      model={model}
      mostrarTerreno={!q.get('semTerreno')}
      mostrarLaje
      relevo={q.get('semTerreno') ? null : relevo}
      relevoChave={`h:${COTA_ZERO}`}
      envelope={q.get('envelope') ? [{ levelId, nome: 'Térreo', anel: CANTOS, baseMm: 0, topoMm: 2800, acimaDoGabarito: false }] : undefined}
      extrasDoRelevo={curvas.length ? { drenagem: [], muros: [], curvas } : null}
      extrasChave={`curvas:${q.get('curvas') ?? ''}:${q.get('arcoiris') ?? ''}:${q.get('semAssentar') ?? ''}`}
      mapaNoRelevo={planoDoMapa ? { plano: planoDoMapa, chave: `${q.get('mapa')}:${q.get('meio') ?? ''}` } : null}
    />
  </div>,
);
