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
import type { LigacaoDoCircuito } from './blueprintKernel';

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
