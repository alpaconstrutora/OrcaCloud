import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { CardHeader, fmtBRL, fmtBRLCents, KpiStrip, PortalCard, PortalEmpty, TagChip, Td, Th } from '../../portal/PortalKit';

export interface PortalSpe {
    id: string;
    name: string;
    cnpj?: string | null;
    capital_social?: number | null;
    project_name?: string | null;
    quota_count?: number | null;
    ownership_pct?: number | null;
    capital_calls_total?: number | null;
    capital_paid?: number | null;
    partners_count?: number | null;
}

interface Props {
    spes: PortalSpe[];
}

const formatCnpj = (v?: string | null) => {
    if (!v) return '—';
    const d = v.replace(/\D/g, '');
    return d.length === 14
        ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
        : v;
};

/**
 * "Minhas SPEs" — só as sociedades em que este investidor é sócio, e só a
 * participação dele. A tela do gestor mostra todos os sócios; aqui isso não
 * pode aparecer, então a RPC devolve apenas a contagem (ver
 * `fn_investor_portal_get_spes`).
 */
const PortalSpes: React.FC<Props> = ({ spes }) => {
    const chamado = spes.reduce((s, e) => s + Number(e.capital_calls_total ?? 0), 0);
    const integralizado = spes.reduce((s, e) => s + Number(e.capital_paid ?? 0), 0);
    const aIntegralizar = Math.max(0, chamado - integralizado);

    return (
        <div className="space-y-3">
            <KpiStrip
                items={[
                    { label: 'SPEs', value: String(spes.length) },
                    { label: 'Capital chamado', value: fmtBRL(chamado) },
                    { label: 'Integralizado', value: fmtBRL(integralizado) },
                    {
                        label: 'A integralizar',
                        value: fmtBRL(aIntegralizar),
                        ...(aIntegralizar > 0 ? { delta: 'em aberto', direction: 'flat' as const } : {}),
                    },
                ]}
            />

            <PortalCard className="overflow-hidden">
                <CardHeader title="Minhas SPEs" subtitle="Sociedades de propósito específico em que você é sócio" />
                <div className="overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[820px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>SPE</Th>
                                <Th>CNPJ</Th>
                                <Th>Empreendimento</Th>
                                <Th>Cotas</Th>
                                <Th>Participação</Th>
                                <Th>Chamado</Th>
                                <Th>Integralizado</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {spes.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <PortalEmpty
                                            icon={<LayoutGrid className="w-9 h-9" />}
                                            title="Nenhuma SPE vinculada"
                                            subtitle="Quando você entrar como sócio de uma SPE, ela aparece aqui."
                                        />
                                    </td>
                                </tr>
                            ) : spes.map(e => {
                                const pendente = Math.max(0, Number(e.capital_calls_total ?? 0) - Number(e.capital_paid ?? 0));
                                return (
                                    <tr key={e.id} className="hover:bg-gray-50/70 transition-colors">
                                        <Td className="text-[#1F2430] font-medium">
                                            {e.name}
                                            {e.partners_count ? (
                                                <span className="block text-[12px] text-[#A0A4AD] font-normal">
                                                    {e.partners_count} sócio{e.partners_count === 1 ? '' : 's'}
                                                </span>
                                            ) : null}
                                        </Td>
                                        <Td className="text-[#8A8F9A] tabular-nums whitespace-nowrap">{formatCnpj(e.cnpj)}</Td>
                                        <Td className="text-[#8A8F9A]">{e.project_name || '—'}</Td>
                                        <Td className="tabular-nums">{e.quota_count ?? '—'}</Td>
                                        <Td>
                                            <TagChip>
                                                {e.ownership_pct != null
                                                    ? `${Number(e.ownership_pct).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
                                                    : '—'}
                                            </TagChip>
                                        </Td>
                                        <Td className="tabular-nums">{fmtBRLCents(Number(e.capital_calls_total ?? 0))}</Td>
                                        <Td className="tabular-nums">
                                            <span className={pendente > 0 ? 'text-[#C24428]' : 'text-[#1F7A3D]'}>
                                                {fmtBRLCents(Number(e.capital_paid ?? 0))}
                                            </span>
                                            {pendente > 0 && (
                                                <span className="block text-[12px] text-[#A0A4AD]">
                                                    faltam {fmtBRL(pendente)}
                                                </span>
                                            )}
                                        </Td>
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

export default PortalSpes;
