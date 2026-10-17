import React, { useState, useMemo } from 'react';
import { CalendarDays, HandCoins } from 'lucide-react';
import type { BrokerCommission } from '../../types';
import { brokerService } from '../../services/brokerService';
import { brokerPortalService } from '../../services/brokerPortalService';
import { useOrgContext } from '../../hooks/useOrgContext';
import {
    CardHeader, fmtBRL, fmtBRLCents, fmtDate, KpiItem, KpiStrip, parseDate, PillTone, PortalCard,
    PortalEmpty, PortalLoading, PortalTabs, StatusPill, Td, Th,
} from '../portal/PortalKit';

interface BrokerCommissionsProps {
    brokerEmail: string;
    portalToken?: string;
    /**
     * Celular (BrokerPortalMobile): as parcelas viram lista empilhada em vez de
     * tabela. Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (F3).
     */
    compacto?: boolean;
}

export type SituacaoDaParcela = 'PENDENTE' | 'LIBERADA' | 'PAGA';

/** Uma linha da tabela = um marco (parcela) de uma comissão. */
export interface ParcelaDaComissao {
    key: string;
    nome: string;
    data: string | null;
    valor: number;
    situacao: SituacaoDaParcela;
    negociacao: string;
    contrato: string | null;
}

/**
 * Situação de um marco. `released` vem do banco desde aplicar_20271017950000
 * (mesma regra do `commission_released` agregado); payload sem o campo cai em
 * "liberada só se paga" — nunca adivinha pelo texto do nome.
 */
export function situacaoDoMarco(m: { paid: boolean; released?: boolean }): SituacaoDaParcela {
    if (m.paid) return 'PAGA';
    return m.released ? 'LIBERADA' : 'PENDENTE';
}

const tsDe = (iso: string | null) => parseDate(iso)?.getTime() ?? Infinity;

/** Achata as comissões em parcelas, por data crescente (sem data no fim). Puro, para o teste. */
export function parcelasDasComissoes(comissoes: BrokerCommission[]): ParcelaDaComissao[] {
    return comissoes
        .flatMap(c => (c.milestones ?? []).map((m, i) => ({
            key: `${c.id}:${i}`,
            nome: m.name,
            data: m.date ?? null,
            valor: Number(m.value ?? 0),
            situacao: situacaoDoMarco(m),
            negociacao: [c.deal_type ? c.unit_number : `Unidade ${c.unit_number}`, c.block].filter(Boolean).join(' • '),
            contrato: c.contract_number ?? null,
        })))
        .sort((a, b) => tsDe(a.data) - tsDe(b.data));
}

/** Resumo da faixa de KPIs — puro. Próxima = a pendente mais antiga com data. */
export function resumoDasComissoes(comissoes: BrokerCommission[], parcelas: ParcelaDaComissao[]) {
    const prevista = comissoes.reduce((a, c) => a + (c.commission_predicted || 0), 0);
    const liberada = comissoes.reduce((a, c) => a + (c.commission_released || 0), 0);
    const paga = comissoes.reduce((a, c) => a + (c.commission_paid || 0), 0);
    const proxima = parcelas.find(p => p.situacao === 'PENDENTE' && p.data) ?? null;
    return { prevista, aLiberar: Math.max(0, prevista - liberada), liberada, aReceber: Math.max(0, liberada - paga), paga, proxima };
}

/** Mesmo vocabulário de pílula do Financeiro do Portal do Parceiro. */
const PILL: Record<SituacaoDaParcela, { label: string; tone: PillTone }> = {
    PAGA:     { label: 'Paga',     tone: 'good' },
    LIBERADA: { label: 'Liberada', tone: 'info' },
    PENDENTE: { label: 'Pendente', tone: 'neutral' },
};

const FILTROS = [
    { id: 'todas',     label: 'Todas',     fn: (_s: SituacaoDaParcela) => true },
    { id: 'pendentes', label: 'Pendentes', fn: (s: SituacaoDaParcela) => s === 'PENDENTE' },
    { id: 'liberadas', label: 'Liberadas', fn: (s: SituacaoDaParcela) => s === 'LIBERADA' },
    { id: 'pagas',     label: 'Pagas',     fn: (s: SituacaoDaParcela) => s === 'PAGA' },
] as const;
type FiltroId = typeof FILTROS[number]['id'];

/**
 * Aba Comissões do Portal do Corretor — desde 2026-10-17 no desenho da aba
 * Financeiro do Portal do Parceiro (`components/partner/PartnerPortalFinanceiro.tsx`):
 * faixa de KPIs, faixa da próxima liberação e tabela de parcelas com abas de
 * filtro, tudo do `PortalKit` (guia §24). Plano:
 * docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md (2º pedido).
 */
