import React from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { Toast } from './useServicestoast';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ServicesToast: React.FC<Props> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border min-w-[280px] max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-200"
          style={{
            background: t.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: t.type === 'success' ? '#bbf7d0' : '#fecaca',
          }}
        >
          {t.type === 'success'
            ? <CheckCircle size={18} className="text-green-600 shrink-0" />
            : <XCircle size={18} className="text-red-500 shrink-0" />
          }
          <span className={`text-sm font-medium flex-1 ${t.type === 'success' ? 'text-green-800' : 'text-red-700'}`}>
            {t.message}
          </span>
          <button
            onClick={() => onDismiss(t.id)}
            className={`shrink-0 ${t.type === 'success' ? 'text-green-400 hover:text-green-700' : 'text-red-300 hover:text-red-600'}`}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ServicesToast;
