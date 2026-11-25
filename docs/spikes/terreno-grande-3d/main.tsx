/**
 * Harness do 3D com TERRENO GRANDE (12/10/2026): o caso do usuário — lote de
 * ~346 × 344 m em volta da origem, relevo de 860 a 900 m (um morro), cota do
 * zero 887,94 m ("Onde fica" preenchido pelo Copernicus). Relato: *"a imagem
 * esta sendo cortada"* e *"as curvas de nivel nao esta sendo mostradas no 3d"*.
 *
 *   ?cotaZero=873.91   (a média — o comportamento antes da cota preenchida)
 */
import '../../../index.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { amostradorDaMalha, gerarCurvas, malhaDaGrade, planejarGrade } from '../../../utils/blueprintTopografia';
import { corArcoIrisDaCota } from '../../../utils/blueprintTopografiaAnalises';
import { curvasDeNivel3d } from '../../../utils/blueprintTopografia3dExtras';
import { planoDaTexturaDoMapa } from '../../../utils/blueprintMapaDeFundo';
import { ATRIBUICAO_OSM, caixaGeoDaGrade, prediosNoDesenho } from '../../../utils/blueprintMaqueteOsm';
import { buscarPrediosNoOpenFreeMap } from '../../../hooks/usePrediosDaMaquete';
import { arvoresDaCobertura } from '../../../utils/blueprintMaqueteArvores';
import { CLASSE_ARVORE, PIXELS_POR_GRAU, type GradeDeCobertura } from '../../../utils/geo/coberturaDoSolo';

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
// `?lat=…&lon=…` (25/11/2026): "Onde fica" em outro lugar — a Maquete busca os prédios do OSM de lá.
const GEO = { latitude: Number(q.get('lat') ?? -22.6163977), longitude: Number(q.get('lon') ?? -46.0412014) };
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
    __entorno?: { predios: number; arvores: number };
  }
}
window.__terreno = relevo ? { minY: relevo.minY, maxY: relevo.maxY, triangulos: relevo.triangulos } : null;

/**
 * O ENTORNO DA MAQUETE no harness (25/11/2026):
 *   `?osm=1`               prédios do OpenStreetMap de verdade (ladrilhos do OpenFreeMap);
 *   `?arvores=sintetico`   uma mancha de mata sintética no lugar do WorldCover — a grade real só vem
 *                          pela Edge Function (com login); aqui se confere o desenho das árvores.
 */
type Entorno = NonNullable<React.ComponentProps<typeof Blueprint3DViewer>['entornoDaMaquete']>;
function useEntorno(): { entorno: Entorno | null; notas: string[] } {
  const [r, setR] = useState<{ entorno: Entorno | null; notas: string[] }>({ entorno: null, notas: [] });
  useEffect(() => {
    if (!q.get('osm') && !q.get('arvores')) return;
    const g = { ...grade, cotasM };
    const cotaEm = amostradorDaMalha(g);
    const caixa = caixaGeoDaGrade(grade, GEO);
    const montar = async () => {
      const notas: string[] = [];
      let predios: ReturnType<typeof prediosNoDesenho> = [];
      if (q.get('osm')) {
        try {
          predios = prediosNoDesenho(await buscarPrediosNoOpenFreeMap(caixa, new AbortController().signal), GEO, cotaEm);
          notas.push(`Prédios ${ATRIBUICAO_OSM} (${predios.length})`);
        } catch (e) {
          notas.push(`Prédios não vieram: ${String(e)}`);
        }
      }
      let arvores: ReturnType<typeof arvoresDaCobertura> = [];
      if (q.get('arvores') === 'sintetico') {
        const col0 = Math.floor(caixa.oeste * PIXELS_POR_GRAU);
        const lin0 = Math.ceil(caixa.norte * PIXELS_POR_GRAU);
        const colunas = Math.ceil(caixa.leste * PIXELS_POR_GRAU) - col0;
        const linhas = lin0 - Math.floor(caixa.sul * PIXELS_POR_GRAU);
        const classes = new Uint8Array(colunas * linhas);
        // Mata nas encostas a leste e ao sul do morro, faixa ripária na diagonal.
        for (let r = 0; r < linhas; r++)
          for (let k = 0; k < colunas; k++) {
            const u = k / colunas;
            const v = r / linhas;
            classes[r * colunas + k] = u > 0.62 || v > 0.72 || Math.abs(u - v) < 0.06 ? CLASSE_ARVORE : 30;
          }
        const cobertura: GradeDeCobertura = { oeste: col0 / PIXELS_POR_GRAU, norte: lin0 / PIXELS_POR_GRAU, passoGraus: 1 / PIXELS_POR_GRAU, colunas, linhas, classes };
        arvores = arvoresDaCobertura(cobertura, GEO, cotaEm, { predios: predios.map((p) => p.anel) });
        notas.push(`Árvores (sintéticas): ${arvores.length}`);
      }
      window.__entorno = { predios: predios.length, arvores: arvores.length };
      setR({
        entorno: {
          predios: predios.map((p) => ({ id: p.id, anel: p.anel, baseY: p.baseM - COTA_ZERO, alturaM: p.alturaM })),
          arvores: arvores.map((a) => ({ x: a.x, y: a.y, baseY: a.baseM - COTA_ZERO, alturaM: a.alturaM, copaM: a.copaM })),
          chave: `${predios.length}|${arvores.length}`,
        },
        notas,
      });
    };
    void montar();
  }, []);
  return r;
}

function Cena3d() {
  const { entorno, notas } = useEntorno();
  return (
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
      extrasDoRelevo={curvas.length ? { drenagem: [], muros: [], curvas, cotaZeroM: COTA_ZERO } : null}
      extrasChave={`curvas:${q.get('curvas') ?? ''}:${q.get('arcoiris') ?? ''}:${q.get('semAssentar') ?? ''}`}
      mapaNoRelevo={planoDoMapa ? { plano: planoDoMapa, chave: `${q.get('mapa')}:${q.get('meio') ?? ''}` } : null}
      // `?estilo=MAQUETE` (25/11/2026): o estilo do 3D (Sombreado, Concepção, Maquete…).
      estilo={(q.get('estilo') ?? undefined) as never}
      entornoDaMaquete={entorno}
      notasDaMaquete={notas}
    />
  </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Cena3d />);
