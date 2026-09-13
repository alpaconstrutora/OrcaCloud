/**
 * F6 — QUADRO E ALIMENTADOR: demanda, alimentador, fases (13/09/2026).
 *
 * *"Siga com F6–F7"*. O circuito terminal é dimensionado pela carga que pode
 * alimentar; o quadro admite DEMANDA — e a tabela de demanda é da
 * concessionária, não da 5410. Por isso ela é hipótese NOMEADA, padrão 1,00.
 *
 * ─── ⚠️ O QUE UMA IMPLEMENTAÇÃO INGÊNUA ERRA ────────────────────────────────
 *
 * · a queda que a 6.2.7.1 limita é da ORIGEM ao pior ponto: alimentador + o
 *   pior terminal, não o alimentador sozinho;
 * · ligação do quadro não declarada é DEDUZIDA e dita — não assumida em
 *   silêncio;
 * · balanceamento só existe em quadro trifásico, e circuito FN sem fase fica
 *   FORA dele (dito), em vez de cair numa fase qualquer.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  DEMANDA_SEM_FATOR,
  HIPOTESES_PADRAO,
  grupoDeCarga,
  preDimensionarQuadroCompleto,
} from '../utils/blueprintEletricaDimensionamento';

function cena(quadro: Partial<Extract<Command, { type: 'AddQuadro' }>> = {}): { m: BlueprintModel; levelId: string; quadroId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const m = applyCommand(base, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ...quadro }).model;
  return { m, levelId, quadroId: m.quadros[0].id };
}

const circuito = (m: BlueprintModel, quadroId: string, extras: Partial<Extract<Command, { type: 'AddCircuito' }>> = {}) => {
  const c = applyCommand(m, { type: 'AddCircuito', quadroId, nome: `C${(m.circuitos ?? []).length + 1}`, tensaoV: 127, ...extras }).model;
  return { m: c, id: c.circuitos[c.circuitos.length - 1].id };
};

const ponto = (m: BlueprintModel, levelId: string, x: number, tipoEletrico: 'TUG' | 'TUE' | 'ILUMINACAO_TETO' | 'LIGACAO_DIRETA' | 'DADOS_TV', potenciaW: number, circuitoId: string) => {
  const criado = applyCommand(m, {
    type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, 75), cotaMm: 300, tipoEletrico, potenciaW,
  }).model;
  const id = criado.terminais[criado.terminais.length - 1].id;
  return applyCommand(criado, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
};

describe('grupo de carga', () => {
  it('luz → iluminação; TUG e dados → TUG; TUE e ligação direta → força; interruptor → nenhum', () => {
    expect(grupoDeCarga('ILUMINACAO_TETO')).toBe('ILUMINACAO');
    expect(grupoDeCarga('TUG')).toBe('TUG');
    expect(grupoDeCarga('DADOS_TV')).toBe('TUG');
    expect(grupoDeCarga('TUE')).toBe('FORCA');
    expect(grupoDeCarga('LIGACAO_DIRETA')).toBe('FORCA');
    expect(grupoDeCarga('INTERRUPTOR')).toBeNull();
    expect(grupoDeCarga(null)).toBeNull();
  });
});

describe('demanda e alimentador', () => {
  it('sem demanda (padrão): demandada = instalada; alimentador FN 127 V; IB, seção e geral', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FN', tensaoV: 127, alimentadorM: 10 });
    const { m: m1, id: c1 } = circuito(m0, quadroId);
    const { m: m2, id: c2 } = circuito(m1, quadroId);
    let m = m2;
    m = ponto(m, levelId, 1000, 'ILUMINACAO_TETO', 400, c1);
    m = ponto(m, levelId, 2000, 'TUG', 600, c2);
    m = ponto(m, levelId, 3000, 'TUG', 600, c2);
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.porGrupoVA).toEqual({ ILUMINACAO: 400, TUG: 1200, FORCA: 0 });
    expect(q.sInstaladaVA).toBe(1600);
    expect(q.sDemandadaVA).toBe(1600);
    expect(q.demanda).toEqual(DEMANDA_SEM_FATOR);
    expect(q.ligacaoDeduzida).toBe(false);
    expect(q.ibA).toBeCloseTo(1600 / 127, 6); // 12,6 A
    expect(q.secaoCalculada).toMatchObject({ secaoMm2: 2.5 }); // força: mínimo 2,5; Iz 24 ≥ 12,6
    expect(q.disjuntorGeralA).toBe(16);
    expect(q.quedaAlimentadorPct).not.toBeNull();
    expect(q.achados).toEqual([]);
  });

  it('⚠️ os fatores de demanda reduzem a carga do ALIMENTADOR — e a tabela fica nomeada', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FN', tensaoV: 127 });
    const { m: m1, id: c1 } = circuito(m0, quadroId);
    let m = m1;
    for (const x of [1000, 2000, 3000, 4000]) m = ponto(m, levelId, x, 'TUG', 600, c1); // 2.400 VA
    const hip = { ...HIPOTESES_PADRAO, demanda: { nome: 'teste 50 % em TUG', ILUMINACAO: 1, TUG: 0.5, FORCA: 1 } };
    const q = preDimensionarQuadroCompleto(m, quadroId, hip)!;
    expect(q.sInstaladaVA).toBe(2400);
    expect(q.sDemandadaVA).toBe(1200);
    expect(q.demanda.nome).toBe('teste 50 % em TUG');
  });

  it('⚠️ ligação e tensão do quadro NÃO declaradas: deduzidas dos circuitos, e dito', () => {
    const { m: m0, levelId, quadroId } = cena();
    const { m: m1, id: c1 } = circuito(m0, quadroId, { ligacao: 'FFF', tensaoV: 220 });
    const m = ponto(m1, levelId, 1000, 'TUE', 5000, c1);
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.ligacao).toBe('FFF');
    expect(q.ligacaoDeduzida).toBe(true);
    expect(q.tensaoV).toBe(220);
    expect(q.naoAvaliado.join(' ')).toMatch(/assumida FFF/);
  });

  it('⚠️ 6.2.7.1: a queda que se limita é alimentador + PIOR terminal, não o alimentador só', () => {
    // Alimentador longo (40 m) e um circuito longo estimado: cada um abaixo do seu limite,
    // a soma acima dos 5 % da origem.
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FN', tensaoV: 127, alimentadorM: 40 });
    const { m: m1, id: c1 } = circuito(m0, quadroId, { secaoMm2: 4 });
    const m = ponto(m1, levelId, 24000, 'TUG', 2400, c1); // 18,9 A a ~25,3 m (com desnível) em 4 mm²: ≈ 3,9 %
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.quedaAlimentadorPct!).toBeGreaterThan(0);
    expect(q.circuitos[0].quedaPct!).toBeLessThanOrEqual(4);
    expect(q.quedaTotalMaxPct!).toBeCloseTo(q.quedaAlimentadorPct! + q.circuitos[0].quedaPct!, 9);
    expect(q.quedaTotalMaxPct!).toBeGreaterThan(5);
    expect(q.achados.some((a) => a.referencia === '6.2.7.1')).toBe(true);
  });

  it('sem comprimento do alimentador, a queda da origem fica em "não avaliado" — nunca zero', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FN', tensaoV: 127 });
    const { m: m1, id: c1 } = circuito(m0, quadroId);
    const m = ponto(m1, levelId, 1000, 'TUG', 600, c1);
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.quedaAlimentadorPct).toBeNull();
    expect(q.quedaTotalMaxPct).toBeNull();
    expect(q.naoAvaliado.join(' ')).toMatch(/alimentador não declarado/);
  });
});

describe('balanceamento de fases (quadro trifásico)', () => {
  it('⚠️ só em FFF; FN com fase soma na fase; FN sem fase fica FORA e é dito; FFF divide por 3', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FFF', tensaoV: 220 });
    const { m: m1, id: cR } = circuito(m0, quadroId, { ligacao: 'FN', fase: 'R' });
    const { m: m2, id: cS } = circuito(m1, quadroId, { ligacao: 'FN', fase: 'S' });
    const { m: m3, id: cSem } = circuito(m2, quadroId, { ligacao: 'FN' });
    const { m: m4, id: c3f } = circuito(m3, quadroId, { ligacao: 'FFF', tensaoV: 220 });
    let m = m4;
    m = ponto(m, levelId, 1000, 'TUG', 1000, cR);
    m = ponto(m, levelId, 2000, 'TUG', 1000, cS);
    m = ponto(m, levelId, 3000, 'TUG', 5000, cSem);
    m = ponto(m, levelId, 4000, 'TUE', 3000, c3f);
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.fases).toEqual({ R: 2000, S: 2000, T: 1000 });
    expect(q.naoAvaliado.join(' ')).toMatch(/sem fase\): C3/);
    // (2000 − 1000) / 2000 = 50 % > 10 % → aviso.
    expect(q.desequilibrioPct).toBeCloseTo(50, 6);
    expect(q.achados.some((a) => a.nivel === 'AVISO' && /desequilibradas/.test(a.mensagem))).toBe(true);
  });

  it('quadro monofásico não tem balanceamento', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FN', tensaoV: 127 });
    const { m: m1, id: c1 } = circuito(m0, quadroId, { fase: 'R' });
    const m = ponto(m1, levelId, 1000, 'TUG', 600, c1);
    expect(preDimensionarQuadroCompleto(m, quadroId)!.fases).toBeNull();
  });

  it('equilibrado dentro do limite: cala', () => {
    const { m: m0, levelId, quadroId } = cena({ ligacao: 'FFF', tensaoV: 220 });
    let m = m0;
    for (const fase of ['R', 'S', 'T'] as const) {
      const { m: mm, id } = circuito(m, quadroId, { ligacao: 'FN', fase });
      m = ponto(mm, levelId, 1000 * (fase.charCodeAt(0) - 80), 'TUG', 1000, id);
    }
    const q = preDimensionarQuadroCompleto(m, quadroId)!;
    expect(q.desequilibrioPct).toBe(0);
    expect(q.achados.filter((a) => a.nivel === 'AVISO')).toEqual([]);
  });
});
