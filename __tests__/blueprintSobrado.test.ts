/**
 * Casa automática F12a (15/10/2026): as peças puras do sobrado — o programa dividido, o núcleo da escada (onde
 * fica, o que recorta) e a escada em U. O orquestrador inteiro está em `blueprintCasaAutomatica.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type Command, type Point } from '../utils/blueprintKernel';
import { programaDaCasa, PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import type { AmbienteGerado, Retangulo } from '../utils/blueprintGerador';
import {
  comandoDaEscada,
  dividirPrograma,
  escolherNucleo,
  HIPOTESES_DO_SOBRADO_PADRAO,
  paredeSobOPonto,
  pedacosFora,
  pilaresDoSobrado,
  recortarNucleo,
  trechosDeTransicao,
  USOS_DO_TERREO,
  vigasDeTransicao,
  type NucleoDaEscada,
} from '../utils/blueprintSobrado';

const amb = (nome: string, uso: string, ret: Retangulo, areaMinM2 = 3): AmbienteGerado => ({ nome, ret, item: { uso, areaMinM2 } }) as unknown as AmbienteGerado;

describe('dividirPrograma', () => {
  const { programa } = programaDaCasa(PROGRAMA_CURTO_PADRAO);
  const { terreo, superior } = dividirPrograma(programa);

  it('social, serviço e garagem embaixo; dormitórios, suítes e banhos em cima — nada some', () => {
    expect(terreo.itens.every((i) => USOS_DO_TERREO.has(i.uso))).toBe(true);
    expect(superior.itens.some((i) => USOS_DO_TERREO.has(i.uso))).toBe(false);
    expect(terreo.itens.length + superior.itens.length).toBe(programa.itens.length);
  });

  it('em cima, o dormitório vai para a faixa da frente (privacidade SOCIAL só para o zoneamento) — o uso continua', () => {
    const dorms = superior.itens.filter((i) => i.uso === 'DORMITORIO');
    expect(dorms.length).toBeGreaterThan(0);
    expect(dorms.every((i) => i.privacidade === 'SOCIAL')).toBe(true);
  });

  it('as relações ficam só entre itens do mesmo pavimento', () => {
    for (const p of [terreo, superior]) {
      const ids = new Set(p.itens.map((i) => i.id));
      expect(p.relacoes.every((r) => ids.has(r.a) && ids.has(r.b))).toBe(true);
    }
  });
});

describe('pedacosFora', () => {
  const n: Retangulo = { x0: 6000, y0: 2000, x1: 8000, y1: 5000 };

  it('sem sobreposição: o ambiente inteiro', () => {
    const a = { x0: 0, y0: 0, x1: 3000, y1: 3000 };
    expect(pedacosFora(a, n)).toEqual([a]);
  });

  it('o núcleo morde um canto: o maior pedaço primeiro', () => {
    const p = pedacosFora({ x0: 4000, y0: 0, x1: 8000, y1: 3000 }, n);
    expect(p[0]).toEqual({ x0: 4000, y0: 0, x1: 6000, y1: 3000 });
    expect(p[1]).toEqual({ x0: 6000, y0: 0, x1: 8000, y1: 2000 });
  });

  it('o núcleo atravessa: dois pedaços, um de cada lado', () => {
    const p = pedacosFora({ x0: 6000, y0: 0, x1: 8000, y1: 9000 }, n);
    expect(p).toEqual([
      { x0: 6000, y0: 5000, x1: 8000, y1: 9000 },
      { x0: 6000, y0: 0, x1: 8000, y1: 2000 },
    ]);
  });
});

describe('escolherNucleo', () => {
  const casa: Retangulo = { x0: 0, y0: 0, x1: 9000, y1: 12000 };
  const corredor: Retangulo = { x0: 0, y0: 5000, x1: 9000, y1: 6200 };
  const superior = [amb('Circulação', 'CIRCULACAO', corredor)];

  it('foge do lado em que o núcleo deixaria um ambiente abaixo do mínimo', () => {
    // À direita, a área de serviço na ponta do corredor: o núcleo comeria mais da metade dela (para os fundos ou
    // para a frente); à esquerda, a sala grande perde pouco.
    const terreo = [amb('Área de serviço', 'AREA_DE_SERVICO', { x0: 6600, y0: 2600, x1: 9000, y1: 8600 }), amb('Sala', 'SALA', { x0: 0, y0: 3000, x1: 6600, y1: 12000 }, 12)];
    const n = escolherNucleo(casa, corredor, terreo, superior)!;
    expect(n.lado).toBe('ESQUERDA');
    expect(n.perdidos).toEqual([]);
    expect(n.ret.x0).toBe(0);
    expect(n.ret.x1).toBe(HIPOTESES_DO_SOBRADO_PADRAO.nucleoLarguraMm);
  });

  it('o patamar fica sobre o corredor: o núcleo começa nele (para os fundos) ou termina nele (para a frente)', () => {
    const n = escolherNucleo(casa, corredor, [], superior)!;
    if (n.paraOsFundos) expect(n.ret.y0).toBe(corredor.y0);
    else expect(n.ret.y1).toBe(corredor.y1);
  });

  it('sem corredor em cima ou casa estreita demais: null', () => {
    expect(escolherNucleo(casa, null, [], superior)).toBeNull();
    expect(escolherNucleo({ x0: 0, y0: 0, x1: 5000, y1: 12000 }, corredor, [], superior)).toBeNull();
  });
});

describe('recortarNucleo', () => {
  const L = 'nivel';
  const cmds: Command[] = [
    {
      type: 'AddWalls',
      walls: [
        { levelId: L, a: point(0, 3000), b: point(9000, 3000), thicknessMm: 150, heightMm: 2800, uid: 'w-atravessa' },
        { levelId: L, a: point(0, 0), b: point(0, 9000), thicknessMm: 200, heightMm: 2800, uid: 'w-fora' },
      ],
    } as Command,
    {
      type: 'AddOpenings',
      openings: [
        { wallId: '', wallUid: 'w-atravessa', kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100 },
        { wallId: '', wallUid: 'w-atravessa', kind: 'door', offsetMm: 7000, widthMm: 800, heightMm: 2100 },
        { wallId: '', wallUid: 'w-atravessa', kind: 'door', offsetMm: 8000, widthMm: 800, heightMm: 2100 },
      ],
    } as Command,
  ];
  const out = recortarNucleo(cmds, { x0: 6000, y0: 2000, x1: 8500, y1: 5000 });
  const paredes = out.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  const aberturas = out.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : []));

  it('a parede que atravessa o núcleo vira dois pedaços; a que não toca fica igual', () => {
    expect(paredes).toHaveLength(3);
    expect(paredes.find((w) => w.uid === 'w-atravessa')).toMatchObject({ a: { x: 0, y: 3000 }, b: { x: 6000, y: 3000 } });
    const alem = paredes.find((w) => w.uid !== 'w-atravessa' && w.uid !== 'w-fora')!;
    expect(alem).toMatchObject({ a: { x: 8500, y: 3000 }, b: { x: 9000, y: 3000 } });
    expect(paredes.find((w) => w.uid === 'w-fora')).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 0, y: 9000 } });
  });

  it('a abertura no trecho cortado sai; a do pedaço de lá é re-ancorada nele', () => {
    const alem = paredes.find((w) => w.uid !== 'w-atravessa' && w.uid !== 'w-fora')!;
    expect(aberturas).toHaveLength(1);
    expect(aberturas[0]).toMatchObject({ wallUid: 'w-atravessa', offsetMm: 1000 });
    // a de 8000–8800 caía metade no núcleo (até 8500): sai também — e a de 7000 estava inteira dentro
    expect(aberturas.some((o) => o.wallUid === alem.uid)).toBe(false);
  });
});

describe('comandoDaEscada', () => {
  const ret: Retangulo = { x0: 6600, y0: 5000, x1: 9000, y1: 8600 };
  const base: Omit<NucleoDaEscada, 'lado'> = { ret, paraOsFundos: true, partidos: [], perdidos: [], custo: 0 };
  const pontos = (c: Command) => (c.type === 'AddEscada' ? c.pontos : []);

  it('à direita: o primeiro lance junto da fachada (x maior), a virada nos fundos, a chegada junto do corredor', () => {
    const p = pontos(comandoDaEscada('L', { ...base, lado: 'DIREITA' }));
    expect(p).toHaveLength(4);
    expect(p[0].x).toBeGreaterThan(p[3].x);
    expect(p[0].y).toBe(ret.y0 + HIPOTESES_DO_SOBRADO_PADRAO.patamarMm);
    expect(p[1].y).toBe(p[0].y + HIPOTESES_DO_SOBRADO_PADRAO.lanceMm);
  });

  it('à esquerda: o espelho — o primeiro lance junto da fachada da esquerda', () => {
    const d = pontos(comandoDaEscada('L', { ...base, lado: 'DIREITA' }));
    const e = pontos(comandoDaEscada('L', { ...base, ret: { x0: 0, y0: 5000, x1: 2400, y1: 8600 }, lado: 'ESQUERDA' }));
    expect(e[0].x).toBeLessThan(e[3].x);
    expect(e.map((p) => p.y)).toEqual(d.map((p) => p.y));
    expect(e[0].x - 0).toBe(9000 - d[0].x);
  });
});

describe('F12b — a estrutura dos dois pavimentos (modelo sintético 8 × 6 m)', () => {
  // Térreo: o retângulo e uma parede interna em x = 4 m (de frente a fundos). Superior: o retângulo e uma parede
  // interna em y = 2 m (de lado a lado) — que cruza a do térreo no meio e não tem parede embaixo no resto.
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 },
  ]).model;
  const [T, S] = base.levels.map((l) => l.id);
  const parede = (levelId: string, a: Point, b: Point, e: number) => ({ levelId, a, b, thicknessMm: e, heightMm: 2800 });
  const ret = (L: string) => [parede(L, point(0, 0), point(8000, 0), 200), parede(L, point(8000, 0), point(8000, 6000), 200), parede(L, point(8000, 6000), point(0, 6000), 200), parede(L, point(0, 6000), point(0, 0), 200)];
  const model = applyBatch(base, [
    { type: 'AddWalls', walls: [...ret(T), parede(T, point(4000, 0), point(4000, 6000), 150), ...ret(S), parede(S, point(0, 2000), point(8000, 2000), 150)] } as Command,
  ]).model;

  it('trechosDeTransicao: a parede do superior sem parede embaixo, partida onde cruza a do térreo', () => {
    const t = trechosDeTransicao(model, T, S);
    expect(t).toHaveLength(2);
    for (const x of t) {
      expect(x.a.y).toBe(2000);
      expect(x.b.y).toBe(2000);
      expect(x.larguraMm).toBe(150);
    }
    const [e, d] = t;
    // de face a face: da parede externa (meia de 100) à interna do térreo (meia de 75)
    expect(e.a.x).toBeGreaterThanOrEqual(50);
    expect(e.b.x).toBeLessThanOrEqual(4000 - 75);
    expect(d.a.x).toBeGreaterThanOrEqual(4000 + 75);
    expect(d.b.x).toBeLessThanOrEqual(8000 - 50);
    expect(e.b.x - e.a.x).toBeGreaterThan(3600);
  });

  it('vigasDeTransicao: uma viga no TÉRREO por trecho, topo no pé-direito, altura pelo vão', () => {
    const t = trechosDeTransicao(model, T, S);
    const v = vigasDeTransicao(model, T, t);
    const vigas = v.comandos.filter((c) => c.type === 'AddStructural');
    expect(vigas).toHaveLength(2);
    for (const c of vigas) {
      if (c.type !== 'AddStructural') continue;
      expect(c.levelId).toBe(T);
      expect(c.kind).toBe('VIGA');
      expect(c.alturaMm).toBe(400); // ~3,85 m ÷ 10, de 5 em 5 cm
      expect((c.baseMm ?? 0) + c.alturaMm).toBe(2800);
    }
    expect(v.comandos.filter((c) => c.type === 'SetCedeSobreposicao')).toHaveLength(2);
    expect(applyBatch(model, v.comandos).model.structures!.filter((x) => x.kind === 'VIGA')).toHaveLength(2);
  });

  it('pilaresDoSobrado: os do superior em prumada ou numa viga de transição — nenhum solto', () => {
    const t = trechosDeTransicao(model, T, S);
    const p = pilaresDoSobrado(model, T, S, undefined, t);
    const r = applyBatch(model, p.comandos).model;
    const pil = (L: string) => (r.structures ?? []).filter((x) => x.levelId === L && x.kind === 'PILAR');
    expect(p.sobem).toBeGreaterThanOrEqual(4); // os quatro cantos
    expect(p.semApoio).toBe(0);
    for (const x of pil(S)) {
      const at = x.pontos[0];
      const emPrumada = pil(T).some((y) => Math.hypot(y.pontos[0].x - at.x, y.pontos[0].y - at.y) < 1);
      const naViga = t.some((v) => Math.abs(at.y - v.a.y) < 1 && at.x >= v.a.x - 300 && at.x <= v.b.x + 300);
      expect(emPrumada || naViga).toBe(true);
    }
    // O encontro da parede do superior com a fachada (x = 0 e 8 m, y = 2 m) tem parede embaixo e o térreo não tinha
    // pilar ali (o intermediário dele é em y = 3 m): desce.
    expect(pil(T).some((y) => y.pontos[0].x === 0 && y.pontos[0].y === 2000)).toBe(true);
    expect(p.descem).toBeGreaterThanOrEqual(2);
  });

  it('paredeSobOPonto: no corpo da parede sim; no vão da porta, não', () => {
    const comPorta = applyBatch(model, [{ type: 'AddOpening', wallId: model.walls.find((w) => w.levelId === T && w.a.x === 4000)!.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100 } as Command]).model;
    expect(paredeSobOPonto(comPorta, T, point(4000, 1000), 100)).not.toBeNull();
    expect(paredeSobOPonto(comPorta, T, point(4000, 2950), 100)).toBeNull();
    expect(paredeSobOPonto(comPorta, T, point(2000, 2000), 100)).toBeNull();
  });
});
