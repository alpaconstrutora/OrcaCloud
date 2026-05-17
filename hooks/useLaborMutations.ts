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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'employees'] });
            qc.invalidateQueries({ queryKey: laborKeys.costSummary() });
            qc.invalidateQueries({ queryKey: laborKeys.docAlerts() });
        },
    });
}

export function useDeleteEmployee() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => laborService.deleteEmployee(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'employees'] });
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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'teams'] });
        },
    });
}

export function useDeleteTeam() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => laborService.deleteTeam(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'teams'] });
        },
    });
}

// ── Ponto ─────────────────────────────────────────────────────────────────────

export function useSaveTimeEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...entry }: Omit<TimeEntry, 'id' | 'total_cost' | 'created_at' | 'employee_name'> & { id?: string }) =>
            id
                ? laborService.updateTimeEntry(id, entry)
                : laborService.createTimeEntry(entry),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'timeEntries'] });
        },
    });
}

export function useApproveTimeEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
            laborService.approveTimeEntry(id, approvedBy),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'timeEntries'] });
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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'payrollRuns'] });
        },
    });
}

export function useClosePayrollRun() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (runId: string) => {
            await payrollService.updateRunStatus(runId, 'FECHADO');
            try {
                await payrollService.syncPayrollToFinance(runId);
            } catch (syncErr) {
                console.error('[useClosePayrollRun] Sync financeiro falhou (não impede fechamento):', syncErr);
            }
            return payrollService.getRun(runId);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'payrollRuns'] });
            qc.invalidateQueries({ queryKey: laborKeys.costSummary() });
        },
    });
}

export function useDeletePayrollRun() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => payrollService.deleteRun(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'payrollRuns'] });
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
        mutationFn: (id: string) => payrollService.deleteEvent(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['labor', 'payrollEvents'] });
            qc.invalidateQueries({ queryKey: ['labor', 'payrollResults'] });
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
