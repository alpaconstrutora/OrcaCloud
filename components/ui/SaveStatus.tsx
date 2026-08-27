import React from 'react';
import { Check } from 'lucide-react';

interface SaveStatusProps {
  /** Há alterações pendentes de gravação. */
  dirty: boolean;
  /**
   * Timestamp (`Date.now()`) do último save concluído, ou `null` se ainda não
   * salvou nesta sessão de edição. Cada valor novo reabre a janela de "Salvo"
   * por alguns segundos — use um timestamp (não um boolean) para que saves
   * consecutivos, mesmo sem `dirty` mudar no meio, disparem de novo.
   */
  savedAt: number | null;
  className?: string;
}

/**
 * Indicador de pendência para o rodapé de formulários de edição longa que não
 * fecham ao salvar (§25 de docs/ui_ux_guia_unificado.md). Fica à esquerda do
 * rodapé, ao lado dos botões Voltar/Salvar.
 */
export default function SaveStatus({ dirty, savedAt, className = '' }: SaveStatusProps) {
  const [showSaved, setShowSaved] = React.useState(false);

  React.useEffect(() => {
    if (savedAt === null) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (dirty) {
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium text-amber-600 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        Alterações não salvas
      </span>
    );
  }

  if (showSaved) {
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium text-emerald-600 ${className}`}>
        <Check className="w-3.5 h-3.5 shrink-0" />
        Salvo
      </span>
    );
  }

  return null;
}
