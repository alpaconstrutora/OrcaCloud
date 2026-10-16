import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { cotaDaFaixa, descidaDoForro, fundoDaVigaSobre, paredesDoForro } from '../utils/blueprintRotaPeloForro';
import { arvorePelasParedes } from '../utils/blueprintRotaPelasParedes';

/** Dois cômodos de 3 × 4 m lado a lado (paredes de 15 cm), vigas de 40 cm sobre todas as paredes; janela opcional na do meio. */
function casinha(opts: { janelaNoMeio?: boolean; estreito?: boolean } = {}): { m: BlueprintModel; L: string; meio: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const L = m.levels[0].id;
  const xMeio = opts.estreito ? 600 : 3000;
  const paredes: [number, number, number, number][] = [[0, 0, 6000, 0], [6000, 0, 6000, 4000], [6000, 4000, 0, 4000], [0, 4000, 0, 0], [xMeio, 0, xMeio, 4000]];
  for (const [ax, ay, bx, by] of paredes) m = applyCommand(m, { type: 'AddWall', levelId: L, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }).model;
  const meio = m.walls.find((w) => w.a.x === xMeio && w.b.x === xMeio)!.id;
  const vigas: Command[] = paredes.map(([ax, ay, bx, by]) => ({ type: 'AddStructural', levelId: L, kind: 'VIGA', pontos: [{ x: ax, y: ay }, { x: bx, y: by }], larguraMm: 150, alturaMm: 400, baseMm: 2400 }) as Command);
  m = applyBatch(m, vigas).model;
  if (opts.janelaNoMeio) m = applyCommand(m, { type: 'AddOpening', wallId: meio, kind: 'window', offsetMm: 500, widthMm: 1000, heightMm: 1200, sillMm: 1000 }).model;
  for (const s of [...m.spaces]) m = applyCommand(m, { type: 'NameSpace', spaceId: s.id, name: s.ring.some((p) => p.x === 0) ? 'Sala' : 'Cozinha' }).model;
  return { m, L, meio };
}

describe('rede pelo forro (F14b) — as paredes do forro', () => {
  it('o anel de cada cômodo recua meia parede + o afastamento; as travessias ficam no meio da parede que eles dividem e perto das pontas', () => {
    const { m, L } = casinha();
    const f = paredesDoForro(m, L, 100);
    const aneis = f.filter((w) => !w.id.includes('travessia'));
    const travessias = f.filter((w) => w.id.includes('travessia'));
    // 175 mm de cada eixo: 75 (meia parede) + 100.
    const xs = new Set(aneis.flatMap((w) => [w.a.x, w.b.x]));
    const ys = new Set(aneis.flatMap((w) => [w.a.y, w.b.y]));
    expect([...xs].sort((a, b) => a - b)).toEqual([175, 2825, 3175, 5825]);
    expect([...ys].sort((a, b) => a - b)).toEqual([175, 3825]);
    // 4 m em comum: no meio (y = 2 m) e a meia parede + afastamento + 10 cm de cada ponta (y = 0,275 e 3,725 m).
    expect(travessias.map((t) => [Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x), t.a.y, t.b.y]).sort((a, b) => a[2] - b[2])).toEqual([
      [2825, 3175, 275, 275],
      [2825, 3175, 2000, 2000],
      [2825, 3175, 3725, 3725],
    ]);
  });

  it('a árvore de um cômodo ao outro passa pela travessia — não corre pelo eixo da parede (dentro da viga)', () => {
    const { m, L } = casinha();
    const arv = arvorePelasParedes({ paredes: paredesDoForro(m, L, 100), raiz: { x: 1000, y: 3925 }, pendentes: [{ x: 5000, y: 75 }], raioDeEncaixeMm: 700 });
    expect(arv.raiz).not.toBeNull();
    expect(arv.encaixe.size).toBe(1);
    // Nenhuma aresta dentro da faixa da viga do meio (x entre 2925 e 3075), salvo a que a atravessa de lado a lado.
    for (const a of arv.arestas) {
      const dentro = [a.de, a.para].every((p) => p.x > 2925 && p.x < 3075);
      expect(dentro).toBe(false);
    }
    expect(arv.arestas.some((a) => Math.min(a.de.x, a.para.x) === 2825 && Math.max(a.de.x, a.para.x) === 3175 && a.de.y === a.para.y)).toBe(true);
  });

  it('a parede que chega perto do canto do vizinho (lado de 10 cm no anel dele) não tira o forro do cômodo — os lados colineares se juntam', () => {
    // À direita, uma parede a 10 cm do canto parte o lado direito da sala em 10 cm + 3,9 m: o lado curto, recuado
    // 17,5 cm, virava do avesso e o anel inteiro era recusado (a casa ficava com 2 de 12 cômodos no forro).
    let { m, L } = casinha();
    m = applyCommand(m, { type: 'AddWall', levelId: L, a: point(3000, 100), b: point(6000, 100), thicknessMm: 150, heightMm: 2800 }).model;
    for (const s of [...m.spaces]) if (!s.name) m = applyCommand(m, { type: 'NameSpace', spaceId: s.id, name: 'Depósito' }).model;
    const f = paredesDoForro(m, L, 100);
    const sala = m.spaces.find((s) => s.name === 'Sala')!;
    expect(sala.ring.some((p) => p.x === 3000 && p.y === 100)).toBe(true);
    // O anel da sala existe e é o retângulo recuado (4 lados, sem o pedaço de 10 cm).
    const daSala = f.filter((w) => w.id.startsWith(`forro:${sala.id}:`));
    expect(daSala).toHaveLength(4);
    expect([...new Set(daSala.flatMap((w) => [w.a.x, w.b.x]))].sort((a, b) => a - b)).toEqual([175, 2825]);
    // E a travessia para a cozinha sai no meio do trecho de parede que as duas dividem.
    expect(f.some((w) => w.id.includes('travessia') && w.id.includes(sala.id))).toBe(true);
  });

  it('cômodo estreito demais para o afastamento fica sem anel (a árvore contorna)', () => {
    const { m, L } = casinha({ estreito: true });
    const f = paredesDoForro(m, L, 300);
    // O de 60 cm (eixo a eixo) não comporta 2 × (75 + 300): só o outro tem anel, e não há travessia.
    expect(f.every((w) => w.a.x > 600 && w.b.x > 600)).toBe(true);
    expect(f.some((w) => w.id.includes('travessia'))).toBe(false);
  });
});

