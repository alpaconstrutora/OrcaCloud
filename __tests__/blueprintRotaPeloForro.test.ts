import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { cotaDaFaixa, descidaDoForro, fundoDaVigaSobre, paredesDoForro, ramaisDaLajeDeCima, saidaDoRebaixoPelaParede, semDedosEstreitos } from '../utils/blueprintRotaPeloForro';
import { pointInPolygon } from '../utils/blueprintKernel';
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

describe('rede pelo forro (F14c) — a descida entra na parede em ângulo reto e escorrega do tubo de outra rede', () => {
  const pedacos = (d: ReturnType<typeof descidaDoForro>) => d.map((s) => [s.a.x, s.a.y, s.cotaAMm, s.b.x, s.b.y, s.cotaBMm]);

  it('o nó afastado do ponto (empurrado por um shaft): reto até a parede e por dentro dela, abaixo da viga — nunca na diagonal pelo cômodo', () => {
    const { m, L } = casinha();
    const d = descidaDoForro(m, L, { q: { x: 2825, y: 1600 }, cotaDaFaixaMm: 2700, alvo: { x: 2925, y: 1000 }, cotaDoAlvoMm: 300, naParede: { x: 3000, y: 1000 }, raioMm: 16, folgaSobAVigaMm: 50 });
    expect(pedacos(d)).toEqual([
      [2825, 1600, 2700, 2825, 1600, 2334],
      [2825, 1600, 2334, 3000, 1600, 2334],
      [3000, 1600, 2334, 3000, 1000, 2334],
      [3000, 1000, 2334, 3000, 1000, 300],
      [3000, 1000, 300, 2925, 1000, 300],
    ]);
    // Cada pedaço horizontal é paralelo ou perpendicular à parede.
    for (const s of d) expect(s.a.x === s.b.x || s.a.y === s.b.y).toBe(true);
  });

  it('a travessia de outra rede passando onde o tubo desceria: o nó escorrega pelo contorno até ficar livre', () => {
    let { m, L } = casinha();
    // A fria atravessa a viga do meio em y = 1 m, na faixa dela (2,65 m) — justo onde a quente desceria.
    m = applyCommand(m, { type: 'AddTrecho', levelId: L, disciplina: 'AGUA_FRIA', a: point(2700, 1000), b: point(3300, 1000), cotaAMm: 2650, cotaBMm: 2650, bitolaMm: 25 } as Command).model;
    const o = { q: { x: 2825, y: 1000 }, cotaDaFaixaMm: 2700, alvo: { x: 2925, y: 1000 }, cotaDoAlvoMm: 300, naParede: { x: 3000, y: 1000 }, raioMm: 20, folgaSobAVigaMm: 50 };
    // Sem a disciplina, como antes: desce em cima da fria.
    expect(pedacos(descidaDoForro(m, L, o))[0]).toEqual([2825, 1000, 2700, 2825, 1000, 2330]);
    const d = descidaDoForro(m, L, { ...o, disciplina: 'AGUA_QUENTE' });
    // Anda 5 cm pelo contorno, no forro (para um lado ou outro); desce; entra na parede em ângulo reto; corre nela até o ponto.
    const y = d[0].b.y;
    expect(Math.abs(y - 1000)).toBe(50);
    expect(pedacos(d)).toEqual([
      [2825, 1000, 2700, 2825, y, 2700],
      [2825, y, 2700, 2825, y, 2330],
      [2825, y, 2330, 3000, y, 2330],
      [3000, y, 2330, 3000, 1000, 2330],
      [3000, 1000, 2330, 3000, 1000, 300],
      [3000, 1000, 300, 2925, 1000, 300],
    ]);
    // A mesma rede não é obstáculo de si mesma.
    expect(pedacos(descidaDoForro(m, L, { ...o, disciplina: 'AGUA_FRIA' }))[0]).toEqual([2825, 1000, 2700, 2825, 1000, 2330]);
  });

  it('o escorregão não entra na parede: rente à parede de cima, vai para o outro lado', () => {
    let { m, L } = casinha();
    // A fria passa em y = 3,88 m; o nó ali está a 12 cm do eixo da parede de cima (meia parede 7,5 + raio 2): 5 cm para
    // cima já encostaria nela.
    m = applyCommand(m, { type: 'AddTrecho', levelId: L, disciplina: 'AGUA_FRIA', a: point(2700, 3880), b: point(3300, 3880), cotaAMm: 2650, cotaBMm: 2650, bitolaMm: 25 } as Command).model;
    const d = descidaDoForro(m, L, { q: { x: 2825, y: 3880 }, cotaDaFaixaMm: 2700, alvo: { x: 2925, y: 3880 }, cotaDoAlvoMm: 300, naParede: { x: 3000, y: 3880 }, raioMm: 20, folgaSobAVigaMm: 50, disciplina: 'AGUA_QUENTE' });
    expect(d[0].b).toEqual({ x: 2825, y: 3830 });
  });
});

