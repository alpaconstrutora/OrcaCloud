import React from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from './modal';

type ConfirmVariant = 'danger' | 'warning' | 'default';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * Substitui window.confirm. Promise-based: resolve true/false.
 * Requer <ConfirmProvider> montado (já está no root, ver index.tsx).
 *
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: 'Excluir?', variant: 'danger' })) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>');
  return ctx;
}

const variantStyles: Record<ConfirmVariant, { icon: React.ReactNode; ring: string; button: string }> = {
  danger: {
    icon: <Trash2 className="w-5 h-5" />,
    ring: 'bg-red-100 text-red-600',
    button: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    ring: 'bg-amber-100 text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  default: {
    icon: <Info className="w-5 h-5" />,
    ring: 'bg-blue-100 text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700',
  },
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = React.useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const settle = (value: boolean) => {
    setState((prev) => {
      prev?.resolve(value);
      return null;
    });
  };

  const v = variantStyles[state?.variant ?? 'default'];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => settle(false)} size="sm" zIndex={200}>
        <ModalBody className="text-center">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${v.ring}`}>
            {v.icon}
          </div>
          <h3 className="mt-4 text-lg font-black text-gray-900">{state?.title}</h3>
          {state?.message && (
            <div className="mt-2 text-sm text-gray-500 whitespace-pre-line">{state.message}</div>
          )}
        </ModalBody>
        <ModalFooter className="justify-center">
          <button
            onClick={() => settle(false)}
            className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg text-sm transition-all"
          >
            {state?.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            onClick={() => settle(true)}
            className={`px-6 py-2 text-white font-bold rounded-lg text-sm transition-all ${v.button}`}
          >
            {state?.confirmLabel ?? 'Confirmar'}
          </button>
        </ModalFooter>
      </Modal>
    </ConfirmContext.Provider>
  );
};
