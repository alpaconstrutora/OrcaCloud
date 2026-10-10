/**
 * CLIMATIZAÇÃO E11 (10/10/2026): o GERADOR — um lote, um Ctrl+Z, ids
 * determinísticos e o relatório do que ele não decidiu. A lei (molde do PPCI):
 * reaplicar o lote no original recria os MESMOS ids e o MESMO desenho; mexer no
 * desenho trava o lançamento; gerar de novo sobre o resultado dá o mesmo desenho
 * (os planejadores refazem as próprias sugestões, não acumulam).
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { HIPOTESES_CIRCUITOS_PADRAO } from '../utils/blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { conferirPlanoDaClimatizacao, gerarClimatizacao, relatorioDaClimatizacao, type ContextoDoGeradorDeClimatizacao } from '../utils/blueprintGeradorClimatizacao';

vi.setConfig({ testTimeout: 30_000 });

const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const cx: ContextoDoGeradorDeClimatizacao = { modelos, circuitos: { hip: HIPOTESES_CIRCUITOS_PADRAO, eletricas: HIPOTESES_PADRAO } };

/** Sala 4 × 4 (climatizada pelo nome) e Cozinha ao lado; porta na divisa, janela ao sul. */
function casa(): { m: BlueprintModel; t: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  const divisa = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: divisa.id, kind: 'door', offsetMm: 1500, widthMm: 800, heightMm: 2100, sillMm: 0 } as never,
    { type: 'AddOpening', wallId: sul.id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
  ]).model;
  return { m, t };
}
const comQuadro = (m: BlueprintModel, t: string) => applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(6000, 2000), cotaMm: 1600 } as Command).model;
const situacao = (p: ReturnType<typeof gerarClimatizacao>, id: string) => p.etapas.find((e) => e.id === id)!;

/** O desenho da climatização como conjunto comparável (sem ids). */
function assinatura(m: BlueprintModel): string[] {
  return [
    ...(m.terminais ?? []).map((t) => `T|${t.disciplina}|${t.tipoHidraulico ?? t.tipoEletrico ?? t.tipo}|${t.at.x},${t.at.y}|${t.cotaMm}`),
    ...(m.trechos ?? []).map((t) => `R|${t.disciplina}|${t.a.x},${t.a.y}|${t.b.x},${t.b.y}|${t.cotaAMm}|${t.cotaBMm}|${t.bitolaMm}`),
  ].sort();
}

