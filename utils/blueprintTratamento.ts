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
 */
import type { BlueprintModel, Command, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { caixasDeInspecao } from './blueprintEsgotoAutomatico';

export const ROTULO_DO_TRATAMENTO = 'Tratamento';

/** As premissas do tratamento individual — do estudo. */
export interface HipotesesDeTratamento {
  /** O filtro anaeróbio entre o tanque e o sumidouro (NBR 13969). */
  comFiltro: boolean;
}
export const HIPOTESES_TRATAMENTO_PADRAO: HipotesesDeTratamento = { comFiltro: true };

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
