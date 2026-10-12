import React from 'react';
import { useConfirm } from '../components/ui/confirm';
import { registrarPendencia, CONFIRMAR_SAIDA } from '../lib/guardaDeSaida';

/**
 * Dirty-tracking + guarda de saída para formulários de edição longa (multi-aba).
 * Ver docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md e
 * §25 de docs/ui_ux_guia_unificado.md.
 *
 *   const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
 *   const setField = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); markDirty(); };
 *   const handleBack = async () => { if (await confirmDiscard()) onClose(); };
 *
 * `guardarNavegacao: true` também registra a pendência no registro global
 * (lib/guardaDeSaida.ts): trocar de módulo pelo menu, voltar do navegador ou
 * fechar a aba passam a perguntar. Use só em tela que DESMONTA ao sair — um
 * formulário que fica montado escondido com dirty=true perguntaria à toa.
 */
export function useUnsavedChanges(opcoes: { guardarNavegacao?: boolean } = {}) {
  const confirm = useConfirm();
  const [dirty, setDirty] = React.useState(false);
  const id = React.useId();
  const guardar = !!opcoes.guardarNavegacao;

  React.useEffect(() => {
    if (!guardar) return;
    registrarPendencia(id, dirty);
    return () => registrarPendencia(id, false);
  }, [guardar, id, dirty]);

  const markDirty = React.useCallback(() => setDirty(true), []);
  const markSaved = React.useCallback(() => setDirty(false), []);

  /** Resolve true quando é seguro sair (sem pendência, ou usuário confirmou o descarte). */
  const confirmDiscard = React.useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      ...CONFIRMAR_SAIDA,
      message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
    });
  }, [dirty, confirm]);

  return { dirty, markDirty, markSaved, confirmDiscard };
}
