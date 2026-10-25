/**
 * ESGOTO — COM QUE ESCOLHAS A REDE FOI LANÇADA, E O QUE FAZER QUANDO ELAS MUDAM (F4 do plano
 * `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026). Os moldes são a F2 dos eletrodutos
 * (`blueprintEscolhasDoEletroduto.ts`) e a F3 da água e do pluvial (`blueprintEscolhasDaAguaEPluvial.ts`).
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
 * As premissas hidrossanitárias do ESTUDO (`useBlueprintHidro` → `HipotesesHidro`): as do esgoto (destino, caimentos,
 * cota do ramal, DN do tubo de queda e da ventilação, rota, shaft, ventilação até a parede, válvula de admissão de ar,
 * afastamentos da caixa, rede pública) e, com o destino TRATAMENTO, as do tratamento individual e a população da
 * reservação (o tamanho do tanque, do filtro e do sumidouro). Entra só o que MUDA a rede: as da rede pública só com a
 * rede pública; as do tratamento só com o tratamento; a altura da válvula só com a válvula ligada.
 *
 * ─── O DESTINO ───────────────────────────────────────────────────────────────
 * O destino é UMA DAS ESCOLHAS (saída (a) do brief da F4). Antes, só a troca de destino virava pendência
 * (`confirmadosDoOutroDestino` do `planejarEsgotoCompleto`, que pede autorização para apagar o que está confirmado do
 * outro destino). Agora, com registro, a troca aparece no aviso como qualquer outra escolha ("Destino do esgoto —
 * lançado com: rede pública · agora: tratamento individual"), e o "Relançar" do aviso é o Refazer: apaga também o
 * outro destino (confirmado inclusive) e a CONFIRMAÇÃO, que nomeia a ligação, o coletor ou o tratamento, é a
 * autorização. Rede sem registro (lançada antes) continua no caminho antigo: o "Lançar" pede a autorização.
 *
 * ─── O ALVO ──────────────────────────────────────────────────────────────────
 * `null` (a planta inteira): o "Lançar" lança caixa, ramais, destino e ventilação de todos os pavimentos num lote só.
 *
 * ─── O QUE É "A REDE DO SISTEMA" (o que o Refazer apaga) ─────────────────────
 * - Os tubos de esgoto ligados à rede (`redeDaOrigem` de cada caixa de inspeção, da ligação e das unidades de
 *   tratamento — o mesmo critério do "Refazer tudo" de antes) e os tubos com rótulo do motor (TQ, Ventilação, Coletor
 *   predial, Tratamento), confirmados inclusive.
 * - As caixas que o MOTOR põe: a caixa de inspeção SUGERIDA (a proposta) e as do coletor (rótulo "CI do coletor"), a
 *   ligação à rede SUGERIDA ou com a cota ESTIMADA (correção 1, I2; com o destino tratamento, qualquer ligação: é o outro
 *   destino), as unidades de tratamento — salvo o tratamento CONFIRMADO com o destino tratamento e as premissas dele sem
 *   mudança (correção 1, I1: fica, com os tubos "Tratamento") — e as válvulas de admissão de ar sobre os tubos apagados.
 * - As peças EM LINHA sobre os tubos apagados (joelhos, tês, luvas, reduções — postas à mão): sem o tubo ficariam
 *   soltas. A confirmação as nomeia.
 * NÃO entram: os aparelhos, os ralos e as caixas sifonadas (as fontes da rede), a caixa de gordura (é âncora da casa,
 * não do esgoto), a caixa de inspeção CONFIRMADA (o motor a reaproveita) e a ligação aceita com a cota CONFIRMADA (ou
 * posta à mão) com a rede pública, nem tubo de outra disciplina. As escolhas que essas peças fixam (a profundidade da
 * rede, os afastamentos da caixa) não se aplicam enquanto elas ficarem: fora do aviso, e o registro guarda o valor
 * anterior (correção 1, I2). A confirmação diz, item por item, o que volta à posição/medida do motor e o que fica.
 *
 * ─── A CASA AUTOMÁTICA (faixa do esgoto e tubo de queda por banheiro) ────────
 * A casa lança o esgoto com hipóteses que o painel não tem: a FAIXA do esgoto (`faixa`: o tubo de queda e as colunas de
 * ventilação deslocados para não dividirem o lugar com as colunas de água) e, no sobrado, um tubo de queda por GRUPO de
 * peças (`tuboDeQuedaPorGrupoMm`) no shaft mais perto (`raioDoShaftMm` da casa). Sem elas, relançar pelo editor punha o
 * tubo de queda no centro do shaft e a ventilação no eixo da parede — em cima das colunas de água — e, no sobrado, o
 * banheiro da suíte despejava no tubo de queda do outro, pelo forro do térreo. O registro guarda as três em chaves SEM
 * rótulo (fora do aviso), e `lancamentoDoEsgoto` as devolve a todo relançamento.
 * Esgoto lançado ANTES do registro numa casa (a planta com a água no forro): relança pelas premissas da casa
 * (`esgotoDaCasa`, montado pelo editor) só com a ASSINATURA da casa na água (`aguaNoForroDaCasa`, sobre
 * `blueprintAssinaturaDaCasa`); sem as premissas (erro de leitura) ou sem a assinatura, os botões desligam com o motivo.
 *
 * Puro: sem React, sem banco.
 */
