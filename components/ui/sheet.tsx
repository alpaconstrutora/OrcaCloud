import React from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const sizeClasses: Record<NonNullable<SheetProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'w-full',
};

export function Sheet({ open, onClose, children, side = 'right', size = 'xl' }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-200 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute top-0 bottom-0 ${side === 'right' ? 'right-0' : 'left-0'} flex flex-col bg-white shadow-2xl w-full ${sizeClasses[size]} transition-transform duration-300 ease-in-out ${
          open
            ? 'translate-x-0'
            : side === 'right'
            ? 'translate-x-full'
            : '-translate-x-full'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-5 border-b border-gray-100 bg-gray-50/60 shrink-0 ${className}`}>
      {children}
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
