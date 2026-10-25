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
 * Correção 1 (24/10/2026, revisão da F2):
 * - FORRO: a Casa Automática lança a rede no forro (`noForro`), que o painel não conhece. O registro guarda a faixa (sem
 *   rótulo: não entra no aviso) e `hipotesesDoQuadro` a devolve a todo relançamento — relançar pelo editor não tira a
 *   rede do forro. Rede no forro lançada ANTES do registro (sem como saber a faixa) não relança por aqui: os botões
 *   desligam com o motivo (`motivoParaNaoRelancar`).
 * - Lançamento PARCIAL não regrava o registro quando sobra rede lançada com outras escolhas (ou sem registro): o aviso
 *   continua aceso até refazer.
 *
 * Correção 3 (24/10/2026, plano `docs/planos/2026-10-24-relancar-forro-pelas-premissas.md`). Pedido literal: *"então
 * verifique pois alterei e não ficou disponível para relançamento"* — a planta Garden (rede da Casa Automática no forro,
 * lançada antes do registro) ficava com o botão desligado. Agora o editor passa o forro elétrico das PREMISSAS da casa
 * do estudo (`forroDaCasa`, de `forroEletricoDaCasa`): com ele, a rede antiga no forro relança NO FORRO (e o lote grava
 * o registro com a faixa — dali em diante vale o registro); sem ele, o bloqueio continua, com o motivo.
 *
 * Puro: sem React, sem banco. O alvo do registro é o QUADRO (a rede é uma por quadro).
 */
import { applyBatch, type BlueprintModel, type Command, type ObjectId, type ValorDeEscolha } from './blueprintKernel';
import {
  HIPOTESES_ELETRODUTO_PADRAO,
  caixasDaRedeDoQuadro,
  comandosDeBitolaPelaOcupacao,
  cotaDaRede,
  planejarEletrodutos,
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
  textoDasDiferencas,
  type DiferencaDeEscolha,
  type EscolhasDoLancamento,
  type OpcoesDaComparacao,
} from './blueprintRegistroDeLancamento';

/**
 * Correção 3: o forro elétrico das premissas da Casa Automática do estudo (`forroEletricoDaCasa`) — a faixa e a folga com
 * que a casa lança a rede no forro. `null`/ausente = o estudo não tem casa, ou o forro está desligado nas premissas.
 */
export type ForroDaCasa = NonNullable<HipotesesDeEletroduto['noForro']>;

/**
 * As tabelas de catálogo das hipóteses elétricas que mudam a bitola (disjuntores → seção calculada; diâmetros do
 * condutor e do eletroduto → ocupação). Iguais às do sistema (`HIPOTESES_PADRAO`) → `'PADRAO'`: o registro não guarda o
 * conteúdo do padrão, e uma mudança futura das tabelas padrão não faz todo registro antigo virar "personalizadas".
 * Diferentes → um resumo estável (FNV-1a de 32 bits do JSON, em hexadecimal): são listas longas, e o registro só guarda
 * primitivos.
 */
type TabelasEletricas = Pick<HipotesesEletricas, 'catalogoDeDisjuntoresA' | 'diametroExternoCondutorMm' | 'diametroInternoEletrodutoMm'>;
const jsonDasTabelas = (h: TabelasEletricas) => JSON.stringify([h.catalogoDeDisjuntoresA, h.diametroExternoCondutorMm, h.diametroInternoEletrodutoMm]);
const TABELAS_PADRAO = 'PADRAO';
function resumoDasTabelasEletricas(h: TabelasEletricas): string {
  const texto = jsonDasTabelas(h);
  if (texto === jsonDasTabelas(HIPOTESES_PADRAO)) return TABELAS_PADRAO;
  let x = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    x ^= texto.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16).padStart(8, '0');
}

/** "Sem limite" de rota é ESCOLHA, não ausência: `null` valeria o padrão (1,5×) na comparação do registro. */
const SEM_LIMITE = 'SEM_LIMITE';

