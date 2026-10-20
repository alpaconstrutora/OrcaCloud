/**
 * CASA AUTOMÁTICA (14/10/2026, plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * Do terreno + zona do Mapa Regulatório + programa curto (F1) à casa térrea
 * completa, num lote só de comandos. Este arquivo é o motor PURO; cada fase do
 * plano acrescenta uma etapa.
 *
 * ─── F2: IMPLANTAÇÃO PELA LEI ──────────────────────────────────────────────
 *
 * O gerador E6.2 PREENCHE o retângulo que recebe, ampliando as áreas do programa
 * até caber (é como ele faz planta de apartamento: a unidade é dada). Para a
 * casa, entregar o envelope dos recuos inteiro faz a casa ocupar o lote todo e
 * estourar a TO. Por isso a implantação vem antes: ela escolhe o retângulo que o
 * programa pede, limitado por (o menor vence, e o vencedor é DITO):
 *
 *   - TO × lote, com a folga das hipóteses;
 *   - o envelope dos recuos (o maior retângulo inscrito nele);
 *   - CA × lote (térrea: a área construída inteira conta);
 *   - a permeabilidade: lote × (1 − perm. mín.) − pavimentação externa − vagas descobertas.
 *
 * A casa encosta no recuo de FRENTE e na divisa escolhida (direita/esquerda de
 * quem está na rua olhando para o lote — a convenção de `papeisSugeridos`).
 *
 * ─── O QUADRO DA FRENTE ────────────────────────────────────────────────────
 *
 * O E6.2 só trabalha com eixos alinhados. Lote girado (desenhado no mapa, por
 * azimutes) teria o maior retângulo alinhado minúsculo. A conta é feita num
 * quadro LOCAL alinhado à frente — +y é a normal interna da divisa FRENTE, +x a
 * mão direita de quem olha da rua —, e a `transformacao` leva ao mundo. Com a
 * frente num eixo do desenho a transformação é exata (cos/sin 0 ou ±1).
 */
import { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, platoDaCasa, type HipotesesDaTerraplenagemDaCasa, type ResumoDaTerraplenagem } from './blueprintPlatoDaCasa';
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO, planejarMuroDaCasa, type HipotesesDoMuroDaCasa, type PlanoDoMuroDaCasa } from './blueprintMuroDaCasa';
import { DIMENSAO_DA_VAGA, TIPO_NBR5410_DO_USO, applyBatch, conflitosDoModelo, distanciaEntreEixos3D, envelopeDoTrecho, medirEscada, pavimentosDoNucleo, point, pointInPolygon, polygonArea, snapshotHash, uidDeterministico, type BlueprintModel, type Boundary, type Command, type ObjectId, type CamadaParede, type Point, type SpaceLabel, type Trecho } from './blueprintKernel';
import { envelopeLegal, type ContextoDaMassa } from './blueprintMassa';
import { envelopeConstrutivo } from './blueprintTerreno';
import { recuosEfetivos } from './blueprintZonaUrbanistica';
import {
  comandosDeAplicacao,
  gerar,
  HIPOTESES_DO_GERADOR_PADRAO,
  maiorRetanguloInscrito,
  type AmbienteGerado,
  type EntradaDoGerador,
  type HipotesesDoGerador,
  type Retangulo,
  type ResultadoDoGerador,
} from './blueprintGerador';
import {
  HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  programaDaCasa,
  resumoDoPrograma,
  usoDoNome,
  type HipotesesDoProgramaDaCasa,
  type Programa,
  type ProgramaCurtoDaCasa,
} from './blueprintPrograma';
import { conferirPrograma } from './blueprintConferenciaDoPrograma';
import { avaliarRegras, loteParaRegras, REGRAS_SEMENTE, type ContextoDeRegras } from './blueprintRegras';
import { ALEM_MM } from './blueprintPavimentoTipoDaMassa';
import { HIPOTESES_EIXOS_PADRAO, propostaDeEixos, type HipotesesDeEixos } from './blueprintEixosAutomaticos';
import { HIPOTESES_PILARES_PADRAO, planejarPilares, type HipotesesDePilares } from './blueprintPilaresAutomaticos';
import {
  HIPOTESES_LAJES_PADRAO,
  HIPOTESES_VIGAS_PADRAO,
  planejarLajes,
  planejarVigas,
  type HipotesesDeLajes,
  type HipotesesDeVigas,
} from './blueprintVigasLajesAutomaticas';
import { HIPOTESES_FUNDACOES_PADRAO, planejarFundacoes, type HipotesesDeFundacoes } from './blueprintFundacoesAutomaticas';
import { comandosDoTelhado, HIPOTESES_DO_TELHADO_PADRAO, type HipotesesDoTelhado, type ResumoDoTelhado } from './blueprintTelhadoAutomatico';
import { comandosDasAncoras, HIPOTESES_DAS_ANCORAS_PADRAO, type HipotesesDasAncoras, type ResultadoDasAncoras } from './blueprintAncorasDaCasa';
import { HIPOTESES_HIDRO_PADRAO, type HipotesesHidro } from './blueprintMemorialHidro';
import { comandosDeMobiliario, HIPOTESES_MOBILIARIO_PADRAO, mobiliarNivel, type HipotesesDeMobiliario } from './blueprintMobiliario';
import { HIPOTESES_PONTOS_PADRAO, planejarPontosDoNivel, pontosDasLoucasCriadas, type HipotesesDePontos } from './blueprintPontosHidraulicos';
import { planejarAguaCompleta } from './blueprintAguaCompleta';
import { cotaEnterradaAcimaDasRedes, planejarAlimentador } from './blueprintAlimentador';
import { planejarCondutores } from './blueprintCondutoresPluviais';
import { planejarEsgotoCompleto } from './blueprintEsgotoCompleto';
import { planejarPluvialCompleta } from './blueprintPluvialCompleto';
import { destinoDoEsgoto } from './blueprintEsgotoAutomatico';
import { dimensionarTratamento, medidasDimensionadas } from './blueprintTratamento';
import { pontoNaFrente, type LeitorDoTerreno } from './blueprintAncorasHidro';
import { amostradorDaGrade, type GradeDeElevacao } from './blueprintTopografia';
import { medirTerreno } from './blueprintTerreno';
import { marcasDeVerificacao } from './blueprintVerificacaoRede';
import { pressoesDoModelo, type HipotesesDePressao } from './blueprintPressaoDaRede';
import { KPA_POR_MCA } from './blueprintHidraulicaPressao';
import { comandosDePontosDoNivel } from './blueprintPontosEletricosDoNivel';
import { comodosComForro, type FaixaDoForro } from './blueprintRotaPeloForro';
import { furosPrevistos, type FuroPrevisto } from './blueprintFurosPrevistos';
import { presetDeAcabamento, presetsSugeridos } from './blueprintAcabamentos';
import { encaixarNaParede, paredesEmComum } from './blueprintRotaPelasParedes';
import { distanciaAoTrecho3D } from './blueprintPosicaoSplit';
import { anelDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { centroDeCargas, comandosParaOCentro } from './blueprintCentroDeCargas';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos, type HipotesesDeCircuitos } from './blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, sugerirDPS, type HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from './blueprintNbr5410';
import { HIPOTESES_ELETRODUTO_PADRAO, comandosDeBitolaPelaOcupacao, planejarEletrodutosDoModelo } from './blueprintEletrodutos';
import { gerarClimatizacao, type ContextoDoGeradorDeClimatizacao } from './blueprintGeradorClimatizacao';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from './blueprintClimatizacao';
import type { ModeloDoCatalogo } from './blueprintSelecaoClimatizacao';
import { COTA_USUAL_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO } from './blueprintRede';
import { entradaDoQuadro, padraoDeEntrada } from './blueprintEntradaDeEnergia';
import type { PendenciaDoPpci, SituacaoDaEtapa } from './blueprintGeradorPpci';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO } from './blueprintGuardaCorpo';
import {
  comandoDaEscada,
  comUidsDoPavimento,
  alinharSegundoAoPatamar,
  banheiroAlemDoNucleo,
  lavaboForaDoNucleo,
  dividirEmTres,
  dividirPrograma,
  escolherNucleo,
  guardaCorpoDaEscada,
  lajesComRebaixo,
  shaftDoGrupo,
  zonasMolhadasDoBanheiro,
  HIPOTESES_DO_SOBRADO_PADRAO,
  pavimentoComNucleo,
  portaParaOTerraco,
  contornoDoTerraco,
  pilaresDoTerceiro,
  retanguloDoSegundo,
  pilaresDoSobrado,
  semPortaDeEntrada,
  prumadasPeloMeioDoComodo,
  shaftsDoSobrado,
  alinharJanelasDoSuperior,
  trechosDeTransicao,
  vigasDeTransicao,
  type HipotesesDoSobrado,
  type NucleoDaEscada,
} from './blueprintSobrado';

// ─── Hipóteses ──────────────────────────────────────────────────────────────

export type DivisaDeEncosto = 'ESQUERDA' | 'DIREITA' | 'CENTRO';

export interface HipotesesDaImplantacao {
  /**
   * Item 9 da casa automática (decisão do usuário, 19/10/2026: "alargar só o mínimo"): a largura (eixos) abaixo da qual a
   * casa não fica — o retângulo alarga até ela mantendo a profundidade (cede só o que a TO pedir). Ausente = a da forma.
   */
  larguraMinimaMm?: number | null;
  /** Item 9: o passo e o máximo do alargamento quando a térrea sai com cômodo abaixo da largura mínima, mm. Ausentes = 200 e 600. */
  alargarPassoMm?: number;
  alargarAteMm?: number;
  /** Fica esta porcentagem ABAIXO da TO máxima (folga para beiral, ajuste de obra). */
  folgaDaTOPct: number;
  encostarNaDivisa: DivisaDeEncosto;
  /** Largura (ao longo da frente) ÷ profundidade do retângulo da casa. */
  proporcaoFrenteFundo: number;
  /** Calçadas, acesso e quintal pavimentado, em % do lote — conta como impermeável. */
  pavimentacaoExternaPctDoLote: number;
  /** Área de cada vaga descoberta (impermeável), m². */
  areaPorVagaDescobertaM2: number;
  /** Retângulo (eixos das paredes) ÷ área útil do programa: as paredes internas comem área. */
  fatorDoRetanguloSobreUtil: number;
  /** Espessura da parede externa (a mesma do gerador) — a projeção conta meia de cada lado. */
  espessuraExternaMm: number;
  /** A malha do gerador: as medidas do retângulo são múltiplas dela. */
  malhaMm: number;
  /**
   * F24 (decisão do usuário, 17/10/2026: "Automático"): as vagas descobertas que não cabem no recuo de frente. RECUAR = a
   * casa vai para trás até caberem; AO_LADO = uma faixa da largura da vaga, da rua para dentro, ao lado da casa (que
   * estreita); AUTOMATICO = recua quando a profundidade deixa sem perder área, senão a opção que perde menos.
   */
  vagaDescoberta: 'AUTOMATICO' | 'RECUAR' | 'AO_LADO';
  /**
   * F24 (decisão do usuário, 17/10/2026: "só quando o retângulo não comporta"): AUTOMATICA = retângulo, e a casa tenta o
   * L quando o retângulo não comporta o programa (limitado pelos recuos, ou ambiente abaixo da medida mínima) e fica com
   * o de menos problemas; RETANGULO = nunca L; L = o retângulo da frente (mais raso) e um anexo colado atrás dele.
   */
  forma: 'AUTOMATICA' | 'RETANGULO' | 'L';
  /**
   * F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): da frente do lote à FACE da fachada, no
   * mínimo — o que a rampa de veículos da garagem pede no terreno inclinado. 0 = só os recuos da zona.
   */
  recuoMinimoDeFrenteMm: number;
}

export const HIPOTESES_DA_IMPLANTACAO_PADRAO: HipotesesDaImplantacao = {
  folgaDaTOPct: 5,
  encostarNaDivisa: 'ESQUERDA',
  proporcaoFrenteFundo: 0.7,
  pavimentacaoExternaPctDoLote: 10,
  areaPorVagaDescobertaM2: 12.5,
  fatorDoRetanguloSobreUtil: 1.08,
  espessuraExternaMm: 200,
  malhaMm: 50,
  vagaDescoberta: 'AUTOMATICO',
  forma: 'AUTOMATICA',
  recuoMinimoDeFrenteMm: 0,
};

// ─── O quadro da frente ─────────────────────────────────────────────────────

/** Mundo = x·ex + y·ey. `ey` = normal interna da frente; `ex` = mão direita de quem olha da rua. */
export interface QuadroDaFrente {
  ex: Point;
  ey: Point;
}

const exato = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);

/** O quadro pela divisa FRENTE mais longa; `null` sem frente marcada. */
export function quadroDaFrente(limites: readonly Boundary[], anelDoLote: readonly Point[]): QuadroDaFrente | null {
  const frentes = limites.filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
  if (!frentes.length || anelDoLote.length < 3) return null;
  const f = [...frentes].sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))[0];
  const L = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
  if (L < 1) return null;
  let n = { x: -(f.b.y - f.a.y) / L, y: (f.b.x - f.a.x) / L };
  const c = { x: anelDoLote.reduce((s, p) => s + p.x, 0) / anelDoLote.length, y: anelDoLote.reduce((s, p) => s + p.y, 0) / anelDoLote.length };
  const meio = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
  if ((c.x - meio.x) * n.x + (c.y - meio.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const ey = { x: exato(n.x), y: exato(n.y) };
  return { ey, ex: { x: exato(ey.y), y: exato(-ey.x) } };
}

export const paraLocal = (q: QuadroDaFrente, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ex.y, y: p.x * q.ey.x + p.y * q.ey.y });
export const paraMundo = (q: QuadroDaFrente, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ey.x, y: p.x * q.ex.y + p.y * q.ey.y });

// ─── Implantação ────────────────────────────────────────────────────────────

export type LimitanteDaImplantacao = 'PROGRAMA' | 'TO' | 'ENVELOPE' | 'CA' | 'PERMEABILIDADE' | 'VAGAS' | 'RAMPA';

export const ROTULO_DO_LIMITANTE: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'o programa',
  TO: 'a taxa de ocupação',
  ENVELOPE: 'os recuos',
  CA: 'o coeficiente de aproveitamento',
  PERMEABILIDADE: 'a taxa de permeabilidade',
  VAGAS: 'as vagas descobertas',
  RAMPA: 'a rampa da garagem',
};

/** Com a preposição contraída — "limitada pelo programa", "pela taxa de ocupação". */
export const LIMITADA_POR: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'pelo programa',
  TO: 'pela taxa de ocupação',
  ENVELOPE: 'pelos recuos',
  CA: 'pelo coeficiente de aproveitamento',
  PERMEABILIDADE: 'pela taxa de permeabilidade',
  VAGAS: 'pelas vagas descobertas',
  RAMPA: 'pela rampa da garagem',
};

export interface ImplantacaoDaCasa {
  /** O retângulo das paredes externas (eixos) no quadro da frente, mm, na malha. */
  retanguloLocal: Retangulo;
  /** O mesmo retângulo no mundo — é o `envelope` que o gerador recebe (alinhado quando a frente é). */
  anelNoMundo: Point[];
  quadro: QuadroDaFrente;
  /** Direção da rua a partir do lote, no mundo (= −ey) — a `direcaoDaFrente` do gerador. */
  direcaoDaFrente: Point;
  /** A frente cai num eixo do desenho: o gerador recebe o anel do mundo direto. */
  alinhadaAoDesenho: boolean;
  limitante: LimitanteDaImplantacao;
  /** F12: 1 = térrea; 2 = sobrado (os dois pavimentos no mesmo retângulo). */
  pavimentos: number;
  medidas: {
    loteM2: number;
    /** A área que o programa pede, já como projeção (paredes externas pela metade). */
    projecaoPedidaM2: number;
    projecaoM2: number;
    implantacaoMaxM2: number | null;
    envelopeM2: number;
    potencialM2: number | null;
    impermeavelMaxM2: number | null;
    toPct: number;
    toMaxPct: number | null;
    /** A área construída (projeção × pavimentos) ÷ lote. */
    coeficiente: number;
    coeficienteMax: number | null;
    /** (lote − projeção − pavimentação − vagas descobertas) ÷ lote. */
    permeabilidadePct: number;
    permeabilidadeMinPct: number | null;
  };
  /**
   * F24: a casa em L — o anel ortogonal (no quadro da frente) do retângulo da frente (`retanguloLocal`) com o anexo
   * colado atrás dele. `null` = a casa é o retângulo.
   */
  contornoLocal: Point[] | null;
  /**
   * F24: onde as vagas descobertas vão (no quadro da frente) — o recuo de frente diante da casa ou a faixa ao lado
   * dela. `null` = sem vaga descoberta.
   */
  vagasDescobertas: { caixa: Retangulo; onde: 'RECUO_DE_FRENTE' | 'AO_LADO' } | null;
  avisos: string[];
}

export type ResultadoDaImplantacao = { ok: true; implantacao: ImplantacaoDaCasa } | { ok: false; motivo: string };

const m2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(v * 10) / 10;
const f2 = (v: number) => v.toFixed(2).replace('.', ',');
/** F18: quanto o início do condutor pluvial sobe a cada volta para passar por cima do esgoto, mm. */
const PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM = 60;

/** F18: os encontros (conflito de rede) entre o pluvial enterrado e o esgoto — o cruzamento e a passagem rente. */
function pluvialRenteAoEsgoto(m: BlueprintModel): number {
  const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
  return conflitosDoModelo(m).filter((c) => {
    if (c.classe !== 'REDE') return false;
    const par = [porId.get(c.trechoId)?.disciplina, porId.get(c.outroId)?.disciplina].sort().join('×');
    return par === 'ESGOTO×PLUVIAL';
  }).length;
}
const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const piso = (v: number, malha: number) => Math.floor(v / malha + 1e-9) * malha;

/**
 * F24: o trecho do lote, em x, livre em TODA a faixa horizontal [y0, y1] (no quadro da frente) — por varredura a cada
 * 250 mm (as bordas a 1 mm para dentro); `null` se a faixa sai do lote.
 */
function faixaDoLote(anel: readonly Point[], y0: number, y1: number, xRef?: number): { xMin: number; xMax: number } | null {
  let xMin = -Infinity;
  let xMax = Infinity;
  const passos = Math.max(1, Math.ceil((y1 - y0) / 250));
  for (let k = 0; k <= passos; k++) {
    const y = Math.min(y1 - 1, Math.max(y0 + 1, y0 + (k * (y1 - y0)) / passos));
    const xs: number[] = [];
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (xs.length < 2) return null;
    // Anel não convexo (L, U): na linha, o trecho que contém a referência; sem ela, o de fora a fora.
    xs.sort((a, b) => a - b);
    let lo = xs[0];
    let hi = xs[xs.length - 1];
    if (xRef !== undefined) {
      const k = xs.findIndex((x, j) => j % 2 === 0 && j + 1 < xs.length && xRef >= x && xRef <= xs[j + 1]);
      if (k < 0) return null;
      lo = xs[k];
      hi = xs[k + 1];
    }
    xMin = Math.max(xMin, lo);
    xMax = Math.min(xMax, hi);
  }
  return xMax > xMin ? { xMin, xMax } : null;
}

/**
 * F24: o anel (anti-horário, y para os fundos) da união do retângulo da frente `a` com o anexo `b` colado na borda de
 * trás dele (`b.y0 === a.y1`); sem vértice repetido nem colinear.
 */
export function anelDoL(a: Retangulo, b: Retangulo): Point[] {
  const bruto: Point[] = [
    point(a.x0, a.y0), point(a.x1, a.y0), point(a.x1, a.y1),
    point(b.x1, a.y1), point(b.x1, b.y1), point(b.x0, b.y1), point(b.x0, a.y1),
    point(a.x0, a.y1),
  ];
  const semRepetir = bruto.filter((p, i) => { const q = bruto[(i + bruto.length - 1) % bruto.length]; return p.x !== q.x || p.y !== q.y; });
  return semRepetir.filter((p, i) => {
    const q = semRepetir[(i + semRepetir.length - 1) % semRepetir.length];
    const r = semRepetir[(i + 1) % semRepetir.length];
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) !== 0;
  });
}

/** F12: o sobrado na implantação — a área útil do pavimento MAIOR (com o núcleo da escada) e a altura total. */
export interface ImplantacaoDoSobrado {
  utilPorPavimentoM2: number;
  alturaM: number;
  /** F27-D: quantos pavimentos sobre o mesmo retângulo (2 = sobrado; 3 = o 2º recuado sobre o 1º). Ausente = 2. */
  pavimentos?: 2 | 3;
}

/**
 * O retângulo da casa no lote, pela lei. `ctx` é o mesmo do estudo de massa
 * (terreno, divisas com papel, recuos da zona, índices da zona). Com `sobrado`, o retângulo serve aos N
 * pavimentos (2, ou 3 na F27-D): o programa é o do pavimento maior, o CA divide o potencial por N, os recuos são os
 * da altura da casa e o gabarito da zona precisa deixar N pavimentos.
 */
