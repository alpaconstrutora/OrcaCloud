import React from 'react';
import {
    AlertTriangle, CheckSquare, ChevronRight, RefreshCw, Loader2, ShieldCheck, BarChart3, ArrowRight, Check, X,
} from 'lucide-react';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type { FinancialAlert, ProjectScorecard, CashflowProjectionPoint } from '../services/financialIntelligenceService';
import { divergenceService } from '../services/divergenceService';
import { approvalService } from '../services/approvalService';
import type { ActionQueueItem, ApprovalEntity, ApprovalPendingSummary } from '../services/approvalService';
import { financialApprovalService } from '../services/financialApprovalService';
import type { FinancialApprovalConfig } from '../types/financial';
import { processService } from '../services/processService';
import { contractIndexService } from '../services/contractIndexService';
import { KpiCard } from './ui/KpiCard';
import MyTasksWidget from './MyTasksWidget';
import { ApproveRejectModal, ENTITY_TAG } from './FinancialApprovalModule';

interface Props {
    organizationId: string | null;
    userEmail?: string;
    onNavigate: (view: string) => void;
}

type Severity = FinancialAlert['severity'];
type CashflowDays = 30 | 60 | 90;

/** Item unificado da Faixa 1 — origem apagada, só resta o que importa: prioridade e para onde ir. */
interface AlertItem {
    id: string;
    severity: Severity;
    title: string;
    description: string;
    amount?: number | null;
    view: string;
    /** Só presente quando a fonte associa o item a uma obra — usado no filtro de Obra. */
    projectName?: string | null;
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

const CentralControle: React.FC<Props> = ({ organizationId, userEmail = '', onNavigate }) => {
    const [alerts, setAlerts]           = React.useState<AlertItem[]>([]);
    const [actionQueue, setActionQueue] = React.useState<ActionQueueItem[]>([]);
    const [scorecards, setScorecards]   = React.useState<ProjectScorecard[]>([]);
    const [approvalConfig, setApprovalConfig] = React.useState<FinancialApprovalConfig[]>([]);
    const [approvalModal, setApprovalModal] = React.useState<{ item: ActionQueueItem; mode: 'approve' | 'reject' } | null>(null);
    const [loading, setLoading]         = React.useState(true);
    const [sourceErrors, setSourceErrors] = React.useState<string[]>([]);
    const [selectedObra, setSelectedObra] = React.useState<string>('all');

    // Faixa 3 — caixa projetado. Único filtro de período honesto: é o único
    // dos serviços que de fato aceita um parâmetro de dias (os demais RPCs
    // só recebem p_organization_id, então um "período" global seria enganoso).
    const [cashflowDays, setCashflowDays] = React.useState<CashflowDays>(90);
    const [cashflow, setCashflow] = React.useState<CashflowProjectionPoint[]>([]);
    const [cashflowLoading, setCashflowLoading] = React.useState(false);

    const load = React.useCallback(async () => {
        setLoading(true);

        // Cada fonte é independente — uma RPC fora do ar não pode apagar as outras
        // (ao contrário do padrão de try/catch único usado no BIDashboard).
        const [financialR, divergenceR, approvalSummaryR, bottlenecksR, reajusteR, actionQueueR, scorecardR, approvalConfigR] = await Promise.allSettled([
            financialIntelligenceService.getAlerts(organizationId),
            divergenceService.getDivergences(organizationId),
            approvalService.getPendingSummary(organizationId),
            processService.getBottlenecks(organizationId),
            contractIndexService.listDueForReajuste(organizationId),
            approvalService.listActionQueue(organizationId),
            financialIntelligenceService.getProjectScorecards(organizationId),
            financialApprovalService.listConfig(organizationId),
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
                projectName: a.project_name,
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

        if (reajusteR.status === 'fulfilled') {
            reajusteR.value.forEach(c => built.push({
                id: `reajuste-${c.id}`,
                severity: 'MEDIUM',
                title: `Contrato ${c.number} com reajuste vencido`,
                description: `${c.reajuste_index} · venceu ${new Date(c.reajuste_proximo).toLocaleDateString('pt-BR')} · valor atual ${fBRL(c.current_value)}`,
                amount: c.current_value,
                view: 'contracts-reajuste',
            }));
        } else {
            errs.push('Reajustes de contrato');
            console.error('[CentralControle] reajustes:', reajusteR.reason);
        }

        built.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
        setAlerts(built);

        if (actionQueueR.status === 'fulfilled') {
            setActionQueue(actionQueueR.value);
        } else {
            errs.push('Fila de aprovação');
            console.error('[CentralControle] action queue:', actionQueueR.reason);
        }

        if (scorecardR.status === 'fulfilled') {
            setScorecards(scorecardR.value);
        } else {
            errs.push('Resultado por obra');
            console.error('[CentralControle] scorecards:', scorecardR.reason);
        }

        // Config de alçadas — não crítica: sem ela o modal só usa rótulos padrão
        // (Gestor / Financeiro-Diretoria), então uma falha aqui não vira banner de erro.
        if (approvalConfigR.status === 'fulfilled') {
            setApprovalConfig(approvalConfigR.value);
        } else {
            console.error('[CentralControle] approval config:', approvalConfigR.reason);
        }

        setSourceErrors(errs);
        setLoading(false);
    }, [organizationId]);

    React.useEffect(() => { load(); }, [load]);

    // Faixa 3 — recarrega só o caixa projetado ao trocar o período (30/60/90 dias),
    // sem re-buscar as demais 5 fontes.
    React.useEffect(() => {
        let cancelled = false;
        setCashflowLoading(true);
        financialIntelligenceService.getCashflowProjection(organizationId, cashflowDays)
            .then(points => { if (!cancelled) setCashflow(points); })
            .catch(err => { console.error('[CentralControle] cashflow:', err); if (!cancelled) setCashflow([]); })
            .finally(() => { if (!cancelled) setCashflowLoading(false); });
        return () => { cancelled = true; };
    }, [organizationId, cashflowDays]);

    // Opções do filtro de Obra — só entram obras que de fato têm algo pendente
    // visível agora (alerta financeiro ou item na fila de aprovação).
    const obraOptions = React.useMemo(() => {
        const names = new Set<string>();
        alerts.forEach(a => { if (a.projectName) names.add(a.projectName); });
        actionQueue.forEach(i => { if (i.project_name) names.add(i.project_name); });
        return Array.from(names).sort();
    }, [alerts, actionQueue]);

    // Itens sem obra associada (divergência agregada, aprovação agregada, gargalo de
    // processo) permanecem sempre visíveis — filtrar por obra não pode escondê-los
    // silenciosamente, já que não têm essa dimensão.
    const filteredAlerts = React.useMemo(() => {
        if (selectedObra === 'all') return alerts;
        return alerts.filter(a => !a.projectName || a.projectName === selectedObra);
    }, [alerts, selectedObra]);

    const filteredActionQueue = React.useMemo(() => {
        if (selectedObra === 'all') return actionQueue;
        return actionQueue.filter(i => !i.project_name || i.project_name === selectedObra);
    }, [actionQueue, selectedObra]);

    const obrasEmRisco = React.useMemo(
        () => scorecards.filter(s => s.risco === 'HIGH').length,
        [scorecards],
    );
    const obrasEmAtencao = React.useMemo(
        () => scorecards.filter(s => s.risco === 'MEDIUM').length,
        [scorecards],
    );
    const caixaProjetado = cashflow.length > 0 ? cashflow[cashflow.length - 1].saldo_acum : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Central de Controle</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">O que precisa da sua atenção agora</p>
                </div>
                <div className="flex items-center gap-2">
                    {obraOptions.length > 0 && (
                        <select
                            value={selectedObra}
                            onChange={e => setSelectedObra(e.target.value)}
                            className="text-sm font-normal px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
                            title="Filtrar por obra"
                        >
                            <option value="all">Todas as obras</option>
                            {obraOptions.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                        title="Atualizar"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
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
                                {loading ? 'Carregando...' : filteredAlerts.length > 0 ? `${filteredAlerts.length} pendência(s)` : 'Tudo em dia'}
                            </p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                    </div>
                ) : filteredAlerts.length === 0 ? (
                    <div className="py-8 px-5 text-center">
                        <ShieldCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nenhuma exceção encontrada</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-50">
                        {filteredAlerts.map(a => (
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
                                    {loading ? 'Carregando...' : filteredActionQueue.length > 0 ? `${filteredActionQueue.length} aguardando você` : 'Nada pendente'}
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
                    ) : filteredActionQueue.length === 0 ? (
                        <div className="py-8 px-5 text-center">
                            <CheckSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nenhuma aprovação pendente</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-50">
                            {filteredActionQueue.slice(0, 5).map(item => {
                                const isDraft = item.approval_status === 'RASCUNHO';
                                return (
                                    <li
                                        key={`${item.entity}-${item.id}`}
                                        onClick={() => onNavigate('financial-approval')}
                                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate leading-tight">{item.title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                {item.party_name ?? item.project_name ?? ENTITY_LABEL_SINGULAR[item.entity]}
                                                {isDraft ? ' · Rascunho' : ''}
                                            </p>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 tabular-nums flex-shrink-0">{fBRL(item.amount)}</span>
                                        {isDraft ? (
                                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                                        ) : (
                                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setApprovalModal({ item, mode: 'approve' })}
                                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                    title={`Aprovar ${ENTITY_TAG[item.entity]}`}
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setApprovalModal({ item, mode: 'reject' })}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title={`Rejeitar ${ENTITY_TAG[item.entity]}`}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {filteredActionQueue.length > 5 && (
                        <div className="px-5 py-2.5 border-t border-gray-50 text-center">
                            <button
                                onClick={() => onNavigate('financial-approval')}
                                className="text-xs font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
                            >
                                Ver todos os {filteredActionQueue.length} itens →
                            </button>
                        </div>
                    )}
                </div>

                {/* Minhas Tarefas — movido de dentro do BIDashboard */}
                <MyTasksWidget orgId={organizationId ?? undefined} onNavigate={onNavigate} />
            </div>

            {/* Faixa 3 — Resumo macro. Só 2 âncoras + link; o BI Executivo (BIDashboard)
                continua sendo o destino de análise, não é duplicado aqui. */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-sm font-black text-gray-900">Resumo Macro</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                            {([30, 60, 90] as CashflowDays[]).map(d => (
                                <button
                                    key={d}
                                    onClick={() => setCashflowDays(d)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        cashflowDays === d ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    {d}d
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => onNavigate('bi-executivo')}
                            className="flex items-center gap-1.5 text-xs font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors px-3 py-2"
                        >
                            BI Executivo <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <KpiCard
                        label="Caixa Projetado"
                        value={cashflowLoading ? '...' : fBRL(caixaProjetado)}
                        sub={`Saldo acumulado em ${cashflowDays} dias`}
                        icon={<BarChart3 className="w-5 h-5" />}
                        color={caixaProjetado != null && caixaProjetado < 0 ? 'red' : 'emerald'}
                        onClick={() => onNavigate('bi-executivo')}
                    />
                    <KpiCard
                        label="Obras em Risco"
                        value={loading ? '...' : obrasEmRisco}
                        sub={obrasEmAtencao > 0 ? `+ ${obrasEmAtencao} em atenção` : 'Nenhuma em atenção'}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        color={obrasEmRisco > 0 ? 'red' : 'emerald'}
                        onClick={() => onNavigate('bi-executivo')}
                    />
                </div>
            </section>

            {/* Aprovar/rejeitar direto da fila — reaproveita o modal do FinancialApprovalModule,
                não duplica a lógica de dispatch por entidade nem os rótulos de alçada. */}
            {approvalModal && (
                <ApproveRejectModal
                    item={approvalModal.item}
                    mode={approvalModal.mode}
                    userEmail={userEmail}
                    config={approvalConfig}
                    onDone={() => { setApprovalModal(null); load(); }}
                    onClose={() => setApprovalModal(null)}
                />
            )}
        </div>
    );
};

export default CentralControle;