/**
 * As escolhas com que a rede é lançada, achatadas para o registro. Das hipóteses elétricas do estudo entra só o que
 * muda o eletroduto: a SEÇÃO de cada circuito sem seção declarada (`preDimensionarCircuito` → `secaoMinima`: método de
 * instalação, temperatura, agrupamento, seção mínima de TUE e o catálogo de disjuntores) e a OCUPAÇÃO (os diâmetros do
 * condutor e do eletroduto). Queda de tensão, DPS, demanda etc. não mudam a rede — trocá-los não pede relançar.
 *
 * Correção 1: rede NO FORRO (`hip.noForro`, a da Casa Automática) — a faixa vai junto (`forro*`, SEM rótulo: não é
 * escolha do painel, não acende o aviso; é o que `hipotesesDoQuadro` devolve ao relançar), e a rota máxima sai (no forro
 * o planejador não a usa — compará-la acenderia o aviso por nada).
 */
export function escolhasDoEletroduto(hip: HipotesesDeEletroduto, hipEletricas: HipotesesEletricas): EscolhasDoLancamento {
  const forro = hip.noForro ?? null;
  return {
    encaminhamento: hip.encaminhamento ?? 'PELA_LUZ_DO_AMBIENTE',
    caixasDePassagem: hip.caixas ? 'CAIXAS' : 'PELA_LUZ',
    ...(forro ? {} : { rotaMaximaVezes: hip.rotaMaximaVezes ?? SEM_LIMITE }),
    rotaPelaParede: hip.rotaPelaParede,
    bitolaMm: hip.bitolaMm,
    metodoDeInstalacao: hipEletricas.metodoDeInstalacao,
    temperaturaAmbienteC: hipEletricas.temperaturaAmbienteC,
    circuitosAgrupados: hipEletricas.circuitosAgrupados,
    secaoMinimaTueMm2: hipEletricas.secaoMinimaTueMm2,
    tabelasEletricas: resumoDasTabelasEletricas(hipEletricas),
    ...(forro
      ? {
          forroAbaixoDoTetoMm: forro.faixa.abaixoDoTetoMm,
          forroAfastamentoDaFaceMm: forro.faixa.afastamentoDaFaceMm,
          forroDegrauNaParedeMm: forro.faixa.degrauNaParedeMm ?? 0,
          forroFolgaSobAVigaMm: forro.folgaSobAVigaMm,
        }
      : {}),
  };
}

/**
 * As hipóteses com que a rede DESTE quadro se relança: as do painel (`hip`) mais o FORRO que o registro guardou — a
 * rede que a Casa Automática pôs no forro continua no forro. O encaminhamento continua o do painel (a árvore no teto
 * também corre no forro). Sem registro de forro: `hip` como veio.
 *
 * Correção 3: o forro do REGISTRO tem prioridade. Sem ele, a rede no forro lançada antes do registro
 * (`redeNoForroSemRegistro`) usa o forro das premissas da casa (`forroDaCasa`), quando o editor o tem.
 */
export function hipotesesDoQuadro(model: BlueprintModel, quadroId: ObjectId, hip: HipotesesDeEletroduto, forroDaCasa?: ForroDaCasa | null): HipotesesDeEletroduto {
  const e = registroDe(model, 'ELETRODUTOS', quadroId)?.escolhas;
  const n = (k: string) => (e && typeof e[k] === 'number' ? (e[k] as number) : null);
  const abaixo = n('forroAbaixoDoTetoMm');
  const afastamento = n('forroAfastamentoDaFaceMm');
  const folga = n('forroFolgaSobAVigaMm');
  if (abaixo == null || afastamento == null || folga == null) {
    return forroDaCasa && redeNoForroSemRegistro(model, quadroId) ? { ...hip, noForro: forroDaCasa } : hip;
  }
  return {
    ...hip,
    noForro: { faixa: { abaixoDoTetoMm: abaixo, afastamentoDaFaceMm: afastamento, degrauNaParedeMm: n('forroDegrauNaParedeMm') ?? 0 }, folgaSobAVigaMm: folga },
  };
}

/** As escolhas ATUAIS do quadro (as do painel + o forro do registro) — o que o aviso compara e o lote registra. */
export function escolhasAtuaisDoQuadro(
  model: BlueprintModel,
  quadroId: ObjectId,
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
  forroDaCasa?: ForroDaCasa | null,
): EscolhasDoLancamento {
  return escolhasDoEletroduto(hipotesesDoQuadro(model, quadroId, hip, forroDaCasa), hipEletricas);
}

/**
 * Os planos de todos os quadros, cada um com as hipóteses DELE (o forro do registro; sem registro, o das premissas da
 * casa para a rede antiga no forro) — o que o painel mostra e lança.
 */