import { applyBatch, type BlueprintModel, type Command, type Terminal, type Trecho, type ValorDeEscolha } from './blueprintKernel';
import { redeDaOrigem, HIPOTESES_AGUA_PADRAO, type HipotesesDeAgua } from './blueprintAguaAutomatica';
import {
  HIPOTESES_ESGOTO_PADRAO,
  caixasDeInspecao,
  destinoDoEsgoto,
  destinosDoEsgoto,
  unidadesDeTratamento,
  type DestinoDoEsgoto,
  type HipotesesDeEsgoto,
} from './blueprintEsgotoAutomatico';
import { planejarEsgotoCompleto, type OpcoesDoEsgotoCompleto, type PlanoDoEsgotoCompleto } from './blueprintEsgotoCompleto';
import { DISTANCIA_MAXIMA_ATE_A_LIGACAO_MM, DISTANCIA_MAXIMA_ENTRE_CAIXAS_MM, ROTULO_DA_CI_DO_COLETOR, ROTULO_DO_COLETOR, cotaDaRedeEstimada } from './blueprintColetorPredial';
import {
  HIPOTESES_TRATAMENTO_PADRAO,
  ROTULO_DO_TRATAMENTO,
  UNIDADES_DE_TRATAMENTO,
  dimensionarTratamento,
  medidasDimensionadas,
  type HipotesesDeTratamento,
} from './blueprintTratamento';
import { ROTULO_DA_VENTILACAO, TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR, VENTILACAO_ATE_A_PAREDE_MM } from './blueprintVentilacao';
import { HIPOTESES_RESERVATORIO_PADRAO, type HipotesesDeReservatorio } from './blueprintReservacao';
import { aguaNoForroDaCasa, sobreOTubo, type ForroDaAguaDaCasa } from './blueprintEscolhasDaAguaEPluvial';
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
const pct = (v: ValorDeEscolha) => `${num(v)} %`;
const dn = (v: ValorDeEscolha) => `DN ${num(v)}`;
/** "Sem limite" de rota é ESCOLHA, não ausência: `null` valeria o padrão (1,5×) na comparação do registro. */
const SEM_LIMITE = 'SEM_LIMITE';
/** Os padrões das premissas OPCIONAIS do esgoto — os mesmos que o motor usa quando elas faltam. */
const RAIO_DO_SHAFT_PADRAO_MM = 3000;
const VALVULA_ABAIXO_DO_TETO_PADRAO_MM = 300;
const AFASTAMENTO_DA_CI_PADRAO_MM = 1000;
const AFASTAMENTO_DA_CI_A_AGUA_PADRAO_MM = 600;
const PROFUNDIDADE_DA_REDE_PADRAO_MM = 1500;

/** Números do registro (o kernel só guarda primitivos). */
function numeroDe(e: EscolhasDoLancamento | undefined, k: string): number | null {
  return e && typeof e[k] === 'number' ? (e[k] as number) : null;
}

/** O que a Casa Automática decide no esgoto e o estudo não tem (ver o cabeçalho). Tudo opcional. */
export interface ExtrasDoEsgotoDaCasa {
  faixa?: { x: number; y: number } | null;
  tuboDeQuedaPorGrupoMm?: number | null;
  /** O raio do shaft que a casa usa no sobrado (no lugar do do estudo). */
  raioDoShaftMm?: number | null;
}

/**
 * As premissas da casa para o esgoto antigo (sem registro), como o editor as monta das premissas da casa do estudo: os
 * extras e o FORRO DA ÁGUA da casa (a assinatura: a planta é uma casa se a água estiver no forro dela).
 */
export interface EsgotoDaCasa extends ExtrasDoEsgotoDaCasa {
  forroDaAgua: ForroDaAguaDaCasa | null;
}

/**
 * Tudo com que o esgoto se lança. `esgotoDaCasa`: ausente = não verificar a casa (o lançamento usa só o estudo e o
 * registro); `'CARREGANDO'` = as premissas da casa ainda estão chegando; `null` = não puderam ser lidas (erro); objeto =
 * lidas.
 */
export interface PremissasDoEsgoto {
  esgoto: HipotesesDeEsgoto;
  tratamento: HipotesesDeTratamento;
  reservatorio: HipotesesDeReservatorio;
  /** Para a assinatura da casa (a cota do ramal da água distingue o forro). */
  agua?: Pick<HipotesesDeAgua, 'cotaRamalMm'>;
  esgotoDaCasa?: EsgotoDaCasa | null | 'CARREGANDO';
}

/** As chaves que só valem com um destino (fora da comparação quando um dos lados é o outro destino). */
const SO_DA_REDE_PUBLICA = ['profundidadeDaRedeMm', 'distanciaAteALigacaoMm', 'distanciaEntreCaixasMm'] as const;
const SO_DO_TRATAMENTO = [
  'comFiltro',
  'padraoDeResidencia',
  'temperaturaC',
  'intervaloDeLimpezaAnos',
  'taxaDeInfiltracaoLM2Dia',
  'diametroDoSumidouroMm',
  'pessoasPorDormitorio',
  'pessoasPorDependencia',
  'populacaoDeclarada',
] as const;

/**
 * As escolhas do esgoto, achatadas para o registro. Com rótulo: as premissas do estudo que mudam a rede (as do destino
 * em vigor). Sem rótulo: o que só a casa decide (`extras`) — a faixa, o tubo de queda por grupo e o raio do shaft dela.
 */
export function escolhasDoEsgoto(
  p: Pick<PremissasDoEsgoto, 'esgoto' | 'tratamento' | 'reservatorio'>,
  extras: ExtrasDoEsgotoDaCasa = {},
): EscolhasDoLancamento {
  const h = p.esgoto;
  const destino = destinoDoEsgoto(h);
  const valvula = h.valvulaDeAdmissaoDeAr !== false;
  const faixa = extras.faixa ?? h.faixa ?? null;
  const grupo = extras.tuboDeQuedaPorGrupoMm ?? h.tuboDeQuedaPorGrupoMm ?? null;
  return {
    destino,
    caimentoPctAte75: h.caimentoPctAte75,
    caimentoPctDe100: h.caimentoPctDe100,
    cotaMinimaSobPisoMm: h.cotaMinimaSobPisoMm,
    dnTuboQuedaMm: h.dnTuboQuedaMm,
    dnVentilacaoMm: h.dnVentilacaoMm,
    rotaMaximaVezes: h.rotaMaximaVezes ?? SEM_LIMITE,
    raioDoShaftMm: h.raioDoShaftMm ?? RAIO_DO_SHAFT_PADRAO_MM,
    ventilacaoAteAParedeMm: h.ventilacaoAteAParedeMm ?? VENTILACAO_ATE_A_PAREDE_MM,
    valvulaDeAdmissaoDeAr: valvula,
    // A altura da válvula só muda a rede com a válvula ligada (senão o aviso pediria um relançamento que não muda nada).
    ...(valvula ? { valvulaAbaixoDoTetoMm: h.valvulaAbaixoDoTetoMm ?? VALVULA_ABAIXO_DO_TETO_PADRAO_MM } : {}),
    afastamentoDaCiMm: h.afastamentoDaCiMm ?? AFASTAMENTO_DA_CI_PADRAO_MM,
    afastamentoDaCiAAguaMm: h.afastamentoDaCiAAguaMm ?? AFASTAMENTO_DA_CI_A_AGUA_PADRAO_MM,
    ...(destino === 'REDE_PUBLICA'
      ? {
          profundidadeDaRedeMm: h.profundidadeDaRedeMm ?? PROFUNDIDADE_DA_REDE_PADRAO_MM,
          distanciaAteALigacaoMm: h.distanciaAteALigacaoMm ?? DISTANCIA_MAXIMA_ATE_A_LIGACAO_MM,
          distanciaEntreCaixasMm: h.distanciaEntreCaixasMm ?? DISTANCIA_MAXIMA_ENTRE_CAIXAS_MM,
        }
      : {
          comFiltro: p.tratamento.comFiltro,
          padraoDeResidencia: p.tratamento.padrao,
          temperaturaC: p.tratamento.temperaturaC,
          intervaloDeLimpezaAnos: p.tratamento.intervaloDeLimpezaAnos,
          taxaDeInfiltracaoLM2Dia: p.tratamento.taxaDeInfiltracaoLM2Dia,
          diametroDoSumidouroMm: p.tratamento.diametroDoSumidouroMm,
          pessoasPorDormitorio: p.reservatorio.pessoasPorDormitorio,
          pessoasPorDependencia: p.reservatorio.pessoasPorDependencia,
          populacaoDeclarada: p.reservatorio.populacaoDeclarada,
        }),
    // Sem rótulo — o que só a casa decide.
    ...(faixa ? { faixaX: faixa.x, faixaY: faixa.y } : {}),
    ...(grupo != null ? { tuboDeQuedaPorGrupoMm: grupo } : {}),
    ...(extras.raioDoShaftMm != null ? { raioDoShaftDaCasaMm: extras.raioDoShaftMm } : {}),
  };
}

