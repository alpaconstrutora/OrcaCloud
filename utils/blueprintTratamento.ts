/**
 * TRATAMENTO INDIVIDUAL DO ESGOTO (29/09/2026, E7 do roadmap hidrossanitário,
 * NBR 7229:1993 e NBR 13969:1997).
 *
 * Onde não há rede pública, o esgoto sai da caixa de inspeção para o TANQUE
 * SÉPTICO, o FILTRO ANAERÓBIO (opcional) e o SUMIDOURO — o destino final. Cada
 * unidade é um ponto de esgoto com corpo (kernel 0.68.0): a cota dela é a do
 * TUBO de entrada e saída, e o corpo vai de 40 cm acima dela até o fundo.
 *
 * E7.1 — o LANÇAMENTO: da caixa de inspeção, as unidades em fila no sentido
 * que se afasta da construção (o eixo dominante entre o centro das paredes e a
 * caixa), com folgas entre as faces, ligadas por tubos DN 100 a 1 %. Relançar
 * troca as sugeridas; com a ligação à rede pública no desenho, não se aplica.
 *
 * E7.2 — o DIMENSIONAMENTO:
 *   - TANQUE SÉPTICO (NBR 7229, 5.7): V = 1000 + N·(C·T + K·Lf), litros — N a
 *     população (a mesma da reservação, E4.1), C e Lf da Tabela 1 (padrão da
 *     residência), T da Tabela 2 (pela contribuição diária), K da Tabela 3
 *     (intervalo de limpeza × temperatura). Retangular 2:1, largura interna
 *     ≥ 0,80 m, profundidade útil a mínima da Tabela 4 para o volume;
 *   - FILTRO ANAERÓBIO (NBR 13969, 4.1): Vu = 1,6·N·C·T, mínimo 1000 L, T da
 *     Tabela 4 (pela contribuição e pela temperatura); cilindro com leito de
 *     1,20 m — o diâmetro sai do volume;
 *   - SUMIDOURO (NBR 13969, 4.3): área de infiltração (fundo + parede) =
 *     N·C / Ci, com Ci a taxa de infiltração do SOLO (premissa — o ensaio do
 *     Anexo A); cilindro do diâmetro da premissa, a altura útil sai da área.
 *     Acima de 3,00 m de altura útil, o aviso de dividir em mais sumidouros
 *     (backlog: múltiplos sumidouros e valas de infiltração).
 *
 * ⚠️ As tabelas foram transcritas de memória — CONFERIR NA NORMA antes de
 * emitir (`TABELA_*` abaixo, num lugar só).
 */
