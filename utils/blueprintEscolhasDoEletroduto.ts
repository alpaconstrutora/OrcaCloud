/**
 * ELETRODUTOS — COM QUE ESCOLHAS A REDE FOI LANÇADA, E O QUE FAZER QUANDO ELAS MUDAM (F2 do plano
 * `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026).
 *
 * Pedido (sessão 9e26b316, 24/10/2026):
 * > *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto
 * > para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e
 * > incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*
 *
 * Decisão do usuário (mesma sessão): rede já aceita + escolha mudou → refaz tudo, PEDINDO CONFIRMAÇÃO.
 *
 * Aqui mora, num lugar só, o que o motor dos eletrodutos registra e como diz cada escolha:
 * - `escolhasDoEletroduto`: as escolhas achatadas (o painel e as hipóteses elétricas do estudo que mudam a bitola);
 * - `ESCOLHAS_DO_ELETRODUTO`: rótulos, formatadores e padrões para o aviso (regra B);
 * - `comandosDeLancarEletrodutos` / `comandosDeRefazerEletrodutos`: os lotes, com o registro NO MESMO lote
 *   (`RegistrarLancamento`, kernel 0.105.0) — o Ctrl+Z volta rede e registro juntos;
 * - `botaoDeLancarEletrodutos`: a regra A — com rede e nada a lançar, o botão do rodapé vira "Relançar com as escolhas
 *   atuais"; desligado, SEMPRE com o motivo;
 * - `redesARefazer` / `textoDaConfirmacaoDeRefazer`: o que será refeito, por quadro, e se precisa confirmar (só quando
 *   há trecho confirmado ou caixa aceita — só sugeridos refazem direto).
 *
 * Puro: sem React, sem banco. O alvo do registro é o QUADRO (a rede é uma por quadro).
 */
import { applyBatch, type BlueprintModel, type Command, type ObjectId, type ValorDeEscolha } from './blueprintKernel';
import {
  HIPOTESES_ELETRODUTO_PADRAO,
  caixasDaRedeDoQuadro,
  redeDoQuadro,
  refazerEletrodutos,
  relancarEletrodutos,
  type HipotesesDeEletroduto,
  type PlanoDeEletrodutos,
} from './blueprintEletrodutos';
import { HIPOTESES_PADRAO, type HipotesesEletricas } from './blueprintEletricaDimensionamento';
import {
  comandoDeRegistro,
  diferencasDasEscolhas,
  registroDe,
  type DiferencaDeEscolha,
  type EscolhasDoLancamento,
  type OpcoesDaComparacao,
} from './blueprintRegistroDeLancamento';

/**
 * As tabelas de catálogo das hipóteses elétricas que mudam a bitola (disjuntores → seção calculada; diâmetros do
 * condutor e do eletroduto → ocupação) num RESUMO estável: são listas longas, e o registro guarda só primitivos.
 * FNV-1a de 32 bits do JSON, em hexadecimal.
 */
function resumoDasTabelasEletricas(h: Pick<HipotesesEletricas, 'catalogoDeDisjuntoresA' | 'diametroExternoCondutorMm' | 'diametroInternoEletrodutoMm'>): string {
  const texto = JSON.stringify([h.catalogoDeDisjuntoresA, h.diametroExternoCondutorMm, h.diametroInternoEletrodutoMm]);
  let x = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    x ^= texto.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16).padStart(8, '0');
}
const RESUMO_DAS_TABELAS_PADRAO = resumoDasTabelasEletricas(HIPOTESES_PADRAO);

/** "Sem limite" de rota é ESCOLHA, não ausência: `null` valeria o padrão (1,5×) na comparação do registro. */
const SEM_LIMITE = 'SEM_LIMITE';

/**
 * As escolhas com que a rede é lançada, achatadas para o registro. Das hipóteses elétricas do estudo entra só o que
 * muda o eletroduto: a SEÇÃO de cada circuito sem seção declarada (`preDimensionarCircuito` → `secaoMinima`: método de
 * instalação, temperatura, agrupamento, seção mínima de TUE e o catálogo de disjuntores) e a OCUPAÇÃO (os diâmetros do
 * condutor e do eletroduto). Queda de tensão, DPS, demanda etc. não mudam a rede — trocá-los não pede relançar.
 */
