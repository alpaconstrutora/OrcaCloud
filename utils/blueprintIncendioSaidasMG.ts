/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — SAÍDAS DE EMERGÊNCIA PELA IT 08 DO CBMMG.
 *
 * Transcrição das Tabelas 3 a 6 da IT 08 (2ª ed., alterada pela Portaria 69/2022), lidas pela
 * imagem das pp. 34–38 — o texto humano está em `docs/normas/incendio-mg/it08-tabelas.txt`, e o
 * teste `incendioSaidasMG.test.ts` relê aquele texto e confere estes dados.
 *
 * O que a IT 08 decide, e que o rascunho (por GRUPO, de memória) tinha errado:
 *  - população e capacidade da unidade de passagem são por DIVISÃO (Tabela 4): C é 1 pessoa por
 *    3 m² (não 5), a escada de C/D/E é 60 por UP (não 75), a H-1 não é a H-3…; a "área" é a do
 *    pavimento SEM sanitários, escadas, rampas e corredores (nota E);
 *  - a porta tem luz mínima de 0,80 m para 1 UP e 1,0 m para 2 (5.5.4.3) — não 0,55 m por UP;
 *  - o tipo de escada e o número de saídas vão por divisão × altura (Tabela 6);
 *  - o percurso máximo (Tabela 5) depende das características construtivas (X/Y/Z), do pavimento
 *    (térreo × demais), de haver uma ou mais saídas, de detecção e de chuveiros — e vai até o
 *    LOCAL SEGURO: o exterior ou a ESCADA (5.5.2.1), não até a rua passando pela escada.
 */
import type { ProtecaoDaEscada } from './blueprintKernel';

export const FONTE_IT08_MG = 'IT 08 do CBMMG (Portaria 69/2022)';
export const UNIDADE_DE_PASSAGEM_MM = 550;

// ─── Tabela 4 ────────────────────────────────────────────────────────────────

/** Como a Tabela 4 conta a população. `null` em m² = "+" (consultar norma específica). */
export type RegraDePopulacao =
  | { tipo: 'DORMITORIO'; pessoasPorDormitorio: number; m2PorPessoaNoAlojamento: number | null }
  | { tipo: 'AREA'; m2PorPessoa: number; soSalaDeAula?: boolean }
  | { tipo: 'VAGAS'; vagasPorPessoa: number }
  | { tipo: 'LEITO'; pessoasPorLeito: number; m2PorPessoaNoAmbulatorio: number }
  | { tipo: 'ESPECIFICA' };

export interface LinhaDaTabela4 {
  divisoes: readonly string[];
  populacao: RegraDePopulacao;
  /** Capacidade da UP: acesso/descarga, escada/rampa, porta. `null` = "+" (norma específica). */
  capacidade: { acesso: number; escada: number; porta: number } | null;
}

