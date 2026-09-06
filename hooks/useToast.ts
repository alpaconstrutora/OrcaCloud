import { useState, useCallback, useRef } from 'react';
import { useToastSink } from '../components/ui/toast';

/**
 * Avisa o usuário. Com `<ToastProvider>` montado na raiz, a mensagem aparece
 * sozinha — o componente não precisa desenhar nada.
 *
 * ─── O QUE ESTE HOOK ERA, E POR QUE MUDOU ───────────────────────────────────
 * Ele devolvia `{ localToast, showToast }` e não renderizava nada: quem chamasse
 * `showToast` sem também desenhar `localToast` estava jogando a mensagem fora.
 * Em 06/09/2026 eram **15 componentes e 95 chamadas mudas** — 42 só no editor
 * elétrico, 21 em Garantia — e nenhuma delas aparecia, nem erro nem sucesso.
 * Isso escondeu duas falhas seguidas do motor de conciliação: a tela ficava muda
 * enquanto o console mostrava o erro.
 *
 * A forma do hook era a armadilha: ele parecia completo e não era. Corrigir 15
 * arquivos e torcer para o 16º lembrar não resolve — a cura é tirar a
 * possibilidade de esquecer.
 *
 * `localToast` continua no retorno por compatibilidade, e vem **sempre null**
 * quando há provider: os ~23 componentes que já desenhavam o próprio aviso
 * simplesmente não desenham mais nada, e quem mostra é o provider. Assim ninguém
 * vê a mensagem em dobro. Sem provider (teste, render isolado), o comportamento
 * antigo é preservado inteiro.
 */
export const useToast = () => {
  const sink = useToastSink();
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (sink) { sink(message, type); return; }

    // Sem provider: comportamento antigo. Erro fica muito mais tempo que
    // confirmação — 3 segundos é tempo de piscar e perder, e erro é o que precisa
    // ser lido e às vezes copiado.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setLocalToast({ message, type });
    toastTimerRef.current = setTimeout(() => setLocalToast(null), type === 'error' ? 15000 : 3000);
  }, [sink]);

  return { localToast: sink ? null : localToast, showToast };
};
