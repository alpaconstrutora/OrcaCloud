/**
 * PRÉ-DIMENSIONAMENTO ELÉTRICO com hipóteses declaradas — NBR 5410:2004.
 *
 * ─── O PEDIDO (13/09/2026) ─────────────────────────────────────────────────
 *
 * Item 6 da lista de pendências: *"corrente por circuito (VA ÷ V), seção
 * mínima pela tabela da 5410, disjuntor coerente com a seção, queda de tensão
 * estimada"* — pelo molde da topografia: **pré-dimensionamento com hipóteses
 * escritas + emissão pelo responsável técnico**. Plano em
 * `docs/planos/2026-09-13-pre-dimensionamento-eletrico-plano.md`.
 *
 * ─── ⚠️ O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────
 *
 * CALCULA a partir do que foi DECLARADO (potências em VA, tensão, ligação,
 * pontos do circuito, eletrodutos desenhados) e SUGERE: seção, disjuntor,
 * queda de tensão. Não grava nada no desenho — `Circuito.secaoMm2` e
 * `disjuntorA` continuam sendo o que o projetista escolheu; a tela mostra o
 * calculado AO LADO do declarado e acusa quando o declarado não atende.
 *
 * Toda hipótese que muda um número está em `HipotesesEletricas`, com o
 * padrão e a tabela da norma de onde saiu. A tela chama de
 * "pré-dimensionamento"; o dimensionamento é do responsável técnico.
 *
 * ─── ⚠️ AS TABELAS SÃO TRANSCRIÇÃO, NÃO MEMÓRIA ────────────────────────────
 *
 * Tabelas 36, 40, 42 e 47 transcritas do texto da ABNT NBR 5410:2004 enviado
 * pelo usuário em 13/09/2026 (páginas 101, 106, 108 e 113). Um valor errado
 * aqui sai "plausível" numa prancha — por isso cada tabela cita a página, e o
 * teste confere pontos escolhidos contra o PDF.
 *
 * Só COBRE com isolação PVC (Tabela 36). A Tabela 37 (EPR/XLPE) e as de
 * alumínio não foram transcritas: a hipótese recusa o que não tem tabela, em
 * vez de aproximar.
 *
 * Puro: números entram, números e textos saem.
 */
import type { BlueprintModel, Circuito, LigacaoDoCircuito, Quadro, Terminal, Trecho } from './blueprintKernel';
import { comprimentoDoTrecho } from './blueprintRede';

// ─── Tabela 36 — capacidade de condução de corrente (A) ────────────────────
//
// ABNT NBR 5410:2004, p. 101. Condutores de COBRE, isolação PVC, temperatura
// no condutor 70 °C, ambiente 30 °C (ar) / 20 °C (solo). Colunas: métodos de
// referência A1, A2, B1, B2, C, D — cada um com 2 e 3 condutores carregados.

export type MetodoDeInstalacao = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D';
export const METODOS_DE_INSTALACAO: readonly MetodoDeInstalacao[] = ['A1', 'A2', 'B1', 'B2', 'C', 'D'];

/** [seção mm², A1/2, A1/3, A2/2, A2/3, B1/2, B1/3, B2/2, B2/3, C/2, C/3, D/2, D/3] */
export const TABELA_36_COBRE_PVC: readonly (readonly number[])[] = [
  [0.5, 7, 7, 7, 7, 9, 8, 9, 8, 10, 9, 12, 10],
  [0.75, 9, 9, 9, 9, 11, 10, 11, 10, 13, 11, 15, 12],
  [1, 11, 10, 11, 10, 14, 12, 13, 12, 15, 14, 18, 15],
  [1.5, 14.5, 13.5, 14, 13, 17.5, 15.5, 16.5, 15, 19.5, 17.5, 22, 18],
  [2.5, 19.5, 18, 18.5, 17.5, 24, 21, 23, 20, 27, 24, 29, 24],
  [4, 26, 24, 25, 23, 32, 28, 30, 27, 36, 32, 38, 31],
  [6, 34, 31, 32, 29, 41, 36, 38, 34, 46, 41, 47, 39],
  [10, 46, 42, 43, 39, 57, 50, 52, 46, 63, 57, 63, 52],
  [16, 61, 56, 57, 52, 76, 68, 69, 62, 85, 76, 81, 67],
  [25, 80, 73, 75, 68, 101, 89, 90, 80, 112, 96, 104, 86],
  [35, 99, 89, 92, 83, 125, 110, 111, 99, 138, 119, 125, 103],
  [50, 119, 108, 110, 99, 151, 134, 133, 118, 168, 144, 148, 122],
  [70, 151, 136, 139, 125, 192, 171, 168, 149, 213, 184, 183, 151],
  [95, 182, 164, 167, 150, 232, 207, 201, 179, 258, 223, 216, 179],
  [120, 210, 188, 192, 172, 269, 239, 232, 206, 299, 259, 246, 203],
  [150, 240, 216, 219, 196, 309, 275, 265, 236, 344, 299, 278, 230],
  [185, 273, 245, 248, 223, 353, 314, 300, 268, 392, 341, 312, 258],
  [240, 321, 286, 291, 261, 415, 370, 351, 313, 461, 403, 361, 297],
  [300, 367, 328, 334, 298, 477, 426, 401, 358, 530, 464, 408, 336],
  [400, 438, 390, 398, 355, 571, 510, 477, 425, 634, 557, 478, 394],
  [500, 502, 447, 456, 406, 656, 587, 545, 486, 729, 642, 540, 445],
  [630, 578, 514, 526, 467, 758, 678, 626, 559, 843, 743, 614, 506],
  [800, 669, 593, 609, 540, 881, 788, 723, 645, 978, 865, 700, 577],
  [1000, 767, 679, 698, 618, 1012, 906, 827, 738, 1125, 996, 792, 652],
];

