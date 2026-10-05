/**
 * MEMORIAL DE CARGA TÉRMICA (04/10/2026, E2.4): os blocos dizem o que a tela
 * diz — mesmos números — e avisam CONFERIR enquanto houver hipótese.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoEstudo } from '../utils/blueprintCargaTermica';
import { memorialDeCalculoClimatizacao, memorialDescritivoClimatizacao } from '../utils/blueprintMemorialClimatizacao';

function casa() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
  ]).model;
  return m;
}
const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const ctx = { nomeDoEstudo: 'Casa', geradoEm: '2026-10-04T12:00:00Z', nomeDoNivel: () => 'Térreo' };
const texto = (b: ReturnType<typeof memorialDeCalculoClimatizacao>) => b.map((x) => (x.tipo === 'tabela' ? [x.cabecalho.join(' | '), ...x.linhas.map((l) => l.join(' | '))].join('\n') : x.texto)).join('\n');

describe('memorial de carga térmica', () => {
  it('cálculo: 4 seções, CONFERIR no topo, a Sala com as parcelas e o mesmo total da tela; a Cozinha fora', () => {
    const m = casa();
    const niveis = cargaTermicaDoEstudo(m, hip);
    const sala = niveis[0].ambientes.find((a) => a.nome === 'Sala')!;
    const b = memorialDeCalculoClimatizacao(niveis, hip, ctx);
    expect(b.filter((x) => x.tipo === 'secao').map((x) => x.texto)).toEqual(['1. Condições de projeto', '2. Hipóteses do motor', '3. Carga por ambiente', '4. Resumo e conferência']);
    const t = texto(b);
    expect(t).toMatch(/CONFERIR NA NORMA/);
    expect(t).toMatch(/TBS externa \| 34,0 °C \| declarada/);
    expect(t).toMatch(new RegExp(`TOTAL \\| ${sala.sensivelW.toLocaleString('pt-BR')} \\| ${sala.latenteW.toLocaleString('pt-BR')} \\| ${sala.totalW.toLocaleString('pt-BR')} W = ${sala.totalBtuH.toLocaleString('pt-BR')} BTU/h`));
    expect(t).toMatch(/janela S · insolação \*/);
    expect(t).not.toMatch(/\nCozinha — /);
    expect(t).toMatch(/Temperatura externa de projeto \(TBS\) \| ok/);
  });

  it('descritivo: objeto com o total, normas, tabela de ambientes com teto/piso e o que fica a cargo do responsável', () => {
    const m = casa();
    const niveis = cargaTermicaDoEstudo(m, hip);
    const t = texto(memorialDescritivoClimatizacao(niveis, hip, ctx));
    expect(t).toMatch(new RegExp(`Total: ${niveis[0].totalW.toLocaleString('pt-BR')} W`));
    expect(t).toMatch(/NBR 16655-3/);
    expect(t).toMatch(/Sala \| Térreo \| .* \| laje exposta \| sobre o solo \|/);
    expect(t).toMatch(/a cargo do responsável/);
  });

  it('sem ambiente climatizado o cálculo diz isso em vez de tabela vazia', () => {
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = texto(memorialDeCalculoClimatizacao(cargaTermicaDoEstudo(a, hip), hip, ctx));
    expect(t).toMatch(/Nenhum ambiente climatizado no desenho/);
  });
});
