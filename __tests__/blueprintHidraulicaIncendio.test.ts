/**
 * INCÊNDIO E2.1/E2.2 (30/09/2026): as três fórmulas de perda e o solver de
 * MALHA pelo método do gradiente. Casos que se conferem à mão.
 */
import { describe, expect, it } from 'vitest';
import {
  MCA_POR_BAR,
  eloDeEmissor,
  eloDeTubo,
  kInternoDoEmissor,
  perdaNoTubo,
  perdaUnitaria,
  resolverRede,
  type EloHidraulico,
  type NoHidraulico,
} from '../utils/blueprintHidraulicaIncendio';
import { diametroInternoMm, perdaDistribuida } from '../utils/blueprintHidraulicaPressao';

describe('E2.1 · fórmulas de perda', () => {
  it('Hazen-Williams conferido à mão: aço galvanizado DN 65 (Di 62,7 mm, C 120), 5 L/s', () => {
    const q = 0.005;
    const D = 0.0627;
    const esperado = (10.67 * Math.pow(q, 1.852)) / (Math.pow(120, 1.852) * Math.pow(D, 4.87));
    expect(perdaUnitaria('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', 65, q).j).toBeCloseTo(esperado, 12);
    // Prova INDEPENDENTE pela forma americana da NFPA 13: p (psi/pé) = 4,52·Q^1,85/(C^1,85·d^4,87),
    // Q em gpm, d em polegadas. 5 L/s = 79,25 gpm; 62,7 mm = 2,4685". 1 psi/pé = 2,3067 m/m.
    const gpm = 5 * 15.850323;
    const psiPorPe = (4.52 * Math.pow(gpm, 1.85)) / (Math.pow(120, 1.85) * Math.pow(62.7 / 25.4, 4.87));
    expect(esperado).toBeCloseTo(psiPorPe * 2.3067, 2);
  });

  it('Fair-Whipple-Hsiao: a fórmula do aço no aço e a do plástico no CPVC', () => {
    const q = 0.002;
    const Dg = diametroInternoMm('ACO_GALVANIZADO', 50) / 1000;
    expect(perdaUnitaria('FAIR_WHIPPLE_HSIAO', 'ACO_GALVANIZADO', 50, q).j).toBeCloseTo((0.002021 * Math.pow(q, 1.88)) / Math.pow(Dg, 4.88), 12);
    const Dc = diametroInternoMm('CPVC_INCENDIO', 50) / 1000;
    expect(perdaUnitaria('FAIR_WHIPPLE_HSIAO', 'CPVC_INCENDIO', 50, q).j).toBeCloseTo((0.0008695 * Math.pow(q, 1.75)) / Math.pow(Dc, 4.75), 12);
  });

  it('a universal é a MESMA da água (uma fonte só), e a derivada numérica bate com a inclinação', () => {
    const r = perdaUnitaria('UNIVERSAL', 'ACO_CARBONO', 80, 0.008);
    expect(r.j).toBeCloseTo(perdaDistribuida(8, 'ACO_CARBONO', 80, 1).perdaMca, 12);
    const r2 = perdaUnitaria('UNIVERSAL', 'ACO_CARBONO', 80, 0.0081);
    expect(Math.abs(r.dj - (r2.j - r.j) / 0.0001) / r.dj).toBeLessThan(0.02);
  });

  it('as três fórmulas concordam na ordem de grandeza (± 35 %) num caso típico', () => {
    const js = (['HAZEN_WILLIAMS', 'UNIVERSAL', 'FAIR_WHIPPLE_HSIAO'] as const).map((f) => perdaUnitaria(f, 'ACO_GALVANIZADO', 65, 0.005).j);
    const media = js.reduce((a, b) => a + b, 0) / 3;
    for (const j of js) expect(Math.abs(j - media) / media).toBeLessThan(0.35);
  });

  it('velocidade = Q / área interna', () => {
    const r = perdaNoTubo('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', 65, 0.005, 10);
    expect(r.velocidadeMs).toBeCloseTo(0.005 / ((Math.PI * 0.0627 ** 2) / 4), 9);
    expect(r.hfMca).toBeCloseTo(r.jMpm * 10, 12);
  });

  it('emissor: K 80 a 1 bar dá 80 L/min', () => {
    const k = kInternoDoEmissor(80);
    expect(k * Math.sqrt(MCA_POR_BAR) * 60000).toBeCloseTo(80, 9);
  });
});

/** Tubo de HW em aço DN 65, comprimento `l`. */
const tubo = (id: string, de: string, para: string, l: number, dn = 65): EloHidraulico =>
  eloDeTubo(id, de, para, (q) => perdaUnitaria('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', dn, q), l);

