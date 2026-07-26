import React from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Inbox } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { SortableHeader } from '../ui/TableUtils';
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

/**
 * Botão local desta tela — §17 (variante compacta: font-medium, sentence case,
 * rounded-[6px], h-9, sem shadow-xl/uppercase).
 *
 * ⚠️ Existe porque o `components/ui/Button.tsx` compartilhado ainda carrega o
 * estilo pesado deprecado (`rounded-xl font-black uppercase tracking-widest`)
 * na classe BASE — corrigi-lo afetaria o app inteiro, então a correção aqui é
 * local. Ver docs/ui_ux_guia_unificado.md §17.
 */
type AreaButtonVariant = 'primary' | 'secondary';
type AreaButtonSize = 'sm' | 'md';

const AREA_BUTTON_VARIANT: Record<AreaButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white text-slate-700 border border-gray-200 hover:bg-gray-50',
};

const AREA_BUTTON_SIZE: Record<AreaButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-3.5 text-[13px]',
};

interface AreaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: AreaButtonVariant;
    size?: AreaButtonSize;
}

export function AreaButton({ variant = 'primary', size = 'md', className = '', ...props }: AreaButtonProps) {
    return (
        <button
            className={`inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${AREA_BUTTON_VARIANT[variant]} ${AREA_BUTTON_SIZE[size]} ${className}`}
            {...props}
        />
    );
}

/** §11 — loading state: spinner centralizado. */
export function LoadingState({ message = 'Carregando...' }: { message?: string }) {
    return (
        <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500 text-sm">{message}</p>
        </div>
    );
}

/** §12 — empty state: ícone grande + título + subtítulo. */
export function EmptyState({ message, title = 'Nenhum registro encontrado', icon }: { message: string; title?: string; icon?: React.ReactNode }) {
    return (
        <div className="text-center py-12">
            <div className="text-gray-300 mx-auto mb-4 w-12 h-12 flex items-center justify-center">
                {icon || <Inbox className="w-12 h-12" />}
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-500">{message}</p>
        </div>
    );
}