const PADRAO_DE_RESIDENCIA: Record<string, string> = { ALTO: 'alto', MEDIO: 'médio', BAIXO: 'baixo' };

/** Rótulos (na ordem do aviso), formatadores (só o VALOR) e padrões das escolhas do esgoto. */
export const ESCOLHAS_DO_ESGOTO: OpcoesDaComparacao = {
  rotulos: {
    destino: 'Destino do esgoto',
    caimentoPctAte75: 'Caimento até DN 75',
    caimentoPctDe100: 'Caimento em DN 100',
    cotaMinimaSobPisoMm: 'Cota do ramal sob o piso',
    dnTuboQuedaMm: 'DN mínimo do tubo de queda',
    dnVentilacaoMm: 'DN da coluna de ventilação',
    rotaMaximaVezes: 'Rota máxima do ramal',
    raioDoShaftMm: 'Raio em que um shaft atrai o tubo de queda',
    ventilacaoAteAParedeMm: 'Ventilação busca a parede até',
    valvulaDeAdmissaoDeAr: 'Peça sem parede para a coluna de ventilação',
    valvulaAbaixoDoTetoMm: 'Válvula de admissão de ar abaixo do teto',
    afastamentoDaCiMm: 'Afastamento da caixa de inspeção automática',
    afastamentoDaCiAAguaMm: 'Afastamento da caixa ao alimentador enterrado',
    profundidadeDaRedeMm: 'Profundidade presumida da rede pública',
    distanciaAteALigacaoMm: 'Distância máxima da ligação à 1ª caixa do coletor',
    distanciaEntreCaixasMm: 'Distância máxima entre caixas do coletor',
    comFiltro: 'Filtro anaeróbio',
    padraoDeResidencia: 'Padrão da residência (tratamento)',
    temperaturaC: 'Temperatura do mês mais frio (tratamento)',
    intervaloDeLimpezaAnos: 'Intervalo entre limpezas do tanque',
    taxaDeInfiltracaoLM2Dia: 'Taxa de infiltração do solo',
    diametroDoSumidouroMm: 'Diâmetro do sumidouro',
    pessoasPorDormitorio: 'Pessoas por dormitório (tratamento)',
    pessoasPorDependencia: 'Pessoas por dependência (tratamento)',
    populacaoDeclarada: 'População declarada (tratamento)',
  },
  valores: {
    destino: (v) => (v === 'TRATAMENTO' ? 'tratamento individual' : 'rede pública'),
    caimentoPctAte75: pct,
    caimentoPctDe100: pct,
    cotaMinimaSobPisoMm: mm,
    dnTuboQuedaMm: dn,
    dnVentilacaoMm: dn,
    rotaMaximaVezes: (v) => (typeof v === 'number' ? `${num(v)}× a linha reta` : 'sem limite'),
    raioDoShaftMm: mm,
    ventilacaoAteAParedeMm: mm,
    valvulaDeAdmissaoDeAr: (v) => (v ? 'válvula de admissão de ar' : 'coluna sobe no ponto'),
    valvulaAbaixoDoTetoMm: mm,
    afastamentoDaCiMm: mm,
    afastamentoDaCiAAguaMm: mm,
    profundidadeDaRedeMm: mm,
    distanciaAteALigacaoMm: mm,
    distanciaEntreCaixasMm: mm,
    comFiltro: (v) => (v ? 'com filtro' : 'sem filtro'),
    padraoDeResidencia: (v) => PADRAO_DE_RESIDENCIA[String(v)] ?? String(v),
    temperaturaC: (v) => `${num(v)} °C`,
    intervaloDeLimpezaAnos: (v) => `${num(v)} ano(s)`,
    taxaDeInfiltracaoLM2Dia: (v) => `${num(v)} L/m²·dia`,
    diametroDoSumidouroMm: mm,
    populacaoDeclarada: (v) => (v === 0 ? 'contada pelos dormitórios' : `${num(v)} pessoa(s)`),
  },
  padroes: {
    destino: 'REDE_PUBLICA',
    caimentoPctAte75: HIPOTESES_ESGOTO_PADRAO.caimentoPctAte75,
    caimentoPctDe100: HIPOTESES_ESGOTO_PADRAO.caimentoPctDe100,
    cotaMinimaSobPisoMm: HIPOTESES_ESGOTO_PADRAO.cotaMinimaSobPisoMm,
    dnTuboQuedaMm: HIPOTESES_ESGOTO_PADRAO.dnTuboQuedaMm,
    dnVentilacaoMm: HIPOTESES_ESGOTO_PADRAO.dnVentilacaoMm,
    rotaMaximaVezes: HIPOTESES_ESGOTO_PADRAO.rotaMaximaVezes ?? SEM_LIMITE,
    raioDoShaftMm: HIPOTESES_ESGOTO_PADRAO.raioDoShaftMm ?? RAIO_DO_SHAFT_PADRAO_MM,
    ventilacaoAteAParedeMm: VENTILACAO_ATE_A_PAREDE_MM,
    valvulaDeAdmissaoDeAr: true,
    valvulaAbaixoDoTetoMm: VALVULA_ABAIXO_DO_TETO_PADRAO_MM,
    afastamentoDaCiMm: HIPOTESES_ESGOTO_PADRAO.afastamentoDaCiMm ?? AFASTAMENTO_DA_CI_PADRAO_MM,
    afastamentoDaCiAAguaMm: AFASTAMENTO_DA_CI_A_AGUA_PADRAO_MM,
    profundidadeDaRedeMm: HIPOTESES_ESGOTO_PADRAO.profundidadeDaRedeMm ?? PROFUNDIDADE_DA_REDE_PADRAO_MM,
    distanciaAteALigacaoMm: DISTANCIA_MAXIMA_ATE_A_LIGACAO_MM,
    distanciaEntreCaixasMm: DISTANCIA_MAXIMA_ENTRE_CAIXAS_MM,
    comFiltro: HIPOTESES_TRATAMENTO_PADRAO.comFiltro,
    padraoDeResidencia: HIPOTESES_TRATAMENTO_PADRAO.padrao,
    temperaturaC: HIPOTESES_TRATAMENTO_PADRAO.temperaturaC,
    intervaloDeLimpezaAnos: HIPOTESES_TRATAMENTO_PADRAO.intervaloDeLimpezaAnos,
    taxaDeInfiltracaoLM2Dia: HIPOTESES_TRATAMENTO_PADRAO.taxaDeInfiltracaoLM2Dia,
    diametroDoSumidouroMm: HIPOTESES_TRATAMENTO_PADRAO.diametroDoSumidouroMm,
    pessoasPorDormitorio: HIPOTESES_RESERVATORIO_PADRAO.pessoasPorDormitorio,
    pessoasPorDependencia: HIPOTESES_RESERVATORIO_PADRAO.pessoasPorDependencia,
    populacaoDeclarada: HIPOTESES_RESERVATORIO_PADRAO.populacaoDeclarada,
  },
};

