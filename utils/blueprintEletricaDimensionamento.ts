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
import type { BlueprintModel, Circuito, LigacaoDoCircuito, Quadro, Terminal, TipoDeCondutor, Trecho } from './blueprintKernel';
import { cadeiaDeQuadros, repartirCondutores, secoesDosCondutores } from './blueprintKernel';
import { comprimentoDoTrecho } from './blueprintRede';
import { desequilibrioDasFases, somarPorFase, type CargaPorFase } from './blueprintFasesEletricas';

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

/**
 * `TUE` (14/09/2026, pedido: *"TUE: a seção mínima de 4,0 mm²"*) é um uso à
 * parte de `FORCA` porque a seção mínima dele NÃO vem da Tabela 47 — a norma
 * pede 2,5 para qualquer circuito de força. 4,0 mm² é a prática de projeto
 * para chuveiro, ar-condicionado e afins, e por isso entra como HIPÓTESE
 * nomeada (`HipotesesEletricas.secaoMinimaTueMm2`), não como valor da norma.
 * `FORCA` continua sendo o vocabulário da Tab. 47 (tomadas de uso geral).
 */
export type UsoDoCircuito = 'ILUMINACAO' | 'FORCA' | 'TUE';
/** Só o que a NORMA diz (Tab. 47). TUE não está aqui de propósito — é hipótese. */
export const SECAO_MINIMA_POR_USO_MM2: Record<'ILUMINACAO' | 'FORCA', number> = {
  ILUMINACAO: 1.5,
  FORCA: 2.5,
};

/**
 * A seção mínima que vale para o uso: Tab. 47 para luz e força; para TUE, a
 * hipótese — nunca abaixo dos 2,5 da norma, que continuam valendo.
 */
export function secaoMinimaPorUsoMm2(uso: UsoDoCircuito, hip: HipotesesEletricas): number {
  return uso === 'TUE'
    ? Math.max(SECAO_MINIMA_POR_USO_MM2.FORCA, hip.secaoMinimaTueMm2)
    : SECAO_MINIMA_POR_USO_MM2[uso];
}

/** O que a Tab. 47 pede para o uso, sem hipótese — TUE é força para a norma. */
export function secaoMinimaDaNormaMm2(uso: UsoDoCircuito): number {
  return uso === 'ILUMINACAO' ? SECAO_MINIMA_POR_USO_MM2.ILUMINACAO : SECAO_MINIMA_POR_USO_MM2.FORCA;
}

export const ROTULO_DO_USO: Record<UsoDoCircuito, string> = {
  ILUMINACAO: 'iluminação',
  FORCA: 'força (tomadas)',
  TUE: 'TUE / ligação direta',
};

/**
 * O uso do circuito pelos PONTOS que ele alimenta, do mais exigente para o
 * menos: qualquer TUE ou ligação direta faz dele circuito de TUE; qualquer
 * outra tomada ou ponto de força, circuito de força; só iluminação (e seus
 * interruptores) é iluminação. Misturado, vale o maior mínimo — é o que
 * "1,5 mm² quando em circuito exclusivo" quer dizer. Sem pontos, `null`.
 */
/**
 * Os tipos que pedem circuito de USO ESPECÍFICO (E1.1): TUE, ligação direta e
 * os equipamentos — cada um é UMA carga conhecida, e a prática (e a 9.5.3.1
 * acima de 10 A) os quer em circuito próprio. Um lugar só para o uso, a regra
 * 9.5.3.1 e o planejador de circuitos.
 */
export const TIPOS_DE_USO_ESPECIFICO: ReadonlySet<string> = new Set([
  'TUE',
  'LIGACAO_DIRETA',
  'AR_CONDICIONADO',
  'MOTOR_BOMBA',
  'VENTILADOR_EXAUSTOR',
  'PORTAO',
  'CARREGADOR_VE',
  'PONTO_ESPERA',
]);

/** Tipos que NÃO são carga: comando e aterramento ficam fora de uso, grupo e demanda. */
export const TIPOS_SEM_CARGA: ReadonlySet<string> = new Set(['INTERRUPTOR', 'ATERRAMENTO', 'CAIXA_PASSAGEM', 'ENTRADA_SERVICO', 'MEDIDOR']);

