/**
 * INCÊNDIO E5.1 (01/10/2026): risco → densidade × área → vazão por sprinkler →
 * os N mais desfavoráveis abertos → a vazão de projeto da bomba. Os valores da
 * tabela são CONFERIR NA NORMA; os testes fixam a CADEIA, não a norma.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { HIPOTESES_BOMBEAMENTO_PADRAO as HB, analisarBomba } from '../utils/blueprintBombeamentoIncendio';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';
import { HIPOTESES_INCENDIO_PADRAO, hipotesesIncendioDaColuna } from '../utils/blueprintIncendioClassificacao';
import {
  HIPOTESES_SPRINKLERS_PADRAO as HS,
  TABELA_DO_RISCO,
  criterioDeSprinklers,
  hipotesesDeSprinklersDaColuna,
  riscoSugeridoPelaDivisao,
} from '../utils/blueprintSprinklersIncendio';

describe('E5.1 · o critério', () => {
  it('risco leve pela tabela: 4,1 L/min/m² × 139 m², 20,9 m² por sprinkler → 7 sprinklers, 85,7 L/min cada, 570 L/min na área', () => {
    const c = criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null);
    expect(c.risco).toMatchObject({ valor: 'LEVE', origem: 'DECLARADA' });
    expect(c.densidade).toEqual({ valorLminM2: 4.1, origem: 'TABELA' });
    expect(c.sprinklersNaArea).toBe(7); // ⌈139 ÷ 20,9⌉ = ⌈6,65⌉
    expect(c.vazaoPorSprinklerLmin).toBeCloseTo(4.1 * 20.9, 9);
    expect(c.vazaoDaAreaLmin).toBeCloseTo(4.1 * 139, 9);
    expect(c.duracaoMin).toBe(30);
  });

  it('o declarado vence: a densidade e a área digitadas vencem a tabela; o risco declarado vence o da divisão', () => {
    const c = criterioDeSprinklers({ ...HS, risco: 'EXTRA_1', densidadeLminM2: 10, areaPorSprinklerM2: 10 }, 'A-2');
    expect(c.risco!.valor).toBe('EXTRA_1');
    expect(c.densidade).toEqual({ valorLminM2: 10, origem: 'DECLARADA' });
    expect(c.areaDeOperacao).toEqual({ valorM2: TABELA_DO_RISCO.EXTRA_1.areaDeOperacaoM2, origem: 'TABELA' });
    expect(c.sprinklersNaArea).toBe(24); // ⌈232 ÷ 10⌉
    expect(c.vazaoPorSprinklerLmin).toBe(100);
  });

  it('a área exata não ganha um sprinkler a mais pelo arredondamento', () => {
    expect(criterioDeSprinklers({ ...HS, risco: 'LEVE', areaDeOperacaoM2: 139, areaPorSprinklerM2: 13.9 }, null).sprinklersNaArea).toBe(10);
  });

  it('sem risco declarado, a divisão sugere; sem divisão (ou explosivo), não há critério', () => {
    expect(criterioDeSprinklers(HS, 'A-2').risco).toMatchObject({ valor: 'LEVE', origem: 'SUGERIDA' });
    expect(riscoSugeridoPelaDivisao('C-1')!.risco).toBe('ORDINARIO_2');
    expect(riscoSugeridoPelaDivisao('g-2')!.risco).toBe('ORDINARIO_1');
    expect(riscoSugeridoPelaDivisao('L-1')).toBeNull();
    const nada = criterioDeSprinklers(HS, null);
    expect(nada.risco).toBeNull();
    expect(nada.sprinklersNaArea).toBeNull();
  });

  it('a coluna: só risco conhecido e número positivo entram; as premissas do estudo trazem o grupo', () => {
    expect(hipotesesDeSprinklersDaColuna({ risco: 'MUITO', densidadeLminM2: -1, areaDeOperacaoM2: '200', areaPorSprinklerM2: 9 })).toEqual({ ...HS, areaPorSprinklerM2: 9 });
    expect(HIPOTESES_INCENDIO_PADRAO.sprinklers).toEqual(HS);
    expect(hipotesesIncendioDaColuna({ sprinklers: { risco: 'ORDINARIO_1' } }).sprinklers.risco).toBe('ORDINARIO_1');
  });
});

/** Bomba → coluna → um ramal de 30 m com 10 sprinklers K 80, um a cada 3 m. Opcionalmente, um hidrante junto da bomba. */
function ramal(comHidrante = false): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
  const xs = Array.from({ length: 10 }, (_, i) => 3000 * (i + 1));
  return applyBatch(m, [
    p('BOMBA_INCENDIO', 0, 300),
    t(0, 300, 0, 2600, 65),
    ...xs.map((x) => t(x - 3000, 2600, x, 2600)),
    ...xs.map((x) => p('SPRINKLER', x, 2600, { fatorK: 80 })),
    ...(comHidrante ? [t(0, 2600, 0, 1300, 65), p('HIDRANTE_SIMPLES', 0, 1300)] : []),
  ]).model;
}
const xDe = (m: BlueprintModel, id: string) => m.terminais!.find((t) => t.id === id)!.at.x;

