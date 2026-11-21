import { useCallback, useEffect, useMemo, useState } from 'react';
import { equivalenciaUnidadesService } from '../services/equivalenciaUnidadesService';
import type { EquivalenciaDeUnidade } from '../utils/equivalenciaUnidades';

const VAZIO: ReadonlyMap<string, readonly EquivalenciaDeUnidade[]> = new Map();

/**
 * Equivalências de unidade dos códigos pedidos (cadastro global). Falha de
 * leitura = sem conversão (mapa vazio) — a tela segue na unidade do item.
 */
export function useEquivalencias(codes: readonly string[]) {
    const chave = useMemo(() => [...new Set(codes.filter(Boolean))].sort().join('|'), [codes]);
    const [eqs, setEqs] = useState<ReadonlyMap<string, readonly EquivalenciaDeUnidade[]>>(VAZIO);
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        if (!chave) { setEqs(VAZIO); return; }
        let vivo = true;
        equivalenciaUnidadesService.listarPorCodigos(chave.split('|'))
            .then(m => { if (vivo) setEqs(m); })
            .catch(e => { console.error('[useEquivalencias]', e); if (vivo) setEqs(VAZIO); });
        return () => { vivo = false; };
    }, [chave, versao]);

    /** Reler depois de salvar/excluir (o serviço já invalidou o cache do código). */
    const recarregar = useCallback(() => setVersao(v => v + 1), []);
    return { equivalencias: eqs, recarregar };
}
