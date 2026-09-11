/**
 * Harness visual das CURVAS DE NÍVEL.
 *
 * Monta os componentes REAIS — canvas da planta com o painel do terreno,
 * `ElevationCanvas` no corte e `Blueprint3DViewer` — sobre um lote real, com
 * uma versão de topografia gerada pelo motor de verdade a partir de pontos
 * cotados. É o que permite OLHAR as três vistas sem login, obra nem estudo:
 * conferir padrão de UI lendo `className` no diff não pega o que salta aos
 * olhos no navegador (docs/planos/2026-08-21-planta-inteligente-terreno.md).
 *
 * `?vista=planta` (padrão) · `?vista=corte` · `?vista=3d`
 * `?fonte=dem` mostra o painel com a fonte remota escolhida (sem georreferência).
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import ElevationCanvas from '../../../components/blueprint/ElevationCanvas';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import PainelTerreno from '../../../components/blueprint/PainelTerreno';
import PainelTopografia from '../../../components/blueprint/PainelTopografia';
import { ConfirmProvider } from '../../../components/ui/confirm';
import type { Topografia } from '../../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../../types/blueprint';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';
import { medirTerreno, RECUOS_ZERO } from '../../../utils/blueprintTerreno';
import {
  ALGORITMO_TOPOGRAFIA,
  amostradorDaGrade,
  amostrarPontosCotados,
  espacamentoPorQualidade,
  estatisticasDoTerreno,
  gerarCurvas,
  hashDaEntrada,
  hashDoResultado,
  malhaDaGrade,
  planejarGrade,
  type PontoCotado,
} from '../../../utils/blueprintTopografia';
import { FONTES, fonteDeElevacao } from '../../../utils/blueprintElevacaoProvedores';
import {
  comprimentoDaCurvaM,
  cotaDeEquilibrio,
  declividadeDaGrade,
  terraplenagemPreliminar,
} from '../../../utils/blueprintTopografiaAnalises';

/** Lote de 12 × 30 m, frente ao sul. */
const CANTOS = [
  { x: 0, y: 0 },
  { x: 12_000, y: 0 },
  { x: 12_000, y: 30_000 },
  { x: 0, y: 30_000 },
];

/** Levantamento: sobe para o fundo e para a direita, com um ponto no meio. */
const PONTOS: PontoCotado[] = [
  { x: 0, y: 0, cotaM: 100 },
  { x: 12_000, y: 0, cotaM: 100.6 },
  { x: 12_000, y: 30_000, cotaM: 103.4 },
  { x: 0, y: 30_000, cotaM: 102.5 },
  { x: 6000, y: 15_000, cotaM: 101.2 },
];

function modelo(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const lados: Command[] = CANTOS.map((c, i) => ({
    type: 'AddBoundary' as const,
    levelId,
    a: point(c.x, c.y),
    b: point(CANTOS[(i + 1) % CANTOS.length].x, CANTOS[(i + 1) % CANTOS.length].y),
    kind: 'TERRENO' as const,
  }));
  const casa: Command[] = [
    [point(2000, 5000), point(10_000, 5000)],
    [point(10_000, 5000), point(10_000, 15_000)],
    [point(10_000, 15_000), point(2000, 15_000)],
    [point(2000, 15_000), point(2000, 5000)],
  ].map(([a, b]) => ({ type: 'AddWall' as const, levelId, a, b, thicknessMm: 150, heightMm: 2800 }));
  let model = applyBatch(base.model, [...lados, ...casa]).model;
  model = applyCommand(model, { type: 'AddCorte', a: point(-2000, 10_000), b: point(14_000, 10_000) }).model;
  return { model, levelId };
}

