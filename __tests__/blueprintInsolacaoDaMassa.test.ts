/**
 * ESTUDO DE MASSA, fase M5b (02/10/2026): a insolação da massa (§11, §12).
 * Casos de resultado conhecido — no hemisfério sul, em 21/06, o sol fica ao
 * norte o dia inteiro: a fachada sul não vê sol, a norte vê; a sombra cai
 * para o sul, então quem perde sol é o vizinho do lado sul.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { insolacaoDaMassa, prismasDaMassa, raioBloqueado, type OpcoesDaInsolacaoDaMassa } from '../utils/blueprintInsolacaoDaMassa';
import { prismasDoEntorno } from '../utils/blueprintInsolacao';

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';
const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

/** Lote 40 × 60 m: frente (rua) ao SUL (y = 0), fundos ao norte (y = 60 m); norte = +Y. */
function lote(blocos: Omit<Extract<Command, { type: 'AddBloco' }>, 'type' | 'levelId'>[]): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: Papel): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return applyBatch(m, blocos.map((b) => ({ type: 'AddBloco', levelId: t, ...b }) as Command)).model;
}

const OPCOES: OpcoesDaInsolacaoDaMassa = { latitudeGraus: -23.5, rotacaoNorteDeg: null, entorno: [], minimaH: 2, amostragem: 'COMPLETA' };