describe('rede pelo forro (F14c) — o dedo estreito do contorno sai antes de recuar', () => {
  it('a fresta de 25 cm (recuo de 27,5 cm de cada lado) é cortada rente à base; os lados dela ficam sem anel', () => {
    // Retângulo 6 × 4 m com um dedo de 25 cm × 2 m para cima (x de 3 a 3,25 m).
    const v = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 3250, y: 4000 }, { x: 3250, y: 6000 }, { x: 3000, y: 6000 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }];
    const r = semDedosEstreitos(v, v.map(() => 275))!;
    // Sobra o retângulo.
    expect(r.vertices.map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,0', '0,4000', '6000,0', '6000,4000']);
    // Os lados do dedo (3, 4, 5) não viram lado do anel; os de baixo e da direita continuam.
    expect([r.novo[3], r.novo[4], r.novo[5]]).toEqual([-1, -1, -1]);
    expect(r.novo[0]).toBeGreaterThanOrEqual(0);
    expect(r.novo[1]).toBeGreaterThanOrEqual(0);
    // O lado de cima junta os dois pedaços da parede de cima.
    expect(r.novo[2]).toBe(r.novo[6]);
  });

  it('o dedo largo (mais que os dois recuos) e o recorte para dentro ficam', () => {
    const largo = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 3600, y: 4000 }, { x: 3600, y: 6000 }, { x: 3000, y: 6000 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }];
    expect(semDedosEstreitos(largo, largo.map(() => 275))).toBeNull();
    const recorte = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 3250, y: 4000 }, { x: 3250, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }];
    expect(semDedosEstreitos(recorte, recorte.map(() => 275))).toBeNull();
  });
});