const cap = (acesso: number, escada: number, porta: number) => ({ acesso, escada, porta });
/** IT 08, Tabela 4 (p. 35). */
export const TABELA_4_IT08: readonly LinhaDaTabela4[] = [
  { divisoes: ['A-1', 'A-2'], populacao: { tipo: 'DORMITORIO', pessoasPorDormitorio: 2, m2PorPessoaNoAlojamento: null }, capacidade: cap(60, 45, 100) },
  { divisoes: ['A-3'], populacao: { tipo: 'DORMITORIO', pessoasPorDormitorio: 2, m2PorPessoaNoAlojamento: 4 }, capacidade: cap(60, 45, 100) },
  { divisoes: ['B-1', 'B-2'], populacao: { tipo: 'AREA', m2PorPessoa: 15 }, capacidade: cap(60, 45, 100) },
  { divisoes: ['C-1', 'C-2', 'C-3'], populacao: { tipo: 'AREA', m2PorPessoa: 3 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['D-1', 'D-2', 'D-3', 'D-4'], populacao: { tipo: 'AREA', m2PorPessoa: 7 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['E-1', 'E-2', 'E-3', 'E-4'], populacao: { tipo: 'AREA', m2PorPessoa: 1.5, soSalaDeAula: true }, capacidade: cap(100, 60, 100) },
  { divisoes: ['E-5', 'E-6'], populacao: { tipo: 'AREA', m2PorPessoa: 1.5, soSalaDeAula: true }, capacidade: cap(30, 22, 30) },
  { divisoes: ['F-1', 'F-10'], populacao: { tipo: 'AREA', m2PorPessoa: 3 }, capacidade: cap(100, 75, 100) },
  { divisoes: ['F-2', 'F-5', 'F-8', 'F-9', 'F-11'], populacao: { tipo: 'AREA', m2PorPessoa: 1 }, capacidade: cap(100, 75, 100) },
  { divisoes: ['F-3', 'F-6', 'F-7'], populacao: { tipo: 'AREA', m2PorPessoa: 0.5 }, capacidade: cap(100, 75, 100) },
  { divisoes: ['F-4'], populacao: { tipo: 'AREA', m2PorPessoa: 3 }, capacidade: cap(100, 75, 100) },
  { divisoes: ['G-1'], populacao: { tipo: 'VAGAS', vagasPorPessoa: 40 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['G-2', 'G-3', 'G-4', 'G-5'], populacao: { tipo: 'AREA', m2PorPessoa: 20 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['H-1', 'H-6'], populacao: { tipo: 'AREA', m2PorPessoa: 7 }, capacidade: cap(60, 45, 100) },
  { divisoes: ['H-2'], populacao: { tipo: 'DORMITORIO', pessoasPorDormitorio: 2, m2PorPessoaNoAlojamento: 4 }, capacidade: cap(30, 22, 30) },
  { divisoes: ['H-3'], populacao: { tipo: 'LEITO', pessoasPorLeito: 1.5, m2PorPessoaNoAmbulatorio: 7 }, capacidade: cap(30, 22, 30) },
  { divisoes: ['H-4'], populacao: { tipo: 'AREA', m2PorPessoa: 7 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['H-5'], populacao: { tipo: 'ESPECIFICA' }, capacidade: cap(60, 45, 100) },
  { divisoes: ['I-1', 'I-2', 'I-3'], populacao: { tipo: 'AREA', m2PorPessoa: 10 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['J-1', 'J-2', 'J-3', 'J-4'], populacao: { tipo: 'AREA', m2PorPessoa: 30 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['L-1'], populacao: { tipo: 'AREA', m2PorPessoa: 3 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['L-2', 'L-3'], populacao: { tipo: 'AREA', m2PorPessoa: 10 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['M-1', 'M-6'], populacao: { tipo: 'ESPECIFICA' }, capacidade: cap(100, 75, 100) },
  { divisoes: ['M-3', 'M-7'], populacao: { tipo: 'AREA', m2PorPessoa: 10 }, capacidade: cap(100, 60, 100) },
  { divisoes: ['M-4'], populacao: { tipo: 'AREA', m2PorPessoa: 4 }, capacidade: cap(60, 45, 100) },
  { divisoes: ['M-5'], populacao: { tipo: 'ESPECIFICA' }, capacidade: null },
  { divisoes: ['M-8'], populacao: { tipo: 'ESPECIFICA' }, capacidade: null },
];

export function linhaDaTabela4(divisao: string | null): LinhaDaTabela4 | null {
  return divisao ? (TABELA_4_IT08.find((l) => l.divisoes.includes(divisao)) ?? null) : null;
}

/** 5.4.2.1: mínimo de unidades de passagem — 2 (1,10 m) em geral; 3 (1,65 m) em escadas, acessos e descarga da H-2 e da H-3. */
export function minimoDeUnidades(divisao: string | null): number {
  return divisao === 'H-2' || divisao === 'H-3' ? 3 : 2;
}

/** 5.5.4.3: a luz mínima da porta pelo número de UP — 0,80 (N ≤ 1), 1,0 (≤ 2), 1,5 (≤ 3), 2,0 (≤ 4); acima, N × 0,55 m. */
export function luzDaPortaMm(unidades: number): number {
  return ([800, 1000, 1500, 2000] as const)[Math.max(1, unidades) - 1] ?? unidades * UNIDADE_DE_PASSAGEM_MM;
}

// ─── Tabela 5 ────────────────────────────────────────────────────────────────

export type CaracteristicaConstrutiva = 'X' | 'Y' | 'Z';
const Z_PRIMEIRA = ['C', 'D', 'E', 'F', 'G-3', 'G-4', 'G-5', 'H', 'I', 'L', 'M'];

/** IT 08, Tabela 5 (p. 37), m: [tipo, linha Z da ocupação] → térreo/demais → [sem chuveiro: única(sem,com det), mais(sem,com); com chuveiro: única, mais]. */
export const TABELA_5_IT08: Readonly<Record<string, { terreo: readonly number[]; demais: readonly number[] }>> = {
  X: { terreo: [35, 50, 45, 65, 50, 70, 65, 85], demais: [25, 40, 35, 50, 40, 55, 50, 65] },
  Y: { terreo: [45, 65, 60, 75, 65, 85, 75, 95], demais: [35, 50, 45, 60, 50, 65, 60, 75] },
  Z1: { terreo: [65, 85, 75, 95, 85, 100, 95, 110], demais: [50, 65, 60, 75, 65, 80, 75, 90] },
  Z2: { terreo: [70, 90, 85, 100, 90, 105, 100, 120], demais: [55, 70, 65, 80, 70, 85, 80, 95] },
};

export interface CriteriosDoPercursoMG {
  divisao: string | null;
  /** Tabela 3. `null` = não declarado → usa X (o mais restritivo) e pede a declaração. */
  construtiva: CaracteristicaConstrutiva | null;
  /** 5.5.2.3 / nota a: sem leiaute definido em planta → −30%. */
  semLeiaute: boolean;
  /** Nota b: com controle de fumaça → +50%. */
  controleDeFumaca: boolean;
}

export function limiteDaTabela5(
  c: CriteriosDoPercursoMG,
  situacao: { terreo: boolean; maisDeUmaSaida: boolean; deteccao: boolean; chuveiros: boolean; edificacaoTerrea: boolean },
): { limiteM: number; motivo: string } {
  let tipo: CaracteristicaConstrutiva = c.construtiva ?? 'X';
  if (situacao.edificacaoTerrea && tipo === 'X') tipo = 'Y'; // Tabela 3, nota b
  const div = c.divisao ?? '';
  // Z: a 1ª linha é C, D, E, F, G-3, G-4, G-5, H, I, L e M (grupo inteiro ou a divisão citada); a 2ª, A, B, G-1, G-2 e J.
  const naPrimeira = Z_PRIMEIRA.some((x) => div === x || (x.length === 1 && div.startsWith(`${x}-`)));
  const linha = tipo !== 'Z' ? tipo : naPrimeira ? 'Z1' : 'Z2';
  const k = (situacao.chuveiros ? 4 : 0) + (situacao.maisDeUmaSaida ? 2 : 0) + (situacao.deteccao ? 1 : 0);
  let limite = TABELA_5_IT08[linha][situacao.terreo ? 'terreo' : 'demais'][k];
  const partes = [
    `tipo ${tipo}${c.construtiva == null ? ' (não declarado — usado X, o mais restritivo)' : tipo !== c.construtiva ? ' (térrea: no mínimo Y)' : ''}`,
    situacao.terreo ? 'térreo' : 'demais andares',
    situacao.maisDeUmaSaida ? 'mais de uma saída' : 'saída única',
    situacao.chuveiros ? 'com chuveiros' : 'sem chuveiros',
    situacao.deteccao ? 'com detecção' : 'sem detecção',
  ];
  if (c.semLeiaute) {
    limite *= 0.7;
    partes.push('sem leiaute: −30%');
  }
  if (c.controleDeFumaca) {
    limite *= 1.5;
    partes.push('controle de fumaça: +50%');
  }
  return { limiteM: Math.round(limite * 10) / 10, motivo: `${partes.join(', ')} (${FONTE_IT08_MG}, Tabela 5)` };
}

// ─── Tabela 6 ────────────────────────────────────────────────────────────────

export type CelulaDaTabela6 = { numero: number; tipo: ProtecaoDaEscada | null } | 'NAO_SE_APLICA' | 'NORMA_ESPECIFICA';
const c6 = (s: string): CelulaDaTabela6 => {
  if (s === '- -') return 'NAO_SE_APLICA';
  if (s === '+ +') return 'NORMA_ESPECIFICA';
  const [n, t] = s.split(' ');
  return { numero: Number(n), tipo: t === '-' ? null : (t as ProtecaoDaEscada) };
};
const linha6 = (...xs: string[]) => xs.map(c6);

/** IT 08, Tabela 6 (p. 38): por divisão (ou grupo inteiro: "D", "J"), as 4 faixas de altura da IT 01. */
export const TABELA_6_IT08: Readonly<Record<string, readonly CelulaDaTabela6[]>> = {
  'A-2': linha6('1 NE', '1 EP', '1 PF', '1 PF'),
  'A-3': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'B-1': linha6('1 NE', '1 PF', '2 PF', '2 PF'),
  'B-2': linha6('1 NE', '1 PF', '2 PF', '2 PF'),
  'C-1': linha6('1 NE', '1 EP', '2 EP', '2 EP'),
  'C-2': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'C-3': linha6('1 NE', '2 PF', '2 PF', '2 PF'),
  D: linha6('1 NE', '1 EP', '1 PF', '1 PF'),
  'E-1': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'E-2': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'E-3': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'E-4': linha6('1 NE', '1 EP', '3 PF', '3 PF'),
  'E-5': linha6('1 NE', '1 EP', '2 PF', '2 PF'),
  'E-6': linha6('2 NE', '2 EP', '2 PF', '2 PF'),
  'F-1': linha6('1 NE', '2 EP', '2 PF', '2 PF'),
  'F-2': linha6('1 NE', '2 PF', '2 PF', '2 PF'),
  'F-3': linha6('2 NE', '2 NE', '2 PF', '2 PF'),
  'F-4': linha6('2 NE', '+ +', '+ +', '+ +'),
  'F-5': linha6('2 NE', '2 PF', '2 PF', '2 PF'),
  'F-6': linha6('2 NE', '2 PF', '2 PF', '2 PF'),
  'F-7': linha6('2 NE', '- -', '- -', '- -'),
  'F-8': linha6('1 NE', '2 PF', '2 PF', '2 PF'),
  'F-9': linha6('2 NE', '2 EP', '2 PF', '2 PF'),
  'F-10': linha6('1 NE', '2 EP', '2 PF', '2 PF'),
  'F-11': linha6('2 NE', '2 EP', '2 PF', '2 PF'),
  'G-1': linha6('1 NE', '1 NE', '1 EP', '1 EP'),
  'G-2': linha6('1 NE', '1 EP', '1 EP', '1 EP'),
  'G-3': linha6('1 NE', '1 PF', '1 PF', '1 PF'),
  'G-4': linha6('1 NE', '1 EP', '1 PF', '1 PF'),
  'G-5': linha6('1 NE', '1 NE', '- -', '- -'),
  'H-1': linha6('1 NE', '1 EP', '- -', '- -'),
  'H-2': linha6('1 NE', '1 PF', '1 PF', '1 PF'),
  'H-3': linha6('2 NE', '2 PF', '2 PF', '2 PF'),
  'H-4': linha6('2 NE', '2 EP', '2 PF', '2 PF'),
  'H-5': linha6('2 NE', '+ +', '+ +', '+ +'),
  'H-6': linha6('1 NE', '1 PF', '1 PF', '1 PF'),
  'I-1': linha6('2 NE', '2 EP', '2 EP', '2 EP'),
  'I-2': linha6('2 NE', '2 EP', '2 PF', '2 PF'),
  'I-3': linha6('2 NE', '2 PF', '2 PF', '2 PF'),
  J: linha6('1 NE', '1 NE', '1 NE', '1 NE'),
  'L-1': linha6('1 -', '- -', '- -', '- -'),
  'L-2': linha6('2 NE', '2 PF', '3 PF', '3 PF'),
  'L-3': linha6('2 NE', '2 PF', '3 PF', '3 PF'),
  'M-1': linha6('1 NE', '+ +', '+ +', '+ +'),
  'M-2': linha6('2 EP', '2 PF', '3 PF', '3 PF'),
  'M-3': linha6('2 NE', '2 PF', '2 PF', '2 PF'),
  'M-4': linha6('1 NE', '1 NE', '1 NE', '1 NE'),
  'M-5': linha6('+ +', '+ +', '+ +', '+ +'),
  'M-8': linha6('+ +', '+ +', '+ +', '+ +'),
};

/** A célula da Tabela 6 para a divisão e a altura (H em m). `null` = divisão fora da tabela. */
export function saidasDaTabela6(divisao: string | null, alturaM: number): { celula: CelulaDaTabela6; faixa: string } | null {
  if (!divisao) return null;
  const linha = TABELA_6_IT08[divisao] ?? TABELA_6_IT08[divisao.charAt(0)];
  if (!linha) return null;
  const i = alturaM <= 12 + 1e-9 ? 0 : alturaM <= 30 + 1e-9 ? 1 : alturaM <= 54 + 1e-9 ? 2 : 3;
  return { celula: linha[i], faixa: ['H ≤ 12 m', '12 < H ≤ 30 m', '30 < H ≤ 54 m', 'H > 54 m'][i] };
}

/** Nota F da Tabela 6: o número mínimo pode ser desconsiderado (exceto F-6, H-2, H-3) até 36 m, se distância e UP atendem. */
export function numeroDispensavelPelaNotaF(divisao: string | null, alturaM: number): boolean {
  return !!divisao && !['F-6', 'H-2', 'H-3'].includes(divisao) && alturaM <= 36 + 1e-9;
}

/** Os critérios da Tabela 5 para o estudo — só no preset MG (o único com a tabela); senão `null`. */
export function criteriosDoPercursoMG(
  preset: string,
  divisao: string | null,
  saidas: { construtiva: CaracteristicaConstrutiva | null; semLeiaute: boolean; controleDeFumaca: boolean },
): CriteriosDoPercursoMG | null {
  return preset === 'MG_CBMMG' ? { divisao, construtiva: saidas.construtiva, semLeiaute: saidas.semLeiaute, controleDeFumaca: saidas.controleDeFumaca } : null;
}
