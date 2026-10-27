// utils/blueprintUnidadesNoPavimento.ts
//
// AS UNIDADES DE CADA PAVIMENTO NA MASSA (27/10/2026): *"implemente também a identificação além do pavimento que já
// foi feito mas também de cada unidade em cada pavimento"*. Decisões do usuário: o 3D mostra cada andar dividido nas
// unidades dele, clicáveis, e a divisão sai das UNIDADES DO EMPREENDIMENTO daquele andar (a área privativa de cada
// uma), não do Produto. Plano: docs/planos/2026-10-27-massa-unidades-por-pavimento.md.
//
// É IDENTIFICAÇÃO, não projeto: o contorno do bloco é fatiado ao longo do lado maior, na proporção das áreas; com 4
// ou mais unidades e o lado menor de pelo menos 10 m, em duas fileiras (metade de cada lado, como um corredor
// central). Quem projeta o pavimento de verdade é o "Pavimento tipo" (`blueprintPavimentoTipoDaMassa`). Puro.

import type { Point } from './blueprintKernel';
import { compararNomesPorNumero } from './empreendimentoOrdemDasUnidades';

/**
 * Como as unidades se arrumam no andar (27/10/2026, *"ordenação de duas maneiras, automática … e manual"*):
 *  - AUTOMATICA: pelo número (101 sobre 201 sobre 301) e as duas fileiras com áreas parecidas;
 *  - EMPREENDIMENTO: a ordem da aba Torres e Unidades, a 1ª metade numa fileira e a 2ª na outra.
 */
export type ArrumacaoDasUnidades = 'AUTOMATICA' | 'EMPREENDIMENTO';

/** As unidades do andar na ordem em que a massa as fatia, e como escolher as fileiras (`fatiasPorArea`). */
export function arrumarUnidades<T extends { nome: string }>(unidades: readonly T[], modo: ArrumacaoDasUnidades): { unidades: T[]; fileiras: 'ORDEM' | 'EQUILIBRADAS' } {
  if (modo === 'EMPREENDIMENTO') return { unidades: [...unidades], fileiras: 'ORDEM' };
  return { unidades: [...unidades].sort((a, b) => compararNomesPorNumero(a.nome, b.nome)), fileiras: 'EQUILIBRADAS' };
}

const LADO_MIN_PARA_DUAS_FILEIRAS_MM = 10_000;

function areaMm2(anel: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** O pedaço do anel com projeção em `d` entre `de` e `ate` (Sutherland–Hodgman com dois semiplanos). */
function faixa(anel: readonly Point[], d: Point, de: number, ate: number): Point[] {
  const corta = (pol: Point[], dentro: (t: number) => boolean, limite: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < pol.length; i++) {
      const a = pol[i];
      const b = pol[(i + 1) % pol.length];
      const ta = a.x * d.x + a.y * d.y;
      const tb = b.x * d.x + b.y * d.y;
      if (dentro(ta)) out.push(a);
      if (dentro(ta) !== dentro(tb)) {
        const k = (limite - ta) / (tb - ta);
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      }
    }
    return out;
  };
  return corta(corta([...anel], (t) => t >= de, de), (t) => t <= ate, ate);
}

/** A posição em `d` que deixa `alvo` mm² do anel antes dela (busca binária: a área cresce com a posição). */
function corteNaArea(anel: readonly Point[], d: Point, min: number, max: number, alvo: number): number {
  let lo = min;
  let hi = max;
  for (let k = 0; k < 50; k++) {
    const meio = (lo + hi) / 2;
    if (areaMm2(faixa(anel, d, min, meio)) < alvo) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

/** Fatias ao longo de `d`, na proporção de `pesos`, dentro do trecho [min, max] de `d`. */
function fatiar(anel: readonly Point[], d: Point, pesos: readonly number[]): Point[][] {
  const ts = anel.map((p) => p.x * d.x + p.y * d.y);
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  const total = areaMm2(anel);
  const soma = pesos.reduce((s, p) => s + p, 0);
  const out: Point[][] = [];
  let de = min;
  let acumulado = 0;
  pesos.forEach((p, i) => {
    acumulado += p;
    const ate = i === pesos.length - 1 ? max : corteNaArea(anel, d, min, max, (total * acumulado) / soma);
    out.push(faixa(anel, d, de, ate));
    de = ate;
  });
  return out;
}

const arredondar = (anel: Point[]) => anel.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

/**
 * O contorno `anel` (mm) fatiado em uma fatia por peso, na ordem dos pesos. Peso nulo, zero ou inválido vale a
 * média dos outros (a "Área Comum" sem área privativa, o estacionamento). Sem pesos, nada.
 */
export function fatiasPorArea(
  anel: readonly Point[],
  pesos: readonly (number | null | undefined)[],
  /**
   * Com duas fileiras, quem vai em cada uma (27/10/2026). 'ORDEM' (o padrão): a 1ª metade numa e a 2ª na outra — a
   * ordem que a pessoa arrumou no Empreendimento. 'EQUILIBRADAS' (a ordem automática): cada unidade, na ordem, vai
   * para a fileira com menos área até agora (e com vaga), e as fileiras saem com áreas parecidas — a Torre A do Garden
   * (127, 127, 81, 81) ficava com 61 % do andar de um lado. A fatia k continua sendo a unidade k.
   */
  fileiras: 'ORDEM' | 'EQUILIBRADAS' = 'ORDEM',
): Point[][] {
  if (pesos.length === 0 || anel.length < 3) return [];
  const validos = pesos.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
  const media = validos.length > 0 ? validos.reduce((s, p) => s + p, 0) / validos.length : 1;
  const ps = pesos.map((p) => (typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : media));
  if (ps.length === 1) return [arredondar([...anel])];

  // O lado maior dá a direção das fatias; a perpendicular, a das fileiras.
  let maior = { d: { x: 1, y: 0 }, len: 0 };
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > maior.len) maior = { d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, len };
  }
  const u = maior.d;
  const v = { x: -u.y, y: u.x };
  const tv = anel.map((p) => p.x * v.x + p.y * v.y);
  const larguraEmV = Math.max(...tv) - Math.min(...tv);

  if (ps.length >= 4 && larguraEmV >= LADO_MIN_PARA_DUAS_FILEIRAS_MM) {
    const n1 = Math.ceil(ps.length / 2);
    const vagas = [n1, ps.length - n1];
    const quem: [number[], number[]] = [[], []];
    const somas = [0, 0];
    ps.forEach((p, i) => {
      const lado = fileiras === 'ORDEM' ? (i < n1 ? 0 : 1) : quem[0].length >= vagas[0] ? 1 : quem[1].length >= vagas[1] ? 0 : somas[1] < somas[0] ? 1 : 0;
      quem[lado].push(i);
      somas[lado] += p;
    });
    const [fileiraA, fileiraB] = fatiar(anel, v, somas);
    const out: Point[][] = new Array(ps.length);
    fatiar(fileiraA, u, quem[0].map((i) => ps[i])).forEach((f, k) => (out[quem[0][k]] = f));
    fatiar(fileiraB, u, quem[1].map((i) => ps[i])).forEach((f, k) => (out[quem[1][k]] = f));
    return out.map(arredondar);
  }
  return fatiar(anel, u, ps).map(arredondar);
}