export function implantacaoDaCasa(
  ctx: ContextoDaMassa,
  programa: Programa,
  curto: Pick<ProgramaCurtoDaCasa, 'vagas' | 'garagemCoberta'>,
  hipParcial: Partial<HipotesesDaImplantacao> = {},
  sobrado: ImplantacaoDoSobrado | null = null,
): ResultadoDaImplantacao {
  const hip = { ...HIPOTESES_DA_IMPLANTACAO_PADRAO, ...hipParcial };
  const terreno = ctx.terreno && ctx.terreno.anel.length >= 3 ? ctx.terreno : null;
  if (!terreno) return { ok: false, motivo: 'Feche o lote (as divisas do terreno) na aba Terreno.' };
  const quadro = quadroDaFrente(ctx.limites, terreno.anel);
  if (!quadro) return { ok: false, motivo: 'Marque a divisa da FRENTE do lote — a casa se implanta a partir dela.' };

  const pav = sobrado ? (sobrado.pavimentos ?? 2) : 1;
  // O nome da casa e o que gerar no lugar, para as mensagens do gabarito.
  const casa = pav === 3 ? 'a casa de 3 pavimentos' : 'o sobrado';
  const noLugar = pav === 3 ? 'gere o sobrado (2 pavimentos)' : 'gere a casa térrea';
  if (sobrado && ctx.zona.gabaritoPavimentos != null && ctx.zona.gabaritoPavimentos < pav) return { ok: false, motivo: `A zona permite ${ctx.zona.gabaritoPavimentos} ${ctx.zona.gabaritoPavimentos === 1 ? 'pavimento' : 'pavimentos'} — ${casa} não cabe; ${noLugar}.` };
  if (sobrado && ctx.zona.gabaritoAlturaMaxM != null && ctx.zona.gabaritoAlturaMaxM < sobrado.alturaM) return { ok: false, motivo: `O gabarito da zona (${f2(ctx.zona.gabaritoAlturaMaxM)} m) é menor que a altura d${pav === 3 ? 'a casa de 3 pavimentos' : 'o sobrado'} (${f2(sobrado.alturaM)} m) — ${noLugar}.` };
  const legal = envelopeLegal(ctx);
  const ef = recuosEfetivos(ctx.recuosBase, { afastamentoProgressivo: ctx.zona.afastamentoProgressivo, recuoFrenteEscalonado: ctx.zona.recuoFrenteEscalonado ?? null }, sobrado ? sobrado.alturaM : 3, pav);
  const env = envelopeConstrutivo(terreno, ctx.limites, ef.recuos);
  if (!env.valido || env.anel.length < 3) return { ok: false, motivo: 'Os recuos da zona não deixam área edificável no lote.' };
  // Arredondado ao mm: o kernel só aceita milímetro inteiro (lote girado dá frações).
  const envLocal = env.anel.map((p) => paraLocal(quadro, p)).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const rmax = maiorRetanguloInscrito(envLocal);
  if (!rmax) return { ok: false, motivo: 'Não cabe um retângulo no envelope dos recuos.' };

  const loteM2 = terreno.areaMm2 / 1e6;
  const e = hip.espessuraExternaMm;
  const projecao = (W: number, D: number) => ((W + e) * (D + e)) / 1e6;
  const avisos: string[] = [];

  // O que o programa pede, como projeção: área útil × fator das paredes internas → eixos; + meia parede externa.
  const util = sobrado ? sobrado.utilPorPavimentoM2 : resumoDoPrograma(programa).areaIdealComCirculacaoM2;
  const retPedidoM2 = util * hip.fatorDoRetanguloSobreUtil;
  const ladoPedido = Math.sqrt(retPedidoM2 * 1e6);
  const projecaoPedidaM2 = m2(projecao(ladoPedido * Math.sqrt(hip.proporcaoFrenteFundo), ladoPedido / Math.sqrt(hip.proporcaoFrenteFundo)));

  // Os tetos de projeção, cada um com o seu nome.
  const tetos: { limitante: LimitanteDaImplantacao; m2: number }[] = [{ limitante: 'PROGRAMA', m2: projecaoPedidaM2 }];
  if (legal.implantacaoMaxM2 != null) tetos.push({ limitante: 'TO', m2: legal.implantacaoMaxM2 * (1 - hip.folgaDaTOPct / 100) });
  if (legal.potencialM2 != null) tetos.push({ limitante: 'CA', m2: legal.potencialM2 / pav });
  const vagasDescobertas = curto.garagemCoberta ? 0 : Math.max(0, curto.vagas);
  const pavimentacaoM2 = (loteM2 * hip.pavimentacaoExternaPctDoLote) / 100 + vagasDescobertas * hip.areaPorVagaDescobertaM2;
  const permMin = ctx.zona.taxaPermeabilidadeMinPct;
  const impermeavelMaxM2 = permMin != null ? loteM2 * (1 - permMin / 100) - pavimentacaoM2 : null;
  if (impermeavelMaxM2 != null) tetos.push({ limitante: 'PERMEABILIDADE', m2: Math.max(0, impermeavelMaxM2) });
  const teto = tetos.reduce((a, b) => (b.m2 < a.m2 ? b : a));
  if (teto.m2 <= 0) return { ok: false, motivo: `${ROTULO_DO_LIMITANTE[teto.limitante]} não deixa área para a casa neste lote.` };

  // Forma: proporção pedida, presa no maior retângulo do envelope.
  const Wmax = rmax.x1 - rmax.x0;
  const Dmax = rmax.y1 - rmax.y0;
  const alvoEixosMm2 = (() => {
    // resolve (W+e)(D+e) = teto com W = p·D: p·D² + e(p+1)·D + e² − teto = 0
    const p = hip.proporcaoFrenteFundo;
    const A = teto.m2 * 1e6;
    const D = (-e * (p + 1) + Math.sqrt(e * e * (p + 1) ** 2 - 4 * p * (e * e - A))) / (2 * p);
    return { W: p * D, D };
  })();
  let W = alvoEixosMm2.W;
  let D = alvoEixosMm2.D;
  let limitante = teto.limitante;
  if (W > Wmax) {
    W = Wmax;
    D = (teto.m2 * 1e6) / (W + e) - e;
  }
  if (D > Dmax) {
    D = Dmax;
    W = Math.min(Wmax, (teto.m2 * 1e6) / (D + e) - e);
  }
  if (projecao(W, D) < teto.m2 - 0.5) limitante = 'ENVELOPE';
  // Item 9: a largura mínima pedida (os mínimos do programa não cabiam) — alarga, a profundidade fica; passando da TO,
  // a profundidade cede só o necessário.
  if (hip.larguraMinimaMm != null && W < hip.larguraMinimaMm) {
    W = Math.min(Wmax, hip.larguraMinimaMm);
    const toMax = legal.implantacaoMaxM2 != null ? legal.implantacaoMaxM2 * (1 - hip.folgaDaTOPct / 100) : null;
    if (toMax != null && projecao(W, D) > toMax) D = (toMax * 1e6) / (W + e) - e;
  }
  W = piso(W, hip.malhaMm);
  D = piso(D, hip.malhaMm);
  if (W < 3000 || D < 3000) return { ok: false, motivo: `Sobra só ${f2(W / 1000)} × ${f2(D / 1000)} m para a casa — ${ROTULO_DO_LIMITANTE[limitante]} aperta demais.` };

  // Posição: no recuo de frente, encostada na divisa escolhida.
  const xNaDivisa = (w: number) => (hip.encostarNaDivisa === 'ESQUERDA' ? rmax.x0 : hip.encostarNaDivisa === 'DIREITA' ? rmax.x1 - w : piso(rmax.x0 + (Wmax - w) / 2, hip.malhaMm));
  let x0 = xNaDivisa(W);
  let y0 = rmax.y0;

  // F26: a rampa de veículos pede recuo de frente — a casa vai para trás (aprofundando menos, alargando o que a frente
  // deixa); sem profundidade para isso, fica onde estava e quem chama diz por quê.
  if (hip.recuoMinimoDeFrenteMm > 0) {
    const yF = Math.min(...terreno.anel.map((p) => paraLocal(quadro, p).y));
    const yMin = Math.ceil((yF + hip.recuoMinimoDeFrenteMm + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm;
    if (yMin > y0) {
      const Dr = Math.min(D, piso(rmax.y1 - yMin, hip.malhaMm));
      const Wr = Dr < D ? Math.min(Wmax, piso((teto.m2 * 1e6) / (Dr + e) - e, hip.malhaMm)) : W;
      if (Dr >= 3000 && Wr >= 3000) {
        if (projecao(Wr, Dr) < projecao(W, D) - 0.5) limitante = 'RAMPA';
        avisos.push(`Garagem: a rampa de veículos pede ${f2(hip.recuoMinimoDeFrenteMm / 1000)} m da frente à fachada — a casa recua ${f2((yMin - y0) / 1000)} m.`);
        W = Wr;
        D = Dr;
        y0 = yMin;
        x0 = xNaDivisa(W);
      }
    }
  }

  // F24: as vagas descobertas. Cabem no recuo de frente diante da casa → ficam ali. Senão: recuar a casa (as fileiras
  // de vagas à frente dela) ou abrir a faixa ao lado (a casa estreita e aprofunda para não perder área).
  let vagasDescobertasLocal: ImplantacaoDaCasa['vagasDescobertas'] = null;
  if (vagasDescobertas > 0) {
    const { larguraMm: vL, comprimentoMm: vC } = DIMENSAO_DA_VAGA.COMUM;
    const loteLocal = terreno.anel.map((p) => paraLocal(quadro, p));
    const yFrente = Math.min(...loteLocal.map((p) => p.y));
    const cabemNaFrente = (w: number, yCasa: number) => Math.floor(w / vL) * Math.floor((yCasa - e / 2 - yFrente) / vC);
    const frente = (x: number, w: number, yCasa: number): Retangulo => ({ x0: x, x1: x + w, y0: yFrente, y1: yCasa - e / 2 });
    if (cabemNaFrente(W, y0) >= vagasDescobertas) vagasDescobertasLocal = { caixa: frente(x0, W, y0), onde: 'RECUO_DE_FRENTE' };
    else {
      type Opcao = { W: number; D: number; x0: number; y0: number; caixa: Retangulo; onde: 'RECUO_DE_FRENTE' | 'AO_LADO'; perde: boolean };
      const opcoes: Opcao[] = [];
      // RECUAR: as fileiras pedidas, na largura da casa.
      const colunas = Math.floor(W / vL);
      if (hip.vagaDescoberta !== 'AO_LADO' && colunas >= 1) {
        const y0r = Math.ceil((yFrente + Math.ceil(vagasDescobertas / colunas) * vC + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm;
        const Dr = Math.min(D, piso(rmax.y1 - y0r, hip.malhaMm));
        const Wr = Dr < D ? Math.min(Wmax, piso((teto.m2 * 1e6) / (Dr + e) - e, hip.malhaMm)) : W;
        if (Dr >= 3000 && Wr >= 3000) opcoes.push({ W: Wr, D: Dr, x0: xNaDivisa(Wr), y0: y0r, caixa: frente(xNaDivisa(Wr), Wr, y0r), onde: 'RECUO_DE_FRENTE', perde: projecao(Wr, Dr) < projecao(W, D) - 0.5 });
      }
      // AO_LADO: a faixa da largura de uma vaga, as vagas em fila da rua para dentro, no lado oposto ao encosto.
      if (hip.vagaDescoberta !== 'RECUAR') {
        const fundoDaFaixa = yFrente + vagasDescobertas * vC;
        const larg = faixaDoLote(loteLocal, yFrente, fundoDaFaixa, x0 + W / 2);
        if (larg) {
          const aDireita = hip.encostarNaDivisa !== 'DIREITA';
          const caixa: Retangulo = aDireita ? { x0: larg.xMax - vL, x1: larg.xMax, y0: yFrente, y1: fundoDaFaixa } : { x0: larg.xMin, x1: larg.xMin + vL, y0: yFrente, y1: fundoDaFaixa };
          const xCasa = aDireita ? x0 : Math.max(x0, Math.ceil((caixa.x1 + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm);
          const Wl = Math.min(W, piso(aDireita ? caixa.x0 - e / 2 - xCasa : x0 + W - xCasa, hip.malhaMm));
          const Dl = Wl < W ? Math.min(Dmax, piso((teto.m2 * 1e6) / (Wl + e) - e, hip.malhaMm)) : D;
          if (Wl >= 3000 && Dl >= 3000) opcoes.push({ W: Wl, D: Dl, x0: xCasa, y0, caixa, onde: 'AO_LADO', perde: projecao(Wl, Dl) < projecao(W, D) - 0.5 });
        }
      }
      const semPerder = opcoes.find((o) => o.onde === 'RECUO_DE_FRENTE' && !o.perde) ?? opcoes.find((o) => !o.perde);
      const escolhida = semPerder ?? [...opcoes].sort((a, b) => projecao(b.W, b.D) - projecao(a.W, a.D))[0];
      if (escolhida) {
        ({ W, D, x0, y0 } = escolhida);
        vagasDescobertasLocal = { caixa: escolhida.caixa, onde: escolhida.onde };
        if (escolhida.perde) limitante = 'VAGAS';
        avisos.push(
          escolhida.onde === 'AO_LADO'
            ? `Vagas descobertas: o recuo de frente não comporta ${vagasDescobertas} vaga(s) de ${f2(vL / 1000)} × ${f2(vC / 1000)} m — a casa estreita e as vagas vão numa faixa ao lado dela, da rua para dentro.`
            : `Vagas descobertas: o recuo de frente não comportava ${vagasDescobertas} vaga(s) de ${f2(vL / 1000)} × ${f2(vC / 1000)} m — a casa recua ${f2((y0 - rmax.y0) / 1000)} m.`,
        );
      } else vagasDescobertasLocal = { caixa: frente(x0, W, y0), onde: 'RECUO_DE_FRENTE' };
    }
  }
  // F24: a casa em L. O retângulo da frente fica mais raso e um anexo nasce colado atrás dele, no que o envelope tem
  // atrás (mais largo no trapézio, o braço de trás no lote em L): o de MENOR profundidade total que alcança o teto,
  // com ≥ 3 m de lado e ≥ 3 m em comum com o da frente. Fica só se rende mais área ou deixa a casa mais rasa (larga).
  let contornoLocal: Point[] | null = null;
  let projecaoDoL: number | null = null;
  if (hip.forma === 'L') {
    const alvo = teto.m2;
    const r1De = (D1: number): Retangulo => ({ x0, y0, x1: x0 + W, y1: y0 + D1 });
    const projecaoDe = (a: Retangulo, b: Retangulo) => {
      const comum = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const area = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0);
      const perimetro = 2 * (a.x1 - a.x0 + a.y1 - a.y0) + 2 * (b.x1 - b.x0 + b.y1 - b.y0) - 2 * comum;
      return (area + (perimetro * e) / 2 + e * e) / 1e6;
    };
    const yFundo = Math.max(...envLocal.map((p) => p.y));
    let melhor: { D1: number; r2: Retangulo; proj: number; fundo: number } | null = null;
    for (let D1 = 3000; D1 <= D; D1 += 500) {
      const r1 = r1De(D1);
      for (let d2 = 3000; r1.y1 + d2 <= yFundo + 1e-9; d2 += 250) {
        const f = faixaDoLote(envLocal, r1.y1, r1.y1 + d2, x0 + Math.min(W, 3000) / 2);
        if (!f) break;
        let r2: Retangulo = { x0: Math.ceil(f.xMin / hip.malhaMm - 1e-9) * hip.malhaMm, x1: piso(f.xMax, hip.malhaMm), y0: r1.y1, y1: r1.y1 + d2 };
        if (r2.x1 - r2.x0 < 3000 || Math.min(r2.x1, r1.x1) - Math.max(r2.x0, r1.x0) < 3000) break;
        // Passou do teto: o anexo estreita (preso do lado do encosto), sem ficar abaixo de 3 m nem soltar do da frente.
        if (projecaoDe(r1, r2) > alvo) {
          const sobra = ((projecaoDe(r1, r2) - alvo) * 1e6) / (d2 + e);
          const w2 = Math.max(3000, piso(r2.x1 - r2.x0 - sobra, hip.malhaMm));
          r2 = hip.encostarNaDivisa === 'DIREITA' ? { ...r2, x0: r2.x1 - w2 } : { ...r2, x1: r2.x0 + w2 };
          if (Math.min(r2.x1, r1.x1) - Math.max(r2.x0, r1.x0) < 3000 || projecaoDe(r1, r2) > alvo + 0.5) continue;
        }
        // Degrau entre os dois de 0 ou ≥ 3 m: o de menos vira uma faixa que o gerador toma por anexo (estreita para
        // qualquer cômodo) — aparado no da frente. Os dois na mesma largura são um retângulo (já comparado): fora.
        if (r2.x1 > r1.x1 && r2.x1 - r1.x1 < 3000) r2 = { ...r2, x1: r1.x1 };
        if (r2.x0 < r1.x0 && r1.x0 - r2.x0 < 3000) r2 = { ...r2, x0: r1.x0 };
        if ((r1.x1 > r2.x1 && r1.x1 - r2.x1 < 3000) || (r2.x0 > r1.x0 && r2.x0 - r1.x0 < 3000)) continue;
        if (r2.x0 === r1.x0 && r2.x1 === r1.x1) continue;
        const proj = projecaoDe(r1, r2);
        const c = { D1, r2, proj, fundo: D1 + d2 };
        const valor = (x: typeof c) => Math.min(x.proj, alvo);
        if (!melhor || valor(c) > valor(melhor) + 0.5 || (Math.abs(valor(c) - valor(melhor)) <= 0.5 && c.fundo < melhor.fundo)) melhor = c;
        if (proj >= alvo - 0.5) break;
      }
    }
    const projRet = projecao(W, D);
    if (melhor && (melhor.proj > projRet + 1 || (Math.abs(melhor.proj - projRet) <= 1 && melhor.fundo < D - 1000))) {
      const r1 = r1De(melhor.D1);
      const r2 = melhor.r2;
      D = melhor.D1;
      projecaoDoL = melhor.proj;
      contornoLocal = anelDoL(r1, r2);
      if (melhor.proj >= alvo - 0.5 && limitante === 'ENVELOPE') limitante = teto.limitante;
      avisos.push(`Casa em L: ${f2(W / 1000)} × ${f2(D / 1000)} m na frente e um anexo de ${f2((r2.x1 - r2.x0) / 1000)} × ${f2((r2.y1 - r2.y0) / 1000)} m atrás — o retângulo não comportava o programa.`);
    }
  }

  const retanguloLocal: Retangulo = { x0, y0, x1: x0 + W, y1: y0 + D };
  const cantosLocais = [
    { x: retanguloLocal.x0, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y1 },
    { x: retanguloLocal.x0, y: retanguloLocal.y1 },
  ];
  // Dentro do envelope por construção: é um pedaço do maior retângulo inscrito nele (e o anexo, da faixa dele).
  const anelNoMundo = (contornoLocal ?? cantosLocais).map((p) => paraMundo(quadro, p));

  const projecaoM2 = projecaoDoL ?? projecao(W, D);
  if (limitante !== 'PROGRAMA') {
    avisos.push(`O programa pede ${f2(projecaoPedidaM2)} m² de projeção; ${ROTULO_DO_LIMITANTE[limitante]} ${/^(os|as) /.test(ROTULO_DO_LIMITANTE[limitante]) ? 'permitem' : 'permite'} ${f2(projecaoM2)} m² — as áreas dos ambientes serão reduzidas.`);
  }
  if (legal.faltam.length) avisos.push(`Sem dado da zona: ${legal.faltam.join(', ')} — esse limite não foi aplicado.`);

  const alinhadaAoDesenho = [quadro.ex.x, quadro.ex.y].every((v) => v === 0 || Math.abs(v) === 1);
  return {
    ok: true,
    implantacao: {
      retanguloLocal,
      anelNoMundo,
      quadro,
      direcaoDaFrente: { x: 0 - quadro.ey.x || 0, y: 0 - quadro.ey.y || 0 },
      alinhadaAoDesenho,
      limitante,
      pavimentos: pav,
      vagasDescobertas: vagasDescobertasLocal,
      contornoLocal,
      medidas: {
        loteM2: m2(loteM2),
        projecaoPedidaM2,
        projecaoM2: m2(projecaoM2),
        implantacaoMaxM2: legal.implantacaoMaxM2,
        envelopeM2: m2(Math.abs(polygonArea(env.anel)) / 1e6),
        potencialM2: legal.potencialM2,
        impermeavelMaxM2: impermeavelMaxM2 == null ? null : m2(impermeavelMaxM2),
        toPct: pct((projecaoM2 / loteM2) * 100),
        toMaxPct: ctx.zona.taxaOcupacaoMaxPct,
        coeficiente: Math.round(((projecaoM2 * pav) / loteM2) * 100) / 100,
        coeficienteMax: ctx.zona.coeficienteMax,
        permeabilidadePct: pct(((loteM2 - projecaoM2 - pavimentacaoM2) / loteM2) * 100),
        permeabilidadeMinPct: permMin,
      },
      avisos,
    },
  };
}

/** Texto de uma linha para a tela e o relatório. */
export function resumoDaImplantacao(i: ImplantacaoDaCasa): string {
  const m = i.medidas;
  return `${f2((i.retanguloLocal.x1 - i.retanguloLocal.x0) / 1000)} × ${f2((i.retanguloLocal.y1 - i.retanguloLocal.y0) / 1000)} m · projeção ${f2(m.projecaoM2)} m² · TO ${f1(m.toPct)} %${m.toMaxPct != null ? ` (máx. ${f1(m.toMaxPct)} %)` : ''}${i.pavimentos > 1 ? ` · ${i.pavimentos} pavimentos, CA ${f2(m.coeficiente)}${m.coeficienteMax != null ? ` (máx. ${f2(m.coeficienteMax)})` : ''}` : ''} · permeável ${f1(m.permeabilidadePct)} %${m.permeabilidadeMinPct != null ? ` (mín. ${f1(m.permeabilidadeMinPct)} %)` : ''} · limitada ${LIMITADA_POR[i.limitante]}`;
}

// ─── F3: O ORQUESTRADOR ─────────────────────────────────────────────────────
//
// Molde de `gerarPpci`/`gerarClimatizacao`: cada etapa planeja sobre a CÓPIA de
// trabalho já com as anteriores aplicadas (`applyBatch`), o plano acumula os
// comandos e os ids criados, e `conferirPlanoDaCasa` reaplica no original antes de
// gravar — o kernel dá ids determinísticos (`seq` por prefixo), então o mesmo lote
// no mesmo original cria os MESMOS ids. Um `runBatch`, um Ctrl+Z.
//
// Só a ARQUITETURA é fatal: sem paredes, nenhuma etapa seguinte tem o que fazer.
// As outras (F4 em diante) falham com motivo e o plano segue.
//
// SEMENTES: o E6.2 é determinístico por semente. Achado da F2: num lote estreito
// a área de serviço fica sem lado externo em todas as sementes testadas — então o
// orquestrador gera VÁRIAS e fica com a de menos problemas graves (sem acesso,
// abaixo da mínima, sem fachada exigida); empate → maior nota; empate → menor semente.
//
// QUADRO DA FRENTE: a planta é gerada no quadro local (frente ao sul, `direcaoDaFrente`
// nula) e levada ao mundo. Com a frente num eixo do desenho a transformação é exata.
// Girada, as pontas viram frações e o arredondamento ao mm desfaz a junção em T (o
// kernel só corta parede em interseção EXATA — achado da M6b): a ponta que encontra o
// meio de outra parede passa `ALEM_MM` além, e o offset das aberturas anda junto.

export type EtapaDaCasaId =
  | 'IMPLANTACAO'
  | 'TERRAPLENAGEM'
  | 'ARQUITETURA'
  | 'PILARES'
  | 'VIGAS'
  | 'LAJES'
  | 'FUNDACOES'
  | 'EIXOS'
  | 'TELHADO'
  | 'ANCORAS'
  | 'MOBILIARIO'
  | 'LOUCAS'
  | 'PONTOS_HIDRAULICOS'
  | 'AGUA'
  | 'ESGOTO'
  | 'PLUVIAL'
  | 'PONTOS_ELETRICOS'
  | 'QUADRO'
  | 'CIRCUITOS'
  | 'CLIMATIZACAO'
  | 'DR_DPS'
  | 'ELETRODUTOS'
  | 'FORRO'
  | 'MURO'
  | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DA_CASA: Record<EtapaDaCasaId, string> = {
  IMPLANTACAO: 'Implantação pela lei',
  TERRAPLENAGEM: 'Terraplenagem (o platô da casa no terreno inclinado)',
  ARQUITETURA: 'Arquitetura (gerador E6.2)',
  MURO: 'Muro, portões e calçadas',
  PILARES: 'Pilares',
  VIGAS: 'Vigas',
  LAJES: 'Lajes',
  FUNDACOES: 'Fundações (blocos, estacas, baldrame)',
  EIXOS: 'Eixos (documentam a estrutura)',
  TELHADO: 'Telhado',
  ANCORAS: "Peças-âncora (caixa d'água, aquecedor, caixa de gordura, vagas)",
  MOBILIARIO: 'Mobiliário e louças',
  LOUCAS: 'Pontos das louças (água e esgoto)',
  PONTOS_HIDRAULICOS: 'Pontos que completam o kit (caixa sifonada, ralo…)',
  AGUA: 'Água fria e quente (hidrômetro, alimentador, barrilete, colunas, ramais)',
  ESGOTO: 'Esgoto (caixas, ramais, ventilação, ligação ou tratamento)',
  PLUVIAL: 'Águas pluviais (calhas, condutores, saída)',
  PONTOS_ELETRICOS: 'Pontos elétricos pela norma (tomadas, luz, interruptores, chuveiro elétrico)',
  QUADRO: 'Quadro no centro de cargas e entrada de energia (medidor na frente)',
  CIRCUITOS: 'Circuitos',
  CLIMATIZACAO: 'Climatização (carga térmica, splits, linhas, circuitos)',
  DR_DPS: 'Proteção (DR e DPS) e ligação da entrada',
  ELETRODUTOS: 'Eletrodutos',
  FORRO: 'Forro dos cômodos (as redes nas faixas do plenum)',
  CONFERENCIA: 'Conferência (programa e legislação)',
};
const ORDEM_DAS_ETAPAS = Object.keys(ROTULO_DA_ETAPA_DA_CASA) as EtapaDaCasaId[];

/** F4: as hipóteses da ESTRUTURA — as mesmas das gavetas de lançamento automático (padrões de lá). */
export interface HipotesesDaEstruturaDaCasa {
  /** `false` = a casa sai só com a arquitetura. */
  lancar: boolean;
  eixos: Partial<HipotesesDeEixos>;
  pilares: HipotesesDePilares;
  vigas: HipotesesDeVigas;
  lajes: HipotesesDeLajes;
  fundacoes: HipotesesDeFundacoes;
}

export const HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO: HipotesesDaEstruturaDaCasa = {
  lancar: true,
  eixos: HIPOTESES_EIXOS_PADRAO,
  pilares: HIPOTESES_PILARES_PADRAO,
  vigas: HIPOTESES_VIGAS_PADRAO,
  lajes: HIPOTESES_LAJES_PADRAO,
  fundacoes: HIPOTESES_FUNDACOES_PADRAO,
};

export interface EtapaDaCasa {
  id: EtapaDaCasaId;
  rotulo: string;
  situacao: SituacaoDaEtapa;
  comandos: number;
  nota: string | null;
}

export interface EntradaDaCasa {
  /** O pavimento onde a casa nasce — precisa estar sem paredes. */
  levelId: ObjectId;
  /** Terreno, divisas com papel, recuos e índices da zona (o contexto do estudo de massa). */
  ctx: ContextoDaMassa;
  curto: ProgramaCurtoDaCasa;
  /** Programa já editado pelo usuário; ausente = `programaDaCasa(curto)`. */
  programa?: Programa | null;
  /** A zona inteira para as regras (testada mínima, área mínima do lote…). Ausente = só o que `ctx.zona` tem. */
  zonaDasRegras?: ContextoDeRegras['zona'];
  rotacaoNorteDeg: number | null;
  latitudeGraus: number;
  /**
   * F6: as premissas hidrossanitárias do ESTUDO (`blueprint_study_hidro`) — reservação, esgoto (destino: rede
   * pública × tratamento), pluvial. Ausente = `HIPOTESES_HIDRO_PADRAO`.
   */
  hidro?: HipotesesHidro | null;
  /**
   * F8: a cota do terreno em cada ponto (a topografia do estudo) — a caixa de inspeção, a ligação e o
   * hidrômetro na frente do lote leem a cota dali. Ausente = terreno plano na cota zero. (Não é clonável: a F10
   * passa a grade ao worker e monta o leitor lá.)
   */
  leitorDoTerreno?: LeitorDoTerreno | null;
  /**
   * F25: a GRADE da topografia do estudo (o leitor acima é feito dela) — a terraplenagem do platô precisa dela inteira.
   * Ausente = a casa fica na cota zero do desenho (sem a etapa de terraplenagem).
   */
  gradeDoTerreno?: GradeDeElevacao | null;
  /** F9: as hipóteses de circuitos do estudo (a gaveta de circuitos). Ausente = `HIPOTESES_CIRCUITOS_PADRAO`. */
  circuitos?: HipotesesDeCircuitos | null;
  /** F9: as hipóteses elétricas do estudo (`blueprint_study_eletrica`). Ausente = o padrão. */
  eletricas?: HipotesesEletricas | null;
  /** F9: as premissas de climatização do estudo — o clima (TBS/TBU externas) e as condições internas. */
  climatizacao?: HipotesesClimatizacao | null;
  /** F9: o catálogo de evaporadoras (`modelosDoCatalogo`). Vazio ou ausente = a climatização não roda, e diz. */
  modelosDeClimatizacao?: readonly ModeloDoCatalogo[] | null;
  /**
   * F10: o contexto da carga térmica que o editor dá ao gerador de climatização dele — os materiais da biblioteca
   * (o U das paredes e do teto) e a cidade da zona (o clima). Ausente = o padrão do gerador.
   */
  cargaDaClimatizacao?: ContextoDoGeradorDeClimatizacao['carga'] | null;
}

export interface HipotesesDaCasa {
  /** F12: 1 = térrea; 2 = sobrado (social e serviço embaixo, íntimo em cima, escada em U num núcleo). */
  /**
   * F12: 1 = térrea; 2 = sobrado. F22 (decisão do usuário, 17/10/2026: "opção Automático"): 'AUTOMATICO' gera a térrea e,
   * se ela não comporta o programa (medida mínima de ambiente violada ou o programa acima da TO), também o sobrado — e fica
   * com o de menos problemas. F27-D (decisão do usuário, 18/10/2026): 3 = térreo social, 1º íntimo, 2º recuado com a
   * suíte principal, o escritório e o terraço — em subfases; até a D2 o 3 só calcula a implantação.
   */
  pavimentos: 1 | 2 | 3 | 'AUTOMATICO';
  /** F12: o núcleo da escada, a laje entre os pavimentos e a escada. */
  sobrado: HipotesesDoSobrado;
  programa: HipotesesDoProgramaDaCasa;
  implantacao: Partial<HipotesesDaImplantacao>;
  /** F25: o platô no terreno inclinado (decisão do usuário: platô único). */
  terraplenagem: HipotesesDaTerraplenagemDaCasa;
  /** F26: o muro, os portões e as calçadas (decisão do usuário: muro + portão + calçada; família nova no kernel). */
  muro: HipotesesDoMuroDaCasa;
  gerador: Partial<HipotesesDoGerador>;
  /** As sementes que o E6.2 tenta; fica a de menos problemas graves. */
  sementes: number[];
  estrutura: HipotesesDaEstruturaDaCasa;
  /** F5: a cobertura (`lancar: false` = sem telhado). */
  telhado: HipotesesDoTelhado;
  /** F6: caixa d'água, aquecedor, caixa de gordura e vagas. */
  ancoras: HipotesesDasAncoras;
  /** F7: o mobiliário mínimo (as louças lançam os pontos) e os pontos do kit hidráulico. */
  mobiliario: HipotesesDeMobiliario & { lancar: boolean };
  pontos: HipotesesDePontos;
  /** F8: lançar as redes de água, esgoto e pluvial (as premissas são as do estudo, em `EntradaDaCasa.hidro`). */
  hidraulica: { lancar: boolean };
  /** F9: a elétrica. */
  eletrica: HipotesesDaEletricaDaCasa;
  /** F9: lançar a climatização (premissas e catálogo na `EntradaDaCasa`). */
  /**
   * F14d (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): a evaporadora na parede externa, mesmo
   * sobre a janela, com o topo a `folgaDaEvaporadoraAoForroMm` do forro; a linha e o dreno saem juntos pela parede.
   */
  climatizacao: { lancar: boolean; naParedeExterna: boolean; folgaDaEvaporadoraAoForroMm: number };
  /** F13: como garantir a pressão nos pontos — caixa elevada até um limite, senão pressurizador. */
  pressao: HipotesesDaPressaoDaCasa;
  /**
   * F14a (decisão do usuário: "forro com faixas"): o afastamento lateral de cada rede em relação ao eixo das paredes
   * (e ao centro do shaft), mm — a água fria fica no eixo. Igual nas duas direções do quadro da frente.
   */
  faixas: { aguaQuenteMm: number; esgotoMm: number };
  /**
   * F14b (decisões do usuário: "forro com faixas", 15/10, e "manter 2,80 m, furar vigas", 16/10): o forro dos cômodos e
   * a faixa de cada rede no plenum acima dele. `lancar: false` = como até a F14a (as redes 10 cm sob a viga, sem forro).
   */
  forro: HipotesesDoForroDaCasa;
}

/** F14b — o forro e as faixas das redes no plenum. */
export interface HipotesesDoForroDaCasa {
  lancar: boolean;
  /** Pé-direito livre mínimo (do piso acabado à face do forro), mm: cômodos de permanência (sala, dormitório, suíte, cozinha, escritório) e os demais. */
  peDireitoLivrePermanenciaMm: number;
  peDireitoLivreDemaisMm: number;
  /** A espessura do piso acabado na conta do pé-direito livre (a casa não lança o piso), mm. */
  pisoAcabadoMm: number;
  /** O forro fica a esta folga abaixo do tubo mais baixo do plenum, mm. */
  folgaSobAFaixaMm: number;
  /** A descida até o ponto entra na parede a esta folga do fundo da viga, mm. */
  folgaSobAVigaMm: number;
  /** A faixa de cada rede: cota (abaixo da laje) e afastamento da face da parede ou da viga. */
  eletrica: FaixaDoForro;
  frigorigena: FaixaDoForro;
  aguaQuente: FaixaDoForro;
  aguaFria: FaixaDoForro;
}

/**
 * As faixas, de cima para baixo: eletroduto, linha frigorígena, água quente, água fria. Entre duas faixas, a soma dos
 * MAIORES raios das duas (a conferência de conflitos mede o tubo como esfera: a linha frigorígena, com os dois tubos
 * lado a lado, conta 39 mm) mais 5 mm; o eletroduto de 75 mm do quadro ainda passa sob a laje. Para dentro do cômodo,
 * cada uma ~60 mm além da anterior: a descida de uma não cruza o ramal da outra (afastamento ≥ soma dos raios). Com
 * pé-direito de 2,80 m, o forro fica a 2,55 m — o pé-direito livre de 2,50 m com 5 cm de piso.
 */
export const HIPOTESES_DO_FORRO_DA_CASA_PADRAO: HipotesesDoForroDaCasa = {
  lancar: true,
  peDireitoLivrePermanenciaMm: 2500,
  peDireitoLivreDemaisMm: 2300,
  pisoAcabadoMm: 50,
  folgaSobAFaixaMm: 15,
  folgaSobAVigaMm: 50,
  eletrica: { abaixoDoTetoMm: 45, afastamentoDaFaceMm: 50, degrauNaParedeMm: 0 },
  frigorigena: { abaixoDoTetoMm: 115, afastamentoDaFaceMm: 140, degrauNaParedeMm: 0 },
  // F14c: dentro da parede, abaixo da viga, cada rede no seu degrau — a elétrica logo abaixo, a fria 6 cm mais baixo,
  // a quente 12 cm (os dois raios e 2 cm entre cada par).
  aguaQuente: { abaixoDoTetoMm: 170, afastamentoDaFaceMm: 200, degrauNaParedeMm: 120 },
  aguaFria: { abaixoDoTetoMm: 202, afastamentoDaFaceMm: 250, degrauNaParedeMm: 60 },
};

const FAIXAS_DO_FORRO = ['eletrica', 'frigorigena', 'aguaQuente', 'aguaFria'] as const;
/** O raio do tubo da faixa mais baixa (a água fria) na conta do rebaixo — DN 32 de PVC, o maior ramal da casa. */
const RAIO_NO_PLENUM_MM = 16;

/** O rebaixo do forro (da laje à face de cima dele): a faixa mais baixa, o raio do tubo e a folga. */
export function rebaixoDoForroMm(f: HipotesesDoForroDaCasa): number {
  return Math.max(...FAIXAS_DO_FORRO.map((k) => f[k].abaixoDoTetoMm)) + RAIO_NO_PLENUM_MM + f.folgaSobAFaixaMm;
}

const USOS_DE_PERMANENCIA = new Set(['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'ESCRITORIO']);
/** F14b: o raio dos eletrodutos que sobem do quadro (o tronco chega a DN 75). */
const SUBIDA_DO_QUADRO_MM = 37.5;

/** F13 (decisão do usuário, 15/10/2026: "escolher por caso"). */
export interface HipotesesDaPressaoDaCasa {
  /** Resolver a pressão (desligado = só a pendência, como antes). */
  resolver: boolean;
  /** Quanto a caixa d'água pode SUBIR além da posição dela (a base elevada / torre), mm; acima disso, pressurizador. */
  caixaElevadaAteMm: number;
  /** A potência do pressurizador (o ponto elétrico dele, ligação direta), W. */
  potenciaDoPressurizadorW: number;
}

export const HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO: HipotesesDaPressaoDaCasa = { resolver: true, caixaElevadaAteMm: 2000, potenciaDoPressurizadorW: 370 };

/** O maior déficit de pressão entre os pontos de água (fria e quente), em metros de coluna; 0 = todos atendidos. */
export function deficitDePressaoM(model: BlueprintModel, hip?: HipotesesDePressao): number {
  let d = 0;
  for (const r of pressoesDoModelo(model, hip)) for (const p of r.pontos) if (p.estado === 'INSUFICIENTE' && p.disponivelKpa != null) d = Math.max(d, (p.minimaKpa - p.disponivelKpa) / KPA_POR_MCA);
  return d;
}

/** Folga sobre o déficit ao elevar a caixa, e o passo da elevação, mm. */
const FOLGA_DA_ELEVACAO_MM = 100;
const PASSO_DA_ELEVACAO_MM = 50;
/** Onde o pressurizador fica em relação à caixa (fora do tubo de saída, dentro do raio que o cálculo reconhece), mm. */
const PRESSURIZADOR_AO_LADO_DA_CAIXA_MM = 400;

export interface DecisaoDaPressao {
  solucao: 'NENHUMA' | 'CAIXA_ELEVADA' | 'PRESSURIZADOR';
  comandos: Command[];
  /** O déficit antes, e o que sobra depois (m de coluna). */
  deficitM: number;
  restanteM: number;
  elevacaoMm: number;
  /** O plano da água JÁ traçado sobre o modelo com estes comandos (a última simulação) — a etapa ÁGUA o reaproveita. */
  plano: ReturnType<typeof planejarAguaCompleta> | null;
}

/**
 * F13 — A PRESSÃO POR CASO: simula a água como o lançamento vai fazê-la e mede o maior déficit; se elevar a caixa
 * (em passos de 50 mm, com folga) até `caixaElevadaAteMm` resolve, eleva; senão, põe o PRESSURIZADOR na saída dela
 * (a bomba a 40 cm da caixa — o cálculo de pressão soma o ganho dele). Os comandos vão ANTES do traçado da água, que
 * então ajusta os diâmetros já contando com a solução.
 */
export function decidirPressao(model: BlueprintModel, hidro: HipotesesHidro, terreno: LeitorDoTerreno | null, hip: HipotesesDaPressaoDaCasa): DecisaoDaPressao {
  const nada: DecisaoDaPressao = { solucao: 'NENHUMA', comandos: [], deficitM: 0, restanteM: 0, elevacaoMm: 0, plano: null };
  const caixa = (model.terminais ?? []).find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && t.papelReservatorio !== 'INFERIOR');
  if (!caixa || !hip.resolver) return nada;
  const simular = (cmds: Command[]) => {
    const m1 = cmds.length ? applyBatch(model, cmds).model : model;
    const plano = planejarAguaCompleta(m1, hidro, terreno);
    return { deficit: deficitDePressaoM(plano.comandos.length ? applyBatch(m1, plano.comandos).model : m1, hidro.pressao), plano };
  };
  const inicial = simular([]);
  const deficitM = inicial.deficit;
  if (deficitM <= 0) return { ...nada, deficitM, plano: inicial.plano };
  const passo = (mm: number) => Math.ceil(mm / PASSO_DA_ELEVACAO_MM) * PASSO_DA_ELEVACAO_MM;
  // Subir a caixa 1 m rende no máximo 1 m (medido: ~0,9 — o ajuste de diâmetro muda junto): com o déficit acima do
  // limite, nem tenta. Senão, sobe pelo déficit e confere; o que sobrar entra na próxima (a última, no limite).
  let subir = passo(deficitM * 1000 + FOLGA_DA_ELEVACAO_MM);
  if (subir <= hip.caixaElevadaAteMm) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const alvo = Math.min(subir, hip.caixaElevadaAteMm);
      const cmd: Command = { type: 'SetTerminalProps', terminalId: caixa.id, cotaMm: caixa.cotaMm + alvo } as Command;
      const r = simular([cmd]);
      if (r.deficit <= 0) return { solucao: 'CAIXA_ELEVADA', comandos: [cmd], deficitM, restanteM: 0, elevacaoMm: alvo, plano: r.plano };
      if (alvo >= hip.caixaElevadaAteMm) break;
      subir = passo(alvo + r.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
    }
  }
  const bomba: Command = {
    type: 'AddTerminal', levelId: caixa.levelId, disciplina: 'AGUA_FRIA', tipo: 'Pressurizador', at: point(caixa.at.x + PRESSURIZADOR_AO_LADO_DA_CAIXA_MM, caixa.at.y),
    cotaMm: caixa.cotaMm, tipoHidraulico: 'BOMBA', rotulo: 'Pressurizador', sugerida: true,
  } as Command;
  const comBomba = simular([bomba]);
  if (comBomba.deficit <= 0) return { solucao: 'PRESSURIZADOR', comandos: [bomba], deficitM, restanteM: 0, elevacaoMm: 0, plano: comBomba.plano };
  // F14c: o pressurizador sozinho não basta (sobrado: a quente do chuveiro de cima sai do aquecedor do térreo por um
  // caminho longo) — com ele, a caixa também sobe, até o limite; o que ainda faltar fica dito na verificação.
  let melhor = { comandos: [bomba] as Command[], restanteM: comBomba.deficit, elevacaoMm: 0, plano: comBomba.plano };
  let subirJunto = passo(comBomba.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const alvo = Math.min(subirJunto, hip.caixaElevadaAteMm);
    const cmd: Command = { type: 'SetTerminalProps', terminalId: caixa.id, cotaMm: caixa.cotaMm + alvo } as Command;
    const junto = { ...bomba, cotaMm: caixa.cotaMm + alvo } as Command;
    const r = simular([cmd, junto]);
    if (r.deficit < melhor.restanteM) melhor = { comandos: [cmd, junto], restanteM: r.deficit, elevacaoMm: alvo, plano: r.plano };
    if (r.deficit <= 0 || alvo >= hip.caixaElevadaAteMm) break;
    subirJunto = passo(alvo + r.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
  }
  return { solucao: 'PRESSURIZADOR', comandos: melhor.comandos, deficitM, restanteM: Math.max(0, melhor.restanteM), elevacaoMm: melhor.elevacaoMm, plano: melhor.plano };
}

/** F9: as hipóteses da elétrica da casa. */
export interface HipotesesDaEletricaDaCasa {
  lancar: boolean;
  /** Uma luz de teto a cada tantos m² (null = uma por ambiente — a da norma). */
  areaPorLuminariaM2: number | null;
  /** A potência do chuveiro elétrico (a ligação direta no banheiro), W. */
  chuveiroEletricoVA: number;
  /** Lançar a entrada de serviço e o medidor na frente do lote, ligados ao quadro. */
  medidor: boolean;
}

export const HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO: HipotesesDaEletricaDaCasa = {
  lancar: true,
  areaPorLuminariaM2: null,
  chuveiroEletricoVA: 5500,
  medidor: true,
};

export const HIPOTESES_DA_CASA_PADRAO: HipotesesDaCasa = {
  pavimentos: 1,
  sobrado: HIPOTESES_DO_SOBRADO_PADRAO,
  programa: HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  implantacao: {},
  terraplenagem: HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO,
  muro: HIPOTESES_DO_MURO_DA_CASA_PADRAO,
  gerador: {},
  sementes: [1, 2, 3, 4, 5, 6, 7, 8],
  estrutura: HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO,
  telhado: HIPOTESES_DO_TELHADO_PADRAO,
  ancoras: HIPOTESES_DAS_ANCORAS_PADRAO,
  mobiliario: { ...HIPOTESES_MOBILIARIO_PADRAO, lancar: true },
  // F14a: fria e quente da mesma louça lado a lado (15 cm, como o misturador).
  pontos: { ...HIPOTESES_PONTOS_PADRAO, afastamentoFriaQuenteMm: 150 },
  hidraulica: { lancar: true },
  eletrica: HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO,
  climatizacao: { lancar: true, naParedeExterna: true, folgaDaEvaporadoraAoForroMm: 30 },
  pressao: HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO,
  faixas: { aguaQuenteMm: 45, esgotoMm: -60 },
  forro: HIPOTESES_DO_FORRO_DA_CASA_PADRAO,
};

export interface PlanoDaCasa {
  levelId: ObjectId;
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDaCasa[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
  programa: Programa;
  implantacao: ImplantacaoDaCasa | null;
  /** A alternativa do E6.2 escolhida (no quadro da frente). */
  semente: number | null;
  /** Por que esta semente: "2 de 4 sem problema grave; nota 71". */
  escolha: string | null;
  decisoes: string[];
  /** F12: o pavimento de cima, o núcleo e a escada; `null` na térrea. */
  sobrado: ResumoDoSobrado | null;
  resumo: {
    areaConstruidaM2: number | null;
    ambientesPedidos: number;
    ambientesAtendidos: number;
    regrasVioladas: number;
    /** F4: peças de estrutura lançadas. */
    estrutura: { eixos: number; pilares: number; vigas: number; lajes: number; blocos: number; estacas: number; baldrames: number };
    /** F5: a cobertura lançada; `null` sem telhado. */
    telhado: ResumoDoTelhado | null;
    /** F6: as peças-âncora postas; `null` quando a etapa não rodou. */
    ancoras: ResultadoDasAncoras['resumo'] | null;
    /** F7: peças de mobiliário e pontos hidráulicos lançados. */
    mobiliario: { pecas: number; pontosDasLoucas: number; pontosDoKit: number };
    /** F8: o que cada rede lançou (peças = terminais; tubos = trechos) e o destino do esgoto. */
    hidraulica: {
      agua: { pecas: number; tubos: number };
      esgoto: { pecas: number; tubos: number; destino: 'REDE_PUBLICA' | 'TRATAMENTO' };
      pluvial: { pecas: number; tubos: number };
      /** A verificação de rede do app sobre o resultado (`marcasDeVerificacao`), por tipo de marca. */
      verificacao: { erros: number; avisos: number; porTipo: Record<string, number> };
      /** Pontos com pressão disponível abaixo do mínimo (`pressoesDoModelo`), por rede. */
      pressaoInsuficiente: { fria: number; quente: number };
    };
    /** F9: a elétrica lançada e a conferência NBR 5410 sobre o resultado. */
    eletrica: ResumoDaEletricaDaCasa;
    /**
     * F9: as redes (água, esgoto, eletroduto, linha e dreno do ar) que passam por PORTA ou JANELA, por disciplina
     * (`conflitosDoModelo`, classe ABERTURA, com o eixo dentro do vão). Compatibilização entre redes e aberturas
     * é fase à parte; aqui ela fica à vista.
     */
    aberturas: Record<string, number>;
    /** F9: a climatização — as etapas do gerador de climatização e o que ele lançou. */
    climatizacao: { equipamentos: number; etapas: Record<string, SituacaoDaEtapa>; verificacao: { erros: number; avisos: number; porTipo: Record<string, number> } };
    /** F14b: o forro lançado — cômodos, rebaixo e o menor pé-direito livre; `null` sem forro. */
    forro: { comodos: number; rebaixoMm: number; peDireitoLivreMinimoMm: number | null } | null;
    /**
     * F14c: os FUROS PREVISTOS na estrutura (a lista para o calculista) — em viga, quantos dispensam a verificação
     * pelos critérios (NBR 6118, 13.2.5.1, hipóteses) e quantos ficam para verificar; em baldrame e em laje.
     */
    furos: { emViga: number; dispensa: number; verificar: number; emBaldrame: number; emLaje: number; lista: FuroPrevisto[] } | null;
    /** F25: o platô no terreno inclinado; `null` sem topografia (a casa na cota zero). */
    terraplenagem: ResumoDaTerraplenagem | null;
    /** F26: o muro, os portões e as calçadas; `null` sem muro (desligado ou não rodou). */
    muro?: PlanoDoMuroDaCasa['resumo'] | null;
  };
}

const ESTRUTURA_ZERADA = { eixos: 0, pilares: 0, vigas: 0, lajes: 0, blocos: 0, estacas: 0, baldrames: 0 };

/** F12: o que o sobrado lançou além da térrea. */
export interface ResumoDoSobrado {
  nivelSuperiorId: ObjectId;
  nucleo: NucleoDaEscada;
  escada: { degraus: number; espelhoMm: number; pisoMm: number; blondelMm: number };
  /** O ambiente para o qual o núcleo abre em cada pavimento (`null` = sem porta — vira pendência). */
  portas: { terreo: string | null; superior: string | null };
  /**
   * F27-D2: na casa de 3 pavimentos, o 2º — o nível, o retângulo recuado (no quadro da casa), o ambiente para o qual o
   * núcleo abre e a área do terraço (a laje do 1º descoberta). Ausente/null = sobrado.
   */
  segundo?: { nivelId: ObjectId; retangulo: Retangulo; porta: string | null; terracoM2: number } | null;
  /** F27 item 5.3: o 1º recuado (o excedente do térreo é o terraço dele); ausente/null = o 1º na pegada do térreo. */
  primeiro?: { retangulo: Retangulo; terracoM2: number } | null;
}

/** F9: o resumo da elétrica. */
export interface ResumoDaEletricaDaCasa {
  pontos: { tomadas: number; luzes: number; interruptores: number; ligacoesDiretas: number };
  quadro: string | null;
  medidor: boolean;
  circuitos: number;
  drs: number;
  dps: boolean;
  /** A categoria do padrão de entrada pela demanda, e a ligação que ela dá ao quadro. */
  entrada: { categoria: string; ligacao: string; demandaKva: number } | null;
  eletrodutos: number;
  /** `conferirNbr5410` do pavimento: faltas e avisos, e por regra (código → contagem). */
  conferencia: { faltas: number; avisos: number; porRegra: Record<string, { faltas: number; avisos: number }> };
}
const ELETRICA_ZERADA = (): ResumoDaEletricaDaCasa => ({
  pontos: { tomadas: 0, luzes: 0, interruptores: 0, ligacoesDiretas: 0 }, quadro: null, medidor: false, circuitos: 0, drs: 0, dps: false, entrada: null, eletrodutos: 0,
  conferencia: { faltas: 0, avisos: 0, porRegra: {} },
});
const CLIMATIZACAO_ZERADA = (): PlanoDaCasa['resumo']['climatizacao'] => ({ equipamentos: 0, etapas: {}, verificacao: { erros: 0, avisos: 0, porTipo: {} } });
const HIDRAULICA_ZERADA = (): PlanoDaCasa['resumo']['hidraulica'] => ({ agua: { pecas: 0, tubos: 0 }, esgoto: { pecas: 0, tubos: 0, destino: 'REDE_PUBLICA' }, pluvial: { pecas: 0, tubos: 0 }, verificacao: { erros: 0, avisos: 0, porTipo: {} }, pressaoInsuficiente: { fria: 0, quente: 0 } });

/** As marcas da verificação de rede ditas em português, pelo tipo (as demais saem com o texto da marca). */
const MARCA_DA_REDE: Record<string, string> = {
  PONTA_ABERTA: 'ponta(s) aberta(s)',
  SEM_DESTINO: 'trecho(s) sem destino',
  CONTRAFLUXO: 'trecho(s) em contrafluxo',
  DECLIVIDADE_BAIXA: 'trecho(s) com declividade baixa',
  SEM_VENTILACAO: 'desconector(es) sem ventilação',
  ATRAVESSA_PILAR: 'trecho(s) atravessando pilar',
  // F14b ("furar vigas"): a travessia da viga no forro é furo previsto — a lista vai ao calculista na F14c.
  CRUZA_VIGA: 'travessia(s) de viga — furo a aprovar com o calculista (F14c)',
  DN_MENOR: 'trecho(s) com DN abaixo do necessário',
  CALHA_INSUFICIENTE: 'calha(s) insuficiente(s)',
  CONDUTOR_INSUFICIENTE: 'condutor(es) insuficiente(s)',
};
const ROTULO_DA_DISCIPLINA_DA_REDE: Record<string, string> = { AGUA_FRIA: 'água fria', AGUA_QUENTE: 'água quente', ESGOTO: 'esgoto', PLUVIAL: 'pluvial' };
/** F9: as redes da climatização na mesma verificação. */
const ROTULO_DA_DISCIPLINA_DO_AR: Record<string, string> = { FRIGORIGENA: 'linha frigorígena', DRENO_AC: 'dreno do ar-condicionado', MECANICA: 'dutos' };

/** Por que o botão "Gerar casa" não roda — `null` = pode. */
export function motivoParaNaoGerar(model: BlueprintModel, levelId: ObjectId | null): string | null {
  if (!levelId || !model.levels.some((l) => l.id === levelId)) return 'Abra um pavimento para gerar a casa.';
  if (model.walls.some((w) => w.levelId === levelId)) return 'O pavimento já tem paredes — a casa automática nasce num pavimento vazio (crie uma alternativa ou limpe o pavimento).';
  // F10: o lote e a frente, ANTES de gerar — o botão diz, em vez de a prévia sair vazia com "implantação não rodou".
  const divisas = model.boundaries.filter((b) => b.levelId === levelId && b.kind === 'TERRENO');
  if (divisas.length === 0) return 'Desenhe o lote (as divisas do terreno) neste pavimento — a casa se implanta dentro dele.';
  if (!medirTerreno(divisas)?.fechado) return 'Feche o lote: as divisas do terreno precisam formar um contorno.';
  if (!divisas.some((b) => b.papel === 'FRENTE')) return 'Marque a divisa da FRENTE do lote (a que dá para a rua) — a casa se implanta a partir dela.';
  return null;
}

/** Os avisos do E6.2 que tornam a planta pior que outra semente sem eles. */
const GRAVE = /sem acesso|abaixo da área mínima|ficou sem lado externo|sem fachada|não coube|sem porta direta|só tem acesso passando/i;

/**
 * Problemas graves de uma alternativa: os avisos acima + as regras de AMBIENTE de severidade ERRO
 * violadas (largura e área mínimas, iluminação). Achado de 14/10/2026: o E6.2 dá à faixa íntima uma
 * profundidade só e divide a largura — banheiro de 0,80 × 5,75 m — em TODAS as sementes de um lote
 * de 9 m; escolher pela nota sozinha deixava a pior.
 */
function problemasGraves(r: ResultadoDoGerador): number {
  return r.avisos.filter((a) => GRAVE.test(a)).length + r.regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO' && x.regra.escopo === 'AMBIENTE').length;
}

function escolherSemente(resultados: ResultadoDoGerador[]): { r: ResultadoDoGerador; texto: string } {
  const g = new Map(resultados.map((r) => [r, problemasGraves(r)]));
  const ordem = [...resultados].sort((a, b) => g.get(a)! - g.get(b)! || (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.semente - b.semente);
  const r = ordem[0];
  const contagem = resultados.map((x) => g.get(x)!);
  const texto = `semente ${r.semente} de ${resultados.length} tentada(s): ${g.get(r) ? `${g.get(r)} problema(s) grave(s) — o menor entre ${Math.min(...contagem)} e ${Math.max(...contagem)}` : 'sem problema grave'}; nota ${r.avaliacao.notaGeral ?? '—'}`;
  return { r, texto };
}

/** O norte do desenho visto do quadro da frente (mesma convenção de `direcaoDoSol`: norte = (sen θ, cos θ)). */
function norteNoQuadro(q: QuadroDaFrente, rotacaoNorteDeg: number | null): number | null {
  const th = ((rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const n = { x: Math.sin(th), y: Math.cos(th) };
  const local = Math.round(((Math.atan2(n.x * q.ex.x + n.y * q.ex.y, n.x * q.ey.x + n.y * q.ey.y) * 180) / Math.PI) * 1000) / 1000;
  return rotacaoNorteDeg == null && Math.abs(local) < 1e-9 ? null : local === 0 ? 0 : local;
}

/**
 * As paredes, aberturas e nomes do E6.2 (no quadro da frente) levados ao mundo, nos três
 * comandos de lote. Exata quando a frente cai num eixo; girada, estica as pontas em T.
 */
export function comandosNoMundo(r: ResultadoDoGerador, levelId: ObjectId, q: QuadroDaFrente, exataNoDesenho: boolean): Command[] {
  return comandosLocaisNoMundo(comandosDeAplicacao(r, levelId), q, exataNoDesenho);
}

/** F12: o mesmo para qualquer lote de comandos no quadro da frente (o pavimento com o núcleo, a escada). */
export function comandosLocaisNoMundo(base: readonly Command[], q: QuadroDaFrente, exataNoDesenho: boolean): Command[] {
  const mundo = (p: Point): Point => {
    const m = paraMundo(q, p);
    return point(Math.round(m.x), Math.round(m.y));
  };
  const walls = base.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  const pontas = walls.flatMap((w) => [w.a, w.b]);
  const compartilhada = (p: Point, propria: number) => pontas.some((o, k) => Math.floor(k / 2) !== propria && Math.abs(o.x - p.x) < 1 && Math.abs(o.y - p.y) < 1);
  // Quanto a ponta `a` de cada parede andou para trás (o offset das aberturas cresce o mesmo).
  const andouA = new Map<string, number>();
  const novas = walls.map((w, i) => {
    let a = w.a;
    let b = w.b;
    if (!exataNoDesenho) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / L;
      const uy = (b.y - a.y) / L;
      if (!compartilhada(a, i)) {
        a = { x: a.x - ux * ALEM_MM, y: a.y - uy * ALEM_MM };
        if (w.uid) andouA.set(w.uid, ALEM_MM);
      }
      if (!compartilhada(b, i)) b = { x: b.x + ux * ALEM_MM, y: b.y + uy * ALEM_MM };
    }
    return { ...w, a: mundo(a), b: mundo(b) };
  });
  const out: Command[] = [];
  for (const c of base) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: novas });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: c.openings.map((o) => ({ ...o, offsetMm: Math.round(o.offsetMm + (o.wallUid ? (andouA.get(o.wallUid) ?? 0) : 0)) })) });
    else if (c.type === 'PlaceSpaceLabels') out.push({ type: 'PlaceSpaceLabels', labels: c.labels.map((l) => ({ ...l, at: mundo(l.at) })) });
    else if (c.type === 'AddEscada') out.push({ ...c, pontos: c.pontos.map(mundo) });
    else out.push(c);
  }
  return out;
}

/** F10: o aviso de progresso — cada etapa concluída, na ordem (a tela mostra "etapa N de M"). */
export interface OpcoesDoPlanoDaCasa {
  aoConcluirEtapa?: (e: EtapaDaCasa, indice: number, total: number) => void;
}

/**
 * F14c: as peças de esgoto de cima agrupadas como o esgoto agrupa os tubos de queda — a até `raioMm` umas das outras e
 * no MESMO cômodo ("um tubo de queda por banheiro de cima"). O passo do shaft e a previsão da laje rebaixada usam isto.
 */
function gruposDoTuboDeQueda<T extends { at: Point }>(model: BlueprintModel, levelId: ObjectId, pecas: readonly T[], raioMm: number): T[][] {
  const comodos = model.spaces.filter((sp) => sp.levelId === levelId);
  const comodoDe = (p: Point) => comodos.find((sp) => pointInPolygon(sp.ring, p))?.id ?? null;
  const grupos: T[][] = [];
  for (const t of pecas) {
    const perto = grupos.filter((g) => g.some((u) => Math.hypot(u.at.x - t.at.x, u.at.y - t.at.y) <= raioMm && comodoDe(u.at) === comodoDe(t.at)));
    for (const g of perto) grupos.splice(grupos.indexOf(g), 1);
    grupos.push([t, ...perto.flat()]);
  }
  return grupos;
}

/** F14c: quanto o coletor do box sai além da face do shaft, mm (o raio da caixa sifonada e a folga). */
const COLETOR_ALEM_DO_SHAFT_MM = 150;

/** F14c: o coletor do box (caixa sifonada, ralo) do lote que cai DENTRO de um shaft sai dele (`foraDoShaft`). */
function coletoresForaDoShaft(model: BlueprintModel, lote: Command[]): Command[] {
  return lote.map((c) => {
    if (c.type !== 'AddTerminal' || (c.tipoHidraulico !== 'CAIXA_SIFONADA' && c.tipoHidraulico !== 'RALO_SIFONADO')) return c;
    const fora = foraDoShaft(model, c.levelId, c.at, COLETOR_ALEM_DO_SHAFT_MM);
    return fora ? ({ ...c, at: fora } as Command) : c;
  });
}

/**
 * F14c: o ponto `at` caiu dentro de um SHAFT do pavimento? Devolve o mais perto fora dele — o pé em cada lado, `alemMm`
 * para fora — que fica no mesmo cômodo e fora de outro shaft; `null` se não caiu (ou não há para onde ir).
 */
function foraDoShaft(model: BlueprintModel, levelId: ObjectId, at: Point, alemMm: number): Point | null {
  const shafts = (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT' && pavimentosDoNucleo(model, n).some((l) => l.id === levelId)).map((n) => n.ring);
  const comodo = model.spaces.find((sp) => sp.levelId === levelId && pointInPolygon(sp.ring, at))?.ring ?? null;
  return foraDoPoligono(shafts, at, comodo, alemMm);
}

/**
 * F14c: pontos ao longo do contorno dos cômodos (a cada 20 cm) onde a parede fica sob a laje REBAIXADA do pavimento —
 * o ponto 25 cm para dentro do cômodo cai nela. Entram nos `ocupados` da distribuição das tomadas.
 */
function paredesSobORebaixo(model: BlueprintModel, levelId: ObjectId): Point[] {
  const teto = model.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? Infinity;
  const rebaixos = (model.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === levelId && x.baseMm < teto - 1).map((x) => x.pontos as Point[]);
  if (!rebaixos.length) return [];
  const saida: Point[] = [];
  for (const sp of model.spaces.filter((x) => x.levelId === levelId && x.ring.length >= 3)) {
    const horario = sp.ring.reduce((acc, p, i) => acc + p.x * sp.ring[(i + 1) % sp.ring.length].y - sp.ring[(i + 1) % sp.ring.length].x * p.y, 0) < 0;
    for (let i = 0; i < sp.ring.length; i++) {
      const a = sp.ring[i];
      const b = sp.ring[(i + 1) % sp.ring.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      // A normal para dentro do cômodo.
      const n = horario ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
      for (let d = 0; d <= L; d += 200) {
        const q = { x: a.x + u.x * d, y: a.y + u.y * d };
        if (rebaixos.some((g) => pointInPolygon(g, { x: q.x + n.x * 250, y: q.y + n.y * 250 } as Point))) saida.push({ x: Math.round(q.x), y: Math.round(q.y) } as Point);
      }
    }
  }
  return saida;
}

/** F14c: quanto a luz de teto sai além da borda da laje rebaixada, mm (o eletroduto sobe ali, no plenum). */
const LUZ_ALEM_DO_REBAIXO_MM = 300;
/** F18: a luz de teto a até isto da face do pilar conta como dentro dele (o raio do eletroduto e a folga), mm. */
const LUZ_FORA_DO_PILAR_MM = 50;

/**
 * F14c: o ponto `at` caiu dentro de um dos `poligonos` (convexos)? Devolve o mais perto fora dele — o pé em cada lado,
 * `alemMm` para fora — que fica no `comodo` e fora dos outros; `null` se não caiu (ou não há para onde ir).
 */
function foraDoPoligono(poligonos: readonly (readonly Point[])[], at: Point, comodo: readonly Point[] | null, alemMm: number): Point | null {
  const sh = poligonos.find((g) => pointInPolygon(g as Point[], at));
  if (!sh) return null;
  const c = { x: sh.reduce((a, p) => a + p.x, 0) / sh.length, y: sh.reduce((a, p) => a + p.y, 0) / sh.length };
  let melhor: { p: Point; d: number } | null = null;
  for (let i = 0; i < sh.length; i++) {
    const a = sh[i];
    const b = sh[(i + 1) % sh.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const t = Math.max(0, Math.min(L, (at.x - a.x) * u.x + (at.y - a.y) * u.y));
    const pe = { x: a.x + u.x * t, y: a.y + u.y * t };
    // A normal para FORA (do centro do polígono para o lado).
    let n = { x: -u.y, y: u.x };
    if ((pe.x - c.x) * n.x + (pe.y - c.y) * n.y < 0) n = { x: u.y, y: -u.x };
    const q = { x: Math.round(pe.x + n.x * alemMm), y: Math.round(pe.y + n.y * alemMm) } as Point;
    if (comodo && !pointInPolygon(comodo as Point[], q)) continue;
    if (poligonos.some((g) => pointInPolygon(g as Point[], q))) continue;
    const d = Math.hypot(q.x - at.x, q.y - at.y);
    if (!melhor || d < melhor.d) melhor = { p: q, d };
  }
  return melhor?.p ?? null;
}

/** F22: entre a subida do eletroduto do pressurizador e os tubos, além dos raios, mm. */
const FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM = 20;

/** F22: por que a TÉRREA não comporta o programa (`null` = comporta): medida mínima de ambiente violada, ou a TO. */
export function terreaNaoComporta(p: PlanoDaCasa): string | null {
  const motivos = p.pendencias
    .filter((x) => /^Legislação: .*(largura mínima|área mínima)/.test(x.texto) || /^O programa pede .* a taxa de ocupação permite/.test(x.texto))
    .map((x) => x.texto.replace(/^Legislação: /, ''));
  return motivos.length ? motivos.join('; ') : null;
}

/** F22: os problemas que pesam na escolha entre térrea e sobrado (o menor fica). */
export const problemasDoPlano = (p: PlanoDaCasa): number =>
  p.etapas.some((e) => e.id === 'ARQUITETURA' && e.situacao === 'NAO_RODOU')
    ? Infinity
    : // O aviso sobre a ESCOLHA dos pavimentos ("Pavimentos: …") não é defeito do desenho — contado, a térrea pedida
      // levava um problema a mais que a mesma térrea comparada pelo Automático.
      ((ps) => ps.filter((x) => x.grupo === 'SEM_SOLUCAO' || x.grupo === 'CONFLITO').length * 3 + ps.filter((x) => x.grupo === 'VERIFICACAO').length)(p.pendencias.filter((x) => !/^Pavimentos/.test(x.texto))) +
      (terreaNaoComporta(p) ? 2 : 0);

/**
 * F24 (decisão do usuário, 17/10/2026): a térrea em retângulo e, se ele não comporta (limitado pelos recuos, ou ambiente
 * abaixo da medida mínima, ou acima da TO), a mesma casa em L — fica a de menos problemas (empate: a de mais área).
 */
function planejarTerrea(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa>, opcoes: OpcoesDoPlanoDaCasa): PlanoDaCasa {
  const ret = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1 }, opcoes);
  if ((hipParcial.implantacao?.forma ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.forma) !== 'AUTOMATICA') return ret;
  const porque = terreaNaoComporta(ret) ?? (ret.implantacao?.limitante === 'ENVELOPE' ? 'os recuos limitam o retângulo' : null);
  if (!porque) return ret;
  // Item 9 (decisão do usuário, 19/10/2026: "alargar só o mínimo"): o cômodo abaixo da LARGURA mínima — a casa um passo
  // mais larga de cada vez, até caber (antes da casa em L). No R1-B 15 × 30, o programa mínimo pedia 9,60 m em 9,40.
  const rlDe = (x: PlanoDaCasa) => x.implantacao?.retanguloLocal ?? null;
  const r0 = rlDe(ret);
  if (r0 && /largura mínima/.test(terreaNaoComporta(ret) ?? '')) {
    const w0 = r0.x1 - r0.x0;
    const passo = hipParcial.implantacao?.alargarPassoMm ?? 200;
    const ate = hipParcial.implantacao?.alargarAteMm ?? 600;
    for (let extra = passo; extra <= ate; extra += passo) {
      const tent = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1, implantacao: { ...(hipParcial.implantacao ?? {}), larguraMinimaMm: w0 + extra } }, opcoes);
      const r = rlDe(tent);
      if (!r || r.x1 - r.x0 < w0 + extra) break; // o envelope não deixa alargar mais
      if (!terreaNaoComporta(tent)) {
        tent.decisoes.push(`Implantação: a casa ${f2(extra / 1000)} m mais larga (${f2(w0 / 1000)} → ${f2((r.x1 - r.x0) / 1000)} m) — os mínimos do programa não cabiam.`);
        return tent;
      }
    }
  }
  const emL = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1, implantacao: { ...(hipParcial.implantacao ?? {}), forma: 'L' } }, opcoes);
  if (!emL.implantacao?.contornoLocal) return ret;
  const [pR, pL] = [problemasDoPlano(ret), problemasDoPlano(emL)];
  const area = (x: PlanoDaCasa) => x.implantacao?.medidas.projecaoM2 ?? 0;
  const fica = pL < pR || (pL === pR && area(emL) > area(ret) + 1) ? emL : ret;
  const texto =
    fica === emL
      ? `Forma da casa: em L — o retângulo não comportava o programa (${porque}).`
      : `Forma da casa: retângulo — não comporta o programa (${porque}), mas em L a casa tinha mais problemas.`;
  fica.decisoes.push(texto);
  fica.pendencias.push({ grupo: 'CONFERIR', texto });
  return fica;
}

/** F27-D4: o gabarito da zona deixa 3 pavimentos (sem gabarito em pavimentos, deixa — a altura a implantação confere). */
const cabemTres = (entrada: EntradaDaCasa) => entrada.ctx.zona.gabaritoPavimentos == null || entrada.ctx.zona.gabaritoPavimentos >= 3;

export function planejarCasa(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa> = {}, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const pav = hipParcial.pavimentos ?? HIPOTESES_DA_CASA_PADRAO.pavimentos;
  if (pav !== 'AUTOMATICO') {
    const p = pav === 1 ? planejarTerrea(original, entrada, hipParcial, opcoes) : planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: pav }, opcoes);
    // A térrea (ou o sobrado) pedida que não comporta: dito, com a saída (a escolha da pessoa fica).
    const motivo = pav === 1 || pav === 2 ? terreaNaoComporta(p) : null;
    if (motivo && pav === 1) p.pendencias.push({ grupo: 'VERIFICACAO', texto: `Pavimentos: a térrea não comporta o programa (${motivo}) — em "Automático" ou "Sobrado", a casa sobe um pavimento.` });
    if (motivo && pav === 2 && cabemTres(entrada)) p.pendencias.push({ grupo: 'VERIFICACAO', texto: `Pavimentos: o sobrado não comporta o programa (${motivo}) — em "Automático" ou "3 pavimentos", a casa sobe mais um.` });
    return p;
  }
  const terrea = planejarTerrea(original, entrada, hipParcial, opcoes);
  const motivo = terreaNaoComporta(terrea);
  if (!motivo) {
    terrea.decisoes.push('Pavimentos automático: térrea (o programa cabe nela).');
    return terrea;
  }
  const sobrado = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 2 }, opcoes);
  let fica = problemasDoPlano(sobrado) < problemasDoPlano(terrea) ? sobrado : terrea;
  let texto = fica === sobrado ? `Pavimentos automático: sobrado — a térrea não comportava o programa (${motivo}).` : `Pavimentos automático: térrea — não comporta o programa (${motivo}), mas o sobrado tinha mais problemas.`;
  // F27-D4 (decisão do usuário, 18/10/2026: "só quando o sobrado não comporta"): e o gabarito da zona deixa 3.
  const motivoDoSobrado = terreaNaoComporta(sobrado);
  if (motivoDoSobrado && cabemTres(entrada)) {
    const tres = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 3 }, opcoes);
    if (problemasDoPlano(tres) < problemasDoPlano(fica)) {
      fica = tres;
      texto = `Pavimentos automático: 3 pavimentos — nem a térrea (${motivo}) nem o sobrado (${motivoDoSobrado}) comportavam o programa.`;
    } else texto += ` A de 3 pavimentos (o sobrado também não comporta: ${motivoDoSobrado}) tinha mais problemas.`;
  }
  fica.decisoes.push(texto);
  fica.pendencias.push({ grupo: 'CONFERIR', texto });
  return fica;
}


