/**
 * Eixos da malha (18/09/2026, E1.4): comandos, nome por palpite, canônico,
 * cruzamentos e o pilar automático em cada cruzamento.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  snapshotHash,
} from '../utils/blueprintKernel';
import { cruzamentosDeEixos, planejarPilares } from '../utils/blueprintPilaresAutomaticos';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}

describe('AddEixo · SetEixoProps · MoveEixoVertex · DeleteEixo', () => {
  it('horizontal ganha letra (A, B…), vertical ganha número (1, 2…); nome dado vale; vazio é linha de referência', () => {
    let { m } = nivel();
    m = applyBatch(m, [
      { type: 'AddEixo', a: point(-1000, 0), b: point(9000, 0) },
      { type: 'AddEixo', a: point(-1000, 4000), b: point(9000, 4000) },
      { type: 'AddEixo', a: point(0, -1000), b: point(0, 5000) },
      { type: 'AddEixo', a: point(6000, -1000), b: point(6000, 5000) },
      { type: 'AddEixo', a: point(3000, -1000), b: point(3000, 5000), nome: 'B1' },
      { type: 'AddEixo', a: point(-1000, 2000), b: point(9000, 2000), nome: '' },
    ]).model;
    expect(m.eixos.map((e) => e.nome)).toEqual(['A', 'B', '1', '2', 'B1', '']);
    const e1 = m.eixos[2];
    m = applyCommand(m, { type: 'SetEixoProps', eixoId: e1.id, nome: '  C  ' }).model;
    expect(m.eixos[2].nome).toBe('C');
    m = applyCommand(m, { type: 'MoveEixoVertex', eixoId: e1.id, end: 'b', to: point(0, 8000) }).model;
    expect(m.eixos[2].b).toEqual({ x: 0, y: 8000 });
    expect(() => applyCommand(m, { type: 'MoveEixoVertex', eixoId: e1.id, end: 'a', to: point(0, 8000) })).toThrow(/colapsaria/);
    expect(() => applyCommand(m, { type: 'AddEixo', a: point(1, 1), b: point(1, 1) })).toThrow(/comprimento zero/);
    m = applyCommand(m, { type: 'DeleteEixo', eixoId: e1.id }).model;
    expect(m.eixos).toHaveLength(5);
  });

  it('entra no canônico só quando há eixo; ida e volta byte a byte; muda o hash', () => {
    const { m } = nivel();
    // No que entra no HASH a chave só existe com eixo (a identidade lista todas as famílias, e fica fora do hash).
    expect(payloadDoHash(m)).not.toContain('"eixos"');
    const antes = snapshotHash(m);
    const x = applyCommand(m, { type: 'AddEixo', a: point(0, 0), b: point(5000, 0), nome: 'A' }).model;
    expect(snapshotHash(x)).not.toBe(antes);
    const json = canonicalPayload(x);
    expect(json).toContain('"eixos":[{"a":{"x":0,"y":0},"b":{"x":5000,"y":0},"nome":"A"}]');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(json));
    expect(volta.eixos).toHaveLength(1);
    expect(volta.eixos[0]).toMatchObject({ nome: 'A', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } });
    expect(canonicalPayload(volta)).toBe(json);
  });
});

describe('cruzamentos e pilares automáticos', () => {
  it('malha 2×2 → 4 cruzamentos (só dentro dos segmentos); planejarPilares propõe um pilar em cada, sem giro', () => {
    let { m, t } = nivel();
    m = applyBatch(m, [
      // Uma parede, para o planejador ter pavimento com parede.
      { type: 'AddWall', levelId: t, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddEixo', a: point(-500, 0), b: point(6500, 0) },
      { type: 'AddEixo', a: point(-500, 4000), b: point(6500, 4000) },
      { type: 'AddEixo', a: point(0, -500), b: point(0, 4500) },
      { type: 'AddEixo', a: point(6000, -500), b: point(6000, 4500) },
      // Um eixo curto que NÃO alcança os outros: nenhum cruzamento extra.
      { type: 'AddEixo', a: point(10000, 0), b: point(12000, 0), nome: 'Z' },
    ]).model;
    const cruz = cruzamentosDeEixos(m);
    expect(cruz).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 4000 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
    ]);
    const plano = planejarPilares(m, t);
    const nosEixos = plano.pilares.filter((p) => p.onde === 'EIXO');
    expect(nosEixos).toHaveLength(4);
    expect(nosEixos.every((p) => p.rotacaoDeg === 0)).toBe(true);
    // Os cruzamentos sobre a parede (0,0) e (6000,0) fazem a parede ceder; os de y=4000 estão no ar.
    expect(nosEixos.find((p) => p.at.x === 0 && p.at.y === 0)!.wallIds).toHaveLength(1);
    expect(nosEixos.find((p) => p.at.x === 0 && p.at.y === 4000)!.wallIds).toHaveLength(0);
    // As pontas da parede coincidem com cruzamentos: não nasce um segundo pilar de "ponta"/nó ali.
    expect(plano.pilares.filter((p) => p.at.x === 0 && p.at.y === 0)).toHaveLength(1);
    // Aplicado, é idempotente: os cruzamentos já têm pilar.
    const aplicado = applyBatch(m, plano.comandos).model;
    expect(planejarPilares(aplicado, t).pilares.filter((p) => p.onde === 'EIXO')).toHaveLength(0);
  });
});
