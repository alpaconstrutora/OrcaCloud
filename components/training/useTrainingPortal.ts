import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { academyTraineeService } from '../../services/academyTraineeService';
import { academyKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';
import { usePersistedState } from '../ui/TableUtils';
import { avisarAcaoDoPortal } from '../../utils/portalEventos';
import { resolverAbaDoPortalDeTreinamentos, type TrainingPortalTabId } from '../../utils/trainingPortalTabs';
import { createTraineeChannel, createTraineePreviewChannel } from '../academy/academyChannel';
import type { AcademyTraineeEnrollment } from '../../types/academy';

/**
 * Estado e ações do Portal de Treinamentos, compartilhados pelas duas cascas
 * (desktop em TrainingPortal.tsx, celular em TrainingPortalMobile.tsx — plano
 * docs/planos/2026-10-16-portal-treinamentos-mobile.md).
 *
 * O que muda entre as cascas é só o desenho; aba ativa, aula aberta, acesso,
 * toast e as invalidações ao sair da sala vivem aqui, uma vez só.
 *
 * `verComo` (16/10, docs/planos/2026-10-16-portal-treinamentos-previa-ver-como.md):
 * prévia do gestor como a pessoa (id de academy_portal_users). Leituras com o
 * alvo e chaves de cache próprias; canal sem escrita; nada avisado ao tour;
 * aba guardada em chave separada para não mexer na do portal real.
 */

export type ToastDoPortal = { message: string; type: 'success' | 'error' };

export function useTrainingPortal(userEmail: string, verComo: string | null = null) {
    const qc = useQueryClient();
    const [abaSalva, setAbaSalva] = usePersistedState<string>(verComo ? 'traineePortal:aba:previa' : 'traineePortal:aba', 'treinamentos');
    const activeTab = resolverAbaDoPortalDeTreinamentos(abaSalva);

    const [aulaAberta, setAulaAberta] = useState<AcademyTraineeEnrollment | null>(null);
    const [toast, setToast] = useState<ToastDoPortal | null>(null);

    const channel = useMemo(() => (verComo ? createTraineePreviewChannel(verComo) : createTraineeChannel()), [verComo]);

    const setActiveTab = (id: TrainingPortalTabId) => { setAulaAberta(null); setAbaSalva(id); };

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    };

    const { data: identidades = [], isLoading: carregandoAcesso, error: erroAcesso } = useQuery({
        queryKey: academyKeys.traineeAccess(verComo),
        queryFn: () => academyTraineeService.myAccess(verComo),
        staleTime: STALE.normal,
    });
    const principal = identidades[0];
    const mostrarOrganizacao = new Set(identidades.map(i => i.org_id)).size > 1;
    // Com uma organização só, a ajuda sabe de qual ler; com várias, deixa a
    // central escolher (portal_help_get_mine devolve a lista).
    const orgDaAjuda = mostrarOrganizacao ? null : (principal?.org_id ?? null);
    const iniciais = (principal?.name || userEmail || 'T').trim().charAt(0).toUpperCase();

    const abrirMatricula = (m: AcademyTraineeEnrollment) => {
        setAbaSalva('treinamentos');
        setAulaAberta(m);
        if (!verComo) avisarAcaoDoPortal('abriu-treinamento');
    };

    const abrirMatriculaPorId = async (enrollmentId: string) => {
        setAbaSalva('treinamentos');
        const lista = await qc.fetchQuery({
            queryKey: academyKeys.traineeEnrollments(verComo),
            queryFn: () => academyTraineeService.listEnrollments(verComo),
            staleTime: 0,
        });
        const m = lista.find(x => x.id === enrollmentId);
        if (m) abrirMatricula(m);
    };

    const voltarDaAula = () => {
        setAulaAberta(null);
        // Progresso, certificado e histórico podem ter mudado na sala.
        qc.invalidateQueries({ queryKey: academyKeys.traineeEnrollments(verComo) });
        qc.invalidateQueries({ queryKey: academyKeys.traineeCertificates(verComo) });
        qc.invalidateQueries({ queryKey: academyKeys.traineeHistory(verComo) });
        qc.invalidateQueries({ queryKey: academyKeys.traineeCatalog(verComo) });
    };

    return {
        activeTab, setActiveTab,
        aulaAberta, abrirMatricula, abrirMatriculaPorId, voltarDaAula,
        toast, notify,
        channel,
        identidades, carregandoAcesso, erroAcesso, principal, mostrarOrganizacao, orgDaAjuda, iniciais,
        verComo,
    };
}
