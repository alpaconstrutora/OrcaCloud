/**
 * PA10c do prédio automático (16/11/2026): as SAÍDAS de um andar para a Tabela 5 da IT 08 são as CAIXAS de escada, não as
 * peças — a escada que chega de baixo e a que sobe dali, no mesmo eixo, são a mesma caixa. Contadas por peça, o pavimento
 * tipo do prédio tinha "mais de uma saída" (35 m) e os andares de cima, com a mesma caixa, 25 m.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';
import { criteriosDoPercursoMG } from '../utils/blueprintIncendioSaidasMG';

const CRITERIOS = criteriosDoPercursoMG('MG_CBMMG', 'A-2', { construtiva: null, semLeiaute: false, controleDeFumaca: false });

/** Três pavimentos de 30 × 4 m; a escada do térreo ao 1º e a do 1º ao 2º no MESMO eixo (a mesma caixa) — ou noutro. */
function predio(segundaCaixa: boolean): { m: BlueprintModel; t: string; p1: string } {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '2º', elevationMm: 6000, defaultHeightMm: 3000 },
  ] as Command[]).model;
  const [t, p1, p2] = m.levels.map((l) => l.id);
  const caixa = (L: string): Command[] => [
    { type: 'AddWall', levelId: L, a: point(0, 0), b: point(30000, 0), thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: L, a: point(30000, 0), b: point(30000, 4000), thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: L, a: point(30000, 4000), b: point(0, 4000), thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: L, a: point(0, 4000), b: point(0, 0), thicknessMm: 150, heightMm: 3000 },
  ];
  m = applyBatch(m, [t, p1, p2].flatMap(caixa)).model;
  const eixo = [point(1000, 2000), point(4400, 2000)];
  m = applyBatch(m, [
    { type: 'AddEscada', levelId: t, pontos: eixo, larguraMm: 1200 },
    { type: 'AddEscada', levelId: p1, pontos: segundaCaixa ? [point(25600, 2000), point(29000, 2000)] : eixo, larguraMm: 1200 },
  ] as Command[]).model;
  return { m, t, p1 };
}

describe('saídas do andar = caixas de escada (PA10c)', () => {
  it('a escada que chega e a que sobe no mesmo eixo são UMA saída: o 1º andar fica com o limite de saída única', () => {
    const { m, t, p1 } = predio(false);
    const doPrimeiro = percursoDeFuga(m, 'A', t, null, CRITERIOS).ambientes.filter((a) => a.levelId === p1);
    expect(doPrimeiro.length).toBeGreaterThan(0);
    for (const a of doPrimeiro) expect(a.limiteM).toBe(25);
  });

  it('duas caixas de verdade (eixos diferentes) seguem como mais de uma saída', () => {
    const { m, t, p1 } = predio(true);
    const doPrimeiro = percursoDeFuga(m, 'A', t, null, CRITERIOS).ambientes.filter((a) => a.levelId === p1);
    for (const a of doPrimeiro) expect(a.limiteM).toBe(35);
  });
});