export function planejarEletrodutosPorQuadro(model: BlueprintModel, hip: HipotesesDeEletroduto, hipEletricas: HipotesesEletricas, forroDaCasa?: ForroDaCasa | null): PlanoDeEletrodutos[] {
  return (model.quadros ?? []).map((q) => planejarEletrodutos(model, q, hipotesesDoQuadro(model, q.id, hip, forroDaCasa), hipEletricas));
}

const num = (v: ValorDeEscolha) => String(v).replace('.', ',');
const DO_ESTUDO = '(hipóteses elétricas do estudo)';

/**
 * Rótulos (na ordem do aviso), formatadores (só o VALOR) e padrões de cada escolha dos eletrodutos. As chaves `forro*`
 * não têm rótulo de propósito: não são escolha do painel — `diferencasDasEscolhas` as ignora.
 */
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
    // Duas versões personalizadas diferentes têm de sair diferentes (senão a rede de segurança de
    // `diferencasDasEscolhas` descarta a diferença): o começo do resumo vai junto, curto.
    tabelasEletricas: (v) => (v === TABELAS_PADRAO ? 'padrão do sistema' : `personalizadas no estudo (${String(v).slice(0, 4)})`),
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
    tabelasEletricas: TABELAS_PADRAO,
  },
};

/** Regra B: o que mudou desde o lançamento da rede do quadro (com as hipóteses DELE). Rede sem registro → `[]`. */
export function diferencasDoEletroduto(
  model: BlueprintModel,
  quadroId: ObjectId,
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
  forroDaCasa?: ForroDaCasa | null,
): DiferencaDeEscolha[] {
  return diferencasDasEscolhas(registroDe(model, 'ELETRODUTOS', quadroId)?.escolhas ?? null, escolhasAtuaisDoQuadro(model, quadroId, hip, hipEletricas, forroDaCasa), ESCOLHAS_DO_ELETRODUTO);
}

/** Correção 1: o motivo de os botões da rede deste quadro ficarem desligados. */
export const MOTIVO_REDE_NO_FORRO_SEM_REGISTRO = 'Rede no forro lançada antes do registro — relançar aqui a tiraria do forro.';

/**
 * Rede no FORRO lançada antes do registro (a Casa Automática de antes): sem registro, não há como saber a faixa, e
 * relançar com as hipóteses do painel desceria a rede para a cota do teto/sob a viga. Com registro, o forro vem dele
 * (`hipotesesDoQuadro`).
 *
 * Correção 3 (24/10/2026, pedido literal: *"então verifique pois alterei e não ficou disponível para relançamento"*):
 * detectar a rede antiga no forro não desliga mais o botão por si só. Com as premissas da casa do estudo
 * (`forroDaCasa`), ela relança NO FORRO (`hipotesesDoQuadro`); sem elas, o bloqueio continua, com o motivo
 * (`motivoParaNaoRelancar`).
 *
 * Correção 2 (revisão final, 24/10/2026): só com sinal de forro DE VERDADE. Antes, qualquer horizontal perto do teto
 * contava — e a "rota pela parede" cria um horizontal na cota do ponto (eixo da parede → face), comum a 2,2 m (TUE do ar,
 * luz de emergência): a planta antiga travava com um motivo falso. Agora conta o trecho horizontal elétrico da rede que:
 * - está num pavimento COM forro (algum ambiente com `acabamentos.forro` com rebaixo) e ACIMA da face mais baixa dele;
 * - fica a menos de 60 cm do teto (estrito) e fora da cota em que o painel lança (`cotaDaRede`);
 * - não termina num terminal na mesma cota (a saída até a face da caixa do ponto).
 */
