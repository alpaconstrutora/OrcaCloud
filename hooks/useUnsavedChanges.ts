import React from 'react';
import { useConfirm } from '../components/ui/confirm';

/**
 * Dirty-tracking + guarda de saída para formulários de edição longa (multi-aba).
 * Ver docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md e
 * §25 de docs/ui_ux_guia_unificado.md.
 *
 *   const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
 *   const setField = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); markDirty(); };
 *   const handleBack = async () => { if (await confirmDiscard()) onClose(); };
 */
export function useUnsavedChanges() {
  const confirm = useConfirm();
  const [dirty, setDirty] = React.useState(false);

  const markDirty = React.useCallback(() => setDirty(true), []);
  const markSaved = React.useCallback(() => setDirty(false), []);

  /** Resolve true quando é seguro sair (sem pendência, ou usuário confirmou o descarte). */
  const confirmDiscard = React.useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: 'Sair sem salvar?',
      message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
      variant: 'warning',
      confirmLabel: 'Sair e descartar',
      cancelLabel: 'Continuar editando',
    });
  }, [dirty, confirm]);

  return { dirty, markDirty, markSaved, confirmDiscard };
}