export function escolhasDoEletroduto(hip: HipotesesDeEletroduto, hipEletricas: HipotesesEletricas): EscolhasDoLancamento {
  return {
    encaminhamento: hip.encaminhamento ?? 'PELA_LUZ_DO_AMBIENTE',
    caixasDePassagem: hip.caixas ? 'CAIXAS' : 'PELA_LUZ',
    rotaMaximaVezes: hip.rotaMaximaVezes ?? SEM_LIMITE,
    rotaPelaParede: hip.rotaPelaParede,
    bitolaMm: hip.bitolaMm,
    metodoDeInstalacao: hipEletricas.metodoDeInstalacao,
    temperaturaAmbienteC: hipEletricas.temperaturaAmbienteC,
    circuitosAgrupados: hipEletricas.circuitosAgrupados,
    secaoMinimaTueMm2: hipEletricas.secaoMinimaTueMm2,
    tabelasEletricas: resumoDasTabelasEletricas(hipEletricas),
  };
}

const num = (v: ValorDeEscolha) => String(v).replace('.', ',');
const DO_ESTUDO = '(hipóteses elétricas do estudo)';

/** Rótulos (na ordem do aviso), formatadores (só o VALOR) e padrões de cada escolha dos eletrodutos. */
export const ESCOLHAS_DO_ELETRODUTO: OpcoesDaComparacao = {
  rotulos: {
    caixasDePassagem: 'Caixas de passagem',
    encaminhamento: 'Encaminhamento',
    rotaMaximaVezes: 'Rota máxima até o quadro',
    rotaPelaParede: 'Pontos de parede',
    bitolaMm: 'Bitola mínima do eletroduto',
    metodoDeInstalacao: `Método de instalação ${DO_ESTUDO}`,
    temperaturaAmbienteC: `Temperatura ambiente ${DO_ESTUDO}`,
    circuitosAgrupados: `Circuitos agrupados ${DO_ESTUDO}`,
    secaoMinimaTueMm2: `Seção mínima de TUE ${DO_ESTUDO}`,
    tabelasEletricas: `Catálogos de disjuntores e diâmetros ${DO_ESTUDO}`,
  },
  valores: {
    caixasDePassagem: (v) => (v === 'CAIXAS' ? 'com caixas de passagem' : 'sem caixas (pela luz do teto)'),
    encaminhamento: (v) => (v === 'ARVORE_NO_TETO' ? 'árvore única no teto' : 'quadro → luz do ambiente → tomadas'),
    rotaMaximaVezes: (v) => (typeof v === 'number' ? `${num(v)}× a linha reta` : 'sem limite'),
    rotaPelaParede: (v) => (v ? 'pelo eixo das paredes' : 'em linha reta'),
    bitolaMm: (v) => `${num(v)} mm`,
    temperaturaAmbienteC: (v) => `${num(v)} °C`,
    secaoMinimaTueMm2: (v) => `${num(v)} mm²`,
    tabelasEletricas: (v) => (v === RESUMO_DAS_TABELAS_PADRAO ? 'as do padrão' : `editadas (ref. ${String(v)})`),
  },
  // Registro antigo sem a chave conta como lançado no padrão. Caixas: o padrão é o da PREFERÊNCIA do usuário ("pela luz
  // do teto", `catalogoLancamento.ts`), não o da hipótese do planejador.
  padroes: {
    caixasDePassagem: 'PELA_LUZ',
    encaminhamento: HIPOTESES_ELETRODUTO_PADRAO.encaminhamento ?? 'PELA_LUZ_DO_AMBIENTE',
    rotaMaximaVezes: HIPOTESES_ELETRODUTO_PADRAO.rotaMaximaVezes ?? SEM_LIMITE,
    rotaPelaParede: HIPOTESES_ELETRODUTO_PADRAO.rotaPelaParede,
    bitolaMm: HIPOTESES_ELETRODUTO_PADRAO.bitolaMm,
    metodoDeInstalacao: HIPOTESES_PADRAO.metodoDeInstalacao,
    temperaturaAmbienteC: HIPOTESES_PADRAO.temperaturaAmbienteC,
    circuitosAgrupados: HIPOTESES_PADRAO.circuitosAgrupados,
    secaoMinimaTueMm2: HIPOTESES_PADRAO.secaoMinimaTueMm2,
    tabelasEletricas: RESUMO_DAS_TABELAS_PADRAO,
  },
};

