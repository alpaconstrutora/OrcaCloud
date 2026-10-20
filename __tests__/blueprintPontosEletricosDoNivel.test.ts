/**
 * Os pontos elétricos pela norma, por ambiente e por pavimento (F9 da casa automática, 15/10/2026) — o
 * encadeamento único do "Completar pela norma", do gerador E6.2 e da casa automática. E os dois defeitos que a
 * casa achou no caminho: o desenho GIRADO (o lado de piso ficava no eixo, e a tomada sumia da contagem ou caía no
 * cômodo vizinho) e o PILAR (a tomada ia para dentro dele).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, pegadaEmPlanta, point, pointInPolygon, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDePontosDoNivel } from '../utils/blueprintPontosEletricosDoNivel';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { semEspiculas } from '../utils/blueprintDistribuicao';
import { paredeDoLado } from '../utils/blueprintLadoDaParede';

/** Sala e dormitório 4 × 4, lado a lado, porta na parede do meio; girados de `graus`. */
function duasSalas(graus: number): { m: BlueprintModel; L: string } {
  const a0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const L = a0.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number) => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: L, a: g(ax, ay), b: g(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a0, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const meio = m.walls.find((x) => Math.abs(x.a.x - g(4000, 0).x) < 2 && Math.abs(x.a.y - g(4000, 0).y) < 2)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: meio.id, kind: 'DOOR', offsetMm: 1500, widthMm: 800, heightMm: 2100 } as Command).model;
  m = applyCommand(m, { type: 'PlaceSpaceLabels', labels: [{ levelId: L, at: g(2000, 2000), name: 'Sala', uso: 'SALA' }, { levelId: L, at: g(6000, 2000), name: 'Dormitório', uso: 'DORMITORIO' }] } as Command).model;
  return { m, L };
}

describe('comandosDePontosDoNivel', () => {
  it.each([0, 17, 30, 45])('a %i°: cada ambiente fecha a norma (tomadas e luz com interruptor) e nenhum ponto cai no vizinho', (graus) => {
    const { m, L } = duasSalas(graus);
    const r = applyBatch(m, comandosDePontosDoNivel(m, L, { peDireitoMm: 2800 })).model;
    const achados = conferirNbr5410(r, L).regras.filter((x) => x.codigo === '9.5.2.1' || x.codigo === '9.5.2.2.1').flatMap((x) => x.achados);
    expect(achados).toEqual([]);
    for (const s of r.spaces) {
      const tomadas = (r.terminais ?? []).filter((t) => t.tipoEletrico === 'TUG' && pointInPolygon(s.ring, t.at));
      expect(tomadas).toHaveLength(4); // 1 a cada 5 m de 15–16 m de perímetro
    }
  });

  it('a tomada não vai dentro do pilar da parede', () => {
    const { m: semPilar, L } = duasSalas(0);
    // O pilar exatamente onde a 1ª tomada cairia sem ele.
    const onde = comandosDePontosDoNivel(semPilar, L, { peDireitoMm: 2800 }).find((c): c is Extract<Command, { type: 'AddTerminal' }> => c.type === 'AddTerminal' && c.tipoEletrico === 'TUG')!.at;
    const m = applyCommand(semPilar, { type: 'AddStructural', levelId: L, kind: 'PILAR', pontos: [onde], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, baseMm: 0 } as Command).model;
    const pilar = pegadaEmPlanta(m.structures[0]);
    const cmds = comandosDePontosDoNivel(m, L, { peDireitoMm: 2800 });
    const tomadas = cmds.filter((c): c is Extract<Command, { type: 'AddTerminal' }> => c.type === 'AddTerminal' && c.tipoEletrico === 'TUG');
    expect(tomadas.length).toBeGreaterThan(0);
    for (const t of tomadas) expect(pointInPolygon(pilar, t.at)).toBe(false);
    // E a norma continua fechando: o pilar só empurra a tomada para o lado.
    const r = applyBatch(m, cmds).model;
    expect(conferirNbr5410(r, L).regras.find((x) => x.codigo === '9.5.2.2.1')!.achados).toEqual([]);
  });
});

