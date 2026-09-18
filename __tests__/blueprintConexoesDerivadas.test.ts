/**
 * CONEXÕES DERIVADAS (18/09/2026, F2 da hidráulica): joelho, tê, luva e
 * redução saem dos encontros de trechos; a manual força a peça.
 */
import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  computeQuantities,
  conexoesDerivadas,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type DisciplinaDeRede,
} from '../utils/blueprintKernel';
import { gerarLancamentos, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

function base(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const AF = 'AGUA_FRIA' as const;
const tr = (
  levelId: string,
  ax: number, ay: number, bx: number, by: number,
  bitola = 25, cotaA = 2200, cotaB = 2200, disciplina: DisciplinaDeRede = AF,
): Command => ({ type: 'AddTrecho', levelId, disciplina, a: point(ax, ay), b: point(bx, by), cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm: bitola });

describe('conexões derivadas', () => {
  it('L de 25 mm = um joelho 90 no canto; as pontas soltas são avisos, não peças', () => {
    const { m, t } = base();
    const r = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 3000, 2000)]).model);
    expect(r.conexoes).toHaveLength(1);
    expect(r.conexoes[0]).toMatchObject({ tipo: 'JOELHO_90', bitolaMm: 25, origem: 'DERIVADA', no: { x: 3000, y: 0 } });
    expect(r.pontasAbertas).toHaveLength(2);
  });

  it('três trechos num nó = tê; a 45° = joelho 45; ângulo torto = joelho 90 com aviso', () => {
    const { m, t } = base();
    const te = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 6000, 0), tr(t, 3000, 0, 3000, 2000)]).model);
    expect(te.conexoes.map((c) => c.tipo)).toEqual(['TE']);
    const j45 = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 5000, 2000)]).model);
    expect(j45.conexoes.map((c) => c.tipo)).toEqual(['JOELHO_45']);
    const torto = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 5000, 1000)]).model);
    expect(torto.conexoes[0]).toMatchObject({ tipo: 'JOELHO_90' });
    expect(torto.conexoes[0].aviso).toMatch(/fora de 45\/90/);
  });

  it('colinear: mesma bitola = luva, bitola diferente = redução (25→20); com registro no nó, nada', () => {
    const { m, t } = base();
    const luva = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 6000, 0)]).model);
    expect(luva.conexoes.map((c) => c.tipo)).toEqual(['LUVA']);
    const red = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0, 25), tr(t, 3000, 0, 6000, 0, 20)]).model);
    expect(red.conexoes[0]).toMatchObject({ tipo: 'REDUCAO', bitolaMm: 25, paraMm: 20 });
    const comRegistro = applyBatch(m, [
      tr(t, 0, 0, 3000, 0),
      tr(t, 3000, 0, 6000, 0),
      { type: 'AddTerminal', levelId: t, disciplina: AF, tipo: 'Registro', at: point(3000, 0), cotaMm: 2200, tipoHidraulico: 'REGISTRO_GAVETA' },
    ]).model;
    expect(conexoesDerivadas(comRegistro).conexoes).toHaveLength(0);
  });

  it('prumada + horizontal = joelho 90 (o ângulo é 3D); esgoto com caimento segue colinear', () => {
    const { m, t } = base();
    const prum = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 3000, 0, 25, 2200, 1100)]).model);
    expect(prum.conexoes.map((c) => c.tipo)).toEqual(['JOELHO_90']);
    const esgoto = conexoesDerivadas(
      applyBatch(m, [tr(t, 0, 0, 3000, 0, 100, -150, -210, 'ESGOTO'), tr(t, 3000, 0, 6000, 0, 100, -210, -270, 'ESGOTO')]).model,
    );
    expect(esgoto.conexoes.map((c) => c.tipo)).toEqual(['LUVA']);
  });

  it('água e esgoto que se cruzam no mesmo ponto NÃO se ligam', () => {
    const { m, t } = base();
    const r = conexoesDerivadas(applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 6000, 0, 100, 2200, 2200, 'ESGOTO')]).model);
    expect(r.conexoes).toHaveLength(0);
  });

  it('conexão MANUAL no nó suprime a derivada e conta como manual; no meio do trecho conta com a bitola dele', () => {
    const { m, t } = base();
    const forcada = applyBatch(m, [
      tr(t, 0, 0, 3000, 0),
      tr(t, 3000, 0, 3000, 2000),
      { type: 'AddTerminal', levelId: t, disciplina: AF, tipo: 'Joelho 45°', at: point(3000, 0), cotaMm: 2200, tipoHidraulico: 'CONEXAO_JOELHO_45' },
    ]).model;
    const r = conexoesDerivadas(forcada);
    expect(r.conexoes).toHaveLength(1);
    expect(r.conexoes[0]).toMatchObject({ tipo: 'JOELHO_45', origem: 'MANUAL' });

    const noMeio = applyBatch(m, [
      tr(t, 0, 0, 3000, 0),
      { type: 'AddTerminal', levelId: t, disciplina: AF, tipo: 'Luva', at: point(1500, 0), cotaMm: 2200, tipoHidraulico: 'CONEXAO_LUVA' },
    ]).model;
    const r2 = conexoesDerivadas(noMeio);
    expect(r2.conexoes).toHaveLength(1);
    expect(r2.conexoes[0]).toMatchObject({ tipo: 'LUVA', origem: 'MANUAL', bitolaMm: 25 });
    expect(r2.conexoes[0].aviso).toBeUndefined();
  });

  it('determinístico: a ordem dos trechos não muda o resultado', () => {
    const { m, t } = base();
    const cmds = [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 6000, 0), tr(t, 3000, 0, 3000, 2000), tr(t, 6000, 0, 6000, -1500)];
    const a = conexoesDerivadas(applyBatch(m, cmds).model);
    const b = conexoesDerivadas(applyBatch(m, [...cmds].reverse()).model);
    const resumo = (r: typeof a) => r.conexoes.map((c) => `${c.tipo}@${c.no.x},${c.no.y}`).sort();
    expect(resumo(a)).toEqual(resumo(b));
    expect(resumo(a)).toEqual(['JOELHO_90@6000,0', 'TE@3000,0']);
  });

  it('a prumada que atravessa a LAJE encontra o ramal do andar de baixo num nó só', () => {
    const { m, t } = base();
    const comSuperior = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const s = comSuperior.levels[1].id;
    const r = conexoesDerivadas(
      applyBatch(comSuperior, [
        tr(t, 0, 0, 3000, 0, 25, 2800, 2800), // ramal no TETO do térreo
        tr(s, 3000, 0, 3000, 0, 25, 0, 1100), // prumada do piso do superior para cima
      ]).model,
    );
    expect(r.conexoes.map((c) => c.tipo)).toEqual(['JOELHO_90']);
  });

  it('o quantitativo agrupa por tipo × bitola e o orçamento conta', () => {
    const { m, t } = base();
    const q = computeQuantities(
      applyBatch(m, [tr(t, 0, 0, 3000, 0), tr(t, 3000, 0, 3000, 2000), tr(t, 3000, 2000, 6000, 2000), tr(t, 6000, 2000, 9000, 2000, 20)]).model,
      POLITICA_PADRAO,
    );
    expect(q.totais.porConexao).toEqual([
      expect.objectContaining({ tipo: 'JOELHO_90', bitolaMm: 25, quantidade: 2, derivadas: 2 }),
      expect.objectContaining({ tipo: 'REDUCAO', bitolaMm: 25, paraMm: 20, quantidade: 1 }),
    ]);
    const item: SinapiItem = { code: '1', description: 'Joelho', unit: 'UN', price: 5, type: SinapiType.COMPOSITION, category: 'Material' };
    const mapa: MapeamentoOrcamento = { id: 'm', organization_id: 'o', medida: 'CONTAGEM_CONEXOES', item_code: '1', phase: 'Instalações', budget_group: 'Hidráulica', agrupamento: 'POR_ELEMENTO', filtro_ambiente: ['Joelho'], active: true };
    const res: MapeamentoResolvido[] = [{ mapeamento: mapa, item }];
    const r = gerarLancamentos(q, res, { studyId: 'e', studyName: 'c', snapshotId: 's', snapshotHash: 'h', revision: 1 });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].quantity).toBe(2);
  });
});