/** As seções nominais da Tabela 36, em ordem. */
export const SECOES_NOMINAIS_MM2: readonly number[] = TABELA_36_COBRE_PVC.map((l) => l[0]);

/** A coluna da Tabela 36 para o método e o número de condutores carregados. */
function colunaDaTabela36(metodo: MetodoDeInstalacao, condutoresCarregados: 2 | 3): number {
  return 1 + METODOS_DE_INSTALACAO.indexOf(metodo) * 2 + (condutoresCarregados === 3 ? 1 : 0);
}

/** Iz de TABELA (sem correções) para a seção, ou `null` se a seção não é nominal. */
export function izDeTabelaA(
  secaoMm2: number,
  metodo: MetodoDeInstalacao,
  condutoresCarregados: 2 | 3,
): number | null {
  const linha = TABELA_36_COBRE_PVC.find((l) => l[0] === secaoMm2);
  return linha ? linha[colunaDaTabela36(metodo, condutoresCarregados)] : null;
}

// ─── Tabela 40 — fatores de correção de temperatura ─────────────────────────
//
// ABNT NBR 5410:2004, p. 106. Referência: 30 °C no ar (métodos A a C) e 20 °C
// no solo (método D). Só a coluna PVC — é a isolação da Tabela 36.

export const TABELA_40_PVC_AMBIENTE: readonly (readonly [number, number])[] = [
  [10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1.0], [35, 0.94],
  [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5],
];
export const TABELA_40_PVC_SOLO: readonly (readonly [number, number])[] = [
  [10, 1.1], [15, 1.05], [20, 1.0], [25, 0.95], [30, 0.89], [35, 0.84],
  [40, 0.77], [45, 0.71], [50, 0.63], [55, 0.55], [60, 0.45],
];

/**
 * O fator de temperatura para a hipótese. Temperaturas fora dos degraus da
 * tabela caem no degrau IMEDIATAMENTE mais quente (a favor da segurança);
 * acima do último degrau, `null` — a norma não dá fator, e não vamos inventar.
 */
export function fatorDeTemperatura(temperaturaC: number, metodo: MetodoDeInstalacao): number | null {
  const tabela = metodo === 'D' ? TABELA_40_PVC_SOLO : TABELA_40_PVC_AMBIENTE;
  for (const [t, f] of tabela) if (temperaturaC <= t) return f;
  return null;
}

// ─── Tabela 42 — fator de agrupamento (linha 1) ────────────────────────────
//
// ABNT NBR 5410:2004, p. 108, linha 1: "em feixe: ao ar livre ou sobre
// superfície; embutidos; em conduto fechado" — o caso do eletroduto embutido.
// As demais linhas (camada única sobre parede, teto, bandeja) não se aplicam
// aos métodos que desenhamos e não foram transcritas.

export function fatorDeAgrupamento(numeroDeCircuitos: number): number {
  const n = Math.max(1, Math.floor(numeroDeCircuitos));
  if (n <= 8) return [1.0, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52][n - 1];
  if (n <= 11) return 0.5;
  if (n <= 15) return 0.45;
  if (n <= 19) return 0.41;
  return 0.38;
}

// ─── Tabela 47 — seção mínima por utilização ────────────────────────────────
//
// ABNT NBR 5410:2004, p. 113. Condutores isolados, cobre: iluminação 1,5 mm²;
// força 2,5 mm² — e a nota 2 é a que importa aqui: "os circuitos de tomadas
// de corrente são considerados circuitos de força".

export type UsoDoCircuito = 'ILUMINACAO' | 'FORCA';
export const SECAO_MINIMA_POR_USO_MM2: Record<UsoDoCircuito, number> = {
  ILUMINACAO: 1.5,
  FORCA: 2.5,
};

