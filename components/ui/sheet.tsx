import React from 'react';
import { useConfirm } from './confirm';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
  /** Largura no desktop. No mobile vira bottom sheet (ignora size). */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /**
   * Quando true, pede confirmação antes de fechar (proteção contra perda de dados).
   * Prefira autosave; use isto quando não houver salvamento automático.
   */
  dirty?: boolean;
}

// Aplicado só no desktop (sm+); no mobile o painel é um bottom sheet de largura total.
const sizeClasses: Record<NonNullable<SheetProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  full: 'sm:max-w-full',
};

/**
 * Painel lateral (desktop) / bottom sheet (mobile). Use para ver/editar/criar itens
 * de lista e gerenciar configurações, sem perder o contexto da tela. Ver UI_PATTERNS.md.
 */
export function Sheet({ open, onClose, children, side = 'right', size = 'xl', dirty = false }: SheetProps) {
  const confirm = useConfirm();
  const requestClose = React.useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Sair sem salvar?',
        message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
        variant: 'warning',
        confirmLabel: 'Sair e descartar',
        cancelLabel: 'Continuar editando',
      });
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose, confirm]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  const closedTransform =
    side === 'right'
      ? 'translate-y-full sm:translate-y-0 sm:translate-x-full'
      : 'translate-y-full sm:translate-y-0 sm:-translate-x-full';

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-200 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={requestClose}
      />

      {/* Painel: bottom sheet no mobile, lateral no desktop */}
      <div
        className={[
          'fixed bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out',
          // mobile: bottom sheet
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl',
          // desktop: painel lateral
          'sm:top-0 sm:bottom-0 sm:inset-x-auto sm:max-h-none sm:rounded-none sm:w-full sm:min-w-[420px]',
          sizeClasses[size],
          side === 'right' ? 'sm:right-0' : 'sm:left-0',
          open ? 'translate-y-0 sm:translate-x-0' : closedTransform,
        ].join(' ')}
      >
        {/* Handle do bottom sheet (só mobile) */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({
  children,
  onClose,
  className = '',
}: {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={`px-6 py-5 border-b border-gray-100 bg-gray-50/60 shrink-0 flex items-start gap-3 ${className}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <button onClick={onClose} className="p-2 -m-1 hover:bg-gray-100 rounded-xl transition-all shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function SheetTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-lg font-bold text-gray-900 leading-tight ${className}`}>{children}</h2>;
}

export function SheetDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-500 mt-0.5 ${className}`}>{children}</p>;
}

export function SheetPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

export function SheetFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
