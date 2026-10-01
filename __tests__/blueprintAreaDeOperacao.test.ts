/**
 * INCÊNDIO E5.2 (01/10/2026): a Área de Operação dos sprinklers — a entidade do
 * kernel (0.83.0), os sprinklers derivados dela, o critério por área (o risco
 * dela vence o do estudo) e a proposta automática na região mais desfavorável.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  pointInPolygon,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../utils/blueprintSprinklersIncendio';
import { areaDoContornoM2, proporAreaDeOperacao, sprinklersDaArea } from '../utils/blueprintAreaDeOperacao';

const LEVE = criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null);
const ret = (x0: number, y0: number, x1: number, y1: number) => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

describe('E5.2 · a entidade no kernel (0.83.0)', () => {
  const base = () => applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;

  it('cria, muda o risco e o nome, e volta ao do estudo com risco null', () => {
    let m = base();
    const l = m.levels[0].id;
    m = applyCommand(m, { type: 'AddAreaDeOperacao', levelId: l, pontos: ret(0, 0, 12000, 12000), risco: 'ORDINARIO_1', nome: '  Depósito  ' } as Command).model;
    const a = m.areasDeOperacao![0];
    expect(a).toMatchObject({ levelId: l, risco: 'ORDINARIO_1', nome: 'Depósito' });
    m = applyCommand(m, { type: 'SetAreaDeOperacaoProps', areaId: a.id, risco: null, nome: '' } as Command).model;
    expect(m.areasDeOperacao![0].risco).toBeUndefined();
    expect(m.areasDeOperacao![0].nome).toBeUndefined();
  });

  it('recusa contorno com menos de 3 vértices e risco desconhecido', () => {
    const m = base();
    const l = m.levels[0].id;
    expect(() => applyCommand(m, { type: 'AddAreaDeOperacao', levelId: l, pontos: [point(0, 0), point(1000, 0)] } as Command)).toThrow(/3 vértices/);
    expect(() => applyCommand(m, { type: 'AddAreaDeOperacao', levelId: l, pontos: ret(0, 0, 1000, 1000), risco: 'ALTO' } as unknown as Command)).toThrow(/Risco desconhecido/);
  });

  it('ida e volta pelo canônico preserva contorno, risco, nome e uid; sem área, a chave nem aparece', () => {
    let m = base();
    expect(canonicalPayload(m)).not.toContain('areasDeOperacao');
    const l = m.levels[0].id;
    m = applyCommand(m, { type: 'AddAreaDeOperacao', levelId: l, pontos: ret(1000, 2000, 13000, 14000), risco: 'EXTRA_2', nome: 'Doca' } as Command).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    const [a] = volta.areasDeOperacao!;
    expect(a.pontos).toEqual(m.areasDeOperacao![0].pontos);
    expect(a).toMatchObject({ risco: 'EXTRA_2', nome: 'Doca', uid: m.areasDeOperacao![0].uid });
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });

  it('some com o pavimento', () => {
    let m = base();
    m = applyCommand(m, { type: 'AddLevel', name: 'S', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const l2 = m.levels[1].id;
    m = applyCommand(m, { type: 'AddAreaDeOperacao', levelId: l2, pontos: ret(0, 0, 5000, 5000) } as Command).model;
    m = applyCommand(m, { type: 'RemoveLevel', levelId: l2 } as Command).model;
    expect(m.areasDeOperacao).toEqual([]);
  });
});

/** Bomba → coluna → um ramal de 30 m com 10 sprinklers K 80, um a cada 3 m (o mesmo da E5.1). */
function ramal(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
  const xs = Array.from({ length: 10 }, (_, i) => 3000 * (i + 1));
  return applyBatch(m, [p('BOMBA_INCENDIO', 0, 300), t(0, 300, 0, 2600, 65), ...xs.map((x) => t(x - 3000, 2600, x, 2600)), ...xs.map((x) => p('SPRINKLER', x, 2600, { fatorK: 80 }))]).model;
}
const comArea = (m: BlueprintModel, pontos: ReturnType<typeof ret>, extra: Record<string, unknown> = {}) =>
  applyCommand(m, { type: 'AddAreaDeOperacao', levelId: m.levels[0].id, pontos, ...extra } as Command).model;

describe('E5.2 · o cálculo pela área desenhada', () => {
  it('abrem os sprinklers DENTRO da área (a borda conta), não os N mais desfavoráveis', () => {
    const m = comArea(ramal(), ret(20000, -1000, 30000, 1000));
    expect(sprinklersDaArea(m, m.areasDeOperacao![0]).map((t) => t.at.x)).toEqual([21000, 24000, 27000, 30000]);
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.areas).toHaveLength(1);
    expect(c.abertos.map((id) => m.terminais!.find((t) => t.id === id)!.at.x).sort((a, b) => a - b)).toEqual([21000, 24000, 27000, 30000]);
    expect(c.cenario!.terminais.every((t) => t.atende)).toBe(true);
  });

  it('a área desenhada menor que a exigida vira FALTA com o tamanho', () => {
    const m = comArea(ramal(), ret(20000, -1000, 30000, 1000)); // 20 m² < 139 m²
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(areaDoContornoM2(m.areasDeOperacao![0])).toBeCloseTo(20, 9);
    const item = conferenciaDeIncendio(m, c, HIP).find((i) => i.item === 'Área de operação AO-1: tamanho')!;
    expect(item.estado).toBe('FALTA');
    expect(item.obtido).toBe('20 m² desenhados, 4 sprinkler(s) dentro');
  });

  it('o risco da área vence o do estudo: extraordinário 1 pede 12,2 × 9,3 = 113,5 L/min em cada sprinkler', () => {
    const m = comArea(ramal(), ret(20000, -1000, 30000, 1000), { risco: 'EXTRA_1' });
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.porSistema.sprinklers!.criterio!.risco!.valor).toBe('EXTRA_1');
    expect(c.hip.vazaoMinimaSprinklerLmin).toBeCloseTo(12.2 * 9.3, 9);
    expect(Math.min(...c.cenario!.terminais.map((t) => t.vazaoLmin))).toBeCloseTo(12.2 * 9.3, 0);
  });

  it('duas áreas: cada uma tem o seu cenário; governa a de maior vazão × altura (a do fundo do ramal)', () => {
    let m = comArea(ramal(), ret(2000, -1000, 10000, 1000));
    m = comArea(m, ret(20000, -1000, 30000, 1000));
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.areas).toHaveLength(2);
    const qh = (i: number) => c.areas[i].resultado.cenario!.vazaoNaFonteLmin * c.areas[i].resultado.cargaNecessariaM!;
    const maior = qh(0) > qh(1) ? 0 : 1;
    expect(c.porSistema.sprinklers).toBe(c.areas[maior].resultado);
    expect(m.areasDeOperacao![maior].pontos[0].x).toBe(20000);
  });
});