import type { BlueprintModel, Command, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { caixasDeInspecao } from './blueprintEsgotoAutomatico';
import { populacaoDoModelo, type HipotesesDeReservatorio } from './blueprintReservacao';

export const ROTULO_DO_TRATAMENTO = 'Tratamento';

/** O padrão da residência (NBR 7229, Tabela 1): a contribuição de despejos. */
export const PADROES_DE_RESIDENCIA = ['ALTO', 'MEDIO', 'BAIXO'] as const;
export type PadraoDeResidencia = (typeof PADROES_DE_RESIDENCIA)[number];

/** As premissas do tratamento individual — do estudo. */
export interface HipotesesDeTratamento {
  /** O filtro anaeróbio entre o tanque e o sumidouro (NBR 13969). */
  comFiltro: boolean;
  padrao: PadraoDeResidencia;
  /** Temperatura média do mês mais frio, °C — cada tabela tem as suas faixas (NBR 7229 ≠ NBR 13969). */
  temperaturaC: number;
  /** Intervalo entre limpezas do tanque, anos (1 a 5). */
  intervaloDeLimpezaAnos: number;
  /** Taxa de infiltração do solo, L/m²·dia — do ensaio de infiltração (NBR 13969, Anexo A). */
  taxaDeInfiltracaoLM2Dia: number;
  /** Diâmetro interno do sumidouro, mm. */
  diametroDoSumidouroMm: number;
}
export const HIPOTESES_TRATAMENTO_PADRAO: HipotesesDeTratamento = {
  comFiltro: true,
  padrao: 'MEDIO',
  temperaturaC: 18,
  intervaloDeLimpezaAnos: 1,
  taxaDeInfiltracaoLM2Dia: 50,
  diametroDoSumidouroMm: 1500,
};

// ─── As tabelas (⚠️ CONFERIR NA NORMA) ──────────────────────────────────────

/** NBR 7229, Tabela 1 — residência: contribuição de despejos C e de lodo fresco Lf, L/pessoa·dia. */
export const TABELA_CONTRIBUICAO: Readonly<Record<PadraoDeResidencia, { C: number; Lf: number }>> = {
  ALTO: { C: 160, Lf: 1 },
  MEDIO: { C: 130, Lf: 1 },
  BAIXO: { C: 100, Lf: 1 },
};
/** NBR 7229, Tabela 2 — período de detenção T (dias) pela contribuição diária (L), até o limite. */
export const TABELA_DETENCAO_DO_TANQUE: readonly { ateL: number; T: number }[] = [
  { ateL: 1500, T: 1.0 },
  { ateL: 3000, T: 0.92 },
  { ateL: 4500, T: 0.83 },
  { ateL: 6000, T: 0.75 },
  { ateL: 7500, T: 0.67 },
  { ateL: 9000, T: 0.58 },
  { ateL: Infinity, T: 0.5 },
];
/**
 * NBR 7229, Tabela 3 — taxa de acumulação de lodo K (dias) por intervalo de
 * limpeza (1–5 anos), nas faixas t ≤ 10 °C, 10 < t ≤ 20 °C e t > 20 °C.
 */
export const TABELA_ACUMULACAO_DE_LODO: readonly (readonly number[])[] = [
  [94, 134, 174, 214, 254],
  [65, 105, 145, 185, 225],
  [57, 97, 137, 177, 217],
];
const faixaDoLodo = (t: number) => (t <= 10 ? 0 : t <= 20 ? 1 : 2);
/** NBR 7229, Tabela 4 — profundidade útil mínima (m) pelo volume útil (m³). */
export const TABELA_PROFUNDIDADE_DO_TANQUE: readonly { ateM3: number; minimaM: number; maximaM: number }[] = [
  { ateM3: 6, minimaM: 1.2, maximaM: 2.2 },
  { ateM3: 10, minimaM: 1.5, maximaM: 2.5 },
  { ateM3: Infinity, minimaM: 1.8, maximaM: 2.8 },
];
/**
 * NBR 13969, Tabela 4 — tempo de detenção do filtro anaeróbio (dias) pela
 * contribuição diária, nas faixas t < 15 °C, 15 ≤ t ≤ 25 °C e t > 25 °C.
 */
export const TABELA_DETENCAO_DO_FILTRO: readonly { ateL: number; T: readonly [number, number, number] }[] = [
  { ateL: 1500, T: [1.17, 1.0, 0.92] },
  { ateL: 3000, T: [1.08, 0.92, 0.83] },
  { ateL: 4500, T: [1.0, 0.83, 0.75] },
  { ateL: 6000, T: [0.92, 0.75, 0.67] },
  { ateL: 7500, T: [0.83, 0.67, 0.58] },
  { ateL: 9000, T: [0.75, 0.58, 0.5] },
  { ateL: Infinity, T: [0.75, 0.5, 0.5] },
];
const faixaDoFiltro = (t: number) => (t < 15 ? 0 : t <= 25 ? 1 : 2);
export const LARGURA_MINIMA_DO_TANQUE_MM = 800;
export const ALTURA_DO_LEITO_DO_FILTRO_MM = 1200;
export const VOLUME_MINIMO_DO_FILTRO_L = 1000;
/** Acima disto de altura útil, o sumidouro deve ser dividido (backlog: múltiplos sumidouros). */
export const ALTURA_UTIL_MAXIMA_DO_SUMIDOURO_MM = 3000;
/** O corpo sobe 40 cm acima do tubo (a cota da peça) — `CAIXAS_DE_ESGOTO.acimaDoTuboMm`. */
const ACIMA_DO_TUBO_MM = 400;
/** A altura do filtro: o leito e o fundo falso/espaço acima dele. */
const ALTURA_DO_FILTRO_MM = 1800;

const acima50 = (mm: number) => Math.ceil(mm / 50) * 50;

export interface DimensionamentoDoTratamento {
  pessoas: number;
  /** N·C, L/dia. */
  contribuicaoDiariaL: number;
  C: number;
  Lf: number;
  tanque: { T: number; K: number; volumeL: number; comprimentoMm: number; larguraMm: number; profundidadeUtilMm: number };
  filtro: { T: number; volumeUtilL: number; diametroMm: number; leitoMm: number };
  sumidouro: { areaM2: number; diametroMm: number; alturaUtilMm: number };
  avisos: string[];
}

/** O dimensionamento do tanque, do filtro e do sumidouro para a população do desenho. */
export function dimensionarTratamento(model: BlueprintModel, hip: HipotesesDeTratamento, reserva: HipotesesDeReservatorio): DimensionamentoDoTratamento {
  const pessoas = populacaoDoModelo(model, reserva).pessoas;
  const { C, Lf } = TABELA_CONTRIBUICAO[hip.padrao] ?? TABELA_CONTRIBUICAO.MEDIO;
  const contribuicaoDiariaL = pessoas * C;
  const avisos: string[] = [];
  if (pessoas === 0) avisos.push('População zero — dê nome aos dormitórios (ou declare a população na reservação).');
  // Tanque séptico.
  const T = TABELA_DETENCAO_DO_TANQUE.find((l) => contribuicaoDiariaL <= l.ateL)!.T;
  const anos = Math.min(5, Math.max(1, Math.round(hip.intervaloDeLimpezaAnos)));
  const K = TABELA_ACUMULACAO_DE_LODO[faixaDoLodo(hip.temperaturaC)][anos - 1];
  const volumeL = 1000 + pessoas * (C * T + K * Lf);
  const faixa = TABELA_PROFUNDIDADE_DO_TANQUE.find((l) => volumeL / 1000 <= l.ateM3)!;
  const profundidadeUtilMm = Math.round(faixa.minimaM * 1000);
  // 2:1 — V = 2·W²·h → W = √(V / 2h).
  const larguraMm = Math.max(LARGURA_MINIMA_DO_TANQUE_MM, acima50(Math.sqrt((volumeL / 1000) / (2 * faixa.minimaM)) * 1000));
  const comprimentoMm = acima50(Math.max(2 * larguraMm, ((volumeL / 1000) / (larguraMm / 1000) / faixa.minimaM) * 1000));
  // Filtro anaeróbio.
  const Tf = TABELA_DETENCAO_DO_FILTRO.find((l) => contribuicaoDiariaL <= l.ateL)!.T[faixaDoFiltro(hip.temperaturaC)];
  const volumeUtilL = Math.max(VOLUME_MINIMO_DO_FILTRO_L, 1.6 * pessoas * C * Tf);
  const diametroDoFiltroMm = acima50(Math.sqrt((4 * (volumeUtilL / 1000)) / (Math.PI * (ALTURA_DO_LEITO_DO_FILTRO_MM / 1000))) * 1000);
  // Sumidouro: fundo + parede = N·C / Ci.
  const areaM2 = contribuicaoDiariaL / Math.max(1, hip.taxaDeInfiltracaoLM2Dia);
  const D = hip.diametroDoSumidouroMm / 1000;
  const fundo = (Math.PI * D * D) / 4;
  const alturaUtilMm = Math.max(500, acima50((Math.max(0, areaM2 - fundo) / (Math.PI * D)) * 1000));
  if (alturaUtilMm > ALTURA_UTIL_MAXIMA_DO_SUMIDOURO_MM) avisos.push(`O sumidouro pediria ${(alturaUtilMm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m de altura útil — divida em mais sumidouros ou aumente o diâmetro.`);
  return {
    pessoas, contribuicaoDiariaL, C, Lf,
    tanque: { T, K, volumeL, comprimentoMm, larguraMm, profundidadeUtilMm },
    filtro: { T: Tf, volumeUtilL, diametroMm: diametroDoFiltroMm, leitoMm: ALTURA_DO_LEITO_DO_FILTRO_MM },
    sumidouro: { areaM2, diametroMm: hip.diametroDoSumidouroMm, alturaUtilMm },
    avisos,
  };
}

/** As medidas das peças que o lançamento cria, a partir do dimensionamento. */
export function medidasDimensionadas(d: DimensionamentoDoTratamento): Record<UnidadeDeTratamento, MedidasDaUnidade> {
  return {
    TANQUE_SEPTICO: { comprimentoMm: d.tanque.comprimentoMm, larguraMm: d.tanque.larguraMm, alturaMm: d.tanque.profundidadeUtilMm + ACIMA_DO_TUBO_MM },
    FILTRO_ANAEROBIO: { comprimentoMm: d.filtro.diametroMm, larguraMm: d.filtro.diametroMm, alturaMm: ALTURA_DO_FILTRO_MM },
    SUMIDOURO: { comprimentoMm: d.sumidouro.diametroMm, larguraMm: d.sumidouro.diametroMm, alturaMm: d.sumidouro.alturaUtilMm + ACIMA_DO_TUBO_MM },
  };
}

// ─── A verificação das unidades desenhadas ──────────────────────────────────

export interface UnidadeVerificada {
  terminalId: ObjectId;
  tipo: UnidadeDeTratamento;
  /** O que a peça tem: volume útil (L) no tanque e no filtro, área de infiltração (m²) no sumidouro. */
  tem: number;
  precisa: number;
  unidade: 'L' | 'm²';
  atende: boolean;
}

/** Cada unidade do desenho contra o dimensionamento: volume útil do tanque e do filtro, área do sumidouro. */
export function verificarTratamento(model: BlueprintModel, d: DimensionamentoDoTratamento): UnidadeVerificada[] {
  return (model.terminais ?? [])
    .filter(ehUnidade)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => {
      const tipo = t.tipoHidraulico as UnidadeDeTratamento;
      const m = FICHA_DO_PONTO_HIDRAULICO[tipo].medidasMm!;
      const largura = (t.larguraMm ?? m.larguraMm) / 1000;
      const profundidade = (t.profundidadeMm ?? m.profundidadeMm) / 1000;
      const alturaUtil = ((t.alturaMm ?? m.alturaMm) - ACIMA_DO_TUBO_MM) / 1000;
      if (tipo === 'TANQUE_SEPTICO') {
        const tem = largura * profundidade * alturaUtil * 1000;
        return { terminalId: t.id, tipo, tem, precisa: d.tanque.volumeL, unidade: 'L' as const, atende: tem + 1e-6 >= d.tanque.volumeL };
      }
      if (tipo === 'FILTRO_ANAEROBIO') {
        const tem = ((Math.PI * largura * largura) / 4) * (d.filtro.leitoMm / 1000) * 1000;
        return { terminalId: t.id, tipo, tem, precisa: d.filtro.volumeUtilL, unidade: 'L' as const, atende: tem + 1e-6 >= d.filtro.volumeUtilL };
      }
      const tem = (Math.PI * largura * largura) / 4 + Math.PI * largura * alturaUtil;
      return { terminalId: t.id, tipo, tem, precisa: d.sumidouro.areaM2, unidade: 'm²' as const, atende: tem + 1e-6 >= d.sumidouro.areaM2 };
    });
}

