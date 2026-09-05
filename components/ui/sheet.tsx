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
  /**
   * Geometria do painel no desktop (§26 do guia):
   *  - `floating` (padrão): painel solto, 16px de respiro nos 4 lados e cantos
   *    `rounded-[10px]` — mesma escala dos demais containers (§16).
   *  - `flush`: colado nas bordas da tela, sem cantos arredondados. É o desenho
   *    antigo; só use com motivo escrito no código.
   *
   * No mobile não muda nada — continua bottom sheet de largura total
   * (UI_PATTERNS.md §4.3).
   */
  variant?: 'flush' | 'floating';
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
export function Sheet({ open, onClose, children, side = 'right', size = 'xl', dirty = false, variant = 'floating' }: SheetProps) {
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

  const floating = variant === 'floating';

  // `size="full"` + `variant="floating"`: `sm:max-w-full` dá 100% da viewport,
  // mas o painel é ancorado em `sm:right-4` — a largura cheia empurrava 32px
  // (os dois respiros da §26) para FORA da tela, à esquerda. Medido em
  // 2026-09-05: viewport 1600, painel 1600 com left = -16. Só o `full` precisa
  // do desconto; os tamanhos nomeados já são menores que a viewport. No
  // `flush` não há respiro para descontar.
  const larguraMaxima = size === 'full' && floating
    ? 'sm:max-w-[calc(100%-2rem)]'
    : sizeClasses[size];

  // Fechado, o painel sai pela lateral. No modo flutuante o deslocamento tem de
  // somar o respiro da borda (`sm:right-4`): com `translate-x-full` puro ele
  // anda só a própria largura e deixa uma fatia de 16px à mostra na tela.
  const closedX = side === 'right'
    ? (floating ? 'sm:translate-x-[calc(100%_+_2rem)]' : 'sm:translate-x-full')
    : (floating ? 'sm:-translate-x-[calc(100%_+_2rem)]' : 'sm:-translate-x-full');
  const closedTransform = `translate-y-full sm:translate-y-0 ${closedX}`;

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
          'sm:inset-x-auto sm:max-h-none sm:w-full sm:min-w-[420px]',
          // `overflow-hidden` é o que faz o header cinza e o rodapé respeitarem
          // o raio — sem ele os cantos do painel voltam a ficar quadrados.
          floating
            ? 'sm:top-4 sm:bottom-4 sm:rounded-[10px] sm:overflow-hidden'
            : 'sm:top-0 sm:bottom-0 sm:rounded-none',
          larguraMaxima,
          side === 'right'
            ? (floating ? 'sm:right-4' : 'sm:right-0')
            : (floating ? 'sm:left-4' : 'sm:left-0'),
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
