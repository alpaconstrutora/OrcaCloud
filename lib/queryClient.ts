import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton do QueryClient compartilhado em toda a aplicação.
 *
 * Configurações padrão:
 *  - staleTime 2 min   → dados considerados "frescos" por 2 min após fetch
 *  - gcTime    10 min  → cache limpo se query ficar sem subscriber por 10 min
 *  - retry     1       → tenta mais uma vez antes de marcar como erro
 *  - refetchOnWindowFocus false → Supabase não é real-time neste contexto; evita refetch desnecessário
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

/** staleTime diferenciados por tipo de dado (importados pelos hooks) */
export const STALE = {
    /** Dados que mudam raramente (tabelas fiscais, rubricas) */
    slow: 10 * 60 * 1000,
    /** Dados operacionais (colaboradores, folhas) */
    normal: 2 * 60 * 1000,
    /** Dados que mudam frequentemente (ponto, eventos de folha) */
    fast: 30 * 1000,
} as const;
