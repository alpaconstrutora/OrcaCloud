import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

/**
 * Avisos da aplicação, desenhados num lugar só.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 * `hooks/useToast.ts` devolve `{ localToast, showToast }` e NÃO renderiza nada:
 * quem chamava `showToast` sem também desenhar `localToast` estava jogando a
 * mensagem fora. Em 06/09/2026 havia **15 componentes e 95 chamadas mudas** —
 * 42 só no editor elétrico, 21 em Garantia. Nem erro nem sucesso apareciam.
 *
 * Isso não é um descuido de quem escreveu: é uma armadilha da forma do hook, que
 * parece completo e não é. A cura certa não é corrigir 15 arquivos e confiar que
 * o 16º vai lembrar — é tirar a possibilidade de esquecer. Mesmo raciocínio do
 * `ConfirmProvider`, que já vive na raiz em `index.tsx`.
 *
 * Com o provider montado, `useToast()` publica aqui e a mensagem aparece, venha de
 * onde vier. Componentes que JÁ desenham o próprio `localToast` continuam
 * funcionando: eles recebem o estado local como sempre, e o provider só duplicaria
 * se também publicasse — por isso `useToast` avisa o provider apenas quando ele
 * existe E o componente não está desenhando por conta própria (ver o hook).
 */

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error';
}

type PublicarFn = (message: string, type: 'success' | 'error') => void;

const ToastContext = React.createContext<PublicarFn | null>(null);

/** Publica um aviso na área global. Devolve null fora do provider. */
export function useToastSink(): PublicarFn | null {
    return React.useContext(ToastContext);
}

/** Erro fica muito mais tempo que confirmação: é o que precisa ser lido e copiado. */
const DURACAO = { success: 3000, error: 15000 } as const;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [avisos, setAvisos] = React.useState<ToastMessage[]>([]);
    const seq = React.useRef(0);

    const remover = React.useCallback((id: number) => {
        setAvisos(prev => prev.filter(a => a.id !== id));
    }, []);

    const publicar = React.useCallback<PublicarFn>((message, type) => {
        if (!message || !String(message).trim()) return;
        const id = ++seq.current;
        setAvisos(prev => [...prev.slice(-3), { id, message, type }]); // no máximo 4 na tela
        window.setTimeout(() => remover(id), DURACAO[type]);
    }, [remover]);

    return (
        <ToastContext.Provider value={publicar}>
            {children}
            {avisos.length > 0 && (
                <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-2 items-end pointer-events-none">
                    {avisos.map(a => (
                        <div
                            key={a.id}
                            role="status"
                            aria-live={a.type === 'error' ? 'assertive' : 'polite'}
                            className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium max-w-lg ${
                                a.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                            }`}
                        >
                            {a.type === 'success'
                                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span className="whitespace-pre-wrap break-words">{a.message}</span>
                            <button
                                onClick={() => remover(a.id)}
                                className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                                aria-label="Fechar aviso"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </ToastContext.Provider>
    );
};