/**
 * O uso do circuito pelos PONTOS que ele alimenta: qualquer tomada, ponto de
 * força ou ligação direta faz dele circuito de força; só iluminação (e seus
 * interruptores) é iluminação. Sem pontos, `null`.
 */
export function usoDoCircuito(pontos: readonly Pick<Terminal, 'tipoEletrico'>[]): UsoDoCircuito | null {
  if (pontos.length === 0) return null;
  const ehForca = pontos.some(
    (p) => p.tipoEletrico && !p.tipoEletrico.startsWith('ILUMINACAO') && p.tipoEletrico !== 'INTERRUPTOR',
  );
  return ehForca ? 'FORCA' : 'ILUMINACAO';
}

// ─── Hipóteses ─────────────────────────────────────────────────────────────

export interface HipotesesEletricas {
  /** Método de referência da Tabela 33/36. Eletroduto embutido em alvenaria = B1. */
  metodoDeInstalacao: MetodoDeInstalacao;
  /** Temperatura ambiente (ar) ou do solo (método D), °C — Tabela 40. */
  temperaturaAmbienteC: number;
  /** Circuitos no mesmo eletroduto/feixe — Tabela 42, linha 1. */
  circuitosAgrupados: number;
  /**
   * Resistividade do cobre, Ω·mm²/m. Padrão: 0,0206 a 70 °C
   * (0,01724 a 20 °C × (1 + 0,00393 × 50)). Alternativa usual: 1/56 = 0,01786 a 20 °C.
   */
  rhoOhmMm2PorM: number;
  /** Limite de queda de tensão no circuito terminal, % (6.2.7: 4 % é o usual). */
  limiteQuedaTerminalPct: number;
  /** Correntes nominais de disjuntor disponíveis, em A. */
  catalogoDeDisjuntoresA: readonly number[];
  /**
   * F6 — fatores de demanda por grupo de carga, com o NOME da tabela de
   * origem. Padrão: sem demanda. A tabela é da concessionária, não da 5410.
   */
  demanda: FatoresDeDemanda;
  /** Queda da origem ao pior ponto (6.2.7.1): 5 % rede pública, 7 % transformador próprio. */
  limiteQuedaTotalPct: number;
  /** Desequilíbrio de fases tolerado num quadro trifásico, % (aviso acima). */
  desequilibrioMaxPct: number;
}

export const HIPOTESES_PADRAO: HipotesesEletricas = {
  metodoDeInstalacao: 'B1',
  temperaturaAmbienteC: 30,
  circuitosAgrupados: 1,
  rhoOhmMm2PorM: 0.0206,
  limiteQuedaTerminalPct: 4,
  catalogoDeDisjuntoresA: [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100],
  demanda: { nome: 'sem demanda (1,00)', ILUMINACAO: 1, TUG: 1, FORCA: 1 },
  limiteQuedaTotalPct: 5,
  desequilibrioMaxPct: 10,
};

// ─── Corrente de projeto ───────────────────────────────────────────────────

/** Condutores carregados pela ligação: FN e FF → 2; FFF → 3. */
export function condutoresCarregados(ligacao: LigacaoDoCircuito): 2 | 3 {
  return ligacao === 'FFF' ? 3 : 2;
}

/**
 * IB = S ÷ V (FN, FF) ou S ÷ (√3 · V) (FFF). S em VA — já é potência
 * aparente, por isso não há fator de potência aqui.
 */
export function correnteDeProjetoA(sVA: number, tensaoV: number, ligacao: LigacaoDoCircuito): number {
  if (tensaoV <= 0) return 0;
  return ligacao === 'FFF' ? sVA / (Math.sqrt(3) * tensaoV) : sVA / tensaoV;
}

// ─── Iz corrigida, seção mínima, disjuntor ─────────────────────────────────

/** Iz corrigida = Iz de tabela × f_temperatura × f_agrupamento; `null` sem tabela. */
export function capacidadeCorrigidaA(
  secaoMm2: number,
  hip: HipotesesEletricas,
  ligacao: LigacaoDoCircuito,
): number | null {
  const tabela = izDeTabelaA(secaoMm2, hip.metodoDeInstalacao, condutoresCarregados(ligacao));
  const ft = fatorDeTemperatura(hip.temperaturaAmbienteC, hip.metodoDeInstalacao);
  if (tabela == null || ft == null) return null;
  return tabela * ft * fatorDeAgrupamento(hip.circuitosAgrupados);
}

export interface SecaoMinima {
  secaoMm2: number;
  /** Iz corrigida da seção escolhida. */
  izA: number;
  /** Qual critério mandou: a corrente (Tab. 36) ou o mínimo por uso (Tab. 47). */
  criterio: 'CORRENTE' | 'USO';
}

/**
 * A menor seção nominal que atende à corrente (Iz corrigida ≥ IB) E ao
 * mínimo por uso (Tabela 47). `null` quando nem a maior seção da tabela
 * alcança IB, ou quando a temperatura não tem fator.
 */
