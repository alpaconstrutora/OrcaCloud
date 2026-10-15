/**
 * Casa automática F1 (14/10/2026): o programa da casa pelo formulário curto
 * (`programaDaCasa`) e o pré-preenchimento pela unidade do Empreendimento
 * (`programaCurtoDaUnidade`). Ver `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import {
  HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  PROGRAMA_CURTO_PADRAO,
  problemasDoPrograma,
  programaCurtoDaUnidade,
  programaDaCasa,
  relacaoEntre,
  resumoDoPrograma,
  type ItemDoPrograma,
  type ProgramaCurtoDaCasa,
} from '../utils/blueprintPrograma';
import { gerar, type Retangulo } from '../utils/blueprintGerador';
import { point } from '../utils/blueprintKernel';

const casa = (mudanca: Partial<ProgramaCurtoDaCasa> = {}) => programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, ...mudanca });
const contar = (itens: ItemDoPrograma[], uso: ItemDoPrograma['uso']) => itens.filter((i) => i.uso === uso).reduce((s, i) => s + i.quantidade, 0);
const item = (itens: ItemDoPrograma[], id: string) => itens.find((i) => i.id === id);

describe('programaDaCasa — formulário curto → Programa', () => {
  it('3 dorm (1 suíte), 2 banheiros, 2 vagas, R1-N: os ambientes da semente casa térrea', () => {
    const { programa: p, avisos } = casa();
    expect(problemasDoPrograma(p)).toEqual([]);
    expect(avisos).toEqual([]);
    expect(contar(p.itens, 'SUITE')).toBe(1);
    expect(contar(p.itens, 'DORMITORIO')).toBe(2);
    expect(contar(p.itens, 'BANHEIRO')).toBe(2); // banheiro da suíte + social
    expect(contar(p.itens, 'LAVABO')).toBe(1);
    expect(contar(p.itens, 'VARANDA')).toBe(1);
    expect(contar(p.itens, 'ESCRITORIO')).toBe(0);
    expect(item(p.itens, 'gar')).toMatchObject({ nome: 'Garagem (2 vagas)', areaIdealM2: 30, areaMinM2: 25 });
    expect(relacaoEntre(p, 'suite1', 'bsuite1')?.tipo).toBe('OBRIGATORIA');
    expect(relacaoEntre(p, 'coz', 'suite1')?.tipo).toBe('PROIBIDA');
    expect(p.nome).toBe('Casa térrea 3 dorm. (1 suíte) · R1-N');
  });

  it('sem suíte: só dormitórios simples, banheiro social, nenhuma relação para suíte', () => {
    const { programa: p, avisos } = casa({ dormitorios: 2, suites: 0, banheiros: 1 });
    expect(problemasDoPrograma(p)).toEqual([]);
    expect(avisos).toEqual([]);
    expect(contar(p.itens, 'SUITE')).toBe(0);
    expect(contar(p.itens, 'DORMITORIO')).toBe(2);
    expect(item(p.itens, 'banho')?.quantidade).toBe(1);
    expect(p.relacoes.some((r) => r.a.startsWith('suite') || r.b.startsWith('suite'))).toBe(false);
  });

  it('2 suítes = 2 itens, cada uma com o SEU banheiro obrigatório (não quantidade 2)', () => {
    const { programa: p } = casa({ dormitorios: 3, suites: 2, banheiros: 3 });
    expect(problemasDoPrograma(p)).toEqual([]);
    expect(p.itens.filter((i) => i.uso === 'SUITE').map((i) => [i.id, i.nome, i.quantidade])).toEqual([
      ['suite1', 'Suíte 1', 1],
      ['suite2', 'Suíte 2', 1],
    ]);
    expect(relacaoEntre(p, 'suite1', 'bsuite1')?.tipo).toBe('OBRIGATORIA');
    expect(relacaoEntre(p, 'suite2', 'bsuite2')?.tipo).toBe('OBRIGATORIA');
    expect(relacaoEntre(p, 'suite1', 'bsuite2')).toBeNull();
    expect(item(p.itens, 'dorm')?.quantidade).toBe(1);
    expect(item(p.itens, 'banho')?.quantidade).toBe(1);
  });

  it('todos suítes: sem dormitório simples e sem banheiro social', () => {
    const { programa: p, avisos } = casa({ dormitorios: 2, suites: 2, banheiros: 2 });
    expect(avisos).toEqual([]);
    expect(item(p.itens, 'dorm')).toBeUndefined();
    expect(item(p.itens, 'banho')).toBeUndefined();
    expect(contar(p.itens, 'BANHEIRO')).toBe(2);
  });

  it('0 vagas (ou descobertas): sem garagem — a descoberta é dita', () => {
    expect(item(casa({ vagas: 0 }).programa.itens, 'gar')).toBeUndefined();
    const descoberta = casa({ vagas: 2, garagemCoberta: false });
    expect(item(descoberta.programa.itens, 'gar')).toBeUndefined();
    expect(descoberta.avisos.join(' ')).toMatch(/2 vagas descobertas/);
    expect(item(casa({ vagas: 1 }).programa.itens, 'gar')).toMatchObject({ nome: 'Garagem (1 vaga)', areaIdealM2: 15, areaMinM2: 12.5 });
  });

  it('padrões CUB: R1-B enxuga (sem varanda/lavabo, áreas menores), R1-A amplia e ganha escritório', () => {
    const b = casa({ padrao: 'R1-B' }).programa;
    const n = casa({ padrao: 'R1-N' }).programa;
    const a = casa({ padrao: 'R1-A' }).programa;
    for (const p of [b, n, a]) expect(problemasDoPrograma(p)).toEqual([]);
    expect(contar(b.itens, 'VARANDA') + contar(b.itens, 'LAVABO')).toBe(0);
    expect(contar(a.itens, 'ESCRITORIO')).toBe(1);
    const sala = (p: typeof b) => item(p.itens, 'sala')!.areaIdealM2;
    expect(sala(b)).toBeLessThan(sala(n));
    expect(sala(a)).toBeGreaterThan(sala(n));
    // presa na faixa do item: nunca abaixo da mínima nem acima da máxima
    for (const p of [b, a]) for (const i of p.itens) {
      expect(i.areaIdealM2).toBeGreaterThanOrEqual(i.areaMinM2);
      if (i.areaMaxM2 != null) expect(i.areaIdealM2).toBeLessThanOrEqual(i.areaMaxM2);
    }
    // a garagem é das vagas, não do padrão
    expect(item(a.itens, 'gar')!.areaIdealM2).toBe(item(n.itens, 'gar')!.areaIdealM2);
  });

  it('área alvo de 90 m²: a soma (com circulação, sem garagem) fecha no alvo', () => {
    const { programa: p, avisos } = casa({ areaAlvoM2: 90 });
    expect(avisos).toEqual([]);
    const semGaragem = p.itens.filter((i) => i.uso !== 'GARAGEM' && i.uso !== 'CIRCULACAO').reduce((s, i) => s + i.areaIdealM2 * i.quantidade, 0);
    expect(semGaragem * (1 + p.circulacaoMaxPct / 100)).toBeCloseTo(90, 0);
    expect(item(p.itens, 'gar')!.areaIdealM2).toBe(30);
    expect(resumoDoPrograma(p).areaIdealComCirculacaoM2).toBeCloseTo(90 + 30 * 1.12, 0);
  });

  it('área alvo impossível: fica no mínimo do programa e DIZ', () => {
    const { programa: p, avisos } = casa({ areaAlvoM2: 30 });
    expect(avisos.join(' ')).toMatch(/abaixo do que o programa pede com as áreas mínimas/);
    for (const i of p.itens) expect(i.areaIdealM2).toBeGreaterThanOrEqual(i.areaMinM2);
  });

  it('formulário incoerente é corrigido e cada correção é dita', () => {
    const r = programaDaCasa({ dormitorios: 9, suites: 12, banheiros: 0, vagas: -1, garagemCoberta: true, areaAlvoM2: -5, padrao: 'X' as never });
    expect(r.curto).toMatchObject({ dormitorios: 6, suites: 6, banheiros: 6, vagas: 0, areaAlvoM2: null, padrao: 'R1-N' });
    expect(r.avisos.length).toBe(6);
    expect(problemasDoPrograma(r.programa)).toEqual([]);
    // dormitório simples sem banheiro social: sobe para suítes + 1
    expect(programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, dormitorios: 3, suites: 1, banheiros: 1 }).curto.banheiros).toBe(2);
  });

  it('determinístico: a mesma entrada dá o mesmo programa', () => {
    expect(JSON.stringify(casa({ suites: 2, banheiros: 3, areaAlvoM2: 110 }))).toBe(JSON.stringify(casa({ suites: 2, banheiros: 3, areaAlvoM2: 110 })));
  });
});

describe('programa da casa no gerador E6.2', () => {
  const encostam = (a: Retangulo, b: Retangulo) => {
    const tocaX = a.x1 === b.x0 || b.x1 === a.x0;
    const tocaY = a.y1 === b.y0 || b.y1 === a.y0;
    const sobreY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    const sobreX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return (tocaX && sobreY >= 700) || (tocaY && sobreX >= 700);
  };

  it('2 suítes: cada suíte encosta no SEU banheiro', () => {
    const { programa } = casa({ dormitorios: 3, suites: 2, banheiros: 3, vagas: 0 });
    const envelope = [point(0, 0), point(12000, 0), point(12000, 16000), point(0, 16000)];
    const r = gerar({ programa, envelope, direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -19.9 }, 1, { automaticos: false, iteracoes: 200 });
    const amb = (id: string) => r.ambientes.find((a) => a.item.id === id)!;
    for (const k of [1, 2]) {
      expect(amb(`suite${k}`)).toBeDefined();
      expect(encostam(amb(`suite${k}`).ret, amb(`bsuite${k}`).ret)).toBe(true);
    }
  });
});

describe('programaCurtoDaUnidade — pré-preenchimento pela unidade do Empreendimento', () => {
  it('lê dormitórios/suítes/banheiros/vagas e tira a área alvo da privativa', () => {
    const { curto, avisos } = programaCurtoDaUnidade({ name: 'Casa 01', typology: 'Casa 3Q alto padrão', private_area: 180, bedrooms: 3, suites: 2, bathrooms: 3, parking_spaces: 2 });
    expect(curto).toMatchObject({ dormitorios: 3, suites: 2, banheiros: 3, vagas: 2, padrao: 'R1-A', garagemCoberta: true });
    expect(curto.areaAlvoM2).toBe(180 * HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO.fatorUtilDaPrivativa - 30);
    expect(avisos).toHaveLength(1);
  });

  it('campo vazio fica com o padrão e é dito; tipologia sem padrão = R1-N', () => {
    const { curto, avisos } = programaCurtoDaUnidade({ name: 'Casa 02', typology: 'Casa térrea' });
    expect(curto).toMatchObject({ dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, padrao: 'R1-N', areaAlvoM2: null });
    expect(avisos).toHaveLength(4);
    expect(programaCurtoDaUnidade({ name: 'x', typology: 'popular' }).curto.padrao).toBe('R1-B');
  });
});