function IssueList({ title, issues, tone }: { title: string; issues: AreaEngineRpcResult['blocking_errors']; tone: 'error' | 'warning' }) {
    const rows = issues || [];
    if (rows.length === 0) return null;
    return (
        <div className="mt-3 rounded-[10px] border border-white/70 bg-white/60 p-3">
            <p className={`text-xs font-semibold ${tone === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{title}</p>
            <ul className="mt-2 space-y-1">
                {rows.map((issue, idx) => (
                    <li key={`${issue.code}-${idx}`} className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
                        <span className="text-xs font-medium">{issue.code}</span>
                        <span>{issue.message}</span>
                        {typeof issue.count === 'number' && <span className="text-xs font-normal opacity-70">({issue.count})</span>}
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
        <div className={`border rounded-[10px] px-4 py-3 text-sm ${hasErrors ? 'bg-red-50 border-red-200 text-red-800' : success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 font-medium">
                    {hasErrors ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Status: {result.status}</span>
                </div>
                {/* §8 — texto simples colorido, sem pílula/fundo/uppercase */}
                <div className="flex flex-wrap gap-4 text-sm font-normal">
                    <span>Bloqueios: {errors.length}</span>
                    <span>Alertas: {warnings.length}</span>
                </div>
            </div>
            {hasErrors && (
                <IssueList title="Erros bloqueantes" issues={errors} tone="error" />
            )}
            {hasWarnings && (
                <IssueList title="Alertas" issues={warnings} tone="warning" />
            )}
            {!hasErrors && !hasWarnings && (
                <p className="mt-2 text-xs font-normal">Nenhum erro bloqueante ou alerta retornado pelo motor.</p>
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
        <div className="bg-white border border-gray-100 rounded-[10px] shadow-sm p-4 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-sm font-bold text-slate-800">QA técnico</h2>
                    <p className="text-xs text-slate-500 mt-1">Fechamentos calculados a partir dos Quadros gerados.</p>
                </div>
                <span className={`text-sm font-normal ${failed === 0 && hasRows ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {hasRows ? `${checks.length - failed}/${checks.length} ok` : 'Aguardando calculo'}
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {checks.map(check => (
                    <div key={check.label} className={`rounded-[10px] border p-3 ${check.ok ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center gap-2">
                            {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                            <p className="text-xs font-semibold text-slate-500">{check.label}</p>
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">{check.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function LifecycleAuditPanel({ version, technicalApproval, legalApproval, auditLogs }: { version: AreaVersion | null; technicalApproval?: AreaVersionApproval; legalApproval?: AreaVersionApproval; auditLogs: AreaVersionAuditLog[] }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.2fr] gap-3">
            <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Hashes documentais</p>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div><span className="font-medium">Payload:</span> {shortHash(version?.version_payload_hash)}</div>
                    <div><span className="font-medium">Identidade:</span> {shortHash(version?.version_identity_hash)}</div>
                    <div><span className="font-medium">Travada em:</span> {formatDateTime(version?.locked_at)}</div>
                </div>
            </div>
            <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Aprovações</p>
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between gap-3"><span className="font-medium">Técnica</span><span>{approvalLabel(technicalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{technicalApproval?.approval_hash ? shortHash(technicalApproval.approval_hash) : formatDateTime(technicalApproval?.reviewed_at)}</div>
                    <div className="flex items-center justify-between gap-3"><span className="font-medium">Jurídica</span><span>{approvalLabel(legalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{legalApproval?.approval_hash ? shortHash(legalApproval.approval_hash) : formatDateTime(legalApproval?.reviewed_at)}</div>
                </div>
            </div>
            <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Auditoria recente</p>
                {auditLogs.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Nenhum evento registrado.</p>
                ) : (
                    <div className="mt-2 space-y-2">
                        {auditLogs.slice(0, 4).map(log => (
                            <div key={log.id} className="flex items-center justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-700">{auditActionLabel(log.action)} · {auditEntityLabel(log.entity_type)}</p>
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
        <div className="rounded-[10px] border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <h4 className="text-xs font-semibold text-slate-500">{title}</h4>
            </div>
            {rows.length === 0 ? (
                <div className="p-3 text-sm font-normal text-slate-500">{empty}</div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {rows.map(row => (
                        <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-normal text-gray-700">{row.label}</p>
                                <p className="truncate text-xs font-normal text-gray-500">{row.detail}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {onEdit && (
                                    <ActionIconButton kind="edit" disabled={disabled} onClick={() => onEdit(row.id)} />
                                )}
                                <ActionIconButton kind="delete" disabled={disabled} onClick={() => onDelete(row.id)} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Tabela dos Quadros normativos (I, II, IV-B).
 *
 * §6.2 cabeçalho em sentence case · §6.3 toda coluna ordenável (os valores de
 * ordenação vêm crus em `sortKeys`, porque as células chegam já formatadas em
 * pt-BR e ordenar o texto "1.234,56 m2" daria ordem errada) · §6.5 cabeçalho
 * fixo · §6.6 `px-6` + separador vertical · §7 tipografia por tipo de dado.
 */
export function ResultTable({ headers, rows, empty, sortKeys }: { headers: string[]; rows: string[][]; empty: string; sortKeys?: (string | number)[][] }) {
    const [sortColumn, setSortColumn] = React.useState<string | null>(null);
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

    const handleSort = (colKey: string) => {
        if (sortColumn === colKey) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(colKey);
            setSortDirection('asc');
        }
    };

    const orderedRows = React.useMemo(() => {
        if (sortColumn === null) return rows;
        const colIdx = Number(sortColumn);
        if (!Number.isInteger(colIdx)) return rows;
        const factor = sortDirection === 'asc' ? 1 : -1;
        const keyOf = (rowIdx: number): string | number => sortKeys?.[rowIdx]?.[colIdx] ?? rows[rowIdx]?.[colIdx] ?? '';
        return rows
            .map((row, rowIdx) => ({ row, rowIdx }))
            .sort((a, b) => {
                const ka = keyOf(a.rowIdx);
                const kb = keyOf(b.rowIdx);
                if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * factor;
                return String(ka).localeCompare(String(kb), 'pt-BR', { numeric: true }) * factor;
            })
            .map(entry => entry.row);
    }, [rows, sortKeys, sortColumn, sortDirection]);

    if (rows.length === 0) {
        return <EmptyState title="Quadro ainda não calculado" message={empty} icon={<FileSpreadsheet className="w-12 h-12" />} />;
    }

    return (
        <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                        {headers.map((header, idx) => (
                            <SortableHeader
                                key={header}
                                colKey={String(idx)}
                                label={header}
                                uppercase={false}
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap"
                            />
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {orderedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                            {/* §7: 1ª coluna é o rótulo (texto padrão); as demais são números de
                                área/coeficiente — texto atenuado. `font-medium` é reservado a valor
                                financeiro, então não se aplica aqui. */}
                            {row.map((cell, cellIdx) => (
                                <td
                                    key={`${idx}-${cellIdx}`}
                                    className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 whitespace-nowrap text-sm font-normal ${cellIdx === 0 ? 'text-gray-700' : 'text-gray-600'}`}
                                >
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