function versaoGerada(): BlueprintTopografiaRow {
  const anel = CANTOS;
  const fonte = fonteDeElevacao('PONTOS_COTADOS');
  const { espacamentoMm, avisos } = espacamentoPorQualidade(anel, 'EQUILIBRADA', null);
  const grade = amostrarPontosCotados(planejarGrade(anel, espacamentoMm), PONTOS);
  const curvas = gerarCurvas(grade, anel, 0.5);
  const estatisticas = estatisticasDoTerreno(grade, anel, curvas);
  return {
    id: 'v1',
    study_id: 's1',
    organization_id: 'o1',
    versao: 1,
    fonte_codigo: fonte.codigo,
    fonte_nome: fonte.nome,
    dataset_versao: fonte.datasetVersao,
    resolucao_fonte_m: null,
    referencia_vertical: null,
    classe_qualidade: fonte.classe,
    grade,
    equidistancia_m: 0.5,
    curvas,
    estatisticas,
    pontos_cotados: PONTOS,
    anel,
    georreferencia: null,
    algoritmo_nome: ALGORITMO_TOPOGRAFIA.nome,
    algoritmo_versao: ALGORITMO_TOPOGRAFIA.versao,
    hash_entrada: hashDaEntrada({
      fonteCodigo: fonte.codigo,
      datasetVersao: fonte.datasetVersao,
      anel,
      georreferencia: null,
      espacamentoMm,
      equidistanciaM: 0.5,
      pontosCotados: PONTOS,
    }),
    hash_resultado: hashDoResultado(grade, curvas),
    avisos,
    created_by: null,
    created_at: new Date().toISOString(),
  };
}

const busca = new URLSearchParams(location.search);
const vista = busca.get('vista') ?? 'planta';
const dem = busca.get('fonte') === 'dem';
/** `?decl=1` pinta as faixas; `?plato=1` liga a hachura de corte/aterro e o platô no corte. */
const comDeclividade = busca.get('decl') === '1';
const comPlato = busca.get('plato') === '1';
const { model, levelId } = modelo();
const versao = versaoGerada();
const terreno = medirTerreno(model.boundaries);
const COTA_ZERO = 101.5; // sem "Cota do terreno" informada: a cota média

// Fase 2: declividade, platô no lote inteiro (cota de equilíbrio + 0,4 m para
// haver corte E aterro na foto) e a curva do meio "clicada".
const declividade = declividadeDaGrade(versao.grade, CANTOS);
const cotaEquilibrio = cotaDeEquilibrio(versao.grade, CANTOS) ?? COTA_ZERO;
const cotaPlato = cotaEquilibrio + 0.4;
const terraplenagem = terraplenagemPreliminar(versao.grade, CANTOS, cotaPlato);
const indiceDaCurva = Math.min(2, versao.curvas.length - 1);
const curvaDestacada = versao.curvas[indiceDaCurva];
const pontoDaCurva = curvaDestacada?.pontos[Math.floor(curvaDestacada.pontos.length / 2)] ?? { x: 0, y: 0 };

const topografia: Topografia = {
  fontes: FONTES,
  fonteCodigo: dem ? 'OPEN_METEO_GLO90' : 'PONTOS_COTADOS',
  setFonteCodigo: () => {},
  fonte: fonteDeElevacao(dem ? 'OPEN_METEO_GLO90' : 'PONTOS_COTADOS'),
  pontosCotados: PONTOS,
  adicionarPonto: () => {},
  alterarPonto: () => {},
  removerPonto: () => {},
  usarVerticesDoLote: () => {},
  qualidade: 'EQUILIBRADA',
  setQualidade: () => {},
  equidistanciaM: null,
  setEquidistanciaM: () => {},
  sugestaoEquidistanciaM: 0.5,
  gerar: async () => {},
  gerando: false,
  erro: dem ? 'O lado menor do lote tem 12 m e esta fonte resolve 90 m: cabem 0,1 células, e o mínimo é 3 (270 m). Para um lote deste tamanho, use os pontos cotados do levantamento.' : null,
  versoes: [versao],
  selecionada: versao,
  selecionar: () => {},
  apagarVersao: async () => {},
  exportar: () => {},
  carregando: false,
  persistenciaIndisponivel: false,
};

declare global {
  interface Window {
    __topografia?: { curvas: number; mestras: number; pontos: number };
  }
}
window.__topografia = {
  curvas: versao.curvas.length,
  mestras: versao.curvas.filter((c) => c.mestra).length,
  pontos: PONTOS.length,
};

