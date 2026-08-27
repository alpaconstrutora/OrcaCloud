// @vitest-environment jsdom
/**
 * Cobre o hook de dirty-tracking + guarda de saída introduzido para "salvar não
 * fecha a edição" (docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md).
 * Sem dirty, confirmDiscard resolve true sem perguntar nada; com dirty, mostra o
 * modal de confirmação (useConfirm) e respeita a resposta do usuário.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ConfirmProvider } from '../components/ui/confirm';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ConfirmProvider>{children}</ConfirmProvider>
);

describe('useUnsavedChanges', () => {
  it('sem alterações pendentes, confirmDiscard resolve true sem exibir diálogo', async () => {
    const { result } = renderHook(() => useUnsavedChanges(), { wrapper });

    expect(result.current.dirty).toBe(false);

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.confirmDiscard();
    });

    expect(resolved).toBe(true);
    expect(screen.queryByText('Sair sem salvar?')).not.toBeInTheDocument();
  });

  it('markDirty liga a pendência; markSaved desliga', () => {
    const { result } = renderHook(() => useUnsavedChanges(), { wrapper });

    act(() => result.current.markDirty());
    expect(result.current.dirty).toBe(true);

    act(() => result.current.markSaved());
    expect(result.current.dirty).toBe(false);
  });

  it('com alterações pendentes, pergunta e respeita "Continuar editando" (não descarta)', async () => {
    const { result } = renderHook(() => useUnsavedChanges(), { wrapper });
    act(() => result.current.markDirty());

    let resolved: boolean | undefined;
    act(() => {
      result.current.confirmDiscard().then(v => { resolved = v; });
    });

    await screen.findByText('Sair sem salvar?');
    fireEvent.click(screen.getByText('Continuar editando'));

    await waitFor(() => expect(resolved).toBe(false));
  });

  it('com alterações pendentes, pergunta e respeita "Sair e descartar"', async () => {
    const { result } = renderHook(() => useUnsavedChanges(), { wrapper });
    act(() => result.current.markDirty());

    let resolved: boolean | undefined;
    act(() => {
      result.current.confirmDiscard().then(v => { resolved = v; });
    });

    await screen.findByText('Sair sem salvar?');
    fireEvent.click(screen.getByText('Sair e descartar'));

    await waitFor(() => expect(resolved).toBe(true));
  });
});
