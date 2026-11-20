import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { preferenciasKeys } from '../lib/queryKeys';
import { useStore } from '../store/useStore';
import { preferenciasService } from '../services/preferenciasService';
import { useToast } from './useToast';
import type { LinhaDePreferencia } from '../utils/preferencias/resolver';

/**
 * Preferências do estudo de viabilidade (Imovib) — do USUÁRIO, no banco (`preferencias`, escopo USUARIO), como as
 * da Planta Inteligente. Plano docs/planos/2026-11-20-imovib-preferencias-estudo.md.
 *
 * A leitura é a MESMA das preferências da Planta (`preferenciasKeys.usuario` + `listarDoUsuario`): uma consulta só
 * para as duas telas. Gravação otimista: muda a tela na hora; falha volta ao que era e avisa.
 * Sem sessão: só a tela muda (não grava). Leitura que falha: vale o padrão.
 */
export const CHAVE_EXIBIR_NAO_VENDAVEIS = 'imovib.receitas.exibir_nao_vendaveis';

export function useImovibPreferencias(): {
    exibirNaoVendaveis: boolean;
    setExibirNaoVendaveis: (v: boolean) => void;
    carregando: boolean;
} {
    const userId = useStore((s) => s.session?.user?.id) ?? null;
    const chave = useMemo(() => preferenciasKeys.usuario(userId), [userId]);
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const consulta = useQuery({
        queryKey: chave,
        queryFn: () => (userId ? preferenciasService.listarDoUsuario() : Promise.resolve([])),
    });

    const linhas = (consulta.data ?? []) as LinhaDePreferencia[];
    // Sem linha = ocultas (padrão escolhido em 20/11).
    const exibirNaoVendaveis = linhas.some((l) => l.escopo === 'USUARIO' && l.chave === CHAVE_EXIBIR_NAO_VENDAVEIS && l.valor === true);

    const setExibirNaoVendaveis = useCallback((v: boolean) => {
        const antes = queryClient.getQueryData<LinhaDePreferencia[]>(chave) ?? [];
        const resto = antes.filter((l) => !(l.escopo === 'USUARIO' && l.chave === CHAVE_EXIBIR_NAO_VENDAVEIS));
        const nova = v ? [...resto, { escopo: 'USUARIO', chave: CHAVE_EXIBIR_NAO_VENDAVEIS, valor: true } as LinhaDePreferencia] : resto;
        queryClient.setQueryData(chave, nova);
        if (!userId) return;
        // Desligar = voltar ao padrão (apaga a linha).
        preferenciasService.gravar('USUARIO', {}, CHAVE_EXIBIR_NAO_VENDAVEIS, v ? true : null).catch((e: Error) => {
            queryClient.setQueryData(chave, antes);
            showToast(`Não foi possível gravar a preferência: ${e.message}`, 'error');
        });
    }, [chave, queryClient, showToast, userId]);

    return { exibirNaoVendaveis, setExibirNaoVendaveis, carregando: consulta.isLoading };
}
