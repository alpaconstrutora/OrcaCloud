/**
 * Hooks de consulta para o módulo Labour.
 *
 * Cada hook encapsula:
 *  - A query key hierárquica (para invalidação coordenada)
 *  - O staleTime adequado ao tipo de dado
 *  - A chamada ao service correspondente
 *
 * Componentes não chamam laborService diretamente — importam estes hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { laborService } from '../services/laborService';
import { organizationService } from '../services/organizationService';
import { payrollService } from '../services/payrollService';
import { fiscalService } from '../services/fiscalService';
import { laborKeys, orgKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ── Colaboradores & equipes ──────────────────────────────────────────────────

export function useEmployees(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.employees(orgId),
        queryFn: () => laborService.listEmployees(orgId),
        staleTime: STALE.normal,
    });
}

export function useTeams(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.teams(orgId),
        queryFn: () => laborService.listTeams(orgId),
        staleTime: STALE.normal,
    });
}

// ── Ponto & produtividade ────────────────────────────────────────────────────

export function useTimeEntries(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.timeEntries(orgId),
        queryFn: () => laborService.listTimeEntries({ orgId }),
        staleTime: STALE.fast,
    });
}

export function useProductivityLogs(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.productivityLogs(orgId),
        queryFn: () => laborService.listProductivityLogs({ orgId }),
        staleTime: STALE.fast,
    });
}

// ── Custos & alertas ─────────────────────────────────────────────────────────

export function useCostSummary(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.costSummary(orgId),
        queryFn: () => laborService.getCostSummary(orgId),
        staleTime: STALE.normal,
    });
}

export function useDocumentAlerts(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.docAlerts(orgId),
        queryFn: () => laborService.getDocumentsAlerts(orgId),
        staleTime: STALE.normal,
    });
}

export function useLegacyWorkersCount(orgId?: string) {
    return useQuery({
        queryKey: ['labor', 'legacyCount', orgId ?? 'all'] as const,
        queryFn: () => laborService.getLegacyWorkersCount(orgId),
        staleTime: STALE.slow,
    });
}

// ── Documentos ───────────────────────────────────────────────────────────────

export function useLaborDocuments(orgId?: string) {
    return useQuery({
        queryKey: laborKeys.documents(orgId),
        queryFn: () => laborService.listDocuments({ orgId }),
        staleTime: STALE.normal,
    });
}

// ── Rubricas & configurações fiscais ─────────────────────────────────────────

export function useRubrics() {
    return useQuery({
        queryKey: laborKeys.rubrics(),
        queryFn: () => payrollService.listRubrics(),
        staleTime: STALE.slow,
    });
}

export function useFiscalSettings(year: number) {
    return useQuery({
        queryKey: laborKeys.fiscalSettings(year),
        queryFn: async () => {
            const dateStr = `${year}-01-01`;
            const [inss, irrf, fgts] = await Promise.all([
                fiscalService.getINSSBrackets(dateStr),
                fiscalService.getIRRFBrackets(dateStr),
                fiscalService.getFGTSConfig(dateStr),
            ]);
            return { inss, irrf, fgts };
        },
        staleTime: STALE.slow,
    });
}

// ── Organizações ─────────────────────────────────────────────────────────────

export function useOrganizations() {
    return useQuery({
        queryKey: orgKeys.list(),
        queryFn: () => organizationService.listOrganizations(),
        staleTime: STALE.slow,
    });
}

// ── Folha de pagamento ───────────────────────────────────────────────────────

export function usePayrollRuns(
    orgId: string,
    typeFilter?: string,
    start?: string,
    end?: string,
) {
    return useQuery({
        queryKey: laborKeys.payrollRuns(orgId, typeFilter, start, end),
        queryFn: () => payrollService.listRuns(
            orgId,
            typeFilter === 'all' ? undefined : typeFilter,
            start,
            end,
        ),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });
}

export function usePayrollResults(runId: string | null) {
    return useQuery({
        queryKey: laborKeys.payrollResults(runId ?? ''),
        queryFn: () => payrollService.listResultsByRun(runId!),
        staleTime: STALE.fast,
        enabled: !!runId,
    });
}

export function usePayrollEvents(orgId: string, runId: string | null) {
    return useQuery({
        queryKey: laborKeys.payrollEvents(orgId, runId ?? ''),
        queryFn: () => payrollService.listEvents(orgId, runId!),
        staleTime: STALE.fast,
        enabled: !!runId,
    });
}

// ── Hook composto: todos os dados do LaborModule ─────────────────────────────

/**
 * Agrega as 8 queries do LaborModule num único hook.
 * Cada query roda de forma independente — falha em uma não bloqueia as outras.
 * Dados são cacheados individualmente: trocar de aba não re-fetcha.
 */
export function useLaborModuleData(orgId?: string) {
    const employees       = useEmployees(orgId);
    const teams           = useTeams(orgId);
    const timeEntries     = useTimeEntries(orgId);
    const productivityLogs= useProductivityLogs(orgId);
    const costSummary     = useCostSummary(orgId);
    const docAlerts       = useDocumentAlerts(orgId);
    const legacyCount     = useLegacyWorkersCount(orgId);
    const organizations   = useOrganizations();

    const queries = [employees, teams, timeEntries, productivityLogs, costSummary, docAlerts, legacyCount, organizations];

    const isLoading = queries.some(q => q.isLoading);
    const failedLabels = [
        employees.error       && 'colaboradores',
        teams.error           && 'equipes',
        timeEntries.error     && 'registro de horas',
        productivityLogs.error&& 'produtividade',
        costSummary.error     && 'resumo de custos',
        docAlerts.error       && 'alertas de documentos',
        legacyCount.error     && 'contagem legado',
        organizations.error   && 'organizações',
    ].filter(Boolean) as string[];

    const refetchAll = () => queries.forEach(q => q.refetch());

    return {
        employees:       employees.data       ?? [],
        teams:           teams.data           ?? [],
        timeEntries:     timeEntries.data     ?? [],
        productivityLogs:productivityLogs.data?? [],
        costSummary:     costSummary.data     ?? null,
        docAlerts:       docAlerts.data       ?? [],
        legacyCount:     legacyCount.data     ?? 0,
        organizations:   organizations.data   ?? [],
        isLoading,
        failedLabels,
        refetchAll,
    };
}
