import { useState, useCallback, useRef } from 'react';

export const useToast = () => {
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setLocalToast({ message, type });
    toastTimerRef.current = setTimeout(() => setLocalToast(null), 3000);
  }, []);

  return { localToast, showToast };
};
