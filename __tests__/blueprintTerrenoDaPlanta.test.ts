/**
 * Empreendimento › Terreno lê o lote da planta vinculada (plano docs/planos/2026-10-21-terreno-ficha-planta.md,
 * item 3): o rascunho do ramo principal — o mesmo desenho que "Levar à ficha" usa —, com a blindagem
 * de organização e o motivo dito quando não há o que mostrar.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';

const estado = vi.hoisted(() => ({ study: null as null | Record<string, unknown>, model: null as unknown }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: estado.study, error: null }) };
      return q;
    },
  },
}));
vi.mock('../services/blueprintService', () => ({
  listBranches: vi.fn(async () => [{ id: 'ramo-1', principal: true }]),
  ramoPrincipal: vi.fn((r: { id: string }[]) => r[0] ?? null),
  loadBranchModel: vi.fn(async () => estado.model),
}));

import { terrenoDaPlantaVinculada } from '../services/blueprintTerrenoDaPlanta';
import { loadBranchModel } from '../services/blueprintService';

function loteRetangular(fechar = true): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = [{ x: 0, y: 0 }, { x: 12_000, y: 0 }, { x: 12_000, y: 30_000 }, { x: 0, y: 30_000 }];
  const papeis = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'];
  const cmds: Command[] = [];
  for (let i = 0; i < (fechar ? 4 : 3); i++) {
    cmds.push({ type: 'AddBoundary', levelId, a: point(c[i].x, c[i].y), b: point(c[(i + 1) % 4].x, c[(i + 1) % 4].y), kind: 'TERRENO', papel: papeis[i] } as Command);
  }
  return applyBatch(base, cmds).model;
}

const EMP = { id: 'emp-1', organization_id: 'org-1', blueprint_study_id: 'planta-1' };

describe('terrenoDaPlantaVinculada', () => {
  beforeEach(() => {
    estado.study = { id: 'planta-1', name: 'Garden', organization_id: 'org-1', status: 'RASCUNHO' };
    estado.model = loteRetangular();
    vi.mocked(loadBranchModel).mockClear();
  });

  it('lote fechado no rascunho do ramo principal: as medidas da ficha', async () => {
    const r = await terrenoDaPlantaVinculada(EMP);
    expect(r).toMatchObject({ ok: true, plantaNome: 'Garden', medidas: { areaM2: 360, frenteM: 12, fundosM: 12, profundidadeM: 30 } });
    expect(loadBranchModel).toHaveBeenCalledWith('ramo-1');
  });

  it('sem planta vinculada, planta de outra organização, arquivada, sem desenho ou com contorno aberto: diz o motivo', async () => {
    expect(await terrenoDaPlantaVinculada({ ...EMP, blueprint_study_id: null })).toMatchObject({ ok: false, motivo: expect.stringMatching(/não está vinculado/) });

    estado.study = { ...estado.study, organization_id: 'org-2' };
    expect(await terrenoDaPlantaVinculada(EMP)).toMatchObject({ ok: false, motivo: expect.stringMatching(/outra organização/) });
    expect(loadBranchModel).not.toHaveBeenCalled();

    estado.study = { ...estado.study, organization_id: 'org-1', status: 'ARQUIVADO' };
    expect(await terrenoDaPlantaVinculada(EMP)).toMatchObject({ ok: false, motivo: expect.stringMatching(/arquivada/) });

    estado.study = { ...estado.study, status: 'RASCUNHO' };
    estado.model = null;
    expect(await terrenoDaPlantaVinculada(EMP)).toMatchObject({ ok: false, motivo: expect.stringMatching(/ainda não tem desenho/) });

    estado.model = loteRetangular(false);
    expect(await terrenoDaPlantaVinculada(EMP)).toMatchObject({ ok: false, motivo: expect.stringMatching(/lote fechado/) });
  });
});
