// @vitest-environment jsdom
/**
 * Estudo SEM desenho pode ser publicado (14/10/2026, Fase 7 do plano
 * docs/planos/2026-10-13-areas-nbr12721-na-planta.md). Achado na prova no app
 * real: "Publicar versão" só ligava com paredes ou divisas — o estudo criado a
 * partir do Empreendimento (só ambientes declarados) nunca chegava a uma versão,
 * e portanto nunca à aprovação dos Quadros NBR 12721.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { applyBatch, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';

let modelo: BlueprintModel = emptyModel();
vi.mock('../services/blueprintService', () => ({
  getBranch: vi.fn(async () => ({ id: 'r1', base_revision: 0, parent_snapshot_id: null })),
  loadBranchModel: vi.fn(async () => modelo),
  getSnapshotIdentity: vi.fn(async () => null),
  publishSnapshot: vi.fn(),
  saveDraft: vi.fn(async () => {}),
}));

import { useBlueprintEditor } from '../hooks/useBlueprintEditor';

async function montar() {
  const h = renderHook(() => useBlueprintEditor('r1'));
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  return h;
}

describe('o que liga "Publicar versão"', () => {
  it('só ambientes declarados e unidades (estudo sem desenho): há o que publicar', async () => {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }, { type: 'AddUnidade', numero: '101' }]).model;
    m = applyBatch(m, [{ type: 'AddAmbienteDeclarado', levelId: m.levels[0].id, nome: 'Área privativa 101', areaMm2: 60_000_000, unidadeId: m.unidades[0].id }]).model;
    modelo = m;
    const h = await montar();
    expect(h.result.current.dirtySincePublish).toBe(true);
  });

  it('estudo vazio (só o pavimento): nada a publicar, como antes', async () => {
    modelo = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const h = await montar();
    expect(h.result.current.dirtySincePublish).toBe(false);
  });
});