export function secaoMinima(
  ibA: number,
  hip: HipotesesEletricas,
  ligacao: LigacaoDoCircuito,
  uso: UsoDoCircuito | null,
): SecaoMinima | null {
  const minimoPorUso = uso ? SECAO_MINIMA_POR_USO_MM2[uso] : 0;
  for (const secao of SECOES_NOMINAIS_MM2) {
    if (secao < minimoPorUso) continue;
    const iz = capacidadeCorrigidaA(secao, hip, ligacao);
    if (iz == null) return null;
    if (iz >= ibA) {
      // Se uma seção MENOR já atenderia à corrente, quem mandou foi o uso.
      const anterior = SECOES_NOMINAIS_MM2.filter((s) => s < secao).reverse()
        .find((s) => (capacidadeCorrigidaA(s, hip, ligacao) ?? 0) >= ibA);
      return { secaoMm2: secao, izA: iz, criterio: anterior != null ? 'USO' : 'CORRENTE' };
    }
  }
  return null;
}

/**
 * O menor disjuntor do catálogo com IB ≤ In ≤ Iz (NBR 5410 5.3.4.1). `null`
 * quando nenhum cabe — que é o caso de a seção estar apertada demais para a
 * corrente: aí a resposta é a seção, não o disjuntor.
 */
export function disjuntorSugeridoA(ibA: number, izA: number, catalogo: readonly number[]): number | null {
  const ordenado = [...catalogo].sort((a, b) => a - b);
  return ordenado.find((inA) => inA >= ibA && inA <= izA) ?? null;
}

// ─── Queda de tensão ───────────────────────────────────────────────────────

/**
 * ΔV% = 2 · ρ · L · IB ÷ (S · V) · 100 (FN e FF — ida e volta);
 * ΔV% = √3 · ρ · L · IB ÷ (S · V) · 100 (FFF).
 * L em METROS até o ponto mais distante, S em mm².
 */
export function quedaDeTensaoPct(
  ibA: number,
  comprimentoM: number,
  secaoMm2: number,
  tensaoV: number,
  ligacao: LigacaoDoCircuito,
  rhoOhmMm2PorM: number,
): number {
  if (secaoMm2 <= 0 || tensaoV <= 0) return 0;
  const k = ligacao === 'FFF' ? Math.sqrt(3) : 2;
  return ((k * rhoOhmMm2PorM * comprimentoM * ibA) / (secaoMm2 * tensaoV)) * 100;
}

// ─── Comprimento do circuito ───────────────────────────────────────────────

export interface ComprimentoDoCircuito {
  metros: number;
  /**
   * `ELETRODUTOS`: caminho mais longo a partir do quadro pelos eletrodutos do
   * circuito (com prumadas). `ESTIMADO`: a rede do circuito não chega ao
   * quadro (ou não há eletroduto) — distância em planta do quadro ao ponto
   * mais distante, mais o desnível de cota.
   */
  origem: 'ELETRODUTOS' | 'ESTIMADO';
}

const chaveDePonta = (x: number, y: number, cota: number) => `${x},${y},${cota}`;

/**
 * O comprimento até o ponto mais distante — o que a queda de tensão precisa.
 *
 * ⚠️ Pelos ELETRODUTOS quando eles existem e encostam no quadro: é o caminho
 * real do condutor, com as prumadas. Quando não, uma ESTIMATIVA declarada
 * como tal: nunca um número calado, e nunca zero — zero diria "sem queda".
 */
export function comprimentoDoCircuito(model: BlueprintModel, circuito: Circuito): ComprimentoDoCircuito | null {
  const quadro = (model.quadros ?? []).find((q) => q.id === circuito.quadroId);
  if (!quadro) return null;
  const trechos = (model.trechos ?? []).filter((t) => t.circuitoId === circuito.id);
  const pontos = (model.terminais ?? []).filter((t) => t.circuitoId === circuito.id);

  // Grafo pelas pontas coincidentes (mesmo x, y e cota).
  const arestas = new Map<string, { para: string; metros: number }[]>();
  const ligar = (de: string, para: string, metros: number) => {
    arestas.set(de, [...(arestas.get(de) ?? []), { para, metros }]);
  };
  for (const t of trechos) {
    const a = chaveDePonta(t.a.x, t.a.y, t.cotaAMm);
    const b = chaveDePonta(t.b.x, t.b.y, t.cotaBMm);
    const metros = comprimentoDoTrecho(t as Trecho) / 1000;
    ligar(a, b, metros);
    ligar(b, a, metros);
  }
  // O quadro pode receber o eletroduto em qualquer cota: toda ponta em (x, y)
  // do quadro é partida.
  const partidas = [...arestas.keys()].filter((k) => k.startsWith(`${quadro.at.x},${quadro.at.y},`));
  if (partidas.length > 0) {
    let maior = 0;
    const visitar = (no: string, acumulado: number, visitados: Set<string>) => {
      maior = Math.max(maior, acumulado);
      for (const { para, metros } of arestas.get(no) ?? []) {
        if (visitados.has(para)) continue;
        visitados.add(para);
        visitar(para, acumulado + metros, visitados);
        visitados.delete(para);
      }
    };
    for (const p of partidas) visitar(p, 0, new Set([p]));
    return { metros: maior, origem: 'ELETRODUTOS' };
  }

  if (pontos.length === 0) return null;
  const metros = Math.max(
    ...pontos.map(
      (p) => (Math.hypot(p.at.x - quadro.at.x, p.at.y - quadro.at.y) + Math.abs(p.cotaMm - quadro.cotaMm)) / 1000,
    ),
  );
  return { metros, origem: 'ESTIMADO' };
}

