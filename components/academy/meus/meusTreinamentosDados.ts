/**
 * "Meus Treinamentos" (app) — dados das quatro abas.
 *
 * Plano: docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md
 *
 * As mesmas RPCs do Portal de Treinamentos (`academy_portal_user_*`): desde
 * aplicar_20271016200000 o núcleo delas reconhece também a ficha de colaborador
 * do usuário logado no app. Interno e externo leem a MESMA coisa, por um
 * caminho só — o que o portal mostra, "Meus Treinamentos" mostra.
 *
 * As RPCs devolvem todas as organizações da pessoa; o recorte pela organização
 * do topo (REGRA #5) é feito aqui, com "Todas" mostrando tudo.
 */
import { useQuery } from '@tanstack/react-query';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyService } from '../../../services/academyService';
import { academyKeys } from '../../../lib/queryKeys';
import { STALE } from '../../../lib/queryClient';

export function recortarPorOrg<T extends { org_id: string }>(linhas: T[], orgId: string | null): T[] {
    return orgId ? linhas.filter(l => l.org_id === orgId) : linhas;
}

/** Mostrar a coluna/legenda de organização só quando há mais de uma na tela. */
export function variasOrganizacoes(linhas: Array<{ org_id: string }>): boolean {
    return new Set(linhas.map(l => l.org_id)).size > 1;
}

export const useMinhasMatriculas = () => useQuery({
    queryKey: academyKeys.traineeEnrollments(),
    queryFn: () => academyTraineeService.listEnrollments(),
    staleTime: STALE.fast,
});

export const useMeuCatalogo = () => useQuery({
    queryKey: academyKeys.traineeCatalog(),
    queryFn: () => academyTraineeService.listCatalog(),
    staleTime: STALE.normal,
});

export const useMeusCertificados = () => useQuery({
    queryKey: academyKeys.traineeCertificates(),
    queryFn: () => academyTraineeService.listCertificates(),
    staleTime: STALE.normal,
});

export const useMeuHistorico = () => useQuery({
    queryKey: academyKeys.traineeHistory(),
    queryFn: () => academyTraineeService.listHistory(),
    staleTime: STALE.normal,
});

/**
 * Tem ficha de colaborador? Sem ela as listas vêm vazias por outro motivo —
 * e a tela precisa dizer qual ("peça ao RH para vincular"), não "nenhum
 * treinamento". Mesma regra de identidade do núcleo das RPCs.
 */
export const useTenhoFicha = () => useQuery({
    queryKey: ['academy', 'minhaFicha'],
    queryFn: async () => !!(await academyService.getMyEmployeeId(null)),
    staleTime: STALE.normal,
});