/**
 * O motivo de o esgoto não relançar por aqui: esgoto antigo, sem registro, numa planta com a água no forro como a da
 * Casa Automática — sem a faixa dela não há como relançar sem tirar o tubo de queda e a ventilação do lugar. Correção 1
 * (menor 1): não afirma que É uma casa — só que a água está como a de uma.
 */
export const MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO =
  'Esgoto lançado antes do registro, e a água está no forro como a da Casa Automática — relançar aqui, sem a faixa da casa, poderia tirar o tubo de queda e a ventilação do lugar.';
/** Correção 1 (menor 1): enquanto as premissas da casa carregam (não é erro: some sozinho). */
export const MOTIVO_CARREGANDO_AS_PREMISSAS_DA_CASA = 'Carregando as premissas da Casa Automática…';

/** Há tubo de esgoto no desenho? (o caminho barato, para decidir se vale procurar a casa) */
function temTuboDeEsgoto(model: BlueprintModel): boolean {
  return (model.trechos ?? []).some((t) => t.disciplina === 'ESGOTO');
}

// ─── O QUE O DESENHO FIXA (correção 1, I2) ─────────────────────────────────
// Peças que o Refazer MANTÉM e que uma escolha comandaria se fossem refeitas: a ligação à rede pública que fica (cota
// confirmada com a concessionária, ou posta à mão) fixa a PROFUNDIDADE presumida da rede; a caixa de inspeção que o
// usuário confirmou fixa os AFASTAMENTOS da caixa automática. Essas escolhas não se aplicam enquanto as peças ficarem:
// - não entram no aviso (relançar não as aplicaria — um aviso que nunca apaga);
// - o registro guarda o valor ANTERIOR delas (ou nenhum), nunca o novo — o registro não pode dizer que a escolha foi
//   aplicada sem ter sido; tirada a peça, a comparação volta e o aviso acende se a escolha mudou.

/** A ligação à rede pública que o Refazer mantém (rede pública): aceita e com a cota que não é a ESTIMADA. */
function ligacoesMantidas(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((x) => x.disciplina === 'ESGOTO' && x.tipoHidraulico === 'LIGACAO_ESGOTO' && !x.sugerida && !cotaDaRedeEstimada(x));
}

/** A caixa de inspeção que o Refazer mantém: a principal (não a do coletor), confirmada. */
function caixasMantidas(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((x) => x.disciplina === 'ESGOTO' && x.tipoHidraulico === 'CAIXA_INSPECAO' && !x.sugerida && x.rotulo !== ROTULO_DA_CI_DO_COLETOR);
}

/** As escolhas fixadas pelo desenho, com o que as fixa (para a confirmação dizer o que fica e por quê). */
function fixadasPeloDesenho(model: BlueprintModel, destino: DestinoDoEsgoto): Map<string, string> {
  const m = new Map<string, string>();
  if (destino === 'REDE_PUBLICA' && ligacoesMantidas(model).length) m.set('profundidadeDaRedeMm', 'a ligação à rede pública com a cota confirmada');
  if (caixasMantidas(model).length) {
    m.set('afastamentoDaCiMm', 'a caixa de inspeção que você confirmou');
    m.set('afastamentoDaCiAAguaMm', 'a caixa de inspeção que você confirmou');
  }
  return m;
}

/** As escolhas a registrar: as fixadas pelo desenho levam o valor do registro anterior (ou nenhum). */
function semAsFixadas(model: BlueprintModel, escolhas: EscolhasDoLancamento, anterior: EscolhasDoLancamento | undefined): EscolhasDoLancamento {
  const fixadas = fixadasPeloDesenho(model, escolhas.destino === 'TRATAMENTO' ? 'TRATAMENTO' : 'REDE_PUBLICA');
  if (!fixadas.size) return escolhas;
  const out = { ...escolhas };
  for (const k of fixadas.keys()) {
    if (anterior && anterior[k] !== undefined && anterior[k] !== null) out[k] = anterior[k];
    else delete out[k];
  }
  return out;
}

