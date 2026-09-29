/**
 * E8.1 — AQUECEDOR DE PASSAGEM (29/09/2026): a vazão simultânea da rede quente
 * pelos pesos (Q = 0,3·√ΣP), a nominal que ela pede com o ΔT (Q·ΔT/20), o modelo
 * da lista, a pressão na entrada; a conferência, o memorial e as premissas.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, point } from '../utils/blueprintKernel';
import { CAPACIDADES_DE_AQUECEDOR_LMIN, HIPOTESES_AQUECEDOR_PADRAO, dimensionarAquecedores } from '../utils/blueprintAquecedor';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro, memorialDescritivoHidro, type BlocoDoMemorial } from '../utils/blueprintMemorialHidro';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
const hip = HIPOTESES_AQUECEDOR_PADRAO;
const casa = () => sobrado(true, { cotaDaCaixaMm: 4500, aguaQuente: true });
const dim = (m = casa(), h = hip) => dimensionarAquecedores(m, h, pressoesDoModelo(m));
const textos = (b: BlocoDoMemorial[]) => b.map((x) => ('texto' in x ? x.texto : 'cabecalho' in x ? x.cabecalho.join('|') + '\n' + x.linhas.map((l) => l.join('|')).join('\n') : '')).join('\n');

describe('E8.1 — o dimensionamento', () => {
  it('sobrado: 4 pontos quentes (chuveiro 0,4 + lavatório 0,3 por andar), ΣP 1,4 → 21,3 L/min; ΔT 20 → aquecedor de 27 L/min; entrada acima de 20 kPa', () => {
    const [a] = dim();
    expect(a).toMatchObject({ pontos: 4, deltaTC: 20, modeloLMin: 27, pressaoOk: true, atende: true, avisos: [] });
    expect(a.somaDePesos).toBeCloseTo(1.4, 9);
    expect(a.vazaoLMin).toBeCloseTo(0.3 * Math.sqrt(1.4) * 60, 9);
    expect(a.capacidadeNecessariaLMin).toBeCloseTo(a.vazaoLMin, 9);
    expect(a.pressaoNaEntradaKpa!).toBeGreaterThan(20);
  });

  it('ΔT 30 (15 → 45 °C): a nominal sobe 50 % e o modelo vai a 33 L/min', () => {
    const [a] = dim(casa(), { ...hip, temperaturaDeUsoC: 45, temperaturaDaAguaFriaC: 15 });
    expect(a.capacidadeNecessariaLMin).toBeCloseTo(a.vazaoLMin * 1.5, 9);
    expect(a.modeloLMin).toBe(33);
  });

  it('ΔT 50: passa da lista — nenhum modelo, com o aviso; pressão mínima acima da entrada: não atende', () => {
    const [a] = dim(casa(), { ...hip, temperaturaDeUsoC: 60, temperaturaDaAguaFriaC: 10 });
    expect(a.modeloLMin).toBeNull();
    expect(a.avisos[0]).toMatch(/passa do maior aquecedor de passagem da lista/);
    expect(a.capacidadeNecessariaLMin).toBeGreaterThan(CAPACIDADES_DE_AQUECEDOR_LMIN[CAPACIDADES_DE_AQUECEDOR_LMIN.length - 1]);
    const [b] = dim(casa(), { ...hip, pressaoMinimaKpa: 80 });
    expect(b).toMatchObject({ pressaoOk: false, atende: false });
  });

  it('sem aquecedor, nada; um segundo aquecedor sem rede nenhuma fica sem pontos (os pontos são de quem a rede alcança)', () => {
    expect(dim(sobrado(true))).toEqual([]);
    const m0 = casa();
    const m = applyCommand(m0, { type: 'AddTerminal', levelId: m0.levels[1].id, disciplina: 'AGUA_QUENTE', tipo: 'Aquecedor 2', at: point(4425, 1500), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' }).model;
    const [, segundo] = dim(m);
    expect(segundo).toMatchObject({ pontos: 0, atende: false });
    expect(segundo.avisos).toContain('Nenhum ponto de água quente para este aquecedor.');
  });
});

describe('E8.1 — conferência, memoriais e premissas', () => {
  it('a conferência NBR 5626 tem o aquecedor, com a nominal e a entrada', () => {
    const item = verificacoesHidro(casa(), HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.find((v) => v.item === 'Aquecedor de passagem: capacidade e pressão')!;
    expect(item.atende).toBe(true);
    expect(item.obtido).toMatch(/^27 L\/min; entrada \d+,\d kPa$/);
  });

  it('memorial de cálculo com a seção do aquecedor; descritivo com o modelo e a temperatura', () => {
    const ctx = { nomeDoEstudo: 'Sobrado', geradoEm: '2026-09-29T12:00:00Z' };
    const calc = textos(memorialDeCalculoHidro(casa(), HIPOTESES_HIDRO_PADRAO, ctx));
    expect(calc).toContain('Aquecedor de passagem');
    expect(calc).toMatch(/AQ1 \(Térreo\)\|4\|1,40\|21,3\|20\|21,3\|27 L\/min\|\d+,\d\|Atende/);
    const desc = textos(memorialDescritivoHidro(casa(), HIPOTESES_HIDRO_PADRAO, ctx));
    expect(desc).toMatch(/de passagem, capacidade nominal de 27 L\/min a ΔT 20 °C/);
  });

  it('premissas gravadas: padrão e números', () => {
    expect(hipotesesHidroDaColuna({}).aquecedor).toEqual(HIPOTESES_AQUECEDOR_PADRAO);
    expect(hipotesesHidroDaColuna({ aquecedor: { temperaturaDeUsoC: 45, pressaoMinimaKpa: 'x' } }).aquecedor).toEqual({ ...HIPOTESES_AQUECEDOR_PADRAO, temperaturaDeUsoC: 45 });
  });
});