export function usoDoCircuito(pontos: readonly Pick<Terminal, 'tipoEletrico'>[]): UsoDoCircuito | null {
  if (pontos.length === 0) return null;
  if (pontos.some((p) => p.tipoEletrico && TIPOS_DE_USO_ESPECIFICO.has(p.tipoEletrico))) return 'TUE';
  const ehForca = pontos.some(
    (p) => p.tipoEletrico && !p.tipoEletrico.startsWith('ILUMINACAO') && !TIPOS_SEM_CARGA.has(p.tipoEletrico),
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
   * Seção mínima de circuito de TUE / ligação direta, mm² (14/09/2026).
   * HIPÓTESE de projeto, não norma: a Tab. 47 pede 2,5 para força; 4,0 é o
   * usual para chuveiro e ar-condicionado. Abaixo de 2,5 a norma continua
   * valendo (`secaoMinimaPorUsoMm2`). Entra no hash da base elétrica, como
   * toda hipótese — emissões anteriores a esta chave passam a "base alterada".
   */
  secaoMinimaTueMm2: number;
  /**
   * F6 — fatores de demanda por grupo de carga, com o NOME da tabela de
   * origem. Padrão: sem demanda. A tabela é da concessionária, não da 5410.
   */
  demanda: FatoresDeDemanda;
  /** Queda da origem ao pior ponto (6.2.7.1): 5 % rede pública, 7 % transformador próprio. */
  limiteQuedaTotalPct: number;
  /** Desequilíbrio de fases tolerado num quadro trifásico, % (aviso acima). */
  desequilibrioMaxPct: number;
  /**
   * F9 — diâmetro EXTERNO típico do condutor isolado por seção (mm) e diâmetro
   * INTERNO típico do eletroduto por bitola nominal (mm). São tabelas de
   * CATÁLOGO, não da norma — editáveis; confira com o fabricante.
   */
  diametroExternoCondutorMm: readonly (readonly [number, number])[];
  diametroInternoEletrodutoMm: readonly (readonly [number, number])[];
  /**
   * E3.1 — CATÁLOGO de correntes nominais de DR (A), comercial, não norma; e
   * quantos circuitos um DR de grupo pode juntar antes do AVISO (hipótese de
   * projeto: um desarme apaga todos — a norma não fixa número).
   */
  catalogoDeDrA: readonly number[];
  maxCircuitosPorDR: number;
  /**
   * E3.2 — a EXPOSIÇÃO da instalação a descargas atmosféricas (6.3.5.2.1: linha
   * aérea, região com mais de 25 dias de trovoada por ano, etc.) é dado do
   * lugar, não do desenho: declarada como hipótese. `NAO_AVALIADA` (padrão)
   * faz do "quadro sem DPS" um AVISO; `EXPOSTA`, uma FALTA; `NAO_EXPOSTA`
   * dispensa — e o memorial diz qual das três valeu.
   */
  exposicaoARaios: ExposicaoARaios;
  /** O DPS que se sugere quando falta (catálogo/hipótese): classe II, 20 kA, Up 1,5 kV, desconexão 20 A. */
  dpsPadrao: { classe: 'I' | 'II' | 'III'; upKv: number; inKa: number; disjuntorDesconexaoA: number };
  /**
   * E4.2 — a instalação tem TRANSFORMADOR PRÓPRIO (origem na subestação, não
   * na rede pública): o limite de queda da origem sobe de 5 para 7 %
   * (6.2.7.1 b). Hipótese de projeto — dita no memorial.
   */
  origemComTransformador: boolean;
  /**
   * E4.3 — o PADRÃO DE ENTRADA da concessionária (id em `PADROES_DE_ENTRADA`,
   * em `blueprintEntradaDeEnergia.ts`). Só o "GENERICO" existe — hipótese com
   * valores usuais de projeto; cada preset real entra com fonte e data e sai
   * no memorial com "CONFERIR na norma da concessionária".
   */
  padraoDeEntrada: string;
  /**
   * E5.3 — os TEXTOS do memorial descritivo que o projetista edita por estudo
   * (objeto, execução, aterramento, observações). Não são base de cálculo: o
   * hash da base (`hashDaBaseEletrica`) os deixa de fora — editar um texto não
   * invalida emissão nenhuma. Vazio = o texto gerado/padrão.
   */
  textosDoMemorial: TextosDoMemorialEletrico;
  /**
   * E4.4 — o FATOR DE DIVERSIDADE do uso coletivo (id em
   * `FATORES_DE_DIVERSIDADE`): no quadro que alimenta quadros de UNIDADES, a
   * demanda das unidades é Σ × fator(n). "SEM" (1,00, conservador) é o padrão;
   * o "GENERICO" é fórmula de projeto, hipótese sem fonte normativa. O CODI de
   * cada concessionária fica no backlog — entra como preset com fonte e data.
   */
  diversidade: string;
  /**
   * E3.3 — CORRENTE DE CURTO-CIRCUITO PRESUMIDA na entrada, kA. Hipótese, a
   * confirmar com a concessionária (é ela quem informa a Ik no ponto de
   * entrega): 4,5 kA é o usual residencial em rede pública de baixa tensão.
   * O cálculo por impedância da rede fica para o backlog. Icn do disjuntor
   * tem de ser ≥ Ik (5.3.5.5).
   */
  ikEntradaKa: number;
}

/** A curva sugerida (hipótese): D onde há motor/compressor (partida), C no resto. */
export function sugerirCurva(pontos: readonly Pick<Terminal, 'tipoEletrico'>[]): 'B' | 'C' | 'D' {
  const motor = new Set(['MOTOR_BOMBA', 'AR_CONDICIONADO', 'VENTILADOR_EXAUSTOR', 'PORTAO']);
  return pontos.some((p) => p.tipoEletrico && motor.has(p.tipoEletrico)) ? 'D' : 'C';
}

export const EXPOSICOES_A_RAIOS = ['NAO_AVALIADA', 'EXPOSTA', 'NAO_EXPOSTA'] as const;
export type ExposicaoARaios = (typeof EXPOSICOES_A_RAIOS)[number];
export const ROTULO_DA_EXPOSICAO: Record<ExposicaoARaios, string> = {
  NAO_AVALIADA: 'não avaliada (DPS recomendado — aviso)',
  EXPOSTA: 'exposta — linha aérea / região de trovoadas (DPS obrigatório, 6.3.5.2.1)',
  NAO_EXPOSTA: 'não exposta (DPS dispensado por hipótese do projetista)',
};

/**
 * O DPS PADRÃO sugerido — hipótese de catálogo, não norma: classe II (no
 * quadro, 6.3.5.2.2), In 20 kA (8/20 µs), Up 1,5 kV (categoria II de
 * suportabilidade dos equipamentos em 127/220 V — Tab. 31), disjuntor de
 * desconexão 20 A (o que os fabricantes pedem para 20 kA). Confira o catálogo.
 */
export const DPS_PADRAO = { classe: 'II' as const, upKv: 1.5, inKa: 20, disjuntorDesconexaoA: 20 };

/** O DPS a sugerir — o padrão da hipótese, inteiro. */
export function sugerirDPS(hip: Pick<HipotesesEletricas, 'dpsPadrao'> = HIPOTESES_PADRAO): { classe: 'I' | 'II' | 'III'; upKv: number; inKa: number; disjuntorDesconexaoA: number } {
  return { ...hip.dpsPadrao };
}

/** A série comercial de DRs (A) — hipótese de catálogo, editável. */
export const SERIE_COMERCIAL_DE_DR_A: readonly number[] = [25, 40, 63, 80, 100, 125];

/** O menor In de DR do catálogo ≥ à soma das proteções a montante/jusante que ele atende; `null` acima do catálogo. */
export function sugerirInDoDR(somaDosDisjuntoresA: number, catalogo: readonly number[] = SERIE_COMERCIAL_DE_DR_A): number | null {
  return [...catalogo].sort((a, b) => a - b).find((x) => x >= somaDosDisjuntoresA) ?? null;
}

/** Diâmetro externo típico do condutor isolado (cobre, PVC 750 V), por seção — mm. */
export const DIAMETRO_EXTERNO_CONDUTOR_MM: readonly (readonly [number, number])[] = [
  [1.5, 3.0], [2.5, 3.6], [4, 4.2], [6, 4.8], [10, 6.0], [16, 7.2], [25, 9.0], [35, 10.2], [50, 12.0], [70, 13.8], [95, 16.0],
];

/** Diâmetro interno típico do eletroduto rígido de PVC, pelo diâmetro nominal — mm. */
export const DIAMETRO_INTERNO_ELETRODUTO_MM: readonly (readonly [number, number])[] = [
  [16, 13.3], [20, 17.4], [25, 22.4], [32, 29.4], [40, 36.4], [50, 46.3], [60, 55.7], [75, 71.0], [85, 80.9],
];


/**
 * A SÉRIE COMERCIAL de disjuntores (15/09/2026, informada pelo usuário: *"os
 * disjuntores são comercialmente fabricados nas seguintes correntes: 10A, 16A,
 * 20A, 25A, 32A, 40A, 50A, 63A, 73A, 80A, 100A, 125A, 160A, 200A"*, repetida
 * com o 73 A depois de questionada — é a lista dele). Sem 6 A: o pré-dim
 * sugeria "In 6 A" e ninguém compra 6 A para tomada.
 *
 * FONTE ÚNICA: o seletor "Disjuntor (A)" do quadro de cargas, o catálogo do
 * pré-dimensionamento (IB ≤ In ≤ Iz), o critério de seção mínima, o memorial e
 * a prancha leem daqui. Mudou a série, mudou em todos.
 */
export const SERIE_COMERCIAL_DE_DISJUNTORES_A: readonly number[] = [10, 16, 20, 25, 32, 40, 50, 63, 73, 80, 100, 125, 160, 200];

export const HIPOTESES_PADRAO: HipotesesEletricas = {
  metodoDeInstalacao: 'B1',
  temperaturaAmbienteC: 30,
  circuitosAgrupados: 1,
  rhoOhmMm2PorM: 0.0206,
  limiteQuedaTerminalPct: 4,
  catalogoDeDisjuntoresA: SERIE_COMERCIAL_DE_DISJUNTORES_A,
  secaoMinimaTueMm2: 4,
  demanda: { nome: 'sem demanda (1,00)', ILUMINACAO: 1, TUG: 1, FORCA: 1, MOTOR: 1 },
  limiteQuedaTotalPct: 5,
  desequilibrioMaxPct: 10,
  diametroExternoCondutorMm: DIAMETRO_EXTERNO_CONDUTOR_MM,
  diametroInternoEletrodutoMm: DIAMETRO_INTERNO_ELETRODUTO_MM,
  catalogoDeDrA: SERIE_COMERCIAL_DE_DR_A,
  maxCircuitosPorDR: 5,
  exposicaoARaios: 'NAO_AVALIADA',
  dpsPadrao: DPS_PADRAO,
  ikEntradaKa: 4.5,
  origemComTransformador: false,
  padraoDeEntrada: 'GENERICO',
  diversidade: 'SEM',
  textosDoMemorial: {},
};

/** E5.3 — os textos editáveis do memorial descritivo. Ausente/vazio = o padrão (`TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO`). */
export interface TextosDoMemorialEletrico {
  objeto?: string;
  execucao?: string;
  aterramento?: string;
  observacoes?: string;
}

/**
 * Os TEXTOS PADRÃO — ponto de partida do projetista, não declaração do
 * programa: o memorial diz que são editáveis. O objeto, vazio, é gerado do
 * desenho. As cores dos condutores são as da NBR 5410 6.1.5.3.
 */
export const TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO: Required<TextosDoMemorialEletrico> = {
  objeto: '',
  execucao:
    'Condutores de cobre com isolação para 450/750 V (PVC 70 °C), identificados por cor: neutro azul-claro, proteção (PE) verde-amarela ou verde, fases nas demais cores (NBR 5410, 6.1.5.3). Eletrodutos embutidos de PVC antichama, com caixas de passagem nos pontos indicados na planta. Todos os circuitos identificados no quadro, conforme o quadro de cargas.',
  aterramento:
    'Condutor de proteção (PE) em todos os circuitos, ligado ao barramento de equipotencialização principal junto ao quadro de entrada; seções do PE pela Tabela 58 da NBR 5410, indicadas por circuito. O esquema de aterramento e a resistência medida devem ser confirmados e registrados na execução.',
  observacoes: '',
};

/** O texto que vale: o do estudo quando não vazio; senão o padrão. */
export function textoDoMemorial(hip: Pick<HipotesesEletricas, 'textosDoMemorial'>, campo: keyof TextosDoMemorialEletrico): string {
  const v = hip.textosDoMemorial?.[campo];
  return v && v.trim() ? v.trim() : TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO[campo];
}

/** E4.4 — presets do fator de diversidade. `fator(n)` para n unidades; 1 unidade = 1,00 sempre. */
export interface FatorDeDiversidade {
  id: string;
  nome: string;
  fonte: string | null;
  conferir: string;
  fator: (n: number) => number;
}
export const FATORES_DE_DIVERSIDADE: readonly FatorDeDiversidade[] = [
  { id: 'SEM', nome: 'sem diversidade (1,00)', fonte: null, conferir: 'demanda do condomínio = soma das unidades; conservador', fator: () => 1 },
  {
    id: 'GENERICO',
    nome: 'genérico — hipótese de projeto',
    fonte: null,
    // Fórmula usual de projeto para residências (cai de 1,00 em 1 unidade para ~0,55 em 100): HIPÓTESE.
    conferir: 'fórmula 0,5 + 0,5/√n, sem fonte normativa — CONFERIR na norma da concessionária (CODI/NT)',
    fator: (n) => (n <= 1 ? 1 : Math.round((0.5 + 0.5 / Math.sqrt(n)) * 1000) / 1000),
  },
];
export function fatorDeDiversidade(id: string): FatorDeDiversidade {
  return FATORES_DE_DIVERSIDADE.find((f) => f.id === id) ?? FATORES_DE_DIVERSIDADE[0];
}

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
  /**
   * Qual critério mandou: a corrente (Tab. 36), o mínimo por uso (Tab. 47) ou
   * o MENOR DISJUNTOR comercial (5.3.4.1: In ≤ Iz — a seção tem de conduzir
   * pelo menos o menor disjuntor que cabe acima de IB).
   */
  criterio: 'CORRENTE' | 'USO' | 'DISJUNTOR';
}

