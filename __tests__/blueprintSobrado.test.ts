/**
 * Casa automática F12a (15/10/2026): as peças puras do sobrado — o programa dividido, o núcleo da escada (onde
 * fica, o que recorta) e a escada em U. O orquestrador inteiro está em `blueprintCasaAutomatica.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type Command, type Point } from '../utils/blueprintKernel';
import { paredesEmComum } from '../utils/blueprintRotaPelasParedes';
import { programaDaCasa, PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import type { AmbienteGerado, Retangulo } from '../utils/blueprintGerador';
import { HIPOTESES_PILARES_PADRAO } from '../utils/blueprintPilaresAutomaticos';
import {
  alinharJanelasDoSuperior,
  comandoDaEscada,
  dividirEmTres,
  dividirPrograma,
  escolherNucleo,
  HIPOTESES_DO_SOBRADO_PADRAO,
  paredeSobOPonto,
  prumadasPeloMeioDoComodo,
  pedacosFora,
  shaftDoGrupo,
  zonaMolhadaDoBanheiro,
  zonasMolhadasDoBanheiro,
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

describe('dividirEmTres (F27-D: social embaixo, íntimo em cima)', () => {
  const curto = { ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 2, banheiros: 3, padrao: 'R1-A' as const };
  const { programa } = programaDaCasa(curto);
  const { terreo, primeiro, segundo } = dividirEmTres(programa);
  const usos = (p: typeof programa) => p.itens.map((i) => i.uso);

  it('térreo social e serviço SEM o escritório; o 2º com a suíte principal, o banheiro dela e o escritório', () => {
    expect(usos(terreo)).not.toContain('ESCRITORIO');
    expect(terreo.itens.every((i) => USOS_DO_TERREO.has(i.uso))).toBe(true);
    expect(segundo.itens.map((i) => i.id).sort()).toEqual(['bsuite1', 'circ:2', 'esc', 'suite1']);
    expect(usos(primeiro)).toContain('SUITE');
    expect(usos(primeiro)).toContain('DORMITORIO');
  });

  it('nada some: só a circulação existe em dois pavimentos (a cópia do 2º tem id próprio)', () => {
    const ids = [...terreo.itens, ...primeiro.itens, ...segundo.itens].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !id.endsWith(':2')).sort()).toEqual(programa.itens.map((i) => i.id).sort());
    expect(usos(primeiro)).toContain('CIRCULACAO');
  });

  it('as relações ficam no pavimento; as da circulação valem para a cópia no 2º', () => {
    for (const p of [terreo, primeiro, segundo]) {
      const ids = new Set(p.itens.map((i) => i.id));
      expect(p.relacoes.every((r) => ids.has(r.a) && ids.has(r.b))).toBe(true);
    }
    expect(segundo.relacoes.some((r) => r.a === 'circ:2' || r.b === 'circ:2')).toBe(true);
    expect(segundo.relacoes.some((r) => r.tipo === 'OBRIGATORIA' && [r.a, r.b].sort().join() === 'bsuite1,suite1')).toBe(true);
  });

  it('sem suíte, UM dormitório sobe ao 2º — os outros ficam no 1º (a quantidade se divide, não se perde)', () => {
    const { programa: p0 } = programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, suites: 0 });
    const d = dividirEmTres(p0);
    const qtd = (p: typeof p0) => p.itens.filter((i) => i.uso === 'DORMITORIO').reduce((s, i) => s + i.quantidade, 0);
    expect(qtd(d.segundo)).toBe(1);
    expect(qtd(d.primeiro)).toBe(qtd(p0) - 1);
    expect(d.primeiro.itens.some((i) => i.uso === 'BANHEIRO')).toBe(true);
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

  it('F23: o pilar do superior que cairia sobre a porta do térreo escorrega pela parede de cima até ter parede cheia embaixo', () => {
    // Porta no térreo, na fachada x = 0 (desenhada de y = 6 para 0 m), de y = 1,5 a 2,5 m — bem sob o T do superior em (0, 2 m).
    const fachada = model.walls.find((w) => w.levelId === T && w.a.x === 0 && w.b.x === 0)!;
    const comPorta = applyBatch(model, [{ type: 'AddOpening', wallId: fachada.id, kind: 'door', offsetMm: 3500, widthMm: 1000, heightMm: 2100 } as Command]).model;
    const t = trechosDeTransicao(comPorta, T, S);
    const p = pilaresDoSobrado(comPorta, T, S, undefined, t);
    expect(p.sobreAbertura).toBe(0);
    const r = applyBatch(comPorta, p.comandos).model;
    // Na fachada já havia os cantos e o intermediário do térreo que sobe (y = 0, 3 e 6 m); o do T é o quarto.
    const naFachada = (L: string) => (r.structures ?? []).filter((x) => x.levelId === L && x.kind === 'PILAR' && x.pontos[0].x === 0 && ![0, 3000, 6000].includes(x.pontos[0].y));
    expect(naFachada(S)).toHaveLength(1);
    const at = naFachada(S)[0].pontos[0];
    expect(at.y < 1500 || at.y > 2500).toBe(true);
    expect(Math.abs(at.y - 2000)).toBeLessThanOrEqual(1200);
    expect(paredeSobOPonto(r, T, at, 95)).not.toBeNull();
    // e desce: o térreo ganha o pilar no mesmo ponto
    expect(naFachada(T).map((x) => x.pontos[0])).toEqual([at]);
    // O alcance é hipótese: sem deslize, o pilar fica no T, em cima da porta (na ponta da viga de transição), como era.
    const semDeslize = pilaresDoSobrado(comPorta, T, S, { ...HIPOTESES_PILARES_PADRAO, deslizeSobreAberturaMm: 0 }, t);
    const r0 = applyBatch(comPorta, semDeslize.comandos).model;
    expect((r0.structures ?? []).some((x) => x.levelId === S && x.kind === 'PILAR' && x.pontos[0].x === 0 && x.pontos[0].y === 2000)).toBe(true);
  });

  it('paredeSobOPonto: no corpo da parede sim; no vão da porta, não', () => {
    const comPorta = applyBatch(model, [{ type: 'AddOpening', wallId: model.walls.find((w) => w.levelId === T && w.a.x === 4000)!.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100 } as Command]).model;
    expect(paredeSobOPonto(comPorta, T, point(4000, 1000), 100)).not.toBeNull();
    expect(paredeSobOPonto(comPorta, T, point(4000, 2950), 100)).toBeNull();
    expect(paredeSobOPonto(comPorta, T, point(2000, 2000), 100)).toBeNull();
  });
});

describe('F12c — prumadas entre os pavimentos (modelo sintético 8 × 6 m)', () => {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 },
  ]).model;
  const [T, S] = base.levels.map((l) => l.id);
  const parede = (levelId: string, a: Point, b: Point, e: number) => ({ levelId, a, b, thicknessMm: e, heightMm: 2800 });
  const ret = (L: string) => [parede(L, point(0, 0), point(8000, 0), 200), parede(L, point(8000, 0), point(8000, 6000), 200), parede(L, point(8000, 6000), point(0, 6000), 200), parede(L, point(0, 6000), point(0, 0), 200)];
  // Térreo: interna em x = 4 m inteira. Superior: interna em x = 4 m só até y = 3 m, e outra em y = 3 m.
  const model = applyBatch(base, [
    { type: 'AddWalls', walls: [...ret(T), parede(T, point(4000, 0), point(4000, 6000), 150), ...ret(S), parede(S, point(4000, 0), point(4000, 3000), 150), parede(S, point(0, 3000), point(8000, 3000), 150)] } as Command,
    { type: 'PlaceSpaceLabel', levelId: S, at: point(2000, 4500), name: 'Dormitório 1' } as Command,
  ]).model;
  const paredesDe = (L: string) => model.walls.filter((w) => w.levelId === L);

  it('paredesEmComum: só os trechos com parede nos dois pavimentos', () => {
    const comum = paredesEmComum(paredesDe(T), [paredesDe(S)]);
    // a interna do térreo (x = 4 m) só tem parede em cima até y = 3 m
    const interna = comum.filter((w) => w.a.x === 4000 && w.b.x === 4000);
    expect(interna).toHaveLength(1);
    expect(Math.max(interna[0].a.y, interna[0].b.y)).toBeLessThanOrEqual(3100);
    // as quatro externas inteiras
    expect(comum.filter((w) => !(w.a.x === 4000 && w.b.x === 4000)).length).toBe(4);
  });

  it('prumadasPeloMeioDoComodo: a que vem de baixo pelo meio do cômodo de cima é dita; na parede, não', () => {
    const m2 = applyBatch(model, [
      { type: 'AddTrecho', levelId: S, disciplina: 'ESGOTO', a: point(2000, 4500), b: point(2000, 4500), cotaAMm: 0, cotaBMm: 3200, bitolaMm: 50, rotulo: 'Ventilação' } as Command,
      { type: 'AddTrecho', levelId: S, disciplina: 'AGUA_FRIA', a: point(4000, 1000), b: point(4000, 1000), cotaAMm: 2800, cotaBMm: 0, bitolaMm: 25 } as Command,
    ]).model;
    const soltas = prumadasPeloMeioDoComodo(m2);
    expect(soltas).toHaveLength(1);
    expect(soltas[0]).toMatchObject({ disciplina: 'ESGOTO', rotulo: 'Ventilação', nivel: 'Superior' });
  });
});

describe('F14c — a laje rebaixada e o shaft de cada banheiro de cima', () => {
  const ban = [point(0, 0), point(3000, 0), point(3000, 2000), point(0, 2000)];
  const caixa = (lo: [number, number], hi: [number, number]) => [point(lo[0], lo[1]), point(hi[0], lo[1]), point(hi[0], hi[1]), point(lo[0], hi[1])];
  const extremos = (r: Point[] | null) => (r ? [Math.min(...r.map((p) => p.x)), Math.min(...r.map((p) => p.y)), Math.max(...r.map((p) => p.x)), Math.max(...r.map((p) => p.y))] : null);

  it('zonaMolhadaDoBanheiro: o retângulo das peças com a margem, recortado pelo banheiro', () => {
    expect(extremos(zonaMolhadaDoBanheiro(ban, [point(500, 500), point(1000, 500)], 300))).toEqual([200, 200, 1300, 800]);
    // A margem não passa do banheiro.
    expect(extremos(zonaMolhadaDoBanheiro(ban, [point(100, 100)], 600))).toEqual([0, 0, 700, 700]);
  });

  it('com o shaft para onde o esgoto corre: a área vai ATÉ a face dele, do lado das peças, e para ali', () => {
    // O shaft depois das peças (x de 2,4 a 2,8 m): a área estica até x = 2,4 m e cobre a face inteira (y de 0 a 0,4).
    expect(extremos(zonaMolhadaDoBanheiro(ban, [point(500, 500), point(1000, 500)], 300, [caixa([2400, 0], [2800, 400])]))).toEqual([200, 0, 2400, 800]);
    // O shaft colado nas peças (a margem o cobriria): a área para na face (x = 1,2 m), sem cobri-lo.
    expect(extremos(zonaMolhadaDoBanheiro(ban, [point(500, 500), point(1000, 500)], 300, [caixa([1200, 0], [1600, 400])]))).toEqual([200, 0, 1200, 800]);
    // Peças dos dois lados do shaft: ele entra inteiro.
    expect(extremos(zonaMolhadaDoBanheiro(ban, [point(500, 500), point(2500, 500)], 100, [caixa([1200, 300], [1600, 700])]))).toEqual([400, 300, 2600, 700]);
  });

  it('zonasMolhadasDoBanheiro: peças dos dois lados do shaft viram DUAS áreas, cada uma até a face dela — a frente do shaft fica livre', () => {
    const zonas = zonasMolhadasDoBanheiro(ban, [point(500, 500), point(2500, 500)], 100, caixa([1200, 0], [1600, 400]));
    expect(zonas.map(extremos)).toEqual([
      [400, 0, 1200, 600],
      [1600, 0, 2600, 600],
    ]);
    // Um lado só: uma área (a de sempre).
    expect(zonasMolhadasDoBanheiro(ban, [point(500, 500), point(1000, 500)], 300, caixa([2400, 0], [2800, 400])).map(extremos)).toEqual([[200, 0, 2400, 800]]);
  });

  it('zonasMolhadasDoBanheiro: peças em "L" em volta do shaft (uma ao lado, outra à frente) — uma área por face, o shaft fora das duas', () => {
    // Shaft no meio da parede de baixo (x 1,2–1,6 m, y 0–0,4 m); o vaso ao lado dele (x 2 m), o ralo à frente (y 0,8 m).
    const sh = caixa([1200, 0], [1600, 400]);
    const zonas = zonasMolhadasDoBanheiro(ban, [point(2000, 200), point(1400, 800)], 100, sh);
    expect(zonas).toHaveLength(2);
    // Nenhuma área cobre o centro do shaft.
    for (const z of zonas) {
      const [x0, y0, x1, y1] = extremos(z)!;
      expect(1400 > x0 && 1400 < x1 && 200 > y0 && 200 < y1).toBe(false);
    }
  });

  it('F27 — banheiro em L (a escada entra nele): a área cobre o braço LARGO até a face do shaft, não só o estreito', () => {
    // O banheiro 1,6 × 6,45 m com a escada no canto de cima à direita (x 0,75–1,6, y 0–2,6): um L. O shaft logo abaixo
    // da escada (x 0,95–1,35, y 2,675–3,075); o vaso e o lavatório no braço estreito, a caixa sifonada no largo.
    const emL = [point(0, 0), point(750, 0), point(750, 2600), point(1600, 2600), point(1600, 6450), point(0, 6450)];
    const sh = caixa([950, 2675], [1350, 3075]);
    const zonas = zonasMolhadasDoBanheiro(emL, [point(400, 3820), point(300, 4270), point(1350, 5620)], 600, sh);
    const cobre = (x: number, y: number) => zonas.some((z) => { const [x0, y0, x1, y1] = extremos(z)!; return x > x0 && x < x1 && y > y0 && y < y1; });
    // O braço largo (x > 0,75 m) entra — antes o recorte pelos lados parava em 0,75 m.
    expect(cobre(1350, 5620)).toBe(true);
    expect(cobre(1150, 3200)).toBe(true); // logo abaixo da face do shaft, do lado das peças
    // E nada sai do banheiro nem entra na escada.
    expect(cobre(1150, 1300)).toBe(false);
    for (const z of zonas) {
      const [x0, y0, x1, y1] = extremos(z)!;
      expect(x0 >= 0 && x1 <= 1600 && y0 >= 0 && y1 <= 6450).toBe(true);
    }
  });

  describe('shaftDoGrupo (modelo sintético 8 × 6 m: o banheiro em cima, de x = 4 a 8 m e y = 0 a 3 m)', () => {
    const base = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
      { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 },
    ]).model;
    const [T, S] = base.levels.map((l) => l.id);
    const parede = (levelId: string, a: Point, b: Point, e: number) => ({ levelId, a, b, thicknessMm: e, heightMm: 2800 });
    const ret = (L: string) => [parede(L, point(0, 0), point(8000, 0), 200), parede(L, point(8000, 0), point(8000, 6000), 200), parede(L, point(8000, 6000), point(0, 6000), 200), parede(L, point(0, 6000), point(0, 0), 200)];
    const model = applyBatch(base, [
      { type: 'AddWalls', walls: [...ret(T), parede(T, point(4000, 0), point(4000, 6000), 150), ...ret(S), parede(S, point(4000, 0), point(4000, 3000), 150), parede(S, point(0, 3000), point(8000, 3000), 150)] } as Command,
    ]).model;
    const banheiro = [point(4000, 0), point(8000, 0), point(8000, 3000), point(4000, 3000)];
    const alvo = { x: 5000, y: 1000 };

    it('o shaft de OUTRO cômodo (do outro lado da parede, a 1,5 m) não serve: nasce um dentro do banheiro', () => {
      const comVizinho = applyBatch(model, [{ type: 'AddNucleo', levelId: T, ateLevelId: S, tipo: 'SHAFT', ring: caixa([3400, 200], [3800, 600]), rotulo: 'Shaft' } as Command]).model;
      const sh = shaftDoGrupo(comVizinho, T, S, banheiro, alvo, null, 400, 2000)!;
      expect(sh.novo).toBe(true);
      for (const q of sh.ring) expect(q.x).toBeGreaterThanOrEqual(4000);
    });

    it('o shaft que já está dentro do banheiro, perto das peças, serve (não nasce outro)', () => {
      const ring = caixa([4100, 100], [4500, 500]);
      const comProprio = applyBatch(model, [{ type: 'AddNucleo', levelId: T, ateLevelId: S, tipo: 'SHAFT', ring, rotulo: 'Shaft' } as Command]).model;
      const sh = shaftDoGrupo(comProprio, T, S, banheiro, alvo, null, 400, 2000)!;
      expect(sh.novo).toBe(false);
      expect(sh.ring).toEqual(ring);
    });

    it('o shaft novo não cai em cima de uma peça já posta (o aquecedor do térreo)', () => {
      const livre = shaftDoGrupo(model, T, S, banheiro, alvo, null, 400, 2000)!;
      const c = { x: livre.ring.reduce((a, p) => a + p.x, 0) / 4, y: livre.ring.reduce((a, p) => a + p.y, 0) / 4 };
      const comAquecedor = applyBatch(model, [{ type: 'AddTerminal', levelId: T, disciplina: 'AGUA_QUENTE', tipo: 'Aquecedor', at: point(Math.round(c.x), Math.round(c.y)), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' } as Command]).model;
      const sh = shaftDoGrupo(comAquecedor, T, S, banheiro, alvo, null, 400, 2000);
      expect(sh?.ring).not.toEqual(livre.ring);
      if (sh) {
        const xs = sh.ring.map((p) => p.x);
        const ys = sh.ring.map((p) => p.y);
        const dentro = c.x > Math.min(...xs) && c.x < Math.max(...xs) && c.y > Math.min(...ys) && c.y < Math.max(...ys);
        expect(dentro).toBe(false);
      }
    });
  });
});

describe('F27 — alinharJanelasDoSuperior (as janelas de cima nas de baixo, na mesma fachada)', () => {
  /** Térreo e superior com a mesma fachada de 10 m em y = 0; janelas de baixo em 1,0–2,0 m e 5,0–6,0 m (centros 1,5 e 5,5). */
  const sobradoSintetico = (janelasDeCima: [number, number][], encontroEm: number | null = null) => {
    let m = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
      { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 },
    ] as Command[]).model;
    const [T, S] = m.levels.map((l) => l.id);
    m = applyBatch(m, [
      { type: 'AddWall', levelId: T, a: point(0, 0), b: point(10000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: S, a: point(0, 0), b: point(10000, 0), thicknessMm: 150, heightMm: 2800 },
      ...(encontroEm != null ? [{ type: 'AddWall', levelId: S, a: point(encontroEm, 0), b: point(encontroEm, 4000), thicknessMm: 150, heightMm: 2800 } as Command] : []),
    ] as Command[]).model;
    const wT = m.walls.find((w) => w.levelId === T)!;
    const wS = m.walls.find((w) => w.levelId === S && w.a.y === 0 && w.b.y === 0)!;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId: wT.id, kind: 'window', offsetMm: 1000, widthMm: 1000, heightMm: 1200, sillMm: 1000 },
      { type: 'AddOpening', wallId: wT.id, kind: 'window', offsetMm: 5000, widthMm: 1000, heightMm: 1200, sillMm: 1000 },
      ...janelasDeCima.map(([o, w]) => ({ type: 'AddOpening', wallId: wS.id, kind: 'window', offsetMm: o, widthMm: w, heightMm: 1200, sillMm: 1000 })),
    ] as Command[]).model;
    return { m, T, S, wS };
  };

  it('cada janela de cima vai ao centro da de baixo mais perto', () => {
    // Em cima: 1,7–3,2 (centro 2,45 → 1,5: offset 0,75) e 4,0–5,5 (centro 4,75 → 5,5: offset 4,75).
    const { m, T, S, wS } = sobradoSintetico([[1700, 1500], [4000, 1500]]);
    const cmds = alinharJanelasDoSuperior(m, T, S);
    const depois = applyBatch(m, cmds).model.openings.filter((o) => o.wallId === wS.id).map((o) => o.offsetMm).sort((a, b) => a - b);
    expect(depois).toEqual([750, 4750]);
  });

  it('não atravessa o encontro com uma parede interna (a janela fica no seu cômodo)', () => {
    // Um encontro em x = 6 m: a 2ª janela (4,0–5,5) iria a 4,75–6,25 e passaria por ele — fica onde estava.
    const { m, T, S, wS } = sobradoSintetico([[1700, 1500], [4000, 1500]], 6000);
    const depois = applyBatch(m, alinharJanelasDoSuperior(m, T, S)).model.openings.filter((o) => o.wallId === wS.id).map((o) => o.offsetMm).sort((a, b) => a - b);
    expect(depois).toEqual([750, 4000]);
  });

  it('longe demais (além de 1,5 m) ou sem janela embaixo: nada se move', () => {
    const { m, T, S } = sobradoSintetico([[8000, 1200]]);
    expect(alinharJanelasDoSuperior(m, T, S)).toEqual([]);
  });
});
