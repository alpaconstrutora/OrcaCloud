/**
 * F25 da casa automática (17/10/2026): o platô único da casa no terreno inclinado (decisão do usuário, 16/10/2026: "na
 * cota que equilibra corte e aterro sob a projeção; talude ou arrimo nas bordas acima de uma hipótese; escada/rampa na
 * entrada"). Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { point, type Point } from '../utils/blueprintKernel';
import { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, platoDaCasa } from '../utils/blueprintPlatoDaCasa';
import type { GradeDeElevacao } from '../utils/blueprintTopografia';

/** Terreno em rampa: 100 m na frente (y = 0), subindo `pctY` % para os fundos e `pctX` % para a direita. */
function rampa(pctY: number, pctX = 0): GradeDeElevacao {
  const esp = 500;
  const origem = point(-5000, -5000);
  const colunas = 47;
  const linhas = 83;
  const cotasM: number[] = [];
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c < colunas; c++) cotasM.push(100 + (pctY / 100) * ((origem.y + l * esp) / 1000) + (pctX / 100) * ((origem.x + c * esp) / 1000));
  return { origem, espacamentoMm: esp, colunas, linhas, cotasM };
}
// O lote 12 × 30 e a casa de 9 × 12,85 m no recuo de frente de 3 m (eixos das paredes).
const LOTE: Point[] = [point(0, 0), point(12000, 0), point(12000, 30000), point(0, 30000)];
const CASA: Point[] = [point(1500, 3000), point(10500, 3000), point(10500, 15850), point(1500, 15850)];
const RUA = point(6000, 0);

describe('platoDaCasa', () => {
  it('terreno plano: platô na cota do terreno, nada a cortar nem aterrar, nenhuma borda a tratar; o piso 15 cm acima vira rampa', () => {
    const r = platoDaCasa(rampa(0), 100, CASA, 100, LOTE, RUA, 2900);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumo.cotaDoPlatoM).toBeCloseTo(100, 3);
    expect(r.resumo.elevacaoDoTerreoMm).toBe(150);
    expect(r.resumo.corteM3).toBeLessThan(0.5);
    expect(r.resumo.aterroM3).toBeLessThan(0.5);
    expect(r.resumo.bordas.every((b) => b.solucao === 'NENHUMA')).toBe(true);
    expect(r.resumo.entrada).toMatchObject({ tipo: 'RAMPA', desnivelMm: 150, cabe: true });
    expect(r.resumo.entrada.comprimentoMm).toBe(Math.ceil(150 / 0.0833));
  });

  it('10 % para os fundos: a cota de EQUILÍBRIO sob a projeção (o terreno no meio dela); corte atrás, aterro na frente, volumes que se compensam', () => {
    const r = platoDaCasa(rampa(10), 100, CASA, 100, LOTE, RUA, 2900);
    if (!r.ok) throw new Error(r.motivo);
    // o meio da projeção (face externa) fica a y ≈ 9,425 m → 100,94 m
    expect(r.resumo.cotaDoPlatoM).toBeCloseTo(100 + 0.1 * 9.425, 1);
    expect(r.resumo.elevacaoDoTerreoMm).toBe(Math.round((r.resumo.cotaDoPlatoM - 100) * 1000) + 150);
    expect(Math.abs(r.resumo.corteM3 - r.resumo.aterroM3)).toBeLessThan(0.15 * Math.max(r.resumo.corteM3, r.resumo.aterroM3));
    const ladoDe = (yMedio: (y: number) => boolean) => r.resumo.bordas.find((b) => yMedio((b.a.y + b.b.y) / 2) && b.a.y === b.b.y)!;
    expect(ladoDe((y) => y < 5000).lado).toBe('ATERRO');
    expect(ladoDe((y) => y > 10000).lado).toBe('CORTE');
    // a casa acima da rua: a entrada SOBE, escada (a rampa de 1 m não cabe nos 2,9 m)
    expect(r.resumo.entrada.tipo).toBe('ESCADA');
    expect(r.resumo.entrada.desnivelMm).toBeGreaterThan(0);
    expect(r.resumo.entrada.espelhoMm).toBeLessThanOrEqual(HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO.espelhoMaximoMm);
  });

  it('talude ou muro: acima da altura da hipótese, muro; abaixo, talude — e o talude que sai do lote também vira muro', () => {
    const baixo = platoDaCasa(rampa(10), 100, CASA, 100, LOTE, RUA, 2900, { ...HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, alturaMaximaDoTaludeM: 0.3 });
    const alto = platoDaCasa(rampa(10), 100, CASA, 100, LOTE, RUA, 2900, { ...HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, alturaMaximaDoTaludeM: 5 });
    if (!baixo.ok || !alto.ok) throw new Error('sem platô');
    const frenteE = (x: typeof baixo) => x.resumo.bordas.find((b) => b.a.y === b.b.y && (b.a.y + b.b.y) / 2 < 5000)!;
    expect(frenteE(baixo).solucao).toBe('MURO');
    expect(frenteE(baixo).motivo).toMatch(/acima de 0,3 m/);
    // com 5 m de folga na altura, a frente tem talude (1,5 m de recuo dá para o pé dele)
    expect(frenteE(alto).solucao).toBe('TALUDE');
    // as laterais: a 0,5 m da divisa, o talude não cabe — muro, dito
    const laterais = alto.resumo.bordas.filter((b) => b.a.x === b.b.x && b.solucao !== 'NENHUMA');
    expect(laterais.length).toBeGreaterThan(0);
    for (const b of laterais) {
      expect(b.solucao).toBe('MURO');
      expect(b.motivo).toMatch(/sai do lote/);
    }
    expect(alto.resumo.murosComprimentoM).toBeGreaterThan(0);
  });

  it('terreno abaixo da rua (desce para os fundos): a entrada DESCE; e íngreme (25 %), a escada não cabe no recuo e é dito', () => {
    const desce = platoDaCasa(rampa(-10), 100, CASA, 100, LOTE, RUA, 2900);
    if (!desce.ok) throw new Error(desce.motivo);
    expect(desce.resumo.entrada.desnivelMm).toBeLessThan(0);
    const ingreme = platoDaCasa(rampa(25), 100, CASA, 100, LOTE, RUA, 2900);
    if (!ingreme.ok) throw new Error(ingreme.motivo);
    expect(ingreme.resumo.entrada.tipo).toBe('ESCADA');
    expect(ingreme.resumo.entrada.cabe).toBe(false);
  });

  it('sem a topografia sob a casa: recusa com o motivo', () => {
    const vazia: GradeDeElevacao = { ...rampa(0), cotasM: rampa(0).cotasM.map(() => null) };
    const r = platoDaCasa(vazia, 100, CASA, 100, LOTE, RUA, 2900);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/topografia não cobre/);
  });
});
