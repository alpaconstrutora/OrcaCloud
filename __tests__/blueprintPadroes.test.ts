/**
 * F6 do plano `2026-10-11-planta-recursos-video-synaps.md` — HACHURA DE MATERIAL NA CAMADA (kernel 0.96.0).
 *
 * A geometria pura (`linhasDoPadrao`) e o dado no kernel (`CamadaParede.hachura`):
 * validação, ida e volta no canônico, e a cópia do histórico.
 */
import { describe, expect, it } from 'vitest';
import {
  KernelError,
  applyCommand,
  canonicalPayload,
  clonarCamadas,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  PADROES_DE_MATERIAL,
  pointInPolygon,
  type CamadaParede,
  type HachuraDaCamada,
  type Point,
} from '../utils/blueprintKernel';
import { LIMITE_DE_SEGMENTOS, linhasDoPadrao } from '../utils/blueprintPadroes';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
const h = (padrao: HachuraDaCamada['padrao'], escalaPct = 100, rotacaoGraus = 0): HachuraDaCamada => ({ padrao, escalaPct, rotacaoGraus });
const meio = (s: { a: Point; b: Point }) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }) as Point;

describe('padrões de hachura — a geometria (F6)', () => {
  it('todo padrão do catálogo gera linhas, e todas ficam DENTRO do contorno', () => {
    const anel = ret(0, 0, 3000, 2000);
    for (const p of PADROES_DE_MATERIAL) {
      const linhas = linhasDoPadrao(h(p), anel);
      expect(linhas.length, p).toBeGreaterThan(0);
      for (const s of linhas) {
        // Folga de 1 mm para o ponto exatamente sobre a borda.
        expect(s.a.x >= -1 && s.a.x <= 3001 && s.a.y >= -1 && s.a.y <= 2001, p).toBe(true);
        expect(pointInPolygon(anel, meio(s)), p).toBe(true);
      }
    }
  });

  it('o furo fica limpo (pilar no meio da sala)', () => {
    const anel = ret(0, 0, 4000, 4000);
    const furo = ret(1500, 1500, 2500, 2500);
    for (const s of linhasDoPadrao(h('AZULEJO'), anel, [furo])) expect(pointInPolygon(furo, meio(s))).toBe(false);
  });

  it('ANCORADO na origem: dois ambientes vizinhos com o mesmo azulejo têm as juntas nas MESMAS posições', () => {
    const xs = (anel: Point[]) =>
      new Set(linhasDoPadrao(h('AZULEJO'), anel).filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6).map((s) => Math.round(s.a.x)));
    const esq = xs(ret(130, 0, 2130, 1000));
    const dir = xs(ret(2130, 0, 4130, 1000));
    for (const x of [...esq, ...dir]) expect(x % 200).toBe(0); // múltiplos do módulo, não do canto
  });

  it('a escala multiplica o módulo: 200 % dá a metade das juntas', () => {
    const anel = ret(0, 0, 4000, 4000);
    const verticais = (pct: number) => linhasDoPadrao(h('AZULEJO', pct), anel).filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6).length;
    expect(verticais(100)).toBe(21); // x = 0, 200, …, 4000
    expect(verticais(200)).toBe(11); // x = 0, 400, …, 4000
  });

  it('a rotação gira o padrão; na parede o ângulo dela entra pela base', () => {
    const anel = ret(0, 0, 3000, 3000);
    // Pelo COMPRIMENTO somado, não pela contagem: a tábua tem poucas fiadas longas e muitos
    // topos curtos — contar segmentos diria que ela é "vertical".
    const comp = (s: { a: Point; b: Point }) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const horizontais = (linhas: { a: Point; b: Point }[]) => linhas.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-6).reduce((t, s) => t + comp(s), 0);
    const verticais = (linhas: { a: Point; b: Point }[]) => linhas.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6).reduce((t, s) => t + comp(s), 0);
    // Tábua sem giro: fiadas HORIZONTAIS longas. A 90°, as fiadas viram verticais.
    const t0 = linhasDoPadrao(h('TABUA'), anel);
    const t90 = linhasDoPadrao(h('TABUA', 100, 90), anel);
    const tBase = linhasDoPadrao(h('TABUA'), anel, [], Math.PI / 2);
    expect(horizontais(t0)).toBeGreaterThan(verticais(t0));
    expect(verticais(t90)).toBeGreaterThan(horizontais(t90));
    expect(tBase.length).toBe(t90.length); // giro da camada e ângulo da parede são a mesma conta
  });

  it('determinístico: o concreto pontilhado sai igual nas duas vezes', () => {
    const anel = ret(0, 0, 2000, 2000);
    expect(linhasDoPadrao(h('CONCRETO'), anel)).toEqual(linhasDoPadrao(h('CONCRETO'), anel));
  });

  it('teto de segmentos: piso enorme a 10 % não passa do limite', () => {
    expect(linhasDoPadrao(h('CRUZADA', 10), ret(0, 0, 100_000, 100_000)).length).toBeLessThanOrEqual(LIMITE_DE_SEGMENTOS + 10);
  });
});

