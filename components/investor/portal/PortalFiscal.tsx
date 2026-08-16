import React from 'react';
import { Info } from 'lucide-react';
import { InvestorContribution } from '../../../services/investorContributionsService';
import { CardHeader, fmtBRLCents, KpiStrip, PortalCard, PortalEmpty, Td, Th } from './PortalKit';

interface Props {
    contributions: InvestorContribution[];
    projectNames: Map<string, string>;
}

/**
 * Informativo de rendimentos — mesma conta do `TaxReport.tsx` do app, no
 * vocabulário do portal (§24). Não recalcula nada além do que o app já mostra:
 * custo de aquisição (aportes liquidados) e rendimentos (dividendos +
 * distribuições liquidados), por empreendimento.
 */
const PortalFiscal: React.FC<Props> = ({ contributions, projectNames }) => {
    // Ano-calendário anterior é o que se declara no exercício corrente.
    const ano = new Date().getFullYear() - 1;

    const liquidados = contributions.filter(c => c.status === 'liquidado');
    const totalAportado = liquidados.filter(c => c.type === 'aporte').reduce((s, c) => s + Number(c.amount), 0);
    const totalRendimentos = liquidados
        .filter(c => c.type === 'dividendo' || c.type === 'distribuicao')
        .reduce((s, c) => s + Number(c.amount), 0);

    const porProjeto = new Map<string, { nome: string; custo: number; rendimentos: number }>();
    liquidados.forEach(c => {
        const nome = projectNames.get(c.project_id) ?? 'Empreendimento';
        if (!porProjeto.has(c.project_id)) porProjeto.set(c.project_id, { nome, custo: 0, rendimentos: 0 });
        const e = porProjeto.get(c.project_id)!;
        if (c.type === 'aporte') e.custo += Number(c.amount);
        if (c.type === 'dividendo' || c.type === 'distribuicao') e.rendimentos += Number(c.amount);
    });
    const linhas = [...porProjeto.values()].filter(l => l.custo > 0 || l.rendimentos > 0);

    return (
        <div className="space-y-3">
            <KpiStrip
                items={[
                    { label: `Custo de aquisição`, value: fmtBRLCents(totalAportado), hint: 'Aportes liquidados' },
                    { label: 'Rendimentos recebidos', value: fmtBRLCents(totalRendimentos), hint: 'Dividendos e distribuições' },
                    { label: 'Ano-calendário', value: String(ano) },
                ]}
            />

            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Informativo de rendimentos"
                    subtitle="Use os valores abaixo para preencher a declaração de Imposto de Renda"
                />
                <div className="overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[560px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Empreendimento</Th>
                                <Th>Custo de aquisição</Th>
                                <Th>Rendimentos</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {linhas.length === 0 ? (
                                <tr>
                                    <td colSpan={3}>
                                        <PortalEmpty
                                            title="Nenhum aporte ou rendimento liquidado"
                                            subtitle="O informativo aparece quando houver movimentação liquidada no período."
                                        />
                                    </td>
                                </tr>
                            ) : linhas.map((l, i) => (
                                <tr key={`${l.nome}-${i}`} className="hover:bg-gray-50/70 transition-colors">
                                    <Td className="text-[#1F2430] font-medium">{l.nome}</Td>
                                    <Td className="tabular-nums">{fmtBRLCents(l.custo)}</Td>
                                    <Td className="tabular-nums">{fmtBRLCents(l.rendimentos)}</Td>
                                </tr>
                            ))}
                        </tbody>
                        {linhas.length > 0 && (
                            <tfoot>
                                <tr className="border-t border-[#ECECEF] bg-[#FAFAFB]">
                                    <Td className="text-[#8A8F9A]">Total</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRLCents(totalAportado)}</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRLCents(totalRendimentos)}</Td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                <div className="flex items-start gap-2.5 px-5 py-3.5 border-t border-[#ECECEF] bg-[#FAFAFB]">
                    <Info className="w-4 h-4 text-[#8A8F9A] shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[#8A8F9A] leading-relaxed">
                        Demonstrativo informativo, gerado a partir das movimentações registradas.
                        Não substitui orientação contábil — confirme o enquadramento com seu contador
                        antes de declarar.
                    </p>
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalFiscal;
