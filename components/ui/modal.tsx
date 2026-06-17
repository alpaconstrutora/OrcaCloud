import React from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: ModalSize;
  /** Quando false, clicar no backdrop ou apertar Esc NÃO fecha (ações que exigem decisão). */
  dismissable?: boolean;
  className?: string;
  /** Permite empilhar acima de outras camadas (default 70). */
  zIndex?: number;
}

/**
 * Modal central. Use para interrupções de fluxo: confirmações, aprovação pontual,
 * formulários curtos que exigem decisão. Para editar/ver itens de lista prefira o Sheet.
 * Ver UI_PATTERNS.md.
 */
export function Modal({
  open,
  onClose,
  children,
  size = 'lg',
  dismissable = true,
  className = '',
  zIndex = 70,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <div
        className={`relative bg-white rounded-3xl shadow-2xl w-full ${sizeClasses[size]} overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  description,
  icon,
  onClose,
  className = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 px-6 py-5 border-b border-gray-100 shrink-0 ${className}`}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-black text-gray-900 leading-tight">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className="p-2 -m-1 hover:bg-gray-100 rounded-xl transition-all shrink-0">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto p-6 ${className}`}>{children}</div>;
}

export function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
