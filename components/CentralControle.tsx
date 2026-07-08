import React from 'react';
import {
    AlertTriangle, CheckSquare, ChevronRight, RefreshCw, Loader2, ShieldCheck,
} from 'lucide-react';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type { FinancialAlert } from '../services/financialIntelligenceService';
import { divergenceService } from '../services/divergenceService';
import { approvalService } from '../services/approvalService';
import type { ActionQueueItem, ApprovalEntity, ApprovalPendingSummary } from '../services/approvalService';
import { processService } from '../services/processService';
import MyTasksWidget from './MyTasksWidget';

interface Props {
    organizationId: string;
    onNavigate: (view: string) => void;
}

type Severity = FinancialAlert['severity'];

/** Item unificado da Faixa 1 — origem apagada, só resta o que importa: prioridade e para onde ir. */
interface AlertItem {
    id: string;
    severity: Severity;
    title: string;
    description: string;
    amount?: number | null;
    view: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const SEVERITY_DOT: Record<Severity, string> = {
    HIGH:   'bg-red-500',
    MEDIUM: 'bg-amber-500',
    LOW:    'bg-gray-400',
};

const ENTITY_LABEL_PLURAL: Record<ApprovalEntity, string> = {
    transaction:     'transações financeiras',
    contract:        'contratos',
    purchase_order:  'pedidos de compra',
    process_step:    'etapas de processo',
};

const ENTITY_LABEL_SINGULAR: Record<ApprovalEntity, string> = {
    transaction:     'Transação financeira',
    contract:        'Contrato',
    purchase_order:  'Pedido de compra',
    process_step:    'Etapa de processo',
};

function fBRL(v: number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

const CentralControle: React.FC<Props> = ({ organizationId, onNavigate }) => {
    const [alerts, setAlerts]           = React.useState<AlertItem[]>([]);
    const [actionQueue, setActionQueue] = React.useState<ActionQueueItem[]>([]);
    const [loading, setLoading]         = React.useState(true);
    const [sourceErrors, setSourceErrors] = React.useState<string[]>([]);

    const load = React.useCallback(async () => {
        if (!organizationId) {
            setLoading(false);
            return;
        }
        setLoading(true);

        // Cada fonte é independente — uma RPC fora do ar não pode apagar as outras
        // (ao contrário do padrão de try/catch único usado no BIDashboard).
        const [financialR, divergenceR, approvalSummaryR, bottlenecksR, actionQueueR] = await Promise.allSettled([
            financialIntelligenceService.getAlerts(organizationId),
            divergenceService.getDivergences(organizationId),
            approvalService.getPendingSummary(organizationId),
            processService.getBottlenecks(organizationId),
            approvalService.listActionQueue(organizationId),
        ]);

        const errs: string[] = [];
        const built: AlertItem[] = [];

        if (financialR.status === 'fulfilled') {
            financialR.value.forEach((a, i) => built.push({
                id: `fin-${i}-${a.ref_id ?? a.title}`,
                severity: a.severity,
                title: a.title,
                description: a.project_name ? `${a.description} · ${a.project_name}` : a.description,
                amount: a.amount,
                view: 'financial-dashboard',
            }));
        } else {
            errs.push('Alertas financeiros');
            console.error('[CentralControle] financial alerts:', financialR.reason);
        }

        if (divergenceR.status === 'fulfilled') {
            const d = divergenceR.value;
            if (d.counts.value_mismatch > 0) built.push({
                id: 'div-mismatch',
                severity: 'HIGH',
                title: `${d.counts.value_mismatch} lançamento(s) com valor divergente`,
                description: `Banco × sistema não batem — apurado em ${d.as_of}`,
                view: 'bank-reconciliation',
            });
            if (d.counts.bank_without_internal > 0) built.push({
                id: 'div-bank',
                severity: 'MEDIUM',
                title: `${d.counts.bank_without_internal} lançamento(s) do banco sem correspondência`,
                description: `Sem contrapartida no sistema — apurado em ${d.as_of}`,
                view: 'bank-reconciliation',
            });
            if (d.counts.internal_without_bank > 0) built.push({
                id: 'div-internal',
                severity: 'MEDIUM',
                title: `${d.counts.internal_without_bank} lançamento(s) do sistema sem correspondência`,
                description: `Sem contrapartida no banco — apurado em ${d.as_of}`,
                view: 'bank-reconciliation',
            });
        } else {
            errs.push('Divergências de conciliação');
            console.error('[CentralControle] divergences:', divergenceR.reason);
        }

        if (approvalSummaryR.status === 'fulfilled') {
            (approvalSummaryR.value as ApprovalPendingSummary[])
                .filter(s => s.qtd > 0)
                .forEach(s => built.push({
                    id: `appr-${s.entity}`,
                    severity: 'MEDIUM',
                    title: `${s.qtd} ${ENTITY_LABEL_PLURAL[s.entity] ?? s.entity} aguardando aprovação`,
                    description: `Total em aberto: ${fBRL(s.soma)}`,
                    amount: s.soma,
                    view: 'financial-approval',
                }));
        } else {
            errs.push('Pendências de aprovação');
            console.error('[CentralControle] approval summary:', approvalSummaryR.reason);
        }

        if (bottlenecksR.status === 'fulfilled') {
            bottlenecksR.value
                .filter(b => b.overdue_count > 0)
                .forEach(b => built.push({
                    id: `proc-${b.step_name}`,
                    severity: 'HIGH',
                    title: `${b.overdue_count} etapa(s) atrasada(s) em "${b.step_name}"`,
                    description: `${b.active_count} ativa(s) no total nessa etapa`,
                    view: 'opura-processos',
                }));
        } else {
            errs.push('Gargalos de processo');
            console.error('[CentralControle] bottlenecks:', bottlenecksR.reason);
        }

        built.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
        setAlerts(built);

        if (actionQueueR.status === 'fulfilled') {
            setActionQueue(actionQueueR.value);
        } else {
            errs.push('Fila de aprovação');
            console.error('[CentralControle] action queue:', actionQueueR.reason);
        }

        setSourceErrors(errs);
        setLoading(false);
    }, [organizationId]);

    React.useEffect(() => { load(); }, [load]);

    if (!organizationId) {
        return (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                Selecione uma organização para carregar a Central de Controle.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Central de Controle</h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">O que precisa da sua atenção agora</p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {sourceErrors.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 text-xs font-semibold text-amber-700">
                    Não foi possível carregar: {sourceErrors.join(', ')}. Os demais blocos seguem atualizados.
                </div>
            )}

            {/* Faixa 1 — Alertas & Exceções */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-500 rounded-xl flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900">Alertas &amp; Exceções</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                                {loading ? 'Carregando...' : alerts.length > 0 ? `${alerts.length} pendência(s)` : 'Tudo em dia'}
                            </p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="py-8 px-5 text-center">
                        <ShieldCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nenhuma exceção encontrada</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-50">
                        {alerts.map(a => (
                            <li key={a.id}>
                                <button
                                    onClick={() => onNavigate(a.view)}
                                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors text-left group"
                                >
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[a.severity]}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate leading-tight">{a.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 truncate">{a.description}</p>
                                    </div>
                                    {a.amount != null && (
                                        <span className="text-sm font-medium text-gray-700 tabular-nums flex-shrink-0">{fBRL(a.amount)}</span>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Faixa 2 — Minha Mesa */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fila de aprovação */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center">
                                <ShieldCheck className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-gray-900">Fila de Aprovação</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                                    {loading ? 'Carregando...' : actionQueue.length > 0 ? `${actionQueue.length} aguardando você` : 'Nada pendente'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => onNavigate('financial-approval')}
                            className="flex items-center gap-1 text-xs font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
                        >
                            Ver todas <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                        </div>
                    ) : actionQueue.length === 0 ? (
                        <div className="py-8 px-5 text-center">
                            <CheckSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nenhuma aprovação pendente</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-50">
                            {actionQueue.slice(0, 5).map(item => (
                                <li key={`${item.entity}-${item.id}`}>
                                    <button
                                        onClick={() => onNavigate('financial-approval')}
                                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors text-left group"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate leading-tight">{item.title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                {item.party_name ?? item.project_name ?? ENTITY_LABEL_SINGULAR[item.entity]}
                                            </p>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 tabular-nums flex-shrink-0">{fBRL(item.amount)}</span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {actionQueue.length > 5 && (
                        <div className="px-5 py-2.5 border-t border-gray-50 text-center">
                            <button
                                onClick={() => onNavigate('financial-approval')}
                                className="text-xs font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
                            >
                                Ver todos os {actionQueue.length} itens →
                            </button>
                        </div>
                    )}
                </div>

                {/* Minhas Tarefas — movido de dentro do BIDashboard */}
                <MyTasksWidget orgId={organizationId} onNavigate={onNavigate} />
            </div>
        </div>
    );
};

export default CentralControle;