function planejarComPavimentos(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa> & { pavimentos: 1 | 2 | 3 }, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const hip: HipotesesDaCasa = {
    ...HIPOTESES_DA_CASA_PADRAO,
    ...hipParcial,
    sobrado: { ...HIPOTESES_DO_SOBRADO_PADRAO, ...(hipParcial.sobrado ?? {}) },
    estrutura: { ...HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, ...(hipParcial.estrutura ?? {}) },
    terraplenagem: { ...HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, ...(hipParcial.terraplenagem ?? {}) },
    muro: { ...HIPOTESES_DO_MURO_DA_CASA_PADRAO, ...(hipParcial.muro ?? {}) },
    telhado: { ...HIPOTESES_DO_TELHADO_PADRAO, ...(hipParcial.telhado ?? {}) },
    ancoras: { ...HIPOTESES_DAS_ANCORAS_PADRAO, ...(hipParcial.ancoras ?? {}) },
    mobiliario: { ...HIPOTESES_MOBILIARIO_PADRAO, lancar: true, ...(hipParcial.mobiliario ?? {}) },
    pontos: { ...HIPOTESES_PONTOS_PADRAO, afastamentoFriaQuenteMm: 150, ...(hipParcial.pontos ?? {}) },
    hidraulica: { lancar: true, ...(hipParcial.hidraulica ?? {}) },
    eletrica: { ...HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, ...(hipParcial.eletrica ?? {}) },
    climatizacao: { ...HIPOTESES_DA_CASA_PADRAO.climatizacao, ...(hipParcial.climatizacao ?? {}) },
    pressao: { ...HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, ...(hipParcial.pressao ?? {}) },
    faixas: { aguaQuenteMm: 45, esgotoMm: -60, ...(hipParcial.faixas ?? {}) },
    forro: {
      ...HIPOTESES_DO_FORRO_DA_CASA_PADRAO,
      ...(hipParcial.forro ?? {}),
      ...Object.fromEntries(FAIXAS_DO_FORRO.map((k) => [k, { ...HIPOTESES_DO_FORRO_DA_CASA_PADRAO[k], ...(hipParcial.forro?.[k] ?? {}) }])),
    },
  };
  // Item 9 (decisão do usuário, 19/10/2026: "cozinha + serviço juntos"): no R1-B a área de serviço fica na frente, com a
  // cozinha (hipótese do gerador; a do estudo, se dada, vale).
  const hipGerador: Partial<HipotesesDoGerador> = { ...hip.gerador, servicoPodeIrAoFundo: hip.gerador?.servicoPodeIrAoFundo ?? entrada.curto?.padrao !== 'R1-B', automaticos: false };
  // A implantação usa a mesma parede externa e a mesma malha do gerador.
  const hipImplantacao: Partial<HipotesesDaImplantacao> = {
    espessuraExternaMm: hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm,
    malhaMm: hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm,
    ...hip.implantacao,
  };
  const etapas: EtapaDaCasa[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const decisoes: string[] = [];
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  let m = original;
  // F25: a etapa de terraplenagem só existe com a topografia do estudo.
  const temTerreno = !!entrada.gradeDoTerreno && !!entrada.leitorDoTerreno && hip.terraplenagem.lancar;
  let terraplenagemDaCasa: ResumoDaTerraplenagem | null = null;
  const etapa = (id: EtapaDaCasaId, rotulo: string, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) => {
    etapas.push({ id, rotulo, situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });
    opcoes.aoConcluirEtapa?.(etapas[etapas.length - 1], etapas.length, ORDEM_DAS_ETAPAS.length - (temTerreno ? 0 : 1));
  };
  const aplicar = (lote: Command[]): number => {
    if (!lote.length) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };

  const doCurto = programaDaCasa(entrada.curto, hip.programa);
  const programa = entrada.programa && entrada.programa.itens.length ? entrada.programa : doCurto.programa;
  if (!entrada.programa) for (const a of doCurto.avisos) pendencias.push({ grupo: 'PREMISSA', texto: `Programa: ${a}` });
  const pedidos = programa.itens.filter((i) => i.uso !== 'CIRCULACAO').reduce((s, i) => s + i.quantidade, 0);
  const vazio = (motivo: string, implantacao: ImplantacaoDaCasa | null = null): PlanoDaCasa => {
    for (const id of ORDEM_DAS_ETAPAS) if (id !== 'IMPLANTACAO' && !(id === 'TERRAPLENAGEM' && !temTerreno) && !etapas.some((e) => e.id === id)) etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, id === 'ARQUITETURA' ? motivo : 'sem arquitetura');
    return { levelId: entrada.levelId, comandos: [], criados: [], etapas, pendencias, resultado: original, programa, implantacao, semente: null, escolha: null, decisoes, sobrado: null, resumo: { areaConstruidaM2: null, ambientesPedidos: pedidos, ambientesAtendidos: 0, regrasVioladas: 0, estrutura: { ...ESTRUTURA_ZERADA }, telhado: null, ancoras: null, mobiliario: { pecas: 0, pontosDasLoucas: 0, pontosDoKit: 0 }, hidraulica: HIDRAULICA_ZERADA(), eletrica: ELETRICA_ZERADA(), aberturas: {}, climatizacao: CLIMATIZACAO_ZERADA(), forro: null, furos: null, terraplenagem: null } };
  };

  const impedimento = motivoParaNaoGerar(original, entrada.levelId);
  if (impedimento) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, impedimento);
    return vazio(impedimento);
  }

  // F25/F26: o platô de uma implantação — o mesmo cálculo da etapa TERRAPLENAGEM (lá aplicado; aqui, também para
  // medir a rampa da garagem antes de fixar a implantação).
  const platoDe = (impl: ImplantacaoDaCasa, meia: number) => {
    if (!temTerreno) return null;
    const qd = impl.quadro;
    const anelDoLote = entrada.ctx.terreno?.anel ?? null;
    const loteLocal = anelDoLote?.map((p) => paraLocal(qd, p)) ?? null;
    const rlT = impl.retanguloLocal;
    const yFrente = loteLocal ? Math.min(...loteLocal.map((p) => p.y)) : rlT.y0;
    const pontoDaRua = paraMundo(qd, { x: (rlT.x0 + rlT.x1) / 2, y: yFrente });
    return platoDaCasa(entrada.gradeDoTerreno!, entrada.leitorDoTerreno!.cotaZeroM, impl.anelNoMundo, meia, anelDoLote, pontoDaRua, Math.max(0, rlT.y0 - meia - yFrente), hip.terraplenagem);
  };

  // ── IMPLANTACAO ───────────────────────────────────────────────────────────
  // F12: no sobrado, o retângulo é o do pavimento MAIOR mais o núcleo da escada; a altura conta os dois pés-direitos.
  const peDireitoMm = hipGerador.peDireitoMm ?? HIPOTESES_DO_GERADOR_PADRAO.peDireitoMm;
  const andarMm = peDireitoMm + hip.sobrado.lajeEntrePavimentosMm;
  // F27-D: em 3, o pavimento maior é o térreo ou o 1º (o 2º é recuado, com o terraço) — o retângulo é o dele.
  // F27-D: em 3, o `superior` é o 1º pavimento e o `segundo`, o de cima (recuado, com o terraço).
  const divididos: { terreo: Programa; superior: Programa; segundo: Programa | null } | null =
    hip.pavimentos === 2
      ? { ...dividirPrograma(programa), segundo: null }
      : hip.pavimentos === 3
        ? (({ terreo, primeiro, segundo }) => ({ terreo, superior: primeiro, segundo }))(dividirEmTres(programa))
        : null;
  const pavimentosDoPrograma = divididos ? [divididos.terreo, divididos.superior, ...(divididos.segundo ? [divididos.segundo] : [])] : null;
  const implantar = (h: Partial<HipotesesDaImplantacao>) => implantacaoDaCasa(
    entrada.ctx,
    programa,
    doCurto.curto,
    h,
    pavimentosDoPrograma
      ? {
          utilPorPavimentoM2: Math.max(...pavimentosDoPrograma.map((x) => resumoDoPrograma(x).areaIdealComCirculacaoM2)) + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6,
          alturaM: (pavimentosDoPrograma.length * andarMm) / 1000,
          pavimentos: pavimentosDoPrograma.length === 3 ? 3 : 2,
        }
      : null,
  );
  let imp = implantar(hipImplantacao);
  // F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): no terreno inclinado a garagem fica no
  // platô; a rampa de veículos até `rampaDeVeiculosMaxPct` tem de caber entre o muro e a fachada. Não cabendo, a casa
  // recua — e o platô muda com ela (no aclive, sobe): implantação e platô de novo, até fechar (4 voltas no máximo).
  // A rua é lida no meio da frente da casa (a garagem ainda não tem lugar); o lançamento da rampa confere no lugar dela.
  if (imp.ok && temTerreno && doCurto.curto.garagemCoberta && doCurto.curto.vagas > 0) {
    const meiaP = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    const pede = (impl: ImplantacaoDaCasa): { comprimentoMm: number; disponivelMm: number } | null => {
      const t = platoDe(impl, meiaP);
      if (!t || !t.ok || t.resumo.entrada.cotaDaCalcadaMm == null) return null;
      const delta = Math.abs(t.resumo.elevacaoDoTerreoMm - t.resumo.entrada.cotaDaCalcadaMm);
      if (delta <= hip.terraplenagem.desnivelSemDegrauMm) return null;
      const yF = Math.min(...(entrada.ctx.terreno?.anel ?? []).map((p) => paraLocal(impl.quadro, p).y));
      return { comprimentoMm: Math.ceil(delta / (hip.terraplenagem.rampaDeVeiculosMaxPct / 100)), disponivelMm: impl.retanguloLocal.y0 - meiaP - (yF + hip.muro.espessuraMm) };
    };
    // O que falta (a rampa − o que há entre o muro e a fachada) cresce com o recuo no aclive (o platô sobe junto): a
    // SECANTE sobre ele acerta na segunda volta num terreno de declive constante; a primeira é o passo simples.
    let anterior: { recuo: number; falta: number } | null = null;
    const semRecuo = imp;
    for (let volta = 0; volta < 6 && imp.ok; volta++) {
      const r = pede(imp.implantacao);
      if (!r || r.comprimentoMm <= r.disponivelMm) break;
      const recuoAtual = r.disponivelMm + hip.muro.espessuraMm;
      const falta = r.comprimentoMm - r.disponivelMm;
      const secante = anterior && Math.abs(falta - anterior.falta) > 1 && recuoAtual !== anterior.recuo ? recuoAtual - (falta * (recuoAtual - anterior.recuo)) / (falta - anterior.falta) : null;
      const recuo = Math.ceil(Math.max(recuoAtual + falta, secante ?? 0) + 50);
      anterior = { recuo: recuoAtual, falta };
      const prox = implantar({ ...hipImplantacao, recuoMinimoDeFrenteMm: recuo });
      if (!prox.ok || prox.implantacao.retanguloLocal.y0 <= imp.implantacao.retanguloLocal.y0) break;
      hipImplantacao.recuoMinimoDeFrenteMm = recuo;
      imp = prox;
    }
    // Recuar e não caber (o terreno mais íngreme que a rampa: cada metro de recuo sobe mais do que a rampa vence) só
    // estragaria a casa — ela volta para onde estava, e o lançamento da rampa diz por que não.
    const depois = imp.ok ? pede(imp.implantacao) : null;
    if (imp !== semRecuo && depois && depois.comprimentoMm > depois.disponivelMm) {
      imp = semRecuo;
      hipImplantacao.recuoMinimoDeFrenteMm = 0;
    }
  }
  if (!imp.ok) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, imp.motivo);
    pendencias.push({ grupo: 'PREMISSA', texto: imp.motivo });
    return vazio('sem implantação');
  }
  const implantacao = imp.implantacao;
  etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'CALCULOU', 0, resumoDaImplantacao(implantacao));
  // F24: onde as vagas descobertas foram e a casa em L são DECISÕES da implantação — para conferir.
  for (const a of implantacao.avisos) {
    const decisao = /^(Vagas descobertas|Casa em L|Garagem):/.test(a);
    if (decisao) decisoes.push(a);
    pendencias.push({ grupo: decisao ? 'CONFERIR' : 'PREMISSA', texto: a });
  }

  // ── TERRAPLENAGEM (F25) ─────────────────────────────────────────────────
  // O platô único sob a projeção, na cota de equilíbrio do corte e do aterro; o térreo assenta nele (o lote inteiro
  // segue relativo à cota zero do desenho — a hidráulica lê o terreno contra essa cota). Talude ou muro por borda; a
  // entrada, rampa ou escada da calçada ao piso.
  if (temTerreno) {
    try {
      const qd = implantacao.quadro;
      const anelDoLote = entrada.ctx.terreno?.anel ?? null;
      const loteLocal = anelDoLote?.map((p) => paraLocal(qd, p)) ?? null;
      const rlT = implantacao.retanguloLocal;
      const yFrente = loteLocal ? Math.min(...loteLocal.map((p) => p.y)) : rlT.y0;
      const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
      const pontoDaRua = paraMundo(qd, { x: (rlT.x0 + rlT.x1) / 2, y: yFrente });
      const t = platoDaCasa(entrada.gradeDoTerreno!, entrada.leitorDoTerreno!.cotaZeroM, implantacao.anelNoMundo, meia, anelDoLote, pontoDaRua, Math.max(0, rlT.y0 - meia - yFrente), hip.terraplenagem);
      if (!t.ok) {
        etapa('TERRAPLENAGEM', ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM, 'NAO_RODOU', 0, t.motivo);
        pendencias.push({ grupo: 'PREMISSA', texto: `Terraplenagem: ${t.motivo} — a casa fica na cota zero do desenho.` });
      } else {
        const tr = t.resumo;
        terraplenagemDaCasa = tr;
        const nivel = m.levels.find((l) => l.id === entrada.levelId);
        const n = nivel && nivel.elevationMm !== tr.elevacaoDoTerreoMm ? aplicar([{ type: 'SetLevelProps', levelId: entrada.levelId, elevationMm: tr.elevacaoDoTerreoMm }]) : 0;
        const m3 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        const muros = tr.bordas.filter((b) => b.solucao === 'MURO');
        etapa(
          'TERRAPLENAGEM',
          ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM,
          'LANCOU',
          Math.max(n, 1),
          `platô a ${tr.cotaDoPlatoM.toLocaleString('pt-BR')} m (${m3(tr.areaPlatoM2)} m²), térreo a ${(tr.elevacaoDoTerreoMm / 1000).toLocaleString('pt-BR')} m do zero; corte ${m3(tr.corteM3)} m³, aterro ${m3(tr.aterroM3)} m³${muros.length ? `; ${muros.length} muro(s) de arrimo (${m3(tr.murosComprimentoM)} m)` : ''}`,
        );
        decisoes.push(`Terraplenagem: platô único na cota de equilíbrio sob a projeção (${tr.cotaDoPlatoM.toLocaleString('pt-BR')} m); o térreo ${hip.terraplenagem.pisoAcimaDoPlatoMm} mm acima.`);
        pendencias.push({
          grupo: 'CONFERIR',
          texto: `Terraplenagem: corte ${m3(tr.corteM3)} m³ e aterro ${m3(tr.aterroM3)} m³ (${tr.botaForaM3 > 0 ? `bota-fora ${m3(tr.botaForaM3)} m³` : tr.emprestimoM3 > 0 ? `empréstimo ${m3(tr.emprestimoM3)} m³` : 'equilibrado'}), taludes de ${m3(tr.areaTaludeM2)} m² — estimativa da topografia do estudo; confira com o levantamento.`,
        });
        // O lado de cada borda, de quem olha da rua (no quadro da frente).
        const cx = (rlT.x0 + rlT.x1) / 2;
        const cy = (rlT.y0 + rlT.y1) / 2;
        const ladoDaBorda = (b: (typeof muros)[number]) => {
          const mL = paraLocal(qd, { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 });
          const dx = mL.x - cx;
          const dy = mL.y - cy;
          return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'da frente' : 'dos fundos') : dx < 0 ? 'da esquerda' : 'da direita';
        };
        for (const b of muros)
          pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: muro de arrimo na borda ${ladoDaBorda(b)}, de ${b.comprimentoM.toLocaleString('pt-BR')} m e até ${b.alturaMaxM.toLocaleString('pt-BR')} m de altura (${b.lado === 'CORTE' ? 'segura o corte' : 'segura o aterro'}; ${b.motivo}) — dimensione com o calculista.` });
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa('TERRAPLENAGEM', ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM, 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Terraplenagem: ${motivo}` });
    }
  }

  // F25 (decisão do usuário, 18/10/2026: "escada partindo do terreno"): a ESCADA (ou rampa) DE ACESSO, da calçada à
  // porta de entrada — `Escada.desdeCotaMm` (kernel 0.103.0). Sai da face da fachada diante da porta, rumo à rua, com os
  // pontos do lado baixo para o alto; só quando cabe no recuo de frente (senão a pendência diz, e ela fica à mão).
  // A porta de entrada: a mais larga na parede da fachada da frente do térreo (no quadro da frente, `local`).
  const portaDaFrente = () => {
    const qd = implantacao.quadro;
    const rlE = implantacao.retanguloLocal;
    const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    return (
      m.openings
        .filter((o) => o.kind === 'door')
        .map((o) => ({ o, w: m.walls.find((x) => x.id === o.wallId) }))
        .filter((x): x is { o: (typeof m.openings)[number]; w: (typeof m.walls)[number] } => !!x.w && x.w.levelId === entrada.levelId)
        .map(({ o, w }) => {
          const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
          const t = o.offsetMm + o.widthMm / 2;
          const meioDaPorta = { x: w.a.x + ((w.b.x - w.a.x) / L) * t, y: w.a.y + ((w.b.y - w.a.y) / L) * t };
          return { o, meioDaPorta, local: paraLocal(qd, meioDaPorta) };
        })
        .filter((x) => Math.abs(x.local.y - rlE.y0) <= meia + 1)
        .sort((p, q2) => q2.o.widthMm - p.o.widthMm)[0] ?? null
    );
  };
  const lancarEscadaDeAcesso = () => {
    const tr = terraplenagemDaCasa;
    if (!tr || tr.entrada.tipo === 'NENHUMA') return;
    const e = tr.entrada;
    const sentido = e.desnivelMm > 0 ? 'sobe' : 'desce';
    const desc =
      e.tipo === 'RAMPA'
        ? `rampa de ${(e.comprimentoMm / 1000).toLocaleString('pt-BR')} m a ${hip.terraplenagem.rampaMaximaPct.toLocaleString('pt-BR')} %`
        : `escada de ${e.degraus} degrau(s) de ${e.espelhoMm} mm (${(e.comprimentoMm / 1000).toLocaleString('pt-BR')} m)`;
    const desnivel = `${(Math.abs(e.desnivelMm) / 1000).toLocaleString('pt-BR')} m`;
    if (!e.cabe || e.cotaDaCalcadaMm == null) {
      pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}, que não cabe no recuo de frente; desenhe o acesso à mão.` });
      return;
    }
    const qd = implantacao.quadro;
    const rlE = implantacao.retanguloLocal;
    const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    const porta = portaDaFrente();
    if (!porta) {
      pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}; a porta de entrada não está na fachada da frente: desenhe o acesso à mão.` });
      return;
    }
    const naFace = paraMundo(qd, { x: porta.local.x, y: rlE.y0 - meia });
    const naRua = paraMundo(qd, { x: porta.local.x, y: rlE.y0 - meia - e.comprimentoMm });
    const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
    // Do baixo para o alto: a calçada abaixo do piso → começa na rua; acima → começa na porta.
    const pontos = e.desnivelMm > 0 ? [inteiro(naRua), inteiro(naFace)] : [inteiro(naFace), inteiro(naRua)];
    try {
      aplicar([
        {
          type: 'AddEscada',
          levelId: entrada.levelId,
          pontos,
          tipo: e.tipo === 'RAMPA' ? 'RAMPA' : 'ESCADA',
          larguraMm: Math.max(1200, porta.o.widthMm + 300),
          alvoEspelhoMm: e.tipo === 'ESCADA' ? Math.min(hip.terraplenagem.espelhoMaximoMm, Math.max(1, e.espelhoMm)) : 175,
          rotulo: 'Acesso',
          desdeCotaMm: e.cotaDaCalcadaMm,
        },
      ]);
      pendencias.push({ grupo: 'CONFERIR', texto: `Terraplenagem: a entrada ${sentido} ${desnivel} da calçada ao piso — ${desc}, lançada diante da porta de entrada.` });
    } catch (x) {
      pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: a escada de acesso não entrou (${x instanceof Error ? x.message : String(x)}) — desenhe-a à mão.` });
    }
  };

  // A garagem coberta no quadro da frente: o ambiente de uso GARAGEM no térreo (caixa do anel).
  const garagemNoQuadro = () => {
    const qd = implantacao.quadro;
    const et = m.labels.find((l) => l.levelId === entrada.levelId && l.uso === 'GARAGEM');
    const sp = et ? m.spaces.find((x) => x.levelId === entrada.levelId && pointInPolygon(x.ring, et.at)) : undefined;
    if (!sp) return null;
    const pts = sp.ring.map((p) => paraLocal(qd, p));
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)) };
  };
  // F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): a RAMPA DE VEÍCULOS (escada de acesso
  // tipo RAMPA, `veicular`, kernel 0.104.0) da calçada diante da garagem até a fachada — a implantação já recuou a casa
  // para ela caber; aqui, no lugar real da garagem, ela é lançada ou a pendência diz por que não.
  const lancarRampaDaGaragem = () => {
    const tr = terraplenagemDaCasa;
    const leitor = entrada.leitorDoTerreno;
    if (!tr || !leitor) return;
    const g = garagemNoQuadro();
    if (!g) return;
    const qd = implantacao.quadro;
    const rlG = implantacao.retanguloLocal;
    const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    const yF = Math.min(...(entrada.ctx.terreno?.anel ?? []).map((p) => paraLocal(qd, p).y));
    const xm = (g.x0 + g.x1) / 2;
    const rua = leitor.cotaEmM(paraMundo(qd, { x: xm, y: yF }));
    if (rua == null || !Number.isFinite(rua)) return;
    const calcadaMm = Math.round((rua - leitor.cotaZeroM) * 1000);
    const delta = tr.elevacaoDoTerreoMm - calcadaMm;
    if (Math.abs(delta) <= hip.terraplenagem.desnivelSemDegrauMm) return;
    const pct = hip.terraplenagem.rampaDeVeiculosMaxPct;
    const comprimento = Math.ceil(Math.abs(delta) / (pct / 100));
    const face = rlG.y0 - meia;
    const disponivel = face - (yF + hip.muro.espessuraMm);
    const sentido = delta > 0 ? 'sobe' : 'desce';
    if (comprimento > disponivel) {
      pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: a rampa de veículos ${sentido} ${f2(Math.abs(delta) / 1000)} m da rua ao piso — a ${f2(pct)} %, ${f2(comprimento / 1000)} m, e só há ${f2(Math.max(0, disponivel) / 1000)} m entre o muro e a fachada; desenhe a garagem na cota da rua ou a rampa mais inclinada, à mão.` });
      return;
    }
    const naFace = paraMundo(qd, { x: xm, y: face });
    const naRua = paraMundo(qd, { x: xm, y: face - comprimento });
    const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
    try {
      aplicar([
        {
          type: 'AddEscada',
          levelId: entrada.levelId,
          pontos: delta > 0 ? [inteiro(naRua), inteiro(naFace)] : [inteiro(naFace), inteiro(naRua)],
          tipo: 'RAMPA',
          veicular: true,
          larguraMm: Math.max(2500, Math.round(g.x1 - g.x0)),
          rotulo: 'Rampa da garagem',
          desdeCotaMm: calcadaMm,
        },
      ]);
      pendencias.push({ grupo: 'CONFERIR', texto: `Garagem: rampa de veículos ${sentido === 'sobe' ? 'subindo' : 'descendo'} ${f2(Math.abs(delta) / 1000)} m em ${f2(comprimento / 1000)} m (${f2(pct)} %), da rua à garagem — confira a inclinação no código de obras.` });
    } catch (x) {
      pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: a rampa de veículos não entrou (${x instanceof Error ? x.message : String(x)}) — desenhe-a à mão.` });
    }
  };

  // F26 (decisões do usuário: "muro + portão + calçada", "família nova no kernel"): o muro do lote (kernel 0.104.0), o
  // portão de pedestre diante da porta, o de garagem diante da garagem e as calçadas — depois da casa inteira, que é
  // de onde saem a porta, a garagem e a escada de acesso.
  let resumoDoMuro: PlanoDoMuroDaCasa['resumo'] | null = null;
  const lancarMuroDaCasa = (): PlanoDoMuroDaCasa['resumo'] | null => {
    if (!hip.muro.lancar) {
      etapa('MURO', ROTULO_DA_ETAPA_DA_CASA.MURO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
      return null;
    }
    try {
      const qd = implantacao.quadro;
      const rlM = implantacao.retanguloLocal;
      const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
      const local = (p: Point) => paraLocal(qd, p);
      const porta = portaDaFrente();
      const acesso = (m.stairs ?? []).find((x) => x.levelId === entrada.levelId && x.desdeCotaMm != null && !x.veicular);
      // A garagem coberta: o ambiente de uso GARAGEM no térreo — a largura dela e até a fachada.
      const garagemLocal = garagemNoQuadro();
      const leitor = entrada.leitorDoTerreno;
      const plano = planejarMuroDaCasa(
        {
          levelId: entrada.levelId,
          anelDoLote: entrada.ctx.terreno?.anel ?? [],
          limites: entrada.ctx.limites,
          quadro: qd,
          portaX: porta ? porta.local.x : null,
          faceDaFachadaY: rlM.y0 - meia,
          inicioDaEscadaY: acesso ? Math.min(...acesso.pontos.map((p) => local(p).y)) : null,
          casaNoMundo: implantacao.anelNoMundo,
          meiaParedeMm: meia,
          // A escada de acesso no chão: a faixa dela no quadro (o percurso ± meia largura).
          obstaculos: (m.stairs ?? [])
            .filter((x) => x.levelId === entrada.levelId && x.desdeCotaMm != null)
            .map((x) => {
              const pts = x.pontos.map(local);
              const xs = pts.map((p) => p.x);
              const ys = pts.map((p) => p.y);
              const dx = Math.max(...xs) - Math.min(...xs);
              const dy = Math.max(...ys) - Math.min(...ys);
              const w = x.larguraMm / 2;
              return dy >= dx ? { x0: Math.min(...xs) - w, x1: Math.max(...xs) + w, y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - w, y1: Math.max(...ys) + w };
            }),
          garagem: garagemLocal ? { x0: garagemLocal.x0, x1: garagemLocal.x1, yFim: rlM.y0 - meia } : null,
          vagasDescobertas: !garagemLocal && implantacao.vagasDescobertas ? implantacao.vagasDescobertas.caixa : null,
          cotaDoTerreno:
            temTerreno && leitor
              ? (p: Point) => {
                  const c = leitor.cotaEmM(p);
                  return c == null || !Number.isFinite(c) ? null : (c - leitor.cotaZeroM) * 1000;
                }
              : null,
        },
        hip.muro,
      );
      for (const pd of plano.pendencias) pendencias.push(pd);
      const n = aplicar(plano.comandos);
      const r = plano.resumo;
      etapa(
        'MURO',
        ROTULO_DA_ETAPA_DA_CASA.MURO,
        'LANCOU',
        n,
        `frente ${f2(r.frenteM)} m e divisas ${f2(r.divisasM)} m; ${r.portoesDePedestre} portão(ões) de pedestre e ${r.portoesDeGaragem} de garagem; calçadas ${f2(r.calcadasM2)} m²`,
      );
      // A permeabilidade com as calçadas desenhadas: a projeção + o impermeável delas contra o mínimo da zona.
      const lote = entrada.ctx.terreno?.areaMm2 ? entrada.ctx.terreno.areaMm2 / 1e6 : null;
      const minimo = entrada.ctx.zona.taxaPermeabilidadeMinPct;
      if (lote && minimo != null) {
        const permeavel = ((lote - implantacao.medidas.projecaoM2 - r.impermeavelM2) / lote) * 100;
        if (permeavel < minimo)
          pendencias.push({ grupo: 'VERIFICACAO', texto: `Muro: com as calçadas, a permeabilidade cai a ${f2(permeavel)} % (a zona pede ${f2(minimo)} %) — troque o piso do acesso por drenante ou encurte as calçadas.` });
      }
      return r;
    } catch (x) {
      const motivo = x instanceof Error ? x.message : String(x);
      etapa('MURO', ROTULO_DA_ETAPA_DA_CASA.MURO, 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Muro: ${motivo}` });
      return null;
    }
  };

  // ── ARQUITETURA ───────────────────────────────────────────────────────────
  const q = implantacao.quadro;
  // F14a: a faixa (d, d) do quadro da frente levada ao mundo — numa casa ortogonal, d mm do eixo em qualquer parede.
  const faixaNoMundo = (d: number): Point => {
    const v = paraMundo(q, { x: d, y: d });
    return { x: Math.round(v.x), y: Math.round(v.y) };
  };
  // F14b: o forro de cada cômodo (gesso; PVC nos molhados) a um rebaixo só, que acomoda as faixas das redes.
  const forroLigado = hip.forro.lancar;
  const rebaixoDoForro = rebaixoDoForroMm(hip.forro);
  const etiquetaDoComodo = (model: BlueprintModel, sp: BlueprintModel['spaces'][number]): SpaceLabel | null =>
    model.labels.find((l) => l.levelId === sp.levelId && pointInPolygon(sp.ring, l.at)) ?? null;
  const forroDoComodo = (model: BlueprintModel, sp: BlueprintModel['spaces'][number]) => {
    const etiqueta = etiquetaDoComodo(model, sp);
    const uso = etiqueta?.uso ?? usoDoNome(sp.name);
    const sugerido = presetsSugeridos(uso ? TIPO_NBR5410_DO_USO[uso] : null).forro;
    const preset = sugerido.rebaixoMm ? sugerido : presetDeAcabamento('FORRO_GESSO')!;
    const espessuraMm = preset.camadas.reduce((n, c) => n + c.espessuraMm, 0);
    const tetoMm = model.levels.find((l) => l.id === sp.levelId)?.defaultHeightMm ?? 0;
    return { etiqueta, preset, espessuraMm, faceMm: tetoMm - rebaixoDoForro - espessuraMm, minimoMm: uso && USOS_DE_PERMANENCIA.has(uso) ? hip.forro.peDireitoLivrePermanenciaMm : hip.forro.peDireitoLivreDemaisMm, tetoMm };
  };
  const rl = implantacao.retanguloLocal;
  const terreno = entrada.ctx.terreno;
  const loteDasRegras = loteParaRegras(terreno, entrada.ctx.limites);
  const zona = entrada.ctx.zona;
  const zonaDasRegras: ContextoDeRegras['zona'] = entrada.zonaDasRegras ?? {
    taxaOcupacaoMax: zona.taxaOcupacaoMaxPct,
    coeficienteMax: zona.coeficienteMax,
    gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM,
    gabaritoPavimentos: zona.gabaritoPavimentos,
    taxaPermeabilidadeMin: zona.taxaPermeabilidadeMinPct,
  };
  const entradaDoGerador: EntradaDoGerador = {
    programa,
    envelope: implantacao.contornoLocal ?? [point(rl.x0, rl.y0), point(rl.x1, rl.y0), point(rl.x1, rl.y1), point(rl.x0, rl.y1)],
    direcaoDaFrente: null, // no quadro da frente, a rua é o sul (−y)
    rotacaoNorteDeg: norteNoQuadro(q, entrada.rotacaoNorteDeg),
    latitudeGraus: entrada.latitudeGraus,
    contextoDeRegras: { lote: loteDasRegras, zona: zonaDasRegras },
  };

  // A CONFERÊNCIA e o plano — o fim comum da térrea e do sobrado. TO pela projeção; CA pela soma dos pavimentos.
  type ResumoDasDisciplinas = Omit<PlanoDaCasa['resumo'], 'areaConstruidaM2' | 'ambientesPedidos' | 'ambientesAtendidos' | 'regrasVioladas' | 'terraplenagem' | 'muro'>;
  const fechar = (f: { projecaoM2: number; areaConstruidaM2: number; alturaM: number; semente: number; escolha: string; sobrado: ResumoDoSobrado | null; disciplinas: ResumoDasDisciplinas }): PlanoDaCasa => {
    // F21: o molhado sem lado externo que ganhou EXAUSTOR (a climatização lança onde não há janela) está resolvido pela
    // ventilação mecânica — fica para conferir no código de obras, não "sem solução".
    for (const pd of pendencias) {
      const nome = /^Arquitetura: (.+) exige ventilação e ficou sem lado externo\.$/.exec(pd.texto)?.[1];
      if (!nome) continue;
      const sp = m.spaces.find((x) => x.name === nome);
      if (sp && (m.terminais ?? []).some((t) => t.tipoHidraulico === 'EXAUSTOR_AR' && t.levelId === sp.levelId && pointInPolygon(sp.ring, t.at))) {
        pd.grupo = 'CONFERIR';
        pd.texto = `Arquitetura: ${nome} sem lado externo — ventilação por exaustor com duto até a fachada (confira no código de obras).`;
      }
    }
    const conferencia = conferirPrograma(m, programa);
    for (const it of conferencia.itens) {
      if (it.item.uso === 'CIRCULACAO' || it.faltam <= 0) continue;
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: falta ${it.faltam} × ${it.item.nome} no desenho` });
    }
    for (const rel of conferencia.relacoes) {
      if (rel.estado === 'VIOLADA' && rel.relacao.tipo !== 'DESEJAVEL') pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: ${rel.a.nome} × ${rel.b.nome} — ${rel.relacao.tipo === 'OBRIGATORIA' ? 'deviam ter porta direta' : 'não podiam ser vizinhos'} (${rel.valor})` });
    }
    const atendidos = conferencia.itens.filter((it) => it.item.uso !== 'CIRCULACAO').reduce((s, it) => s + it.casados.length, 0);
    const regras = avaliarRegras(m, REGRAS_SEMENTE, {
      lote: loteDasRegras,
      zona: zonaDasRegras,
      taxaOcupacaoPct: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((f.projecaoM2 / loteDasRegras.areaM2) * 1000) / 10 : null,
      coeficiente: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((f.areaConstruidaM2 / loteDasRegras.areaM2) * 100) / 100 : null,
      alturaM: f.alturaM,
    });
    const violadas = regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO');
    for (const v of violadas) pendencias.push({ grupo: 'VERIFICACAO', texto: `Legislação: ${v.regra.nome} — ${v.alvoRotulo}${v.valores ? ` (${v.valores})` : ''}` });
    etapa('CONFERENCIA', ROTULO_DA_ETAPA_DA_CASA.CONFERENCIA, 'CALCULOU', 0, `${atendidos} de ${pedidos} ambientes do programa; ${violadas.length} regra(s) violada(s)`);
    return {
      levelId: entrada.levelId,
      comandos,
      criados,
      etapas,
      pendencias,
      resultado: m,
      programa,
      implantacao,
      semente: f.semente,
      escolha: f.escolha,
      decisoes,
      sobrado: f.sobrado,
      resumo: { areaConstruidaM2: f.areaConstruidaM2, ambientesPedidos: pedidos, ambientesAtendidos: atendidos, regrasVioladas: violadas.length, ...f.disciplinas, terraplenagem: terraplenagemDaCasa, muro: resumoDoMuro },
    };
  };

  const gerarTodas = (p: Programa) => {
    const resultados: ResultadoDoGerador[] = [];
    const falhas: string[] = [];
    for (const s of hip.sementes.length ? hip.sementes : [1]) {
      try {
        resultados.push(gerar({ ...entradaDoGerador, programa: p }, s, hipGerador));
      } catch (e) {
        falhas.push(`semente ${s}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { resultados, falhas };
  };

  // ── ESTRUTURA (F4) — o molde das etapas estruturais (a térrea e o sobrado) ─────
  // Os lançamentos automáticos da gaveta Estrutural, em cadeia: cada um lê o modelo com o anterior aplicado
  // (vigas apoiam nos pilares, fundações descem dos pilares). Falha ou recusa = motivo na etapa e segue.
  const estrutura = { ...ESTRUTURA_ZERADA };
  const L = entrada.levelId;
  const etapaEstrutural = <P extends { comandos: Command[]; motivo: string | null; avisos?: string[] }>(
    id: Exclude<EtapaDaCasaId, 'IMPLANTACAO' | 'ARQUITETURA' | 'CONFERENCIA'>,
    planejar: (modelo: BlueprintModel) => P,
    contar: (plano: P) => { nota: string; foraDoPlano?: string[] },
  ) => {
    if (!hip.estrutura.lancar) {
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
      return;
    }
    try {
      const plano = planejar(m);
      if (!plano.comandos.length) {
        // Sem nada a lançar: o motivo (recusa) ou, não havendo, o aviso diz por quê (paredes oblíquas, nos eixos).
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], plano.motivo ? 'NAO_RODOU' : 'NADA_A_FAZER', 0, plano.motivo ?? (plano.avisos?.length ? plano.avisos.join('; ') : null));
        if (plano.motivo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${plano.motivo}` });
        return;
      }
      const n = aplicar(plano.comandos);
      const { nota, foraDoPlano = [] } = contar(plano);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota);
      for (const a of plano.avisos ?? []) pendencias.push({ grupo: 'VERIFICACAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${a}` });
      // "Fora do plano" é o planejador PULANDO um ponto (pilar quase duplicado, viga já existente…): o lugar ficou
      // atendido por outra peça ou pede conferência — não é falta de solução.
      // F23: o nó a menos de uma seção de outro pilar é atendido por ele (que apoia as paredes do nó) — para conferir.
      for (const f of foraDoPlano)
        pendencias.push(/a menos de uma seção de outro pilar/.test(f) ? { grupo: 'CONFERIR', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${f} — o pilar vizinho atende os dois encontros` } : { grupo: 'VERIFICACAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${f}` });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
    }
  };
  // ── TELHADO (F5) ──────────────────────────────────────────────────────────
  // Duas águas (ou uma) por extrusão sobre o retângulo da arquitetura, no quadro da frente. A parede termina
  // no pé-direito; com laje lançada, o telhado começa em cima dela. No sobrado, sobre o pavimento de cima.
  let telhado: ResumoDoTelhado | null = null;
  const etapaDoTelhado = (levelId: ObjectId, ret: Retangulo, anexos: readonly Retangulo[], comLaje: boolean) => {
    if (!hip.telhado.lancar) {
      etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
      return;
    }
    const espessuraExterna = hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm;
    const topo = peDireitoMm + (comLaje ? hip.estrutura.lajes.espessuraMm : 0);
    const t = comandosDoTelhado(levelId, ret, q, topo, espessuraExterna / 2, hip.telhado);
    if (!t.ok) {
      etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_RODOU', 0, t.motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Telhado: ${t.motivo}` });
      return;
    }
    // F24: o anexo da casa em L ganha UMA água caindo para fora do principal (atrás → fundos, à frente → frente, ao
    // lado → para aquele lado). O que não encosta em nenhum lado do principal fica para cobrir à mão.
    const dosAnexos: Command[] = [];
    let anexosSemCobertura = 0;
    for (const a of anexos) {
      const caimento = a.y0 >= ret.y1 - 1 ? 'FUNDOS' : a.y1 <= ret.y0 + 1 ? 'FRENTE' : a.x0 >= ret.x1 - 1 ? 'DIREITA' : a.x1 <= ret.x0 + 1 ? 'ESQUERDA' : null;
      const ta = caimento ? comandosDoTelhado(levelId, a, q, topo, espessuraExterna / 2, { ...hip.telhado, tipo: 'UMA_AGUA', caimentoUmaAgua: caimento }) : null;
      if (ta?.ok) dosAnexos.push(...ta.comandos);
      else anexosSemCobertura++;
    }
    try {
      const antes = new Set((m.roofs ?? []).map((r) => r.id));
      const n = aplicar([...t.comandos, ...dosAnexos]);
      // F19 da casa automática: a COMPOSIÇÃO do teto nas águas (de cima para baixo) — sem ela a carga térmica não avaliava
      // o teto ("cobertura sem camadas declaradas") em todo cômodo. O ático como câmara de ar, a laje e o forro de gesso;
      // a telha fica fora (sem condutividade na biblioteca, anularia a conta). Presumida: dita.
      const camadas: CamadaParede[] = [
        { espessuraMm: 300, itemCode: '', descricao: 'Ático (câmara de ar)', funcao: 'CAMARA_AR' },
        ...(comLaje ? [{ espessuraMm: hip.estrutura.lajes.espessuraMm, itemCode: 'INT-CONCRETO', descricao: 'Laje de concreto', funcao: 'ESTRUTURAL' as const }] : []),
        ...(hip.forro.lancar ? [{ espessuraMm: 13, itemCode: 'INT-GESSO', descricao: 'Forro de gesso', funcao: 'ACABAMENTO' as const }] : []),
      ];
      const novas = (m.roofs ?? []).filter((r) => !antes.has(r.id));
      if (novas.length) {
        aplicar(novas.map((r) => ({ type: 'SetAguaProps', aguaId: r.id, camadas }) as Command));
        pendencias.push({ grupo: 'CONFERIR', texto: `Telhado: composição do teto presumida para a carga térmica (ático + ${comLaje ? `laje de ${hip.estrutura.lajes.espessuraMm} mm` : 'sem laje'}${hip.forro.lancar ? ' + forro de gesso' : ''}) — declare as camadas reais nas águas.` });
      }
      telhado = t.resumo;
      const tr = t.resumo;
      etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'LANCOU', n, `${tr.aguas === 2 ? 'duas águas' : 'uma água'} a ${String(hip.telhado.inclinacaoPct).replace('.', ',')} %, cumeeira ${tr.direcao} (${String(tr.cumeeiraM).replace('.', ',')} m), beiral de ${String(hip.telhado.beiralMm / 1000).replace('.', ',')} m — ${String(tr.projecaoM2).replace('.', ',')} m² de projeção`);
      if (dosAnexos.length) pendencias.push({ grupo: 'CONFERIR', texto: `Telhado: ${dosAnexos.length} anexo(s) em uma água caindo para fora do principal — confira o encontro das águas (rufo/calha).` });
      if (anexosSemCobertura) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Telhado: ${anexosSemCobertura} anexo(s) da planta ficaram sem cobertura — cubra à mão (Telhado › Extrusão).` });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Telhado: ${motivo}` });
    }
  };

  // ── INSTALAÇÕES (F6–F9) — da térrea e do sobrado: `niveis` = [térreo] ou [térreo, superior] ─────────
  // Água, esgoto, pluvial, eletrodutos e climatização já leem o modelo inteiro (colunas, tubo de queda, prumadas);
  // âncoras, mobiliário, pontos, circuitos e as conferências rodam pavimento a pavimento.
  const instalacoes = (niveis: ObjectId[], ret: Retangulo, notaDoShaft: string | null = null) => {
    // ── ÂNCORAS (F6) ──────────────────────────────────────────────────────────
    // As peças que os lançamentos de instalações exigem no desenho: caixa d'água (água fria), aquecedor (água
    // quente), caixa de gordura (pia → CG → CI) e as vagas. O destino do esgoto já é hipótese do estudo
    // (`hidro.esgoto.destino`, de 14/10) e entra na F8.
    // No sobrado (F12c): a caixa d'água no pavimento de CIMA (sobre o banheiro, acima da laje dele); aquecedor, caixa
    // de gordura e vagas no térreo.
    let ancoras: ResultadoDasAncoras['resumo'] | null = null;
    if (!hip.ancoras.lancar) etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'NAO_EXIGIDA', 0, 'desligadas nas hipóteses da casa');
    else {
      try {
        const espessuraExterna = hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm;
        const topoDe = (L: ObjectId) => peDireitoMm + ((m.structures ?? []).some((x) => x.levelId === L && x.kind === 'LAJE') ? hip.estrutura.lajes.espessuraMm : 0);
        const base = {
          padrao: doCurto.curto.padrao,
          espessuraExternaMm: espessuraExterna,
          garagemCoberta: doCurto.curto.garagemCoberta,
          quadro: q,
          retanguloLocal: ret,
          anelDoLote: terreno?.anel ?? null,
          vagasDescobertas: implantacao.vagasDescobertas,
          reservatorio: (entrada.hidro ?? HIPOTESES_HIDRO_PADRAO).reservatorio,
        };
        const terreo = niveis[0];
        const topo = niveis[niveis.length - 1];
        const a = comandosDasAncoras(m, { ...base, levelId: terreo, topoMm: topoDe(terreo), vagas: doCurto.curto.vagas, caixaDagua: topo === terreo }, hip.ancoras);
        let n = aplicar(a.comandos);
        const notas = [...a.notas];
        const resumo = { ...a.resumo };
        const pend = [...a.pendencias];
        if (topo !== terreo) {
          const c = comandosDasAncoras(m, { ...base, levelId: topo, topoMm: topoDe(topo), vagas: 0 }, { ...hip.ancoras, aguaQuente: 'NENHUM', caixaDeGordura: false });
          n += aplicar(c.comandos);
          notas.unshift(...c.notas);
          pend.push(...c.pendencias);
          resumo.caixaDaguaL = c.resumo.caixaDaguaL;
        }
        ancoras = resumo;
        if (notaDoShaft) notas.unshift(notaDoShaft);
      etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'LANCOU', n, notas.join(' ') || null);
        // Item 8 (decisão do usuário, 19/10/2026: "parede interna + duto"): o aquecedor na parede interna é a solução
        // escolhida — fica para CONFERIR (o duto), não para decidir.
        for (const x of pend) pendencias.push({ grupo: /ficou numa parede interna/.test(x) ? 'CONFERIR' : 'NAO_DECIDIDO', texto: x });
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'NAO_RODOU', 0, motivo);
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Peças-âncora: ${motivo}` });
      }
    }

    // ── MOBILIÁRIO, LOUÇAS E PONTOS (F7) ──────────────────────────────────────
    // O kit mínimo de cada ambiente (cama, armário, bancada com pia, vaso, lavatório, box, tanque, máquina…); cada
    // LOUÇA lança os pontos dela (água e esgoto, na face da parede — `pontosDasLoucasCriadas`); o planejador por
    // ambiente completa o kit hidráulico SEM duplicar (pula tipo × disciplina que já existe no ambiente): entram a
    // caixa sifonada do banheiro e o que nenhuma louça cobre. Tudo `sugerida`. Água QUENTE só com aquecedor: no
    // chuveiro elétrico (R1-B) ou sem água quente, nenhum ponto de AQ — não há rede para ligá-los.
    const mobiliario = { pecas: 0, pontosDasLoucas: 0, pontosDoKit: 0 };
    const semAguaQuente = !ancoras?.aquecedor && (ancoras?.chuveiroEletrico || hip.ancoras.aguaQuente === 'NENHUM' || hip.ancoras.aguaQuente === 'CHUVEIRO_ELETRICO');
    const hipPontos: HipotesesDePontos = semAguaQuente ? { ...hip.pontos, aguaQuenteEm: [] } : hip.pontos;
    const etapaSimples = (id: 'MOBILIARIO' | 'LOUCAS' | 'PONTOS_HIDRAULICOS', fazer: () => { comandos: Command[]; nota: string }) => {
      if (!hip.mobiliario.lancar) {
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
        return 0;
      }
      try {
        const { comandos: lote, nota } = fazer();
        const n = aplicar(lote);
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota);
        return n;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
        return 0;
      }
    };
    let criadosDoMobiliario: ObjectId[] = [];
    etapaSimples('MOBILIARIO', () => {
      const porNivel = niveis.map((L) => ({ L, lista: mobiliarNivel(m, L, hip.mobiliario) }));
      const lista = porNivel.flatMap((x) => x.lista);
      const lote = porNivel.flatMap((x) => comandosDeMobiliario(x.lista, x.L, m));
      // Os ids que o mobiliário vai criar (o kernel é determinístico: a simulação dá os mesmos ids da aplicação) —
      // os pontos das louças são planejados para eles.
      criadosDoMobiliario = lote.length ? applyBatch(m, lote).diff.created : [];
      const naoCouberam = lista.flatMap((a) => a.naoCouberam.map((x) => `${a.rotulo}: ${x}`));
      for (const x of naoCouberam) pendencias.push({ grupo: 'VERIFICACAO', texto: `Mobiliário: ${x}` });
      // F20: a peça que só coube menor — para conferir, não decidir.
      const reduzidas = lista.flatMap((a) => a.reduzidas.map((x) => `${a.rotulo}: ${x}`));
      for (const x of reduzidas) pendencias.push({ grupo: 'CONFERIR', texto: `Mobiliário: ${x} (a maior não coube)` });
      mobiliario.pecas = lote.length;
      return { comandos: lote, nota: `${lote.length} peça(s) em ${lista.filter((a) => a.pecas.length).length} ambiente(s)${reduzidas.length ? `; ${reduzidas.length} menor(es)` : ''}${naoCouberam.length ? `; ${naoCouberam.length} não couberam` : ''}` };
    });
    etapaSimples('LOUCAS', () => {
      const lote = pontosDasLoucasCriadas(m, criadosDoMobiliario, hipPontos, { sugerida: true });
      mobiliario.pontosDasLoucas = lote.length;
      return { comandos: lote, nota: `${lote.length} ponto(s) — cada louça liga a sua água e o seu esgoto${semAguaQuente ? '; sem água quente (não há aquecedor)' : ''}` };
    });
    etapaSimples('PONTOS_HIDRAULICOS', () => {
      const planos = niveis.flatMap((L) => planejarPontosDoNivel(m, L, hipPontos));
      // F14c: o coletor do box (caixa sifonada, ralo) que cai DENTRO de um shaft (o do F12c nasce antes dele) sai pelo
      // lado mais perto, 15 cm além da face, no mesmo cômodo — dentro, o esgoto que chega nele cruzava as colunas de
      // água do centro do shaft (sobrado a 30°).
      const lote = coletoresForaDoShaft(m, planos.flatMap((pl) => pl.comandos));
      for (const pl of planos) if (pl.motivo && !pl.comandos.length && pl.aCriar === 0 && pl.jaExistentes === 0) pendencias.push({ grupo: 'VERIFICACAO', texto: `Pontos de ${pl.nome}: ${pl.motivo}` });
      mobiliario.pontosDoKit = lote.length;
      return { comandos: lote, nota: `${lote.length} ponto(s) que nenhuma louça cobre (caixa sifonada, ralo…)` };
    });

    // F14c: no sobrado, cada grupo de peças de cima (o banheiro) com o shaft a até `shaftAteAsPecasMm` do centro delas —
    // o shaft do F12c nasce antes do mobiliário e, no banheiro comprido, ficava a 5 m das peças; sem um perto, ganha um
    // junto delas (o tubo de queda desce ali e o esgoto cabe no enchimento da laje rebaixada).
    // F27-D4: em cada pavimento de cima — na casa de 3, o shaft do banheiro do 2º desce até o térreo atravessando o 1º.
    const T0 = niveis[0];
    for (let k = 1; k < niveis.length; k++) {
      const S0 = niveis[k];
      const meio = niveis.slice(1, k);
      const pecas = (m.terminais ?? []).filter((t) => t.levelId === S0 && t.disciplina === 'ESGOTO');
      const grupos = gruposDoTuboDeQueda(m, S0, pecas, hip.sobrado.grupoDoTuboDeQuedaMm);
      const escada = m.spaces.find((sp) => sp.levelId === S0 && /escada/i.test(sp.name ?? ''))?.ring ?? null;
      const novos: string[] = [];
      for (const g of grupos) {
        const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
        const ban = m.spaces.find((sp) => sp.levelId === S0 && g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
        if (!ban) continue;
        const sh = shaftDoGrupo(m, T0, S0, ban.ring, alvo, escada, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, meio);
        if (sh && !sh.novo) continue;
        if (!sh) {
          pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Shaft: ${ban.name} não tem lugar junto das peças para o shaft (parede com parede embaixo, ou cômodo de baixo que aceite a caixa) — o tubo de queda desce longe delas; ponha o shaft à mão.` });
          continue;
        }
        aplicar([{ type: 'AddNucleo', levelId: T0, ateLevelId: S0, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]);
        novos.push(`${ban.name}${sh.noTerreo ? ` (descendo na ${sh.noTerreo})` : ''}`);
      }
      if (novos.length) pendencias.push({ grupo: 'CONFERIR', texto: `Shaft junto das peças: ${novos.join('; ')} — o do F12c ficava a mais de ${f2(hip.sobrado.shaftAteAsPecasMm / 1000)} m delas.` });
    }

    // ── HIDRÁULICA (F8) ───────────────────────────────────────────────────────
    // Os "Lançar tudo" das gavetas, na ordem e com as premissas do ESTUDO (`hidro`, as mesmas da gaveta):
    //  - ÁGUA: peças da caixa → barrilete, colunas e ramais (fria e, com aquecedor, quente) → hidrômetro e
    //    alimentador na frente do lote → recalque, se houver reservatório inferior;
    //  - ESGOTO: caixa de inspeção, ramais e coletor até a LIGAÇÃO à rede pública — ou, com o destino TRATAMENTO
    //    (`hidro.esgoto.destino`), tanque séptico, filtro e sumidouro dimensionados pela reservação — e ventilação;
    //  - PLUVIAL: calhas no beiral do telhado, condutores e saída na frente (precisa da intensidade de chuva:
    //    a cidade ou o valor nas premissas).
    // O que cada um PRESUMIU (cota estimada da rede, posição da caixa…) vai às pendências CONFERIR; o que faltou do
    // mundo, às PREMISSA. A casa nasce num pavimento vazio: não há peça confirmada do outro destino para apagar.
    // F14a ("forro com faixas"): a água quente e o esgoto traçados nas FAIXAS deles — a fria no eixo das paredes.
    const hidroDoEstudo = entrada.hidro ?? HIPOTESES_HIDRO_PADRAO;
    const hidro: HipotesesHidro = {
      ...hidroDoEstudo,
      // F14b: e os ramais no forro, nas faixas da fria e da quente.
      agua: {
        ...hidroDoEstudo.agua,
        faixaDaAguaQuente: faixaNoMundo(hip.faixas.aguaQuenteMm),
        noForro: forroLigado ? { aguaFria: hip.forro.aguaFria, aguaQuente: hip.forro.aguaQuente, folgaSobAVigaMm: hip.forro.folgaSobAVigaMm } : null,
      },
      // F17 (decisão do usuário, "sobe pela fachada"): o alimentador enterrado só até a parede da frente — sobe nela e
      // corre sobre a laje até a caixa; sob o piso ele cruzava o esgoto enterrado. A premissa do estudo, se houver, vale.
      alimentacao: { ...hidroDoEstudo.alimentacao, subida: hidroDoEstudo.alimentacao.subida ?? 'FACHADA' },
      // F14c: no sobrado, um tubo de queda por banheiro de cima (cada um no shaft dele).
      esgoto: { ...hidroDoEstudo.esgoto, faixa: faixaNoMundo(hip.faixas.esgotoMm), ...(niveis.length > 1 ? { tuboDeQuedaPorGrupoMm: hip.sobrado.grupoDoTuboDeQuedaMm, raioDoShaftMm: hip.sobrado.tuboDeQuedaAteOShaftMm } : {}) },
    };
    const terrenoHidro = entrada.leitorDoTerreno ?? null;
    const hidraulica = HIDRAULICA_ZERADA();
    const contar = (lote: Command[]) => ({ pecas: lote.filter((c) => c.type === 'AddTerminal').length, tubos: lote.filter((c) => c.type === 'AddTrecho').length });
    const etapaDeRede = (id: 'AGUA' | 'ESGOTO' | 'PLUVIAL', planejar: () => { comandos: Command[]; presumido: string[]; pendencias: string[] }, nota: (n: { pecas: number; tubos: number }) => string): { pecas: number; tubos: number } => {
      if (!hip.hidraulica.lancar) {
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
        return { pecas: 0, tubos: 0 };
      }
      try {
        const plano = planejar();
        for (const x of plano.presumido) pendencias.push({ grupo: 'CONFERIR', texto: `${ROTULO_DA_ETAPA_DA_CASA[id].split(' (')[0]}: ${x}` });
        for (const x of plano.pendencias) pendencias.push({ grupo: 'PREMISSA', texto: `${ROTULO_DA_ETAPA_DA_CASA[id].split(' (')[0]}: ${x}` });
        if (!plano.comandos.length) {
          etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], plano.pendencias.length ? 'NAO_RODOU' : 'NADA_A_FAZER', 0, plano.pendencias[0] ?? null);
          return { pecas: 0, tubos: 0 };
        }
        const c = contar(plano.comandos);
        // A água ENCOSTA na face da parede o ponto solto no cômodo (`TranslateEntities`), e o kernel trata mover
        // como decidir: a marca "sugerida" cai. Aqui ninguém decidiu nada — o ponto continua proposta do sistema,
        // e volta a ser marcado no mesmo lote.
        const sugeridos = new Set(m.terminais.filter((t) => t.sugerida).map((t) => t.id));
        let n = aplicar(plano.comandos);
        n += aplicar(m.terminais.filter((t) => sugeridos.has(t.id) && !t.sugerida).map((t): Command => ({ type: 'SetTerminalProps', terminalId: t.id, sugerida: true })));
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota(c) + (plano.pendencias.length ? ` — ${plano.pendencias.length} pendência(s)` : ''));
        return c;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
        return { pecas: 0, tubos: 0 };
      }
    };
    // F13: a pressão por caso, ANTES do traçado — a caixa elevada ou o pressurizador entram no mesmo lote.
    let pressao: DecisaoDaPressao | null = null;
    hidraulica.agua = etapaDeRede(
      'AGUA',
      () => {
        pressao = decidirPressao(m, hidro, terrenoHidro, hip.pressao);
        // O plano da última simulação já é o traçado sobre o modelo com a solução — sem traçar de novo.
        const plano = pressao.plano ?? planejarAguaCompleta(pressao.comandos.length ? applyBatch(m, pressao.comandos).model : m, hidro, terrenoHidro);
        return { ...plano, comandos: [...pressao.comandos, ...plano.comandos] };
      },
      (c) => {
        const d = pressao as DecisaoDaPressao | null;
        const sol =
          d?.solucao === 'CAIXA_ELEVADA'
            ? `; caixa d'água elevada em ${f2(d.elevacaoMm / 1000)} m para a pressão`
            : d?.solucao === 'PRESSURIZADOR'
              ? `; pressurizador na saída da caixa (+${hidro.pressao.ganhoDoPressurizadorKpa} kPa)`
              : '';
        return `${c.tubos} tubo(s) e ${c.pecas} peça(s)${sol}`;
      },
    );
    {
      const d = pressao as DecisaoDaPressao | null;
      if (d?.solucao === 'CAIXA_ELEVADA')
        pendencias.push({ grupo: 'CONFERIR', texto: `Pressão: a caixa d'água subiu ${f2(d.elevacaoMm / 1000)} m (faltavam ${f2(d.deficitM)} m de coluna no ponto mais desfavorável) — preveja a base elevada (torre) na estrutura.` });
      if (d?.solucao === 'PRESSURIZADOR')
        pendencias.push({
          grupo: 'CONFERIR',
          texto: `Pressão: faltavam ${f2(d.deficitM)} m de coluna — elevar a caixa até ${f2(hip.pressao.caixaElevadaAteMm / 1000)} m não basta; pressurizador na saída da caixa (+${hidro.pressao.ganhoDoPressurizadorKpa} kPa, ${hip.pressao.potenciaDoPressurizadorW} W, com ponto elétrico e circuito)${d.elevacaoMm > 0 ? ` e, como ele sozinho também não bastava, a caixa subiu ${f2(d.elevacaoMm / 1000)} m — preveja a base elevada (torre)` : ''} — confira o modelo no catálogo.`,
        });
    }
    const destino = destinoDoEsgoto(hidro.esgoto);
    hidraulica.esgoto = {
      ...etapaDeRede(
        'ESGOTO',
        () => {
          const medidas = destino === 'TRATAMENTO' ? medidasDimensionadas(dimensionarTratamento(m, hidro.tratamento, hidro.reservatorio)) : undefined;
          return planejarEsgotoCompleto(m, hidro.esgoto, terrenoHidro, { tratamento: { comFiltro: hidro.tratamento.comFiltro, medidas } });
        },
        (c) => `${c.tubos} tubo(s) e ${c.pecas} peça(s) — destino: ${destino === 'TRATAMENTO' ? 'tratamento individual (tanque, filtro, sumidouro)' : 'rede pública'}`,
      ),
      destino,
    };
    hidraulica.pluvial = etapaDeRede('PLUVIAL', () => planejarPluvialCompleta(m, hidro.pluvial, terrenoHidro), (c) => `${c.tubos} tubo(s) e ${c.pecas} peça(s)`);
    // F18: o condutor pluvial horizontal (enterrado, para a saída na frente do lote) é traçado depois do esgoto e o
    // cruzava rente (15 × 25: a ligação de esgoto, com 6 cm entre os eixos). Ele passa POR CIMA — a saída fica na
    // sarjeta —: o início sobe (`profundidadeDoCondutorMm`) até livrar todo cruzamento, sem passar do recobrimento.
    if (hip.hidraulica.lancar && hidraulica.pluvial.tubos > 0 && pluvialRenteAoEsgoto(m) > 0) {
      let prof = hidro.pluvial.profundidadeDoCondutorMm;
      const minimo = hidro.alimentacao.recobrimentoMinimoMm ?? 150;
      // F25: cada passo planejado a partir do MESMO desenho e fica o de menos encontros (o inicial, se nenhum melhora) —
      // parar no primeiro passo que não melhora perdia o que livrava dois passos adiante; aceitar todos estragava o
      // cruzamento por baixo perto da saída (o coletor fundo no terreno inclinado).
      let melhor: { prof: number; comandos: Command[]; encontros: number } | null = null;
      let encontros = pluvialRenteAoEsgoto(m);
      for (let volta = 1; volta <= 4; volta++) {
        const nova = hidro.pluvial.profundidadeDoCondutorMm - volta * PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM;
        if (nova < minimo) break;
        const cond = planejarCondutores(m, { ...hidro.pluvial, profundidadeDoCondutorMm: nova }, terrenoHidro);
        if (cond.motivo || !cond.comandos.length) break;
        const n = pluvialRenteAoEsgoto(applyBatch(m, cond.comandos).model);
        if (n < encontros) {
          melhor = { prof: nova, comandos: cond.comandos, encontros: n };
          encontros = n;
          if (n === 0) break;
        }
      }
      if (melhor) {
        prof = melhor.prof;
        aplicar(melhor.comandos);
      }
      if (pluvialRenteAoEsgoto(m) > 0) pendencias.push({ grupo: 'VERIFICACAO', texto: `Águas pluviais: o condutor horizontal passa rente ao esgoto mesmo começando a ${f2(-prof / 1000)} m — confira o cruzamento (ou mude a saída).` });
      else pendencias.push({ grupo: 'CONFERIR', texto: `Águas pluviais: o condutor horizontal começa a ${f2(-prof / 1000)} m para passar por cima do esgoto.` });
    }
    // F18: o alimentador ENTERRADO é traçado antes do esgoto e do pluvial, que depois o cruzavam na mesma cota (o
    // esgoto e o condutor horizontal correm para a frente do lote). Agora ele passa POR CIMA deles (NBR 5626) — ou,
    // sem recobrimento para isso, por baixo, dito.
    if (hip.hidraulica.lancar) {
      const ajuste = cotaEnterradaAcimaDasRedes(m, hidro.alimentacao);
      if (ajuste.cruzamentos > 0 && ajuste.cotaMm !== hidro.alimentacao.cotaEnterradaMm) {
        const alim = planejarAlimentador(m, { ...hidro.alimentacao, cotaEnterradaMm: ajuste.cotaMm }, hidro.reservatorio, hidro.pressao.qMaxDoHidrometroM3h, terrenoHidro);
        if (!alim.motivo && alim.comandos.length) {
          aplicar(alim.comandos);
          const cota = f2(ajuste.cotaMm / 1000);
          pendencias.push(
            ajuste.sob
              ? { grupo: 'VERIFICACAO', texto: `Alimentador: a ${cota} m, POR BAIXO de ${ajuste.cruzamentos} cruzamento(s) com esgoto/pluvial — por cima não havia recobrimento; proteja a travessia (luva) e confira (NBR 5626).` }
              : { grupo: 'CONFERIR', texto: `Alimentador: a ${cota} m, por cima de ${ajuste.cruzamentos} cruzamento(s) com esgoto/pluvial (NBR 5626).` },
          );
        }
      }
    }

    // A VERIFICAÇÃO DE REDE do app sobre o resultado: tubos soltos, sem destino, contrafluxo, desconector sem
    // ventilação, tubo atravessando pilar ou cruzando viga. O que ela acusa vira pendência com a contagem, por tipo
    // (ERRO → VERIFICACAO; AVISO → CONFERIR). Medido em 15/10: a rede sai ligada (nenhuma ponta aberta, nenhum
    // trecho sem destino), mas o traçado pelas paredes cruza os pilares dos encontros — compatibilização à parte.
    const verificarRedes = (rotulos: Record<string, string>, alvo: { erros: number; avisos: number; porTipo: Record<string, number> }) => {
      const marcas = niveis.flatMap((L) => marcasDeVerificacao(m, L, [], hidro.pluvial)).filter((x) => x.disciplina && x.disciplina in rotulos);
      const grupos = new Map<string, { severidade: 'ERRO' | 'AVISO'; disciplina: string; tipo: string; n: number; texto: string }>();
      for (const x of marcas) {
        const k = `${x.severidade}|${x.disciplina}|${x.tipo}`;
        const g = grupos.get(k) ?? { severidade: x.severidade, disciplina: x.disciplina!, tipo: x.tipo, n: 0, texto: x.texto };
        g.n++;
        grupos.set(k, g);
      }
      for (const g of grupos.values()) {
        alvo[g.severidade === 'ERRO' ? 'erros' : 'avisos'] += g.n;
        alvo.porTipo[g.tipo] = (alvo.porTipo[g.tipo] ?? 0) + g.n;
        const oque = MARCA_DA_REDE[g.tipo] ? `${g.n} ${MARCA_DA_REDE[g.tipo]}` : `${g.n} × ${g.texto}`;
        pendencias.push({ grupo: g.severidade === 'ERRO' ? 'VERIFICACAO' : 'CONFERIR', texto: `Rede de ${rotulos[g.disciplina]}: ${oque}` });
      }
    };
    if (hip.hidraulica.lancar && (hidraulica.agua.tubos + hidraulica.esgoto.tubos + hidraulica.pluvial.tubos) > 0) verificarRedes(ROTULO_DA_DISCIPLINA_DA_REDE, hidraulica.verificacao);

    // A PRESSÃO nos pontos (o cálculo do app, o mesmo do selo no desenho): por gravidade, a caixa pouco acima do teto
    // não vence a perda do aquecedor (térrea) nem a altura dos pontos de cima (sobrado) — medido em 15/10/2026, a
    // água quente da térrea saía com −27 a −65 kPa e nada dizia. Aqui fica DITO, por rede, com as saídas; resolver
    // (caixa elevada ou pressurizador) é decisão de projeto.
    if (hip.hidraulica.lancar && hidraulica.agua.tubos > 0) {
      const caixa = (m.terminais ?? []).find((t) => t.tipoHidraulico === 'RESERVATORIO');
      const cotaDaCaixaM = caixa ? ((m.levels.find((l) => l.id === caixa.levelId)?.elevationMm ?? 0) + caixa.cotaMm) / 1000 : null;
      for (const rede of pressoesDoModelo(m)) {
        const baixos = rede.pontos.filter((x) => x.estado === 'INSUFICIENTE' && x.disponivelKpa != null);
        if (!baixos.length) continue;
        const pior = [...baixos].sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa))[0];
        const comodo = m.spaces.find((x) => x.levelId === pior.levelId && pointInPolygon(x.ring, pior.at as Point))?.name;
        hidraulica.pressaoInsuficiente[rede.disciplina === 'AGUA_QUENTE' ? 'quente' : 'fria'] += baixos.length;
        pendencias.push({
          grupo: 'VERIFICACAO',
          texto: `Pressão da ${ROTULO_DA_DISCIPLINA_DA_REDE[rede.disciplina]}: ${baixos.length} ponto(s) abaixo do mínimo — o pior, ${pior.nome}${comodo ? ` (${comodo})` : ''}, com ${pior.disponivelKpa!.toFixed(1).replace('.', ',')} kPa (mínimo ${String(pior.minimaKpa).replace('.', ',')}). ${cotaDaCaixaM != null ? `Com a caixa d'água a ${f2(cotaDaCaixaM)} m, a gravidade não basta: ` : ''}eleve a caixa (hipótese "caixa acima da laje") ou preveja um pressurizador.`,
        });
      }
    }

    // ── ELÉTRICA E CLIMATIZAÇÃO (F9) ──────────────────────────────────────────
    // A ordem é a que as peças pedem: os PONTOS pela norma (com a potência padrão — o centro de cargas precisa
    // dela) e o chuveiro elétrico → o QUADRO no centro de cargas (+ entrada de serviço e medidor na frente) →
    // os CIRCUITOS → a CLIMATIZAÇÃO (ela liga os circuitos dos splits só com UM quadro e nenhum ponto solto, por
    // isso depois) → DR e DPS (o DR é por circuito) → ELETRODUTOS por último (precisam dos circuitos). No fim,
    // `conferirNbr5410` sobre o resultado: FALTA → VERIFICACAO, AVISO → CONFERIR.
    const eletrica = ELETRICA_ZERADA();
    const climatizacao = CLIMATIZACAO_ZERADA();
    const hipCircuitos = entrada.circuitos ?? HIPOTESES_CIRCUITOS_PADRAO;
    const hipEletricas = entrada.eletricas ?? HIPOTESES_ELETRICAS_PADRAO;
    const ETAPAS_ELETRICAS = ['PONTOS_ELETRICOS', 'QUADRO', 'CIRCUITOS', 'CLIMATIZACAO', 'DR_DPS', 'ELETRODUTOS'] as const;
    let quadroId: ObjectId | null = null;
    const tentarEletrica = (id: (typeof ETAPAS_ELETRICAS)[number], fazer: () => void) => {
      try {
        fazer();
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
      }
    };
    if (!hip.eletrica.lancar) {
      for (const id of ETAPAS_ELETRICAS) etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
    } else {
      tentarEletrica('PONTOS_ELETRICOS', () => {
        const lote = niveis.flatMap((L) =>
          comandosDePontosDoNivel(m, L, {
            peDireitoMm: m.levels.find((l) => l.id === L)!.defaultHeightMm,
            areaPorLuminariaM2: hip.eletrica.areaPorLuminariaM2,
            // F14b: no forro, a tomada também fica longe do ponto de água (a descida dela cruzava a entrada da quente no
            // aquecedor, na mesma posição ao longo da parede).
            // F14c: e das PRUMADAS das outras redes que correm na parede (a coluna de ventilação do esgoto: a descida da
            // tomada caía em cima dela, térrea a 30°).
            ocupados: [
              ...(m.terminais ?? []).filter((t) => t.levelId === L && (t.disciplina === 'ELETRICA' || (forroLigado && (t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE')))).map((t) => t.at),
              ...(forroLigado ? (m.trechos ?? []).filter((t) => t.levelId === L && t.disciplina !== 'ELETRICA' && t.a.x === t.b.x && t.a.y === t.b.y && Math.max(t.cotaAMm, t.cotaBMm) > 300).map((t) => t.a) : []),
              // F14c: e da parede sob a laje REBAIXADA — ali o forro não tem plenum, e o eletroduto não chega pelo anel
              // (a tomada do canto da cozinha, sob o banheiro da suíte, ficava ligada em reta pelo meio do cômodo).
              ...(forroLigado ? paredesSobORebaixo(m, L) : []),
            ],
          }),
        );
        // F14b: a luz de teto na FACE do forro do cômodo — a rede corre no plenum, acima dela.
        if (forroLigado) {
          for (let i = 0; i < lote.length; i++) {
            const c = lote[i];
            if (c.type !== 'AddTerminal' || (c as { tipoEletrico?: string | null }).tipoEletrico !== 'ILUMINACAO_TETO') continue;
            const sp = comodosComForro(m, c.levelId).find((x) => pointInPolygon(x.ring, c.at));
            // F14c: e fora da laje REBAIXADA (sob o banheiro de cima): ali o forro não tem plenum, e o eletroduto da luz
            // atravessava a área rebaixada em reta (sobrado a 0°).
            const teto = m.levels.find((l) => l.id === c.levelId)?.defaultHeightMm ?? Infinity;
            const rebaixos = (m.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === c.levelId && x.baseMm < teto - 1).map((x) => x.pontos as Point[]);
            const at = (sp && foraDoPoligono(rebaixos, c.at, sp.ring, LUZ_ALEM_DO_REBAIXO_MM)) || c.at;
            if (sp) lote[i] = { ...c, at, cotaMm: Math.round(forroDoComodo(m, sp).faceMm) } as Command;
          }
        }
        // F18: os pontos NA PAREDE (interruptor, tomada) fora do PILAR: escorregam pela face, fora de vão — o interruptor
        // junto da porta caía na pegada do pilar do canto, e a descida do eletroduto corria dentro dele (15 × 25).
        for (let i = 0; i < lote.length; i++) {
          const c = lote[i] as Extract<Command, { type: 'AddTerminal' }>;
          if (c.type !== 'AddTerminal' || !c.tipoEletrico || c.tipoEletrico === 'ILUMINACAO_TETO') continue;
          const aneis = pegadasDePilares(m, c.levelId).map((g) => anelDoPilar(g, LUZ_FORA_DO_PILAR_MM) as Point[]);
          if (!aneis.some((g) => pointInPolygon(g, c.at))) continue;
          const enc = encaixarNaParede(c.at, m.walls.filter((w) => w.levelId === c.levelId), 400);
          if (!enc) continue;
          const w = enc.parede;
          const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
          const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
          const t0 = (c.at.x - w.a.x) * u.x + (c.at.y - w.a.y) * u.y;
          const noVao = (t: number) => m.openings.some((o) => o.wallId === w.id && t > o.offsetMm - LUZ_FORA_DO_PILAR_MM && t < o.offsetMm + o.widthMm + LUZ_FORA_DO_PILAR_MM && c.cotaMm > o.sillMm - LUZ_FORA_DO_PILAR_MM && c.cotaMm < o.sillMm + o.heightMm);
          for (let d = 50; d <= 800; d += 50) {
            const q = [d, -d].map((k) => ({ k, p: { x: Math.round(c.at.x + u.x * k), y: Math.round(c.at.y + u.y * k) } as Point })).find(({ k, p }) => t0 + k >= 0 && t0 + k <= L && !noVao(t0 + k) && !aneis.some((g) => pointInPolygon(g, p)));
            if (q) {
              lote[i] = { ...c, at: q.p } as Command;
              break;
            }
          }
        }
        // F18: e a luz de teto fora do PILAR (com ou sem forro) — no centro de um cômodo pequeno ela caía na pegada dele,
        // e o eletroduto subia por dentro do pilar (R1-A).
        for (let i = 0; i < lote.length; i++) {
          const c = lote[i];
          if (c.type !== 'AddTerminal' || (c as { tipoEletrico?: string | null }).tipoEletrico !== 'ILUMINACAO_TETO') continue;
          const pilares = pegadasDePilares(m, c.levelId).map((g) => anelDoPilar(g, LUZ_FORA_DO_PILAR_MM) as Point[]);
          const sp = m.spaces.find((x) => x.levelId === c.levelId && pointInPolygon(x.ring, c.at));
          const at = foraDoPoligono(pilares, c.at, sp?.ring ?? null, LUZ_ALEM_DO_REBAIXO_MM);
          if (at) lote[i] = { ...c, at } as Command;
        }
        // O CHUVEIRO ELÉTRICO é LIGAÇÃO DIRETA (a 9.5.2.3 acusa chuveiro em tomada), no ponto hidráulico dele, com a
        // potência declarada — a padrão não dá potência a ligação direta. Exige DR e ganha circuito próprio.
        if (ancoras?.chuveiroEletrico) {
          for (const c of (m.terminais ?? []).filter((t) => niveis.includes(t.levelId) && t.tipoHidraulico === 'CHUVEIRO' && t.disciplina === 'AGUA_FRIA')) {
            // F18: AO LADO da saída d'água, na face (o afastamento lateral dos pontos), do lado sem tubo — no mesmo ponto, a
            // água e o eletroduto desciam juntos na parede e se cruzavam (R1-B).
            const cota = COTA_USUAL_DO_PONTO_ELETRICO.LIGACAO_DIRETA;
            const enc = encaixarNaParede(c.at, m.walls.filter((w) => w.levelId === c.levelId), 400);
            const afast = hip.pontos.afastamentoFriaQuenteMm ?? 150;
            const u = enc ? { x: (enc.parede.b.x - enc.parede.a.x) / Math.hypot(enc.parede.b.x - enc.parede.a.x, enc.parede.b.y - enc.parede.a.y), y: (enc.parede.b.y - enc.parede.a.y) / Math.hypot(enc.parede.b.x - enc.parede.a.x, enc.parede.b.y - enc.parede.a.y) } : null;
            const lados = u ? [1, -1].map((k) => ({ x: Math.round(c.at.x + u.x * afast * k), y: Math.round(c.at.y + u.y * afast * k) })) : [];
            const livre = (q: Point) => (m.trechos ?? []).every((t) => t.levelId !== c.levelId || distanciaAoTrecho3D(q, cota, t) > t.bitolaMm / 2 + afast / 2);
            const at = lados.find(livre) ?? { ...c.at };
            lote.push({
              type: 'AddTerminal', levelId: c.levelId, disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO.LIGACAO_DIRETA, at,
              cotaMm: COTA_USUAL_DO_PONTO_ELETRICO.LIGACAO_DIRETA, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: hip.eletrica.chuveiroEletricoVA, rotulo: 'Chuveiro', sugerida: true,
            } as Command);
          }
        }
        // F13: o PRESSURIZADOR é ligação direta, com a potência das hipóteses (ganha circuito próprio).
        // F22: o ponto ao LADO da bomba onde a subida do eletroduto (do forro até ele) não encontra tubo — no lugar dela,
        // ela subia através do barrilete que sai da caixa (12 × 30).
        const teto = (L: string) => (m.levels.find((l) => l.id === L)?.defaultHeightMm ?? 2800) - 45;
        const subidaLivre = (q: Point, levelId: string, cota: number) => {
          const A = { x: q.x, y: q.y, z: Math.min(teto(levelId), cota) };
          const B = { x: q.x, y: q.y, z: Math.max(teto(levelId), cota) };
          return (m.trechos ?? []).every((t) => t.levelId !== levelId || distanciaEntreEixos3D(A, B, { x: t.a.x, y: t.a.y, z: t.cotaAMm }, { x: t.b.x, y: t.b.y, z: t.cotaBMm }) > envelopeDoTrecho(t).raioPlantaMm + 25 + FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM);
        };
        for (const b of (m.terminais ?? []).filter((t) => niveis.includes(t.levelId) && t.tipoHidraulico === 'BOMBA' && t.disciplina === 'AGUA_FRIA')) {
          const lugares = [{ x: 0, y: 0 }, ...[150, 300, 450].flatMap((d) => [{ x: d, y: 0 }, { x: -d, y: 0 }, { x: 0, y: d }, { x: 0, y: -d }])].map((o) => point(b.at.x + o.x, b.at.y + o.y));
          const at = lugares.find((q) => subidaLivre(q, b.levelId, b.cotaMm)) ?? { ...b.at };
          lote.push({
            type: 'AddTerminal', levelId: b.levelId, disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO.LIGACAO_DIRETA, at,
            cotaMm: b.cotaMm, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: hip.pressao.potenciaDoPressurizadorW, rotulo: 'Pressurizador', sugerida: true,
          } as Command);
        }
        const tipoDe = (c: Command) => (c.type === 'AddTerminal' ? (c as { tipoEletrico?: string | null }).tipoEletrico ?? null : null);
        eletrica.pontos = {
          tomadas: lote.filter((c) => tipoDe(c) === 'TUG' || tipoDe(c) === 'TUE').length,
          luzes: lote.filter((c) => /^ILUMINACAO/.test(tipoDe(c) ?? '')).length,
          interruptores: lote.filter((c) => tipoDe(c) === 'INTERRUPTOR').length,
          ligacoesDiretas: lote.filter((c) => tipoDe(c) === 'LIGACAO_DIRETA').length,
        };
        const p = eletrica.pontos;
        etapa('PONTOS_ELETRICOS', ROTULO_DA_ETAPA_DA_CASA.PONTOS_ELETRICOS, 'LANCOU', aplicar(lote), `${p.tomadas} tomada(s), ${p.luzes} luz(es), ${p.interruptores} interruptor(es)${p.ligacoesDiretas ? `, ${p.ligacoesDiretas} chuveiro(s) elétrico(s) de ${hip.eletrica.chuveiroEletricoVA} W` : ''}`);
      });
      tentarEletrica('QUADRO', () => {
        // No sobrado, o quadro fica no TÉRREO (perto do medidor e da cozinha), no centro de cargas de lá — solto, o
        // centro iria para o pavimento de mais carga, que pode ser o de cima.
        const c0 = centroDeCargas(niveis.length > 1 ? { ...m, terminais: (m.terminais ?? []).filter((t) => t.disciplina !== 'ELETRICA' || t.levelId === niveis[0]) } : m, null);
      // E a prumada do eletroduto sobe na posição do quadro: no sobrado, o quadro vai para a parede do térreo que
      // tem parede em cima (a até 3 m do centro de cargas) — senão a prumada sobe pelo meio de um cômodo de cima.
      const sobreParede = c0 && niveis.length > 1 ? encaixarNaParede(c0.posicaoSugerida, paredesEmComum(m.walls.filter((w) => w.levelId === niveis[0]), niveis.slice(1).map((L) => m.walls.filter((w) => w.levelId === L))), 3000) : null;
      const c = c0 && sobreParede ? { ...c0, posicaoSugerida: { x: Math.round(sobreParede.q.x), y: Math.round(sobreParede.q.y) }, paredeId: sobreParede.parede.id } : c0;
        if (!c) {
          etapa('QUADRO', ROTULO_DA_ETAPA_DA_CASA.QUADRO, 'NAO_RODOU', 0, 'nenhum ponto com potência — sem centro de cargas');
          return;
        }
        // F14b: no forro, os eletrodutos sobem do quadro até a faixa deles — se a travessia de outra rede (lançada antes)
        // passa bem ali, o quadro escorrega pela parede até ficar livre (de 10 em 10 cm, até 80 cm; fora de vão e pilar).
        if (forroLigado) {
          const L0 = niveis[0];
          const teto = m.levels.find((l) => l.id === L0)!.defaultHeightMm;
          const parede = encaixarNaParede(c.posicaoSugerida, m.walls.filter((w) => w.levelId === L0), 600)?.parede ?? null;
          const dSeg = (p: Point, a: Point, b: Point) => {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const L2 = dx * dx + dy * dy;
            const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
            return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
          };
          const noForro = (m.trechos ?? []).filter((t) => t.levelId === L0 && t.disciplina !== 'ELETRICA' && t.cotaAMm === t.cotaBMm && t.cotaAMm > teto - rebaixoDoForro && t.cotaAMm < teto);
          const pilares = pegadasDePilares(m, L0);
          // No sobrado, só dentro do trecho de parede que tem parede em cima (a prumada do eletroduto sobe ali).
          const emComum = niveis.length > 1 ? paredesEmComum(m.walls.filter((w) => w.levelId === L0), niveis.slice(1).map((L) => m.walls.filter((w) => w.levelId === L))) : null;
          const livre = (p: Point) =>
            (!emComum || !!encaixarNaParede(p, emComum, 5)) &&
            noForro.every((t) => dSeg(p, t.a, t.b) > SUBIDA_DO_QUADRO_MM + envelopeDoTrecho(t).raioPlantaMm + 20) &&
            !pilares.some((g) => pointInPolygon(g as Point[], p)) &&
            !(parede && m.openings.some((o) => {
              if (o.wallId !== parede.id) return false;
              const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y);
              const t = ((p.x - parede.a.x) * (parede.b.x - parede.a.x) + (p.y - parede.a.y) * (parede.b.y - parede.a.y)) / (L || 1);
              return t > o.offsetMm - 300 && t < o.offsetMm + o.widthMm + 300;
            }));
          if (parede && !livre(c.posicaoSugerida)) {
            const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y) || 1;
            const u = { x: (parede.b.x - parede.a.x) / L, y: (parede.b.y - parede.a.y) / L };
            const desvios = [100, -100, 200, -200, 300, -300, 400, -400, 500, -500, 600, -600, 700, -700, 800, -800];
            const novo = desvios.map((d) => point(Math.round(c.posicaoSugerida.x + u.x * d), Math.round(c.posicaoSugerida.y + u.y * d))).find(livre);
            // F18: sem posição que atenda tudo, ao menos FORA do pilar e do vão (com parede em cima no sobrado), até 1,50 m —
            // o quadro do sobrado ficava dentro do pilar, e a prumada do eletroduto subia por ele os dois pavimentos.
            // Pela mesma parede e, na esquina (a ponta dela é o pilar), pelas outras paredes até 1,50 m — o ponto livre mais perto.
            const p0 = c.posicaoSugerida;
            const candidatas = (emComum ?? m.walls.filter((w) => w.levelId === L0)).flatMap((w) => {
              const Lw = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
              const uw = { x: (w.b.x - w.a.x) / Lw, y: (w.b.y - w.a.y) / Lw };
              const t0 = (p0.x - w.a.x) * uw.x + (p0.y - w.a.y) * uw.y;
              const pts: Point[] = [];
              for (let t = Math.max(0, Math.round((t0 - 1500) / 50) * 50); t <= Math.min(Lw, t0 + 1500); t += 50) pts.push(point(Math.round(w.a.x + uw.x * t), Math.round(w.a.y + uw.y * t)));
              return pts;
            });
            const livreNaSuaParede = (q: Point) => {
              const pw = encaixarNaParede(q, m.walls.filter((w) => w.levelId === L0), 5)?.parede;
              return !!pw && !pilares.some((g) => pointInPolygon(g as Point[], q)) && (!emComum || !!encaixarNaParede(q, emComum, 5)) && !m.openings.some((o) => {
                if (o.wallId !== pw.id) return false;
                const Lp = Math.hypot(pw.b.x - pw.a.x, pw.b.y - pw.a.y) || 1;
                const t = ((q.x - pw.a.x) * (pw.b.x - pw.a.x) + (q.y - pw.a.y) * (pw.b.y - pw.a.y)) / Lp;
                return t > o.offsetMm - 300 && t < o.offsetMm + o.widthMm + 300;
              });
            };
            const reserva = novo ?? candidatas.filter((q) => Math.hypot(q.x - p0.x, q.y - p0.y) <= 1500 && livreNaSuaParede(q)).sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y))[0];
            if (reserva) c.posicaoSugerida = reserva;
          }
        }
        const antes = new Set((m.quadros ?? []).map((q) => q.id));
        let n = aplicar(comandosParaOCentro(m, c));
        const quadro = (m.quadros ?? []).find((q) => !antes.has(q.id)) ?? (m.quadros ?? []).find((q) => q.id === c.quadroId) ?? null;
        quadroId = quadro?.id ?? null;
        eletrica.quadro = quadro?.nome ?? null;
        let nota = quadro ? `${quadro.nome} no centro de cargas` : 'sem quadro';
        if (quadro && hip.eletrica.medidor) {
          // F26: o medidor fica no muro, fora do vão dos portões.
          const frente = pontoNaFrente(m, quadro.at, { foraDosPortoes: true });
          if (frente) {
            const infra = (tipoEletrico: 'ENTRADA_SERVICO' | 'MEDIDOR'): Command => ({
              type: 'AddTerminal', levelId: niveis[0], disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO[tipoEletrico], at: { ...frente.ponto },
              cotaMm: COTA_USUAL_DO_PONTO_ELETRICO[tipoEletrico], tipoEletrico, quadroId: quadro.id, sugerida: true,
            } as Command);
            n += aplicar([infra('ENTRADA_SERVICO'), infra('MEDIDOR')]);
            eletrica.medidor = true;
            nota += '; entrada de serviço e medidor na frente do lote';
            pendencias.push({ grupo: 'CONFERIR', texto: 'Entrada de energia: medidor posto na frente do lote, junto da divisa — confira o padrão de entrada da concessionária.' });
          } else {
            pendencias.push({ grupo: 'PREMISSA', texto: 'Entrada de energia: sem a frente do lote para o medidor.' });
          }
        }
        etapa('QUADRO', ROTULO_DA_ETAPA_DA_CASA.QUADRO, 'LANCOU', n, nota);
      });
      tentarEletrica('CIRCUITOS', () => {
        if (!quadroId) {
          etapa('CIRCUITOS', ROTULO_DA_ETAPA_DA_CASA.CIRCUITOS, 'NAO_RODOU', 0, 'sem quadro');
          return;
        }
        // Um quadro para a casa: os circuitos de cada pavimento saem dele (no sobrado, os de cima sobem por prumada).
        let n = 0;
        let circuitos = 0;
        let motivo: string | null = null;
        const porPavimento: string[] = [];
        for (const L of niveis) {
          const plano = planejarCircuitos(m, L, quadroId, hipCircuitos, hipEletricas);
          for (const f of plano.foraDoPlano) pendencias.push({ grupo: 'CONFERIR', texto: `Circuitos: ponto ${f.terminalId} fora do plano — ${f.motivo}` });
          circuitos += plano.circuitos.length;
          n += aplicar(plano.comandos);
          motivo ??= plano.comandos.length ? null : plano.motivo;
          if (niveis.length > 1) porPavimento.push(`${plano.circuitos.length} ${L === niveis[0] ? 'no térreo' : niveis.length > 2 ? `no ${niveis.indexOf(L)}º` : 'no superior'}`);
        }
        eletrica.circuitos = circuitos;
        etapa('CIRCUITOS', ROTULO_DA_ETAPA_DA_CASA.CIRCUITOS, n ? 'LANCOU' : 'NADA_A_FAZER', n, n ? `${circuitos} circuito(s)${porPavimento.length ? ` (${porPavimento.join(', ')})` : ''}` : motivo);
      });
      tentarEletrica('CLIMATIZACAO', () => {
        if (!hip.climatizacao.lancar) {
          etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
          return;
        }
        const modelos = entrada.modelosDeClimatizacao ?? [];
        if (modelos.length === 0) {
          const motivo = 'sem catálogo de evaporadoras — cadastre os modelos (Catálogo de tipos) para escolher os splits';
          etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, 'NAO_RODOU', 0, motivo);
          pendencias.push({ grupo: 'PREMISSA', texto: `Climatização: ${motivo}` });
          return;
        }
        // F14d (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): o split na parede externa, mesmo sobre a
        // janela (o topo da evaporadora abaixo do forro), e a linha e o dreno saindo juntos pela parede atrás dela.
        const tetoDoAr = Math.min(...niveis.map((L) => m.levels.find((l) => l.id === L)?.defaultHeightMm ?? 2800));
        const topoDaEvaporadora = forroLigado ? tetoDoAr - rebaixoDoForro - hip.climatizacao.folgaDaEvaporadoraAoForroMm : tetoDoAr - hip.climatizacao.folgaDaEvaporadoraAoForroMm - 200;
        const plano = gerarClimatizacao(m, entrada.climatizacao ?? HIPOTESES_CLIMATIZACAO_PADRAO, {
          modelos,
          circuitos: { hip: hipCircuitos, eletricas: hipEletricas },
          linhaNoForro: forroLigado ? { faixa: hip.forro.frigorigena, folgaSobAVigaMm: hip.forro.folgaSobAVigaMm } : null,
          splitNaParedeExterna: hip.climatizacao.naParedeExterna ? { topoMaximoMm: topoDaEvaporadora } : null,
          // F19: com o forro (decisão "manter 2,80 m, furar vigas"), a travessia de viga é furo previsto, como nas outras redes.
          travessiaDeVigaEhFuro: forroLigado,
          ...(entrada.cargaDaClimatizacao ? { carga: entrada.cargaDaClimatizacao } : {}),
        });
        for (const e of plano.etapas) climatizacao.etapas[e.id] = e.situacao;
        // O "conflito" de 0 mm é ENCOSTO (redes paralelas lado a lado — a linha com o dreno do mesmo split, o ramal ao
        // lado do eletroduto): nenhum eixo dentro. Um a um, eram ~90 linhas que escondiam o resto; vira uma, com a conta.
        const encostos = plano.pendencias.filter((x) => x.grupo === 'CONFLITO' && /\(0 mm dentro\)/.test(x.texto)).length;
        for (const x of plano.pendencias) if (!(x.grupo === 'CONFLITO' && /\(0 mm dentro\)/.test(x.texto))) pendencias.push({ ...x, texto: `Climatização: ${x.texto}` });
        if (encostos) pendencias.push({ grupo: 'CONFERIR', texto: `Climatização: ${encostos} encosto(s) entre redes (lado a lado, nenhum eixo dentro) — o afastamento entre redes não é tratado` });
        const n = aplicar(plano.comandos);
        climatizacao.equipamentos = plano.comandos.filter((c) => c.type === 'AddTerminal' && (c as { tipoEletrico?: string | null }).tipoEletrico === 'AR_CONDICIONADO').length;
        const lancou = plano.etapas.filter((e) => e.situacao === 'LANCOU').map((e) => e.rotulo.toLowerCase());
        const travou = plano.etapas.find((e) => e.situacao === 'NAO_RODOU');
        etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, n > 0 ? 'LANCOU' : 'NAO_RODOU', n, n > 0 ? `${climatizacao.equipamentos} split(s); lançou: ${lancou.join(', ')}` : (travou?.nota ?? 'nada a climatizar'));
        if (n > 0) verificarRedes(ROTULO_DA_DISCIPLINA_DO_AR, climatizacao.verificacao);
      });
      tentarEletrica('DR_DPS', () => {
        if (!quadroId) {
          etapa('DR_DPS', ROTULO_DA_ETAPA_DA_CASA.DR_DPS, 'NAO_RODOU', 0, 'sem quadro');
          return;
        }
        const drs = comandosDasSugestoesDeDR(sugerirDRs(m, quadroId, hipEletricas));
        const quadro = (m.quadros ?? []).find((q) => q.id === quadroId);
        const dps: Command[] = quadro && !quadro.dps ? [{ type: 'SetQuadroProps', quadroId, dps: sugerirDPS(hipEletricas) } as Command] : [];
        // A LIGAÇÃO pela demanda (com os circuitos prontos): a menor categoria do padrão de entrada que comporta a
        // demanda — no empate, a de menos fases. O quadro nasce sem ligação (vale FN), e a casa com chuveiro, forno e
        // ar passa dos 10 kVA de uma monofásica.
        const nFases = { FN: 1, FF: 2, FFF: 3 } as Record<string, number>;
        const entradaAgora = entradaDoQuadro(m, quadroId, hipEletricas);
        const categoria = entradaAgora
          ? [...padraoDeEntrada(hipEletricas.padraoDeEntrada).categorias].sort((a, b) => a.demandaMaxKva - b.demandaMaxKva || (nFases[a.ligacao] ?? 9) - (nFases[b.ligacao] ?? 9)).find((c) => c.demandaMaxKva >= entradaAgora.demandaKva) ?? null
          : null;
        const ligacao: Command[] = categoria && entradaAgora && categoria.ligacao !== entradaAgora.ligacao ? [{ type: 'SetQuadroProps', quadroId, ligacao: categoria.ligacao } as Command] : [];
        eletrica.drs = drs.length;
        eletrica.dps = dps.length > 0 || !!quadro?.dps;
        eletrica.entrada = categoria && entradaAgora ? { categoria: categoria.id, ligacao: categoria.ligacao, demandaKva: Math.round(entradaAgora.demandaKva * 10) / 10 } : null;
        if (entradaAgora && !categoria) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Entrada de energia: demanda ${entradaAgora.demandaKva.toFixed(1)} kVA acima da maior categoria do padrão — trate com a concessionária` });
        const notaDaEntrada = eletrica.entrada ? `; entrada ${eletrica.entrada.categoria} (${eletrica.entrada.ligacao}, ${eletrica.entrada.demandaKva.toLocaleString('pt-BR')} kVA)` : '';
        etapa('DR_DPS', ROTULO_DA_ETAPA_DA_CASA.DR_DPS, 'LANCOU', aplicar([...drs, ...dps, ...ligacao]), `${drs.length} DR(s) de 30 mA${dps.length ? '; DPS no quadro' : ''}${notaDaEntrada}`);
      });
      tentarEletrica('ELETRODUTOS', () => {
        // F14b: no forro, na faixa do eletroduto, pelos anéis dos cômodos.
        const hipEletrodutos = forroLigado ? { ...HIPOTESES_ELETRODUTO_PADRAO, noForro: { faixa: hip.forro.eletrica, folgaSobAVigaMm: hip.forro.folgaSobAVigaMm } } : HIPOTESES_ELETRODUTO_PADRAO;
        const planos = planejarEletrodutosDoModelo(m, hipEletrodutos, hipEletricas);
        const lote = planos.flatMap((p) => p.comandos);
        for (const a of new Set(planos.flatMap((p) => p.avisos))) pendencias.push({ grupo: 'CONFERIR', texto: `Eletrodutos: ${a}` });
        eletrica.eletrodutos = lote.filter((c) => c.type === 'AddTrecho').length;
        const motivo = planos.find((p) => p.motivo)?.motivo ?? null;
        let n = aplicar(lote);
        // O diâmetro pela fiação DERIVADA (a régua da conferência 6.2.11.1.6), não pela base por ligação.
        const bitolas = comandosDeBitolaPelaOcupacao(m, hipEletricas);
        n += aplicar(bitolas);
        etapa('ELETRODUTOS', ROTULO_DA_ETAPA_DA_CASA.ELETRODUTOS, lote.length ? 'LANCOU' : 'NAO_RODOU', n, lote.length ? `${eletrica.eletrodutos} trecho(s)${bitolas.length ? `; ${bitolas.length} com o diâmetro aumentado pela ocupação` : ''}` : (motivo ?? 'nada a ligar'));
      });

      eletrica.circuitos = (m.circuitos ?? []).filter((c) => c.quadroId === quadroId).length;
      // A CONFERÊNCIA NBR 5410 do app sobre o resultado, por regra.
      for (const r of niveis.flatMap((L) => conferirNbr5410(m, L, hipEletricas).regras)) {
        const faltas = r.achados.filter((a) => a.nivel === 'FALTA').length;
        const avisosR = r.achados.filter((a) => a.nivel === 'AVISO').length;
        if (!faltas && !avisosR) continue;
        eletrica.conferencia.porRegra[r.codigo] = { faltas, avisos: avisosR };
        eletrica.conferencia.faltas += faltas;
        eletrica.conferencia.avisos += avisosR;
        if (faltas) pendencias.push({ grupo: 'VERIFICACAO', texto: `Elétrica (${r.codigo} — ${r.titulo}): ${faltas} falta(s) — ${r.achados.find((a) => a.nivel === 'FALTA')!.mensagem}` });
        if (avisosR) pendencias.push({ grupo: 'CONFERIR', texto: `Elétrica (${r.codigo} — ${r.titulo}): ${avisosR} aviso(s) — ${r.achados.find((a) => a.nivel === 'AVISO')!.mensagem}` });
      }
    }

    // ── FORRO (F14b) ───────────────────────────────────────────────────────────
    // O forro de cada cômodo com nome (o vazio da escada e o shaft, não) — gesso; PVC nos molhados — ao rebaixo que
    // acomoda as faixas das redes; o pé-direito livre conferido pelo uso (permanência ou não).
    let forro: PlanoDaCasa['resumo']['forro'] = null;
    if (!forroLigado) etapa('FORRO', ROTULO_DA_ETAPA_DA_CASA.FORRO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa — as redes correm 10 cm sob a viga');
    else {
      const lote: Command[] = [];
      let menorLivre = Infinity;
      const abaixo: string[] = [];
      for (const L of niveis) {
        for (const sp of comodosComForro(m, L)) {
          const f = forroDoComodo(m, sp);
          if (!f.etiqueta) continue;
          const livre = f.faceMm - hip.forro.pisoAcabadoMm;
          menorLivre = Math.min(menorLivre, livre);
          if (livre < f.minimoMm) abaixo.push(`${sp.name} (${f2(livre / 1000)} m; mínimo ${f2(f.minimoMm / 1000)} m)`);
          lote.push({
            type: 'SetSpaceLabelProps',
            labelId: f.etiqueta.id,
            acabamentos: { ...(f.etiqueta.acabamentos ?? {}), forro: { camadas: f.preset.camadas.map((c) => ({ ...c })), rebaixoMm: rebaixoDoForro } },
          } as Command);
        }
      }
      const n = aplicar(lote);
      forro = { comodos: lote.length, rebaixoMm: rebaixoDoForro, peDireitoLivreMinimoMm: Number.isFinite(menorLivre) ? Math.round(menorLivre) : null };
      if (abaixo.length)
        pendencias.push({ grupo: 'PREMISSA', texto: `Forro: pé-direito livre abaixo do mínimo em ${abaixo.join(', ')} — as faixas das redes pedem ${f2(rebaixoDoForro / 1000)} m de plenum; aumente o pé-direito ou aperte as faixas` });
      pendencias.push({ grupo: 'CONFERIR', texto: `Forro: as redes correm no plenum (${f2(rebaixoDoForro / 1000)} m), atravessam as vigas entre os cômodos e descem aos pontos junto da viga, em caixote de gesso — os furos vão ao calculista (F14c)` });
      etapa('FORRO', ROTULO_DA_ETAPA_DA_CASA.FORRO, 'LANCOU', n, `${lote.length} cômodo(s), rebaixo de ${f2(rebaixoDoForro / 1000)} m; pé-direito livre mínimo de ${Number.isFinite(menorLivre) ? f2(menorLivre / 1000) : '—'} m`);
    }

    // ── FUROS PREVISTOS (F14c) ─────────────────────────────────────────────────
    // Toda passagem de rede por viga, baldrame e laje, com a avaliação dos critérios na viga — a lista para o calculista
    // (decisão do usuário: "manter 2,80 m, furar vigas"). Sai do modelo como ele ficou, com todas as redes.
    const listaDeFuros = furosPrevistos(m);
    const naViga = listaDeFuros.filter((f) => f.tipoDaPeca === 'VIGA');
    const furos: PlanoDaCasa['resumo']['furos'] = {
      emViga: naViga.length,
      dispensa: naViga.filter((f) => f.dispensa).length,
      verificar: naViga.filter((f) => f.dispensa === false).length,
      emBaldrame: listaDeFuros.filter((f) => f.tipoDaPeca === 'VIGA_FUNDACAO').length,
      emLaje: listaDeFuros.filter((f) => f.tipoDaPeca === 'LAJE').length,
      lista: listaDeFuros,
    };
    if (listaDeFuros.length)
      pendencias.push({
        grupo: 'CONFERIR',
        texto: `Furos previstos para o calculista: ${furos.emViga} em viga (${furos.dispensa} dispensam a verificação pelos critérios da NBR 6118, 13.2.5.1; ${furos.verificar} a verificar), ${furos.emBaldrame} em baldrame e ${furos.emLaje} passagem(ns) em laje — a lista está na tela da casa.`,
      });

    // As redes × PORTAS e JANELAS: o tubo que corre na cota do topo da janela (2,20 m — a mesma dos ramais, do
    // eletroduto e da linha abaixo da viga) ou que sai da parede para fora no vão dela. Fica à vista, por rede.
    const redesEmAberturas: Record<string, number> = {};
    {
      const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
      for (const c of conflitosDoModelo(m)) {
        if (c.classe !== 'ABERTURA' || c.comprimentoDentroMm <= 0) continue;
        const d = porId.get(c.trechoId)?.disciplina;
        if (d) redesEmAberturas[d] = (redesEmAberturas[d] ?? 0) + 1;
      }
      const nome: Record<string, string> = { ...ROTULO_DA_DISCIPLINA_DA_REDE, ...ROTULO_DA_DISCIPLINA_DO_AR, ELETRICA: 'eletroduto' };
      for (const [d, n] of Object.entries(redesEmAberturas)) pendencias.push({ grupo: 'VERIFICACAO', texto: `Rede de ${nome[d] ?? d.toLowerCase()}: ${n} trecho(s) passando por porta ou janela` });
      // F27 da casa automática (18/10/2026): os ENCONTROS de uma rede com outra, e o tubo que atravessa pilar, também
      // ficam à vista — por par de redes. Até aqui só a sonda os contava: a tela não dizia, e o Automático, que pesa as
      // pendências, escolhia o sobrado com o esgoto suspenso cruzando os eletrodutos do forro do térreo contra uma térrea
      // sem encontro nenhum.
      const est = new Map((m.structures ?? []).map((x) => [x.id, x]));
      const pares: Record<string, number> = {};
      let emPilar = 0;
      for (const c of conflitosDoModelo(m)) {
        const t = porId.get(c.trechoId);
        if (!t) continue;
        if (c.classe === 'REDE') {
          const o = porId.get(c.outroId);
          if (!o) continue;
          const chave = [nome[t.disciplina] ?? t.disciplina.toLowerCase(), nome[o.disciplina] ?? o.disciplina.toLowerCase()].sort().join(' × ');
          pares[chave] = (pares[chave] ?? 0) + 1;
        } else if (c.classe === 'ESTRUTURA' && est.get(c.outroId)?.kind === 'PILAR' && c.comprimentoDentroMm > 0) emPilar++;
      }
      for (const [par, n] of Object.entries(pares)) pendencias.push({ grupo: 'CONFLITO', texto: `Redes: ${n} encontro(s) de ${par}` });
      if (emPilar) pendencias.push({ grupo: 'CONFLITO', texto: `Redes: ${emPilar} trecho(s) atravessando pilar` });
    }
    return { ancoras, mobiliario, hidraulica, eletrica, climatizacao, redesEmAberturas, forro, furos };
  };

  // ── SOBRADO (F12a) ────────────────────────────────────────────────────────
  // Os dois pavimentos no MESMO retângulo, gerados cada um com a sua parte do programa; o núcleo da escada
  // recortado depois na ponta do corredor de cima (ver `blueprintSobrado.ts`). A estrutura e as instalações dos
  // dois pavimentos ainda não rodam aqui: as etapas dizem isso, e o plano fecha na conferência.
  if (divididos) {
    const t = gerarTodas(divididos.terreo);
    const sup = gerarTodas(divididos.superior);
    // A escada chega no corredor de cima: só servem as alternativas do superior que têm corredor.
    const comCorredor = sup.resultados.filter((x) => x.ambientes.some((a) => a.item.uso === 'CIRCULACAO'));
    const semPlanta = !t.resultados.length
      ? `o gerador não fechou o térreo (${t.falhas.join('; ') || 'sem alternativa'})`
      : !comCorredor.length
        ? `nenhuma alternativa do pavimento superior saiu com corredor para a escada chegar (${sup.resultados.length} tentada(s)${sup.falhas.length ? `; ${sup.falhas.join('; ')}` : ''})`
        : null;
    let et = t.resultados.length ? escolherSemente(t.resultados) : null;
    let es = comCorredor.length ? escolherSemente(comCorredor) : null;
    let corredor = es?.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? null;
    // F27-D4: em 3 pavimentos, como no sobrado — o 2º se alinha ao patamar nos dois sentidos da escada (o núcleo pode sobrar
    // fora dele). A preferência pelos fundos da D2 fazia o núcleo comer o banheiro do 1º (10 × 30: 3,38 m², a caixa
    // sifonada dentro da escada).
    const nucleo = et && es ? escolherNucleo(rl, corredor, et.r.ambientes, es.r.ambientes, hip.sobrado) : null;
    // F27 item 5 (decisão do usuário, 19/10/2026: "mover o lavabo"): o núcleo que espreme o lavabo do térreo — o térreo é
    // gerado de novo, na mesma semente, com o lavabo na outra ponta do par (`lavaboForaDoNucleo`).
    if (et && nucleo) {
      const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
      const mover = (amb: AmbienteGerado[]) => lavaboForaDoNucleo(amb, nucleo, hip.sobrado, malha);
      if (mover(et.r.ambientes.map((a) => ({ ...a, ret: { ...a.ret } })))) {
        try {
          const novo = gerar({ ...entradaDoGerador, programa: divididos.terreo, rearranjar: mover, motivoDoRearranjo: 'o lavabo na outra ponta, fora do núcleo da escada' }, et.r.semente, hipGerador);
          if (novo.decisoes.some((d) => d.startsWith('Arranjo ajustado'))) {
            et = { r: novo, texto: et.texto };
            decisoes.push('Térreo: o núcleo da escada espremia o lavabo — o lavabo foi para a outra ponta do par, fora do núcleo.');
          }
        } catch {
          // O gerador não fechou com o lavabo movido: fica o arranjo de antes.
        }
      }
    }
    // F27 item 5.3 (decisão do usuário, 19/10/2026: "recuar o 1º também"): na casa de 3, o 1º num retângulo com a área do
    // programa dele — a mesma regra do 2º (nos fundos, encostado na fachada do núcleo, alinhado ao patamar); o excedente do
    // térreo vira o terraço do 1º. Herdando a pegada inteira do térreo, os dormitórios do 1º chegavam a 53 m².
    let retDoPrimeiro: Retangulo | null = null;
    // O 1º na pegada do térreo — volta a ser ele se o 2º não fechar dentro do 1º recuado.
    const primeiroNaPegada = { es, corredor };
    let decisaoDoPrimeiro: string | null = null;
    /** Os 1º recuados que fecharam (largura toda, proporção) — fica o primeiro em que o 2º também fecha. */
    const primeirosRecuados: { es: NonNullable<typeof es>; corredor: Retangulo | null; ret: Retangulo; decisao: string }[] = [];
    if (divididos.segundo && nucleo && es && !semPlanta) {
      const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
      // A área do maior programa entre o 1º e o 2º — o 2º recua DENTRO do 1º (com 2 dormitórios, o 1º leva um dormitório e
      // o banho, e o 2º, a suíte: menor que o 2º, o 1º não o continha).
      const programaM2 = Math.max(resumoDoPrograma(divididos.superior).areaIdealComCirculacaoM2, resumoDoPrograma(divididos.segundo).areaIdealComCirculacaoM2);
      const areaM2 = (programaM2 + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6) * (hipImplantacao.fatorDoRetanguloSobreUtil ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.fatorDoRetanguloSobreUtil);
      const anelDoRet = (r: Retangulo) => [point(r.x0, r.y0), point(r.x1, r.y0), point(r.x1, r.y1), point(r.x0, r.y1)];
      // Primeiro só em profundidade (as fachadas laterais sobre as do térreo), depois pela proporção, como o 2º.
      const modos = (hip.sobrado.primeiroRecuaSoNaProfundidade ?? true) ? [true, false] : [false];
      for (const larguraToda of modos) {
        const proposto = retanguloDoSegundo(rl, nucleo, areaM2, hipImplantacao.proporcaoFrenteFundo ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.proporcaoFrenteFundo, hip.sobrado, malha, larguraToda);
        if ((proposto.x1 - proposto.x0) * (proposto.y1 - proposto.y0) >= (rl.x1 - rl.x0) * (rl.y1 - rl.y0)) continue;
        const alinhados = (hip.sementes.length ? hip.sementes : [1]).flatMap((semente) => {
          const a = alinharSegundoAoPatamar(
            (r, invertida) => {
              try {
                const x = gerar({ ...entradaDoGerador, programa: divididos.superior, envelope: anelDoRet(r), direcaoDaFrente: invertida ? point(0, 1) : null }, semente, hipGerador);
                return x.ambientes.some((amb) => amb.item.uso === 'CIRCULACAO') ? x : null;
              } catch {
                return null;
              }
            },
            rl,
            proposto,
            nucleo,
            hip.sobrado,
            malha,
            // 5.3b: o 1º cresce para a frente a cada volta e o corredor se aproxima do patamar devagar (10 × 30, 4 dorm.:
            // 15,7 → 15,1 m em 4 voltas, com o patamar em 14,9) — mais voltas que o 2º.
            VOLTAS_DO_PRIMEIRO_RECUADO,
            nucleo.paraOsFundos ? [false, true] : [true, false],
          );
          return a ? [a] : [];
        });
        if (!alinhados.length) continue;
        const e1 = escolherSemente(alinhados.map((a) => a.r));
        const escolhido = alinhados.find((a) => a.r === e1.r)!;
        const ret = escolhido.ret;
        primeirosRecuados.push({
          es: e1,
          ret,
          corredor: e1.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? corredor,
          decisao: `3 pavimentos: o 1º recuado em ${f2((ret.x1 - ret.x0) / 1000)} × ${f2((ret.y1 - ret.y0) / 1000)} m (a área do programa dele${larguraToda ? ', na largura toda do térreo' : ''}) — o excedente do térreo é o terraço do 1º${escolhido.invertida ? '; o íntimo à frente do corredor (a planta invertida)' : ''}.`,
        });
      }
      if (!primeirosRecuados.length) decisaoDoPrimeiro = '3 pavimentos: o 1º recuado não fechou com o corredor no patamar da escada — o 1º fica com a pegada do térreo.';
    }
    if (semPlanta || !nucleo || !et || !es) {
      const texto = semPlanta ?? `não cabe o núcleo da escada (${f2(hip.sobrado.nucleoLarguraMm / 1000)} × ${f2(hip.sobrado.nucleoProfundidadeMm / 1000)} m) na ponta do corredor de cima`;
      etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
      return vazio(texto, implantacao);
    }
    // F27-D2 (decisão do usuário, 18/10/2026: "recuado com terraço"): o 2º pavimento num retângulo menor, nos fundos e
    // do lado do núcleo (o terraço na frente, sobre a laje do 1º), com o corredor no patamar da escada.
    let eg: { r: ResultadoDoGerador; texto: string } | null = null;
    let retDoSegundo: Retangulo | null = null;
    if (divididos.segundo) {
      const seg = divididos.segundo;
      const malha = hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm;
      const areaM2 = (resumoDoPrograma(seg).areaIdealComCirculacaoM2 + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6) * (hipImplantacao.fatorDoRetanguloSobreUtil ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.fatorDoRetanguloSobreUtil);
      // F27 item 5.3: o 2º recua dentro do 1º (recuado ou não).
      const anel = (r: Retangulo) => [point(r.x0, r.y0), point(r.x1, r.y0), point(r.x1, r.y1), point(r.x0, r.y1)];
      const alinharDentroDe = (casaDoSegundo: Retangulo) => {
        const inicial = retanguloDoSegundo(casaDoSegundo, nucleo, areaM2, hipImplantacao.proporcaoFrenteFundo ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.proporcaoFrenteFundo, hip.sobrado, malha);
        return (hip.sementes.length ? hip.sementes : [1]).flatMap((semente) => {
          const a = alinharSegundoAoPatamar(
            (r, invertida) => {
              try {
                return gerar({ ...entradaDoGerador, programa: seg, envelope: anel(r), direcaoDaFrente: invertida ? point(0, 1) : null, rearranjar: (amb) => banheiroAlemDoNucleo(amb, nucleo) }, semente, hipGerador);
              } catch {
                return null;
              }
            },
            casaDoSegundo,
            inicial,
            nucleo,
            hip.sobrado,
            malha,
            // 5.3b: dentro do 1º recuado, as mesmas voltas dele.
            casaDoSegundo === rl ? 4 : VOLTAS_DO_PRIMEIRO_RECUADO,
            // F27-D4: a suíte do lado para onde o núcleo avança (o banheiro vai além da ponta dele): de frente quando a escada
            // sobe para os fundos, invertida quando sobe para a frente; o outro sentido só se este não fechar.
            nucleo.paraOsFundos ? [false, true] : [true, false],
          );
          return a ? [a] : [];
        });
      };
      // F27 item 5.3: o primeiro 1º recuado em que o 2º fecha; nenhum — o 1º com a pegada do térreo.
      let alinhados: ReturnType<typeof alinharDentroDe> = [];
      // 5.3b: de todos os 1º recuados em que o 2º fecha, o de menos problemas graves no 1º e no 2º juntos, e entre esses o
      // de MENOR área (o objetivo é o 1º do tamanho do programa). O primeiro que fechava podia ser o maior (12 × 30: os
      // dormitórios de 31 m² em vez de 19) ou deixar o 2º com um cômodo abaixo da largura mínima (R1-A: o escritório de
      // 1,70 m).
      const area = (r: Retangulo) => (r.x1 - r.x0) * (r.y1 - r.y0);
      let melhor: { c: (typeof primeirosRecuados)[number]; alinhados: ReturnType<typeof alinharDentroDe>; graves: number } | null = null;
      for (const c of primeirosRecuados) {
        const al = alinharDentroDe(c.ret);
        if (!al.length) continue;
        // E os cômodos abaixo da largura mínima do uso deles (o gerador não os conta como graves).
        const estreitos = (x: ResultadoDoGerador) => x.ambientes.filter((amb) => amb.item.uso !== 'CIRCULACAO' && Math.min(amb.ret.x1 - amb.ret.x0, amb.ret.y1 - amb.ret.y0) < amb.item.larguraMinMm).length;
        const doSegundo = escolherSemente(al.map((x) => x.r)).r;
        const graves = problemasGraves(c.es.r) + problemasGraves(doSegundo) + estreitos(c.es.r) + estreitos(doSegundo);
        if (!melhor || graves < melhor.graves || (graves === melhor.graves && area(c.ret) < area(melhor.c.ret))) melhor = { c, alinhados: al, graves };
      }
      if (melhor) {
        alinhados = melhor.alinhados;
        ({ es, corredor } = melhor.c);
        retDoPrimeiro = melhor.c.ret;
        decisaoDoPrimeiro = melhor.c.decisao;
      }
      if (!alinhados.length) {
        ({ es, corredor } = primeiroNaPegada);
        retDoPrimeiro = null;
        if (primeirosRecuados.length) decisaoDoPrimeiro = '3 pavimentos: o 2º não fechou dentro do 1º recuado (o corredor no patamar da escada) — o 1º fica com a pegada do térreo.';
        alinhados = alinharDentroDe(rl);
      }
      if (!alinhados.length) {
        const texto = 'o 2º pavimento não fechou com o corredor no patamar da escada (nenhuma alternativa do gerador) — gere o sobrado';
        etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
        return vazio(texto, implantacao);
      }
      eg = escolherSemente(alinhados.map((a) => a.r));
      const escolhido = alinhados.find((a) => a.r === eg!.r)!;
      retDoSegundo = escolhido.ret;
      if (escolhido.invertida) decisoes.push(`2º pavimento: o íntimo à frente do corredor (a planta invertida) — ${nucleo.paraOsFundos ? 'atrás do patamar da escada não cabia' : 'do lado para onde a escada avança, com o banheiro além da ponta do núcleo'}.`);
    }
    if (decisaoDoPrimeiro) decisoes.push(decisaoDoPrimeiro);
    if (!es) return vazio('sem o 1º pavimento', implantacao);
    const pavimentosGerados: [string, ResultadoDoGerador][] = [['Térreo', et.r], [eg ? '1º pavimento' : 'Superior', es.r], ...(eg ? [['2º pavimento', eg.r] as [string, ResultadoDoGerador]] : [])];
    for (const [pav, x] of pavimentosGerados) decisoes.push(...x.decisoes.map((d) => `${pav}: ${d}`));
    const T = entrada.levelId;
    // F25: a cota do térreo JÁ no platô (a terraplenagem o move antes) — do original, o superior ficava a 1,8 m dele.
    const nivel = m.levels.find((l) => l.id === T)!;
    let sobrado: ResumoDoSobrado;
    let n = 0;
    try {
      n += aplicar([{ type: 'AddLevel', name: eg ? '1º pavimento' : 'Pavimento superior', elevationMm: nivel.elevationMm + andarMm, defaultHeightMm: nivel.defaultHeightMm, uid: uidDeterministico(`casa-automatica:superior:${T}`) }]);
      const S = m.levels.find((l) => !original.levels.some((o) => o.id === l.id))!.id;
      let G: ObjectId | null = null;
      if (eg) {
        n += aplicar([{ type: 'AddLevel', name: '2º pavimento', elevationMm: nivel.elevationMm + 2 * andarMm, defaultHeightMm: nivel.defaultHeightMm, uid: uidDeterministico(`casa-automatica:segundo:${T}`) }]);
        G = m.levels.find((l) => l.id !== S && !original.levels.some((o) => o.id === l.id))!.id;
      }
      const pt = pavimentoComNucleo(comUidsDoPavimento(comandosDeAplicacao(et.r, T), 'T'), T, nucleo, et.r.ambientes, 'T', peDireitoMm, hip.sobrado);
      // O superior não tem porta para a rua: a porta de entrada que o gerador pôs na fachada sai antes.
      const psBase = pavimentoComNucleo(comUidsDoPavimento(semPortaDeEntrada(comandosDeAplicacao(es.r, S), rl), 'S'), S, nucleo, es.r.ambientes, 'S', peDireitoMm, hip.sobrado, corredor);
      // F27 item 5.3: o 1º recuado abre para o terraço dele (na planta invertida a "entrada" ficava nos fundos).
      const terracoDoPrimeiro = retDoPrimeiro ? portaParaOTerraco(psBase.comandos, rl, es.r.ambientes, hip.sobrado.alturaDaPortaMm) : null;
      const ps = terracoDoPrimeiro ? { ...psBase, comandos: terracoDoPrimeiro.comandos } : psBase;
      if (terracoDoPrimeiro?.comodo) decisoes.push(`3 pavimentos: a janela de ${terracoDoPrimeiro.comodo} para o terraço do 1º virou porta de correr (o 1º sem porta para o terraço).`);
      // F27-D2: o 2º sem as portas para FORA da casa (fundos e laterais); a do terraço (a "entrada" do gerador na frente
      // do retângulo recuado) fica. A segunda escada, empilhada no mesmo núcleo, sai do 1º.
      const corredorDoSegundo = eg?.r.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret ?? null;
      const pgBase = eg && G ? pavimentoComNucleo(comUidsDoPavimento(semPortaDeEntrada(comandosDeAplicacao(eg.r, G), retDoPrimeiro ?? rl), 'G'), G, nucleo, eg.r.ambientes, 'G', peDireitoMm, hip.sobrado, corredorDoSegundo) : null;
      // F27-D5: o 2º abre para o terraço (na planta invertida a "entrada" ficava nos fundos).
      const terraco = pgBase && eg ? portaParaOTerraco(pgBase.comandos, retDoPrimeiro ?? rl, eg.r.ambientes, hip.sobrado.alturaDaPortaMm) : null;
      const pg = pgBase && terraco ? { ...pgBase, comandos: terraco.comandos } : pgBase;
      if (terraco?.comodo) decisoes.push(`3 pavimentos: a janela de ${terraco.comodo} para o terraço virou porta de correr (o 2º sem porta para o terraço).`);
      const exata = implantacao.alinhadaAoDesenho;
      n += aplicar([
        ...comandosLocaisNoMundo(pt.comandos, q, exata),
        ...comandosLocaisNoMundo(ps.comandos, q, exata),
        ...(pg ? comandosLocaisNoMundo(pg.comandos, q, exata) : []),
        ...comandosLocaisNoMundo([comandoDaEscada(T, nucleo, hip.sobrado), ...(G ? [comandoDaEscada(S, nucleo, hip.sobrado)] : [])], q, exata),
      ]);
      const med = medirEscada(m, m.stairs[m.stairs.length - 1]);
      sobrado = {
        nivelSuperiorId: S,
        nucleo,
        escada: { degraus: med.degraus, espelhoMm: Math.round(med.espelhoMm), pisoMm: Math.round(med.pisoMm), blondelMm: Math.round(med.blondelMm) },
        portas: { terreo: pt.porta?.vizinho ?? null, superior: ps.porta?.vizinho ?? null },
        primeiro: retDoPrimeiro ? { retangulo: retDoPrimeiro, terracoM2: Math.round(((rl.x1 - rl.x0) * (rl.y1 - rl.y0) - (retDoPrimeiro.x1 - retDoPrimeiro.x0) * (retDoPrimeiro.y1 - retDoPrimeiro.y0)) / 1e4) / 100 } : null,
        segundo:
          G && pg && retDoSegundo
            ? { nivelId: G, retangulo: retDoSegundo, porta: pg.porta?.vizinho ?? null, terracoM2: Math.round((((retDoPrimeiro ?? rl).x1 - (retDoPrimeiro ?? rl).x0) * ((retDoPrimeiro ?? rl).y1 - (retDoPrimeiro ?? rl).y0) - (retDoSegundo.x1 - retDoSegundo.x0) * (retDoSegundo.y1 - retDoSegundo.y0)) / 1e4) / 100 }
            : null,
      };
      for (const a of med.avisos) pendencias.push({ grupo: 'VERIFICACAO', texto: `Escada: ${a}` });
    } catch (e) {
      const texto = `as paredes geradas não entraram no desenho: ${e instanceof Error ? e.message : String(e)}`;
      etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, texto);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto });
      return vazio(texto, implantacao);
    }
    const lado = nucleo.lado === 'DIREITA' ? 'direita' : 'esquerda';
    if (!sobrado.portas.terreo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Escada: nenhum ambiente do térreo encosta no patamar — abra a porta do núcleo à mão.' });
    if (!sobrado.portas.superior) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o patamar ${eg ? 'do 1º pavimento' : 'de cima'} não encosta no corredor — abra a porta do núcleo à mão.` });
    if (sobrado.segundo && !sobrado.segundo.porta) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Escada: o patamar do 2º pavimento não encosta no corredor — abra a porta do núcleo à mão.' });
    // O que o núcleo comeu, medido no DESENHO: abaixo do mínimo do programa é sem solução; acima, conferir.
    for (const a of nucleo.perdidos) {
      const amb = [...et.r.ambientes, ...es.r.ambientes].find((x) => x.nome === a);
      const sp = m.spaces.find((x) => (x.levelId === T || x.levelId === sobrado.nivelSuperiorId) && x.name === a);
      const ficouM2 = sp ? Math.round(sp.areaMm2 / 1e4) / 100 : null;
      const minimoM2 = amb?.item.areaMinM2 ?? null;
      if (ficouM2 != null && minimoM2 != null && ficouM2 >= minimoM2)
        pendencias.push({ grupo: 'CONFERIR', texto: `Escada: o núcleo come boa parte de ${a} — fica com ${f2(ficouM2)} m² (mínimo do programa ${f2(minimoM2)} m²); confira o uso ou mude a escada de lugar.` });
      else pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o núcleo deixa ${a} ${ficouM2 != null ? `com ${f2(ficouM2)} m²` : 'sem área'}${minimoM2 != null ? `, abaixo do mínimo de ${f2(minimoM2)} m²` : ''} — mude a escada de lugar.` });
    }
    for (const a of nucleo.partidos) pendencias.push({ grupo: 'VERIFICACAO', texto: `Escada: o núcleo parte ${a} em dois — o pedaço menor fica sem nome.` });
    // F27-D2: o 2º não entrou na escolha do núcleo — o que ele comeu lá, medido no desenho.
    if (eg && sobrado.segundo) {
      const G = sobrado.segundo.nivelId;
      for (const a of eg.r.ambientes) {
        if (a.item.uso === 'CIRCULACAO' || !(a.ret.x0 < nucleo.ret.x1 && a.ret.x1 > nucleo.ret.x0 && a.ret.y0 < nucleo.ret.y1 && a.ret.y1 > nucleo.ret.y0)) continue;
        const sp = m.spaces.find((x) => x.levelId === G && x.name === a.nome);
        const ficouM2 = sp ? Math.round(sp.areaMm2 / 1e4) / 100 : null;
        if (ficouM2 != null && ficouM2 >= a.item.areaMinM2) pendencias.push({ grupo: 'CONFERIR', texto: `Escada: o núcleo come parte de ${a.nome} no 2º pavimento — fica com ${f2(ficouM2)} m² (mínimo do programa ${f2(a.item.areaMinM2)} m²).` });
        else pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Escada: o núcleo deixa ${a.nome} no 2º pavimento ${ficouM2 != null ? `com ${f2(ficouM2)} m²` : 'sem área'}, abaixo do mínimo de ${f2(a.item.areaMinM2)} m².` });
      }
    }
    // F22: "sem porta direta" já sai na CONFERÊNCIA do programa — aqui só pesa na escolha (como na térrea).
    for (const [pav, x] of pavimentosGerados) for (const a of x.avisos) if (!/sem porta direta \(relação obrigatória\)/.test(a)) pendencias.push({ grupo: GRAVE.test(a) ? 'SEM_SOLUCAO' : 'VERIFICACAO', texto: `Arquitetura (${pav.toLowerCase()}): ${a}` });
    const paredes = m.walls.filter((w) => w.levelId === T || w.levelId === sobrado.nivelSuperiorId || w.levelId === sobrado.segundo?.nivelId).length;
    etapa(
      'ARQUITETURA',
      ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA,
      'LANCOU',
      n,
      eg && sobrado.segundo
        ? `3 pavimentos: ${paredes} paredes; térreo com ${et.r.ambientes.length}, 1º com ${es.r.ambientes.length} e 2º com ${eg.r.ambientes.length} ambientes; o 2º recuado em ${f2((sobrado.segundo.retangulo.x1 - sobrado.segundo.retangulo.x0) / 1000)} × ${f2((sobrado.segundo.retangulo.y1 - sobrado.segundo.retangulo.y0) / 1000)} m (terraço de ${f2(sobrado.segundo.terracoM2)} m²); duas escadas em U de ${sobrado.escada.degraus} degraus (${sobrado.escada.espelhoMm} × ${sobrado.escada.pisoMm} mm) empilhadas no núcleo à ${lado} — térreo: ${et.texto}; 1º: ${es.texto}; 2º: ${eg.texto}`
        : `sobrado: ${paredes} paredes; térreo com ${et.r.ambientes.length} e superior com ${es.r.ambientes.length} ambientes; escada em U de ${sobrado.escada.degraus} degraus (${sobrado.escada.espelhoMm} × ${sobrado.escada.pisoMm} mm) no núcleo à ${lado} — térreo: ${et.texto}; superior: ${es.texto}`,
    );

    // F27: as janelas de cima alinhadas com as de baixo, antes dos pilares (o intermediário do térreo sobe entre elas).
    {
      const alinhadas = alinharJanelasDoSuperior(m, T, sobrado.nivelSuperiorId);
      if (alinhadas.length) {
        aplicar(alinhadas);
        decisoes.push(`Sobrado: ${alinhadas.length} janela(s) do ${eg ? '1º pavimento' : 'superior'} alinhada(s) com as do térreo, na mesma fachada.`);
      }
      // F27-D2: par a par — as do 2º com as do 1º.
      const doSegundo = sobrado.segundo ? alinharJanelasDoSuperior(m, sobrado.nivelSuperiorId, sobrado.segundo.nivelId) : [];
      if (doSegundo.length) {
        aplicar(doSegundo);
        decisoes.push(`3 pavimentos: ${doSegundo.length} janela(s) do 2º alinhada(s) com as do 1º, na mesma fachada.`);
      }
    }
    lancarEscadaDeAcesso();
    lancarRampaDaGaragem();
    // F26: o muro logo depois da casa — antes da água e da elétrica, que põem o hidrômetro e o medidor nele.
    resumoDoMuro = lancarMuroDaCasa();

    // ── ESTRUTURA E TELHADO DO SOBRADO (F12b) ──
    // Pilares em prumada (ver `pilaresDoSobrado`); vigas e lajes em cada pavimento — a laje do térreo é o piso de
    // cima, e o furo da escada nela é derivado pelo kernel (`furosDaEscada`); fundação só no térreo; eixos do térreo;
    // telhado sobre o superior; corrimãos dos lances e guarda-corpo na borda do furo.
    const S = sobrado.nivelSuperiorId;
    // F27-D3: na casa de 3, o 2º pavimento — os pilares descem a prumada inteira, vigas e lajes por nível, a viga de
    // transição do 1º sob as paredes do 2º sem parede embaixo, o telhado sobre o 2º.
    const G = sobrado.segundo?.nivelId ?? null;
    type PlanoEstrutural = { comandos: Command[]; motivo: string | null; avisos?: string[]; foraDoPlano: { motivo: string }[] };
    const emDois = <A extends PlanoEstrutural, B extends PlanoEstrutural>(x: BlueprintModel, fa: (y: BlueprintModel) => A, fb: (y: BlueprintModel) => B) => {
      const a = fa(x);
      const b = fb(a.comandos.length ? applyBatch(x, a.comandos).model : x);
      return {
        a,
        b,
        comandos: [...a.comandos, ...b.comandos],
        motivo: a.comandos.length || b.comandos.length ? null : (a.motivo ?? b.motivo),
        avisos: [...(a.avisos ?? []).map((t) => `térreo: ${t}`), ...(b.avisos ?? []).map((t) => `superior: ${t}`)],
        foraDoPlano: [...a.foraDoPlano.map((f) => `térreo: ${f.motivo}`), ...b.foraDoPlano.map((f) => `superior: ${f.motivo}`)],
      };
    };
    // Onde a parede do superior não tem parede embaixo, a viga de transição do térreo a sustenta — e o pilar do
    // superior que cai sobre ela nasce nela.
    const transicao = trechosDeTransicao(m, T, S);
    const transicaoDeCima = G ? trechosDeTransicao(m, S, G) : [];
    let nascemEmViga = 0;
    etapaEstrutural(
      'PILARES',
      (x) => {
        const a = pilaresDoSobrado(x, T, S, hip.estrutura.pilares, transicao);
        if (!G) return { ...a, de3: null };
        const de3 = pilaresDoTerceiro(a.comandos.length ? applyBatch(x, a.comandos).model : x, T, S, G, hip.estrutura.pilares, transicao, transicaoDeCima);
        return { ...a, de3, comandos: [...a.comandos, ...de3.comandos], motivo: a.comandos.length || de3.comandos.length ? null : a.motivo, avisos: [...a.avisos, ...de3.avisos], foraDoPlano: [...a.foraDoPlano, ...de3.foraDoPlano] };
      },
      (p) => {
        const d = p.de3;
        estrutura.pilares = p.terreo + p.superior + (d ? d.segundo + d.descemAoPrimeiro + d.descemAoTerreo : 0);
        nascemEmViga = p.nascemEmViga + (d?.nascemEmViga ?? 0);
        const de2 = `${p.terreo} pilar(es) no térreo e ${p.superior} no ${d ? '1º' : 'superior'} — ${p.sobem} sobem do térreo, ${p.descem} descem do ${d ? '1º' : 'superior'}${p.nascemEmViga ? `, ${p.nascemEmViga} nascem em viga de transição` : ''}${p.semApoio ? `, ${p.semApoio} sem apoio embaixo ficaram fora` : ''}`;
        const doSegundo = d ? `; ${d.segundo} no 2º — ${d.sobem} sobem do 1º, ${d.descemAoPrimeiro} descem ao 1º e ${d.descemAoTerreo} até o térreo${d.nascemEmViga ? `, ${d.nascemEmViga} nascem em viga de transição` : ''}${d.semApoio ? `, ${d.semApoio} sem prumada até o chão ficaram fora` : ''}` : '';
        return { nota: de2 + doSegundo, foraDoPlano: p.foraDoPlano };
      },
    );
    etapaEstrutural(
      'VIGAS',
      (x) => {
        const d = emDois(x, (y) => planejarVigas(y, T, hip.estrutura.vigas), (y) => planejarVigas(y, S, hip.estrutura.vigas));
        const x1 = d.comandos.length ? applyBatch(x, d.comandos).model : x;
        const vt = vigasDeTransicao(x1, T, transicao, hip.estrutura.vigas);
        // F27-D3: as vigas do 2º e as de transição do 1º (sob as paredes do 2º sem parede do 1º embaixo).
        const x2 = vt.comandos.length ? applyBatch(x1, vt.comandos).model : x1;
        const vG = G ? planejarVigas(x2, G, hip.estrutura.vigas) : null;
        const x3 = vG?.comandos.length ? applyBatch(x2, vG.comandos).model : x2;
        const vtG = G ? vigasDeTransicao(x3, S, transicaoDeCima, hip.estrutura.vigas) : null;
        const comandos = [...d.comandos, ...vt.comandos, ...(vG?.comandos ?? []), ...(vtG?.comandos ?? [])];
        return { ...d, vt, vG, vtG, comandos, motivo: comandos.length ? null : d.motivo, foraDoPlano: [...d.foraDoPlano, ...(vG?.foraDoPlano ?? []).map((f) => `2º pavimento: ${f.motivo}`)] };
      },
      (p) => {
        estrutura.vigas = p.a.vigas.length + p.b.vigas.length + p.vt.vigas + (p.vG?.vigas.length ?? 0) + (p.vtG?.vigas ?? 0);
        if (p.vtG?.vigas)
          pendencias.push({
            grupo: 'CONFERIR',
            texto: `Estrutura: ${p.vtG.vigas} viga(s) de transição no 1º pavimento sustentam ${String(p.vtG.metros).replace('.', ',')} m de parede do 2º sem parede embaixo (maior vão ${String(Math.round(p.vtG.maiorVaoMm / 100) / 10).replace('.', ',')} m) — confira com o calculista.`,
          });
        if (p.vt.vigas)
          pendencias.push({
            grupo: 'CONFERIR',
            texto: `Estrutura: ${p.vt.vigas} viga(s) de transição no térreo sustentam ${String(p.vt.metros).replace('.', ',')} m de parede do superior sem parede embaixo (maior vão ${String(Math.round(p.vt.maiorVaoMm / 100) / 10).replace('.', ',')} m)${nascemEmViga ? ` e ${nascemEmViga} pilar(es) que nascem nelas` : ''} — confira com o calculista.`,
          });
        return {
          nota: p.vG
            ? `${p.a.vigas.length} viga(s) no térreo, ${p.vt.vigas} de transição sob paredes do 1º, ${p.b.vigas.length} no 1º, ${p.vtG?.vigas ?? 0} de transição sob paredes do 2º e ${p.vG.vigas.length} no 2º`
            : `${p.a.vigas.length} viga(s) no térreo (sob o piso de cima), ${p.vt.vigas} de transição sob paredes do superior e ${p.b.vigas.length} no superior`,
          foraDoPlano: p.foraDoPlano,
        };
      },
    );
    let guardas = 0;
    let lajesRebaixadas = 0;
    let lajesRebaixadasDoPrimeiro = 0;
    /** F14c: as áreas molhadas dos banheiros de cima, pelas peças de esgoto PREVISTAS (simulação de mobiliário, louças e kit). */
    // F27-D4: `niveis` de baixo para cima e `k` o pavimento dos banheiros (a laje rebaixada é a do pavimento de baixo
    // dele). A previsão repete a sequência das instalações: os shafts do F12c de cada pavimento de cima (o do 2º descendo
    // pelo 1º), o mobiliário de todos, e os shafts junto das peças pavimento a pavimento até o `k`.
    const zonasMolhadasDeCima = (x: BlueprintModel, niveis: ObjectId[], k: number): Point[][] => {
      const T0 = niveis[0];
      const S0 = niveis[k];
      if (!hip.mobiliario.lancar || hip.sobrado.rebaixoDaLajeDoBanheiroMm <= 0) return [];
      try {
        // F27 da casa automática (18/10/2026): primeiro os shafts do F12c, como nas instalações — sem eles a previsão
        // escolhia OUTRO shaft para o grupo (o do F12c ainda não existia), a laje descia até ele, e o passo do shaft,
        // adiante, reaproveitava o do F12c: o esgoto corria do rebaixo até lá pelo forro do térreo, cruzando os
        // eletrodutos (sobrado 10 × 30).
        const nucleoNoMundo = [
          { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y0 },
          { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y0 },
          { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y1 },
          { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y1 },
        ].map((p) => paraMundo(q, p));
        let x0 = x;
        for (let j = 1; j < niveis.length && hip.hidraulica.lancar; j++) {
          const doF12c = shaftsDoSobrado(x0, T0, niveis[j], nucleoNoMundo, hip.sobrado.shaftMm, 2500, niveis.slice(1, j));
          if (doF12c.length) x0 = applyBatch(x0, doF12c.map((sh): Command => ({ type: 'AddNucleo', levelId: T0, ateLevelId: niveis[j], tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' }))).model;
        }
        // Todos os pavimentos, como as etapas de lá: o shaft previsto não pode cair em cima de uma peça de baixo.
        const porNivel = niveis.map((L) => ({ L, lista: mobiliarNivel(x0, L, hip.mobiliario) }));
        const mob = porNivel.flatMap((p) => comandosDeMobiliario(p.lista, p.L, x0));
        const r1 = mob.length ? applyBatch(x0, mob) : null;
        const m1 = r1?.model ?? x0;
        const louc = pontosDasLoucasCriadas(m1, r1?.diff.created ?? [], hip.pontos, { sugerida: true });
        const m2 = louc.length ? applyBatch(m1, louc).model : m1;
        const kit = coletoresForaDoShaft(m2, niveis.flatMap((L) => planejarPontosDoNivel(m2, L, hip.pontos)).flatMap((pl) => pl.comandos));
        let m3 = kit.length ? applyBatch(m2, kit).model : m2;
        // Os pavimentos de baixo do `k` ganham os shafts junto das peças antes (como no passo do shaft, que anda de baixo
        // para cima): o do 2º não cai em cima de um do 1º.
        for (let j = 1; j < k; j++) {
          const Lj = niveis[j];
          const pj = (m3.terminais ?? []).filter((t) => t.levelId === Lj && t.disciplina === 'ESGOTO');
          const esc = m3.spaces.find((sp) => sp.levelId === Lj && /escada/i.test(sp.name ?? ''))?.ring ?? null;
          for (const g of gruposDoTuboDeQueda(m3, Lj, pj, hip.sobrado.grupoDoTuboDeQuedaMm)) {
            const ban = m3.spaces.find((sp) => sp.levelId === Lj && g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
            if (!ban) continue;
            const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
            const sh = shaftDoGrupo(m3, T0, Lj, ban.ring, alvo, esc, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, niveis.slice(1, j));
            if (sh?.novo) m3 = applyBatch(m3, [{ type: 'AddNucleo', levelId: T0, ateLevelId: Lj, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]).model;
          }
        }
        const pecas = (m3.terminais ?? []).filter((t) => t.levelId === S0 && t.disciplina === 'ESGOTO');
        const grupos = gruposDoTuboDeQueda(m3, S0, pecas, hip.sobrado.grupoDoTuboDeQuedaMm);
        const zonas: Point[][] = [];
        const escada = m3.spaces.find((sp) => sp.levelId === S0 && /escada/i.test(sp.name ?? ''))?.ring ?? null;
        const banheiros = m3.spaces.filter((sp) => sp.levelId === S0 && ['BANHEIRO', 'LAVABO'].includes(usoDoNome(sp.name) ?? ''));
        // O shaft onde o tubo de queda de cada grupo vai descer — a mesma decisão do passo do shaft, adiante (e o shaft
        // novo entra no modelo, como lá, para o grupo seguinte não cair em cima dele).
        let m4 = m3;
        const shaftDo = new Map<(typeof grupos)[number], Point[]>();
        for (const g of grupos) {
          const ban = banheiros.find((sp) => g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
          if (!ban) continue;
          const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
          const sh = shaftDoGrupo(m4, T0, S0, ban.ring, alvo, escada, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, niveis.slice(1, k));
          if (!sh) continue;
          shaftDo.set(g, sh.ring);
          if (sh.novo) m4 = applyBatch(m4, [{ type: 'AddNucleo', levelId: T0, ateLevelId: S0, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]).model;
        }
        // Uma zona por GRUPO e por banheiro que ele toca: as peças do grupo nele e o caminho delas até o shaft (a reta de
        // cada peça ao centro dele), até a face do shaft. Por grupo: no banheiro comprido da suíte, a caixa sifonada de
        // uma ponta e o vaso da outra cercavam o shaft e o rebaixo o engolia (a água de baixo não chegava às colunas). Por
        // banheiro: o grupo pode juntar peças de dois vizinhos (a 30°, a caixa sifonada do social desce no shaft da
        // suíte) — cada um ganha o pedaço dele.
        for (const g of grupos) {
          const sh = shaftDo.get(g) ?? null;
          const centro = sh ? { x: sh.reduce((a, p) => a + p.x, 0) / sh.length, y: sh.reduce((a, p) => a + p.y, 0) / sh.length } : null;
          for (const ban of banheiros) {
            const doBanheiro = g.filter((t) => pointInPolygon(ban.ring, t.at)).map((t) => t.at);
            const caminho: Point[] = [];
            if (centro) {
              for (const t of g) {
                const L = Math.hypot(centro.x - t.at.x, centro.y - t.at.y);
                for (let d = 0; d <= L; d += 100) {
                  const q = { x: t.at.x + ((centro.x - t.at.x) * d) / (L || 1), y: t.at.y + ((centro.y - t.at.y) * d) / (L || 1) } as Point;
                  if (pointInPolygon(ban.ring, q) && !pointInPolygon(sh!, q)) caminho.push(q);
                }
              }
            }
            if (!doBanheiro.length && !caminho.length) continue;
            zonas.push(...zonasMolhadasDoBanheiro(ban.ring, doBanheiro, hip.sobrado.margemDoRebaixoMm, sh, caminho));
          }
        }
        if (!zonas.length) pendencias.push({ grupo: 'CONFERIR', texto: `Laje rebaixada: nenhuma área molhada prevista nos banheiros de cima (${pecas.length} peça(s) de esgoto, ${grupos.length} grupo(s)) — a laje ficou sem rebaixo.` });
        return zonas;
      } catch (e) {
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Laje rebaixada: a previsão das peças de cima falhou (${e instanceof Error ? e.message : String(e)}) — a laje ficou sem rebaixo.` });
        return [];
      }
    };
    etapaEstrutural(
      'LAJES',
      (x) => {
        const d = emDois(x, (y) => planejarLajes(y, T, hip.estrutura.lajes), (y) => planejarLajes(y, S, hip.estrutura.lajes));
        // F14c ("laje rebaixada"): a laje do térreo — o piso de cima — desce sob a ÁREA MOLHADA de cada banheiro de cima.
        // As peças ainda não existem aqui (a laje vem antes do mobiliário): são PREVISTAS rodando mobiliário, louças e kit
        // numa cópia — determinísticos, dão as posições que as etapas de lá vão lançar.
        const zonas = zonasMolhadasDeCima(x, G ? [T, S, G] : [T, S], 1);
        const comRebaixo = lajesComRebaixo(d.a.comandos, T, zonas, hip.sobrado.rebaixoDaLajeDoBanheiroMm);
        lajesRebaixadas = comRebaixo.rebaixadas;
        // F27-D3: na casa de 3, o guarda-corpo do furo só no 2º (no 1º, o lance que sobe sai da borda do furo de baixo).
        const g = [...guardaCorpoDaEscada(x, T, S, !G), ...(G ? guardaCorpoDaEscada(x, S, G) : [])];
        guardas = g.length;
        const lG = G ? planejarLajes(d.comandos.length ? applyBatch(x, d.comandos).model : x, G, hip.estrutura.lajes) : null;
        // F27-D4: na casa de 3, a laje do 1º (o piso do 2º) desce sob a área molhada de cada banheiro do 2º.
        const doPrimeiro = G ? lajesComRebaixo(d.b.comandos, S, zonasMolhadasDeCima(x, [T, S, G], 2), hip.sobrado.rebaixoDaLajeDoBanheiroMm) : null;
        lajesRebaixadasDoPrimeiro = doPrimeiro?.rebaixadas ?? 0;
        const comandos = [...comRebaixo.comandos, ...(doPrimeiro?.comandos ?? d.b.comandos), ...(lG?.comandos ?? []), ...g];
        return { ...d, lG, comandos, motivo: comandos.length ? null : d.motivo, foraDoPlano: [...d.foraDoPlano, ...(lG?.foraDoPlano ?? []).map((f) => `2º pavimento: ${f.motivo}`)] };
      },
      (p) => {
        estrutura.lajes = p.a.lajes.length + p.b.lajes.length + (p.lG?.lajes.length ?? 0);
        const guardaDoFuro = guardas ? `; ${guardas - 1} corrimão(s) nos lances e guarda-corpo na borda do furo${p.lG ? ' do 2º' : ''}` : '';
        return {
          nota: p.lG
            ? `${p.a.lajes.length} laje(s) no térreo, ${p.b.lajes.length} no 1º (o piso do 2º e o terraço) e ${p.lG.lajes.length} no 2º, de ${hip.estrutura.lajes.espessuraMm} mm${lajesRebaixadas ? `; a do térreo rebaixada ${f2(hip.sobrado.rebaixoDaLajeDoBanheiroMm / 1000)} m sob ${lajesRebaixadas} trecho(s) de banheiro do 1º` : ''}${lajesRebaixadasDoPrimeiro ? `; a do 1º sob ${lajesRebaixadasDoPrimeiro} trecho(s) de banheiro do 2º` : ''}${guardaDoFuro}`
            : `${p.a.lajes.length} laje(s) no térreo (o piso de cima, com o furo da escada) e ${p.b.lajes.length} no superior, de ${hip.estrutura.lajes.espessuraMm} mm${lajesRebaixadas ? `; rebaixada ${f2(hip.sobrado.rebaixoDaLajeDoBanheiroMm / 1000)} m sob ${lajesRebaixadas} trecho(s) de banheiro de cima` : ''}${guardaDoFuro}`,
          foraDoPlano: p.foraDoPlano,
        };
      },
    );
    etapaEstrutural(
      'FUNDACOES',
      (x) => planejarFundacoes(x, T, hip.estrutura.fundacoes),
      (p) => {
        estrutura.blocos = p.blocos.length;
        estrutura.estacas = p.estacas.length;
        estrutura.baldrames = p.baldrames.length;
        return { nota: `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s), ${p.baldrames.length} baldrame(s) — só no térreo` };
      },
    );
    etapaEstrutural(
      'EIXOS',
      (x) => {
        const p = propostaDeEixos(x, T, hip.estrutura.eixos);
        return { ...p, motivo: p.comandos.length ? null : p.motivoVazio && p.paredesObliquas === 0 ? p.motivoVazio : null, avisos: p.paredesObliquas ? [`${p.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos`] : [] };
      },
      (p) => {
        estrutura.eixos = p.novos;
        return { nota: `${p.novos} eixo(s)` };
      },
    );
    // F27-D3: na casa de 3, o telhado sobre o 2º (o retângulo recuado). F27-D5: o núcleo que sobra fora dele entra como
    // anexo (uma água caindo para fora) — sem isso a escada ficava descoberta.
    if (G && eg) {
      const sg = sobrado.segundo!.retangulo;
      const r = nucleo.ret;
      const fora: Retangulo[] = [
        ...(r.y0 < sg.y0 ? [{ x0: r.x0, x1: r.x1, y0: r.y0, y1: Math.min(r.y1, sg.y0) }] : []),
        ...(r.y1 > sg.y1 ? [{ x0: r.x0, x1: r.x1, y0: Math.max(r.y0, sg.y1), y1: r.y1 }] : []),
      ];
      etapaDoTelhado(G, eg.r.retangulo, [...eg.r.anexos, ...fora], (m.structures ?? []).some((x) => x.levelId === G && x.kind === 'LAJE'));
      // F27-D5: o guarda-corpo no contorno do terraço (a borda da laje do 1º que o 2º não cobre), no piso do 2º.
      const alturaDoGuardaCorpo = HIPOTESES_DE_GUARDA_CORPO_PADRAO.alturaGuardaCorpoMm;
      const linhas = contornoDoTerraco(retDoPrimeiro ?? rl, sg, r);
      if (linhas.length) {
        const noMundo = (p: Point) => {
          const w = paraMundo(q, p);
          return point(Math.round(w.x), Math.round(w.y));
        };
        aplicar(linhas.map((l, k): Command => ({ type: 'AddGuardaCorpo', levelId: G, tipo: 'GUARDA_CORPO', pontos: l.map(noMundo), alturaMm: alturaDoGuardaCorpo, material: 'METALICO', rotulo: `Terraço · guarda-corpo${linhas.length > 1 ? ` ${k + 1}` : ''}`, sugerido: true })));
        const metros = linhas.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - l[i].x, p.y - l[i].y), 0), 0) / 1000;
        decisoes.push(`3 pavimentos: guarda-corpo de ${f2(alturaDoGuardaCorpo / 1000)} m no contorno do terraço (${f2(metros)} m).`);
      }
      // F27 item 5.3: e o do terraço do 1º (a borda da laje do térreo que o 1º recuado não cobre), no piso do 1º.
      const doPrimeiro = retDoPrimeiro ? contornoDoTerraco(rl, retDoPrimeiro, r) : [];
      if (doPrimeiro.length) {
        const noMundo = (p: Point) => {
          const w = paraMundo(q, p);
          return point(Math.round(w.x), Math.round(w.y));
        };
        aplicar(doPrimeiro.map((l, k): Command => ({ type: 'AddGuardaCorpo', levelId: S, tipo: 'GUARDA_CORPO', pontos: l.map(noMundo), alturaMm: alturaDoGuardaCorpo, material: 'METALICO', rotulo: `Terraço do 1º · guarda-corpo${doPrimeiro.length > 1 ? ` ${k + 1}` : ''}`, sugerido: true })));
        const metros = doPrimeiro.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - l[i].x, p.y - l[i].y), 0), 0) / 1000;
        decisoes.push(`3 pavimentos: guarda-corpo de ${f2(alturaDoGuardaCorpo / 1000)} m no contorno do terraço do 1º (${f2(metros)} m).`);
      }
    }
    else etapaDoTelhado(S, es.r.retangulo, es.r.anexos, (m.structures ?? []).some((x) => x.levelId === S && x.kind === 'LAJE'));
    // ── INSTALAÇÕES DO SOBRADO (F12c) ──
    // O SHAFT junto de cada banheiro de cima, antes de tudo: o tubo de queda e as colunas de água descem por ele
    // (sem ele, desciam no ponto do vaso — no meio da garagem ou da cozinha de baixo).
    let notaDoShaft: string | null = null;
    if (hip.hidraulica.lancar) {
      const nucleoNoMundo = [
        { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y0 },
        { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y0 },
        { x: sobrado.nucleo.ret.x1, y: sobrado.nucleo.ret.y1 },
        { x: sobrado.nucleo.ret.x0, y: sobrado.nucleo.ret.y1 },
      ].map((p) => paraMundo(q, p));
      const shafts = shaftsDoSobrado(m, T, S, nucleoNoMundo, hip.sobrado.shaftMm);
      aplicar(shafts.map((x): Command => ({ type: 'AddNucleo', levelId: T, ateLevelId: S, tipo: 'SHAFT', ring: x.ring, rotulo: 'Shaft' })));
      // F27-D4: na casa de 3, o shaft de cada banheiro do 2º — desce até o térreo atravessando o 1º.
      if (G) {
        const doSegundo = shaftsDoSobrado(m, T, G, nucleoNoMundo, hip.sobrado.shaftMm, 2500, [S]);
        aplicar(doSegundo.map((x): Command => ({ type: 'AddNucleo', levelId: T, ateLevelId: G, tipo: 'SHAFT', ring: x.ring, rotulo: 'Shaft' })));
        shafts.push(...doSegundo.map((x) => ({ ...x, banheiro: `${x.banheiro} (2º pavimento)` })));
      }
      if (shafts.length) notaDoShaft = `${shafts.length} shaft(s) de ${hip.sobrado.shaftMm / 10} cm: ${shafts.map((x) => `junto do ${x.banheiro}${x.noTerreo ? `, descendo na ${x.noTerreo}` : ''}`).join('; ')}.`;
      else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Shaft: nenhuma parede dos banheiros de cima tem parede embaixo livre de porta, janela e pilar — o tubo de queda desce no ponto do vaso; ponha o shaft à mão (Núcleo vertical).' });
    }
    // F27 item 5.3: as âncoras do térreo (vagas, medidor) pelo retângulo do térreo — o do 1º pode ser o recuado.
    const inst = instalacoes(G ? [T, S, G] : [T, S], retDoPrimeiro ? rl : es.r.retangulo, notaDoShaft);
    const soltas = prumadasPeloMeioDoComodo(m);
    if (soltas.length) {
      const nome: Record<string, string> = { ...ROTULO_DA_DISCIPLINA_DA_REDE, ...ROTULO_DA_DISCIPLINA_DO_AR, ELETRICA: 'eletroduto' };
      const porComodo = new Map<string, string[]>();
      for (const x of soltas) {
        const k = `${x.comodo} (${x.nivel.toLowerCase()})`;
        porComodo.set(k, [...(porComodo.get(k) ?? []), x.rotulo?.toLowerCase() || nome[x.disciplina] || x.disciplina.toLowerCase()]);
      }
      for (const [k, v] of porComodo) pendencias.push({ grupo: 'VERIFICACAO', texto: `Prumada pelo meio do cômodo: ${v.join(', ')} atravessa ${k} — leve-a pela parede ou pelo shaft.` });
    }
    return fechar({
      projecaoM2: et.r.resumo.areaConstruidaM2,
      areaConstruidaM2: et.r.resumo.areaConstruidaM2 + es.r.resumo.areaConstruidaM2 + (eg?.r.resumo.areaConstruidaM2 ?? 0),
      alturaM: ((eg ? 3 : 2) * andarMm) / 1000,
      semente: et.r.semente,
      escolha: eg ? `térreo: ${et.texto}; 1º: ${es.texto}; 2º: ${eg.texto}` : `térreo: ${et.texto}; superior: ${es.texto}`,
      sobrado,
      disciplinas: { estrutura, telhado, ancoras: inst.ancoras, mobiliario: inst.mobiliario, hidraulica: inst.hidraulica, eletrica: inst.eletrica, aberturas: inst.redesEmAberturas, climatizacao: inst.climatizacao, forro: inst.forro, furos: inst.furos },
    });
  }

  const { resultados, falhas } = gerarTodas(programa);
  if (!resultados.length) {
    const motivo = `o gerador não fechou a planta (${falhas.join('; ')})`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const { r, texto: escolha } = escolherSemente(resultados);
  decisoes.push(...r.decisoes);
  let n = 0;
  try {
    n = aplicar(comandosNoMundo(r, entrada.levelId, q, implantacao.alinhadaAoDesenho));
  } catch (e) {
    const motivo = `as paredes geradas não entraram no desenho: ${e instanceof Error ? e.message : String(e)}`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const paredes = m.walls.filter((w) => w.levelId === entrada.levelId).length;
  const aberturas = m.openings.filter((o) => m.walls.some((w) => w.id === o.wallId && w.levelId === entrada.levelId)).length;
  etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'LANCOU', n, `${paredes} paredes, ${aberturas} portas e janelas, ${r.ambientes.length} ambientes — ${escolha}`);
  lancarEscadaDeAcesso();
  lancarRampaDaGaragem();
  // F26: o muro logo depois da casa — antes da água e da elétrica, que põem o hidrômetro e o medidor nele.
  resumoDoMuro = lancarMuroDaCasa();
  // F21: "sem porta direta" já sai na CONFERÊNCIA do programa (com a distância em portas) — aqui só pesa na escolha.
  for (const a of r.avisos) if (!/sem porta direta \(relação obrigatória\)/.test(a)) pendencias.push({ grupo: GRAVE.test(a) ? 'SEM_SOLUCAO' : 'VERIFICACAO', texto: `Arquitetura: ${a}` });

  // ── ESTRUTURA (F4) ────────────────────────────────────────────────────────
  etapaEstrutural(
    'PILARES',
    (x) => planejarPilares(x, L, hip.estrutura.pilares),
    (p) => {
      estrutura.pilares = p.pilares.length;
      return { nota: `${p.pilares.length} pilar(es)${p.pontasSoltas ? `; ${p.pontasSoltas} ponta(s) de parede solta(s) sem pilar` : ''}`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'VIGAS',
    (x) => planejarVigas(x, L, hip.estrutura.vigas),
    (p) => {
      estrutura.vigas = p.vigas.length;
      return { nota: `${p.vigas.length} viga(s)`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'LAJES',
    (x) => planejarLajes(x, L, hip.estrutura.lajes),
    (p) => {
      estrutura.lajes = p.lajes.length;
      return { nota: `${p.lajes.length} laje(s) de ${hip.estrutura.lajes.espessuraMm} mm`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'FUNDACOES',
    (x) => planejarFundacoes(x, L, hip.estrutura.fundacoes),
    (p) => {
      estrutura.blocos = p.blocos.length;
      estrutura.estacas = p.estacas.length;
      estrutura.baldrames = p.baldrames.length;
      return { nota: `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s), ${p.baldrames.length} baldrame(s)` };
    },
  );

  // Eixos POR ÚLTIMO: o `planejarPilares` põe pilar em todo cruzamento de eixos "com ou sem parede ali" (a malha
  // do calculista manda). Com os eixos automáticos — um por linha de parede — antes dos pilares, a malha cobria
  // a casa inteira (sonda de 15/10, casa de 157 m²: 52 pilares, 49 em cruzamento de eixo, 2 DENTRO de ambiente
  // longe de parede, 26 recusados por colidir; nesta ordem: 32, todos sobre parede). Depois, os eixos documentam
  // a estrutura lançada. Das paredes ortogonais; com paredes no pavimento, o envelope do lote não entra.
  etapaEstrutural(
    'EIXOS',
    (x) => {
      const p = propostaDeEixos(x, L, hip.estrutura.eixos);
      return { ...p, motivo: p.comandos.length ? null : p.motivoVazio && p.paredesObliquas === 0 ? p.motivoVazio : null, avisos: p.paredesObliquas ? [`${p.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos`] : [] };
    },
    (p) => {
      estrutura.eixos = p.novos;
      return { nota: `${p.novos} eixo(s)` };
    },
  );

  // ── TELHADO (F5) ──────────────────────────────────────────────────────────
  etapaDoTelhado(entrada.levelId, r.retangulo, r.anexos, estrutura.lajes > 0);

  // ── INSTALAÇÕES (F6–F9) ───────────────────────────────────────────────────
  const inst = instalacoes([entrada.levelId], r.retangulo);

  // ── CONFERENCIA ───────────────────────────────────────────────────────────
  return fechar({
    projecaoM2: r.resumo.areaConstruidaM2,
    areaConstruidaM2: r.resumo.areaConstruidaM2,
    alturaM: peDireitoMm / 1000,
    semente: r.semente,
    escolha,
    sobrado: null,
    disciplinas: { estrutura, telhado, ancoras: inst.ancoras, mobiliario: inst.mobiliario, hidraulica: inst.hidraulica, eletrica: inst.eletrica, aberturas: inst.redesEmAberturas, climatizacao: inst.climatizacao, forro: inst.forro, furos: inst.furos },
  });
}

/** Trava antes de gravar: o lote reaplicado no desenho ATUAL cria os mesmos ids e o mesmo modelo da prévia. */
export function conferirPlanoDaCasa(original: BlueprintModel, plano: PlanoDaCasa): { ok: true } | { ok: false; motivo: string } {
  if (!plano.comandos.length) return { ok: false, motivo: 'O plano não tem nada a lançar.' };
  const impedimento = motivoParaNaoGerar(original, plano.levelId);
  if (impedimento) return { ok: false, motivo: impedimento };
  try {
    const r = applyBatch(original, plano.comandos);
    const iguais = r.diff.created.length === plano.criados.length && r.diff.created.every((id, i) => id === plano.criados[i]);
    if (!iguais || snapshotHash(r.model) !== snapshotHash(plano.resultado)) return { ok: false, motivo: 'O desenho mudou desde a prévia — gere de novo.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: `O desenho mudou desde a prévia — gere de novo (${e instanceof Error ? e.message : String(e)}).` };
  }
}

/** F27 item 5.3b: quantas vezes o 1º recuado anda/cresce atrás do patamar da escada antes de desistir. */
const VOLTAS_DO_PRIMEIRO_RECUADO = 8;

// ─── F10: o pedido que atravessa o Web Worker ───────────────────────────────

/**
 * O que a tela manda ao worker: tudo CLONÁVEL. O leitor do terreno é uma função e não atravessa — vai a GRADE da
 * topografia (e a cota zero), e o leitor é remontado do lado de lá (`amostradorDaGrade`).
 */
export interface PedidoDaCasa {
  original: BlueprintModel;
  entrada: Omit<EntradaDaCasa, 'leitorDoTerreno'>;
  terreno: { grade: GradeDeElevacao; cotaZeroM: number } | null;
  hip: Partial<HipotesesDaCasa>;
}

/** O pedido → o plano. O mesmo no worker e no fio principal (sem `Worker`, nos testes): o motor é determinístico. */
export function planejarCasaDoPedido(pedido: PedidoDaCasa, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const leitorDoTerreno = pedido.terreno ? { cotaEmM: amostradorDaGrade(pedido.terreno.grade), cotaZeroM: pedido.terreno.cotaZeroM } : null;
  return planejarCasa(pedido.original, { ...pedido.entrada, leitorDoTerreno, gradeDoTerreno: pedido.terreno?.grade ?? null }, pedido.hip, opcoes);
}

