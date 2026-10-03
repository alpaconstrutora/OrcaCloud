/**
 * Estudo de Massa — o pavimento tipo do bloco em L, U, T ou H (pendências de 03/10/2026, item 6): asas e nós pela
 * grade dos vértices; um corredor por asa, ligados nos nós; núcleo no nó, sem fachada; faixas encadeadas cortadas em
 * unidades (a de canto pode sair em L); paredes pelas bordas das regiões. E a planta interna das unidades (M6b) no
 * quadro de cada uma, com o grupo das iguais (inclusive girado 90° entre asas).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, ordinalDoTipo } from '../utils/blueprintPavimentoTipoDaMassa';
import { contornoDasPartes, dividirPavimentoDoBloco, montarPavimentoTipoDoBloco, quadroOrtogonal } from '../utils/blueprintPavimentoOrtogonal';
import { plantasDasUnidades } from '../utils/blueprintPlantaDaUnidade';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');
const FORMAS: Record<string, Point[]> = {
  L: [point(5000, 5000), point(45000, 5000), point(45000, 21000), point(21000, 21000), point(21000, 50000), point(5000, 50000)],
  U: [point(5000, 5000), point(55000, 5000), point(55000, 45000), point(39000, 45000), point(39000, 21000), point(21000, 21000), point(21000, 45000), point(5000, 45000)],
  T: [point(5000, 5000), point(55000, 5000), point(55000, 21000), point(38000, 21000), point(38000, 55000), point(22000, 55000), point(22000, 21000), point(5000, 21000)],
  H: [point(5000, 5000), point(21000, 5000), point(21000, 20000), point(39000, 20000), point(39000, 5000), point(55000, 5000), point(55000, 55000), point(39000, 55000), point(39000, 36000), point(21000, 36000), point(21000, 55000), point(5000, 55000)],
};

function estudo(pts: Point[], girar = 0) {
  const ang = (girar * Math.PI) / 180;
  const g = (p: Point) => point(Math.round(p.x * Math.cos(ang) - p.y * Math.sin(ang)), Math.round(p.x * Math.sin(ang) + p.y * Math.cos(ang)));
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: g(point(ax, ay)), b: g(point(bx, by)), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    d(0, 0, 60000, 0, 'FRENTE'), d(60000, 0, 60000, 60000, 'LATERAL_DIREITA'), d(60000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: pts.map(g), pavimentos: 8 },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const pb = distribuirProduto(m, massa, MEDIO).blocos[0];
  const b = m.blocos![0];
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord)!;
  const r = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(m) });
  return { m, b, r, piso };
}

describe('o contorno ortogonal', () => {
  it('quadro no lado mais longo, contorno encaixado nos eixos; girado dá o mesmo; trapézio não é ortogonal', () => {
    const q0 = quadroOrtogonal(FORMAS.L)!;
    const ang = Math.PI / 6;
    const q30 = quadroOrtogonal(FORMAS.L.map((p) => point(Math.round(p.x * Math.cos(ang) - p.y * Math.sin(ang)), Math.round(p.x * Math.sin(ang) + p.y * Math.cos(ang)))))!;
    expect([q0.q.W, q0.q.D]).toEqual([q30.q.W, q30.q.D]);
    expect(q0.poligono).toHaveLength(6);
    expect(q30.poligono).toHaveLength(6);
    expect(quadroOrtogonal([point(0, 0), point(30000, 0), point(25000, 15000), point(0, 15000)])).toBeNull();
  });

  it('o contorno da união de retângulos: L de 6 vértices', () => {
    expect(contornoDasPartes([{ a0: 0, b0: 0, a1: 10, b1: 4 }, { a0: 0, b0: 4, a1: 4, b1: 10 }])).toHaveLength(6);
  });
});

describe('a divisão em L, U, T e H', () => {
  it.each(Object.keys(FORMAS))('%s: asas ligadas nos nós, núcleo sem fachada, todas as unidades da M2, numeradas na ordem do produto', (forma) => {
    const { r, piso } = estudo(FORMAS[forma]);
    if (!r.ok) throw new Error(r.motivo);
    const d = r.divisao;
    expect(d.esquema).toBe('ASAS');
    const total = Object.values(piso.porTipologia).reduce((s, n) => s + n, 0);
    expect(d.unidades).toHaveLength(total);
    expect(d.unidades.map((u) => u.numero)).toEqual(d.unidades.map((_, i) => `1${String(i + 1).padStart(2, '0')}`));
    expect(d.avisos.join(' ')).not.toMatch(/não coube/);
    const o = d.ortogonal!;
    // Os corredores formam UMA rede (cada um encosta ou cruza outro).
    const toca = (x: typeof o.corredores[number], y: typeof o.corredores[number]) => x.a0 <= y.a1 && y.a0 <= x.a1 && x.b0 <= y.b1 && y.b0 <= x.b1;
    const ligados = new Set([0]);
    for (let k = 0; k < o.corredores.length; k++) for (const i of [...ligados]) for (let j = 0; j < o.corredores.length; j++) if (toca(o.corredores[i], o.corredores[j])) ligados.add(j);
    expect(ligados.size).toBe(o.corredores.length);
    expect(o.nucleo).not.toBeNull();
    expect(o.corredores.some((c) => toca(c, o.nucleo!))).toBe(true);
    // Unidade de canto (duas fachadas) existe; área perto do alvo na média.
    expect(d.unidades.some((u) => u.canto)).toBe(true);
    const razao = d.unidades.reduce((s, u) => s + u.areaM2, 0) / d.unidades.reduce((s, u) => s + u.alvoM2, 0);
    expect(razao).toBeGreaterThan(0.85);
    expect(razao).toBeLessThan(1.3);
  });

  it('forma em degrau vira um nó grande com duas asas (cabe); contorno fora de dois eixos (trapézio) é recusado, dito', () => {
    const degrau = [point(5000, 5000), point(35000, 5000), point(35000, 21000), point(25000, 21000), point(25000, 37000), point(15000, 37000), point(15000, 53000), point(5000, 53000)];
    const { r, piso } = estudo(degrau);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.divisao.unidades).toHaveLength(Object.values(piso.porTipologia).reduce((s, n) => s + n, 0));
    const { r: rt } = estudo([point(5000, 5000), point(45000, 5000), point(35000, 25000), point(15000, 25000)]);
    expect(rt.ok).toBe(false);
    if (!rt.ok) expect(rt.motivo).toMatch(/dois eixos perpendiculares/);
  });
});

describe('a montagem e a planta das unidades', () => {
  function montado(forma: string, girar = 0): { mm: BlueprintModel; tipo: string; b: ReturnType<typeof estudo>['b']; n: number } {
    const { m, b, r } = estudo(FORMAS[forma], girar);
    if (!r.ok) throw new Error(r.motivo);
    const mont = montarPavimentoTipoDoBloco(m, b, r.divisao);
    return { mm: mont.model, tipo: mont.tipoLevelId, b, n: r.divisao.unidades.length };
  }

  it.each([['L', 0], ['H', 0], ['L', 30], ['T', 30]] as const)('%s girado %i°: cada unidade fecha o seu ambiente, com porta; núcleo e circulação nomeados; cópias vivas', (forma, girar) => {
    const { mm, tipo, n } = montado(forma, girar);
    const unidades = mm.unidades ?? [];
    expect(unidades).toHaveLength(n);
    for (const u of unidades) {
      const ls = mm.labels.filter((l) => l.levelId === tipo && u.etiquetaUids.includes(l.uid));
      expect(ls).toHaveLength(1);
      expect(mm.spaces.some((s) => s.levelId === tipo && s.labelUid === ls[0].uid)).toBe(true);
    }
    const nomes = mm.spaces.filter((s) => s.levelId === tipo).map((s) => s.name);
    expect(nomes).toContain('Circulação');
    expect(nomes).toContain('Núcleo (escada, elevadores e hall)');
    const paredesTipo = mm.walls.filter((w) => w.levelId === tipo);
    const portas = mm.openings.filter((o) => o.kind === 'door' && paredesTipo.some((w) => w.id === o.wallId));
    expect(portas.length).toBeGreaterThanOrEqual(n + 1);
    const copias = mm.levels.filter((l) => l.tipoDeId === tipo);
    expect(copias).toHaveLength(6);
    for (const c of copias) expect(mm.walls.filter((w) => w.levelId === c.id)).toHaveLength(paredesTipo.length);
  });

  it('L: a planta de cada unidade no quadro dela (asa vertical inclusive), janelas só na fachada, grupos de iguais (repetida e espelhada)', () => {
    const { mm, tipo, b, n } = montado('L');
    const pl = plantasDasUnidades(mm, b, MEDIO);
    expect(pl.unidades.filter((u) => u.ambientes.length > 0)).toHaveLength(n);
    const m3 = pl.model;
    const naFachada = (p: Point) =>
      b.pontos.some((a, i) => {
        const c = b.pontos[(i + 1) % b.pontos.length];
        const l = Math.hypot(c.x - a.x, c.y - a.y);
        const t = ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / l;
        return Math.abs((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) / l <= 5 && t >= -5 && t <= l + 5;
      });
    const paredesT = m3.walls.filter((w) => w.levelId === tipo);
    const janelas = m3.openings.filter((o) => o.kind === 'window' && paredesT.some((w) => w.id === o.wallId));
    expect(janelas.length).toBeGreaterThan(10);
    for (const j of janelas) {
      const w = paredesT.find((x) => x.id === j.wallId)!;
      expect(naFachada(w.a) && naFachada(w.b)).toBe(true);
    }
    for (const u of m3.unidades ?? []) for (const l of m3.labels.filter((x) => x.levelId === tipo && u.etiquetaUids.includes(x.uid))) expect(m3.spaces.some((s) => s.levelId === tipo && s.labelUid === l.uid)).toBe(true);
    expect(pl.grupos.length).toBeGreaterThanOrEqual(3);
    expect(pl.grupos.flatMap((g) => g.iguais.map((i) => i.repeticao))).toEqual(expect.arrayContaining(['repetida', 'espelhada']));
    // A lista de uma vez (o que o editor faz) dá o mesmo modelo.
    const deUmaVez = applyBatch(mm, pl.comandos).model;
    expect([deUmaVez.walls.length, deUmaVez.openings.length, deUmaVez.labels.length]).toEqual([m3.walls.length, m3.openings.length, m3.labels.length]);
    // Poucos comandos (lote atômico): a planta inteira não passa de 40.
    expect(pl.comandos.length).toBeLessThan(40);
  });

  it('H: entre asas perpendiculares a instância é um GIRO de 90°; a unidade em L fica aberta, dito', () => {
    const { mm, b } = montado('H');
    const pl = plantasDasUnidades(mm, b, MEDIO);
    expect(pl.grupos.flatMap((g) => g.iguais.map((i) => i.repeticao))).toContain('girada 90°');
    const abertas = pl.unidades.filter((u) => u.ambientes.length === 0);
    for (const u of abertas) expect(u.origem).toMatch(/em L/);
    expect(pl.avisos.join(' ')).not.toMatch(/não fechou/);
  });
}, 300_000);
