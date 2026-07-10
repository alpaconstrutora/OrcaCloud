import React from 'react';
import { AlertTriangle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import type {
    AreaEngineRpcResult,
    AreaFractionIdeal,
    AreaQuadroIIRow,
    AreaQuadroIRow,
    AreaQuadroIVBRow,
    AreaVersion,
    AreaVersionApproval,
    AreaVersionAuditLog,
} from '../../types/areaEngine';

export const statusLabel: Record<string, string> = {
    draft: 'Rascunho',
    calculated: 'Calculada',
    technically_approved: 'Aprov. tecnica',
    legally_approved: 'Aprov. juridica',
    locked: 'Travada',
    superseded: 'Substituida',
    cancelled: 'Cancelada',
};

export function formatNumber(value: unknown, digits = 2): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(n);
}

export function shortHash(hash?: string | null): string {
    if (!hash) return '-';
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function statusTone(status?: string): string {
    if (status === 'locked') return 'text-emerald-700';
    if (status === 'calculated' || status === 'legally_approved' || status === 'technically_approved') return 'text-blue-700';
    if (status === 'cancelled' || status === 'superseded') return 'text-slate-500';
    return 'text-amber-700';
}

export function isVersionStructureEditable(status?: string | null): boolean {
    return status === 'draft' || status === 'calculated';
}

function nearlyEqual(a: number, b: number, tolerance = 0.000001): boolean {
    return Math.abs(a - b) <= tolerance;
}

function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
}

function approvalLabel(approval?: AreaVersionApproval): string {
    if (!approval) return 'Pendente';
    if (approval.status === 'approved') return 'Aprovada';
    if (approval.status === 'rejected') return 'Rejeitada';
    return 'Pendente';
}

function auditActionLabel(action: AreaVersionAuditLog['action']): string {
    const labels: Record<AreaVersionAuditLog['action'], string> = {
        create: 'Criacao',
        update: 'Edicao',
        delete: 'Exclusao',
        calculate: 'Calculo',
        approve: 'Aprovacao',
        reject: 'Rejeicao',
        lock: 'Lock',
        export: 'Exportacao',
    };
    return labels[action] || action;
}

function auditEntityLabel(entityType: string): string {
    const labels: Record<string, string> = {
        area_version_block: 'Bloco',
        area_version_floor: 'Pavimento',
        area_version_unit: 'Unidade',
        area_version_space: 'Espaco',
        area_export_package: 'Exportacao',
        area_version: 'Versao',
        area_version_approval: 'Aprovacao',
        calculation_result: 'Calculo',
    };
    return labels[entityType] || entityType;
}

export function EmptyState({ message }: { message: string }) {
    return (
        <div className="border border-dashed border-slate-200 rounded-lg bg-white px-5 py-8 text-center text-sm text-slate-500">
            {message}
        </div>
    );
}