/**
 * As hipóteses com que o esgoto se LANÇA agora, as escolhas que esse lançamento registra e, quando não dá para relançar
 * por aqui, o motivo:
 * - com registro: as do estudo completadas pelo que a casa decidiu e o registro guardou (a faixa e o tubo de queda por
 *   grupo, quando o estudo não os tem; o raio do shaft da casa, enquanto o raio do estudo for o mesmo com que ela lançou);
 * - sem registro e sem verificar a casa (`esgotoDaCasa` ausente), ou sem rede: as do estudo;
 * - sem registro, com rede e a água no forro: com a assinatura da casa, as do estudo + os extras da casa; carregando as
 *   premissas, sem elas (`null`) ou sem a assinatura, o motivo.
 * Em todos: as escolhas fixadas pelo desenho (correção 1, I2) guardam o valor anterior.
 */
export function lancamentoDoEsgoto(
  model: BlueprintModel,
  p: PremissasDoEsgoto,
): { hip: HipotesesDeEsgoto; escolhas: EscolhasDoLancamento; motivo: string | null } {
  const h = p.esgoto;
  const e = registroDe(model, 'ESGOTO', null)?.escolhas;
  const comExtras = (x: ExtrasDoEsgotoDaCasa): HipotesesDeEsgoto => ({
    ...h,
    ...(x.faixa && !h.faixa ? { faixa: x.faixa } : {}),
    ...(x.tuboDeQuedaPorGrupoMm != null && h.tuboDeQuedaPorGrupoMm == null ? { tuboDeQuedaPorGrupoMm: x.tuboDeQuedaPorGrupoMm } : {}),
    ...(x.raioDoShaftMm != null ? { raioDoShaftMm: x.raioDoShaftMm } : {}),
  });
  const escolhas = (x: ExtrasDoEsgotoDaCasa = {}) => semAsFixadas(model, escolhasDoEsgoto(p, x), e);
  if (e) {
    const n = (k: string) => numeroDe(e, k);
    const fx = n('faixaX');
    const fy = n('faixaY');
    const raioDaCasa = n('raioDoShaftDaCasaMm');
    const extras: ExtrasDoEsgotoDaCasa = {
      faixa: fx != null && fy != null ? { x: fx, y: fy } : null,
      tuboDeQuedaPorGrupoMm: n('tuboDeQuedaPorGrupoMm'),
      // Mudou o raio no estudo: vale o novo (a casa decidiu sobre o raio de então).
      raioDoShaftMm: raioDaCasa != null && n('raioDoShaftMm') === (h.raioDoShaftMm ?? RAIO_DO_SHAFT_PADRAO_MM) ? raioDaCasa : null,
    };
    return { hip: comExtras(extras), escolhas: escolhas(extras), motivo: null };
  }
  const soOEstudo = { hip: h, escolhas: escolhas(), motivo: null };
  if (p.esgotoDaCasa === undefined || !temTuboDeEsgoto(model)) return soOEstudo;
  const c = p.esgotoDaCasa === 'CARREGANDO' ? null : p.esgotoDaCasa;
  const agua = aguaNoForroDaCasa(model, c?.forroDaAgua ?? null, p.agua?.cotaRamalMm ?? HIPOTESES_AGUA_PADRAO.cotaRamalMm);
  if (!agua.noForro) return soOEstudo;
  if (p.esgotoDaCasa === 'CARREGANDO') return { ...soOEstudo, motivo: MOTIVO_CARREGANDO_AS_PREMISSAS_DA_CASA };
  if (!c) return { ...soOEstudo, motivo: `${MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO} Não foi possível ler as premissas da casa.` };
  if (!agua.daCasa) {
    const porque = agua.porque ?? 'O forro está desligado nas premissas da casa.';
    return { ...soOEstudo, motivo: `${MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO} ${porque}` };
  }
  const extras: ExtrasDoEsgotoDaCasa = { faixa: c.faixa ?? null, tuboDeQuedaPorGrupoMm: c.tuboDeQuedaPorGrupoMm ?? null, raioDoShaftMm: c.raioDoShaftMm ?? null };
  return { hip: comExtras(extras), escolhas: escolhas(extras), motivo: null };
}

/**
 * Regra B: o que mudou desde o lançamento do esgoto. Sem registro → `[]`. As escolhas de um destino só se comparam
 * quando os DOIS lados são desse destino — a troca de destino já aparece como tal (sem um rosário de "rede pública: —").
 * As fixadas pelo desenho (correção 1, I2) não se comparam: relançar não as aplicaria.
 */
export function diferencasDoEsgoto(model: BlueprintModel, p: PremissasDoEsgoto): DiferencaDeEscolha[] {
  const gravadas = registroDe(model, 'ESGOTO', null)?.escolhas ?? null;
  if (!gravadas) return [];
  const atuais = lancamentoDoEsgoto(model, p).escolhas;
  const destinos = [gravadas.destino === 'TRATAMENTO' ? 'TRATAMENTO' : 'REDE_PUBLICA', atuais.destino];
  const fora = new Set<string>([
    ...(destinos.every((d) => d === 'REDE_PUBLICA') ? [] : SO_DA_REDE_PUBLICA),
    ...(destinos.every((d) => d === 'TRATAMENTO') ? [] : SO_DO_TRATAMENTO),
    ...fixadasPeloDesenho(model, atuais.destino === 'TRATAMENTO' ? 'TRATAMENTO' : 'REDE_PUBLICA').keys(),
  ]);
  const rotulos = Object.fromEntries(Object.entries(ESCOLHAS_DO_ESGOTO.rotulos).filter(([k]) => !fora.has(k)));
  return diferencasDasEscolhas(gravadas, atuais, { ...ESCOLHAS_DO_ESGOTO, rotulos });
}

/** Os rótulos dos tubos que só o motor põe (sem ligação com a caixa, ainda assim são dele). */
const ROTULOS_DO_MOTOR = new Set(['TQ', ROTULO_DA_VENTILACAO, ROTULO_DO_COLETOR, ROTULO_DO_TRATAMENTO]);
/** As peças que só existem em cima de um tubo de esgoto. */
const CONEXOES = new Set(['CONEXAO_JOELHO_90', 'CONEXAO_JOELHO_45', 'CONEXAO_TE', 'CONEXAO_LUVA', 'CONEXAO_REDUCAO']);
const ehUnidade = (x: Terminal) => (UNIDADES_DE_TRATAMENTO as readonly string[]).includes(x.tipoHidraulico ?? '');

