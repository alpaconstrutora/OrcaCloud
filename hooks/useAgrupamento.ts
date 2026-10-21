import { useCallback, useState } from 'react';
import { usePersistedState } from '../components/ui/TableUtils';
import type { DirecaoGrupos } from '../utils/agruparLinhas';

/**
 * Estado do "Agrupar" de uma tabela (guia de UI §6.12): o campo escolhido e o
 * sentido da ordem dos grupos (Crescente/Decrescente) persistem (como os demais
 * filtros da tela, §3); os grupos recolhidos ficam só em memória e voltam a abrir
 * ao trocar o campo.
 *
 * `onReorganizar` roda quando as linhas da tela mudam de lugar (trocar o campo
 * ou o sentido, recolher/expandir) — a tela zera ali a âncora do Shift+clique,
 * cujo índice passaria a apontar para outra linha.
 */
export function useAgrupamento<C extends string>(storageKey: string, onReorganizar?: () => void) {
    const [campo, setCampoPersistido] = usePersistedState<C | 'none'>(storageKey, 'none');
    const [direcaoGuardada, setDirecaoPersistida] = usePersistedState<DirecaoGrupos>(`${storageKey}:direcao`, 'asc');
    // localStorage é texto livre: qualquer coisa que não seja 'desc' vale como o padrão.
    const direcao: DirecaoGrupos = direcaoGuardada === 'desc' ? 'desc' : 'asc';
    const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());

    const setCampo = useCallback((c: C | 'none') => {
        setCampoPersistido(c);
        setRecolhidos(new Set());
        onReorganizar?.();
    }, [setCampoPersistido, onReorganizar]);

    /** Os grupos trocam de lugar, mas as chaves são as mesmas: os recolhidos continuam recolhidos. */
    const setDirecao = useCallback((d: DirecaoGrupos) => {
        setDirecaoPersistida(d);
        onReorganizar?.();
    }, [setDirecaoPersistida, onReorganizar]);

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

    return { campo, setCampo, direcao, setDirecao, agrupando: campo !== 'none', recolhidos, alternar, alternarTodos, expandir };
}
