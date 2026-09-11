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
  analisarDrenagem,
  canaletasDoPlato,
  comprimentoDaCurvaM,
  cotaDeEquilibrio,
  cotaDeProjeto,
  type AnaliseDaDrenagem,
  type LinhaDeDrenagem,
  declividadeDaGrade,
  estatisticasDoPerfil,
  hipsometriaDaGrade,
  PARAMETROS_PADRAO,
  perfilAoLongo,
  terraplenagemComTalude,
} from '../../../utils/blueprintTopografiaAnalises';
import { svgDoPerfil } from '../../../utils/blueprintTopografiaExport';
import {
  areasDeContribuicao,
  dimensionarDrenagem,
  dimensionarMuro,
  ESTRUTURA_PADRAO,
  HIDRAULICA_PADRAO,
  type DimensionamentoHidraulico,
} from '../../../utils/blueprintTopografiaDimensionamento';

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
/** `?hipso=1` pinta as classes de cota (fase 3); `?hipso=eq` por equidistância (fase 4). */
const comHipsometria = busca.get('hipso') === '1' || busca.get('hipso') === 'eq';
const hipsoPorEquidistancia = busca.get('hipso') === 'eq';
/** `?fase4=1`: via de serviço 1,5 m, banqueta a cada 1 m (0,5 m), talude 1:3 no lado leste, e a linha desenhada do perfil. */
const fase4 = busca.get('fase4') === '1';
/** `?fase6=1`: muro de arrimo no lado leste do platô, canaletas geradas do platô e uma descida traçada. */
const fase6 = busca.get('fase6') === '1';
const { model, levelId } = modelo();
const versao = versaoGerada();
const terreno = medirTerreno(model.boundaries);
const COTA_ZERO = 101.5; // sem "Cota do terreno" informada: a cota média

// Fase 2: declividade, platô no lote inteiro (cota de equilíbrio + 0,4 m para
// haver corte E aterro na foto) e a curva do meio "clicada".
const declividade = declividadeDaGrade(versao.grade, CANTOS);
const cotaEquilibrio = cotaDeEquilibrio(versao.grade, CANTOS) ?? COTA_ZERO;
const cotaPlato = cotaEquilibrio + 0.4;
// Fase 3: o platô agora é a CASA (2 a 10 × 5 a 15 m), para a faixa de talude
// aparecer dentro do lote; taludes e material nos padrões.
const ANEL_DO_PLATO = [point(2000, 5000), point(10_000, 5000), point(10_000, 15_000), point(2000, 15_000)];
// Fase 4: via, banqueta e talude por aresta — lance curto (1 m) para a banqueta
// caber num lote de 12 m; lado 1 (leste) com aterro 1:3.
const PARAMETROS = fase6
  ? { ...PARAMETROS_PADRAO, taludePorAresta: [null, { muro: true }, null, null] }
  : fase4
    ? {
        ...PARAMETROS_PADRAO,
        larguraDaViaM: 1.5,
        alturaDoLanceM: 1,
        larguraDaBanquetaM: 0.5,
        taludePorAresta: [null, { corteH: 3, aterroH: 3 }, null, null],
      }
    : PARAMETROS_PADRAO;
const terraplenagem = terraplenagemComTalude(versao.grade, ANEL_DO_PLATO, cotaPlato, PARAMETROS);
// Fase 6: drenagem sobre a superfície de projeto — as canaletas do platô e
// uma descida d'água traçada para o sul (que desce mesmo: o lote sobe ao norte).
const cotaProjeto = cotaDeProjeto(versao.grade, ANEL_DO_PLATO, cotaPlato, PARAMETROS);
let contadorDeIds = 0;
const DRENAGEM: LinhaDeDrenagem[] = fase6
  ? [
      ...canaletasDoPlato(terraplenagem, versao.grade, ANEL_DO_PLATO, PARAMETROS, cotaProjeto, () => `d${++contadorDeIds}`),
      { id: 'descida', nome: 'Descida 1', tipo: 'DESCIDA', pontos: [point(1250, 4000), point(1250, 500), point(6000, 500)] },
      // Uma traçada ao contrário, para a marca vermelha aparecer.
      { id: 'errada', nome: 'Errada', tipo: 'CANALETA', pontos: [point(11_500, 1000), point(11_500, 14_000)] },
    ]
  : [];