/**
 * Correção 1 (I1): o TRATAMENTO que o usuário confirmou (arrastou, aceitou) fica — unidades e tubos "Tratamento" — quando
 * o destino é o tratamento e nenhuma premissa dele mudou (sem registro: não se sabe que mudou, e a peça confirmada é
 * decisão do usuário). Mudou uma premissa do tratamento: as unidades são refeitas nas medidas e na posição do motor (a
 * confirmação diz isso).
 */
export function tratamentoPreservado(model: BlueprintModel, p: Pick<PremissasDoEsgoto, 'esgoto' | 'tratamento' | 'reservatorio'>): boolean {
  if (destinoDoEsgoto(p.esgoto) !== 'TRATAMENTO') return false;
  if (!(model.terminais ?? []).some((x) => x.disciplina === 'ESGOTO' && ehUnidade(x) && !x.sugerida)) return false;
  const gravadas = registroDe(model, 'ESGOTO', null)?.escolhas;
  if (!gravadas) return true;
  if (gravadas.destino !== 'TRATAMENTO') return false;
  const rotulos = Object.fromEntries(SO_DO_TRATAMENTO.map((k) => [k, ESCOLHAS_DO_ESGOTO.rotulos[k]]));
  return diferencasDasEscolhas(gravadas, escolhasDoEsgoto(p), { ...ESCOLHAS_DO_ESGOTO, rotulos }).length === 0;
}

/**
 * A rede de esgoto do sistema — o que o Refazer apaga (ver o critério no cabeçalho), com o destino em vigor. Correção 1:
 * a ligação aceita só fica com a cota que não é a estimada (I2); o tratamento confirmado fica com `preservarTratamento`
 * (I1).
 */
export function redeDoEsgotoDoSistema(
  model: BlueprintModel,
  destino: DestinoDoEsgoto,
  preservarTratamento = false,
): { trechos: Trecho[]; pecas: Terminal[] } {
  const raizes = [...caixasDeInspecao(model), ...destinosDoEsgoto(model), ...unidadesDeTratamento(model)];
  const ligados = new Set(raizes.flatMap((r) => redeDaOrigem(model, r, 'ESGOTO')).map((t) => t.id));
  const trechos = (model.trechos ?? []).filter(
    (t) => t.disciplina === 'ESGOTO' && (ligados.has(t.id) || ROTULOS_DO_MOTOR.has(t.rotulo ?? '')) && !(preservarTratamento && t.rotulo === ROTULO_DO_TRATAMENTO),
  );
  const pecas = (model.terminais ?? []).filter((x) => {
    if (x.disciplina !== 'ESGOTO') return false;
    if (x.tipoHidraulico === 'CAIXA_INSPECAO') return !!x.sugerida || x.rotulo === ROTULO_DA_CI_DO_COLETOR;
    if (x.tipoHidraulico === 'LIGACAO_ESGOTO') return !!x.sugerida || destino === 'TRATAMENTO' || cotaDaRedeEstimada(x);
    if (ehUnidade(x)) return !preservarTratamento;
    if (x.tipo === TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR || CONEXOES.has(x.tipoHidraulico ?? '')) return trechos.some((t) => sobreOTubo(x, t));
    return false;
  });
  return { trechos, pecas };
}

/** As opções do `planejarEsgotoCompleto`: o filtro e as medidas do tratamento dimensionadas pelas premissas. */
export function opcoesDoEsgoto(model: BlueprintModel, p: Pick<PremissasDoEsgoto, 'esgoto' | 'tratamento' | 'reservatorio'>, apagarConfirmadosDoOutroDestino = false): OpcoesDoEsgotoCompleto {
  const medidas = destinoDoEsgoto(p.esgoto) === 'TRATAMENTO' ? medidasDimensionadas(dimensionarTratamento(model, p.tratamento, p.reservatorio)) : undefined;
  return { tratamento: { comFiltro: p.tratamento.comFiltro, medidas }, apagarConfirmadosDoOutroDestino };
}

/**
 * O REGISTRO no lote de lançar (o "Lançar" e o "Apagar e lançar" do outro destino): vai junto — exceto quando SOBRA rede
 * de esgoto lançada antes com outras escolhas (ou sem registro). Aí o registro antigo fica e o aviso continua aceso:
 * ligar um ponto novo não "aceita" a rede antiga (correção 1 da F2).
 */
export function comRegistroDoEsgoto(model: BlueprintModel, comandos: readonly Command[], p: PremissasDoEsgoto): Command[] {
  if (comandos.length === 0) return [];
  const { hip, escolhas } = lancamentoDoEsgoto(model, p);
  const apagados = new Set(comandos.flatMap((c) => (c.type === 'DeleteTrecho' ? [c.trechoId] : [])));
  const sobra = redeDoEsgotoDoSistema(model, destinoDoEsgoto(hip)).trechos.some((t) => !apagados.has(t.id));
  const registrar = !sobra || (!!registroDe(model, 'ESGOTO', null) && diferencasDoEsgoto(model, p).length === 0);
  return registrar ? [...comandos, comandoDeRegistro('ESGOTO', null, escolhas)] : [...comandos];
}

/** A pendência que o tratamento dá com unidade confirmada — no Refazer que a preserva, não é pendência. */
const PENDENCIA_DO_TRATAMENTO_CONFIRMADO = 'O tratamento já tem unidades confirmadas';

/**
 * REFAZER o esgoto: apaga a rede do sistema (confirmada inclusive; o outro destino inclusive) e lança de novo com as
 * escolhas atuais (e a faixa da casa do registro), num lote só — o registro no mesmo lote (Ctrl+Z volta tudo). Se o
 * relançamento não lançar nada, o registro sai. Bloqueado (`lancamentoDoEsgoto().motivo`): nada (quem chama mostra o
 * motivo). Recusa do kernel lança `KernelError` — quem chama decide o que dizer.
 */