describe('F18 da casa automática', () => {
  it('o anel com CHANFRO (o encontro imperfeito de duas paredes: 5 × 2 cm em diagonal) ganha forro — antes o cômodo ficava sem', () => {
    const { m, L } = casinha();
    const sala = m.spaces.find((s) => s.name === 'Sala')!;
    // O canto (0, 0) da Sala vira o chanfro (0, 20) → (50, 0).
    const comChanfro = { ...m, spaces: m.spaces.map((s) => (s.id !== sala.id ? s : { ...s, ring: s.ring.flatMap((p) => (p.x === 0 && p.y === 0 ? [point(0, 20), point(50, 0)] : [p])) })) };
    const anelDaSala = (x: BlueprintModel) => paredesDoForro(x, L, 100).filter((w) => w.id.startsWith(`forro:${sala.id}:`));
    expect(anelDaSala(m).length).toBe(4);
    expect(anelDaSala(comChanfro).length).toBe(4);
    // O canto refeito: o anel recua do encontro das paredes, (175, 175).
    expect(anelDaSala(comChanfro).some((w) => (w.a.x === 175 && w.a.y === 175) || (w.b.x === 175 && w.b.y === 175))).toBe(true);
  });

  it('o ponto na parede DENTRO do vão da janela (abaixo do peitoril): a descida entra na parede AO LADO da janela e corre por baixo dela', () => {
    const { m: m0, L, meio } = casinha();
    // A janela da parede do meio (x = 3 m) sobe até 2,38 m — acima da entrada na parede (sob a viga de 2,40 m): y de 0,5
    // a 1,5 m. O ponto na face, sob ela, a 0,90 m.
    const m = applyCommand(m0, { type: 'AddOpening', wallId: meio, kind: 'window', offsetMm: 500, widthMm: 1000, heightMm: 1380, sillMm: 1000 }).model;
    const alvo = point(2925, 1000);
    const pedacos = descidaDoForro(m, L, { q: point(2825, 1000), cotaDaFaixaMm: 2685, alvo, cotaDoAlvoMm: 900, naParede: alvo, raioMm: 12, folgaSobAVigaMm: 30, disciplina: 'AGUA_FRIA' });
    const noVao = (x: number, y: number, z: number) => Math.abs(x - 3000) <= 75 + 12 && y > 500 - 12 && y < 1500 + 12 && z > 1000 - 12 && z < 2380 + 12;
    for (const p of pedacos) {
      for (let k = 0; k <= 20; k++) {
        const f = k / 20;
        const [x, y, z] = [p.a.x + (p.b.x - p.a.x) * f, p.a.y + (p.b.y - p.a.y) * f, p.cotaAMm + (p.cotaBMm - p.cotaAMm) * f];
        expect(noVao(x, y, z), JSON.stringify(p)).toBe(false);
      }
    }
    const ultimo = pedacos[pedacos.length - 1];
    expect([ultimo.b, ultimo.cotaBMm]).toEqual([alvo, 900]);
  });

  it('F20: sob a janela, a fria contorna pelo batente cuja corrida por baixo NÃO passa onde a quente (ainda sem tubo) vai descer', () => {
    const { m: m0, L, meio } = casinha();
    const m = applyBatch(m0, [
      { type: 'AddOpening', wallId: meio, kind: 'window', offsetMm: 500, widthMm: 1000, heightMm: 1380, sillMm: 1000 },
      // O ponto da quente logo fora do batente de baixo (y = 0,47 m), ainda sem tubo; o da fria sob a janela, a 0,70 m.
      { type: 'AddTerminal', levelId: L, disciplina: 'AGUA_QUENTE', tipo: 'Pia', at: point(2925, 470), cotaMm: 900, tipoHidraulico: 'PIA_COZINHA' },
    ] as Command[]).model;
    const alvo = point(2925, 700);
    const pedacos = descidaDoForro(m, L, { q: point(2825, 700), cotaDaFaixaMm: 2685, alvo, cotaDoAlvoMm: 900, naParede: alvo, raioMm: 12, folgaSobAVigaMm: 30, disciplina: 'AGUA_FRIA' });
    expect(pedacos.length).toBeGreaterThan(0);
    // A descida da quente (na face e no eixo da parede, da cota do ponto para cima) fica livre: raio + raio + folga.
    for (const p of pedacos) {
      for (let k = 0; k <= 40; k++) {
        const f = k / 40;
        const [x, y, z] = [p.a.x + (p.b.x - p.a.x) * f, p.a.y + (p.b.y - p.a.y) * f, p.cotaAMm + (p.cotaBMm - p.cotaAMm) * f];
        if (z < 900 - 30) continue;
        for (const vx of [2925, 3000]) expect(Math.hypot(x - vx, y - 470), JSON.stringify(p)).toBeGreaterThan(12 + 12.5);
      }
    }
    const ultimo = pedacos[pedacos.length - 1];
    expect([ultimo.b, ultimo.cotaBMm]).toEqual([alvo, 900]);
  });
});

