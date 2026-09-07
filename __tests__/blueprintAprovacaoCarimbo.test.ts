/**
 * O CARIMBO de aprovação no IFC (07/09/2026 — Etapa 5, fatia 2).
 *
 * ─── POR QUE O CARIMBO VAI EM CADA ELEMENTO ─────────────────────────────────
 *
 * Junto do `SnapshotHash`, e não solto num cabeçalho. É o PAR — o que foi
 * aprovado e quem aprovou — que tem valor: o status sozinho não diz sobre qual
 * desenho ele fala, e o arquivo circula por gente que não tem acesso ao nosso
 * sistema para conferir.
 *
 * ─── E POR QUE AUSÊNCIA É AUSÊNCIA ──────────────────────────────────────────
 *
 * Revisão que nunca passou por aprovação NÃO menciona o assunto. Emitir "não
 * aprovado" afirmaria que alguém olhou e recusou — que é uma informação
 * diferente, e falsa.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { COBERTURA_IFC, gerarIfc } from '../utils/blueprintIfc';

const OPC = {
  titulo: 'Casa',
  revisao: 7,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-07T12:00:00Z'),
};

const CARIMBO = {
  status: 'APROVADO',
  aprovadoPor: 'engenheira@alpa.com.br',
  aprovadoEm: '2026-09-07T15:30:00.000Z',
};

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  return applyCommand(base, {
    type: 'AddWall',
    levelId: base.levels[0].id,
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
  }).model;
}

describe('carimbo de aprovação · o que sai', () => {
  it('vai no Pset_OpuraPlanta, junto do hash da revisão', () => {
    const ifc = gerarIfc(casa(), { ...OPC, aprovacao: CARIMBO });
    expect(ifc).toContain("'ApprovalStatus'");
    expect(ifc).toContain("'APROVADO'");
    expect(ifc).toContain("'engenheira@alpa.com.br'");
    expect(ifc).toContain('2026-09-07T15:30:00.000Z');
    // O par: o carimbo e o hash do que foi carimbado, no mesmo lugar.
    expect(ifc).toContain("'SnapshotHash'");
  });

  it('aprovador ausente não vira campo vazio', () => {
    // Enviado para aprovação mas ainda não aprovado: o status existe, o
    // aprovador não. Um `ApprovedBy` em branco pareceria assinatura.
    const ifc = gerarIfc(casa(), {
      ...OPC,
      aprovacao: { status: 'PENDENTE', aprovadoPor: null, aprovadoEm: null },
    });
    expect(ifc).toContain("'PENDENTE'");
    expect(ifc).not.toContain("'ApprovedBy'");
    expect(ifc).not.toContain("'ApprovedAt'");
  });
});

describe('carimbo de aprovação · o que NÃO sai', () => {
  it('revisão sem aprovação não menciona o assunto', () => {
    // ⚠️ Não é "ApprovalStatus: NAO_APROVADO". Ausência é ausência: dizer que
    // não foi aprovado afirmaria que alguém olhou e recusou.
    const ifc = gerarIfc(casa(), OPC);
    expect(ifc).not.toContain("'ApprovalStatus'");
    expect(ifc).not.toContain("'ApprovedBy'");
  });

  it('a cobertura declarada explica as duas coisas', () => {
    const texto = COBERTURA_IFC.join(' ');
    expect(texto).toMatch(/APROVAÇÃO/);
    expect(texto).toMatch(/NÃO menciona o assunto/);
  });
});
