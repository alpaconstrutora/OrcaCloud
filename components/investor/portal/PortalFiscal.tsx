import React from 'react';
import { Info } from 'lucide-react';
import { InvestorContribution } from '../../../services/investorContributionsService';
import { CardHeader, fmtBRLCents, KpiStrip, PortalCard, PortalEmpty, Td, Th } from '../../portal/PortalKit';
import { anosComMovimento, informeDoAno } from '../../../utils/informeDeRendimentos';

interface Props {
    contributions: InvestorContribution[];
    projectNames: Map<string, string>;
}

/**
 * Informativo de rendimentos do ano escolhido — a mesma conta do `TaxReport.tsx` do app
 * (utils/informeDeRendimentos, Fase B5 do plano 2026-11-21-portal-do-investidor-consolidacao): rendimentos pagos
 * no ano e a posição de custo em 31/12 (com a do ano anterior, como pede Bens e Direitos).
 */
const PortalFiscal: React.FC<Props> = ({ contributions, projectNames }) => {
    // Padrão: o ano-calendário anterior, que é o que se declara no exercício corrente.
    const anoPadrao = new Date().getFullYear() - 1;
    const anos = React.useMemo(() => {
        const comMovimento = anosComMovimento(contributions);
        return [...new Set([anoPadrao, ...comMovimento])].sort((a, b) => b - a);
    }, [contributions, anoPadrao]);
    const [ano, setAno] = React.useState(anoPadrao);
    const informe = React.useMemo(
        () => informeDoAno(contributions, ano, id => projectNames.get(id) ?? 'Empreendimento'),
        [contributions, ano, projectNames],
    );

    return (
        <div className="space-y-3">
            <KpiStrip
                items={[
                    { label: `Custo de aquisição em 31/12/${ano}`, value: fmtBRLCents(informe.custoAtual), hint: `Em 31/12/${ano - 1}: ${fmtBRLCents(informe.custoAnterior)}` },
                    { label: `Rendimentos recebidos em ${ano}`, value: fmtBRLCents(informe.rendimentos), hint: 'Dividendos e distribuições' },
                    { label: 'Ano-calendário', value: String(ano) },
                ]}
            />

            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Informativo de rendimentos"
                    subtitle="Use os valores abaixo para preencher a declaração de Imposto de Renda"
                    right={(
                        <label className="flex items-center gap-2 text-[12px] text-[#8A8F9A]">
                            Ano
                            <select
                                aria-label="Ano-calendário"
                                value={ano}
                                onChange={e => setAno(Number(e.target.value))}
                                className="h-9 px-3 bg-white border border-[#ECECEF] rounded-[6px] text-sm text-[#1F2430]"
                            >
                                {anos.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </label>
                    )}
                />
                <div className="overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Empreendimento</Th>
                                <Th>Custo em 31/12/{ano - 1}</Th>
                                <Th>Custo em 31/12/{ano}</Th>
                                <Th>Rendimentos em {ano}</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {informe.linhas.length === 0 ? (
                                <tr>
                                    <td colSpan={4}>
                                        <PortalEmpty
                                            title={`Nenhum aporte ou rendimento liquidado até ${ano}`}
                                            subtitle="O informativo aparece quando houver movimentação liquidada no período."
                                        />
                                    </td>
                                </tr>
                            ) : informe.linhas.map(l => (
                                <tr key={l.projectId} className="hover:bg-gray-50/70 transition-colors">
                                    <Td className="text-[#1F2430] font-medium">{l.nome}</Td>
                                    <Td className="tabular-nums">{fmtBRLCents(l.custoAnterior)}</Td>
                                    <Td className="tabular-nums">{fmtBRLCents(l.custoAtual)}</Td>
                                    <Td className="tabular-nums">{fmtBRLCents(l.rendimentos)}</Td>
                                </tr>
                            ))}
                        </tbody>
                        {informe.linhas.length > 0 && (
                            <tfoot>
                                <tr className="border-t border-[#ECECEF] bg-[#FAFAFB]">
                                    <Td className="text-[#8A8F9A]">Total</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRLCents(informe.custoAnterior)}</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRLCents(informe.custoAtual)}</Td>
                                    <Td className="font-semibold text-[#1F2430] tabular-nums">{fmtBRLCents(informe.rendimentos)}</Td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                <div className="flex items-start gap-2.5 px-5 py-3.5 border-t border-[#ECECEF] bg-[#FAFAFB]">
                    <Info className="w-4 h-4 text-[#8A8F9A] shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[#8A8F9A] leading-relaxed">
                        Demonstrativo informativo, gerado a partir das movimentações registradas.
                        {informe.semData > 0 && ` ${informe.semData} lançamento(s) liquidado(s) sem data de pagamento ficam de fora.`}
                        {' '}Não substitui orientação contábil — confirme o enquadramento com seu contador antes de declarar.
                    </p>
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalFiscal;
