/**
 * OS CONDUTORES DENTRO DO ELETRODUTO — a simbologia da prancha (15/09/2026).
 *
 * Pedido, com a tabela da NBR 5444 e um exemplo de planta: *"simbologia dos
 * circuitos elétricos nos eletrodutos"*. Cada condutor que passa pelo
 * eletroduto é um traço cruzando a linha, e o DESENHO do traço diz o que ele
 * é:
 *
 *   FASE     traço reto cruzando a linha;
 *   NEUTRO   traço cruzando, com um pé curto no topo (o "⌐");
 *   RETORNO  traço curto só de um lado da linha (não cruza);
 *   TERRA    traço cruzando, com a barra no topo (o "T").
 *
 * Em cima do grupo vai o NÚMERO do circuito; embaixo, a SEÇÃO em mm² — é
 * assim que o exemplo se lê: "2 ⌐ T / 4" = circuito 2, fase, neutro e terra
 * de 4 mm².
 *
 * ─── O QUE O MODELO SABE, E DE ONDE SAI CADA CONDUTOR ────────────────────────
 *
 * O trecho guarda só a CONTAGEM (`condutores`) e o circuito; a LIGAÇÃO do
 * circuito (FN, FF, FFF) diz a composição de base:
 *
 *   FN  → fase, neutro, terra            (3)
 *   FF  → fase, fase, terra              (3)
 *   FFF → fase, fase, fase, terra        (4)
 *
 * Contagem MAIOR que a base = retornos (o fio que volta do interruptor à
 * lâmpada — o projetista sobe a contagem no trecho, e o excedente é retorno).
 * Contagem MENOR = tira-se de trás para a frente (terra, depois neutro, depois
 * fases), sem inventar o que não foi declarado. Trecho sem circuito assume FN.
 *
 * Puro e compartilhado: o canvas e a prancha PDF/DXF desenham a MESMA lista,
 * cada um no seu traço.
 */
import type { LigacaoDoCircuito } from './model';

export type TipoDeCondutor = 'FASE' | 'NEUTRO' | 'RETORNO' | 'TERRA';

export const ROTULO_DO_CONDUTOR: Record<TipoDeCondutor, string> = {
  FASE: 'fase',
  NEUTRO: 'neutro',
  RETORNO: 'retorno',
  TERRA: 'terra',
};

const BASE_POR_LIGACAO: Record<LigacaoDoCircuito, TipoDeCondutor[]> = {
  FN: ['FASE', 'NEUTRO', 'TERRA'],
  FF: ['FASE', 'FASE', 'TERRA'],
  FFF: ['FASE', 'FASE', 'FASE', 'TERRA'],
};

/**
 * A lista de condutores do trecho, na ordem em que se desenham: fases, neutro,
 * retornos e, por último, o terra — a ordem do exemplo da prancha.
 */
export function condutoresDoTrecho(
  trecho: { condutores?: number | null },
  circuito: { ligacao?: LigacaoDoCircuito | null } | null | undefined,
): TipoDeCondutor[] {
  const n = Math.max(0, Math.floor(trecho.condutores ?? 0));
  if (n === 0) return [];
  const base = BASE_POR_LIGACAO[circuito?.ligacao ?? 'FN'];
  if (n <= base.length) return base.slice(0, n);
  const semTerra = base.slice(0, -1);
  const retornos = Array.from({ length: n - base.length }, (): TipoDeCondutor => 'RETORNO');
  return [...semTerra, ...retornos, 'TERRA'];
}

/**
 * O número do circuito para o rótulo em cima do grupo: o que vem depois do
 * "C" no nome ("C12 — TUG Cozinha" → "12"). Nome sem esse padrão volta
 * inteiro, curto; sem circuito, "?".
 */
export function numeroDoCircuito(nome: string | null | undefined): string {
  if (!nome) return '?';
  const m = /^C\s*(\d+)/i.exec(nome.trim());
  if (m) return m[1];
  return nome.trim().split(/\s+[—–-]\s+/)[0].slice(0, 6);
}

/**
 * Os segmentos que desenham UM condutor, em unidades relativas: `t` ao longo
 * da linha (0 = no centro do traço), `s` perpendicular (−1 = topo, +1 = base;
 * `s` é multiplicado pela meia altura do traço). Quem desenha aplica a escala
 * e a orientação. O pé do neutro e a barra do terra têm `pe` de comprimento
 * (fração da meia altura) — 0,6 é o que se lê na tabela da norma.
 */
export function tracosDoCondutor(
  tipo: TipoDeCondutor,
  pe = 0.6,
): { de: { t: number; s: number }; ate: { t: number; s: number } }[] {
  const cruzando = { de: { t: 0, s: -1 }, ate: { t: 0, s: 1 } };
  switch (tipo) {
    case 'FASE':
      return [cruzando];
    case 'NEUTRO':
      return [cruzando, { de: { t: 0, s: -1 }, ate: { t: pe, s: -1 } }];
    case 'RETORNO':
      return [{ de: { t: 0, s: -1 }, ate: { t: 0, s: 0 } }];
    case 'TERRA':
      return [cruzando, { de: { t: -pe, s: -1 }, ate: { t: pe, s: -1 } }];
  }
}

