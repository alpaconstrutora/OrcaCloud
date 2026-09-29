/**
 * E5.1 — AS TABELAS DA NBR 8160 (29/09/2026): o DN pelo PAPEL do trecho —
 * ramal de descarga (aparelho), ramal de esgoto (tabela 5), tubo de queda
 * (tabela 6) e subcoletor (tabela 7, com a declividade, DN mínimo 100).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../utils/blueprintKernel';
import { dnDoRamalDeEsgoto, dnDoSubcoletor, dnDoTuboDeQueda } from '../utils/blueprintNbr8160';
import { esgotoTrechoATrecho, verificarDnDoEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { sobrado } from './fixtures/sobradoHidro';

describe('E5.1 — as tabelas', () => {
  it('tabela 5 — ramal de esgoto: 3 / 6 / 20 / 160 UHC em DN 40 / 50 / 75 / 100', () => {
    expect([1, 3, 4, 6, 7, 20, 21, 160].map(dnDoRamalDeEsgoto)).toEqual([40, 40, 50, 50, 75, 75, 100, 100]);
    // Acima de 160, a tabela 7 a 1 %: DN 100 leva até 180; 181 pede 150.
    expect(dnDoRamalDeEsgoto(161)).toBe(100);
    expect(dnDoRamalDeEsgoto(181)).toBe(150);
  });

  it('tabela 6 — tubo de queda: até 3 pavimentos pela UHC total; acima, também pela UHC num pavimento', () => {
    expect(dnDoTuboDeQueda(30, 30, 3)).toBe(75);
    expect(dnDoTuboDeQueda(31, 31, 3)).toBe(100);
    expect(dnDoTuboDeQueda(240, 240, 3)).toBe(100);
    expect(dnDoTuboDeQueda(241, 241, 3)).toBe(150);
    // 4 pavimentos: 60 UHC no total caberiam em DN 75 (70), mas 20 num só andar passa de 16.
    expect(dnDoTuboDeQueda(60, 15, 4)).toBe(75);
    expect(dnDoTuboDeQueda(60, 20, 4)).toBe(100);
    expect(dnDoTuboDeQueda(501, 90, 10)).toBe(150);
  });

  it('tabela 7 — subcoletor: pela declividade, nunca abaixo de 100; DN 100/150 não existem a 0,5 %', () => {
    expect(dnDoSubcoletor(5, 2)).toBe(100);
    expect(dnDoSubcoletor(180, 1)).toBe(100);
    expect(dnDoSubcoletor(181, 1)).toBe(150);
    expect(dnDoSubcoletor(216, 2)).toBe(100);
    expect(dnDoSubcoletor(250, 4)).toBe(100);
    expect(dnDoSubcoletor(1400, 0.5)).toBe(200);
    // A 0,7 %: a coluna de 0,5 % — que para DN 100/150 cai na de 1 % (a declividade é acusada à parte).
    expect(dnDoSubcoletor(100, 0.7)).toBe(100);
    // Vertical: a coluna de 4 %.
    expect(dnDoSubcoletor(250, null)).toBe(100);
    expect(dnDoSubcoletor(251, null)).toBe(150);
  });
});

describe('E5.1 — o papel de cada trecho no sobrado', () => {
  const m = sobrado(true, { cotaDaCaixaMm: 4500 });
  const calc = esgotoTrechoATrecho(m);
  const porId = new Map(m.trechos!.map((t) => [t.id, t]));

  it('TQ é tubo de queda; o que desce de um aparelho é ramal de descarga; o que junta o banheiro é ramal de esgoto', () => {
    expect(calc.filter((c) => c.rotulo === 'TQ').every((c) => c.papel === 'TUBO_DE_QUEDA')).toBe(true);
    const descargas = calc.filter((c) => c.papel === 'RAMAL_DE_DESCARGA');
    expect(descargas.length).toBeGreaterThan(0);
    expect(descargas.every((c) => c.uhc <= 6)).toBe(true);
    expect(calc.some((c) => c.papel === 'RAMAL_DE_ESGOTO')).toBe(true);
  });

  it('o que recebe o TQ ou chega à CI é subcoletor — DN ≥ 100', () => {
    const sub = calc.filter((c) => c.papel === 'SUBCOLETOR');
    expect(sub.length).toBeGreaterThan(0);
    for (const c of sub) expect(c.dnNecessarioMm).toBeGreaterThanOrEqual(100);
    const ci = m.terminais!.find((t) => t.tipoHidraulico === 'CAIXA_INSPECAO')!;
    const chegaNaCI = calc.filter((c) => {
      const t = porId.get(c.trechoId)!;
      return [t.a, t.b].some((p) => p.x === ci.at.x && p.y === ci.at.y);
    });
    expect(chegaNaCI.every((c) => c.papel === 'SUBCOLETOR')).toBe(true);
    // O lançamento automático já sai de acordo com as tabelas.
    expect(verificarDnDoEsgoto(m)).toEqual([]);
  });

  it('subcoletor reduzido à mão para DN 75: a verificação pede 100 (tabela 7)', () => {
    const sub = calc.find((c) => c.papel === 'SUBCOLETOR' && c.declividadePct != null)!;
    const reduzido = applyCommand(m, { type: 'SetTrechoProps', trechoId: sub.trechoId, bitolaMm: 75 }).model;
    const v = verificarDnDoEsgoto(reduzido).find((x) => x.trechoId === sub.trechoId)!;
    expect(v).toMatchObject({ tipo: 'MENOR', dnAtualMm: 75, dnNecessarioMm: 100 });
  });
});