// ─── O circuito inteiro ────────────────────────────────────────────────────

/** Número com UMA casa e vírgula — é assim que a prancha escreve "14,2 A". */
const n1 = (v: number) => v.toFixed(1).replace('.', ',');
/** Seção como se lê: "2,5 mm²". */
const mm2 = (v: number) => String(v).replace('.', ',');

export interface AchadoDoDimensionamento {
  nivel: 'FALTA' | 'AVISO';
  /** O item da norma que sustenta o achado. */
  referencia: string;
  mensagem: string;
}

export interface PreDimensionamentoDoCircuito {
  circuitoId: string;
  nome: string;
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  /** Soma das potências declaradas (VA) e quantos pontos ficaram de fora. */
  sVA: number;
  pontos: number;
  pontosSemPotencia: number;
  uso: UsoDoCircuito | null;
  ibA: number | null;
  /** A seção que a norma pede, com a Iz corrigida dela. */
  secaoCalculada: SecaoMinima | null;
  secaoDeclaradaMm2: number | null;
  /** Iz corrigida da seção DECLARADA — é contra ela que o disjuntor se confere. */
  izDeclaradaA: number | null;
  disjuntorSugeridoA: number | null;
  disjuntorDeclaradoA: number | null;
  comprimento: ComprimentoDoCircuito | null;
  /** Queda com a seção declarada (ou, sem declarada, com a calculada). */
  quedaPct: number | null;
  /** A menor seção nominal que traria a queda para dentro do limite. */
  secaoParaQuedaMm2: number | null;
  achados: AchadoDoDimensionamento[];
  naoAvaliado: string[];
}