function IssueList({ title, issues, tone }: { title: string; issues: AreaEngineRpcResult['blocking_errors']; tone: 'error' | 'warning' }) {
    const rows = issues || [];
    if (rows.length === 0) return null;
    return (
        <div className="mt-3 rounded-lg border border-white/70 bg-white/60 p-3">
            <p className={`text-xs font-black uppercase tracking-widest ${tone === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{title}</p>
            <ul className="mt-2 space-y-1">
                {rows.map((issue, idx) => (
                    <li key={`${issue.code}-${idx}`} className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
                        <span className="font-mono text-xs font-black">{issue.code}</span>
                        <span>{issue.message}</span>
                        {typeof issue.count === 'number' && <span className="text-xs font-bold opacity-70">({issue.count})</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function RpcFeedback({ result }: { result: AreaEngineRpcResult | null }) {
    if (!result) return null;
    const errors = result.blocking_errors || [];
    const warnings = result.warnings || [];
    const success = result.status === 'success';
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    return (
        <div className={`border rounded-lg px-4 py-3 text-sm ${hasErrors ? 'bg-red-50 border-red-200 text-red-800' : success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 font-bold">
                    {hasErrors ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Status: {result.status}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-widest">
                    <span className="rounded-full bg-white/70 px-2 py-1">Bloqueios: {errors.length}</span>
                    <span className="rounded-full bg-white/70 px-2 py-1">Alertas: {warnings.length}</span>
                </div>
            </div>
            {hasErrors && (
                <IssueList title="Erros bloqueantes" issues={errors} tone="error" />
            )}
            {hasWarnings && (
                <IssueList title="Alertas" issues={warnings} tone="warning" />
            )}
            {!hasErrors && !hasWarnings && (
                <p className="mt-2 text-xs font-semibold">Nenhum erro bloqueante ou alerta retornado pelo motor.</p>
            )}
        </div>
    );
}

export function AreaQaPanel({ quadroI, quadroII, quadroIVB, fractions, coefficientSum }: { quadroI: AreaQuadroIRow[]; quadroII: AreaQuadroIIRow[]; quadroIVB: AreaQuadroIVBRow[]; fractions: AreaFractionIdeal[]; coefficientSum: number }) {
    const fractionSum = fractions.reduce((sum, row) => sum + Number(row.fraction_decimal_raw || 0), 0);
    const qiiRealTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_37_unit_real_total_raw || 0), 0);
    const qivbRealTotal = quadroIVB.reduce((sum, row) => sum + Number(row.qivb_f_real_total_area_raw || 0), 0);
    const qiiEquivalentTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_38_unit_equivalent_total_raw || 0), 0);
    const qiEquivalentTotal = quadroI.reduce((sum, row) => sum + Number(row.qi_18_floor_equivalent_total_raw || 0), 0);
    const uniqueQiiUnits = new Set(quadroII.map(row => row.unit_id)).size;
    const uniqueQivbUnits = new Set(quadroIVB.map(row => row.unit_id)).size;
    const hasRows = quadroI.length > 0 || quadroII.length > 0 || quadroIVB.length > 0;

    const checks = [
        { label: 'Soma dos coeficientes = 1', ok: hasRows && nearlyEqual(coefficientSum, 1, 0.000001), value: formatNumber(coefficientSum, 12) },
        { label: 'Soma das fracoes = 1', ok: hasRows && nearlyEqual(fractionSum, 1, 0.000001), value: formatNumber(fractionSum, 12) },
        { label: 'Quadro II real = IV-B real', ok: hasRows && nearlyEqual(qiiRealTotal, qivbRealTotal, 0.000001), value: `${formatNumber(qiiRealTotal)} / ${formatNumber(qivbRealTotal)}` },
        { label: 'Quadro II equivalente = Quadro I equivalente', ok: hasRows && nearlyEqual(qiiEquivalentTotal, qiEquivalentTotal, 0.000001), value: `${formatNumber(qiiEquivalentTotal)} / ${formatNumber(qiEquivalentTotal)}` },
        { label: 'Sem duplicidade de unidades', ok: hasRows && uniqueQiiUnits === quadroII.length && uniqueQivbUnits === quadroIVB.length, value: `${quadroII.length} QII / ${quadroIVB.length} IV-B` },
    ];

    const failed = checks.filter(check => !check.ok).length;

    return (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">QA tecnico</h2>
                    <p className="text-xs text-slate-500 mt-1">Fechamentos calculados a partir dos Quadros gerados.</p>
                </div>
                <span className={`text-sm font-normal ${failed === 0 && hasRows ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {hasRows ? `${checks.length - failed}/${checks.length} ok` : 'Aguardando calculo'}
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {checks.map(check => (
                    <div key={check.label} className={`rounded-lg border p-3 ${check.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2">
                            {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                            <p className="text-xs font-black uppercase tracking-widest text-slate-600">{check.label}</p>
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-900">{check.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function LifecycleAuditPanel({ version, technicalApproval, legalApproval, auditLogs }: { version: AreaVersion | null; technicalApproval?: AreaVersionApproval; legalApproval?: AreaVersionApproval; auditLogs: AreaVersionAuditLog[] }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.2fr] gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Hashes documentais</p>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div><span className="font-black">Payload:</span> <span className="font-mono">{shortHash(version?.version_payload_hash)}</span></div>
                    <div><span className="font-black">Identidade:</span> <span className="font-mono">{shortHash(version?.version_identity_hash)}</span></div>
                    <div><span className="font-black">Locked at:</span> {formatDateTime(version?.locked_at)}</div>
                </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Aprovacoes</p>
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between gap-3"><span className="font-black">Tecnica</span><span>{approvalLabel(technicalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{technicalApproval?.approval_hash ? shortHash(technicalApproval.approval_hash) : formatDateTime(technicalApproval?.reviewed_at)}</div>
                    <div className="flex items-center justify-between gap-3"><span className="font-black">Juridica</span><span>{approvalLabel(legalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{legalApproval?.approval_hash ? shortHash(legalApproval.approval_hash) : formatDateTime(legalApproval?.reviewed_at)}</div>
                </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Auditoria recente</p>
                {auditLogs.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Nenhum evento registrado.</p>
                ) : (
                    <div className="mt-2 space-y-2">
                        {auditLogs.slice(0, 4).map(log => (
                            <div key={log.id} className="flex items-center justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                    <p className="truncate font-black uppercase text-slate-700">{auditActionLabel(log.action)} - {auditEntityLabel(log.entity_type)}</p>
                                    <p className="truncate text-slate-500">{log.reason || log.field_name || '-'}</p>
                                </div>
                                <span className="shrink-0 text-slate-500">{formatDateTime(log.performed_at)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function StructureAdminList({ title, rows, empty, disabled, onEdit, onDelete }: { title: string; rows: { id: string; label: string; detail: string }[]; empty: string; disabled: boolean; onEdit?: (id: string) => void; onDelete: (id: string) => void }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">{title}</h4>
            </div>
            {rows.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">{empty}</div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {rows.map(row => (
                        <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-800">{row.label}</p>
                                <p className="truncate text-xs text-slate-500">{row.detail}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {onEdit && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(row.id)} disabled={disabled} className="text-slate-600 hover:text-blue-700">
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                )}
                                <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(row.id)} disabled={disabled} className="text-red-600 hover:text-red-700">
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ResultTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
    if (rows.length === 0) {
        return <div className="p-4"><EmptyState message={empty} /></div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                    <tr>
                        {headers.map(header => (
                            <th key={header} className="px-4 py-3 text-left font-black whitespace-nowrap">{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                            {row.map((cell, cellIdx) => (
                                <td key={`${idx}-${cellIdx}`} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