describe('rede pelo forro (F14b) — a descida até o ponto', () => {
  it('desce junto da viga, entra na parede logo abaixo dela (folga + raio), desce dentro da alvenaria e sai à face', () => {
    const { m, L } = casinha();
    expect(fundoDaVigaSobre(m, L, { x: 3000, y: 1000 }, 16)).toBe(2400);
    expect(fundoDaVigaSobre(m, L, { x: 1500, y: 2000 }, 16)).toBeNull();
    const d = descidaDoForro(m, L, { q: { x: 2825, y: 1000 }, cotaDaFaixaMm: cotaDaFaixa(2800, { abaixoDoTetoMm: 100, afastamentoDaFaceMm: 100 }), alvo: { x: 2925, y: 1000 }, cotaDoAlvoMm: 300, naParede: { x: 3000, y: 1000 }, raioMm: 16, folgaSobAVigaMm: 50 });
    expect(d.map((s) => [s.a.x, s.a.y, s.cotaAMm, s.b.x, s.b.y, s.cotaBMm])).toEqual([
      [2825, 1000, 2700, 2825, 1000, 2334],
      [2825, 1000, 2334, 3000, 1000, 2334],
      [3000, 1000, 2334, 3000, 1000, 300],
      [3000, 1000, 300, 2925, 1000, 300],
    ]);
  });

  it('a descida que cairia no vão da janela corre na parede acima dele até o batente e desce ao lado', () => {
    const { m, L } = casinha({ janelaNoMeio: true });
    const d = descidaDoForro(m, L, { q: { x: 2825, y: 1000 }, cotaDaFaixaMm: 2700, alvo: { x: 2925, y: 1000 }, cotaDoAlvoMm: 300, naParede: { x: 3000, y: 1000 }, raioMm: 16, folgaSobAVigaMm: 50 });
    // Nenhum pedaço vertical dentro do vão (y entre 500 e 1500, cota entre 1000 e 2200).
    for (const s of d) {
      const vertical = s.a.x === s.b.x && s.a.y === s.b.y;
      if (!vertical) continue;
      const noVao = s.a.y > 500 - 16 && s.a.y < 1500 + 16 && Math.min(s.cotaAMm, s.cotaBMm) < 2200 && Math.max(s.cotaAMm, s.cotaBMm) > 1000;
      expect(noVao).toBe(false);
    }
    // Desce ao lado do batente mais perto (o de baixo: 500 − 16 − 50).
    expect(d.some((s) => s.a.y === 434 && s.b.y === 434 && s.cotaAMm === 2334 && s.cotaBMm === 300)).toBe(true);
    expect(d[d.length - 1].b).toEqual({ x: 2925, y: 1000 });
  });

  it('peça aparente na face (a evaporadora): desce em q até a cota dela e vai até ela', () => {
    const { m, L } = casinha();
    const d = descidaDoForro(m, L, { q: { x: 2825, y: 1000 }, cotaDaFaixaMm: 2700, alvo: { x: 2925, y: 1000 }, cotaDoAlvoMm: 2200, naParede: null, raioMm: 39, folgaSobAVigaMm: 50 });
    expect(d.map((s) => [s.a.x, s.cotaAMm, s.b.x, s.cotaBMm])).toEqual([
      [2825, 2700, 2825, 2200],
      [2825, 2200, 2925, 2200],
    ]);
  });
});