export function redeNoForroSemRegistro(model: BlueprintModel, quadroId: ObjectId): boolean {
  if (registroDe(model, 'ELETRODUTOS', quadroId)) return false;
  const porNivel = new Map<string, { teto: number; rede: number; face: number } | null>();
  const doNivel = (levelId: string) => {
    if (porNivel.has(levelId)) return porNivel.get(levelId)!;
    const nivel = model.levels.find((l) => l.id === levelId);
    let c: { teto: number; rede: number; face: number } | null = null;
    if (nivel) {
      const faces = (model.labels ?? [])
        .filter((l) => l.levelId === levelId && l.acabamentos?.forro && l.acabamentos.forro.rebaixoMm > 0)
        .map((l) => nivel.defaultHeightMm - l.acabamentos!.forro!.rebaixoMm - l.acabamentos!.forro!.camadas.reduce((n, x) => n + x.espessuraMm, 0));
      if (faces.length) c = { teto: nivel.defaultHeightMm, rede: cotaDaRede(model, nivel).cotaMm, face: Math.min(...faces) };
    }
    porNivel.set(levelId, c);
    return c;
  };
  const terminais = new Set((model.terminais ?? []).map((x) => `${x.levelId}|${x.at.x},${x.at.y},${x.cotaMm}`));
  for (const t of redeDoQuadro(model, { id: quadroId })) {
    if (t.disciplina !== 'ELETRICA' || t.cotaAMm !== t.cotaBMm || (t.a.x === t.b.x && t.a.y === t.b.y)) continue;
    const c = doNivel(t.levelId);
    if (!c) continue;
    const z = t.cotaAMm;
    if (terminais.has(`${t.levelId}|${t.a.x},${t.a.y},${z}`) || terminais.has(`${t.levelId}|${t.b.x},${t.b.y},${z}`)) continue;
    if (z !== c.rede && z > c.face && z < c.teto && z > c.teto - 600) return true;
  }
  return false;
}

/**
 * Por que a rede deste quadro não relança por aqui (`null` = relança).
 *
 * Correção 3 (24/10/2026, pedido literal: *"então verifique pois alterei e não ficou disponível para relançamento"*):
 * bloqueia SÓ a rede no forro sem registro E sem as premissas da casa (`forroDaCasa`). Com elas, relança no forro.
 */
export function motivoParaNaoRelancar(model: BlueprintModel, quadroId: ObjectId, forroDaCasa?: ForroDaCasa | null): string | null {
  return !forroDaCasa && redeNoForroSemRegistro(model, quadroId) ? MOTIVO_REDE_NO_FORRO_SEM_REGISTRO : null;
}

/**
 * No forro, a bitola sai também pela fiação DERIVADA (`comandosDeBitolaPelaOcupacao`), como a Casa Automática faz depois
 * de lançar — só nos trechos da rede deste quadro. Fora do forro, como o painel sempre lançou.
 */
function bitolasDoForro(m: BlueprintModel, quadroId: ObjectId, hip: HipotesesDeEletroduto, hipEletricas: HipotesesEletricas): Command[] {
  if (!hip.noForro) return [];
  const daRede = new Set(redeDoQuadro(m, { id: quadroId }).map((t) => t.id));
  return comandosDeBitolaPelaOcupacao(m, hipEletricas).filter((c) => daRede.has(c.trechoId));
}

/**
 * O lote de LANÇAR (o "Lançar em todos" e o botão da linha). Os planos vêm de `planejarEletrodutosPorQuadro` (cada
 * quadro com o forro do registro). Quadro com plano recebe o plano; quadro sem nada a ligar mas com trechos SUGERIDOS
 * tem os sugeridos refeitos (`relancarEletrodutos` — os confirmados ficam). Um quadro depois do outro, sobre o modelo já
 * lançado pelo anterior. Quadro com rede no forro sem registro fica de fora (`motivoParaNaoRelancar`).
 *
 * O REGISTRO vai no mesmo lote — exceto (correção 1) quando SOBRA rede lançada antes com outras escolhas, ou sem
 * registro: aí o registro antigo fica e o aviso continua aceso (a tomada nova não "aceita" as caixas antigas).
 */
export function comandosDeLancarEletrodutos(
  model: BlueprintModel,
  planos: readonly PlanoDeEletrodutos[],
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
  forroDaCasa?: ForroDaCasa | null,
): Command[] {
  const saida: Command[] = [];
  let m = model;
  for (const p of planos) {
    if (motivoParaNaoRelancar(m, p.quadroId, forroDaCasa)) continue;
    const quadro = (m.quadros ?? []).find((q) => q.id === p.quadroId);
    if (!quadro) continue;
    const hipQ = hipotesesDoQuadro(m, p.quadroId, hip, forroDaCasa);
    let comandos: Command[] = p.comandos;
    if (comandos.length === 0) {
      if (p.sugeridos === 0) continue;
      comandos = relancarEletrodutos(m, quadro, hipQ, hipEletricas).comandos;
    }
    if (comandos.length === 0) continue;
    const apagados = new Set(comandos.flatMap((c) => (c.type === 'DeleteTrecho' ? [c.trechoId] : [])));
    const sobra = redeDoQuadro(m, quadro).some((t) => !apagados.has(t.id));
    const registrar = !sobra || (!!registroDe(m, 'ELETRODUTOS', p.quadroId) && diferencasDoEletroduto(m, p.quadroId, hip, hipEletricas, forroDaCasa).length === 0);
    const lote = registrar ? [...comandos, comandoDeRegistro('ELETRODUTOS', p.quadroId, escolhasDoEletroduto(hipQ, hipEletricas))] : [...comandos];
    m = applyBatch(m, lote).model;
    const bitolas = bitolasDoForro(m, p.quadroId, hipQ, hipEletricas);
    if (bitolas.length) m = applyBatch(m, bitolas).model;
    saida.push(...lote, ...bitolas);
  }
  return saida;
}