export function preDimensionarCircuito(
  model: BlueprintModel,
  circuito: Circuito,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
): PreDimensionamentoDoCircuito {
  const pontos = (model.terminais ?? []).filter((t) => t.circuitoId === circuito.id);
  const comPotencia = pontos.filter((t) => t.potenciaW != null);
  const sVA = comPotencia.reduce((s, t) => s + (t.potenciaW as number), 0);
  const ligacao = circuito.ligacao ?? 'FN';
  const tensaoV = circuito.tensaoV ?? null;
  const uso = usoDoCircuito(pontos);
  const achados: AchadoDoDimensionamento[] = [];
  const naoAvaliado: string[] = [];
  const secaoDeclaradaMm2 = circuito.secaoMm2 ?? null;
  const disjuntorDeclaradoA = circuito.disjuntorA ?? null;

  const base: PreDimensionamentoDoCircuito = {
    circuitoId: circuito.id,
    nome: circuito.nome,
    ligacao,
    tensaoV,
    sVA,
    pontos: pontos.length,
    pontosSemPotencia: pontos.length - comPotencia.length,
    uso,
    ibA: null,
    secaoCalculada: null,
    secaoDeclaradaMm2,
    izDeclaradaA: null,
    disjuntorSugeridoA: null,
    disjuntorDeclaradoA,
    comprimento: comprimentoDoCircuito(model, circuito),
    quedaPct: null,
    secaoParaQuedaMm2: null,
    achados,
    naoAvaliado,
  };

  if (pontos.length - comPotencia.length > 0) {
    naoAvaliado.push(`${pontos.length - comPotencia.length} ponto(s) sem potência — IB é um piso, não o valor`);
  }
  if (tensaoV == null) {
    naoAvaliado.push('sem tensão declarada — nada se calcula');
    return base;
  }
  if (pontos.length === 0) {
    naoAvaliado.push('circuito sem pontos');
    return base;
  }

  const ibA = correnteDeProjetoA(sVA, tensaoV, ligacao);
  base.ibA = ibA;

  // Seção mínima (Tab. 36 corrigida + Tab. 47).
  const calc = secaoMinima(ibA, hip, ligacao, uso);
  base.secaoCalculada = calc;
  if (!calc) {
    naoAvaliado.push('IB acima da maior seção da Tabela 36 ou temperatura sem fator');
  }
  if (secaoDeclaradaMm2 != null) {
    const izDecl = capacidadeCorrigidaA(secaoDeclaradaMm2, hip, ligacao);
    base.izDeclaradaA = izDecl;
    if (izDecl == null) {
      naoAvaliado.push(`seção declarada ${mm2(secaoDeclaradaMm2)} mm² não é nominal da Tabela 36`);
    } else {
      if (izDecl < ibA) {
        achados.push({
          nivel: 'FALTA',
          referencia: '6.2.6.1.2 a) / Tab. 36',
          mensagem: `seção ${mm2(secaoDeclaradaMm2)} mm² conduz ${n1(izDecl)} A, abaixo de IB ${n1(ibA)} A${calc ? ` — mínimo ${mm2(calc.secaoMm2)} mm²` : ''}`,
        });
      }
      if (uso && secaoDeclaradaMm2 < SECAO_MINIMA_POR_USO_MM2[uso]) {
        achados.push({
          nivel: 'FALTA',
          referencia: '6.2.6.1.1 / Tab. 47',
          mensagem: `circuito de ${uso === 'FORCA' ? 'força (tomadas)' : 'iluminação'} pede no mínimo ${mm2(SECAO_MINIMA_POR_USO_MM2[uso])} mm²; declarado ${mm2(secaoDeclaradaMm2)}`,
        });
      }
    }
  }

  // Disjuntor: IB ≤ In ≤ Iz — contra a seção declarada (é a que vai existir),
  // ou contra a calculada quando não há declarada.
  const izReferencia = base.izDeclaradaA ?? calc?.izA ?? null;
  if (izReferencia != null) {
    base.disjuntorSugeridoA = disjuntorSugeridoA(ibA, izReferencia, hip.catalogoDeDisjuntoresA);
    if (disjuntorDeclaradoA != null) {
      if (disjuntorDeclaradoA < ibA) {
        achados.push({
          nivel: 'FALTA',
          referencia: '5.3.4.1',
          mensagem: `disjuntor ${disjuntorDeclaradoA} A abaixo de IB ${n1(ibA)} A — desarma em uso normal`,
        });
      } else if (disjuntorDeclaradoA > izReferencia) {
        achados.push({
          nivel: 'FALTA',
          referencia: '5.3.4.1',
          mensagem: `disjuntor ${disjuntorDeclaradoA} A acima da capacidade do condutor (${n1(izReferencia)} A) — não protege contra sobrecarga`,
        });
      }
    }
  }

  // Queda de tensão, com a seção que vai existir.
  const secaoParaQueda = secaoDeclaradaMm2 ?? calc?.secaoMm2 ?? null;
  if (base.comprimento && secaoParaQueda != null) {
    const queda = quedaDeTensaoPct(ibA, base.comprimento.metros, secaoParaQueda, tensaoV, ligacao, hip.rhoOhmMm2PorM);
    base.quedaPct = queda;
    if (queda > hip.limiteQuedaTerminalPct) {
      const atende = SECOES_NOMINAIS_MM2.find(
        (s) =>
          s > secaoParaQueda &&
          quedaDeTensaoPct(ibA, base.comprimento!.metros, s, tensaoV, ligacao, hip.rhoOhmMm2PorM) <=
            hip.limiteQuedaTerminalPct,
      );
      base.secaoParaQuedaMm2 = atende ?? null;
      achados.push({
        nivel: 'FALTA',
        referencia: '6.2.7',
        mensagem: `queda de ${n1(queda)} % em ${n1(base.comprimento.metros)} m (${base.comprimento.origem === 'ESTIMADO' ? 'estimado sem eletroduto' : 'pelos eletrodutos'}), limite ${hip.limiteQuedaTerminalPct} %${atende ? ` — ${mm2(atende)} mm² atenderia` : ''}`,
      });
    }
    if (base.comprimento.origem === 'ESTIMADO') {
      naoAvaliado.push('comprimento estimado em planta — a rede do circuito não chega ao quadro');
    }
  } else if (!base.comprimento) {
    naoAvaliado.push('sem comprimento — nem eletroduto nem ponto para estimar');
  }

  return base;
}

/** Todos os circuitos de um quadro, na ordem do nome. */
export function preDimensionarQuadro(
  model: BlueprintModel,
  quadroId: string,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
): PreDimensionamentoDoCircuito[] {
  return (model.circuitos ?? [])
    .filter((c) => c.quadroId === quadroId)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((c) => preDimensionarCircuito(model, c, hip));
}

// ─── F6 — QUADRO E ALIMENTADOR: demanda, fases, disjuntor geral ────────────
//
// O circuito terminal é dimensionado pela carga que pode alimentar (F1–F4).
// O QUADRO, não: a norma admite fator de demanda no alimentador — e a tabela
// de demanda é da CONCESSIONÁRIA, não da NBR 5410. Por isso ela entra como
// hipótese NOMEADA (`demanda.nome`), padrão 1,00 em todos os grupos (sem
// demanda), nunca como verdade do software.

