// @vitest-environment jsdom
/**
 * Sair do editor grava o que está no debounce do autosave (11/10/2026).
 * Plano: docs/planos/2026-10-11-planta-atalho-mapa-regulatorio.md, item 1.
 *
 * O defeito que isto trava: o autosave espera 1,5 s, e ao desmontar o editor o
 * temporizador era CANCELADO — a alteração feita logo antes de sair (seta ← ou o
 * atalho para o Mapa Regulatório) nunca chegava ao `saveDraft`.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { emptyModel } from '../utils/blueprintKernel';

const saveDraft = vi.fn(async () => {});
vi.mock('../services/blueprintService', () => ({
  getBranch: vi.fn(async () => ({ id: 'r1', base_revision: 1, parent_snapshot_id: null })),
  loadBranchModel: vi.fn(async () => emptyModel()),
  getSnapshotIdentity: vi.fn(async () => null),
  publishSnapshot: vi.fn(),
  saveDraft: (...a: unknown[]) => saveDraft(...(a as [])),
}));

import { useBlueprintEditor } from '../hooks/useBlueprintEditor';

async function montar() {
  const h = renderHook(() => useBlueprintEditor('r1'));
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  return h;
}

describe('salvarPendente', () => {
  beforeEach(() => saveDraft.mockReset().mockResolvedValue(undefined));

  it('grava na hora a alteração ainda no debounce — e desmontar depois não perde nada', async () => {
    const h = await montar();
    act(() => { h.result.current.run({ type: 'AddLevel', name: 'Pav. 2', elevationMm: 3000, defaultHeightMm: 2800 }); });
    expect(h.result.current.saveState).toBe('pendente');
    expect(saveDraft).not.toHaveBeenCalled();

    let ok = false;
    await act(async () => { ok = await h.result.current.salvarPendente(); });
    expect(ok).toBe(true);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    const [, gravado] = saveDraft.mock.calls[0] as unknown as [string, { levels: { name: string }[] }];
    expect(gravado.levels.map((l) => l.name)).toContain('Pav. 2');
    expect(h.result.current.saveState).toBe('salvo');

    // O temporizador foi cancelado pela gravação: nada de gravar duas vezes.
    h.unmount();
    await new Promise((r) => setTimeout(r, 1700));
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('sem nada pendente, não grava e libera a saída', async () => {
    const h = await montar();
    let ok = false;
    await act(async () => { ok = await h.result.current.salvarPendente(); });
    expect(ok).toBe(true);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('falha na gravação segura a saída e mostra o erro', async () => {
    saveDraft.mockRejectedValueOnce(new Error('rede caiu'));
    const h = await montar();
    act(() => { h.result.current.run({ type: 'AddLevel', name: 'Pav. 2', elevationMm: 3000, defaultHeightMm: 2800 }); });
    let ok = true;
    await act(async () => { ok = await h.result.current.salvarPendente(); });
    expect(ok).toBe(false);
    expect(h.result.current.saveState).toBe('erro');
    expect(h.result.current.lastError).toBe('rede caiu');
  });
});