describe('insolação da massa', () => {
  it('raio × prisma é exato: bate dentro da faixa de altura, passa por cima e por baixo, e não olha para trás', () => {
    const pr = [{ id: 'p', anel: ret(10000, -5000, 20000, 5000), baseMm: 0, topoMm: 30000 }];
    const s45 = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 };
    expect(raioBloqueado({ x: 0, y: 0, zMm: 0 }, s45, pr)).toBe(true);
    // Topo a 30 m: a 45° o raio passa de 30 m a 30 m de distância — o prisma começa a 10 m: bate. A 80°, passa por cima.
    const a80 = (80 * Math.PI) / 180;
    expect(raioBloqueado({ x: 0, y: 0, zMm: 0 }, { x: Math.cos(a80), y: 0, z: Math.sin(a80) }, pr)).toBe(false);
    // Prisma suspenso (embasamento vazado abaixo de 40 m): o raio a 45° está a 10–20 m ali — passa por baixo.
    expect(raioBloqueado({ x: 0, y: 0, zMm: 0 }, s45, [{ ...pr[0], baseMm: 40000, topoMm: 60000 }])).toBe(false);
    // Sol do outro lado: nada.
    expect(raioBloqueado({ x: 0, y: 0, zMm: 0 }, { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }, pr)).toBe(false);
  });

  it('21/06 a 23,5° S: a fachada norte tem sol, a sul não (crítica); orientação e profundidade do bloco', () => {
    const m = lote([{ nome: 'Lâmina', pontos: ret(5000, 20000, 35000, 32000), pavimentos: 8 }]);
    const r = insolacaoDaMassa(m, OPCOES);
    const b = r.blocos[0];
    const norte = b.fachadas.find((f) => f.orientacao === 'N')!;
    const sul = b.fachadas.find((f) => f.orientacao === 'S')!;
    expect(norte.horasInverno).toBeGreaterThan(8);
    expect(sul.horasInverno).toBe(0);
    expect(sul.critica).toBe(true);
    expect(norte.critica).toBe(false);
    // No verão o sol nasce ao sul de leste: a fachada sul ganha horas.
    expect(sul.horasVerao!).toBeGreaterThan(0);
    // Lâmina leste–oeste: as fachadas maiores são a norte e a sul (empate) — vale a de mais sol.
    expect(b.orientacaoPrincipal).toBe('N');
    expect(b.profundidadeM).toBe(12);
    expect(b.fachadasCriticas).toBeGreaterThanOrEqual(1);
    expect(r.fachadaCriticaPct!).toBeGreaterThan(0);
    // Girar o norte do desenho 180°: o que era norte vira sul.
    const girado = insolacaoDaMassa(m, { ...OPCOES, rotacaoNorteDeg: 180 });
    expect(girado.blocos[0].fachadas.find((f) => f.lado === norte.lado)!.horasInverno).toBe(0);
  });

  it('a sombra cai para o sul: o vizinho da frente (sul) perde sol, o dos fundos (norte) não', () => {
    const m = lote([{ nome: 'Torre', pontos: ret(12000, 8000, 28000, 24000), pavimentos: 20 }]);
    const r = insolacaoDaMassa(m, OPCOES);
    const frente = r.vizinhos.find((v) => v.lado === 'FRENTE')!;
    const fundos = r.vizinhos.find((v) => v.lado === 'FUNDOS')!;
    expect(frente.perdidasH).toBeGreaterThan(1);
    expect(fundos.perdidasH).toBe(0);
    expect(r.maiorPerdaDoVizinhoH).toBe(Math.max(...r.vizinhos.map((v) => v.perdidasH)));
    // Torre mais baixa: perde menos.
    const baixa = insolacaoDaMassa(lote([{ nome: 'Torre', pontos: ret(12000, 8000, 28000, 24000), pavimentos: 3 }]), OPCOES);
    expect(baixa.vizinhos.find((v) => v.lado === 'FRENTE')!.perdidasH).toBeLessThan(frente.perdidasH);
    // O lote livre: com a torre no meio do lote (30 m de pátio ao sul dela), a sombra
    // da alta (20 pav) chega muito mais longe que a da baixa (3 pav).
    // Cada ponto ao sul só perde o sol enquanto ele passa ATRÁS da torre (2–3 h): com o mínimo de
    // 2 h quase todo o pátio passa; a média de horas e o mínimo de 6 h mostram a diferença.
    const meio = (pav: number, minimaH = 2) => insolacaoDaMassa(lote([{ nome: 'Torre', pontos: ret(12000, 30000, 28000, 46000), pavimentos: pav }]), { ...OPCOES, minimaH });
    expect(meio(20).loteHorasInverno!).toBeLessThan(meio(3).loteHorasInverno! - 0.3);
    expect(meio(20, 6).loteComSolPct!).toBeLessThan(meio(3, 6).loteComSolPct! - 5);
  });

  it('outro bloco e o entorno fazem sombra; a amostragem rápida não mede o lote nem o verão', () => {
    const so = lote([{ nome: 'Baixo', pontos: ret(5000, 10000, 35000, 22000), pavimentos: 3 }]);
    const sozinho = insolacaoDaMassa(so, OPCOES).blocos[0].fachadas.find((f) => f.orientacao === 'N')!.horasInverno;
    // Uma torre alta logo ao norte do bloco baixo.
    const comTorre = lote([
      { nome: 'Baixo', pontos: ret(5000, 10000, 35000, 22000), pavimentos: 3 },
      { nome: 'Torre', pontos: ret(5000, 28000, 35000, 40000), pavimentos: 20 },
    ]);
    const sombreado = insolacaoDaMassa(comTorre, OPCOES).blocos.find((b) => b.nome === 'Baixo')!.fachadas.find((f) => f.orientacao === 'N')!.horasInverno;
    expect(sombreado).toBeLessThan(sozinho);
    // Um vizinho de 40 m colado nos fundos (norte) faz o mesmo papel.
    const entorno = prismasDoEntorno([{ id: 'v', lado: 'FUNDOS', alturaM: 40, afastamentoM: 0, profundidadeM: 15 }], so.boundaries, null);
    const comVizinho = insolacaoDaMassa(so, { ...OPCOES, entorno }).blocos[0].fachadas.find((f) => f.orientacao === 'N')!.horasInverno;
    expect(comVizinho).toBeLessThan(sozinho);
    const rapida = insolacaoDaMassa(so, { ...OPCOES, amostragem: 'RAPIDA' });
    expect(rapida.loteComSolPct).toBeNull();
    expect(rapida.blocos[0].fachadas[0].horasVerao).toBeNull();
    expect(rapida.horasInverno).not.toBeNull();
  });

  it('garagem e subsolo não têm fachada útil; o prisma do bloco sobre o embasamento começa no alto', () => {
    const m = lote([
      { nome: 'Embasamento', pontos: ret(5000, 10000, 35000, 40000), pavimentos: 2, uso: 'GARAGEM' },
      { nome: 'Torre', pontos: ret(12000, 18000, 28000, 32000), pavimentos: 10, cotaBaseMm: 6000 },
      { nome: 'Subsolo', pontos: ret(1000, 1000, 39000, 59000), pavimentos: 1, cotaBaseMm: -3000, uso: 'GARAGEM' },
    ]);
    const r = insolacaoDaMassa(m, OPCOES);
    expect(r.blocos.map((b) => b.nome)).toEqual(['Torre']);
    const pr = prismasDaMassa(m);
    expect(pr.find((p) => p.id === m.blocos!.find((b) => b.nome === 'Torre')!.id)).toMatchObject({ baseMm: 6000, topoMm: 36000 });
    expect(pr.some((p) => p.id === m.blocos!.find((b) => b.nome === 'Subsolo')!.id)).toBe(false);
  });
});