/** Regra B: o que mudou desde o lançamento da rede do quadro. Rede sem registro (antiga) → `[]`. */
export function diferencasDoEletroduto(model: BlueprintModel, quadroId: ObjectId, atuais: EscolhasDoLancamento): DiferencaDeEscolha[] {
  return diferencasDasEscolhas(registroDe(model, 'ELETRODUTOS', quadroId)?.escolhas ?? null, atuais, ESCOLHAS_DO_ELETRODUTO);
}

/**
 * O lote de LANÇAR (o "Lançar em todos" e o botão da linha): quadro com plano recebe o plano; quadro sem nada a ligar
 * mas com trechos SUGERIDOS tem os sugeridos refeitos (`relancarEletrodutos` — os confirmados ficam). Cada quadro que
 * lançou leva o registro com as escolhas atuais, no mesmo lote.
 */
export function comandosDeLancarEletrodutos(
  model: BlueprintModel,
  planos: readonly PlanoDeEletrodutos[],
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
): Command[] {
  const escolhas = escolhasDoEletroduto(hip, hipEletricas);
  return planos.flatMap((p) => {
    let comandos: Command[] = p.comandos;
    if (comandos.length === 0) {
      if (p.sugeridos === 0) return [];
      const quadro = (model.quadros ?? []).find((q) => q.id === p.quadroId);
      comandos = quadro ? relancarEletrodutos(model, quadro, hip, hipEletricas).comandos : [];
    }
    return comandos.length ? [...comandos, comandoDeRegistro('ELETRODUTOS', p.quadroId, escolhas)] : [];
  });
}

/**
 * O lote de REFAZER os quadros pedidos: apaga a rede de cada um (confirmados e caixas aceitas inclusive) e lança de
 * novo com as escolhas atuais. Um quadro depois do outro, sobre o modelo já refeito pelo anterior (os ids que o kernel
 * dá batem com os do lote aplicado de uma vez). Quadro que relançou → registro com as escolhas; quadro cuja rede só foi
 * apagada (não sobrou ponto com circuito) → o registro sai (não há lançamento a descrever). Recusa do kernel lança
 * `KernelError` — quem chama decide o que dizer.
 */
export function comandosDeRefazerEletrodutos(
  model: BlueprintModel,
  quadroIds: readonly ObjectId[],
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
): Command[] {
  const escolhas = escolhasDoEletroduto(hip, hipEletricas);
  const saida: Command[] = [];
  let m = model;
  for (const id of quadroIds) {
    const quadro = (m.quadros ?? []).find((q) => q.id === id);
    if (!quadro) continue;
    const re = refazerEletrodutos(m, quadro, hip, hipEletricas);
    if (re.comandos.length === 0) continue;
    const lancou = re.comandos.some((c) => c.type === 'AddTrecho');
    const registro: Command = lancou ? comandoDeRegistro('ELETRODUTOS', id, escolhas) : { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: id };
    const lote = [...re.comandos, registro];
    m = applyBatch(m, lote).model;
    saida.push(...lote);
  }
  return saida;
}

/** O que REFAZER apaga num quadro — para a confirmação dizer, por quadro, o que será refeito. */
export interface RedeARefazer {
  quadroId: ObjectId;
  nome: string;
  trechos: number;
  trechosConfirmados: number;
  caixas: number;
  caixasAceitas: number;
}

