/**
 * ONDE A PEÇA SE LIGA À REDE — a caixa da luz de teto na rede (25/10/2026).
 *
 * O pedido, com a foto de uma caixa octogonal e o print do 3D da Garden: *"essa é uma caixa de luz de teto, note que a
 * caixa tem 6 entradas e é por onde cada conduite chega. Por sua vez note que na planta 3d os conduites se encontrar
 * acima da caixa e desce apenas um conduite o que nao é o correto"*. Decisão do usuário: a caixa fica NO ALTO, na rede
 * (no forro da Garden, a 2,755 m, onde os eletrodutos já correm), cada eletroduto entra por uma lateral dela, e da caixa
 * até a luminária na face do forro (2,553 m) desce só cabo — o trecho vertical deixa de existir.
 *
 * A luminária continua na cota dela (`cotaMm`: é a altura de montagem que o cálculo de iluminação usa). O que muda é
 * onde ela se LIGA à rede: sem eletroduto chegando na cota da luminária, vale a ponta de eletroduto mais baixa no mesmo
 * prumo, acima dela, até `ALCANCE_DA_CAIXA_DA_LUZ_MM`. A planta antiga, com a descida, continua ligada como sempre
 * (há ponta na cota da luminária). É uma regra derivada do desenho, e não um campo novo do modelo: o payload gravado não
 * muda.
 */
import type { BlueprintModel, Terminal } from './model';

/** Até isto acima da luminária a caixa da luz de teto pode estar (a rede no forro corre ~20 cm acima da face dele). */
export const ALCANCE_DA_CAIXA_DA_LUZ_MM = 600;

/** A luz de teto cuja caixa fica na rede que corre a `cotaDaRedeMm`: acima dela, dentro do alcance. O motor não lança a descida. */
export function caixaDaLuzNaRede(t: Pick<Terminal, 'disciplina' | 'tipoEletrico' | 'cotaMm'>, cotaDaRedeMm: number): boolean {
  return t.disciplina === 'ELETRICA' && t.tipoEletrico === 'ILUMINACAO_TETO' && cotaDaRedeMm > t.cotaMm && cotaDaRedeMm - t.cotaMm <= ALCANCE_DA_CAIXA_DA_LUZ_MM;
}

/**
 * A cota em que cada peça se liga à rede elétrica: a da própria peça, menos a da luz de teto com a caixa na rede (ver o
 * cabeçalho). Monte uma vez por modelo e pergunte por peça.
 */
export function cotasDeLigacao(model: Pick<BlueprintModel, 'trechos'>): (t: Terminal) => number {
  /** As cotas das pontas de eletroduto em cada ponto de cada pavimento. */
  const pontas = new Map<string, number[]>();
  const anotar = (levelId: string, x: number, y: number, cota: number) => {
    const k = `${levelId}|${x},${y}`;
    const lista = pontas.get(k);
    if (lista) lista.push(cota);
    else pontas.set(k, [cota]);
  };
  for (const t of model.trechos ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    anotar(t.levelId, t.a.x, t.a.y, t.cotaAMm);
    anotar(t.levelId, t.b.x, t.b.y, t.cotaBMm);
  }
  return (t) => {
    if (t.disciplina !== 'ELETRICA' || t.tipoEletrico !== 'ILUMINACAO_TETO') return t.cotaMm;
    const cotas = pontas.get(`${t.levelId}|${t.at.x},${t.at.y}`);
    if (!cotas || cotas.includes(t.cotaMm)) return t.cotaMm;
    const acima = cotas.filter((c) => c > t.cotaMm && c - t.cotaMm <= ALCANCE_DA_CAIXA_DA_LUZ_MM);
    return acima.length > 0 ? Math.min(...acima) : t.cotaMm;
  };
}