/** Os grupos de carga que a demanda distingue. */
export type GrupoDeCarga = 'ILUMINACAO' | 'TUG' | 'FORCA';

/** O grupo de um ponto pelo tipo: luz → iluminação; TUG e dados → TUG; TUE e ligação direta → força. */
export function grupoDeCarga(tipoEletrico: Terminal['tipoEletrico']): GrupoDeCarga | null {
  if (!tipoEletrico || tipoEletrico === 'INTERRUPTOR') return null;
  if (tipoEletrico.startsWith('ILUMINACAO')) return 'ILUMINACAO';
  if (tipoEletrico === 'TUE' || tipoEletrico === 'LIGACAO_DIRETA') return 'FORCA';
  return 'TUG';
}

export interface FatoresDeDemanda {
  /** O nome da tabela de onde os fatores saíram ("sem demanda", "NT da concessionária X"). */
  nome: string;
  ILUMINACAO: number;
  TUG: number;
  FORCA: number;
}

export const DEMANDA_SEM_FATOR: FatoresDeDemanda = { nome: 'sem demanda (1,00)', ILUMINACAO: 1, TUG: 1, FORCA: 1 };

export interface CargaPorFase {
  R: number;
  S: number;
  T: number;
}

export interface PreDimensionamentoDoQuadro {
  quadroId: string;
  nome: string;
  circuitos: PreDimensionamentoDoCircuito[];
  /** Soma dos VA declarados por grupo, antes da demanda. */
  porGrupoVA: Record<GrupoDeCarga, number>;
  sInstaladaVA: number;
  /** Depois dos fatores de demanda declarados. */
  sDemandadaVA: number;
  demanda: FatoresDeDemanda;
  /** A alimentação: declarada no quadro, ou deduzida dos circuitos (dita). */
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  ligacaoDeduzida: boolean;
  ibA: number | null;
  secaoCalculada: SecaoMinima | null;
  disjuntorGeralA: number | null;
  /** Queda no alimentador, com o comprimento declarado; `null` sem comprimento. */
  quedaAlimentadorPct: number | null;
  /** Alimentador + o pior circuito terminal — é o que a 6.2.7 limita da origem ao ponto. */
  quedaTotalMaxPct: number | null;
  /** Só em quadro trifásico: a carga por fase dos circuitos FN e o desequilíbrio. */
  fases: CargaPorFase | null;
  desequilibrioPct: number | null;
  achados: AchadoDoDimensionamento[];
  naoAvaliado: string[];
}

/** A ligação do quadro: a declarada; senão, trifásico se algum circuito for; senão FN. */
function ligacaoDoQuadro(quadro: Quadro, circuitos: readonly Circuito[]): { ligacao: LigacaoDoCircuito; deduzida: boolean } {
  if (quadro.ligacao) return { ligacao: quadro.ligacao, deduzida: false };
  if (circuitos.some((c) => c.ligacao === 'FFF')) return { ligacao: 'FFF', deduzida: true };
  if (circuitos.some((c) => c.ligacao === 'FF')) return { ligacao: 'FF', deduzida: true };
  return { ligacao: 'FN', deduzida: true };
}

/** A tensão do quadro: a declarada; senão a mais frequente entre os circuitos. */
function tensaoDoQuadro(quadro: Quadro, circuitos: readonly Circuito[]): number | null {
  if (quadro.tensaoV) return quadro.tensaoV;
  const contagem = new Map<number, number>();
  for (const c of circuitos) if (c.tensaoV) contagem.set(c.tensaoV, (contagem.get(c.tensaoV) ?? 0) + 1);
  let melhor: number | null = null;
  let n = 0;
  for (const [v, k] of contagem) if (k > n) (melhor = v), (n = k);
  return melhor;
}