/** Os quadros com rede (todos, ou os pedidos), com o que refazer apagaria em cada um. */
export function redesARefazer(model: BlueprintModel, quadroIds?: readonly ObjectId[]): RedeARefazer[] {
  const saida: RedeARefazer[] = [];
  for (const q of model.quadros ?? []) {
    if (quadroIds && !quadroIds.includes(q.id)) continue;
    const rede = redeDoQuadro(model, q);
    if (rede.length === 0) continue;
    const caixas = caixasDaRedeDoQuadro(model, q, rede);
    saida.push({
      quadroId: q.id,
      nome: q.nome,
      trechos: rede.length,
      trechosConfirmados: rede.filter((t) => !t.sugerido).length,
      caixas: caixas.length,
      caixasAceitas: caixas.filter((c) => !c.sugerida).length,
    });
  }
  return saida;
}

/**
 * A lista da confirmação — `null` quando nada do que será apagado foi confirmado/aceito (só sugeridos: refaz direto,
 * a proposta é do próprio motor). Ex.: "QDC: 7 eletroduto(s) (7 confirmado(s)) e 2 caixa(s) de passagem (2 aceita(s))."
 */
export function textoDaConfirmacaoDeRefazer(redes: readonly RedeARefazer[]): string | null {
  if (!redes.some((r) => r.trechosConfirmados > 0 || r.caixasAceitas > 0)) return null;
  return redes
    .map((r) => {
      const trechos = `${r.trechos} eletroduto(s)${r.trechosConfirmados ? ` (${r.trechosConfirmados} confirmado(s))` : ''}`;
      const caixas = r.caixas ? ` e ${r.caixas} caixa(s) de passagem${r.caixasAceitas ? ` (${r.caixasAceitas} aceita(s))` : ''}` : '';
      return `${r.nome}: ${trechos}${caixas}.`;
    })
    .join(' ');
}

/** O botão do rodapé dos eletrodutos. `motivo` não nulo = desligado, e é o `title` dele. */
export interface BotaoDeLancarEletrodutos {
  /** `LANCAR` = lança o que falta (`comandosDeLancarEletrodutos`); `RELANCAR` = refaz todo quadro com rede. */
  modo: 'LANCAR' | 'RELANCAR';
  rotulo: string;
  motivo: string | null;
}

/**
 * REGRA A: o botão nunca fica sem ação quando há rede. Falta ligar algo → "Lançar em todos (N)". Nada a lançar e
 * alguma rede lançada → "Relançar com as escolhas atuais" (refaz por quadro; a confirmação é de quem chama). Sem rede e
 * sem nada a lançar → desligado, dizendo por quê.
 */
export function botaoDeLancarEletrodutos(model: BlueprintModel, planos: readonly PlanoDeEletrodutos[]): BotaoDeLancarEletrodutos {
  const aLigar = planos.reduce((n, p) => n + p.aLigar, 0);
  const lancar = `Lançar em todos (${aLigar})`;
  if (planos.some((p) => p.comandos.length > 0)) return { modo: 'LANCAR', rotulo: lancar, motivo: null };
  if (planos.some((p) => redeDoQuadro(model, { id: p.quadroId }).length > 0)) {
    return { modo: 'RELANCAR', rotulo: 'Relançar com as escolhas atuais', motivo: null };
  }
  if (planos.length === 0) return { modo: 'LANCAR', rotulo: lancar, motivo: 'Nenhum quadro no desenho — coloque um quadro de distribuição (Instalações › Componentes).' };
  if (planos.every((p) => p.pontos === 0)) {
    return { modo: 'LANCAR', rotulo: lancar, motivo: 'Nenhum ponto com circuito — crie os circuitos (Circuitos automáticos ou Quadro de cargas).' };
  }
  const motivo = planos.find((p) => p.motivo)?.motivo;
  return { modo: 'LANCAR', rotulo: lancar, motivo: `Nada a lançar${motivo ? `: ${motivo}` : ''}.` };
}