/**
 * O lote de REFAZER os quadros pedidos: apaga a rede de cada um (confirmados e caixas aceitas inclusive) e lança de
 * novo com as escolhas atuais (e o forro do registro). Um quadro depois do outro, sobre o modelo já refeito pelo
 * anterior (os ids que o kernel dá batem com os do lote aplicado de uma vez). Quadro que relançou → registro com as
 * escolhas; quadro cuja rede só foi apagada (não sobrou ponto com circuito) → o registro sai (não há lançamento a
 * descrever). Quadro com rede no forro sem registro fica de fora. Recusa do kernel lança `KernelError` — quem chama
 * decide o que dizer.
 */
export function comandosDeRefazerEletrodutos(
  model: BlueprintModel,
  quadroIds: readonly ObjectId[],
  hip: HipotesesDeEletroduto,
  hipEletricas: HipotesesEletricas,
  forroDaCasa?: ForroDaCasa | null,
): Command[] {
  const saida: Command[] = [];
  let m = model;
  for (const id of quadroIds) {
    const quadro = (m.quadros ?? []).find((q) => q.id === id);
    if (!quadro || motivoParaNaoRelancar(m, id, forroDaCasa)) continue;
    const hipQ = hipotesesDoQuadro(m, id, hip, forroDaCasa);
    const re = refazerEletrodutos(m, quadro, hipQ, hipEletricas);
    if (re.comandos.length === 0) continue;
    const lancou = re.comandos.some((c) => c.type === 'AddTrecho');
    const registro: Command = lancou
      ? comandoDeRegistro('ELETRODUTOS', id, escolhasDoEletroduto(hipQ, hipEletricas))
      : { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: id };
    const lote = [...re.comandos, registro];
    m = applyBatch(m, lote).model;
    const bitolas = bitolasDoForro(m, id, hipQ, hipEletricas);
    if (bitolas.length) m = applyBatch(m, bitolas).model;
    saida.push(...lote, ...bitolas);
  }
  return saida;
}

/** O que REFAZER apaga num quadro — para a confirmação dizer, por quadro, o que será refeito (e o que mudou). */
export interface RedeARefazer {
  quadroId: ObjectId;
  nome: string;
  trechos: number;
  trechosConfirmados: number;
  caixas: number;
  caixasAceitas: number;
  /** O que mudou desde o lançamento (`textoDasDiferencas`); `null` = sem registro, nada mudou ou sem as hipóteses. */
  mudou: string | null;
}

/**
 * Os quadros com rede (todos, ou os pedidos), com o que refazer apagaria em cada um. Com as hipóteses atuais, diz também
 * o que mudou desde o lançamento. Quadro que não relança por aqui (`motivoParaNaoRelancar`) fica de fora.
 */
export function redesARefazer(
  model: BlueprintModel,
  quadroIds?: readonly ObjectId[],
  atuais?: { hip: HipotesesDeEletroduto; hipEletricas: HipotesesEletricas; forroDaCasa?: ForroDaCasa | null },
): RedeARefazer[] {
  const saida: RedeARefazer[] = [];
  for (const q of model.quadros ?? []) {
    if (quadroIds && !quadroIds.includes(q.id)) continue;
    if (motivoParaNaoRelancar(model, q.id, atuais?.forroDaCasa)) continue;
    const rede = redeDoQuadro(model, q);
    if (rede.length === 0) continue;
    const caixas = caixasDaRedeDoQuadro(model, q, rede);
    const d = atuais ? diferencasDoEletroduto(model, q.id, atuais.hip, atuais.hipEletricas, atuais.forroDaCasa) : [];
    saida.push({
      quadroId: q.id,
      nome: q.nome,
      trechos: rede.length,
      trechosConfirmados: rede.filter((t) => !t.sugerido).length,
      caixas: caixas.length,
      caixasAceitas: caixas.filter((c) => !c.sugerida).length,
      mudou: d.length ? textoDasDiferencas(d) : null,
    });
  }
  return saida;
}