export function preDimensionarQuadroCompleto(
  model: BlueprintModel,
  quadroId: string,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
): PreDimensionamentoDoQuadro | null {
  const quadro = (model.quadros ?? []).find((q) => q.id === quadroId);
  if (!quadro) return null;
  const circuitosDoQuadro = (model.circuitos ?? []).filter((c) => c.quadroId === quadroId);
  const circuitos = preDimensionarQuadro(model, quadroId, hip);
  const achados: AchadoDoDimensionamento[] = [];
  const naoAvaliado: string[] = [];

  // Carga por grupo.
  const porGrupoVA: Record<GrupoDeCarga, number> = { ILUMINACAO: 0, TUG: 0, FORCA: 0 };
  let semPotencia = 0;
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA' || !t.circuitoId) continue;
    if (!circuitosDoQuadro.some((c) => c.id === t.circuitoId)) continue;
    const g = grupoDeCarga(t.tipoEletrico);
    if (!g) continue;
    if (t.potenciaW == null) {
      semPotencia++;
      continue;
    }
    porGrupoVA[g] += t.potenciaW;
  }
  if (semPotencia > 0) naoAvaliado.push(`${semPotencia} ponto(s) sem potência fora da soma do quadro`);
  const sInstaladaVA = porGrupoVA.ILUMINACAO + porGrupoVA.TUG + porGrupoVA.FORCA;
  const demanda = hip.demanda;
  const sDemandadaVA = porGrupoVA.ILUMINACAO * demanda.ILUMINACAO + porGrupoVA.TUG * demanda.TUG + porGrupoVA.FORCA * demanda.FORCA;

  const { ligacao, deduzida } = ligacaoDoQuadro(quadro, circuitosDoQuadro);
  const tensaoV = tensaoDoQuadro(quadro, circuitosDoQuadro);
  if (deduzida) naoAvaliado.push(`ligação do quadro não declarada — assumida ${ligacao} pelos circuitos`);

  const base: PreDimensionamentoDoQuadro = {
    quadroId,
    nome: quadro.nome,
    circuitos,
    porGrupoVA,
    sInstaladaVA,
    sDemandadaVA,
    demanda,
    ligacao,
    tensaoV,
    ligacaoDeduzida: deduzida,
    ibA: null,
    secaoCalculada: null,
    disjuntorGeralA: null,
    quedaAlimentadorPct: null,
    quedaTotalMaxPct: null,
    fases: null,
    desequilibrioPct: null,
    achados,
    naoAvaliado,
  };

  if (tensaoV == null) {
    naoAvaliado.push('sem tensão no quadro nem nos circuitos — alimentador não calculado');
  } else if (sDemandadaVA > 0) {
    const ibA = correnteDeProjetoA(sDemandadaVA, tensaoV, ligacao);
    base.ibA = ibA;
    base.secaoCalculada = secaoMinima(ibA, hip, ligacao, 'FORCA');
    if (base.secaoCalculada) {
      base.disjuntorGeralA = disjuntorSugeridoA(ibA, base.secaoCalculada.izA, hip.catalogoDeDisjuntoresA);
      if (quadro.alimentadorM != null && quadro.alimentadorM > 0) {
        const queda = quedaDeTensaoPct(ibA, quadro.alimentadorM, base.secaoCalculada.secaoMm2, tensaoV, ligacao, hip.rhoOhmMm2PorM);
        base.quedaAlimentadorPct = queda;
        const piorTerminal = Math.max(0, ...circuitos.map((c) => c.quedaPct ?? 0));
        base.quedaTotalMaxPct = queda + piorTerminal;
        if (base.quedaTotalMaxPct > hip.limiteQuedaTotalPct) {
          achados.push({
            nivel: 'FALTA',
            referencia: '6.2.7.1',
            mensagem: `queda da origem ao pior ponto ${n1(base.quedaTotalMaxPct)} % (alimentador ${n1(queda)} % + terminal ${n1(piorTerminal)} %), limite ${hip.limiteQuedaTotalPct} %`,
          });
        }
      } else {
        naoAvaliado.push('comprimento do alimentador não declarado — queda da origem não calculada');
      }
    } else {
      naoAvaliado.push('IB do alimentador acima da Tabela 36 ou temperatura sem fator');
    }
  }

  // Balanceamento — só faz sentido em quadro trifásico.
  if (ligacao === 'FFF') {
    const fases: CargaPorFase = { R: 0, S: 0, T: 0 };
    const semFase: string[] = [];
    for (const c of circuitosDoQuadro) {
      const r = circuitos.find((x) => x.circuitoId === c.id);
      const s = r?.sVA ?? 0;
      const lig = c.ligacao ?? 'FN';
      if (lig === 'FFF') {
        fases.R += s / 3;
        fases.S += s / 3;
        fases.T += s / 3;
      } else if (lig === 'FN') {
        if (c.fase) fases[c.fase] += s;
        else semFase.push(c.nome);
      } else {
        semFase.push(`${c.nome} (F-F)`);
      }
    }
    base.fases = fases;
    if (semFase.length > 0) naoAvaliado.push(`fora do balanceamento (sem fase): ${semFase.join(', ')}`);
    const valores = [fases.R, fases.S, fases.T];
    const max = Math.max(...valores);
    if (max > 0) {
      base.desequilibrioPct = ((max - Math.min(...valores)) / max) * 100;
      if (base.desequilibrioPct > hip.desequilibrioMaxPct) {
        achados.push({
          nivel: 'AVISO',
          referencia: 'balanceamento',
          mensagem: `fases desequilibradas em ${n1(base.desequilibrioPct)} % (R ${Math.round(fases.R)} · S ${Math.round(fases.S)} · T ${Math.round(fases.T)} VA), limite ${hip.desequilibrioMaxPct} %`,
        });
      }
    }
  }

  return base;
}
