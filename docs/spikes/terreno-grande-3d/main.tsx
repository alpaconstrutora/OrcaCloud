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
import { gradeDeProjeto, PARAMETROS_PADRAO, saldoDoPlato, terraplenagemComTalude } from '../../../utils/blueprintTopografiaAnalises';
import { anelValido } from '../../../utils/blueprintPlato3d';
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
// `?plato=1` (25/11/2026): grade de 5 m, para o talude do platô aparecer.
const grade = planejarGrade(CANTOS, q.get('plato') ? 5_000 : 15_000);
const cotasM = grade.cotasM.map((_, k) => {
  const c = k % grade.colunas;
  const l = Math.floor(k / grade.colunas);
  const x = (grade.origem.x + c * grade.espacamentoMm) / 1000;
  const y = (grade.origem.y + l * grade.espacamentoMm) / 1000;
  const d2 = (x + 60) ** 2 + (y - 70) ** 2;
  return 860 + 40 * Math.exp(-d2 / (2 * 110 ** 2));
});
const gradeNatural = { ...grade, cotasM };
// `?plato=1` (25/11/2026, P2 do platô desenhado): um platô fixo na encosta SE, a `?cotaPlato=` (866 m); o relevo e as
// curvas viram os da superfície de PROJETO, e o selo mostra corte/aterro/saldo da conta da terraplenagem.
const ANEL_DO_PLATO = q.get('plato') ? [point(0, -110_000), point(100_000, -110_000), point(100_000, -30_000), point(0, -30_000)] : null;
const COTA_DO_PLATO = Number(q.get('cotaPlato') ?? 866);
const gradeDoTerreno = ANEL_DO_PLATO ? gradeDeProjeto(gradeNatural, ANEL_DO_PLATO, COTA_DO_PLATO, PARAMETROS_PADRAO, null) : gradeNatural;
const SALDO = ANEL_DO_PLATO
  ? saldoDoPlato(terraplenagemComTalude(gradeNatural, ANEL_DO_PLATO, COTA_DO_PLATO, PARAMETROS_PADRAO, null), gradeNatural, ANEL_DO_PLATO, false)
  : null;
const relevo = malhaDaGrade(gradeDoTerreno, COTA_ZERO);
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
      gerarCurvas(gradeDoTerreno, CANTOS, 1),
      COTA_ZERO,
      q.get('arcoiris') ? (c: number) => corArcoIrisDaCota(c, 860, 900) : null,
      q.get('semAssentar') ? null : { altura: amostradorDaMalha(gradeDoTerreno), passoMm: grade.espacamentoMm / 8 },
    )
  : [];

declare global {
  interface Window {
    __terreno?: { minY: number; maxY: number; triangulos: number } | null;
    __entorno?: { predios: number; arvores: number };
    __plato3d?: { anel: { x: number; y: number }[]; cotaM: number } | null;
    __confirmacoes?: number;
    __previas?: number[];
    __anelDesenhado?: { x: number; y: number }[] | null;
  }
}
// `?editar=1`: liga o espião do editor do platô (onde cada alça está na tela) para o portão plato.mjs.
(window as unknown as { __depurarPlato3d?: boolean }).__depurarPlato3d = !!q.get('editar');
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

/**
 * `?editar=1` (25/11/2026, P3): o platô fixo vira EDITÁVEL no 3D — alças nos cantos e a seta. A prévia refaz o
 * relevo, as curvas e o saldo; o confirmar grava no estado (e conta em `window.__confirmacoes`, o espião do portão).
 */
function usePlatoEditavel() {
  const [plato, setPlato] = useState<{ anel: { x: number; y: number }[]; cotaM: number } | null>(ANEL_DO_PLATO ? { anel: ANEL_DO_PLATO, cotaM: COTA_DO_PLATO } : null);
  const [previa, setPrevia] = useState<{ anel: { x: number; y: number }[]; cotaM: number } | null>(null);
  const atual = previa ?? plato;
  const derivado = React.useMemo(() => {
    if (!atual || !q.get('editar')) return null;
    const g = gradeDeProjeto(gradeNatural, atual.anel, atual.cotaM, PARAMETROS_PADRAO, null);
    return {
      relevo: malhaDaGrade(g, COTA_ZERO),
      curvas: curvasDeNivel3d(gerarCurvas(g, CANTOS, 1), COTA_ZERO, null, { altura: amostradorDaMalha(g), passoMm: g.espacamentoMm / 8 }),
      saldo: saldoDoPlato(terraplenagemComTalude(gradeNatural, atual.anel, atual.cotaM, PARAMETROS_PADRAO, null), gradeNatural, atual.anel, false),
      chave: `${atual.anel.map((p) => `${p.x},${p.y}`).join(';')}:${atual.cotaM}`,
    };
  }, [atual]);
  window.__plato3d = plato;
  const editavel =
    atual && q.get('editar')
      ? {
          anel: atual.anel,
          cotaM: atual.cotaM,
          cotaZeroM: COTA_ZERO,
          equilibrio: false,
          cotaEm: () => atual.cotaM,
          onPrevia: (p: { anel: { x: number; y: number }[]; cotaM: number } | null) => {
            // Espião do portão: a sequência de cotas da prévia durante o gesto.
            if (p) (window.__previas ??= []).push(p.cotaM);
            setPrevia(p);
          },
          onConfirmar: (p: { anel: { x: number; y: number }[]; cotaM: number | null }) => {
            window.__confirmacoes = (window.__confirmacoes ?? 0) + 1;
            setPrevia(null);
            if (!anelValido(p.anel)) return;
            setPlato({ anel: p.anel, cotaM: p.cotaM ?? atual.cotaM });
          },
        }
      : null;
  return { derivado, editavel };
}

