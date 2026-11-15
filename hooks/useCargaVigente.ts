import { useCallback, useEffect, useRef } from 'react';

/**
 * Guarda de resposta fora de ordem — o `loadSeq` de ContasReceberManager,
 * CentralCliente e BankReconciliation (guia §22), num hook só.
 *
 * Cada carga chama `novaCarga()` e recebe `vigente()`. Antes de gravar estado,
 * confere `vigente()`: se outra carga começou depois (filtro trocado, data sendo
 * digitada) ou a tela desmontou, a resposta é descartada.
 *
 * Por que existe: na Controladoria, digitar 2010 no ano disparava cargas de 0201,
 * 2010…; a resposta mais lenta chegava por último e a tela ficava mostrando R$ 663
 * mil "de 2010" que eram de outra faixa (crítica de 14/11/2026, reproduzida 2×).
 *
 *   const novaCarga = useCargaVigente();
 *   const load = useCallback(async () => {
 *     const vigente = novaCarga();
 *     setLoading(true);
 *     try { const d = await buscar(); if (vigente()) setDados(d); }
 *     finally { if (vigente()) setLoading(false); }
 *   }, [novaCarga, ...]);
 */
export function useCargaVigente(): () => () => boolean {
    const seq = useRef(0);
    useEffect(() => () => { seq.current++; }, []);
    return useCallback(() => {
        const minha = ++seq.current;
        return () => minha === seq.current;
    }, []);
}