describe('E5.1 · o cálculo com sprinklers', () => {
  it('abre os 7 mais desfavoráveis (os 7 mais longe da bomba); o pior dá exatamente a vazão mínima', () => {
    const m = ramal();
    const c = calculoDeIncendio(m, HIP, criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null));
    expect(c.sistema).toBe('SPRINKLERS');
    expect(c.abertos).toHaveLength(7);
    expect(c.abertos.map((id) => xDe(m, id)).sort((a, b) => a - b)).toEqual([12000, 15000, 18000, 21000, 24000, 27000, 30000]);
    const q = c.cenario!.terminais.map((x) => x.vazaoLmin);
    expect(Math.min(...q)).toBeCloseTo(4.1 * 20.9, 0);
    expect(c.cenario!.terminais.every((x) => x.atende)).toBe(true);
    // A RTI segue a duração do risco (30 min), não a autonomia dos hidrantes (60).
    expect(c.rti.autonomiaMin).toBe(30);
    expect(c.rti.exigidaL).toBeCloseTo(c.cenario!.vazaoNaFonteLmin * 30, 6);
  });

  it('mudar o risco muda a vazão exigida na bomba (a cadeia risco → densidade → vazão → bomba)', () => {
    const m = ramal();
    const projeto = (risco: 'LEVE' | 'ORDINARIO_2') => {
      const c = calculoDeIncendio(m, HIP, criterioDeSprinklers({ ...HS, risco }, null));
      return analisarBomba(m, HIP, HB, c)!.projeto!;
    };
    const leve = projeto('LEVE');
    const oh2 = projeto('ORDINARIO_2');
    expect(leve.vazaoLmin).toBeGreaterThan(4.1 * 139 - 1);
    // Ordinário 2 pede 12 sprinklers; o ramal tem 10 — abrem todos, com ≥ 98 L/min cada.
    expect(oh2.vazaoLmin).toBeGreaterThan(10 * 8.1 * 12.1 - 1);
    expect(oh2.vazaoLmin).toBeGreaterThan(leve.vazaoLmin);
    expect(oh2.alturaM).toBeGreaterThan(leve.alturaM);
  });

  it('sem risco nem divisão: o cálculo diz o motivo, e a conferência cobra o risco', () => {
    const m = ramal();
    const c = calculoDeIncendio(m, HIP, criterioDeSprinklers(HS, null));
    expect(c.cenario).toBeNull();
    expect(c.motivo).toMatch(/sem o risco dos sprinklers/);
    const itens = conferenciaDeIncendio(m, c, HIP);
    expect(itens.find((i) => i.item === 'Risco dos sprinklers definido')!.estado).toBe('FALTA');
  });

  it('a conferência da NBR 10897: atende com o risco leve; com 12 exigidos e 10 na rede, a área diz que faltam sprinklers', () => {
    const m = ramal();
    const leve = conferenciaDeIncendio(m, calculoDeIncendio(m, HIP, criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null)), HIP);
    expect(leve.find((i) => i.item.startsWith('Vazão e pressão nos 7 sprinkler'))!.estado).toBe('ATENDE');
    expect(leve.find((i) => i.item === 'Vazão da área de operação')!.estado).toBe('ATENDE');
    const oh2 = conferenciaDeIncendio(m, calculoDeIncendio(m, HIP, criterioDeSprinklers({ ...HS, risco: 'ORDINARIO_2' }, null)), HIP);
    const area = oh2.find((i) => i.item === 'Vazão da área de operação')!;
    expect(area.obtido).toMatch(/a rede tem menos que os 12 da área/);
    // 10 × 98 L/min < 8,1 × 139 = 1.126 L/min: o ramal não cobre a área de operação.
    expect(area.estado).toBe('FALTA');
  });

  it('hidrante e sprinklers na mesma rede: cada um tem o seu cenário; governa o de maior vazão × altura', () => {
    const m = ramal(true);
    const c = calculoDeIncendio(m, HIP, criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null));
    const h = c.porSistema.hidrantes!;
    const s = c.porSistema.sprinklers!;
    expect(h.cenario && s.cenario).toBeTruthy();
    const qh = (r: typeof h) => r.cenario!.vazaoNaFonteLmin * r.cargaNecessariaM!;
    expect(c.sistema).toBe(qh(s) > qh(h) ? 'SPRINKLERS' : 'HIDRANTES');
    expect(c.cenario).toBe(c.sistema === 'SPRINKLERS' ? s.cenario : h.cenario);
    // Os itens de hidrante leem o cenário dos hidrantes, seja quem for que governa.
    const itens = conferenciaDeIncendio(m, c, HIP);
    expect(itens.find((i) => i.item.startsWith('Vazão no esguicho'))!.estado).toBe('ATENDE');
  });

  it('só hidrantes: nada muda (o critério dos sprinklers não entra)', () => {
    const m = ramal(true);
    const semSpk = { ...m, terminais: m.terminais!.filter((t) => t.tipoHidraulico !== 'SPRINKLER') };
    const c = calculoDeIncendio(semSpk, HIP, criterioDeSprinklers({ ...HS, risco: 'EXTRA_2' }, null));
    expect(c.sistema).toBe('HIDRANTES');
    expect(c.porSistema.sprinklers).toBeNull();
    expect(c.rti.autonomiaMin).toBe(HIP.autonomiaMin);
  });
});
