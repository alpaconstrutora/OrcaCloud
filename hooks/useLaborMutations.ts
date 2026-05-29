/**
 * Hooks de mutação para o módulo Labour com invalidação coordenada de cache.
 *
 * Cada useMutation usa onSuccess para chamar queryClient.invalidateQueries com a
 * chave mínima necessária — invalida apenas o que mudou, preservando o resto do cache.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { laborService, Employee, LaborTeam, TimeEntry } from '../services/laborService';
import { payrollService, PayrollRubric } from '../services/payrollService';
import { payrollEngine } from '../services/payrollEngine';
import { laborKeys, orgKeys } from '../lib/queryKeys';

// ── Colaboradores ─────────────────────────────────────────────────────────────

export function useSaveEmployee() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...emp }: Omit<Employee, 'id' | 'created_at' | 'updated_at'> & { id?: string }) =>
            id
                ? laborService.updateEmployee(id, emp)
                : laborService.createEmployee(emp),
        onSuccess: (_data, variables) => {
            const { org_id } = variables as { org_id: string };
            qc.invalidateQueries({ queryKey: laborKeys.employees(org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.teams(org_id) }); // team member count muda
            qc.invalidateQueries({ queryKey: laborKeys.costSummary() });
            qc.invalidateQueries({ queryKey: laborKeys.docAlerts() });
        },
    });
}

export function useDeleteEmployee() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; org_id: string }) => laborService.deleteEmployee(id),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.employees(variables.org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.teams(variables.org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.costSummary() });
        },
    });
}

// ── Documentos ────────────────────────────────────────────────────────────────

export function useUploadDocument() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            meta,
            file,
        }: {
            meta: Parameters<typeof laborService.uploadDocument>[0];
            file: File;
        }) => laborService.uploadDocument(meta, file),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.documents(variables.meta.org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.docAlerts() });
        },
    });
}

export function useDeleteDocument() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, filePath }: { id: string; filePath: string }) =>
            laborService.deleteDocument(id, filePath),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'documents'] });
            qc.invalidateQueries({ queryKey: laborKeys.docAlerts() });
        },
    });
}

// ── Equipes ───────────────────────────────────────────────────────────────────

export function useSaveTeam() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...team }: Omit<LaborTeam, 'id' | 'created_at' | 'members' | 'foreman_name'> & { id?: string }) =>
            id
                ? laborService.updateTeam(id, team)
                : laborService.createTeam(team),
        onSuccess: (_data, variables) => {
            const { org_id } = variables as { org_id: string };
            qc.invalidateQueries({ queryKey: laborKeys.teams(org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.employees(org_id) }); // team_id nos employees muda
        },
    });
}

export function useDeleteTeam() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; org_id: string }) => laborService.deleteTeam(id),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.teams(variables.org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.employees(variables.org_id) });
        },
    });
}

// ── Ponto ─────────────────────────────────────────────────────────────────────

export function useSaveTimeEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ org_id: _orgId, id, ...entry }: Omit<TimeEntry, 'total_cost' | 'created_at' | 'employee_name'> & { org_id: string }) =>
            id
                ? laborService.updateTimeEntry(id, entry)
                : laborService.createTimeEntry(entry),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.timeEntries(variables.org_id) });
        },
    });
}

export function useApproveTimeEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string; org_id: string }) =>
            laborService.approveTimeEntry(id, approvedBy),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.timeEntries(variables.org_id) });
        },
    });
}

// ── Folha de pagamento ────────────────────────────────────────────────────────

export function useCreatePayrollRun() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            orgId,
            start,
            end,
            type,
            subtype,
            isBulk,
        }: {
            orgId: string;
            start: string;
            end: string;
            type: string;
            subtype?: string;
            isBulk: boolean;
        }) =>
            isBulk
                ? payrollEngine.runBulkPayroll(start, end, type as any, subtype)
                : payrollEngine.runPayroll(orgId, start, end, type as any, subtype).then(r => [r]),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.payrollRuns(variables.orgId) });
        },
    });
}

export function useClosePayrollRun() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ runId }: { runId: string; org_id: string }) => {
            await payrollService.updateRunStatus(runId, 'FECHADO');
            try {
                await payrollService.syncPayrollToFinance(runId);
            } catch (syncErr) {
                console.error('[useClosePayrollRun] Sync financeiro falhou (não impede fechamento):', syncErr);
            }
            return payrollService.getRun(runId);
        },
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.payrollRuns(variables.org_id) });
            qc.invalidateQueries({ queryKey: laborKeys.costSummary() });
        },
    });
}

export function useDeletePayrollRun() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; org_id: string }) => payrollService.deleteRun(id),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.payrollRuns(variables.org_id) });
        },
    });
}

export function useSavePayrollEvent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (event: Parameters<typeof payrollService.saveEvent>[0]) =>
            payrollService.saveEvent(event),
        onSuccess: (_data, variables) => {
            const { org_id, payroll_run_id } = variables;
            qc.invalidateQueries({ queryKey: laborKeys.payrollEvents(org_id, payroll_run_id ?? '') });
            qc.invalidateQueries({ queryKey: laborKeys.payrollResults(payroll_run_id ?? '') });
        },
    });
}

export function useDeletePayrollEvent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; org_id: string; payroll_run_id: string }) =>
            payrollService.deleteEvent(id),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: laborKeys.payrollEvents(variables.org_id, variables.payroll_run_id) });
            qc.invalidateQueries({ queryKey: laborKeys.payrollResults(variables.payroll_run_id) });
        },
    });
}

// ── Rubricas ──────────────────────────────────────────────────────────────────

export function useSaveRubric() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ isNew, ...rubric }: PayrollRubric & { isNew: boolean }) =>
            isNew
                ? payrollService.createRubric(rubric)
                : payrollService.updateRubric(rubric.code, rubric),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: laborKeys.rubrics() });
            qc.invalidateQueries({ queryKey: laborKeys.payrollRubrics() });
        },
    });
}

export function useDeleteRubric() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (code: string) => payrollService.deleteRubric(code),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: laborKeys.rubrics() });
            qc.invalidateQueries({ queryKey: laborKeys.payrollRubrics() });
        },
    });
}