export function comandosDeRefazerEsgoto(
  model: BlueprintModel,
  p: PremissasDoEsgoto,
  terreno: LeitorDoTerreno | null = null,
): { comandos: Command[]; plano: PlanoDoEsgotoCompleto | null } {
  const { hip, escolhas, motivo } = lancamentoDoEsgoto(model, p);
  if (motivo) return { comandos: [], plano: null };
  const preservar = tratamentoPreservado(model, p);
  const rede = redeDoEsgotoDoSistema(model, destinoDoEsgoto(hip), preservar);
  const apagar: Command[] = [
    ...rede.trechos.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...rede.pecas.map((x): Command => ({ type: 'DeleteTerminal', terminalId: x.id })),
  ];
  const m0 = apagar.length ? applyBatch(model, apagar).model : model;
  const bruto = planejarEsgotoCompleto(m0, hip, terreno, opcoesDoEsgoto(m0, p, true));
  const plano = preservar ? { ...bruto, pendencias: bruto.pendencias.filter((x) => !x.startsWith(PENDENCIA_DO_TRATAMENTO_CONFIRMADO)) } : bruto;
  if (apagar.length === 0 && plano.comandos.length === 0) return { comandos: [], plano };
  const registro: Command = plano.comandos.length ? comandoDeRegistro('ESGOTO', null, escolhas) : { type: 'ApagarRegistroDeLancamento', motor: 'ESGOTO', alvoId: null };
  return { comandos: [...apagar, ...plano.comandos, registro], plano };
}

/** O que o Refazer do esgoto apaga — para a confirmação dizer quanto será refeito, por nome, e o que mudou. */
export interface EsgotoARefazer {
  tubos: number;
  tubosConfirmados: number;
  /** As partes com nome, com a contagem de tubos ("tubo de queda (2)", "coletor (4)"). */
  partes: string[];
  pecas: number;
  pecasAceitas: number;
  /** As peças que saem, por nome e quantidade ("1 ligação(ões) à rede pública", "2 joelho(s) de 90°"). */
  pecasPorNome: string[];
  /** Correção 1 (I1): o que o usuário CONFIRMOU e volta à posição/medida do motor (ou sai, sendo do outro destino). */
  voltam: string[];
  /** Correção 1 (I1/I2): o que FICA como está — e, quando uma escolha nova não se aplica a ele, isso dito. */
  ficam: string[];
  /** O que mudou desde o lançamento (`textoDasDiferencas`); `null` = sem registro ou nada mudou. */
  mudou: string | null;
}

const PARTES_DO_ESGOTO: [string, string][] = [
  ['tubo de queda', 'TQ'],
  ['ventilação', ROTULO_DA_VENTILACAO],
  ['coletor', ROTULO_DO_COLETOR],
  ['tratamento', ROTULO_DO_TRATAMENTO],
];

/** O nome de cada peça na confirmação (a chave é o tipo hidráulico; a válvula e as caixas do coletor à parte). */
const NOME_DA_PECA: [string, (x: Terminal) => boolean][] = [
  ['caixa(s) de inspeção sugerida(s)', (x) => x.tipoHidraulico === 'CAIXA_INSPECAO' && x.rotulo !== ROTULO_DA_CI_DO_COLETOR],
  ['caixa(s) de inspeção do coletor', (x) => x.tipoHidraulico === 'CAIXA_INSPECAO' && x.rotulo === ROTULO_DA_CI_DO_COLETOR],
  ['ligação(ões) à rede pública', (x) => x.tipoHidraulico === 'LIGACAO_ESGOTO'],
  ['tanque(s) séptico(s)', (x) => x.tipoHidraulico === 'TANQUE_SEPTICO'],
  ['filtro(s) anaeróbio(s)', (x) => x.tipoHidraulico === 'FILTRO_ANAEROBIO'],
  ['sumidouro(s)', (x) => x.tipoHidraulico === 'SUMIDOURO'],
  ['válvula(s) de admissão de ar', (x) => x.tipo === TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR],
  ['joelho(s) de 90°', (x) => x.tipoHidraulico === 'CONEXAO_JOELHO_90'],
  ['joelho(s) de 45°', (x) => x.tipoHidraulico === 'CONEXAO_JOELHO_45'],
  ['tê(s)', (x) => x.tipoHidraulico === 'CONEXAO_TE'],
  ['luva(s)', (x) => x.tipoHidraulico === 'CONEXAO_LUVA'],
  ['redução(ões)', (x) => x.tipoHidraulico === 'CONEXAO_REDUCAO'],
];

/** O nome curto de cada escolha que o desenho pode fixar ("a profundidade nova não se aplica a ela"). */
const NOME_CURTO_DA_FIXADA: Record<string, string> = {
  profundidadeDaRedeMm: 'a profundidade da rede nova',
  afastamentoDaCiMm: 'o afastamento novo da caixa',
  afastamentoDaCiAAguaMm: 'o afastamento novo da caixa ao alimentador',
};

export function esgotoARefazer(model: BlueprintModel, p: PremissasDoEsgoto): EsgotoARefazer {
  const destino = destinoDoEsgoto(lancamentoDoEsgoto(model, p).hip);
  const preservar = tratamentoPreservado(model, p);
  const rede = redeDoEsgotoDoSistema(model, destino, preservar);
  const d = diferencasDoEsgoto(model, p);
  const conta = (xs: Terminal[], f: (x: Terminal) => boolean) => xs.filter(f).length;
  const aceitas = rede.pecas.filter((x) => !x.sugerida);
  // O que o usuário confirmou e o Refazer refaz (ou tira, sendo do outro destino).
  const voltam: string[] = [];
  const cisDoColetor = conta(aceitas, (x) => x.tipoHidraulico === 'CAIXA_INSPECAO' && x.rotulo === ROTULO_DA_CI_DO_COLETOR);
  if (cisDoColetor) voltam.push(`${cisDoColetor} caixa(s) do coletor aceita(s) — voltam à posição do motor`);
  const ligacoes = conta(aceitas, (x) => x.tipoHidraulico === 'LIGACAO_ESGOTO');
  if (ligacoes) voltam.push(destino === 'TRATAMENTO' ? `${ligacoes} ligação(ões) à rede pública aceita(s) — saem (o destino agora é o tratamento)` : `${ligacoes} ligação(ões) aceita(s) com a cota ESTIMADA — volta(m) à posição e à cota do motor`);
  const unidades = conta(aceitas, ehUnidade);
  if (unidades) voltam.push(destino === 'TRATAMENTO' ? `${unidades} unidade(s) do tratamento confirmada(s) — volta(m) à posição e às medidas do motor` : `${unidades} unidade(s) do tratamento confirmada(s) — sai(em) (o destino agora é a rede pública)`);
  const confirmados = rede.trechos.filter((t) => !t.sugerido).length;
  if (confirmados) voltam.push(`${confirmados} tubo(s) confirmado(s) — voltam ao traçado do motor`);
  // O que fica — e a escolha nova que não se aplica a ele.
  const gravadas = registroDe(model, 'ESGOTO', null)?.escolhas;
  const atuais = escolhasDoEsgoto(p);
  const padroes = ESCOLHAS_DO_ESGOTO.padroes ?? {};
  const mudouAChave = (k: string) => !!gravadas && (gravadas[k] ?? padroes[k]) !== (atuais[k] ?? padroes[k]);
  const fixadas = fixadasPeloDesenho(model, destino);
  const porPeca = new Map<string, string[]>();
  for (const [k, peca] of fixadas) if (mudouAChave(k)) porPeca.set(peca, [...(porPeca.get(peca) ?? []), NOME_CURTO_DA_FIXADA[k]]);
  const ficam: string[] = ['os aparelhos, os ralos e as caixas sifonadas'];
  for (const peca of new Set(fixadas.values())) {
    const nao = porPeca.get(peca);
    ficam.push(`${peca} — fica como está${nao ? `; ${nao.join(' e ')} não se aplica a ela` : ''}`);
  }
  if (preservar) ficam.push('o tanque, o filtro e o sumidouro que você confirmou — ficam onde estão');
  return {
    tubos: rede.trechos.length,
    tubosConfirmados: confirmados,
    partes: PARTES_DO_ESGOTO.flatMap(([nome, rotulo]) => {
      const n = rede.trechos.filter((t) => t.rotulo === rotulo).length;
      return n ? [`${nome} (${n})`] : [];
    }),
    pecas: rede.pecas.length,
    pecasAceitas: aceitas.length,
    pecasPorNome: NOME_DA_PECA.flatMap(([nome, eh]) => {
      const n = rede.pecas.filter(eh).length;
      return n ? [`${n} ${nome}`] : [];
    }),
    voltam,
    ficam,
    mudou: d.length ? textoDasDiferencas(d) : null,
  };
}