/**
 * A menor seção nominal que atende à corrente (Iz corrigida ≥ IB), ao mínimo
 * por uso (Tabela 47) E ao menor disjuntor do catálogo ≥ IB (Iz ≥ In, 5.3.4.1).
 * `null` quando nem a maior seção da tabela alcança IB, ou quando a
 * temperatura não tem fator.
 *
 * O terceiro critério entrou em 15/09/2026 com a série comercial de
 * disjuntores (menor: 10 A): iluminação em 1,5 mm² muito agrupada tem Iz
 * corrigida abaixo de 10 A — a seção "atendia" IB 1,3 A e nenhum disjuntor
 * cabia nela. A resposta certa é a seção seguinte, e é ela que se sugere.
 */
export function secaoMinima(
  ibA: number,
  hip: HipotesesEletricas,
  ligacao: LigacaoDoCircuito,
  uso: UsoDoCircuito | null,
): SecaoMinima | null {
  const minimoPorUso = uso ? secaoMinimaPorUsoMm2(uso, hip) : 0;
  const menorDisjuntor = [...hip.catalogoDeDisjuntoresA].sort((a, b) => a - b).find((inA) => inA >= ibA) ?? null;
  const izNecessaria = Math.max(ibA, menorDisjuntor ?? 0);
  for (const secao of SECOES_NOMINAIS_MM2) {
    if (secao < minimoPorUso) continue;
    const iz = capacidadeCorrigidaA(secao, hip, ligacao);
    if (iz == null) return null;
    if (iz >= izNecessaria) {
      // Se uma seção MENOR já atenderia à corrente, quem mandou foi o uso — ou o
      // disjuntor, quando ela conduz IB mas não o menor disjuntor.
      const menores = SECOES_NOMINAIS_MM2.filter((s) => s < secao).reverse();
      const izDa = (s: number) => capacidadeCorrigidaA(s, hip, ligacao) ?? 0;
      const atendeTudoMenor = menores.find((s) => izDa(s) >= izNecessaria);
      const atendeIbMenor = menores.find((s) => izDa(s) >= ibA);
      const criterio: SecaoMinima['criterio'] =
        atendeTudoMenor != null ? 'USO' : atendeIbMenor != null ? 'DISJUNTOR' : 'CORRENTE';
      return { secaoMm2: secao, izA: iz, criterio };
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
  const trechos = (model.trechos ?? []).filter((t) => (t.circuitoIds ?? []).includes(circuito.id));
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
  /**
   * E2.3: a seção do NEUTRO e do PE que valem para este circuito — o declarado
   * ou a norma (neutro = fase, 6.2.6.2; PE pela Tabela 58) sobre a fase
   * declarada (ou, sem ela, a calculada). `*Derivado` diz de onde veio.
   */
  secaoNeutroMm2: number | null;
  secaoPeMm2: number | null;
  neutroDerivado: boolean;
  peDerivado: boolean;
  /** Iz corrigida da seção DECLARADA — é contra ela que o disjuntor se confere. */
  izDeclaradaA: number | null;
  disjuntorSugeridoA: number | null;
  disjuntorDeclaradoA: number | null;
  /** E3.3: a curva declarada e a sugerida (C; D onde há motor — hipótese). */
  curvaDeclarada: 'B' | 'C' | 'D' | null;
  curvaSugerida: 'B' | 'C' | 'D';
  /** E4.1: circuito de reserva — conta posição, não tem ponto. */
  reserva: boolean;
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
  hipDeclaradas: HipotesesEletricas = HIPOTESES_PADRAO,
): PreDimensionamentoDoCircuito {
  // AGRUPAMENTO MEDIDO (15/09/2026): com eletroduto lançado, a Tabela 42 usa
  // quantos circuitos dividem o pior trecho do caminho deste — é a conta que a
  // norma cobra pelo eletroduto compartilhado. Sem eletroduto, a hipótese.
  const hip: HipotesesEletricas = { ...hipDeclaradas, circuitosAgrupados: agrupamentoDoCircuito(model, circuito.id, hipDeclaradas) };
  // O INTERRUPTOR está no circuito mas não é carga: não conta ponto nem
  // potência — senão todo circuito de luz apareceria com "1 sem potência".
  const pontos = (model.terminais ?? []).filter((t) => t.circuitoId === circuito.id && t.tipoEletrico !== 'INTERRUPTOR');
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
    ...(() => {
      const sec = secoesDosCondutores(circuito, secaoDeclaradaMm2 ?? null);
      return { secaoNeutroMm2: sec.neutroMm2, secaoPeMm2: sec.peMm2, neutroDerivado: sec.neutroDerivado, peDerivado: sec.peDerivado };
    })(),
    izDeclaradaA: null,
    disjuntorSugeridoA: null,
    disjuntorDeclaradoA,
    curvaDeclarada: circuito.curva ?? null,
    curvaSugerida: sugerirCurva(pontos),
    reserva: circuito.reserva === true,
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
    // E4.1: reserva é sem pontos POR DESENHO — não é pendência.
    naoAvaliado.push(circuito.reserva ? 'circuito de reserva (sem pontos, por desenho)' : 'circuito sem pontos');
    return base;
  }

  const ibA = correnteDeProjetoA(sVA, tensaoV, ligacao);
  base.ibA = ibA;

  // Seção mínima (Tab. 36 corrigida + Tab. 47).
  const calc = secaoMinima(ibA, hip, ligacao, uso);
  base.secaoCalculada = calc;
  if (secaoDeclaradaMm2 == null && calc) {
    // E2.3: sem fase declarada, o neutro e o PE saem da fase CALCULADA.
    const sec = secoesDosCondutores(circuito, calc.secaoMm2);
    base.secaoNeutroMm2 = sec.neutroMm2;
    base.secaoPeMm2 = sec.peMm2;
  }
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
      if (uso) {
        // Abaixo da NORMA é falta; entre a norma e a hipótese de TUE é aviso —
        // a hipótese é do projetista, e uma hipótese não pode barrar a emissão.
        const minimoNorma = secaoMinimaDaNormaMm2(uso);
        const minimoUso = secaoMinimaPorUsoMm2(uso, hip);
        if (secaoDeclaradaMm2 < minimoUso) {
          const abaixoDaNorma = secaoDeclaradaMm2 < minimoNorma;
          achados.push({
            nivel: abaixoDaNorma ? 'FALTA' : 'AVISO',
            referencia: abaixoDaNorma ? '6.2.6.1.1 / Tab. 47' : 'hipótese · TUE',
            mensagem: `circuito de ${ROTULO_DO_USO[uso]} pede no mínimo ${mm2(minimoUso)} mm²${abaixoDaNorma ? '' : ' (hipótese)'}; declarado ${mm2(secaoDeclaradaMm2)}`,
          });
        }
      }
    }
  }

  // Disjuntor: IB ≤ In ≤ Iz — contra a seção declarada (é a que vai existir),
  // ou contra a calculada quando não há declarada.
  const izReferencia = base.izDeclaradaA ?? calc?.izA ?? null;
  if (izReferencia != null) {
    base.disjuntorSugeridoA = disjuntorSugeridoA(ibA, izReferencia, hip.catalogoDeDisjuntoresA);
    // Se a seção DECLARADA não admite disjuntor nenhum (Iz abaixo do menor da
    // série), a sugestão passa a ser o par completo: a seção calculada — que
    // por construção admite um — e o disjuntor dela. "Usar sugerido" grava os
    // dois de uma vez (15/09/2026).
    if (base.disjuntorSugeridoA == null && calc && calc.izA !== izReferencia) {
      base.disjuntorSugeridoA = disjuntorSugeridoA(ibA, calc.izA, hip.catalogoDeDisjuntoresA);
    }
    // 5.3.4.1 tem DUAS condições: a) IB ≤ In ≤ Iz, conferida abaixo; b) I2 ≤ 1,45·Iz,
    // com I2 a corrente convencional de atuação. Para minidisjuntor NBR NM 60898
    // (o residencial) I2 = 1,45·In por norma de produto — então In ≤ Iz já
    // implica b). Não é omissão: é a mesma conta (registrado em 29/09/2026,
    // benchmark AltoQi, E0.1). Se entrar disjuntor de outra norma (I2 ≠ 1,45·In),
    // a condição b) volta a precisar de linha própria.
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

/**
 * Os grupos de carga que a demanda distingue. MOTOR entrou na E1.1 (29/09/2026):
 * as tabelas de demanda das concessionárias tratam motores e ar-condicionado
 * à parte de tomadas e aquecimento, e sem o grupo o fator não teria onde cair.
 */
export type GrupoDeCarga = 'ILUMINACAO' | 'TUG' | 'FORCA' | 'MOTOR';
export const GRUPOS_DE_CARGA: readonly GrupoDeCarga[] = ['ILUMINACAO', 'TUG', 'FORCA', 'MOTOR'];

/** Os tipos com MOTOR: ar-condicionado (compressor), bomba, ventilador/exaustor, portão. */
const TIPOS_COM_MOTOR: ReadonlySet<string> = new Set(['AR_CONDICIONADO', 'MOTOR_BOMBA', 'VENTILADOR_EXAUSTOR', 'PORTAO']);

/**
 * O grupo de um ponto pelo tipo: luz → iluminação; motores → MOTOR; TUE,
 * ligação direta, carregador e espera → força; TUG, dados e campainha → TUG;
 * interruptor e aterramento → nenhum (não são carga).
 */
export function grupoDeCarga(tipoEletrico: Terminal['tipoEletrico']): GrupoDeCarga | null {
  if (!tipoEletrico || TIPOS_SEM_CARGA.has(tipoEletrico)) return null;
  if (tipoEletrico.startsWith('ILUMINACAO')) return 'ILUMINACAO';
  if (TIPOS_COM_MOTOR.has(tipoEletrico)) return 'MOTOR';
  if (tipoEletrico === 'TUE' || tipoEletrico === 'LIGACAO_DIRETA' || tipoEletrico === 'CARREGADOR_VE' || tipoEletrico === 'PONTO_ESPERA') return 'FORCA';
  return 'TUG';
}

export interface FatoresDeDemanda {
  /** O nome da tabela de onde os fatores saíram ("sem demanda", "NT da concessionária X"). */
  nome: string;
  ILUMINACAO: number;
  TUG: number;
  FORCA: number;
  /** Motores e ar-condicionado (E1.1). Coluna gravada antes dele lê 1,00. */
  MOTOR: number;
  /**
   * E4.2 — a FONTE (documento da concessionária: "NTD-001 rev. 3") e a DATA
   * (ISO) da tabela. Sem eles a tabela é palavra do projetista; o memorial
   * imprime os dois. Ausentes na tabela "sem demanda".
   */
  fonte?: string | null;
  dataISO?: string | null;
}

export const DEMANDA_SEM_FATOR: FatoresDeDemanda = { nome: 'sem demanda (1,00)', ILUMINACAO: 1, TUG: 1, FORCA: 1, MOTOR: 1 };

/**
 * E4.2 — PRESETS de demanda por concessionária: a ESTRUTURA. Cada preset exige
 * nome, fonte e data, e sai no memorial com "CONFERIR na norma da
 * concessionária". A lista embutida tem SÓ o "sem demanda": nenhuma tabela de
 * concessionária é digitada de memória aqui — quem tem a NT em mãos informa
 * (opção "informada") ou acrescenta o preset com a fonte.
 */
export interface PresetDeDemanda {
  id: string;
  fatores: FatoresDeDemanda;
  /** Sempre presente num preset de concessionária — a "verdade" é dela, não nossa. */
  conferir: string;
}
export const PRESETS_DE_DEMANDA: readonly PresetDeDemanda[] = [
  { id: 'SEM', fatores: DEMANDA_SEM_FATOR, conferir: 'fator 1,00 em tudo — a demanda é a carga instalada; conservador' },
];

/**
 * E4.2 — o limite de queda da ORIGEM ao pior ponto que vale (6.2.7.1): 7 %
 * quando a instalação tem transformador próprio (hipótese
 * `origemComTransformador`), senão o declarado (5 % em rede pública).
 */
export function limiteQuedaTotalEfetivoPct(hip: Pick<HipotesesEletricas, 'limiteQuedaTotalPct' | 'origemComTransformador'>): number {
  return hip.origemComTransformador ? Math.max(7, hip.limiteQuedaTotalPct) : hip.limiteQuedaTotalPct;
}

/** E6.1: a carga por fase mora em `blueprintFasesEletricas.ts` (a convenção do F-F); reexportada aqui. */
export type { CargaPorFase };

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
  /**
   * E4.1 — HIERARQUIA. `tipo` (QD ausente); `paiNome` do quadro que alimenta
   * este; `filhos` = os quadros que ESTE alimenta, cada um uma linha no quadro
   * de cargas (IB = demanda do filho). `sDemandadaVA` do quadro já SOMA os
   * filhos; `sDemandadaPropriaVA` é só o que ele alimenta direto.
   * `alimentadorM`: o declarado; sem ele, o eletroduto entre pai e filho
   * (`ELETRODUTOS`); `null` = nenhum dos dois.
   */
  tipo: 'QD' | 'QGBT' | 'MEDICAO';
  paiNome: string | null;
  filhos: FilhoDoQuadro[];
  sDemandadaPropriaVA: number;
  alimentadorM: number | null;
  alimentadorOrigem: 'DECLARADO' | 'ELETRODUTOS' | null;
  /**
   * E4.2 — a CADEIA até a origem: a queda do alimentador de cada quadro acima
   * deste (do mais próximo da origem para cá) e a deste; `quedaAcumuladaPct` é
   * a soma (`null` quando algum elo não tem comprimento — e `cadeia` diz qual).
   * `quedaTotalMaxPct` = acumulada + pior circuito terminal — é isso que a
   * 6.2.7.1 limita, contra `limiteQuedaEfetivoPct` (5 %, ou 7 % com trafo).
   */
  cadeia: { quadroId: string; nome: string; quedaAlimentadorPct: number | null }[];
  quedaAcumuladaPct: number | null;
  limiteQuedaEfetivoPct: number;
  /**
   * E4.4 — USO COLETIVO: quantos filhos atendem UNIDADES, o fator de
   * diversidade aplicado a eles (1,00 sem preset), a demanda das unidades já
   * com o fator e a de serviço (própria + filhos sem unidade). `sDemandadaVA`
   * = unidades × fator + serviço. `unidade` = a que ESTE quadro atende.
   */
  unidade: string | null;
  unidadesAtendidas: number;
  fatorDeDiversidade: number;
  sDemandadaUnidadesVA: number;
  sDemandadaServicoVA: number;
}