/**
 * A lista da confirmação — `null` quando nada do que será apagado foi confirmado/aceito (só sugeridos: refaz direto,
 * a proposta é do próprio motor). Ex.: "QDC: 7 eletroduto(s) (7 confirmado(s)) e 2 caixa(s) de passagem (2 aceita(s)).
 * O que mudou: Caixas de passagem — lançado com: com caixas de passagem · agora: sem caixas (pela luz do teto)."
 */
export function textoDaConfirmacaoDeRefazer(redes: readonly RedeARefazer[]): string | null {
  if (!redes.some((r) => r.trechosConfirmados > 0 || r.caixasAceitas > 0)) return null;
  return redes
    .map((r) => {
      const trechos = `${r.trechos} eletroduto(s)${r.trechosConfirmados ? ` (${r.trechosConfirmados} confirmado(s))` : ''}`;
      const caixas = r.caixas ? ` e ${r.caixas} caixa(s) de passagem${r.caixasAceitas ? ` (${r.caixasAceitas} aceita(s))` : ''}` : '';
      return `${r.nome}: ${trechos}${caixas}.${r.mudou ? ` O que mudou: ${r.mudou}.` : ''}`;
    })
    .join(' ');
}

/** O botão do rodapé dos eletrodutos. `motivo` não nulo = desligado, e é o `title` dele. */
export interface BotaoDeLancarEletrodutos {
  /** `LANCAR` = lança o que falta (`comandosDeLancarEletrodutos`); `RELANCAR` = refaz os `quadros`. */
  modo: 'LANCAR' | 'RELANCAR';
  rotulo: string;
  motivo: string | null;
  /** Os quadros que o botão lança/refaz — só os que relançam por aqui. */
  quadros: ObjectId[];
}

/**
 * REGRA A: o botão nunca fica sem ação quando há rede. Falta ligar algo → "Lançar em todos (N)". Nada a lançar e
 * alguma rede lançada → "Relançar com as escolhas atuais" (refaz por quadro; a confirmação é de quem chama). Sem rede e
 * sem nada a lançar → desligado, dizendo por quê. Quadro com rede no forro sem registro não entra (correção 1) — salvo
 * com as premissas da casa (`forroDaCasa`, correção 3): aí relança no forro. Os `planos` devem vir de
 * `planejarEletrodutosPorQuadro` com o MESMO `forroDaCasa`.
 */
export function botaoDeLancarEletrodutos(model: BlueprintModel, planos: readonly PlanoDeEletrodutos[], forroDaCasa?: ForroDaCasa | null): BotaoDeLancarEletrodutos {
  const livres = planos.filter((p) => !motivoParaNaoRelancar(model, p.quadroId, forroDaCasa));
  const aLigar = livres.reduce((n, p) => n + p.aLigar, 0);
  const lancar = `Lançar em todos (${aLigar})`;
  if (livres.some((p) => p.comandos.length > 0)) {
    return { modo: 'LANCAR', rotulo: lancar, motivo: null, quadros: livres.filter((p) => p.comandos.length > 0 || p.sugeridos > 0).map((p) => p.quadroId) };
  }
  const comRede = livres.filter((p) => redeDoQuadro(model, { id: p.quadroId }).length > 0);
  if (comRede.length) return { modo: 'RELANCAR', rotulo: 'Relançar com as escolhas atuais', motivo: null, quadros: comRede.map((p) => p.quadroId) };
  const desligado = (motivo: string): BotaoDeLancarEletrodutos => ({ modo: 'LANCAR', rotulo: lancar, motivo, quadros: [] });
  if (planos.length === 0) return desligado('Nenhum quadro no desenho — coloque um quadro de distribuição (Instalações › Componentes).');
  if (livres.length < planos.length) return desligado(MOTIVO_REDE_NO_FORRO_SEM_REGISTRO);
  if (planos.every((p) => p.pontos === 0)) return desligado('Nenhum ponto com circuito — crie os circuitos (Circuitos automáticos ou Quadro de cargas).');
  const motivo = planos.find((p) => p.motivo)?.motivo;
  return desligado(`Nada a lançar${motivo ? `: ${motivo}` : ''}.`);
}
