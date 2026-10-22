import { useCallback, useEffect, useRef, useState } from 'react';
import { payrollService } from '../services/payrollService';
import type { DadosDaFolhaDoMes } from '../utils/relacoesDaFolha';

export interface FolhaDaOrganizacao {
    org: { id: string; name: string; cnpj: string | null };
    dados: DadosDaFolhaDoMes;
}

/**
 * Folhas fechadas da competência para RH › Encargos Sociais. Com uma organização
 * no topo, só ela; em "Todas as organizações" (orgId null), cada uma de que o
 * usuário é membro — a guia de INSS é por CNPJ, então a tela mostra um bloco por
 * organização em vez de somar tudo (REGRA #5: "Todas" nunca deixa a tela em branco).
 */
export function useFolhasFechadasDoMes(
    orgId: string | null,
    organizations: Array<{ id: string; name: string }>,
    period: string,
) {
    const [blocos, setBlocos] = useState<FolhaDaOrganizacao[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);
    const alvos = orgId ? [orgId] : organizations.map(o => o.id);
    const chaveAlvos = alvos.join(',');

    const carregar = useCallback(async () => {
        const meu = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const ids = chaveAlvos ? chaveAlvos.split(',') : [];
            const lidos = await Promise.all(ids.map(id => payrollService.carregarFolhasFechadasDoMes(id, period)));
            if (meu !== seq.current) return;   // a competência mudou no meio: resposta velha
            setBlocos(lidos.sort((a, b) => a.org.name.localeCompare(b.org.name, 'pt-BR')));
        } catch (e: unknown) {
            if (meu !== seq.current) return;
            console.error('[Encargos Sociais]', e);
            setBlocos([]);
            // PostgrestError não é `Error`, mas traz `message`
            const msg = (e as { message?: string } | null)?.message;
            setError(msg ? `Erro ao buscar as folhas do mês: ${msg}` : 'Erro ao buscar as folhas do mês.');
        } finally {
            if (meu === seq.current) setLoading(false);
        }
    }, [chaveAlvos, period]);

    useEffect(() => { carregar(); }, [carregar]);

    return { blocos, loading, error, recarregar: carregar };
}