describe('hachura na camada — o kernel 0.96.0 (F6)', () => {
  const camadas = (hachura?: HachuraDaCamada): CamadaParede[] => [
    { espessuraMm: 100, itemCode: '', descricao: 'Tijolo', funcao: 'VEDACAO', ...(hachura ? { hachura } : {}) },
    { espessuraMm: 50, itemCode: '', descricao: 'Isolamento', funcao: 'ISOLAMENTO' },
  ];
  const comParede = (cam: CamadaParede[]) => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const m = applyCommand(base, { type: 'AddWall', levelId: base.levels[0].id, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    return applyCommand(m, { type: 'SetWallLayers', wallId: m.walls[0].id, camadas: cam }).model;
  };

  it('grava a hachura na camada e ela sobrevive à ida e volta do canônico', () => {
    const m = comParede(camadas(h('TIJOLO', 150, 30)));
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.walls[0].camadas?.[0].hachura).toEqual({ padrao: 'TIJOLO', escalaPct: 150, rotacaoGraus: 30 });
    expect(volta.walls[0].camadas?.[1].hachura).toBeUndefined();
  });

  it('camada sem hachura sai no canônico SEM a chave — desenho antigo só muda pela versão', () => {
    expect(canonicalPayload(comParede(camadas()))).not.toContain('hachura');
  });

  it('recusa padrão desconhecido, escala fora da faixa ou fracionada e giro fora de [0, 360)', () => {
    for (const ruim of [
      { padrao: 'XADREZ', escalaPct: 100, rotacaoGraus: 0 },
      h('TIJOLO', 5),
      h('TIJOLO', 2000),
      h('TIJOLO', 150.5),
      h('TIJOLO', 100, 360),
      h('TIJOLO', 100, -10),
    ]) {
      expect(() => comParede(camadas(ruim as HachuraDaCamada))).toThrow(KernelError);
    }
  });

  it('a cópia do histórico não COMPARTILHA a hachura (Ctrl+Z não muda junto)', () => {
    const original = camadas(h('TIJOLO'));
    const copia = clonarCamadas(original)!;
    copia[0].hachura!.escalaPct = 300;
    expect(original[0].hachura!.escalaPct).toBe(100);
  });
});

describe('hachura na camada — o PDF (F6)', () => {
  const COR = '#64748b';
  function planta(comHachura: boolean) {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2800 }) as const;
    for (const c of [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]) m = applyCommand(m, c).model;
    m = applyCommand(m, {
      type: 'SetWallLayers',
      wallId: m.walls[0].id,
      camadas: [
        { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
        { espessuraMm: 150, itemCode: '', descricao: 'Tijolo', funcao: 'VEDACAO', ...(comHachura ? { hachura: h('TIJOLO') } : {}) },
        { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
      ],
    }).model;
    m = applyCommand(m, {
      type: 'NameSpace',
      spaceId: m.spaces[0].id,
      name: 'Sala',
      acabamentos: { piso: [{ espessuraMm: 10, itemCode: '', descricao: 'Porcelanato', funcao: 'ACABAMENTO', ...(comHachura ? { hachura: h('PORCELANATO') } : {}) }] },
    }).model;
    return m;
  }
  const linhasNaCor = (m: ReturnType<typeof planta>) => {
    const d = new DesenhistaDeProva();
    const op = { denominador: 50, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'h', data: new Date('2026-10-11T12:00:00Z') } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, m, op, enquadrar(m, 50, PAPEIS[0], true));
    return d.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor?: string }).cor === COR).length;
  };

  it('parede com camada em tijolo e piso em porcelanato saem hachurados no PDF', () => {
    expect(linhasNaCor(planta(true))).toBeGreaterThan(20);
  });

  it('sem padrão declarado, NENHUM traço de hachura de material — o PDF de antes não muda', () => {
    expect(linhasNaCor(planta(false))).toBe(0);
  });
});