describe('S1 da casa automática: os pontos elétricos fogem do tubo do forro (a água é traçada antes deles)', () => {
  const pontos = (m: BlueprintModel, L: string) => comandosDePontosDoNivel(m, L, { peDireitoMm: 2800 }).filter((c): c is Extract<Command, { type: 'AddTerminal' }> => c.type === 'AddTerminal');
  const tubo = (L: string, a: { x: number; y: number }, b: { x: number; y: number }): Command => ({ type: 'AddTrecho', levelId: L, disciplina: 'AGUA_QUENTE', a: point(a.x, a.y), b: point(b.x, b.y), cotaAMm: 2630, cotaBMm: 2630, bitolaMm: 22 } as Command);

  it('a tomada não fica sob o tubo que corre COLADO na face da parede; o anel normal do forro (a 10 cm) não a impede', () => {
    const { m: base, L } = duasSalas(0);
    const onde = pontos(base, L).find((c) => c.tipoEletrico === 'TUG')!.at;
    // Colado na face onde a 1ª tomada cairia, ao longo da parede (a de y constante ou a de x constante).
    const naHorizontal = base.walls.some((w) => w.a.y === w.b.y && Math.abs(onde.y - w.a.y) <= 100);
    const [a, b] = naHorizontal ? [{ x: onde.x - 1500, y: onde.y }, { x: onde.x + 1500, y: onde.y }] : [{ x: onde.x, y: onde.y - 1500 }, { x: onde.x, y: onde.y + 1500 }];
    const m = applyCommand(base, tubo(L, a, b)).model;
    const tomadas = pontos(m, L).filter((c) => c.tipoEletrico === 'TUG');
    const dist = (p: { x: number; y: number }) => (naHorizontal ? (p.x >= a.x && p.x <= b.x ? Math.abs(p.y - a.y) : Infinity) : p.y >= a.y && p.y <= b.y ? Math.abs(p.x - a.x) : Infinity);
    for (const t of tomadas) expect(dist(t.at)).toBeGreaterThan(11 + 12.5 + 20);
    // A norma continua fechando.
    expect(conferirNbr5410(applyBatch(m, pontos(m, L)).model, L).regras.find((x) => x.codigo === '9.5.2.2.1')!.achados).toEqual([]);
    // O anel do forro a 10 cm da face não bloqueia: as tomadas continuam onde estavam.
    const longe = applyCommand(base, tubo(L, naHorizontal ? { x: a.x, y: a.y + (onde.y < 2000 ? 100 : -100) } : { x: a.x + (onde.x < 4000 ? 100 : -100), y: a.y }, naHorizontal ? { x: b.x, y: b.y + (onde.y < 2000 ? 100 : -100) } : { x: b.x + (onde.x < 4000 ? 100 : -100), y: b.y })).model;
    expect(pontos(longe, L).find((c) => c.tipoEletrico === 'TUG')!.at).toEqual(onde);
  });

  it('a luz de teto sai de baixo do tubo que passaria por cima dela', () => {
    const { m: base, L } = duasSalas(0);
    const luz = pontos(base, L).find((c) => c.tipoEletrico === 'ILUMINACAO_TETO')!.at;
    const m = applyCommand(base, tubo(L, { x: luz.x - 1500, y: luz.y }, { x: luz.x + 1500, y: luz.y })).model;
    const nova = pontos(m, L).find((c) => c.tipoEletrico === 'ILUMINACAO_TETO')!.at;
    // Sai para o LADO do tubo (andar ao longo dele não adianta).
    expect(Math.abs(nova.y - luz.y)).toBeGreaterThan(11 + 12.5 + 20);
    expect(nova.x).toBe(luz.x);
  });
});

describe('o lado do ambiente no desenho girado', () => {
  it('a espícula (P, Q, P) e o vértice repetido saem do anel', () => {
    const anel = [point(0, 0), point(4000, 0), point(4000, 1000), point(4010, 1018), point(4000, 1000), point(4000, 3000), point(0, 3000), point(0, 3000)];
    expect(semEspiculas(anel)).toEqual([point(0, 0), point(4000, 0), point(4000, 1000), point(4000, 3000), point(0, 3000)]);
  });

  it('a parede do lado é achada com os vértices a até 5 mm da reta dela (o arredondamento do giro)', () => {
    const w = { a: point(0, 0), b: point(8000, 2339) };
    expect(paredeDoLado([w], point(1000, 295), point(5000, 1465))).toBe(w); // 2–3 mm fora da reta
    expect(paredeDoLado([w], point(1000, 320), point(5000, 1465))).toBeNull(); // 28 mm: é outra parede
  });
});
