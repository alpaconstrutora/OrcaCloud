import { useState, useCallback, useRef } from 'react';

export const useToast = () => {
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Erro fica MUITO mais tempo na tela que confirmação.
   *
   * Os 3 segundos valem para "salvo com sucesso", que o usuário nem precisa ler. Para
   * um erro, 3 segundos é tempo de piscar e perder: em 06/09/2026 uma falha do motor de
   * conciliação passou despercebida duas vezes seguidas, e a investigação foi parar no
   * banco de dados porque ninguém tinha visto a mensagem. Erro é justamente o que
   * precisa ser lido, e às vezes copiado.
   */
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setLocalToast({ message, type });
    toastTimerRef.current = setTimeout(() => setLocalToast(null), type === 'error' ? 15000 : 3000);
  }, []);

  return { localToast, showToast };
};
