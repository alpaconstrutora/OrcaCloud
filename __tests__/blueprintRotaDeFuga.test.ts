/**
 * INCÊNDIO E6.3 (01/10/2026): o percurso de fuga a partir do ponto mais
 * desfavorável, por vários pavimentos pela escada, contornando paredes, e o
 * limite (CONFERIR NA IT).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Space } from '../utils/blueprintKernel';
import { caminhoDentro, limiteDoPercursoM, percursoDeFuga } from '../utils/blueprintRotaDeFuga';

/**
 * N pavimentos 10 × 10 m (3 m cada); em cada um, a caixa da escada (x 6–10,
 * y 0–6) com porta para o hall em (6; 2,45). Uma escada por pavimento, dentro
 * da caixa, de (8; 1) a (8; 5). O térreo tem porta para fora em (2,45; 0).
 */
function predio(pavimentos: number): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < pavimentos; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : `${i}º`, elevationMm: 3000 * i, defaultHeightMm: 3000 }).model;
  const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m.levels.forEach((lv, i) => {
    const l = lv.id;
    m = applyBatch(m, [w(l, 0, 0, 6000, 0), w(l, 6000, 0, 10000, 0), w(l, 10000, 0, 10000, 10000), w(l, 10000, 10000, 0, 10000), w(l, 0, 10000, 0, 0), w(l, 6000, 0, 6000, 6000), w(l, 6000, 6000, 10000, 6000)]).model;
    const caixa = m.walls.find((x) => x.levelId === l && x.a.x === 6000 && x.b.x === 6000)!;
    const porta = (wallId: string): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command;
    m = applyCommand(m, porta(caixa.id)).model;
    if (i === 0) m = applyCommand(m, porta(m.walls.find((x) => x.levelId === l && x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!.id)).model;
    if (i < pavimentos - 1) m = applyCommand(m, { type: 'AddEscada', levelId: l, pontos: [point(8000, 1000), point(8000, 5000)], larguraMm: 1200, rotulo: `E${i + 1}` } as Command).model;
  });
  return m;
}
const hall = (m: BlueprintModel, levelIndex: number) => m.spaces.find((s) => s.levelId === m.levels[levelIndex].id && s.areaMm2 > 50e6)!;

describe('E6.3 · contornar paredes', () => {
  it('no L, o caminho passa pelo canto de dentro e mede a soma das pernas', () => {
    const s = { id: 's', levelId: 'l', ring: [point(0, 0), point(10000, 0), point(10000, 3000), point(3000, 3000), point(3000, 10000), point(0, 10000)], holes: [], areaMm2: 0, perimeterMm: 0 } as Space;
    const c = caminhoDentro(s, point(9000, 1500), point(1500, 9000))!;
    // Reto sairia do L; pelo canto (3; 3): √(6² + 1,5²) + √(1,5² + 6²).
    expect(c.pontos).toHaveLength(3);
    expect(c.pontos[1]).toEqual(point(3000, 3000));
    expect(c.mm).toBeCloseTo(2 * Math.hypot(6000, 1500), 6);
  });
});

describe('E6.3 · o percurso de fuga', () => {
  it('⚠️ PRONTO QUANDO: no sobrado, a rota do hall de cima passa pela escada, desce, e sai pela porta do térreo', () => {
    const m = predio(2);
    const p = percursoDeFuga(m, 'A', m.levels[0].id);
    const r = p.ambientes.find((a) => a.spaceId === hall(m, 1).id)!;
    expect(r.pelaEscada).toBe(true);
    // Dois pedaços: o de cima (até a boca da escada) e o de baixo (o lance + o térreo até a porta).
    expect(r.rota.map((x) => x.levelId)).toEqual([m.levels[1].id, m.levels[0].id]);
    const baixo = r.rota[1].pontos;
    expect(baixo[baixo.length - 1]).toEqual(point(2450, 0));
    // Mais longo que a mesma rota no térreo: há o lance inclinado (√(4² + 3²) = 5 m) e os dois halls.
    const terreo = p.ambientes.find((a) => a.spaceId === hall(m, 0).id)!;
    expect(terreo.pelaEscada).toBe(false);
    expect(r.distanciaM!).toBeGreaterThan(terreo.distanciaM! + 5);
  });

  it('a origem é o ponto mais desfavorável: um canto do hall, não o centro', () => {
    const m = predio(2);
    const r = percursoDeFuga(m, 'A', m.levels[0].id).ambientes.find((a) => a.spaceId === hall(m, 0).id)!;
    // O canto oposto à porta da rua (2,45; 0) é o de cima à direita do hall, (9,6; 9,6).
    expect(r.origem).toEqual(point(9600, 9600));
  });

  it('no prédio, cada pavimento acima soma um lance; com o limite estourado a análise dá FALTA com o comprimento', () => {
    const m = predio(4);
    const p = percursoDeFuga(m, 'A', m.levels[0].id);
    const d = [0, 1, 2, 3].map((i) => p.ambientes.find((a) => a.spaceId === hall(m, i).id)!.distanciaM!);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(d[2]).toBeGreaterThan(d[1]);
    expect(d[3]).toBeGreaterThan(d[2]);
    expect(p.maisLonga!.spaceId).toBe(hall(m, 3).id);
    const curto = percursoDeFuga(m, 'A', m.levels[0].id, 20);
    const topo = curto.ambientes.find((a) => a.spaceId === hall(m, 3).id)!;
    expect(topo.atende).toBe(false);
    expect(topo.distanciaM).toBeCloseTo(d[3], 9);
    expect(curto.motivo).toBe('declarado nas premissas');
  });

  it('a porta para fora num pavimento de cima (varanda) não é saída; sem a do térreo, ninguém sai', () => {
    let m = predio(2);
    const paredeDaRua = m.walls.find((w) => w.levelId === m.levels[0].id && w.a.y === 0 && w.b.y === 0 && w.a.x === 0)!;
    const portaDaRua = m.openings.find((o) => o.wallId === paredeDaRua.id)!;
    m = applyCommand(m, { type: 'DeleteOpening', openingId: portaDaRua.id } as Command).model;
    const p = percursoDeFuga(m, 'A', m.levels[0].id);
    expect(p.ambientes.every((a) => a.distanciaM === null)).toBe(true);
    expect(p.pendencias.join(' ')).toMatch(/não tem porta para o exterior/);
  });

  it('o limite pela divisão: 30 m sem chuveiros, 45 m com (grupo A); comércio 40/55', () => {
    expect(limiteDoPercursoM('A', false, null).limiteM).toBe(30);
    expect(limiteDoPercursoM('A', true, null).limiteM).toBe(45);
    expect(limiteDoPercursoM('C', false, null).limiteM).toBe(40);
  });
});