const BrokerCommissions: React.FC<BrokerCommissionsProps> = ({ brokerEmail, portalToken, compacto = false }) => {
    // Visão interna (gestor/prévia): org do seletor do topo (REGRA #5). Pelo
    // link, org e e-mail vêm do token, no banco.
    const { orgId: organizationId } = useOrgContext();
    const [commissions, setCommissions] = useState<BrokerCommission[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState<FiltroId>('todas');

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

    const parcelas = useMemo(() => parcelasDasComissoes(commissions), [commissions]);
    const resumo = useMemo(() => resumoDasComissoes(commissions, parcelas), [commissions, parcelas]);
    const ativo = FILTROS.find(f => f.id === filtro) ?? FILTROS[0];
    const visiveis = parcelas.filter(p => ativo.fn(p.situacao));

    const diasAte = (() => {
        const d = parseDate(resumo.proxima?.data);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    const kpis: KpiItem[] = [
        { label: 'Prevista', value: fmtBRL(resumo.prevista), hint: `${commissions.length} ${commissions.length === 1 ? 'comissão' : 'comissões'}` },
        { label: 'A liberar', value: fmtBRL(resumo.aLiberar) },
        { label: 'Liberada', value: fmtBRL(resumo.liberada), ...(resumo.aReceber > 0 ? { delta: 'a receber', direction: 'flat' as const } : {}) },
        { label: 'Paga', value: fmtBRL(resumo.paga) },
        {
            label: 'Próxima liberação',
            value: resumo.proxima ? fmtDate(resumo.proxima.data) : '—',
            hint: diasAte != null ? (diasAte < 0 ? `aluguel atrasado há ${Math.abs(diasAte)} dias` : `em ${diasAte} dias`) : undefined,
        },
    ];

    if (loading) {
        return <PortalCard><PortalLoading label="Carregando comissões..." /></PortalCard>;
    }

    const vazio = (
        <PortalEmpty
            icon={<HandCoins className="w-9 h-9" />}
            title={parcelas.length === 0 ? 'Nenhuma comissão ainda' : 'Nenhuma parcela neste filtro'}
            subtitle={parcelas.length === 0 ? 'Ela aparece quando você é o corretor de uma negociação com comissão.' : undefined}
        />
    );

    return (
        <div className="space-y-3">
            <KpiStrip items={kpis} data-tour="comissoes-totais" />

            {resumo.proxima && (
                <PortalCard className="px-5 py-3.5 flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-[#E1553C] shrink-0" />
                    <p className="text-[13px] text-[#4A505C]">
                        Próxima liberação: <strong className="font-semibold text-[#1F2430]">{fmtBRLCents(resumo.proxima.valor)}</strong>
                        {' '}em <strong className="font-semibold text-[#1F2430]">{fmtDate(resumo.proxima.data)}</strong>
                        {` · ${resumo.proxima.nome} · ${resumo.proxima.negociacao}`}
                    </p>
                </PortalCard>
            )}

            <PortalCard className="overflow-hidden" data-tour="comissoes-lista">
                <CardHeader title="Comissões" subtitle="Parcelas das suas comissões" />
                <PortalTabs
                    tabs={FILTROS.map(f => ({ id: f.id, label: f.label, count: parcelas.filter(p => f.fn(p.situacao)).length }))}
                    active={filtro}
                    onChange={id => setFiltro(id as FiltroId)}
                />
                {compacto ? (
                    // Celular: a mesma informação da tabela, em linhas empilhadas.
                    visiveis.length === 0 ? vazio : (
                        <ul className="divide-y divide-[#F4F4F6]">
                            {visiveis.map(p => (
                                <li key={p.key} className="px-4 py-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm text-[#1F2430]">{p.nome}</p>
                                        <p className="text-[12px] text-[#8A8F9A] mt-0.5">{p.negociacao} · {fmtDate(p.data)}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm text-[#1F2430] font-medium tabular-nums">{fmtBRLCents(p.valor)}</p>
                                        <div className="mt-1"><StatusPill tone={PILL[p.situacao].tone}>{PILL[p.situacao].label}</StatusPill></div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px]">
                            <thead>
                                <tr className="border-b border-[#ECECEF]">
                                    <Th>Parcela</Th>
                                    <Th>Negociação</Th>
                                    <Th>Data</Th>
                                    <Th>Valor</Th>
                                    <Th>Status</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F4F4F6]">
                                {visiveis.length === 0 ? (
                                    <tr><td colSpan={5}>{vazio}</td></tr>
                                ) : visiveis.map(p => (
                                    <tr key={p.key} className="hover:bg-gray-50/70 transition-colors">
                                        <Td className="text-[#1F2430]">{p.nome}</Td>
                                        <Td>
                                            <span className="text-[#1F2430]">{p.negociacao}</span>
                                            {p.contrato && <span className="block text-[12px] text-[#8A8F9A]">{p.contrato}</span>}
                                        </Td>
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(p.data)}</Td>
                                        <Td className="text-[#1F2430] font-medium tabular-nums whitespace-nowrap">{fmtBRLCents(p.valor)}</Td>
                                        <Td><StatusPill tone={PILL[p.situacao].tone}>{PILL[p.situacao].label}</StatusPill></Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>
        </div>
    );
};

export default BrokerCommissions;
