import React, { useState, useMemo } from 'react';
import { DollarSign, CheckCircle2, Clock, AlertCircle, TrendingUp, Building2 } from 'lucide-react';
import type { BrokerCommission } from '../../types';
import { brokerService } from '../../services/brokerService';
import { brokerPortalService } from '../../services/brokerPortalService';
import { useOrgContext } from '../../hooks/useOrgContext';
import {
    ExpandableItem, ExpandableList, FilterChips, KpiProgressCard, MarcoLinha, RodapeDoItem, SecaoDoItem,
    StatusBadge, moedaBR, percentual, type SituacaoVisual,
} from '../portal/PortalCardsKit';

interface BrokerCommissionsProps {
    brokerEmail: string;
    portalToken?: string;
    /**
     * Celular (BrokerPortalMobile): resumo em um cartão só, filtros em faixa
     * rolável, linhas enxutas. Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (F3).
     */
    compacto?: boolean;
}

const STATUS_CONFIG: Record<BrokerCommission['status'], SituacaoVisual> = {
    PENDENTE: { label: 'Pendente', color: 'text-gray-500', bg: 'bg-gray-50', icon: Clock },
    PARCIAL: { label: 'Parcial', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertCircle },
    LIBERADA: { label: 'Liberada', color: 'text-blue-600', bg: 'bg-blue-50', icon: CheckCircle2 },
    PAGA: { label: 'Paga', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
};

const BrokerCommissions: React.FC<BrokerCommissionsProps> = ({ brokerEmail, portalToken, compacto = false }) => {
    // Visão interna (gestor/prévia): org do seletor do topo (REGRA #5). Pelo
    // link, org e e-mail vêm do token, no banco.
    const { orgId: organizationId } = useOrgContext();
    const [commissions, setCommissions] = useState<BrokerCommission[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<BrokerCommission['status'] | 'all'>('all');

    React.useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                if (portalToken) {
                    const data = await brokerPortalService.getCommissionsByToken(portalToken);
                    setCommissions(data as BrokerCommission[]);
                } else {
                    const data = await brokerService.listCommissions(organizationId, brokerEmail);
                    setCommissions(data);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [organizationId, brokerEmail, portalToken]);

    const formatCurrency = moedaBR;

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return commissions;
        return commissions.filter(c => c.status === statusFilter);
    }, [commissions, statusFilter]);

    const totals = useMemo(() => ({
        predicted: commissions.reduce((a, c) => a + (c.commission_predicted || 0), 0),
        released: commissions.reduce((a, c) => a + (c.commission_released || 0), 0),
        paid: commissions.reduce((a, c) => a + (c.commission_paid || 0), 0),
    }), [commissions]);

    return (
        <div className={compacto ? 'space-y-4' : 'space-y-6'}>
            {/* Resumo no celular: as três somas num cartão, uma por linha */}
            {compacto && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5" data-tour="comissoes-totais">
                    {[
                        { label: 'Prevista', valor: totals.predicted, cor: 'text-gray-900', barra: 'bg-gray-400', pct: 100 },
                        { label: 'Liberada', valor: totals.released, cor: 'text-blue-700', barra: 'bg-blue-500', pct: totals.predicted > 0 ? totals.released / totals.predicted * 100 : 0 },
                        { label: 'Paga', valor: totals.paid, cor: 'text-emerald-700', barra: 'bg-emerald-500', pct: totals.predicted > 0 ? totals.paid / totals.predicted * 100 : 0 },
                    ].map(l => (
                        <div key={l.label}>
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-xs text-gray-500">{l.label}</span>
                                <span className={`text-base font-bold ${l.cor}`}>{formatCurrency(l.valor)}</span>
                            </div>
                            <div className="mt-1 bg-gray-100 rounded-full h-1.5">
                                <div className={`${l.barra} rounded-full h-1.5`} style={{ width: `${l.pct}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary Cards */}
            {!compacto && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="comissoes-totais">
                <KpiProgressCard label="Prevista Total" value={formatCurrency(totals.predicted)} icon={TrendingUp} tone="gray" percent={100} />
                <KpiProgressCard label="Liberada" value={formatCurrency(totals.released)} icon={CheckCircle2} tone="blue" percent={percentual(totals.released, totals.predicted)} />
                <KpiProgressCard label="Paga" value={formatCurrency(totals.paid)} icon={DollarSign} tone="emerald" percent={percentual(totals.paid, totals.predicted)} />
            </div>
            )}

            {/* Status Filter */}
            <FilterChips
                total={commissions.length}
                chips={(Object.entries(STATUS_CONFIG) as [BrokerCommission['status'], SituacaoVisual][]).map(([status, cfg]) => ({
                    ...cfg, id: status, count: commissions.filter(c => c.status === status).length,
                }))}
                active={statusFilter}
                onChange={setStatusFilter}
                compacto={compacto}
            />

            {/* Commission List */}
            <ExpandableList
                data-tour="comissoes-lista"
                vazio={!loading && filtered.length === 0
                    ? (commissions.length === 0 ? 'Nenhuma comissão ainda — ela aparece quando você é o corretor de uma negociação com comissão.' : 'Nenhuma comissão com esse status.')
                    : null}
            >
                {filtered.map(comm => {
                    const isExpanded = expandedId === comm.id;
                    return (
                        <ExpandableItem
                            key={comm.id}
                            icon={Building2}
                            compacto={compacto}
                            expanded={isExpanded}
                            onToggle={() => setExpandedId(isExpanded ? null : comm.id)}
                            title={<>{comm.deal_type ? comm.unit_number : `Unidade ${comm.unit_number}`} {comm.block ? `• ${comm.block}` : ''}</>}
                            subtitle={<>
                                {comm.commission_base === 'PARCELA'
                                    ? <>Locação: {formatCurrency(comm.sale_value)}/mês{comm.commission_pct ? ` • ${comm.commission_pct}% por parcela` : ''}{comm.parcelas_total ? ` • ${comm.parcelas_total} parcelas` : ''}</>
                                    : <>{comm.deal_type === 'RENTAL' ? 'Locação' : 'Venda'}: {formatCurrency(comm.sale_value)}{comm.commission_pct ? ` • ${comm.commission_pct}% comissão` : ''}</>}
                                {comm.contract_number ? ` • ${comm.contract_number}` : ''}
                            </>}
                            value={formatCurrency(comm.commission_predicted || 0)}
                            badge={<StatusBadge situacao={STATUS_CONFIG[comm.status]} />}
                        >
                            {comm.milestones ? (
                                <>
                                    <SecaoDoItem titulo="Marcos de Liberação">
                                        {comm.milestones.map((m, idx) => (
                                            <MarcoLinha key={idx} tone={m.paid ? 'feito' : 'pendente'} name={m.name} date={m.date} value={formatCurrency(m.value)} />
                                        ))}
                                    </SecaoDoItem>
                                    <RodapeDoItem linhas={[{ label: 'Total Previsto', value: formatCurrency(comm.commission_predicted || 0) }]} />
                                </>
                            ) : null}
                        </ExpandableItem>
                    );
                })}
            </ExpandableList>
        </div>
    );
};

export default BrokerCommissions;
