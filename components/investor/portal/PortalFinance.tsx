import React from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { InvestorContribution } from '../../../services/investorContributionsService';
import {
    CardHeader, fmtBRL, fmtBRLCents, fmtDate, KpiStrip, parseDate, PortalCard, PortalEmpty,
    PortalTabs, StatusPill, Td, Th, PillTone,
} from '../../portal/PortalKit';

interface Props {
    contributions: InvestorContribution[];
    /** id → nome do empreendimento (as contribuições só trazem project_id). */
    projectNames: Map<string, string>;
}

const TYPE_LABEL: Record<string, string> = {
    aporte: 'Aporte',
    retirada: 'Retirada',
    dividendo: 'Dividendo',
    distribuicao: 'Distribuição',
};

const STATUS: Record<string, { label: string; tone: PillTone }> = {
    liquidado: { label: 'Liquidado', tone: 'good' },
    pendente: { label: 'Aguardando', tone: 'neutral' },
    atrasado: { label: 'Atrasado', tone: 'accent' },
    cancelado: { label: 'Cancelado', tone: 'muted' },
};

const PortalFinance: React.FC<Props> = ({ contributions, projectNames }) => {
    const [tab, setTab] = React.useState('todos');

    const soma = (fn: (c: InvestorContribution) => boolean) =>
        contributions.filter(fn).reduce((s, c) => s + Number(c.amount), 0);

    const totalAportado = soma(c => c.type === 'aporte' && c.status === 'liquidado');
    const totalRecebido = soma(c => (c.type === 'dividendo' || c.type === 'distribuicao') && c.status === 'liquidado');
    const emAberto = soma(c => c.type === 'aporte' && (c.status === 'pendente' || c.status === 'atrasado'));
    const atrasado = soma(c => c.status === 'atrasado');

    // Próximo compromisso: pendente com vencimento mais próximo
    const proximo = contributions
        .filter(c => c.status === 'pendente' && c.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
    const diasAte = (() => {
        const d = parseDate(proximo?.due_date);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    const kpis = [
        { label: 'Aportado', value: fmtBRL(totalAportado) },
        { label: 'Recebido', value: fmtBRL(totalRecebido) },
        { label: 'Em aberto', value: fmtBRL(emAberto), ...(emAberto > 0 ? { delta: 'a pagar', direction: 'flat' as const } : {}) },
        { label: 'Em atraso', value: fmtBRL(atrasado), ...(atrasado > 0 ? { delta: 'vencido', direction: 'down' as const } : {}) },
        {
            label: 'Próximo vencimento',
            value: proximo?.due_date ? fmtDate(proximo.due_date) : '—',
            hint: diasAte != null ? (diasAte < 0 ? `${Math.abs(diasAte)} dias em atraso` : `em ${diasAte} dias`) : undefined,
        },
    ];

    const filtros = [
        { id: 'todos', label: 'Todos', fn: () => true },
        { id: 'aportes', label: 'Aportes', fn: (c: InvestorContribution) => c.type === 'aporte' },
        { id: 'recebimentos', label: 'Recebimentos', fn: (c: InvestorContribution) => c.type === 'dividendo' || c.type === 'distribuicao' || c.type === 'retirada' },
        { id: 'abertos', label: 'Em aberto', fn: (c: InvestorContribution) => c.status === 'pendente' || c.status === 'atrasado' },
    ];

    const ativo = filtros.find(f => f.id === tab) ?? filtros[0];
    const linhas = contributions
        .filter(ativo.fn as (c: InvestorContribution) => boolean)
        .sort((a, b) => (b.paid_date ?? b.due_date ?? '').localeCompare(a.paid_date ?? a.due_date ?? ''));

    return (
        <div className="space-y-3">
            <KpiStrip items={kpis} />

            {proximo && (
                <PortalCard className="px-5 py-3.5 flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-[#E1553C] shrink-0" />
                    <p className="text-[13px] text-[#4A505C]">
                        Próximo compromisso: <strong className="font-semibold text-[#1F2430]">{fmtBRLCents(Number(proximo.amount))}</strong>
                        {' '}em <strong className="font-semibold text-[#1F2430]">{fmtDate(proximo.due_date)}</strong>
                        {projectNames.get(proximo.project_id) ? ` · ${projectNames.get(proximo.project_id)}` : ''}
                    </p>
                </PortalCard>
            )}

            <PortalCard className="overflow-hidden">
                <CardHeader title="Movimentações" subtitle="Aportes, dividendos e distribuições registrados na sua posição" />
                <PortalTabs
                    tabs={filtros.map(f => ({ id: f.id, label: f.label, count: contributions.filter(f.fn as (c: InvestorContribution) => boolean).length }))}
                    active={tab}
                    onChange={setTab}
                />
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Vencimento</Th>
                                <Th>Pagamento</Th>
                                <Th>Empreendimento</Th>
                                <Th>Tipo</Th>
                                <Th>Valor</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {linhas.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <PortalEmpty icon={<Wallet className="w-9 h-9" />} title="Nenhuma movimentação neste filtro" />
                                    </td>
                                </tr>
                            ) : linhas.map((c, i) => {
                                const st = STATUS[c.status] ?? { label: c.status, tone: 'muted' as PillTone };
                                return (
                                    <tr key={c.id ?? `mov-${i}`} className="hover:bg-gray-50/70 transition-colors">
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(c.due_date)}</Td>
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                {c.status === 'liquidado' && <CheckCircle2 className="w-3.5 h-3.5 text-[#1F7A3D]" />}
                                                {c.status === 'pendente' && <Clock className="w-3.5 h-3.5 text-[#8A6A16]" />}
                                                {c.status === 'atrasado' && <AlertCircle className="w-3.5 h-3.5 text-[#C24428]" />}
                                                {fmtDate(c.paid_date)}
                                            </span>
                                        </Td>
                                        <Td className="text-[#1F2430]">{projectNames.get(c.project_id) ?? '—'}</Td>
                                        <Td className="text-[#8A8F9A]">{TYPE_LABEL[c.type] ?? c.type}</Td>
                                        <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRLCents(Number(c.amount))}</Td>
                                        <Td><StatusPill tone={st.tone}>{st.label}</StatusPill></Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalFinance;