const ANALISES: Record<string, AnaliseDaDrenagem> = Object.fromEntries(
  DRENAGEM.map((l) => [l.id, analisarDrenagem(l, cotaProjeto, PARAMETROS.caimentoMinPct ?? 0.5)]),
);
const ATENDE: Record<string, boolean> = Object.fromEntries(DRENAGEM.map((l) => [l.id, ANALISES[l.id].atende]));
// Fase 7: área contribuinte pela partição do lote e a seção por linha.
const AREAS_SUGERIDAS = areasDeContribuicao(versao.grade, CANTOS, DRENAGEM);
const DIMENSIONAMENTOS: Record<string, DimensionamentoHidraulico> = Object.fromEntries(
  DRENAGEM.map((l) => [l.id, dimensionarDrenagem(l, ANALISES[l.id], AREAS_SUGERIDAS[l.id] ?? 0, HIDRAULICA_PADRAO)]),
);
const hipsometria = hipsometriaDaGrade(
  versao.grade,
  CANTOS,
  hipsoPorEquidistancia ? { modo: 'EQUIDISTANCIA', intervaloM: 0.5 } : 8,
);
const cortePerfil = { a: point(-2000, 10_000), b: point(14_000, 10_000) };
/** A linha desenhada do perfil (fase 4): três vértices, em L, saindo do lote. */
const LINHA_DO_PERFIL = [point(1000, 2000), point(6000, 20_000), point(13_000, 28_000)];
/**
 * Fase 5: várias linhas; a segunda cruza o lote de oeste a leste na parte de
 * baixo (o quadro do harness mostra y de 0 a ~15 m), e a primeira é a ativa.
 */
const LINHAS_DO_PERFIL = [LINHA_DO_PERFIL, [point(-1000, 3000), point(13_000, 4500)]];
const linhaDoPerfil = fase4 ? LINHA_DO_PERFIL : [cortePerfil.a, cortePerfil.b];
const perfilPontos = perfilAoLongo(amostradorDaGrade(versao.grade), linhaDoPerfil);
const perfilEstatisticas = estatisticasDoPerfil(perfilPontos);
const arestasDoPlatoM = ANEL_DO_PLATO.map((p, i, anel) => {
  const q = anel[(i + 1) % anel.length];
  return Math.hypot(q.x - p.x, q.y - p.y) / 1000;
});
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
            plato: comPlato
              ? { cotaM: cotaPlato, anel: ANEL_DO_PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5, parametros: PARAMETROS }
              : null,
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
          terraplenagem={
            comPlato
              ? {
                  grade: versao.grade,
                  ladoDaCelula: terraplenagem.ladoDaCelula,
                  muros: terraplenagem.muros.map((m) => ({ a: m.a, b: m.b, normal: m.normal })),
                }
              : null
          }
          drenagem={fase6 ? { linhas: DRENAGEM, ativa: DRENAGEM[0]?.id ?? null, atende: ATENDE } : null}
          hipsometria={
            comHipsometria
              ? { grade: versao.grade, classeDaCelula: hipsometria.classeDaCelula, cores: hipsometria.classes.map((c) => c.cor) }
              : null
          }
          curvaEmDestaque={curvaDestacada ? { indice: indiceDaCurva, ponto: pontoDaCurva } : null}
          linhasDoPerfil={fase4 ? LINHAS_DO_PERFIL : null}
          linhaDoPerfilAtiva={fase4 ? 0 : null}
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
                parametros: PARAMETROS,
                onParametros: () => {},
                arestasM: arestasDoPlatoM,
                murosDimensionados: fase6 ? terraplenagem.muros.map((m) => dimensionarMuro(m, ESTRUTURA_PADRAO)) : [],
                estrutura: ESTRUTURA_PADRAO,
                onEstrutura: () => {},
                persistenciaIndisponivel: false,
              }}
              drenagem={
                fase6
                  ? {
                      linhas: DRENAGEM,
                      analises: ANALISES,
                      ativa: DRENAGEM[0]?.id ?? null,
                      onAtiva: () => {},
                      onTracar: () => {},
                      temPlato: true,
                      onGerarDoPlato: () => {},
                      onAlterar: () => {},
                      onRemover: () => {},
                      caimentoMinPct: 0.5,
                      onCaimentoMin: () => {},
                      dimensionamentos: DIMENSIONAMENTOS,
                      areasSugeridasM2: AREAS_SUGERIDAS,
                      hidraulica: HIDRAULICA_PADRAO,
                      onHidraulica: () => {},
                    }
                  : null
              }
              hipsometria={comHipsometria ? hipsometria : null}
              hipsometriaOpcoes={{
                modo: hipsoPorEquidistancia ? 'EQUIDISTANCIA' : 'IGUAIS',
                onModo: () => {},
                intervaloM: null,
                intervaloEfetivoM: 0.5,
                onIntervalo: () => {},
              }}
              perfil={{
                origem: fase4 ? 'LINHA' : 'CORTE',
                onOrigem: () => {},
                linhas: fase4 ? LINHAS_DO_PERFIL.length : 0,
                linhaIndice: fase4 ? 0 : -1,
                onLinha: () => {},
                onTracarLinha: () => {},
                onApagarLinha: () => {},
                cortes: [{ id: 'c1', rotulo: 'A' }],
                corteId: 'c1',
                onCorte: () => {},
                pontos: perfilPontos,
                estatisticas: perfilEstatisticas,
                svg: svgDoPerfil(perfilPontos, perfilEstatisticas, { largura: 280, altura: 150 }),
                onExportar: () => {},
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