describe('E2.2 · solver de malha (gradiente)', () => {
  it('árvore simples: fonte → tubo → demanda fixa; a perda é a da fórmula, sem iteração por fora', () => {
    const nos: NoHidraulico[] = [{ id: 'F', zM: 0, cargaFixaM: 50 }, { id: 'A', zM: 0, demanda: 0.005 }];
    const s = resolverRede(nos, [tubo('t', 'F', 'A', 30)]);
    expect(s.convergiu).toBe(true);
    expect(s.vazao.get('t')!).toBeCloseTo(0.005, 9);
    const hf = perdaNoTubo('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', 65, 0.005, 30).hfMca;
    expect(s.carga.get('A')!).toBeCloseTo(50 - hf, 6);
  });

  it('⚠️ ANEL simétrico divide ao meio — o que o motor da água descartava', () => {
    // F → A, e de A dois caminhos iguais até B, onde sai a vazão.
    const nos: NoHidraulico[] = [
      { id: 'F', zM: 0, cargaFixaM: 60 },
      { id: 'A', zM: 0 },
      { id: 'B', zM: 0, demanda: 0.01 },
    ];
    const s = resolverRede(nos, [tubo('fa', 'F', 'A', 10), tubo('ab1', 'A', 'B', 20), tubo('ab2', 'A', 'B', 20)]);
    expect(s.convergiu).toBe(true);
    expect(s.vazao.get('ab1')!).toBeCloseTo(0.005, 7);
    expect(s.vazao.get('ab2')!).toBeCloseTo(0.005, 7);
  });

  it('anel ASSIMÉTRICO: o caminho curto leva mais, e as duas perdas são iguais (é isso que equilibra)', () => {
    const nos: NoHidraulico[] = [{ id: 'F', zM: 0, cargaFixaM: 60 }, { id: 'B', zM: 0, demanda: 0.01 }];
    const s = resolverRede(nos, [tubo('curto', 'F', 'B', 10), tubo('longo', 'F', 'B', 40)]);
    const qc = s.vazao.get('curto')!;
    const ql = s.vazao.get('longo')!;
    expect(qc + ql).toBeCloseTo(0.01, 9);
    expect(qc).toBeGreaterThan(ql);
    const hc = perdaNoTubo('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', 65, qc, 10).hfMca;
    const hl = perdaNoTubo('HAZEN_WILLIAMS', 'ACO_GALVANIZADO', 65, ql, 40).hfMca;
    expect(hc).toBeCloseTo(hl, 6);
    // Com expoente 1,852: (40/10)^(1/1,852) = razão das vazões.
    expect(qc / ql).toBeCloseTo(Math.pow(4, 1 / 1.852), 4);
  });

  it('GRELHA 3×3 com demanda em cada nó: a vazão se conserva em todo nó', () => {
    const nos: NoHidraulico[] = [{ id: 'F', zM: 0, cargaFixaM: 80 }];
    const elos: EloHidraulico[] = [tubo('f00', 'F', 'n00', 5)];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) nos.push({ id: `n${i}${j}`, zM: 0, demanda: 0.001 });
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        if (i < 2) elos.push(tubo(`v${i}${j}`, `n${i}${j}`, `n${i + 1}${j}`, 3, 40));
        if (j < 2) elos.push(tubo(`h${i}${j}`, `n${i}${j}`, `n${i}${j + 1}`, 3, 40));
      }
    const s = resolverRede(nos, elos);
    expect(s.convergiu).toBe(true);
    for (const n of nos.filter((x) => x.cargaFixaM == null)) {
      const saida = elos.filter((e) => e.de === n.id).reduce((a, e) => a + s.vazao.get(e.id)!, 0);
      const entrada = elos.filter((e) => e.para === n.id).reduce((a, e) => a + s.vazao.get(e.id)!, 0);
      expect(entrada - saida - (n.demanda ?? 0)).toBeCloseTo(0, 9);
    }
    expect(s.vazao.get('f00')!).toBeCloseTo(0.009, 9);
  });

  it('⚠️ EMISSORES dão o ponto de equilíbrio: o sprinkler mais perto da fonte recebe mais', () => {
    const k = kInternoDoEmissor(80);
    const nos: NoHidraulico[] = [
      { id: 'F', zM: 0, cargaFixaM: 30 },
      { id: 'A', zM: 0 },
      { id: 'B', zM: 0 },
      { id: 'atmA', zM: 0, cargaFixaM: 0 },
      { id: 'atmB', zM: 0, cargaFixaM: 0 },
    ];
    const elos = [tubo('fa', 'F', 'A', 10, 25), tubo('ab', 'A', 'B', 10, 25), eloDeEmissor('sA', 'A', 'atmA', k), eloDeEmissor('sB', 'B', 'atmB', k)];
    const s = resolverRede(nos, elos);
    expect(s.convergiu).toBe(true);
    const qA = s.vazao.get('sA')!;
    const qB = s.vazao.get('sB')!;
    expect(qA).toBeGreaterThan(qB);
    // Cada emissor obedece Q = K·√P na pressão que o solver achou.
    for (const [id, no] of [['sA', 'A'], ['sB', 'B']] as const) {
      expect(s.vazao.get(id)!).toBeCloseTo(k * Math.sqrt(s.carga.get(no)!), 9);
    }
  });

  it('a cota entra na carga: subir 10 m consome 10 m de carga', () => {
    const nos: NoHidraulico[] = [{ id: 'F', zM: 0, cargaFixaM: 50 }, { id: 'A', zM: 10, demanda: 0 }];
    const s = resolverRede(nos, [tubo('t', 'F', 'A', 10)]);
    // Sem vazão, a carga total no topo é a da fonte; a PRESSÃO lá é a carga menos a cota.
    expect(s.carga.get('A')! - 10).toBeCloseTo(40, 6);
  });

  it('nó sem caminho até a fonte fica isolado, sem quebrar o resto', () => {
    const nos: NoHidraulico[] = [{ id: 'F', zM: 0, cargaFixaM: 50 }, { id: 'A', zM: 0, demanda: 0.001 }, { id: 'X', zM: 0, demanda: 0.001 }, { id: 'Y', zM: 0 }];
    const s = resolverRede(nos, [tubo('t', 'F', 'A', 10), tubo('xy', 'X', 'Y', 10)]);
    expect(s.convergiu).toBe(true);
    expect(s.isolados.sort()).toEqual(['X', 'Y']);
    expect(s.vazao.has('xy')).toBe(false);
  });
});