/** Um condutor com o circuito a que pertence — para o eletroduto compartilhado. */
export interface CondutorIdentificado {
  tipo: TipoDeCondutor;
  circuitoId: string | null;
}

/**
 * Os condutores de um eletroduto que carrega VÁRIOS circuitos (15/09/2026):
 * a base de cada circuito pela ligação dele, na ordem dos circuitos; o que a
 * contagem do trecho tiver além da soma das bases é retorno (sem dono certo —
 * fica sem circuito); abaixo da soma, a contagem declarada vence e a lista é
 * cortada pelo fim. Um circuito só cai em `condutoresDoTrecho`.
 */
export function condutoresDoEletroduto(
  trecho: { condutores?: number | null },
  circuitos: readonly { id: string; ligacao?: LigacaoDoCircuito | null }[],
): CondutorIdentificado[] {
  if (circuitos.length <= 1) {
    const c = circuitos[0] ?? null;
    return condutoresDoTrecho(trecho, c).map((tipo) => ({ tipo, circuitoId: c?.id ?? null }));
  }
  const n = Math.max(0, Math.floor(trecho.condutores ?? 0));
  const bases = circuitos.map((c) => BASE_POR_LIGACAO[c.ligacao ?? 'FN'].map((tipo) => ({ tipo, circuitoId: c.id })));
  const soma = bases.reduce((t, b) => t + b.length, 0);
  const lista = bases.flat();
  if (n === 0) return lista;
  if (n <= soma) return lista.slice(0, n);
  const retornos = Array.from({ length: n - soma }, (): CondutorIdentificado => ({ tipo: 'RETORNO', circuitoId: null }));
  return [...lista, ...retornos];
}

// ─── A SEÇÃO DE CADA CONDUTOR (E2.3, 29/09/2026) ────────────────────────────
//
// A fase é a seção do circuito. O NEUTRO e o PE (terra) podem ser diferentes:
//   · NEUTRO — NBR 5410 6.2.6.2: mesma seção da fase em circuito monofásico
//     (F-N) e bifásico; no trifásico, igual à fase até 25 mm² (cobre). Acima
//     disso a norma ADMITE reduzir (6.2.6.2.4) — aqui NÃO se reduz: é
//     hipótese conservadora, dita, até a E4 trazer o quadro trifásico inteiro.
//   · PE — NBR 5410 Tabela 58 (seção mínima do condutor de proteção pela da
//     fase): S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2, na seção nominal
//     imediatamente acima quando a metade não é nominal (95 → 50).
// O declarado no circuito (`secaoNeutroMm2`, `secaoPeMm2`) vence a conta.

/** Seções nominais de condutor de cobre (NBR NM 280), mm². */
export const SECOES_NOMINAIS_DE_CONDUTOR_MM2: readonly number[] = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500];

/** A seção do NEUTRO pela da fase (6.2.6.2) — sem redução acima de 25 mm² (hipótese conservadora). */
export function secaoDoNeutroMm2(faseMm2: number, _ligacao: LigacaoDoCircuito | null | undefined): number {
  return faseMm2;
}

/** A seção do CONDUTOR DE PROTEÇÃO pela da fase — NBR 5410:2004, Tabela 58. */
export function secaoDoPeMm2(faseMm2: number): number {
  if (faseMm2 <= 16) return faseMm2;
  if (faseMm2 <= 35) return 16;
  const metade = faseMm2 / 2;
  return SECOES_NOMINAIS_DE_CONDUTOR_MM2.find((s) => s >= metade) ?? metade;
}

/** As três seções de um circuito: a fase dada, o neutro e o PE — o DECLARADO vence a conta, e a saída diz qual foi derivado. */
export function secoesDosCondutores(
  circuito: { ligacao?: LigacaoDoCircuito | null; secaoNeutroMm2?: number | null; secaoPeMm2?: number | null },
  faseMm2: number | null | undefined,
): { faseMm2: number | null; neutroMm2: number | null; peMm2: number | null; neutroDerivado: boolean; peDerivado: boolean } {
  const fase = faseMm2 ?? null;
  const neutro = circuito.secaoNeutroMm2 ?? (fase != null ? secaoDoNeutroMm2(fase, circuito.ligacao) : null);
  const pe = circuito.secaoPeMm2 ?? (fase != null ? secaoDoPeMm2(fase) : null);
  return { faseMm2: fase, neutroMm2: neutro, peMm2: pe, neutroDerivado: circuito.secaoNeutroMm2 == null, peDerivado: circuito.secaoPeMm2 == null };
}
