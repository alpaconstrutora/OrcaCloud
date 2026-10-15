import { useCallback, useState } from 'react';
import { usePersistedState } from '../components/ui/TableUtils';

/**
 * Estado do "Agrupar" de uma tabela (guia de UI §6.12): o campo escolhido
 * persiste (como os demais filtros da tela, §3); os grupos recolhidos ficam só
 * em memória e voltam a abrir ao trocar o campo.
 *
 * `onReorganizar` roda quando as linhas da tela mudam de lugar (trocar o campo,
 * recolher/expandir) — a tela zera ali a âncora do Shift+clique, cujo índice
 * passaria a apontar para outra linha.
 */
export function useAgrupamento<C extends string>(storageKey: string, onReorganizar?: () => void) {
    const [campo, setCampoPersistido] = usePersistedState<C | 'none'>(storageKey, 'none');
    const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());

    const setCampo = useCallback((c: C | 'none') => {
        setCampoPersistido(c);
        setRecolhidos(new Set());
        onReorganizar?.();
    }, [setCampoPersistido, onReorganizar]);

    const alternar = useCallback((key: string) => {
        setRecolhidos(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
        onReorganizar?.();
    }, [onReorganizar]);

    /** Algum recolhido → expande todos; nenhum → recolhe todos. */
    const alternarTodos = useCallback((keys: string[]) => {
        setRecolhidos(prev => (prev.size ? new Set() : new Set(keys)));
        onReorganizar?.();
    }, [onReorganizar]);

    /** Deep-link para uma linha num grupo recolhido: abre o grupo antes de rolar até ela. */
    const expandir = useCallback((key: string) => {
        setRecolhidos(prev => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    }, []);

    return { campo, setCampo, agrupando: campo !== 'none', recolhidos, alternar, alternarTodos, expandir };
}