/** O desenho usa tratamento individual: há sumidouro e não há ligação à rede pública. */
export function temTratamentoIndividual(model: BlueprintModel): boolean {
  const t = model.terminais ?? [];
  return t.some((x) => x.tipoHidraulico === 'SUMIDOURO') && !t.some((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO');
}
export const UNIDADES_DE_TRATAMENTO = ['TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO'] as const satisfies readonly TipoDePontoHidraulico[];
export type UnidadeDeTratamento = (typeof UNIDADES_DE_TRATAMENTO)[number];

/** Folga entre as faces de duas unidades seguidas, mm (e da caixa ao tanque). */
export const FOLGA_ENTRE_UNIDADES_MM = 1000;
/** O sumidouro fica mais longe: 1,50 m do filtro/tanque (NBR 13969 pede distância das outras unidades). */
export const FOLGA_ATE_O_SUMIDOURO_MM = 1500;
const DN_DO_TRATAMENTO_MM = 100;
const DECLIVIDADE_PCT = 1;

export interface MedidasDaUnidade {
  /** Comprimento no sentido do fluxo (o tanque é retangular; o filtro e o sumidouro, o diâmetro). */
  comprimentoMm: number;
  larguraMm: number;
  alturaMm: number;
}

/** As medidas padrão da ficha (E7.2 as troca pelas dimensionadas). */
export function medidasPadrao(tipo: UnidadeDeTratamento): MedidasDaUnidade {
  const m = FICHA_DO_PONTO_HIDRAULICO[tipo].medidasMm!;
  // O tanque é mais comprido que largo: o comprimento é a maior das duas medidas.
  return { comprimentoMm: Math.max(m.larguraMm, m.profundidadeMm), larguraMm: Math.min(m.larguraMm, m.profundidadeMm), alturaMm: m.alturaMm };
}

export interface PlanoDeTratamento {
  motivo: string | null;
  caixaId: ObjectId | null;
  unidades: { tipo: UnidadeDeTratamento; at: { x: number; y: number }; cotaMm: number; medidas: MedidasDaUnidade }[];
  apagados: number;
  comandos: Command[];
}

const ehUnidade = (t: Terminal) => t.disciplina === 'ESGOTO' && (UNIDADES_DE_TRATAMENTO as readonly string[]).includes(t.tipoHidraulico ?? '');

export function planejarTratamento(
  model: BlueprintModel,
  opcoes: { comFiltro: boolean; medidas?: Partial<Record<UnidadeDeTratamento, MedidasDaUnidade>> } = { comFiltro: true },
): PlanoDeTratamento {
  const vazio = (motivo: string): PlanoDeTratamento => ({ motivo, caixaId: null, unidades: [], apagados: 0, comandos: [] });
  const terminais = model.terminais ?? [];
  if (terminais.some((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO')) return vazio('O lote tem ligação à rede pública — o esgoto vai para ela; o tratamento individual não se aplica.');
  const ci = [...caixasDeInspecao(model)].sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!ci) return vazio('Coloque a caixa de inspeção (ou lance o esgoto) — o tratamento começa nela.');
  const confirmadas = terminais.filter((t) => ehUnidade(t) && !t.sugerida);
  if (confirmadas.length > 0) return vazio('O tratamento já tem unidades confirmadas — mova ou apague-as para relançar.');

  // Relançar: as unidades e os tubos SUGERIDOS saem.
  const comandos: Command[] = [];
  const sugeridas = terminais.filter((t) => ehUnidade(t) && t.sugerida);
  const tubos = (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_TRATAMENTO && t.sugerido);
  for (const t of tubos) comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
  for (const t of sugeridas) comandos.push({ type: 'DeleteTerminal', terminalId: t.id });

  // O sentido: da construção para a caixa, no eixo dominante.
  const paredes = model.walls.filter((w) => w.levelId === ci.levelId);
  const pontos = (paredes.length ? paredes : model.walls).flatMap((w) => [w.a, w.b]);
  const centro = pontos.length ? { x: pontos.reduce((s, p) => s + p.x, 0) / pontos.length, y: pontos.reduce((s, p) => s + p.y, 0) / pontos.length } : { x: ci.at.x - 1, y: ci.at.y };
  const dx = ci.at.x - centro.x;
  const dy = ci.at.y - centro.y;
  const dir = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };

  const tipos: UnidadeDeTratamento[] = opcoes.comFiltro ? ['TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO'] : ['TANQUE_SEPTICO', 'SUMIDOURO'];
  const larguraDaCi = ci.larguraMm ?? 600;
  let face = larguraDaCi / 2; // a face da peça anterior, medida da caixa no sentido do fluxo
  let anterior = { x: ci.at.x, y: ci.at.y, cota: ci.cotaMm };
  const unidades: PlanoDeTratamento['unidades'] = [];
  for (const tipo of tipos) {
    const m = opcoes.medidas?.[tipo] ?? medidasPadrao(tipo);
    const folga = tipo === 'SUMIDOURO' ? FOLGA_ATE_O_SUMIDOURO_MM : FOLGA_ENTRE_UNIDADES_MM;
    const centroDaUnidade = face + folga + m.comprimentoMm / 2;
    const at = { x: Math.round(ci.at.x + dir.x * centroDaUnidade), y: Math.round(ci.at.y + dir.y * centroDaUnidade) };
    const L = Math.hypot(at.x - anterior.x, at.y - anterior.y);
    const cota = anterior.cota - Math.ceil((L * DECLIVIDADE_PCT) / 100);
    // No eixo x, a "largura" do terminal é o comprimento; no eixo y, é a largura.
    const [larguraMm, profundidadeMm] = dir.x !== 0 ? [m.comprimentoMm, m.larguraMm] : [m.larguraMm, m.comprimentoMm];
    comandos.push({
      type: 'AddTerminal', levelId: ci.levelId, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo, at, cotaMm: cota,
      tipoHidraulico: tipo, sugerida: true, larguraMm, profundidadeMm, alturaMm: m.alturaMm,
    });
    comandos.push({ type: 'AddTrecho', levelId: ci.levelId, disciplina: 'ESGOTO', a: { x: anterior.x, y: anterior.y }, b: at, cotaAMm: anterior.cota, cotaBMm: cota, bitolaMm: DN_DO_TRATAMENTO_MM, rotulo: ROTULO_DO_TRATAMENTO, sugerido: true });
    unidades.push({ tipo, at, cotaMm: cota, medidas: m });
    face = centroDaUnidade + m.comprimentoMm / 2;
    anterior = { x: at.x, y: at.y, cota };
  }
  return { motivo: null, caixaId: ci.id, unidades, apagados: sugeridas.length, comandos };
}