describe('E11 · o gerador de climatização', () => {
  it('encadeia carga → split → linha e dreno → circuito; VRF e dutos não se aplicam; quantitativo e orçamento calculam', () => {
    const { m, t } = casa();
    const plano = gerarClimatizacao(comQuadro(m, t), hip, cx);
    expect(situacao(plano, 'CARGA')).toMatchObject({ situacao: 'CALCULOU' });
    expect(situacao(plano, 'CARGA').nota).toMatch(/1 ambiente\(s\) climatizado\(s\)/);
    expect(situacao(plano, 'EQUIPAMENTOS')).toMatchObject({ situacao: 'LANCOU' });
    expect(situacao(plano, 'EQUIPAMENTOS').comandos).toBeGreaterThan(0);
    expect(situacao(plano, 'LINHA')).toMatchObject({ situacao: 'LANCOU' });
    expect(situacao(plano, 'VRF').situacao).toBe('NAO_EXIGIDA');
    expect(situacao(plano, 'DUTOS').situacao).toBe('NAO_EXIGIDA');
    expect(situacao(plano, 'CIRCUITOS')).toMatchObject({ situacao: 'LANCOU' });
    expect(situacao(plano, 'QUANTITATIVO').situacao).toBe('CALCULOU');
    expect(situacao(plano, 'ORCAMENTO').nota).toMatch(/lance pelo painel Orçamento/);
    const r = plano.resultado;
    const evap = (r.terminais ?? []).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const cond = (r.terminais ?? []).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const ac = (r.terminais ?? []).find((x) => x.tipoEletrico === 'AR_CONDICIONADO')!;
    expect(evap.condensadoraId).toBe(cond.id);
    expect((r.trechos ?? []).some((x) => x.disciplina === 'FRIGORIGENA')).toBe(true);
    expect((r.trechos ?? []).some((x) => x.disciplina === 'DRENO_AC')).toBe(true);
    expect(ac.circuitoId).toBeTruthy();
    expect(plano.pendencias.some((p) => p.grupo === 'CONFERIR')).toBe(true);
  });

  it('⚠️ LEI: reaplicar o lote no original recria os mesmos ids e o mesmo desenho; mexer no desenho trava o lançamento', () => {
    const { m, t } = casa();
    const original = comQuadro(m, t);
    const plano = gerarClimatizacao(original, hip, cx);
    expect(conferirPlanoDaClimatizacao(original, plano)).toEqual({ ok: true });
    expect(snapshotHash(applyBatch(original, plano.comandos).model)).toBe(snapshotHash(plano.resultado));
    // Um ponto novo desloca a numeração dos pontos: o lote recriaria ids diferentes (uma parede longe não desloca — e não trava).
    const mexido = applyCommand(original, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(6000, 1000), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 } as Command).model;
    expect(conferirPlanoDaClimatizacao(mexido, plano).ok).toBe(false);
  });

  it('⚠️ LEI: gerar de novo sobre o resultado dá o MESMO desenho (refaz as sugestões, não acumula)', () => {
    const { m, t } = casa();
    const primeiro = gerarClimatizacao(comQuadro(m, t), hip, cx);
    const segundo = gerarClimatizacao(primeiro.resultado, hip, cx);
    expect(assinatura(segundo.resultado)).toEqual(assinatura(primeiro.resultado));
    expect((segundo.resultado.terminais ?? []).filter((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')).toHaveLength(1);
  });

  it('circuito só quando não leva junto o que o gerador não criou: com uma TUG solta no pavimento, o ar fica sem circuito e o relatório diz', () => {
    const { m, t } = casa();
    const comTug = applyCommand(comQuadro(m, t), { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(6000, 1000), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 } as Command).model;
    const plano = gerarClimatizacao(comTug, hip, cx);
    const tug = (plano.resultado.terminais ?? []).find((x) => x.tipoEletrico === 'TUG')!;
    const ac = (plano.resultado.terminais ?? []).find((x) => x.tipoEletrico === 'AR_CONDICIONADO')!;
    expect(tug.circuitoId ?? null).toBeNull();
    expect(ac.circuitoId ?? null).toBeNull();
    expect(plano.pendencias).toContainEqual({ grupo: 'NAO_DECIDIDO', texto: expect.stringMatching(/1 ponto\(s\) de ar-condicionado sem circuito — há outros 1 ponto\(s\) solto\(s\)/) });
  });

  it('sem quadro no desenho: o circuito fica no relatório', () => {
    const { m } = casa();
    const plano = gerarClimatizacao(m, hip, cx);
    expect(plano.pendencias).toContainEqual({ grupo: 'NAO_DECIDIDO', texto: expect.stringMatching(/não há quadro no desenho/) });
  });

  it('sem ambiente climatizado: nada a lançar, e a premissa que falta é dita; catálogo vazio: o equipamento não roda', () => {
    const { m, t } = casa();
    const semClima = applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: 'Depósito' }) as Command)).model;
    const vazio = gerarClimatizacao(semClima, hip, cx);
    expect(vazio.comandos).toEqual([]);
    expect(vazio.pendencias.map((p) => p.grupo)).toContain('PREMISSA');
    expect(conferirPlanoDaClimatizacao(semClima, vazio)).toMatchObject({ ok: false });

    const semCatalogo = gerarClimatizacao(comQuadro(m, t), hip, { ...cx, modelos: [] });
    expect(situacao(semCatalogo, 'EQUIPAMENTOS').situacao).toBe('NAO_RODOU');
    expect(semCatalogo.pendencias).toContainEqual({ grupo: 'PREMISSA', texto: expect.stringMatching(/Catálogo da organização sem modelo de evaporadora/) });
  });

  it('o relatório traz as etapas e os grupos de pendência, no formato dos memoriais', () => {
    const { m, t } = casa();
    const plano = gerarClimatizacao(comQuadro(m, t), hip, cx);
    const blocos = relatorioDaClimatizacao(plano, { nomeDoEstudo: 'Casa', geradoEm: '2026-10-10T12:00:00Z' });
    expect(blocos[0]).toEqual({ tipo: 'titulo', texto: 'Gerador de climatização — relatório' });
    const tabela = blocos.find((b) => b.tipo === 'tabela') as { linhas: string[][] };
    expect(tabela.linhas.map((l) => l[0])).toContain('Carga térmica por ambiente');
    expect(blocos.some((b) => b.tipo === 'secao' && /CONFERIR/.test((b as { texto: string }).texto))).toBe(true);
  });
});
