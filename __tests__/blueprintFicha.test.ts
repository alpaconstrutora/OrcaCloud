/**
 * Ficha do elemento e calculados nas saídas (18/09/2026, E1.5).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, KERNEL_VERSION } from '../utils/blueprintKernel';
import { fichaComoTexto, fichaDoElemento } from '../utils/blueprintFicha';
import { parametrosCalculadosDoModelo } from '../utils/blueprintFormulas';
import { conferirRestricoes } from '../utils/blueprintRestricoes';
import { linhasDeParametros } from '../utils/blueprintPlanilha';
import { gerarIfc } from '../utils/blueprintIfc';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall' as const, levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  const frente = m.walls[0];
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(3000, 2000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, rotulo: 'P1' },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1000, 2000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800 },
    { type: 'AddEixo', a: point(-500, 1800), b: point(6500, 1800), nome: 'B' },
  ]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
  const pilar = m.structures[0];
  m = applyBatch(m, [
    { type: 'SetParametros', familia: 'structural', id: pilar.id, valores: { custo_m3: 1000 } },
    { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'structural', id: pilar.id }, referencia: { familia: 'eixo', id: m.eixos[0].id } },
  ]).model;
  return { m, t, porta: m.openings[0], pilar: m.structures[0] };
}

const DEFS = [
  { chave: 'custo_m3', nome: 'Custo do concreto', unidade: 'R$/m³', formula: '', familia: 'structural' as const },
  { chave: 'custo', nome: 'Custo da peça', unidade: 'R$', formula: 'arred(volume * custo_m3, 2)', familia: 'structural' as const },
];

describe('fichaDoElemento', () => {
  it('porta: hospedeira, ambientes dos dois lados, acessibilidade e pavimento', () => {
    const { m, porta } = casa();
    const f = fichaDoElemento(m, porta.id)!;
    expect(f.titulo).toMatch(/^Porta V-/);
    const geo = Object.fromEntries(f.secoes.find((s) => s.titulo === 'Geometria')!.linhas.map((l) => [l.rotulo, l.valor]));
    expect(geo['Largura × altura']).toBe('900 × 2100 mm');
    expect(geo['Parede hospedeira']).toMatch(/a 1000 mm da ponta/);
    expect(geo['Liga']).toMatch(/Sala ↔ exterior|exterior ↔ Sala/);
    expect(geo['Acessível (NBR 9050, vão ≥ 800)']).toBe('sim');
    expect(geo['Pavimento']).toBe('Térreo · pé-direito 2,80 m');
  });

  it('pilar: tipo e peças iguais, parâmetro gravado + calculado (ƒ), custo e restrição violada; e o texto copiável', () => {
    const { m, pilar } = casa();
    const f = fichaDoElemento(m, pilar.id, { definicoes: DEFS, conferencias: conferirRestricoes(m), custo: { totalBRL: 224, linhas: 1 } })!;
    expect(f.titulo).toBe('Pilar P1');
    expect(f.secoes.map((s) => s.titulo)).toEqual(['Geometria', 'Tipo', 'Parâmetros', 'Custo (orçamento)', 'Restrições']);
    expect(f.secoes[1].linhas[0]).toEqual({ rotulo: 'Peças iguais no desenho', valor: '2' });
    const param = f.secoes[2].linhas;
    expect(param).toEqual([
      { rotulo: 'Custo do concreto (R$/m³)', valor: '1000' },
      { rotulo: 'Custo da peça (R$)', valor: '224', marca: 'formula' },
    ]);
    expect(f.secoes[4].linhas[0]).toMatchObject({ rotulo: 'Sobre o eixo eixo B', valor: 'violada — 200 mm', marca: 'violada' });
    const texto = fichaComoTexto(f);
    expect(texto).toContain('Pilar P1 (C-');
    expect(texto).toContain('PARÂMETROS');
    expect(texto).toContain('Custo da peça (R$): 224 (fórmula)');
    expect(fichaDoElemento(m, 'nada')).toBeNull();
  });
});

describe('calculados nas saídas', () => {
  it('parametrosCalculadosDoModelo só traz o que avaliou; a planilha marca a origem; o IFC mescla no Pset', () => {
    const { m, pilar } = casa();
    const calc = parametrosCalculadosDoModelo(m, DEFS);
    expect(calc.get(pilar.uid)).toEqual({ custo: 224 });
    // O segundo pilar não tem custo_m3 gravado: a fórmula falha e ele fica de fora.
    expect(calc.has(m.structures[1].uid)).toBe(false);
    const linhas = linhasDeParametros(m, calc);
    expect(linhas.map((l) => `${l.chave}:${l.origem}`)).toEqual(['custo_m3:gravado', 'custo:formula']);
    const ifc = gerarIfc(m, { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION, parametrosCalculadosPorUid: calc } as never);
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('custo',$,IFCREAL(224.),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('custo_m3',$,IFCREAL(1000.),$)");
  });
});