describe('ramaisDaLajeDeCima (F27 item 5): o ramal que corre na laje do pavimento de cima vira obstáculo pela cota REAL', () => {
  // Térreo a 0 com 2,80 m; o 1º a 2,90 m (a laje de 10 cm); o esgoto do 1º a −16 cm, de (1000, 500) a (1000, 1500).
  const casa = () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 2900, defaultHeightMm: 2800 }).model;
    const [t, s] = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.id);
    m = applyBatch(m, [{ type: 'AddTrecho', levelId: s, disciplina: 'ESGOTO', a: point(1000, 500), b: point(1000, 1500), cotaAMm: -160, cotaBMm: -165, bitolaMm: 100 } as Command]).model;
    return { m, t, s };
  };

  it('o eletroduto do térreo a 2,755 m (o ramal fica a 2,735 m no espaço): um obstáculo em volta do ramal', () => {
    const { m, t } = casa();
    const obst = ramaisDaLajeDeCima(m, t, 2755, 'ELETRICA', 12.5);
    expect(obst).toHaveLength(1);
    expect(pointInPolygon(obst[0], point(1000, 1000))).toBe(true);
    expect(pointInPolygon(obst[0], point(1300, 1000))).toBe(false);
  });

  it('a faixa bem abaixo (2,40 m), a própria rede e o pavimento de cima sem nada na laje: nenhum', () => {
    const { m, t, s } = casa();
    expect(ramaisDaLajeDeCima(m, t, 2400, 'ELETRICA', 12.5)).toEqual([]);
    expect(ramaisDaLajeDeCima(m, t, 2755, 'ESGOTO', 50)).toEqual([]);
    expect(ramaisDaLajeDeCima(m, s, 2755, 'ELETRICA', 12.5)).toEqual([]);
  });
});

describe('saidaDoRebaixoPelaParede (item 6): o ponto de parede sob a laje rebaixada chega pela parede, de fora do rebaixo', () => {
  const comRebaixo = () => {
    const { m, L } = casinha();
    // O rebaixo do banheiro de cima sobre o canto da sala (x 0–2 m, y 3–4 m), com a base a 2,50 m.
    const laje: Command = { type: 'AddStructural', levelId: L, kind: 'LAJE', pontos: [{ x: 0, y: 3000 }, { x: 2000, y: 3000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }], alturaMm: 100, baseMm: 2500, rotulo: 'L1' } as Command;
    return { m: applyCommand(m, laje).model, L };
  };

  it('sai pela parede até fora do rebaixo (com a folga e o raio), e corre abaixo do rebaixo e da viga', () => {
    const { m, L } = comRebaixo();
    // O interruptor na face da parede de cima (y = 3925), sob o rebaixo.
    const r = saidaDoRebaixoPelaParede(m, L, { x: 1000, y: 3925 }, 1100, 12.5, 50)!;
    // A borda do rebaixo em x = 2000; + 12,5 + 20 → o primeiro passo de 50 fora: x = 2050, na face.
    expect(r.s).toEqual({ x: 2050, y: 3925 });
    // A viga da parede (base 2,40 m) manda: 2400 − 50 − 12,5.
    expect(r.cotaMm).toBe(2337);
  });

  it('fora do rebaixo, ou com a corrida cruzando uma janela, nada muda (null)', () => {
    const { m, L } = comRebaixo();
    expect(saidaDoRebaixoPelaParede(m, L, { x: 4000, y: 3925 }, 1100, 12.5, 50)).toBeNull();
    // A parede de cima que passa em x = 1000 (o kernel pode tê-la partido no encontro com a do meio).
    const cima = m.walls.find((w) => w.a.y === 4000 && w.b.y === 4000 && Math.min(w.a.x, w.b.x) <= 1000 && Math.max(w.a.x, w.b.x) >= 1000)!;
    // Janela de x 1500 a 500 (peitoril 1,00 m, até 2,40 m), no caminho da corrida (x 1000 → 2050, a 2,337 m).
    const offset = cima.a.x > cima.b.x ? cima.a.x - 1500 : 500 - cima.a.x;
    const comJanela = applyCommand(m, { type: 'AddOpening', wallId: cima.id, kind: 'window', offsetMm: offset, widthMm: 1000, heightMm: 1400, sillMm: 1000 }).model;
    expect(saidaDoRebaixoPelaParede(comJanela, L, { x: 1000, y: 3925 }, 1100, 12.5, 50)).toBeNull();
  });
});
