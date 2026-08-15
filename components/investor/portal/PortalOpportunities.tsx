import React from 'react';
import { Building2, CheckCircle2, ChevronDown, ExternalLink, MapPin, Send } from 'lucide-react';
import {
    InvestorOpportunity, OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS, OpportunityStatus,
} from '../../../services/investorPortalService';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import { Investor } from '../../../services/investorService';
import {
    CardHeader, DetailField, fmtBRL, PortalCard, PortalEmpty, PrimaryButton, SoftButton,
    StatusPill, TagChip, Td, Th, PillTone,
} from './PortalKit';

interface Props {
    opportunities: InvestorOpportunity[];
    investorProfile?: Investor | null;
    portalToken?: string;
}

const STATUS_TONE: Record<OpportunityStatus, PillTone> = {
    estudo: 'muted',
    viabilidade: 'neutral',
    lancamento: 'info',
    captacao: 'good',
    encerrada: 'accent',
};

const pct = (v?: number | null) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const PortalOpportunities: React.FC<Props> = ({ opportunities, investorProfile, portalToken }) => {
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [sending, setSending] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState<string[]>([]);
    const [error, setError] = React.useState<string | null>(null);

    const submitInterest = async (opp: InvestorOpportunity) => {
        if (!portalToken || !opp.id) return;
        setSending(opp.id);
        setError(null);
        try {
            await investorPortalTokenService.submitInterestByToken(portalToken, {
                opportunityId: opp.id,
                name: investorProfile?.name || 'Investidor',
                email: investorProfile?.email || undefined,
                phone: (investorProfile as any)?.phone || undefined,
                role: 'investidor',
                message: 'Interesse manifestado pelo Portal do Investidor.',
            });
            setSent(prev => [...prev, opp.id!]);
        } catch (e) {
            console.error('Erro ao registrar interesse', e);
            setError('Não foi possível registrar seu interesse agora. Tente novamente em instantes.');
        } finally {
            setSending(null);
        }
    };

    return (
        <div className="space-y-3">
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Oportunidades"
                    subtitle={opportunities.length > 0
                        ? `${opportunities.length} empreendimento${opportunities.length === 1 ? '' : 's'} aberto${opportunities.length === 1 ? '' : 's'} para captação`
                        : undefined}
                />

                {error && (
                    <div className="mx-5 mb-3 px-3 py-2 rounded-[8px] bg-[#FDEDE8] text-[13px] text-[#C24428]">{error}</div>
                )}

                <div className="overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[820px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Empreendimento</Th>
                                <Th>Tipo</Th>
                                <Th>VGV</Th>
                                <Th>ROI</Th>
                                <Th>TIR</Th>
                                <Th>Ticket mínimo</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {opportunities.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <PortalEmpty
                                            icon={<Building2 className="w-9 h-9" />}
                                            title="Nenhuma oportunidade publicada"
                                            subtitle="Assim que houver captação aberta, ela aparece aqui."
                                        />
                                    </td>
                                </tr>
                            ) : opportunities.map((o, i) => {
                                const key = o.id ?? `opp-${i}`;
                                const isOpen = expanded === key;
                                const status = (o.status ?? 'estudo') as OpportunityStatus;
                                const funding = o.target_funding_value && o.current_funding_value != null
                                    ? Math.min(100, (o.current_funding_value / o.target_funding_value) * 100)
                                    : null;
                                return (
                                    <React.Fragment key={key}>
                                        <tr
                                            className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#FDF8F6]' : 'hover:bg-gray-50/70'}`}
                                            onClick={() => setExpanded(isOpen ? null : key)}
                                        >
                                            <Td className="text-[#1F2430] font-medium">
                                                <span className="inline-flex items-center gap-2">
                                                    <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate">{o.title}</span>
                                                        {(o.location_city || o.subtitle) && (
                                                            <span className="block text-[12px] text-[#A0A4AD] font-normal truncate">
                                                                {o.location_city
                                                                    ? `${o.location_city}${o.location_state ? `/${o.location_state}` : ''}`
                                                                    : o.subtitle}
                                                            </span>
                                                        )}
                                                    </span>
                                                </span>
                                            </Td>
                                            <Td>{o.opportunity_type ? <TagChip>{OPPORTUNITY_TYPE_LABELS[o.opportunity_type]}</TagChip> : '—'}</Td>
                                            <Td className="tabular-nums">{o.vgv ? fmtBRL(o.vgv) : '—'}</Td>
                                            <Td className={`tabular-nums ${(o.roi_pct ?? 0) > 0 ? 'text-emerald-600' : ''}`}>{pct(o.roi_pct)}</Td>
                                            <Td className="tabular-nums">{pct(o.tir_pct)}</Td>
                                            <Td className="tabular-nums">{o.ticket_min ? fmtBRL(o.ticket_min) : '—'}</Td>
                                            <Td><StatusPill tone={STATUS_TONE[status]}>{OPPORTUNITY_STATUS_LABELS[status]}</StatusPill></Td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                                                <Td colSpan={7} className="pb-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                                        <DetailField label="Localização">
                                                            {o.location_city
                                                                ? `${o.location_city}${o.location_state ? `/${o.location_state}` : ''}`
                                                                : '—'}
                                                        </DetailField>
                                                        <DetailField label="Área do terreno">{o.land_area_m2 ? `${o.land_area_m2.toLocaleString('pt-BR')} m²` : '—'}</DetailField>
                                                        <DetailField label="Área construída">{o.built_area_m2 ? `${o.built_area_m2.toLocaleString('pt-BR')} m²` : '—'}</DetailField>
                                                        <DetailField label="Pavimentos">{o.floors ?? '—'}</DetailField>
                                                        <DetailField label="Custo estimado">{o.cost_estimate ? fmtBRL(o.cost_estimate) : '—'}</DetailField>
                                                        <DetailField label="Prazo">{o.duration_months ? `${o.duration_months} meses` : '—'}</DetailField>
                                                        <DetailField label="Rentabilidade projetada">{o.projected_yield || pct(o.roi_pct)}</DetailField>
                                                        <DetailField label="Início previsto">
                                                            {o.expected_start
                                                                ? new Date(`${o.expected_start}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                                                                : '—'}
                                                        </DetailField>
                                                    </div>

                                                    {funding != null && (
                                                        <div className="mt-4 max-w-md">
                                                            <div className="flex items-center justify-between text-[12px] text-[#8A8F9A] mb-1.5">
                                                                <span>Captação</span>
                                                                <span className="tabular-nums">
                                                                    {fmtBRL(o.current_funding_value ?? 0)} de {fmtBRL(o.target_funding_value ?? 0)}
                                                                </span>
                                                            </div>
                                                            <div className="h-1.5 bg-white rounded-full overflow-hidden border border-[#F3D9D1]">
                                                                <div className="h-full bg-[#E1553C] rounded-full" style={{ width: `${funding}%` }} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-2 mt-4">
                                                        {portalToken && o.id && (
                                                            sent.includes(o.id) ? (
                                                                <span className="inline-flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#E7F6EC] text-[#1F7A3D] text-[13px] font-semibold">
                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                    Interesse registrado
                                                                </span>
                                                            ) : (
                                                                <PrimaryButton
                                                                    disabled={sending === o.id}
                                                                    onClick={() => submitInterest(o)}
                                                                >
                                                                    <Send className="w-4 h-4" />
                                                                    {sending === o.id ? 'Enviando...' : 'Tenho interesse'}
                                                                </PrimaryButton>
                                                            )
                                                        )}
                                                        {o.link && (
                                                            <SoftButton onClick={() => window.open(o.link, '_blank', 'noopener')}>
                                                                <ExternalLink className="w-4 h-4" />
                                                                Material completo
                                                            </SoftButton>
                                                        )}
                                                    </div>
                                                </Td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </PortalCard>

            {/* Galeria — só quando há capa cadastrada, para não deixar bloco vazio */}
            {opportunities.some(o => o.thumbnail_url) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {opportunities.filter(o => o.thumbnail_url).map((o, i) => (
                        <PortalCard key={o.id ?? `thumb-${i}`} className="overflow-hidden">
                            <img src={o.thumbnail_url!} alt={o.title} className="w-full h-36 object-cover" />
                            <div className="px-4 py-3">
                                <p className="text-sm font-semibold text-[#1F2430] truncate">{o.title}</p>
                                {o.location_city && (
                                    <p className="flex items-center gap-1 text-[12px] text-[#A0A4AD] mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {o.location_city}{o.location_state ? `/${o.location_state}` : ''}
                                    </p>
                                )}
                            </div>
                        </PortalCard>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PortalOpportunities;