/** Um quadro alimentado por este — a linha dele no quadro de cargas do pai. */
export interface FilhoDoQuadro {
  quadroId: string;
  nome: string;
  tipo: 'QD' | 'QGBT' | 'MEDICAO';
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  sInstaladaVA: number;
  sDemandadaVA: number;
  ibA: number | null;
  secaoMm2: number | null;
  disjuntorGeralA: number | null;
  circuitos: number;
  faltas: number;
  /** E4.4: o número da unidade que o filho atende (`null` = serviço/comum). */
  unidade: string | null;
}

/**
 * E4.1 — metros de eletroduto entre dois quadros, pelo caminho mais curto na
 * rede elétrica lançada (pontas coincidentes em x, y, cota; o quadro recebe em
 * qualquer cota). `null` sem caminho — aí o alimentador é declarado.
 */
export function comprimentoEntreQuadros(model: BlueprintModel, de: Pick<Quadro, 'at' | 'cotaMm'>, para: Pick<Quadro, 'at' | 'cotaMm'>): number | null {
  const arestas = new Map<string, { para: string; metros: number }[]>();
  const ligar = (a: string, b: string, metros: number) => arestas.set(a, [...(arestas.get(a) ?? []), { para: b, metros }]);
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'ELETRICA')) {
    const a = chaveDePonta(t.a.x, t.a.y, t.cotaAMm);
    const b = chaveDePonta(t.b.x, t.b.y, t.cotaBMm);
    const metros = comprimentoDoTrecho(t as Trecho) / 1000;
    ligar(a, b, metros);
    ligar(b, a, metros);
  }
  // As pontas NO quadro: as da cota dele quando existem (a prumada que sobe
  // do quadro conta no caminho); só sem nenhuma na cota vale qualquer cota.
  const pontasEm = (q: Pick<Quadro, 'at' | 'cotaMm'>) => {
    const noXY = [...arestas.keys()].filter((k) => k.startsWith(`${q.at.x},${q.at.y},`));
    const naCota = noXY.filter((k) => k === chaveDePonta(q.at.x, q.at.y, q.cotaMm));
    return naCota.length ? naCota : noXY;
  };
  const partidas = pontasEm(de);
  const chegadas = new Set(pontasEm(para));
  if (partidas.length === 0 || chegadas.size === 0) return null;
  // Dijkstra simples — a rede de um quadro tem dezenas de nós, não milhares.
  const dist = new Map<string, number>(partidas.map((p) => [p, 0]));
  const fila = [...partidas];
  while (fila.length) {
    fila.sort((x, y) => (dist.get(x) ?? Infinity) - (dist.get(y) ?? Infinity));
    const no = fila.shift() as string;
    const d = dist.get(no) ?? Infinity;
    for (const { para: viz, metros } of arestas.get(no) ?? []) {
      const nd = d + metros;
      if (nd < (dist.get(viz) ?? Infinity)) {
        dist.set(viz, nd);
        if (!fila.includes(viz)) fila.push(viz);
      }
    }
  }
  const melhores = [...chegadas].map((c) => dist.get(c)).filter((v): v is number => v != null && Number.isFinite(v));
  return melhores.length ? Math.min(...melhores) : null;
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
  /** E4.1: os quadros acima na recursão — um ciclo (que a invariante recusa) não vira laço infinito. */
  visitados: ReadonlySet<string> = new Set(),
  /** E4.2: só a chamada de fora sobe a cadeia até a origem; as recursivas (filhos, pais) não — senão pai ↔ filho se chamam para sempre. */
  comCadeia = true,
): PreDimensionamentoDoQuadro | null {
  const quadro = (model.quadros ?? []).find((q) => q.id === quadroId);
  if (!quadro) return null;
  const pai = quadro.quadroPaiId ? (model.quadros ?? []).find((q) => q.id === quadro.quadroPaiId) ?? null : null;
  const circuitosDoQuadro = (model.circuitos ?? []).filter((c) => c.quadroId === quadroId);
  const circuitos = preDimensionarQuadro(model, quadroId, hip);
  const achados: AchadoDoDimensionamento[] = [];
  const naoAvaliado: string[] = [];

  // Carga por grupo.
  const porGrupoVA: Record<GrupoDeCarga, number> = { ILUMINACAO: 0, TUG: 0, FORCA: 0, MOTOR: 0 };
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
  const sInstaladaPropriaVA = porGrupoVA.ILUMINACAO + porGrupoVA.TUG + porGrupoVA.FORCA + porGrupoVA.MOTOR;
  const demanda = hip.demanda;
  const sDemandadaPropriaVA =
    porGrupoVA.ILUMINACAO * demanda.ILUMINACAO +
    porGrupoVA.TUG * demanda.TUG +
    porGrupoVA.FORCA * demanda.FORCA +
    porGrupoVA.MOTOR * (demanda.MOTOR ?? 1);

  // E4.1: os FILHOS — cada quadro alimentado por este entra como uma carga
  // (a demanda dele, já com os fatores) e como uma linha no quadro de cargas.
  const proximos = new Set([...visitados, quadroId]);
  const filhos: FilhoDoQuadro[] = (model.quadros ?? [])
    .filter((f) => f.quadroPaiId === quadroId && !proximos.has(f.id))
    .map((f) => {
      const r = preDimensionarQuadroCompleto(model, f.id, hip, proximos, false);
      if (!r) return null;
      return {
        quadroId: f.id,
        nome: f.nome,
        tipo: r.tipo,
        ligacao: r.ligacao,
        tensaoV: r.tensaoV,
        sInstaladaVA: r.sInstaladaVA,
        sDemandadaVA: r.sDemandadaVA,
        ibA: r.ibA,
        secaoMm2: r.secaoCalculada?.secaoMm2 ?? null,
        disjuntorGeralA: r.disjuntorGeralA,
        circuitos: r.circuitos.length,
        faltas: r.achados.filter((a) => a.nivel === 'FALTA').length + r.circuitos.reduce((s, c) => s + c.achados.filter((a) => a.nivel === 'FALTA').length, 0),
        unidade: r.unidade,
      };
    })
    .filter((f): f is FilhoDoQuadro => !!f);
  const sInstaladaVA = sInstaladaPropriaVA + filhos.reduce((s, f) => s + f.sInstaladaVA, 0);
  // E4.4: os filhos que atendem UNIDADES levam o fator de diversidade; o resto é serviço.
  const filhosDeUnidade = filhos.filter((f) => f.unidade != null);
  const unidadesAtendidas = new Set(filhosDeUnidade.map((f) => f.unidade)).size;
  const fator = unidadesAtendidas > 0 ? fatorDeDiversidade(hip.diversidade).fator(unidadesAtendidas) : 1;
  const sDemandadaUnidadesVA = filhosDeUnidade.reduce((s, f) => s + f.sDemandadaVA, 0) * fator;
  const sDemandadaServicoVA = sDemandadaPropriaVA + filhos.filter((f) => f.unidade == null).reduce((s, f) => s + f.sDemandadaVA, 0);
  const sDemandadaVA = sDemandadaUnidadesVA + sDemandadaServicoVA;
  // O alimentador: declarado vence; senão o eletroduto entre o pai e este quadro.
  const alimentadorDerivadoM = pai ? comprimentoEntreQuadros(model, pai, quadro) : null;
  const alimentadorM = quadro.alimentadorM != null && quadro.alimentadorM > 0 ? quadro.alimentadorM : alimentadorDerivadoM;
  const alimentadorOrigem: 'DECLARADO' | 'ELETRODUTOS' | null = quadro.alimentadorM != null && quadro.alimentadorM > 0 ? 'DECLARADO' : alimentadorDerivadoM != null ? 'ELETRODUTOS' : null;

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
    tipo: quadro.tipo ?? 'QD',
    paiNome: pai?.nome ?? null,
    filhos,
    sDemandadaPropriaVA,
    alimentadorM,
    alimentadorOrigem,
    cadeia: [],
    quedaAcumuladaPct: null,
    limiteQuedaEfetivoPct: limiteQuedaTotalEfetivoPct(hip),
    unidade: quadro.unidadeId ? (model.unidades ?? []).find((u) => u.id === quadro.unidadeId)?.numero ?? null : null,
    unidadesAtendidas,
    fatorDeDiversidade: fator,
    sDemandadaUnidadesVA,
    sDemandadaServicoVA,
  };

  if (tensaoV == null) {
    naoAvaliado.push('sem tensão no quadro nem nos circuitos — alimentador não calculado');
  } else if (sDemandadaVA > 0) {
    const ibA = correnteDeProjetoA(sDemandadaVA, tensaoV, ligacao);
    base.ibA = ibA;
    base.secaoCalculada = secaoMinima(ibA, hip, ligacao, 'FORCA');
    if (base.secaoCalculada) {
      base.disjuntorGeralA = disjuntorSugeridoA(ibA, base.secaoCalculada.izA, hip.catalogoDeDisjuntoresA);
      if (alimentadorM != null && alimentadorM > 0) {
        const queda = quedaDeTensaoPct(ibA, alimentadorM, base.secaoCalculada.secaoMm2, tensaoV, ligacao, hip.rhoOhmMm2PorM);
        base.quedaAlimentadorPct = queda;
        const piorTerminal = Math.max(0, ...circuitos.map((c) => c.quedaPct ?? 0));
        // E4.2: a queda até a ORIGEM soma os alimentadores de todos os quadros
        // acima deste (a cadeia), não só o deste. Cada elo sem comprimento
        // deixa a soma indefinida — e a cadeia diz qual elo faltou.
        const acima = comCadeia ? cadeiaDeQuadros(model, quadroId).reverse() : [];
        const cadeia = acima.map((p) => {
          // Visitados VAZIO de propósito: o pai precisa somar os filhos (inclusive
          // este) para ter IB e queda; o que corta a recursão é `comCadeia = false`.
          const r = preDimensionarQuadroCompleto(model, p.id, hip, new Set(), false);
          return { quadroId: p.id, nome: p.nome, quedaAlimentadorPct: r?.quedaAlimentadorPct ?? null };
        });
        cadeia.push({ quadroId, nome: quadro.nome, quedaAlimentadorPct: queda });
        base.cadeia = cadeia;
        const eloSemQueda = cadeia.find((e) => e.quedaAlimentadorPct == null);
        base.quedaAcumuladaPct = eloSemQueda ? null : cadeia.reduce((s, e) => s + (e.quedaAlimentadorPct ?? 0), 0);
        const limite = base.limiteQuedaEfetivoPct;
        if (eloSemQueda) {
          // Conservador e dito: sem o elo, avalia só o que se tem, e avisa.
          base.quedaTotalMaxPct = queda + piorTerminal;
          naoAvaliado.push(`queda até a origem incompleta — ${eloSemQueda.nome} sem comprimento de alimentador; avaliado só deste quadro para baixo`);
          if (base.quedaTotalMaxPct > limite) {
            achados.push({ nivel: 'FALTA', referencia: '6.2.7.1', mensagem: `queda deste quadro ao pior ponto ${n1(base.quedaTotalMaxPct)} % (alimentador ${n1(queda)} % + terminal ${n1(piorTerminal)} %) já passa do limite ${n1(limite)} %` });
          }
        } else {
          base.quedaTotalMaxPct = (base.quedaAcumuladaPct ?? 0) + piorTerminal;
          if (base.quedaTotalMaxPct > limite) {
            const elos = cadeia.map((e) => `${e.nome} ${n1(e.quedaAlimentadorPct ?? 0)} %`).join(' + ');
            achados.push({
              nivel: 'FALTA',
              referencia: '6.2.7.1',
              mensagem: `queda da origem ao pior ponto ${n1(base.quedaTotalMaxPct)} % (${elos} + terminal ${n1(piorTerminal)} %), limite ${n1(limite)} %${hip.origemComTransformador ? ' (transformador próprio)' : ''}`,
            });
          }
        }
      } else {
        naoAvaliado.push(pai ? `comprimento do alimentador não declarado e sem eletroduto entre ${pai.nome} e este quadro — queda da origem não calculada` : 'comprimento do alimentador não declarado — queda da origem não calculada');
      }
    } else {
      naoAvaliado.push('IB do alimentador acima da Tabela 36 ou temperatura sem fator');
    }
  }

  // Balanceamento — só faz sentido em quadro trifásico.
  if (ligacao === 'FFF') {
    // E6.1: F-F com fase entra (metade em cada fase do par) — ver `blueprintFasesEletricas.ts`.
    const { fases, semFase } = somarPorFase(
      circuitosDoQuadro.map((c) => ({ nome: c.nome, ligacao: c.ligacao, fase: c.fase, sVA: circuitos.find((x) => x.circuitoId === c.id)?.sVA ?? 0 })),
    );
    base.fases = fases;
    if (semFase.length > 0) naoAvaliado.push(`fora do balanceamento (sem fase): ${semFase.join(', ')}`);
    const deseq = desequilibrioDasFases(fases);
    if (deseq != null) {
      base.desequilibrioPct = deseq;
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

// ─── F9 — TAXA DE OCUPAÇÃO DO ELETRODUTO (6.2.11.1.6) ──────────────────────
//
// A NBR 5410 limita a área ocupada pelos condutores no eletroduto: 53 % com
// UM condutor, 31 % com DOIS, 40 % com TRÊS ou mais. A conta precisa de dois
// diâmetros que a norma NÃO dá — o EXTERNO do condutor isolado e o INTERNO do
// eletroduto — e que variam por fabricante. Por isso os dois são HIPÓTESES
// (tabelas típicas de catálogo, editáveis), e a tela diz que são.

/** O limite de ocupação pelo número de condutores (6.2.11.1.6). */
export function limiteDeOcupacaoPct(condutores: number): number {
  if (condutores <= 1) return 53;
  if (condutores === 2) return 31;
  return 40;
}

const procurar = (tabela: readonly (readonly [number, number])[], chave: number): number | null =>
  tabela.find(([k]) => k === chave)?.[1] ?? null;

export interface OcupacaoDoEletroduto {
  condutores: number;
  secaoMm2: number;
  bitolaMm: number;
  diametroInternoMm: number;
  diametroCondutorMm: number;
  ocupacaoPct: number;
  limitePct: number;
  atende: boolean;
  /** O menor diâmetro nominal da tabela que atenderia, quando não atende. */
  bitolaQueAtendeMm: number | null;
}

/**
 * A ocupação de um eletroduto: `condutores` de `secaoMm2` numa bitola nominal.
 * `null` quando a bitola ou a seção não está nas tabelas — não se aproxima.
 */
export function ocupacaoDoEletroduto(
  bitolaMm: number,
  condutores: number,
  secaoMm2: number,
  hip: Pick<HipotesesEletricas, 'diametroExternoCondutorMm' | 'diametroInternoEletrodutoMm'> = HIPOTESES_PADRAO,
): OcupacaoDoEletroduto | null {
  const dCond = procurar(hip.diametroExternoCondutorMm, secaoMm2);
  const dInt = procurar(hip.diametroInternoEletrodutoMm, bitolaMm);
  if (dCond == null || dInt == null || condutores <= 0) return null;
  const areaCondutores = condutores * Math.PI * (dCond / 2) ** 2;
  const ocupacao = (bitola: number, interno: number) => (areaCondutores / (Math.PI * (interno / 2) ** 2)) * 100;
  const ocupacaoPct = ocupacao(bitolaMm, dInt);
  const limitePct = limiteDeOcupacaoPct(condutores);
  const atende = ocupacaoPct <= limitePct;
  let bitolaQueAtendeMm: number | null = null;
  if (!atende) {
    for (const [b, i] of hip.diametroInternoEletrodutoMm) {
      if (b > bitolaMm && ocupacao(b, i) <= limitePct) {
        bitolaQueAtendeMm = b;
        break;
      }
    }
  }
  return { condutores, secaoMm2, bitolaMm, diametroInternoMm: dInt, diametroCondutorMm: dCond, ocupacaoPct, limitePct, atende, bitolaQueAtendeMm };
}

/**
 * A ocupação de um TRECHO do desenho: bitola do trecho, condutores declarados
 * e a seção DECLARADA do circuito (ou a mínima calculada, quando não há
 * declarada). Devolve também o motivo quando não dá para avaliar.
 */
/**
 * Quantos condutores de cada seção passam no trecho, repartindo a contagem
 * declarada entre os circuitos pela base da ligação de cada um (FN/FF = 3,
 * FFF = 4) — o excedente é retorno na seção do primeiro circuito.
 */
export function condutoresPorCircuitoNoTrecho(
  condutores: number,
  circuitos: readonly { ligacao?: LigacaoDoCircuito | null }[],
  secoes: readonly number[],
): { secaoMm2: number; quantidade: number }[] {
  // A conta mora no kernel desde a E0.3 (29/09/2026): o quantitativo de fio
  // usa a MESMA repartição — duas cópias divergiriam em silêncio.
  return repartirCondutores(condutores, circuitos, secoes).map((r) => ({ secaoMm2: r.secaoMm2 as number, quantidade: r.quantidade }));
}

/**
 * A ocupação com condutores de seções DIFERENTES (6.2.11.1.6): soma das áreas
 * externas sobre a área interna. Mesmo formato de `ocupacaoDoEletroduto`; a
 * seção e o diâmetro informados são os MAIORES presentes.
 */
export function ocupacaoDoEletrodutoCompartilhado(
  bitolaMm: number,
  condutores: readonly { secaoMm2: number; quantidade: number }[],
  hip: Pick<HipotesesEletricas, 'diametroExternoCondutorMm' | 'diametroInternoEletrodutoMm'> = HIPOTESES_PADRAO,
): OcupacaoDoEletroduto | null {
  const interno = procurar(hip.diametroInternoEletrodutoMm, bitolaMm);
  if (interno == null) return null;
  let area = 0;
  let total = 0;
  let maiorSecao = 0;
  let maiorDiametro = 0;
  for (const c of condutores) {
    const ext = procurar(hip.diametroExternoCondutorMm, c.secaoMm2);
    if (ext == null) return null;
    area += c.quantidade * Math.PI * (ext / 2) ** 2;
    total += c.quantidade;
    maiorSecao = Math.max(maiorSecao, c.secaoMm2);
    maiorDiametro = Math.max(maiorDiametro, ext);
  }
  if (total === 0) return null;
  const ocupacao = (internoMm: number) => (area / (Math.PI * (internoMm / 2) ** 2)) * 100;
  const ocupacaoPct = ocupacao(interno);
  const limitePct = limiteDeOcupacaoPct(total);
  const atende = ocupacaoPct <= limitePct;
  let bitolaQueAtendeMm: number | null = null;
  if (!atende) {
    for (const [b, i] of hip.diametroInternoEletrodutoMm) {
      if (b > bitolaMm && ocupacao(i) <= limitePct) {
        bitolaQueAtendeMm = b;
        break;
      }
    }
  }
  return { condutores: total, secaoMm2: maiorSecao, bitolaMm, diametroInternoMm: interno, diametroCondutorMm: maiorDiametro, ocupacaoPct, limitePct, atende, bitolaQueAtendeMm };
}

/**
 * A MENOR bitola comercial (≥ `minimaMm`) cuja ocupação respeita o limite da
 * 6.2.11.1.6 para estes condutores. `null` quando nem a maior atende.
 */
export function bitolaMinimaPorOcupacao(
  condutores: readonly { secaoMm2: number; quantidade: number }[],
  minimaMm: number,
  hip: Pick<HipotesesEletricas, 'diametroExternoCondutorMm' | 'diametroInternoEletrodutoMm'> = HIPOTESES_PADRAO,
  comerciais: readonly number[] = [20, 25, 32, 40],
): number | null {
  for (const b of comerciais) {
    if (b < minimaMm) continue;
    const oc = ocupacaoDoEletrodutoCompartilhado(b, condutores, hip);
    if (oc?.atende) return b;
  }
  return null;
}

/**
 * Quantos circuitos dividem eletroduto com este, no pior trecho do caminho
 * dele — o número que a Tabela 42 pede. Sem eletroduto lançado, a hipótese
 * declarada (`hip.circuitosAgrupados`) continua valendo.
 */
export function agrupamentoDoCircuito(model: BlueprintModel, circuitoId: string, hip: Pick<HipotesesEletricas, 'circuitosAgrupados'>): number {
  const trechos = (model.trechos ?? []).filter((t) => (t.circuitoIds ?? []).includes(circuitoId));
  if (trechos.length === 0) return hip.circuitosAgrupados;
  return Math.max(1, ...trechos.map((t) => (t.circuitoIds ?? []).length));
}

export function ocupacaoDoTrecho(
  model: BlueprintModel,
  trecho: Trecho,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
  /**
   * E2.2: a fiação DERIVADA do trecho (`composicaoDaRede(model).get(id).lista`),
   * quando quem chama já a tem — é ela que vale sem contagem declarada. E2.4:
   * com o `tipo`, cada condutor entra na SUA seção (neutro 6.2.6.2, PE Tab. 58).
   */
  derivados?: readonly { circuitoId: string | null; tipo?: TipoDeCondutor }[] | null,
): { ocupacao: OcupacaoDoEletroduto | null; motivo: string | null } {
  if (trecho.disciplina !== 'ELETRICA') return { ocupacao: null, motivo: 'não é eletroduto' };
  const ids = trecho.circuitoIds ?? [];
  const circuitos = (model.circuitos ?? []).filter((c) => ids.includes(c.id));
  // Sem contagem declarada, vale a derivada (E2.2); sem nenhuma das duas, não se avalia.
  const porCircuitoDerivado = derivados && derivados.length > 0 && !trecho.condutores
    ? circuitos.map((c) => ({ c, lista: derivados.filter((d) => d.circuitoId === c.id) })).filter((x) => x.lista.length > 0)
    : null;
  if (!trecho.condutores && !porCircuitoDerivado) return { ocupacao: null, motivo: 'condutores não declarados nem derivados (ponto sem caminho até o quadro)' };
  if (circuitos.length === 0) return { ocupacao: null, motivo: 'sem circuito — a seção vem do circuito' };
  // VÁRIOS circuitos no mesmo eletroduto (15/09/2026): a seção de cada um, e
  // a ocupação é a soma das áreas de todos os condutores. Sem declaração em
  // algum, a mínima calculada dele; sem nem isso, não se avalia.
  const secoes = circuitos.map((c) => c.secaoMm2 ?? preDimensionarCircuito(model, c, hip).secaoCalculada?.secaoMm2 ?? null);
  if (secoes.some((v) => v == null)) return { ocupacao: null, motivo: 'circuito sem seção declarada nem calculável' };
  // E2.4: na derivação, cada condutor na SUA seção — neutro pela 6.2.6.2, PE
  // pela Tab. 58 (ou o declarado); sem `tipo`, a da fase. Na contagem DECLARADA
  // não há tipos: continua tudo na seção da fase (conservador) — dito.
  const composicao = porCircuitoDerivado
    ? porCircuitoDerivado.flatMap((x) => {
        const sec = secoesDosCondutores(x.c, secoes[circuitos.indexOf(x.c)] as number);
        const conta = new Map<number, number>();
        for (const d of x.lista) {
          const s = (d.tipo === 'NEUTRO' ? sec.neutroMm2 : d.tipo === 'TERRA' ? sec.peMm2 : sec.faseMm2) ?? (sec.faseMm2 as number);
          conta.set(s, (conta.get(s) ?? 0) + 1);
        }
        return [...conta.entries()].map(([secaoMm2, quantidade]) => ({ secaoMm2, quantidade }));
      })
    : condutoresPorCircuitoNoTrecho(trecho.condutores as number, circuitos, secoes as number[]);
  const oc = ocupacaoDoEletrodutoCompartilhado(trecho.bitolaMm, composicao, hip);
  if (!oc) return { ocupacao: null, motivo: `bitola ${trecho.bitolaMm} mm ou seção fora das tabelas` };
  return { ocupacao: oc, motivo: null };
}