/**
 * Salão em L: perna larga de 30 × 10 m embaixo, perna estreita de 6 × 20 m
 * subindo à esquerda (420 m²). Sprinklers a cada 3 m; ramais horizontais. A
 * bomba fica no canto de baixo à DIREITA, com o subgeral da perna larga ali; a
 * perna estreita sobe em x = 1,5 m a partir da linha de 7,5 m — o mais
 * desfavorável é o do topo dela (57 m de tubo, contra 33 m na perna larga).
 */
function salaoEmL(): { m: BlueprintModel; ancora: { x: number; y: number }; contorno: ReturnType<typeof point>[] } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const contorno = [point(0, 0), point(30000, 0), point(30000, 10000), point(6000, 10000), point(6000, 30000), point(0, 30000)];
  m = applyBatch(m, contorno.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: contorno[(i + 1) % contorno.length], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
  const linhas = [1500, 4500, 7500, 10500, 13500, 16500, 19500, 22500, 25500, 28500];
  const xsDaLinha = (y: number) => (y < 10000 ? Array.from({ length: 10 }, (_, i) => 1500 + 3000 * i) : [1500, 4500]);
  const t = (ax: number, ay: number, bx: number, by: number, ca = 2600, cb = 2600, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  const cmds: Command[] = [
    { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'BOMBA_INCENDIO', at: point(28500, 1500), cotaMm: 300, tipoHidraulico: 'BOMBA_INCENDIO' } as Command,
    t(28500, 1500, 28500, 1500, 300, 2600, 65),
  ];
  for (const y of linhas) {
    const xs = xsDaLinha(y);
    for (let i = 1; i < xs.length; i++) cmds.push(t(xs[i - 1], y, xs[i], y));
    for (const x of xs) cmds.push({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'SPRINKLER', at: point(x, y), cotaMm: 2600, tipoHidraulico: 'SPRINKLER', fatorK: 80 } as Command);
  }
  // Perna larga: subgeral na DIREITA (junto da bomba). Perna estreita: sobe em x = 1,5 m a partir da linha de 7,5 m.
  cmds.push(t(28500, 1500, 28500, 4500), t(28500, 4500, 28500, 7500));
  for (let i = 3; i < linhas.length; i++) cmds.push(t(1500, linhas[i - 1], 1500, linhas[i]));
  m = applyBatch(m, cmds).model;
  return { m, ancora: { x: 4500, y: 28500 }, contorno };
}

describe('E5.2 · a proposta automática', () => {
  it('⚠️ PRONTO QUANDO: no salão em L, parte do mais desfavorável, fica DENTRO do L e fecha a área exigida', () => {
    const { m, ancora, contorno } = salaoEmL();
    expect(m.spaces).toHaveLength(1);
    const p = proporAreaDeOperacao(m, HIP, LEVE);
    expect(p.motivo).toBeNull();
    const t = m.terminais!.find((x) => x.id === p.ancoraId)!;
    expect(t.at).toEqual(ancora);
    expect(p.ambienteInteiro).toBe(false);
    // Dentro do L (a borda conta) e com a área exigida — a perna tem 6 m, o retângulo de 9,8 m não cabe: cresceu.
    expect(p.pontos.every((q) => pointInPolygon(contorno, q))).toBe(true);
    expect(p.areaM2).toBeGreaterThanOrEqual(139 - 0.01);
    expect(p.areaM2).toBeLessThan(139 * 1.05);
    // Compacta: a perna estreita INTEIRA na largura (as duas colunas de sprinklers), não uma tira
    // que vira faixa fina ao longo da perna larga.
    const xs = p.pontos.map((q) => q.x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBeLessThan(10000);
    // Um comando, que o kernel aceita; o sprinkler âncora cai dentro da área criada.
    expect(p.comandos).toHaveLength(1);
    const com = applyBatch(m, p.comandos).model;
    expect(sprinklersDaArea(com, com.areasDeOperacao![0]).some((x) => x.id === p.ancoraId)).toBe(true);
  });

  it('ambiente menor que a área exigida: a área é o ambiente inteiro', () => {
    const { m } = salaoEmL();
    const p = proporAreaDeOperacao(m, HIP, criterioDeSprinklers({ ...HS, risco: 'LEVE', areaDeOperacaoM2: 500 }, null));
    expect(p.ambienteInteiro).toBe(true);
    expect(p.areaM2).toBeCloseTo(m.spaces[0].areaMm2 / 1e6, 6);
  });

  it('sem risco, diz por quê', () => {
    expect(proporAreaDeOperacao(ramal(), HIP, criterioDeSprinklers(HS, null)).motivo).toMatch(/sem o risco/);
  });
});
