import { useState, useCallback } from 'react';

export const useToast = () => {
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ message, type });
    setTimeout(() => setLocalToast(null), 3000);
  }, []);

  return { localToast, showToast };
};
