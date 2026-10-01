/**
 * INCÊNDIO E6.2 (01/10/2026): a proteção da escada e as marcas de emergência
 * da porta no kernel (0.84.0), e a regra — proteção exigida pela altura
 * (CONFERIR NA IT) e as portas da caixa sem corta-fogo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_SAIDAS_PADRAO as HS, analisarSaidas, protecaoExigida } from '../utils/blueprintSaidasIncendio';

/**
 * Dois pavimentos 10 × 10 m; em cada um, a CAIXA da escada de 4 × 6 m (x 6–10,
 * y 0–6) com uma porta para o hall. A escada sobe dentro da caixa.
 */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  for (const l of m.levels.map((x) => x.id)) {
    m = applyBatch(m, [w(l, 0, 0, 10000, 0), w(l, 10000, 0, 10000, 10000), w(l, 10000, 10000, 0, 10000), w(l, 0, 10000, 0, 0), w(l, 6000, 0, 6000, 6000), w(l, 6000, 6000, 10000, 6000)]).model;
    const parede = m.walls.find((x) => x.levelId === l && x.a.x === 6000 && x.b.x === 6000)!;
    m = applyCommand(m, { type: 'AddOpening', wallId: parede.id, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  }
  return applyCommand(m, { type: 'AddEscada', levelId: m.levels[0].id, pontos: [point(8000, 1000), point(8000, 5000)], larguraMm: 1200, rotulo: 'E1' } as Command).model;
}

describe('E6.2 · o kernel (0.84.0)', () => {
  it('a proteção da escada: declara, troca, volta a não declarada; desconhecida é recusada', () => {
    let m = predio();
    const id = m.stairs[0].id;
    m = applyCommand(m, { type: 'SetEscadaProps', escadaId: id, protecao: 'PF' } as Command).model;
    expect(m.stairs[0].protecao).toBe('PF');
    m = applyCommand(m, { type: 'SetEscadaProps', escadaId: id, protecao: null } as Command).model;
    expect('protecao' in m.stairs[0]).toBe(false);
    expect(() => applyCommand(m, { type: 'SetEscadaProps', escadaId: id, protecao: 'XX' } as unknown as Command)).toThrow(/Proteção de escada desconhecida/);
  });

  it('as marcas da porta: sem repetição, na ordem da lista; lista vazia some; desconhecida é recusada', () => {
    let m = predio();
    const o = m.openings[0].id;
    m = applyCommand(m, { type: 'SetOpeningEmergencia', openingId: o, marcas: ['ANTIPANICO', 'SAIDA', 'SAIDA'] } as Command).model;
    expect(m.openings[0].emergencia).toEqual(['SAIDA', 'ANTIPANICO']);
    m = applyCommand(m, { type: 'SetOpeningEmergencia', openingId: o, marcas: [] } as Command).model;
    expect('emergencia' in m.openings[0]).toBe(false);
    expect(() => applyCommand(m, { type: 'SetOpeningEmergencia', openingId: o, marcas: ['PORTA'] } as unknown as Command)).toThrow(/Marca desconhecida/);
  });

  it('ida e volta pelo canônico preserva as duas; sem elas, as chaves nem aparecem', () => {
    let m = predio();
    expect(canonicalPayload(m)).not.toMatch(/"protecao"|"emergencia"/);
    m = applyBatch(m, [
      { type: 'SetEscadaProps', escadaId: m.stairs[0].id, protecao: 'EP' } as Command,
      { type: 'SetOpeningEmergencia', openingId: m.openings[1].id, marcas: ['CORTA_FOGO'] } as Command,
    ]).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.stairs[0].protecao).toBe('EP');
    expect(volta.openings.filter((o) => o.emergencia).map((o) => o.emergencia)).toEqual([['CORTA_FOGO']]);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });
});

describe('E6.2 · a regra', () => {
  it('a proteção exigida pela IT 08 (Tabela 6), por divisão e altura: A-2 NE até 12 m, EP até 30, PF acima; H-1 a 8 m é NE', () => {
    expect(protecaoExigida('A-2', 12).protecao).toBe('NE');
    expect(protecaoExigida('A-2', 12.01).protecao).toBe('EP');
    expect(protecaoExigida('A-2', 30).protecao).toBe('EP');
    expect(protecaoExigida('A-2', 31).protecao).toBe('PF');
    expect(protecaoExigida('H-1', 8).protecao).toBe('NE'); // o rascunho de memória dava EP
    expect(protecaoExigida('B-1', 20).protecao).toBe('PF');
  });

  it('⚠️ PRONTO QUANDO: com 20 m, a escada não declarada fica sem avaliar; NE não basta; EP atende — e as portas da caixa pedem corta-fogo', () => {
    let m = predio();
    const p = (x: BlueprintModel) => analisarSaidas(x, 'A-2', HS, null, 20).protecao[0];
    expect(p(m)).toMatchObject({ rotulo: 'E1', exigida: 'EP', declarada: null, atende: null, semCaixa: false });
    // A porta da caixa no térreo e a do 1º (a escada serve os dois).
    expect(p(m).portasSemCortaFogo).toHaveLength(2);
    m = applyCommand(m, { type: 'SetEscadaProps', escadaId: m.stairs[0].id, protecao: 'NE' } as Command).model;
    expect(p(m).atende).toBe(false);
    m = applyCommand(m, { type: 'SetEscadaProps', escadaId: m.stairs[0].id, protecao: 'PRESSURIZADA' } as Command).model;
    expect(p(m).atende).toBe(true);
    m = applyBatch(m, p(m).portasSemCortaFogo.map((openingId) => ({ type: 'SetOpeningEmergencia', openingId, marcas: ['CORTA_FOGO'] }) as Command)).model;
    expect(p(m).portasSemCortaFogo).toEqual([]);
  });

  it('até 12 m (NE) não se cobra caixa nem porta; sem altura, não avalia', () => {
    const m = predio();
    expect(analisarSaidas(m, 'A-2', HS, null, 6).protecao[0]).toMatchObject({ exigida: 'NE', portasSemCortaFogo: [] });
    expect(analisarSaidas(m, 'A-2', HS, null, null).protecao[0]).toMatchObject({ exigida: null, atende: null, motivo: 'sem a altura da edificação' });
  });

  it('escada solta no salão (ambiente grande, sem "escada" no nome) não tem caixa — e a porta da rua não é cobrada', () => {
    let m = predio();
    // A escada sai da caixa e vai para o hall de 60 m² (x 0–6): ele não é a caixa dela.
    m = applyCommand(m, { type: 'MoveEscadaVertex', escadaId: m.stairs[0].id, index: 0, to: point(3000, 1000) } as Command).model;
    m = applyCommand(m, { type: 'MoveEscadaVertex', escadaId: m.stairs[0].id, index: 1, to: point(3000, 5000) } as Command).model;
    expect(analisarSaidas(m, 'A-2', HS, null, 20).protecao[0]).toMatchObject({ semCaixa: true, portasSemCortaFogo: [] });
  });

  it('escada fora de um ambiente fechado: a análise diz que falta a caixa', () => {
    const base = predio();
    const m = applyCommand(base, { type: 'AddEscada', levelId: base.levels[0].id, pontos: [point(20000, 1000), point(20000, 5000)], larguraMm: 1200, rotulo: 'E2' } as Command).model;
    const e2 = analisarSaidas(m, 'A-2', HS, null, 20).protecao.find((x) => x.rotulo === 'E2')!;
    expect(e2.semCaixa).toBe(true);
  });
});
