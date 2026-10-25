/**
 * ÁGUA E PLUVIAL — COM QUE ESCOLHAS A REDE FOI LANÇADA, E O QUE FAZER QUANDO ELAS MUDAM (F3 do plano
 * `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026). O molde é a F2 dos eletrodutos
 * (`blueprintEscolhasDoEletroduto.ts`).
 *
 * Pedido (sessão 9e26b316, 24/10/2026):
 * > *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto
 * > para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e
 * > incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*
 *
 * Decisões do usuário (mesma sessão): vale para TODOS os motores; rede já aceita + escolha mudou → refaz tudo, PEDINDO
 * CONFIRMAÇÃO.
 *
 * ─── DE ONDE VÊM AS ESCOLHAS ─────────────────────────────────────────────────
 * As duas redes leem as premissas hidráulicas do ESTUDO (`useBlueprintHidro` → `HipotesesHidro`): a água, as da gaveta
 * (velocidade, DN mínimos, ramal, colunas, traçado) e as da tela "Dimensionamento da água" (pressão, alimentador,
 * reservação, recalque); o pluvial, as da gaveta Águas pluviais (intensidade, calha, condutor). Entra no registro só o
 * que MUDA a rede lançada — o que só mexe em aviso ou volume (pressão da rede pública, estática máxima, dias de
 * reserva, fração do inferior, rendimento da bomba) não pede relançar.
 *
 * ─── O ALVO ──────────────────────────────────────────────────────────────────
 * `null` (a planta inteira): os dois "Lançar tudo" lançam todas as origens / todas as águas do telhado num lote só.
 *
 * ─── O QUE É "A REDE DO SISTEMA" (o que o Refazer apaga) ─────────────────────
 * - ÁGUA: os tubos de água fria/quente ligados a uma origem (`redeDaOrigem` de cada caixa e aquecedor) e os tubos com
 *   rótulo próprio do sistema (alimentador, extravasor, limpeza, sucção, recalque — `FORA_DA_DISTRIBUICAO`), confirmados
 *   inclusive; e as peças EM LINHA sobre esses tubos (registros, válvulas, conexões — o registro da limpeza, ou os
 *   postos à mão: sem o tubo ficariam soltos).
 *   NÃO entram: os pontos de consumo e os aparelhos (entrada do motor), a caixa, o aquecedor, o hidrômetro, a bomba e a
 *   torneira de boia (o motor os reaproveita onde estão), e tubo de água solto, sem ligação com uma origem.
 * - PLUVIAL: os tubos que o motor cria (rótulos Calha, Condutor vertical e Condutor horizontal) e os BOCAIS (ralo
 *   pluvial com rótulo "Bocal", que a calha cria). NÃO entram: o tubo pluvial desenhado à mão, os ralos pluviais postos à
 *   mão (as fontes dos condutores), a caixa de areia e a saída pluvial.
 *
 * ─── A CASA AUTOMÁTICA (forro, faixas e ajustes) ─────────────────────────────
 * A casa lança a água com hipóteses que o painel não conhece: os ramais NO FORRO (`agua.noForro`), a faixa da água
 * quente (`agua.faixaDaAguaQuente`), o alimentador subindo pela fachada (`alimentacao.subida`) e, depois do esgoto, o
 * alimentador e o condutor pluvial enterrados numa cota ajustada para cruzar por cima (F18). O registro guarda tudo isso
 * em chaves SEM rótulo (fora do aviso) e `lancamentoDaAgua`/`lancamentoDoPluvial` as devolvem a todo relançamento — o
 * relançar pelo editor mantém a água no forro.
 *
 * Correção 1 (24/10/2026, relato do usuário na planta "Garden": *"alterei e não ficou disponível para relançamento"*):
 * água da casa no forro lançada ANTES do registro relança pelo FORRO DA CASA (`forroDaCasa`, montado pelo editor com
 * `forroDaAguaDaCasa` a partir das premissas da casa do estudo). O forro do registro tem prioridade; o bloqueio
 * (`motivoParaNaoRelancarAgua`) só vale sem registro E sem `forroDaCasa`.
 *
 * Puro: sem React, sem banco.
 */
import { applyBatch, type BlueprintModel, type Command, type ObjectId, type Terminal, type Trecho, type ValorDeEscolha } from './blueprintKernel';
import { FORA_DA_DISTRIBUICAO, HIPOTESES_AGUA_PADRAO, origensDeAgua, redeDaOrigem } from './blueprintAguaAutomatica';
import { planejarAguaCompleta, type HipotesesDaAguaCompleta, type PlanoDaAguaCompleta } from './blueprintAguaCompleta';
import { HIPOTESES_ALIMENTACAO_PADRAO } from './blueprintAlimentador';
import { RUGOSIDADE_DA_CALHA, ROTULO_DA_CALHA, ROTULO_DO_BOCAL } from './blueprintCalhas';
import { ROTULO_DO_CONDUTOR_HORIZONTAL, ROTULO_DO_CONDUTOR_VERTICAL } from './blueprintCondutoresPluviais';
import { horizontaisNoForro, motivoSemAssinaturaDaCasa, temAssinaturaDaCasa } from './blueprintAssinaturaDaCasa';
import { HIPOTESES_PLUVIAIS_PADRAO, INTENSIDADE_POR_CIDADE, type HipotesesPluviais } from './blueprintPluvial';
import { planejarPluvialCompleta, type PlanoDaPluvialCompleta } from './blueprintPluvialCompleto';
import { HIPOTESES_PRESSAO_PADRAO } from './blueprintPressaoDaRede';
import { HIPOTESES_RECALQUE_PADRAO } from './blueprintRecalque';
import { HIPOTESES_RESERVATORIO_PADRAO } from './blueprintReservacao';
import type { LeitorDoTerreno } from './blueprintAncorasHidro';
import {
  comandoDeRegistro,
  diferencasDasEscolhas,
  registroDe,
  textoDasDiferencas,
  type DiferencaDeEscolha,
  type EscolhasDoLancamento,
  type OpcoesDaComparacao,
} from './blueprintRegistroDeLancamento';