function App() {
  if (vista === 'corte') {
    return (
      <div className="h-full w-full">
        <ElevationCanvas
          model={model}
          direcao="FRENTE"
          corte={model.sections[0]}
          terreno={{
            cotaEmM: amostradorDaGrade(versao.grade),
            cotaZeroM: COTA_ZERO,
            vertices: CANTOS,
            plato: comPlato ? { cotaM: cotaPlato, anel: CANTOS } : null,
          }}
          terrenoChave={versao.hash_resultado}
        />
      </div>
    );
  }
  if (vista === '3d') {
    return (
      <div className="h-full w-full">
        <Blueprint3DViewer
          model={model}
          mostrarTerreno
          mostrarLaje
          relevo={malhaDaGrade(versao.grade, COTA_ZERO)}
          relevoChave={versao.hash_resultado}
          alturaDoChao={(x, z) => {
            const c = amostradorDaGrade(versao.grade)({ x: x * 1000, y: z * 1000 });
            return c === null ? null : c - COTA_ZERO;
          }}
        />
      </div>
    );
  }
  const soPainel = vista === 'painel';
  return (
    <div className="flex h-full w-full">
      <div className="min-w-0 flex-1" hidden={soPainel}>
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={levelId}
          selectedIds={[]}
          onSelecionar={() => {}}
          ortogonal
          mostrarMedidasParedes
          curvasDeNivel={versao.curvas}
          pontosCotados={PONTOS}
          declividade={comDeclividade ? { grade: versao.grade, faixaDaCelula: declividade.faixaDaCelula } : null}
          terraplenagem={comPlato ? { grade: versao.grade, ladoDaCelula: terraplenagem.ladoDaCelula } : null}
          curvaEmDestaque={curvaDestacada ? { indice: indiceDaCurva, ponto: pontoDaCurva } : null}
          envelope={[]}
          onAddLimite={() => {}}
          onMoveBoundaryVertex={() => {}}
          onMoverSelecao={() => {}}
          onAddWall={() => {}}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={150}
          passoGradeMm={100}
        />
      </div>
      {/* `?vista=painel`: só a caixa, na largura real e SEM rolagem — para a
          foto de página inteira pegar o resultado, que fica abaixo da dobra. */}
      <div
        className={`w-[307px] shrink-0 border-l border-slate-200 bg-white ${soPainel ? '' : 'overflow-y-auto'}`}
      >
        <PainelTerreno
          terreno={terreno}
          divisaSelecionada={null}
          onComprimento={() => {}}
          onPapel={() => {}}
          recuos={RECUOS_ZERO}
          onRecuo={() => {}}
          envelope={null}
          aproveitamento={null}
          taxaOcupacaoMax={null}
          coeficienteMax={null}
          onTaxaOcupacaoMax={() => {}}
          onCoeficienteMax={() => {}}
          empreendimentos={[]}
          empreendimentoId=""
          onEmpreendimento={() => {}}
          onGravarArea={() => {}}
          onAbrirQuadro={() => {}}
          ladosSemPapel={4}
          ladosDivergentes={0}
          gabaritoAlturaMaxM={null}
          gabaritoPavimentos={null}
          taxaPermeabilidadeMin={null}
          pavimentosDesenhados={1}
          alturaDesenhadaM={2.8}
          georreferencia={null}
          onGeorreferencia={() => {}}
          topografiaSlot={
            <PainelTopografia
              topografia={topografia}
              temLoteFechado
              temGeorreferencia={false}
              cotaDeOrigemInformada={false}
              declividade={declividade}
              terraplenagem={{
                base: 'LOTE',
                onBase: () => {},
                temEnvelope: false,
                cotaPlatoM: cotaPlato,
                onCotaPlatoM: () => {},
                cotaDeEquilibrioM: cotaEquilibrio,
                resultado: terraplenagem,
                persistenciaIndisponivel: false,
              }}
              curvaSelecionada={
                curvaDestacada
                  ? { cotaM: curvaDestacada.cotaM, comprimentoM: comprimentoDaCurvaM(curvaDestacada), mestra: curvaDestacada.mestra }
                  : null
              }
              onLimparCurva={() => {}}
            />
          }
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <App />
  </ConfirmProvider>,
);