/**
 * A lista da confirmação — `null` quando nada do que será apagado foi confirmado/aceito (só sugeridos: refaz direto).
 * Correção 1 (I1): diz, item por item, o que VOLTA à posição/medida do motor e o que FICA. Ex.: "Esgoto: 14 tubo(s) (14
 * confirmado(s)), inclusive coletor (3) e 2 peça(s) (2 aceita(s)): 2 caixa(s) de inspeção do coletor. Voltam: 2 caixa(s)
 * do coletor aceita(s) — voltam à posição do motor; 14 tubo(s) confirmado(s) — voltam ao traçado do motor. Ficam: os
 * aparelhos, os ralos e as caixas sifonadas; a caixa de inspeção que você confirmou — fica como está. O que mudou: …"
 */
export function textoDaConfirmacaoDoEsgoto(r: EsgotoARefazer): string | null {
  if (r.tubosConfirmados === 0 && r.pecasAceitas === 0) return null;
  const tubos = `${r.tubos} tubo(s)${r.tubosConfirmados ? ` (${r.tubosConfirmados} confirmado(s))` : ''}${r.partes.length ? `, inclusive ${r.partes.join(', ')}` : ''}`;
  const pecas = r.pecas ? ` e ${r.pecas} peça(s)${r.pecasAceitas ? ` (${r.pecasAceitas} aceita(s))` : ''}${r.pecasPorNome.length ? `: ${r.pecasPorNome.join(', ')}` : ''}` : '';
  const voltam = r.voltam.length ? ` Voltam: ${r.voltam.join('; ')}.` : '';
  const ficam = r.ficam.length ? ` Ficam: ${r.ficam.join('; ')}.` : '';
  return `Esgoto: ${tubos}${pecas}.${voltam}${ficam}${r.mudou ? ` O que mudou: ${r.mudou}.` : ''}`;
}

/**
 * O botão principal do rodapé do esgoto. `motivo` não nulo = desligado, e é o `title` dele; `refazer` não nulo = o
 * relançar/Refazer bloqueado, com este motivo (o "Lançar" de pontos novos pode seguir ligado — correção 1, menor 1).
 */
export interface BotaoDoEsgoto {
  /** `LANCAR` = o "Lançar" de sempre (com a autorização do outro destino); `RELANCAR` = refaz com as escolhas atuais. */
  modo: 'LANCAR' | 'RELANCAR';
  motivo: string | null;
  refazer: string | null;
}

/**
 * REGRA A do esgoto: bloqueado → o relançar desligado com o motivo, mas há pontos NOVOS a ligar → o "Lançar (n)" segue
 * (como antes da F4; correção 1, menor 1); o DESTINO mudou desde o registro → `RELANCAR` (o aviso diz a troca, e a
 * confirmação do Refazer é a autorização — um caminho só, sem dois avisos); há o que lançar (ou o outro destino
 * confirmado a autorizar, na rede sem registro) → `LANCAR`; nada a lançar e rede existente → `RELANCAR`; nada →
 * desligado, dizendo por quê.
 */
export function botaoDeLancarEsgoto(
  model: BlueprintModel,
  plano: (Pick<PlanoDoEsgotoCompleto, 'comandos' | 'pendencias' | 'confirmadosDoOutroDestino'> & { esgoto?: Pick<PlanoDoEsgotoCompleto['esgoto'], 'comandos'> }) | null,
  diferencas: readonly DiferencaDeEscolha[],
  bloqueio: string | null,
): BotaoDoEsgoto {
  if (bloqueio) {
    const pontosNovos = !!plano?.esgoto && plano.esgoto.comandos.length > 0;
    return { modo: 'LANCAR', motivo: pontosNovos ? null : bloqueio, refazer: bloqueio };
  }
  if (diferencas.some((d) => d.item === 'destino')) return { modo: 'RELANCAR', motivo: null, refazer: null };
  if (plano && (plano.comandos.length > 0 || plano.confirmadosDoOutroDestino.length > 0)) return { modo: 'LANCAR', motivo: null, refazer: null };
  // Os tubos da rede não dependem do destino (só as peças): o destino aqui é indiferente.
  if (redeDoEsgotoDoSistema(model, 'REDE_PUBLICA').trechos.length > 0) return { modo: 'RELANCAR', motivo: null, refazer: null };
  return { modo: 'LANCAR', motivo: plano?.pendencias[0] ?? 'Nada a lançar: não há ponto de esgoto a ligar.', refazer: null };
}