const num = (v: ValorDeEscolha) => String(v).replace('.', ',');
const mm = (v: ValorDeEscolha) => `${num(v)} mm`;
const kpa = (v: ValorDeEscolha) => `${num(v)} kPa`;
const dn = (v: ValorDeEscolha) => `DN ${num(v)}`;
/** "Sem limite" de rota é ESCOLHA, não ausência: `null` valeria o padrão (1,5×) na comparação do registro. */
const SEM_LIMITE = 'SEM_LIMITE';

/** Números do registro (o kernel só guarda primitivos). */
function numeroDe(e: EscolhasDoLancamento | undefined, k: string): number | null {
  return e && typeof e[k] === 'number' ? (e[k] as number) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ÁGUA
// ═══════════════════════════════════════════════════════════════════════════

/** As faixas da água no forro (`agua.noForro`). */
export type ForroDaAgua = NonNullable<HipotesesDaAguaCompleta['agua']['noForro']>;

/**
 * As premissas da água com que se lança: as do estudo e, opcional, o FORRO DA CASA (correção 1) — o forro com que a Casa
 * Automática lançaria a água, das premissas da casa do estudo. Só é usado para a água no forro lançada antes do registro.
 */
export type HipotesesDaAguaDoLancamento = HipotesesDaAguaCompleta & { forroDaCasa?: ForroDaAguaDaCasa | null };

/**
 * O forro da água da casa, como o editor o monta das premissas do estudo (`forroDaAguaDaCasa`): as faixas, o REBAIXO
 * (correção 2: parte da assinatura da casa) e a FAIXA DA QUENTE no mundo (`faixaDaAguaQuenteDaCasa`, correção 2: sem ela
 * a quente refeita corria no eixo das paredes, cruzando a fria e a estrutura).
 */
export type ForroDaAguaDaCasa = ForroDaAgua & {
  rebaixoMm?: number;
  faixaDaAguaQuente?: { x: number; y: number } | null;
  /** Correção 2 (I4): onde o alimentador da casa sobe quando o estudo não diz (`SUBIDA_DO_ALIMENTADOR_DA_CASA`). */
  subidaDoAlimentador?: 'FACHADA' | 'SOB_A_CAIXA' | null;
};

/** O que a casa ajustou DEPOIS de lançar e que não é premissa do estudo (F18: o alimentador por cima do esgoto). */
export interface AjustesDaAgua {
  /** A cota em que o alimentador enterrado foi relançado para cruzar o esgoto e o pluvial por cima, mm. */
  cotaEnterradaAjustadaMm?: number | null;
}

/**
 * As escolhas da água, achatadas para o registro. Com rótulo: as premissas da gaveta e da tela "Dimensionamento da
 * água" que mudam a rede. Sem rótulo (só a casa as tem): o forro, a faixa da quente, a subida do alimentador e o ajuste
 * da cota enterrada — o que `lancamentoDaAgua` devolve ao relançar.
 */
export function escolhasDaAgua(h: HipotesesDaAguaCompleta, ajustes: AjustesDaAgua = {}): EscolhasDoLancamento {
  const a = h.agua;
  const forro = a.noForro ?? null;
  const faixa = a.faixaDaAguaQuente ?? null;
  return {
    velocidadeMaxMs: a.velocidadeMaxMs,
    dnMinimoAguaFriaMm: a.dnMinimoAguaFriaMm,
    dnMinimoAguaQuenteMm: a.dnMinimoAguaQuenteMm,
    // Correção 2 (I3): com o forro ativo, o planejador ignora a cota do ramal (o ramal corre na faixa) — compará-la
    // acenderia um aviso que relançar não resolve. Como a rota máxima dos eletrodutos no forro.
    ...(forro && a.pelasParedes !== false ? {} : { cotaRamalMm: a.cotaRamalMm }),
    raioDaColunaMm: a.raioDaColunaMm,
    raioDoShaftMm: a.raioDoShaftMm ?? 3000,
    rotaMaximaVezes: a.rotaMaximaVezes ?? SEM_LIMITE,
    pelasParedes: a.pelasParedes !== false,
    raioDeEncaixeMm: a.raioDeEncaixeMm ?? 700,
    laminaDaguaMm: h.pressao.laminaDaguaMm,
    perdaDoAquecedorKpa: h.pressao.perdaDoAquecedorKpa,
    ajusteDaVrpKpa: h.pressao.ajusteDaVrpKpa,
    pressaoMinimaKpa: h.pressao.pressaoMinimaKpa,
    ganhoDoPressurizadorKpa: h.pressao.ganhoDoPressurizadorKpa,
    qMaxDoHidrometroM3h: h.pressao.qMaxDoHidrometroM3h,
    cotaEnterradaMm: h.alimentacao.cotaEnterradaMm,
    velocidadeDoAlimentadorMs: h.alimentacao.velocidadeMaxMs,
    dnMinimoDoAlimentadorMm: h.alimentacao.dnMinimoMm,
    pessoasPorDormitorio: h.reservatorio.pessoasPorDormitorio,
    pessoasPorDependencia: h.reservatorio.pessoasPorDependencia,
    perCapitaLDia: h.reservatorio.perCapitaLDia,
    populacaoDeclarada: h.reservatorio.populacaoDeclarada,
    horasDeFuncionamento: h.recalque.horasDeFuncionamento,
    cotaDoPercursoMm: h.recalque.cotaDoPercursoMm,
    // Sem rótulo — o que só a casa decide.
    ...(forro
      ? {
          forroFriaAbaixoDoTetoMm: forro.aguaFria.abaixoDoTetoMm,
          forroFriaAfastamentoDaFaceMm: forro.aguaFria.afastamentoDaFaceMm,
          forroFriaDegrauNaParedeMm: forro.aguaFria.degrauNaParedeMm ?? 0,
          forroQuenteAbaixoDoTetoMm: forro.aguaQuente.abaixoDoTetoMm,
          forroQuenteAfastamentoDaFaceMm: forro.aguaQuente.afastamentoDaFaceMm,
          forroQuenteDegrauNaParedeMm: forro.aguaQuente.degrauNaParedeMm ?? 0,
          forroFolgaSobAVigaMm: forro.folgaSobAVigaMm,
        }
      : {}),
    ...(faixa ? { faixaDaAguaQuenteX: faixa.x, faixaDaAguaQuenteY: faixa.y } : {}),
    ...(h.alimentacao.subida ? { subidaDoAlimentador: h.alimentacao.subida } : {}),
    ...(ajustes.cotaEnterradaAjustadaMm != null ? { cotaEnterradaAjustadaMm: ajustes.cotaEnterradaAjustadaMm } : {}),
  };
}

/** Rótulos (na ordem do aviso), formatadores (só o VALOR) e padrões das escolhas da água. */
export const ESCOLHAS_DA_AGUA: OpcoesDaComparacao = {
  rotulos: {
    velocidadeMaxMs: 'Velocidade máxima na rede',
    dnMinimoAguaFriaMm: 'DN mínimo da água fria',
    dnMinimoAguaQuenteMm: 'DN mínimo da água quente',
    cotaRamalMm: 'Cota do ramal',
    raioDaColunaMm: 'Raio que junta os pontos numa coluna',
    raioDoShaftMm: 'Raio em que o shaft atrai a coluna',
    rotaMaximaVezes: 'Rota máxima do ramal',
    pelasParedes: 'Traçado dos ramais',
    raioDeEncaixeMm: 'Encaixe do ramal na parede até',
    laminaDaguaMm: 'Lâmina d’água (pressão)',
    perdaDoAquecedorKpa: 'Perda do aquecedor (pressão)',
    ajusteDaVrpKpa: 'Ajuste da VRP (pressão)',
    pressaoMinimaKpa: 'Pressão mínima nos pontos',
    ganhoDoPressurizadorKpa: 'Ganho do pressurizador',
    qMaxDoHidrometroM3h: 'Vazão máxima do hidrômetro',
    cotaEnterradaMm: 'Cota do alimentador enterrado',
    velocidadeDoAlimentadorMs: 'Velocidade máxima no alimentador',
    dnMinimoDoAlimentadorMm: 'DN mínimo do alimentador',
    pessoasPorDormitorio: 'Pessoas por dormitório (reservação)',
    pessoasPorDependencia: 'Pessoas por dependência (reservação)',
    perCapitaLDia: 'Consumo per capita (reservação)',
    populacaoDeclarada: 'População declarada (reservação)',
    horasDeFuncionamento: 'Funcionamento da bomba de recalque',
    cotaDoPercursoMm: 'Cota do percurso do recalque',
  },
  valores: {
    velocidadeMaxMs: (v) => `${num(v)} m/s`,
    dnMinimoAguaFriaMm: dn,
    dnMinimoAguaQuenteMm: dn,
    cotaRamalMm: mm,
    raioDaColunaMm: mm,
    raioDoShaftMm: mm,
    rotaMaximaVezes: (v) => (typeof v === 'number' ? `${num(v)}× a linha reta` : 'sem limite'),
    pelasParedes: (v) => (v ? 'pelas paredes' : 'reto'),
    raioDeEncaixeMm: mm,
    laminaDaguaMm: mm,
    perdaDoAquecedorKpa: kpa,
    ajusteDaVrpKpa: kpa,
    pressaoMinimaKpa: kpa,
    ganhoDoPressurizadorKpa: kpa,
    qMaxDoHidrometroM3h: (v) => `${num(v)} m³/h`,
    cotaEnterradaMm: mm,
    velocidadeDoAlimentadorMs: (v) => `${num(v)} m/s`,
    dnMinimoDoAlimentadorMm: dn,
    perCapitaLDia: (v) => `${num(v)} L/dia`,
    populacaoDeclarada: (v) => (v === 0 ? 'contada pelos dormitórios' : `${num(v)} pessoa(s)`),
    horasDeFuncionamento: (v) => `${num(v)} h/dia`,
    cotaDoPercursoMm: mm,
  },
  padroes: {
    velocidadeMaxMs: HIPOTESES_AGUA_PADRAO.velocidadeMaxMs,
    dnMinimoAguaFriaMm: HIPOTESES_AGUA_PADRAO.dnMinimoAguaFriaMm,
    dnMinimoAguaQuenteMm: HIPOTESES_AGUA_PADRAO.dnMinimoAguaQuenteMm,
    cotaRamalMm: HIPOTESES_AGUA_PADRAO.cotaRamalMm,
    raioDaColunaMm: HIPOTESES_AGUA_PADRAO.raioDaColunaMm,
    raioDoShaftMm: HIPOTESES_AGUA_PADRAO.raioDoShaftMm ?? 3000,
    rotaMaximaVezes: HIPOTESES_AGUA_PADRAO.rotaMaximaVezes ?? SEM_LIMITE,
    pelasParedes: HIPOTESES_AGUA_PADRAO.pelasParedes !== false,
    raioDeEncaixeMm: HIPOTESES_AGUA_PADRAO.raioDeEncaixeMm ?? 700,
    laminaDaguaMm: HIPOTESES_PRESSAO_PADRAO.laminaDaguaMm,
    perdaDoAquecedorKpa: HIPOTESES_PRESSAO_PADRAO.perdaDoAquecedorKpa,
    ajusteDaVrpKpa: HIPOTESES_PRESSAO_PADRAO.ajusteDaVrpKpa,
    pressaoMinimaKpa: HIPOTESES_PRESSAO_PADRAO.pressaoMinimaKpa,
    ganhoDoPressurizadorKpa: HIPOTESES_PRESSAO_PADRAO.ganhoDoPressurizadorKpa,
    qMaxDoHidrometroM3h: HIPOTESES_PRESSAO_PADRAO.qMaxDoHidrometroM3h,
    cotaEnterradaMm: HIPOTESES_ALIMENTACAO_PADRAO.cotaEnterradaMm,
    velocidadeDoAlimentadorMs: HIPOTESES_ALIMENTACAO_PADRAO.velocidadeMaxMs,
    dnMinimoDoAlimentadorMm: HIPOTESES_ALIMENTACAO_PADRAO.dnMinimoMm,
    pessoasPorDormitorio: HIPOTESES_RESERVATORIO_PADRAO.pessoasPorDormitorio,
    pessoasPorDependencia: HIPOTESES_RESERVATORIO_PADRAO.pessoasPorDependencia,
    perCapitaLDia: HIPOTESES_RESERVATORIO_PADRAO.perCapitaLDia,
    populacaoDeclarada: HIPOTESES_RESERVATORIO_PADRAO.populacaoDeclarada,
    horasDeFuncionamento: HIPOTESES_RECALQUE_PADRAO.horasDeFuncionamento,
    cotaDoPercursoMm: HIPOTESES_RECALQUE_PADRAO.cotaDoPercursoMm,
  },
};

/**
 * As hipóteses com que a água se LANÇA agora e as escolhas que esse lançamento registra: as do estudo (`h`) mais o que
 * a casa decidiu e o registro guardou — o forro e a faixa da quente (quando o estudo não os tem), a subida do
 * alimentador (quando o estudo não diz) e a cota enterrada ajustada (enquanto a cota do estudo for a mesma com que a casa
 * lançou; mudou a premissa, vale a nova). Sem registro: `h` como veio.
 */
export function lancamentoDaAgua<H extends HipotesesDaAguaDoLancamento>(model: BlueprintModel, h: H): { hip: H; escolhas: EscolhasDoLancamento } {
  const e = registroDe(model, 'AGUA', null)?.escolhas;
  if (!e) {
    // Correção 1: sem registro, a água que já está no forro relança no forro da casa (se o editor o deu) — correção 2:
    // só se a rede antiga tiver a ASSINATURA da casa (`forroDaCasaQueValeNaAgua`); a faixa da quente vai junto.
    const daCasa = h.agua.noForro ? null : forroDaCasaQueValeNaAgua(model, h);
    if (daCasa) {
      // Com o forro, o que mais a casa decidiu e o estudo não diz: a faixa da quente e a subida do alimentador. Medido na
      // casa da revisão (I4): sem os dois, a água refeita tinha +3 conflitos com a estrutura e +1 de rede.
      const comForro = {
        ...h,
        agua: { ...h.agua, noForro: daCasa.noForro, ...(!h.agua.faixaDaAguaQuente && daCasa.faixaDaAguaQuente ? { faixaDaAguaQuente: daCasa.faixaDaAguaQuente } : {}) },
        alimentacao: !h.alimentacao.subida && daCasa.subidaDoAlimentador ? { ...h.alimentacao, subida: daCasa.subidaDoAlimentador } : h.alimentacao,
      } as H;
      return { hip: comForro, escolhas: escolhasDaAgua(comForro) };
    }
    return { hip: h, escolhas: escolhasDaAgua(h) };
  }
  const n = (k: string) => numeroDe(e, k);
  let agua = h.agua;
  if (!agua.noForro) {
    const fA = n('forroFriaAbaixoDoTetoMm');
    const fF = n('forroFriaAfastamentoDaFaceMm');
    const qA = n('forroQuenteAbaixoDoTetoMm');
    const qF = n('forroQuenteAfastamentoDaFaceMm');
    const folga = n('forroFolgaSobAVigaMm');
    if (fA != null && fF != null && qA != null && qF != null && folga != null) {
      agua = {
        ...agua,
        noForro: {
          aguaFria: { abaixoDoTetoMm: fA, afastamentoDaFaceMm: fF, degrauNaParedeMm: n('forroFriaDegrauNaParedeMm') ?? 0 },
          aguaQuente: { abaixoDoTetoMm: qA, afastamentoDaFaceMm: qF, degrauNaParedeMm: n('forroQuenteDegrauNaParedeMm') ?? 0 },
          folgaSobAVigaMm: folga,
        },
      };
    }
  }
  if (!agua.faixaDaAguaQuente) {
    const x = n('faixaDaAguaQuenteX');
    const y = n('faixaDaAguaQuenteY');
    if (x != null && y != null) agua = { ...agua, faixaDaAguaQuente: { x, y } };
  }
  let alimentacao = h.alimentacao;
  const subida = e.subidaDoAlimentador;
  if (!alimentacao.subida && (subida === 'FACHADA' || subida === 'SOB_A_CAIXA')) alimentacao = { ...alimentacao, subida };
  // O estudo, completado: é o que se registra (a cota enterrada com rótulo continua a do estudo).
  const base = { ...h, agua, alimentacao } as H;
  const ajustada = n('cotaEnterradaAjustadaMm');
  const ajusteVale = ajustada != null && n('cotaEnterradaMm') === h.alimentacao.cotaEnterradaMm;
  const escolhas = escolhasDaAgua(base, { cotaEnterradaAjustadaMm: ajusteVale ? ajustada : null });
  const hip = ajusteVale ? ({ ...base, alimentacao: { ...base.alimentacao, cotaEnterradaMm: ajustada! } } as H) : base;
  return { hip, escolhas };
}

/** Regra B: o que mudou desde o lançamento da água. Sem registro → `[]`. */
export function diferencasDaAgua(model: BlueprintModel, h: HipotesesDaAguaDoLancamento): DiferencaDeEscolha[] {
  return diferencasDasEscolhas(registroDe(model, 'AGUA', null)?.escolhas ?? null, lancamentoDaAgua(model, h).escolhas, ESCOLHAS_DA_AGUA);
}

/** A rede de água do sistema — o que o Refazer apaga (ver o critério no cabeçalho). */
export function redeDaAguaDoSistema(model: BlueprintModel): { trechos: Trecho[]; pecas: Terminal[] } {
  const ligados = new Set<ObjectId>();
  for (const { origem, disciplina } of origensDeAgua(model)) for (const t of redeDaOrigem(model, origem, disciplina)) ligados.add(t.id);
  const trechos = (model.trechos ?? []).filter(
    (t) => (t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE') && (ligados.has(t.id) || FORA_DA_DISTRIBUICAO.has(t.rotulo ?? '')),
  );
  // As PEÇAS EM LINHA sobre um tubo que sai (registros, válvulas, conexões — a do motor, como o registro da limpeza, ou
  // as postas à mão): sem o tubo ficariam soltas, e a rede relançada traz as dela (correção 2, menor 8).
  const pecas = (model.terminais ?? []).filter(
    (x) => (x.disciplina === 'AGUA_FRIA' || x.disciplina === 'AGUA_QUENTE') && PECAS_EM_LINHA.has(x.tipoHidraulico ?? '') && trechos.some((t) => sobreOTubo(x, t)),
  );
  return { trechos, pecas };
}

/** As peças que só existem em cima de um tubo (o hidrômetro não: é a âncora do alimentador e fica). */
const PECAS_EM_LINHA = new Set(['REGISTRO_GAVETA', 'REGISTRO_PRESSAO', 'REGISTRO_ESFERA', 'VALVULA_RETENCAO', 'VRP', 'CONEXAO_TE', 'CONEXAO_LUVA', 'CONEXAO_REDUCAO']);

/** A peça está sobre o tubo (no mesmo pavimento, a até 1 mm do eixo, em 3D)? Exportada para o esgoto (F4). */
export function sobreOTubo(x: Terminal, t: Trecho): boolean {
  if (x.levelId !== t.levelId) return false;
  const a = [t.a.x, t.a.y, t.cotaAMm];
  const d = [t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm];
  const p = [x.at.x - a[0], x.at.y - a[1], x.cotaMm - a[2]];
  const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const k = L2 === 0 ? 0 : Math.max(0, Math.min(1, (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / L2));
  return Math.hypot(p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]) <= 1;
}

/** O motivo de a água não relançar por aqui (rede antiga da casa no forro, sem registro). */
export const MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO = 'Água no forro lançada antes do registro — relançar aqui a tiraria do forro.';

/**
 * Água no FORRO lançada antes do registro (a Casa Automática de antes): sem registro não há como saber as faixas, e
 * relançar com as premissas do estudo desceria os ramais para a cota do painel. O sinal, como nos eletrodutos: um tubo
 * HORIZONTAL da distribuição (não a saída até a face da peça) num pavimento com FORRO de verdade (ambiente com rebaixo),
 * acima da face mais baixa dele, a menos de 60 cm do teto (estrito) e fora da cota do ramal do estudo. O barrilete fora
 * do forro não cai aqui: corre no teto (cota = teto), sobre a laje ou abaixo da viga.
 */
export function aguaNoForroSemRegistro(model: BlueprintModel, cotaRamalMm: number = HIPOTESES_AGUA_PADRAO.cotaRamalMm): boolean {
  return horizontaisDaAguaNoForro(model, cotaRamalMm).length > 0;
}

/** Os horizontais da distribuição que correm no forro, sem registro (a detecção comum com os eletrodutos). */
export function horizontaisDaAguaNoForro(model: BlueprintModel, cotaRamalMm: number = HIPOTESES_AGUA_PADRAO.cotaRamalMm): Trecho[] {
  if (registroDe(model, 'AGUA', null)) return [];
  return horizontaisDaDistribuicaoNoForro(model, cotaRamalMm);
}

/** Os horizontais da distribuição no forro, COM ou sem registro da água (a mesma detecção). */
function horizontaisDaDistribuicaoNoForro(model: BlueprintModel, cotaRamalMm: number): Trecho[] {
  const distribuicao = redeDaAguaDoSistema(model).trechos.filter((t) => !FORA_DA_DISTRIBUICAO.has(t.rotulo ?? ''));
  return horizontaisNoForro(model, distribuicao, (_l, teto) => Math.min(cotaRamalMm, teto));
}

/**
 * F4 (esgoto, 24/10/2026): a planta é uma casa da Casa Automática? O sinal é a ÁGUA no forro da casa — com o registro da
 * água ou sem ele (a água relançada pelo editor continua nas faixas da casa). `noForro` = há água no forro de verdade;
 * `daCasa` = e ela tem a ASSINATURA da casa (`temAssinaturaDaCasa`, a mesma decisão da água e dos eletrodutos); `porque`
 * = por que não tem (o primeiro critério que falhou), ou `null`. Sem o forro da casa (`forro` nulo): `daCasa` falso.
 */
export function aguaNoForroDaCasa(model: BlueprintModel, forro: ForroDaAguaDaCasa | null | undefined, cotaRamalMm: number = HIPOTESES_AGUA_PADRAO.cotaRamalMm): { noForro: boolean; daCasa: boolean; porque: string | null } {
  const horizontais = horizontaisDaDistribuicaoNoForro(model, cotaRamalMm);
  if (!horizontais.length) return { noForro: false, daCasa: false, porque: null };
  if (!forro || forro.rebaixoMm == null) return { noForro: true, daCasa: false, porque: null };
  const porque = motivoSemAssinaturaDaCasa(model, horizontais, assinaturaDaAgua(forro, forro.rebaixoMm));
  return { noForro: true, daCasa: porque === null, porque };
}

/**
 * Correção 2 (24/10/2026, revisão): o forro da casa SÓ vale para a água antiga com a ASSINATURA da casa — todo horizontal
 * no forro numa faixa da fria ou da quente dela, e os ambientes com o rebaixo do forro dela (`temAssinaturaDaCasa`, a
 * MESMA decisão dos eletrodutos). Sem a assinatura (planta sem casa, ramal à mão acima da face do forro): `null`.
 */
export function forroDaCasaQueValeNaAgua(
  model: BlueprintModel,
  h: Pick<HipotesesDaAguaDoLancamento, 'agua' | 'forroDaCasa'>,
): { noForro: ForroDaAgua; faixaDaAguaQuente: { x: number; y: number } | null; subidaDoAlimentador: 'FACHADA' | 'SOB_A_CAIXA' | null } | null {
  const f = h.forroDaCasa;
  if (!f || f.rebaixoMm == null) return null;
  const horizontais = horizontaisDaAguaNoForro(model, h.agua.cotaRamalMm);
  if (!temAssinaturaDaCasa(model, horizontais, assinaturaDaAgua(f, f.rebaixoMm))) return null;
  return { noForro: { aguaFria: f.aguaFria, aguaQuente: f.aguaQuente, folgaSobAVigaMm: f.folgaSobAVigaMm }, faixaDaAguaQuente: f.faixaDaAguaQuente ?? null, subidaDoAlimentador: f.subidaDoAlimentador ?? null };
}

/**
 * A assinatura da água (correção 3): o horizontal da FRIA confere com a faixa da fria, o da QUENTE com a da quente — antes
 * qualquer um valia com qualquer das duas.
 */
function assinaturaDaAgua(f: ForroDaAgua, rebaixoMm: number) {
  return { faixas: [f.aguaFria, f.aguaQuente], faixasPorDisciplina: { AGUA_FRIA: [f.aguaFria], AGUA_QUENTE: [f.aguaQuente] }, rebaixoMm };
}

/** Por que a água não relança por aqui (`null` = relança). Com o forro da casa E a assinatura dela, relança no forro. */
export function motivoParaNaoRelancarAgua(model: BlueprintModel, h?: Pick<HipotesesDaAguaDoLancamento, 'agua' | 'forroDaCasa'>): string | null {
  const cota = h?.agua.cotaRamalMm;
  if (!aguaNoForroSemRegistro(model, cota)) return null;
  if (h && forroDaCasaQueValeNaAgua(model, h)) return null;
  // Correção 3: com as premissas da casa, diz POR QUE a água não é da casa (e o que fazer).
  const f = h?.forroDaCasa;
  const porque = f && f.rebaixoMm != null ? motivoSemAssinaturaDaCasa(model, horizontaisDaAguaNoForro(model, cota), assinaturaDaAgua(f, f.rebaixoMm)) : null;
  return porque ? `${MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO} ${porque}` : MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO;
}

/**
 * O REGISTRO no lote de lançar (o "Lançar tudo" e os botões de cada origem): vai junto — exceto quando SOBRA rede de
 * água lançada antes com outras escolhas (ou sem registro). Aí o registro antigo fica e o aviso continua aceso: ligar
 * um ponto novo não "aceita" a rede antiga (correção 1 da F2).
 */
export function comRegistroDaAgua(model: BlueprintModel, comandos: readonly Command[], h: HipotesesDaAguaDoLancamento): Command[] {
  if (comandos.length === 0) return [];
  const apagados = new Set(comandos.flatMap((c) => (c.type === 'DeleteTrecho' ? [c.trechoId] : [])));
  const sobra = redeDaAguaDoSistema(model).trechos.some((t) => !apagados.has(t.id));
  const registrar = !sobra || (!!registroDe(model, 'AGUA', null) && diferencasDaAgua(model, h).length === 0);
  return registrar ? [...comandos, comandoDeRegistro('AGUA', null, lancamentoDaAgua(model, h).escolhas)] : [...comandos];
}

/**
 * REFAZER a água: apaga a rede do sistema (confirmada inclusive) e lança de novo, com as escolhas atuais (e o forro do
 * registro), num lote só — o registro no mesmo lote (Ctrl+Z volta tudo). Se o relançamento não lançar nada (não sobrou
 * ponto nem caixa), o registro sai. Rede no forro sem registro: nada (quem chama mostra o motivo). Recusa do kernel lança
 * `KernelError` — quem chama decide o que dizer.
 */
export function comandosDeRefazerAgua(
  model: BlueprintModel,
  h: HipotesesDaAguaDoLancamento,
  terreno: LeitorDoTerreno | null = null,
): { comandos: Command[]; plano: PlanoDaAguaCompleta | null } {
  if (motivoParaNaoRelancarAgua(model, h)) return { comandos: [], plano: null };
  const { hip, escolhas } = lancamentoDaAgua(model, h);
  const rede = redeDaAguaDoSistema(model);
  const apagar: Command[] = [
    ...rede.trechos.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...rede.pecas.map((x): Command => ({ type: 'DeleteTerminal', terminalId: x.id })),
  ];
  const plano = planejarAguaCompleta(apagar.length ? applyBatch(model, apagar).model : model, hip, terreno);
  if (apagar.length === 0 && plano.comandos.length === 0) return { comandos: [], plano };
  const registro: Command = plano.comandos.length ? comandoDeRegistro('AGUA', null, escolhas) : { type: 'ApagarRegistroDeLancamento', motor: 'AGUA', alvoId: null };
  return { comandos: [...apagar, ...plano.comandos, registro], plano };
}

/** O que o Refazer da água apaga — para a confirmação dizer quanto será refeito e o que mudou. */
export interface RedeHidraulicaARefazer {
  tubos: number;
  tubosConfirmados: number;
  pecas: number;
  pecasAceitas: number;
  /** As partes com nome que serão refeitas, com a contagem de tubos ("alimentador (5)"). Correção 2, menor 5. */
  partes: string[];
  /** As peças que saem, por nome e quantidade ("2 registro(s) de gaveta"); a VRP com o alerta. Correção 3. */
  pecasPorNome: string[];
  /** O que mudou desde o lançamento (`textoDasDiferencas`); `null` = sem registro ou nada mudou. */
  mudou: string | null;
}

/** O nome de cada peça em linha na confirmação. A VRP leva o alerta: muda a pressão e o motor não a repõe. */
const NOME_DA_PECA: Record<string, string> = {
  REGISTRO_GAVETA: 'registro(s) de gaveta',
  REGISTRO_PRESSAO: 'registro(s) de pressão',
  REGISTRO_ESFERA: 'registro(s) de esfera',
  VALVULA_RETENCAO: 'válvula(s) de retenção',
  VRP: 'VRP (muda a pressão calculada; o motor não a repõe)',
  CONEXAO_TE: 'tê(s)',
  CONEXAO_LUVA: 'luva(s)',
  CONEXAO_REDUCAO: 'redução(ões)',
};

const PARTES_DA_AGUA: [string, readonly string[]][] = [
  ['alimentador', ['Alimentador']],
  ['recalque', ['Sucção', 'Recalque']],
  ['extravasor', ['Extravasor']],
  ['limpeza', ['Limpeza']],
];

export function aguaARefazer(model: BlueprintModel, h: HipotesesDaAguaDoLancamento): RedeHidraulicaARefazer {
  const rede = redeDaAguaDoSistema(model);
  const d = diferencasDaAgua(model, h);
  return {
    tubos: rede.trechos.length,
    tubosConfirmados: rede.trechos.filter((t) => !t.sugerido).length,
    pecas: rede.pecas.length,
    pecasAceitas: rede.pecas.filter((x) => !x.sugerida).length,
    pecasPorNome: Object.entries(NOME_DA_PECA).flatMap(([tipo, nome]) => {
      const n = rede.pecas.filter((x) => x.tipoHidraulico === tipo).length;
      return n ? [`${n} ${nome}`] : [];
    }),
    partes: PARTES_DA_AGUA.flatMap(([nome, rotulos]) => {
      const n = rede.trechos.filter((t) => rotulos.includes(t.rotulo ?? '')).length;
      return n ? [`${nome} (${n})`] : [];
    }),
    mudou: d.length ? textoDasDiferencas(d) : null,
  };
}

/**
 * A lista da confirmação — `null` quando nada do que será apagado foi confirmado/aceito (só sugeridos: refaz direto).
 * Ex.: "Água: 34 tubo(s) (12 confirmado(s)) e 1 peça(s) (1 aceita(s)). O que mudou: Traçado dos ramais — lançado com:
 * pelas paredes · agora: reto."
 */
export function textoDaConfirmacaoDoSistema(sistema: string, r: RedeHidraulicaARefazer): string | null {
  if (r.tubosConfirmados === 0 && r.pecasAceitas === 0) return null;
  const tubos = `${r.tubos} tubo(s)${r.tubosConfirmados ? ` (${r.tubosConfirmados} confirmado(s))` : ''}${r.partes.length ? `, inclusive ${r.partes.join(', ')}` : ''}`;
  const pecas = r.pecas ? ` e ${r.pecas} peça(s)${r.pecasAceitas ? ` (${r.pecasAceitas} aceita(s))` : ''}${r.pecasPorNome.length ? `: ${r.pecasPorNome.join(', ')}` : ''}` : '';
  return `${sistema}: ${tubos}${pecas}.${r.mudou ? ` O que mudou: ${r.mudou}.` : ''}`;
}

/** O botão principal do rodapé de um sistema. `motivo` não nulo = desligado, e é o `title` dele. */
export interface BotaoDoSistema {
  /** `LANCAR` = o "Lançar tudo" de sempre; `RELANCAR` = refaz o sistema com as escolhas atuais. */
  modo: 'LANCAR' | 'RELANCAR';
  motivo: string | null;
}

/**
 * REGRA A, comum à água e ao pluvial: há o que lançar → `LANCAR`; nada a lançar e rede existente → `RELANCAR` ("Relançar
 * com as escolhas atuais"); nada → desligado, dizendo por quê (a pendência do plano, ou `nada`).
 */
function botaoDoSistema(plano: { comandos: Command[]; pendencias: string[] } | null, temRede: boolean, nada: string, bloqueio: string | null): BotaoDoSistema {
  if (bloqueio) return { modo: 'LANCAR', motivo: bloqueio };
  if (plano && plano.comandos.length > 0) return { modo: 'LANCAR', motivo: null };
  if (temRede) return { modo: 'RELANCAR', motivo: null };
  return { modo: 'LANCAR', motivo: plano?.pendencias[0] ?? nada };
}

export function botaoDeLancarAgua(model: BlueprintModel, plano: { comandos: Command[]; pendencias: string[] } | null, h?: Pick<HipotesesDaAguaDoLancamento, 'agua' | 'forroDaCasa'>): BotaoDoSistema {
  return botaoDoSistema(plano, redeDaAguaDoSistema(model).trechos.length > 0, 'Nada a lançar: não há ponto de água a ligar.', motivoParaNaoRelancarAgua(model, h));
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUVIAL
// ═══════════════════════════════════════════════════════════════════════════

/** O que a casa ajustou depois de lançar o pluvial (F18: o condutor enterrado por cima do esgoto). */
export interface AjustesDoPluvial {
  profundidadeAjustadaDoCondutorMm?: number | null;
}

/** Sem cidade nem intensidade informada: a norma deixa adotar 150 mm/h até 100 m² de projeção (5.1.4). */
const ATE_100M2 = 'ATE_100M2';

/** A intensidade que muda as calhas: a informada, senão a da tabela pela cidade e período; senão `ATE_100M2`. */
function intensidadeDoRegistro(h: HipotesesPluviais): ValorDeEscolha {
  if (h.intensidadeMmH != null && h.intensidadeMmH > 0) return h.intensidadeMmH;
  const linha = h.cidade ? INTENSIDADE_POR_CIDADE[h.cidade] : undefined;
  return linha ? linha[h.periodoDeRetornoAnos] : ATE_100M2;
}

/** As escolhas do pluvial, achatadas. Sem rótulo: a profundidade ajustada pela casa. */
export function escolhasDoPluvial(h: HipotesesPluviais, ajustes: AjustesDoPluvial = {}): EscolhasDoLancamento {
  return {
    intensidadeMmH: intensidadeDoRegistro(h),
    secaoDaCalha: h.secaoDaCalha,
    materialDaCalha: h.materialDaCalha,
    declividadeDaCalhaPct: h.declividadeDaCalhaPct,
    declividadeDoCondutorPct: h.declividadeDoCondutorPct,
    profundidadeDoCondutorMm: h.profundidadeDoCondutorMm,
    afastamentoDoCondutorDaCasaMm: h.afastamentoDoCondutorDaCasaMm ?? 300,
    ...(ajustes.profundidadeAjustadaDoCondutorMm != null ? { profundidadeAjustadaDoCondutorMm: ajustes.profundidadeAjustadaDoCondutorMm } : {}),
  };
}

export const ESCOLHAS_DO_PLUVIAL: OpcoesDaComparacao = {
  rotulos: {
    intensidadeMmH: 'Intensidade pluviométrica',
    secaoDaCalha: 'Seção da calha',
    materialDaCalha: 'Material da calha',
    declividadeDaCalhaPct: 'Declividade da calha',
    declividadeDoCondutorPct: 'Declividade do condutor horizontal',
    profundidadeDoCondutorMm: 'Profundidade do condutor enterrado',
    afastamentoDoCondutorDaCasaMm: 'Afastamento do condutor enterrado',
  },
  valores: {
    intensidadeMmH: (v) => (typeof v === 'number' ? `${num(v)} mm/h` : 'sem cidade (150 mm/h até 100 m²)'),
    secaoDaCalha: (v) => (v === 'RETANGULAR' ? 'retangular' : 'meia-cana'),
    materialDaCalha: (v) => RUGOSIDADE_DA_CALHA[String(v)]?.rotulo.toLowerCase() ?? String(v),
    declividadeDaCalhaPct: (v) => `${num(v)} %`,
    declividadeDoCondutorPct: (v) => `${num(v)} %`,
    profundidadeDoCondutorMm: mm,
    afastamentoDoCondutorDaCasaMm: mm,
  },
  padroes: {
    intensidadeMmH: intensidadeDoRegistro(HIPOTESES_PLUVIAIS_PADRAO),
    secaoDaCalha: HIPOTESES_PLUVIAIS_PADRAO.secaoDaCalha,
    materialDaCalha: HIPOTESES_PLUVIAIS_PADRAO.materialDaCalha,
    declividadeDaCalhaPct: HIPOTESES_PLUVIAIS_PADRAO.declividadeDaCalhaPct,
    declividadeDoCondutorPct: HIPOTESES_PLUVIAIS_PADRAO.declividadeDoCondutorPct,
    profundidadeDoCondutorMm: HIPOTESES_PLUVIAIS_PADRAO.profundidadeDoCondutorMm,
    afastamentoDoCondutorDaCasaMm: HIPOTESES_PLUVIAIS_PADRAO.afastamentoDoCondutorDaCasaMm ?? 300,
  },
};

/**
 * As hipóteses com que o pluvial se lança agora e as escolhas que esse lançamento registra: as do estudo e, enquanto a
 * profundidade do estudo for a mesma com que a casa lançou, a profundidade que ela ajustou (F18).
 */
export function lancamentoDoPluvial(model: Pick<BlueprintModel, 'registrosDeLancamento'>, h: HipotesesPluviais): { hip: HipotesesPluviais; escolhas: EscolhasDoLancamento } {
  const e = registroDe(model, 'PLUVIAL', null)?.escolhas;
  const ajustada = numeroDe(e, 'profundidadeAjustadaDoCondutorMm');
  const ajusteVale = ajustada != null && numeroDe(e, 'profundidadeDoCondutorMm') === h.profundidadeDoCondutorMm;
  return {
    hip: ajusteVale ? { ...h, profundidadeDoCondutorMm: ajustada! } : h,
    escolhas: escolhasDoPluvial(h, { profundidadeAjustadaDoCondutorMm: ajusteVale ? ajustada : null }),
  };
}

export function diferencasDoPluvial(model: BlueprintModel, h: HipotesesPluviais): DiferencaDeEscolha[] {
  return diferencasDasEscolhas(registroDe(model, 'PLUVIAL', null)?.escolhas ?? null, lancamentoDoPluvial(model, h).escolhas, ESCOLHAS_DO_PLUVIAL);
}

const ROTULOS_DO_PLUVIAL = new Set([ROTULO_DA_CALHA, ROTULO_DO_CONDUTOR_VERTICAL, ROTULO_DO_CONDUTOR_HORIZONTAL]);

/** A rede pluvial do sistema — o que o Refazer apaga (ver o critério no cabeçalho). */
export function redePluvialDoSistema(model: BlueprintModel): { trechos: Trecho[]; pecas: Terminal[] } {
  return {
    // Correção 2 (menor 9): só os tubos que o MOTOR cria (calha e condutores) — o tubo pluvial desenhado à mão fica.
    trechos: (model.trechos ?? []).filter((t) => t.disciplina === 'PLUVIAL' && ROTULOS_DO_PLUVIAL.has(t.rotulo ?? '')),
    pecas: (model.terminais ?? []).filter((x) => x.tipoHidraulico === 'RALO_PLUVIAL' && x.rotulo === ROTULO_DO_BOCAL),
  };
}

/** O registro no lote de lançar do pluvial (o "Lançar tudo" e os "Lançar" das calhas e dos condutores). */
export function comRegistroDoPluvial(model: BlueprintModel, comandos: readonly Command[], h: HipotesesPluviais): Command[] {
  if (comandos.length === 0) return [];
  const apagados = new Set(comandos.flatMap((c) => (c.type === 'DeleteTrecho' ? [c.trechoId] : [])));
  const sobra = redePluvialDoSistema(model).trechos.some((t) => !apagados.has(t.id));
  const registrar = !sobra || (!!registroDe(model, 'PLUVIAL', null) && diferencasDoPluvial(model, h).length === 0);
  return registrar ? [...comandos, comandoDeRegistro('PLUVIAL', null, lancamentoDoPluvial(model, h).escolhas)] : [...comandos];
}

/** REFAZER o pluvial: apaga calhas, condutores e bocais (confirmados inclusive) e lança de novo, num lote só. */
export function comandosDeRefazerPluvial(
  model: BlueprintModel,
  h: HipotesesPluviais,
  terreno: LeitorDoTerreno | null = null,
): { comandos: Command[]; plano: PlanoDaPluvialCompleta } {
  const { hip, escolhas } = lancamentoDoPluvial(model, h);
  const rede = redePluvialDoSistema(model);
  const apagar: Command[] = [
    ...rede.trechos.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...rede.pecas.map((x): Command => ({ type: 'DeleteTerminal', terminalId: x.id })),
  ];
  const plano = planejarPluvialCompleta(apagar.length ? applyBatch(model, apagar).model : model, hip, terreno);
  if (apagar.length === 0 && plano.comandos.length === 0) return { comandos: [], plano };
  const registro: Command = plano.comandos.length ? comandoDeRegistro('PLUVIAL', null, escolhas) : { type: 'ApagarRegistroDeLancamento', motor: 'PLUVIAL', alvoId: null };
  return { comandos: [...apagar, ...plano.comandos, registro], plano };
}

export function pluvialARefazer(model: BlueprintModel, h: HipotesesPluviais): RedeHidraulicaARefazer {
  const rede = redePluvialDoSistema(model);
  const d = diferencasDoPluvial(model, h);
  return {
    tubos: rede.trechos.length,
    tubosConfirmados: rede.trechos.filter((t) => !t.sugerido).length,
    pecas: rede.pecas.length,
    pecasAceitas: rede.pecas.filter((x) => !x.sugerida).length,
    partes: [],
    pecasPorNome: [],
    mudou: d.length ? textoDasDiferencas(d) : null,
  };
}

export function botaoDeLancarPluvial(model: BlueprintModel, plano: { comandos: Command[]; pendencias: string[] } | null): BotaoDoSistema {
  return botaoDoSistema(plano, redePluvialDoSistema(model).trechos.length > 0, 'Nada a lançar: não há calha nem condutor a lançar.', null);
}
