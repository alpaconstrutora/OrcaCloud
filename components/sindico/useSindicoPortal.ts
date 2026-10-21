import React from 'react';
import { sindicoPortalService, type IdentidadeDoSindico, type PortalSindico } from '../../services/sindicoPortalService';

/**
 * Estado do Portal do Síndico (dados + carregamento), fora da casca — molde
 * `components/training/useTrainingPortal.ts`. A identidade é o token (link ou
 * login por e-mail) ou o clientId (prévia do admin).
 */
export function useSindicoPortal(identidade: IdentidadeDoSindico) {
    const [dados, setDados] = React.useState<PortalSindico | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);

    const chave = identidade.token ?? identidade.clientId ?? '';

    const recarregar = React.useCallback(async () => {
        setErro(null);
        try {
            const r = await sindicoPortalService.getDados(identidade);
            if (!r.ok) { setErro(r.motivo || 'Acesso não autorizado.'); setDados(null); }
            else setDados(r);
        } catch (e) {
            setErro((e as Error).message || 'Não foi possível carregar o portal.');
        } finally {
            setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave]);

    React.useEffect(() => { setCarregando(true); void recarregar(); }, [recarregar]);

    return { dados, carregando, erro, recarregar };
}