function Cena3d() {
  const { entorno, notas } = useEntorno();
  const { derivado, editavel } = usePlatoEditavel();
  // O painel do platô (25/11/2026): completo à esquerda ou compacto no rodapé; o modo vai para o espião do portão.
  const [modoDoPainel, setModoDoPainel] = useState<'COMPLETO' | 'COMPACTO'>('COMPLETO');
  (window as unknown as { __modoDoPainel?: string }).__modoDoPainel = modoDoPainel;
  const saldoAtual = derivado?.saldo ?? SALDO;
  const painelDoPlato =
    editavel && saldoAtual
      ? {
          modo: modoDoPainel,
          onModo: setModoDoPainel,
          dados: {
            base: 'DESENHADO' as const,
            cotaM: editavel.cotaM,
            equilibrio: false,
            faixaDaCotaM: [840, 900] as [number, number],
            areaM2: 8000,
            perimetroM: 360,
            corteM3: saldoAtual.corteM3,
            aterroM3: saldoAtual.aterroM3,
            saldoM3: saldoAtual.saldoM3,
            foraDoRelevo: saldoAtual.foraDoRelevo,
            aviso: null,
            taludeCorteH: 1.5,
            taludeAterroH: 1.5,
          },
          onCotaPrevia: (cotaM: number) => editavel.onPrevia({ anel: editavel.anel, cotaM }),
          onCota: (cotaM: number) => editavel.onConfirmar({ anel: editavel.anel, cotaM }),
          onEquilibrio: () => {},
          onParametros: () => {},
          onExcluir: () => {},
        }
      : null;
  return (
  <div className="h-full w-full">
    {/* `?semTerreno=1`: o "Terreno" do 3D desligado (Exibir) — o padrão do editor.
        `?envelope=1`: o envelope ligado (o padrão do editor), sem gabarito = 1 pavimento de 2,8 m. */}
    <Blueprint3DViewer
      model={model}
      mostrarTerreno={!q.get('semTerreno')}
      mostrarLaje
      relevo={q.get('semTerreno') ? null : (derivado?.relevo ?? relevo)}
      relevoChave={`h:${COTA_ZERO}:${derivado?.chave ?? ''}`}
      envelope={q.get('envelope') ? [{ levelId, nome: 'Térreo', anel: CANTOS, baseMm: 0, topoMm: 2800, acimaDoGabarito: false }] : undefined}
      extrasDoRelevo={(derivado?.curvas ?? curvas).length ? { drenagem: [], muros: [], curvas: derivado?.curvas ?? curvas, cotaZeroM: COTA_ZERO } : null}
      extrasChave={`curvas:${q.get('curvas') ?? ''}:${q.get('arcoiris') ?? ''}:${q.get('semAssentar') ?? ''}:${derivado?.chave ?? ''}`}
      mapaNoRelevo={planoDoMapa ? { plano: planoDoMapa, chave: `${q.get('mapa')}:${q.get('meio') ?? ''}` } : null}
      // `?estilo=MAQUETE` (25/11/2026): o estilo do 3D (Sombreado, Concepção, Maquete…).
      estilo={(q.get('estilo') ?? undefined) as never}
      entornoDaMaquete={entorno}
      saldoDoPlato={derivado?.saldo ?? SALDO}
      platoEditavel={editavel}
      painelDoPlato={q.get('painel') ? painelDoPlato : null}
      // `?desenhar=1` (25/11/2026): a ferramenta Platô ativa no 3D — o contorno fechado vai para o espião.
      desenharPlato3d={q.get('desenhar') ? { onAnel: (anel) => (window.__anelDesenhado = anel) } : null}
      onEquilibrio={() => {}}
      notasDaMaquete={notas}
    />
  </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Cena3d />);
