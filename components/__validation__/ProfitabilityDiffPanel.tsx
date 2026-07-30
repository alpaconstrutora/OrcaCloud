/**
 * ⚠️ PAINEL TEMPORÁRIO — APAGAR APÓS O PORTÃO DA FASE 2.
 *
 * Compara, com dado real, o pipeline legado (`utils/__validation__/
 * profitabilityLegacy.ts`, tirado do commit ba3df7d) contra o extraído
 * (`utils/commercialInstallments.ts`). O que está sendo testado não é a lógica
 * — é a tradução das condições do componente (`settings.name === 'Gestão
 * Comercial'` → `mode`, etc.) feita na Fase 1.
 *
 * Como ligar: no console do navegador, na tela Gestão Financeira,
 *
 *     localStorage.setItem('orca_debug_profitability', '1'); location.reload();
 *
 * e para desligar:
 *
 *     localStorage.removeItem('orca_debug_profitability'); location.reload();
 *
 * Critério de aceite (PLANO_RENTABILIDADE_COMERCIAL.md, Fase 2): "IGUAL" nos 6
 * casos da matriz — modo Comercial × Obra, filtro ALL/SALE/RENTAL, e org em
 * "Todas as organizações". Print do painel é o veredito.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
    mergeInstallments,
    computeProfitabilityByProperty,
    type MergeInstallmentsInput,
    type CommercialTransaction,
    type PropertyProfitability,
} from '../../utils/commercialInstallments';
import {
    legacyDisplayInstallments,
    legacyProfitabilityByProperty,
    type LegacyInput,
} from '../../utils/__validation__/profitabilityLegacy';

export const isProfitabilityDebugOn = () =>
    typeof localStorage !== 'undefined' && localStorage.getItem('orca_debug_profitability') === '1';

const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Tolerância de ponto flutuante: meio centavo. Abaixo disso é ruído de IEEE-754. */
const EPS = 0.005;

interface Props {
    legacyInput: LegacyInput;
    extractedInput: MergeInstallmentsInput;
    transactions: CommercialTransaction[];
}

type Row = {
    name: string;
    legacy?: PropertyProfitability;
    extracted?: PropertyProfitability;
};

const ProfitabilityDiffPanel: React.FC<Props> = ({ legacyInput, extractedInput, transactions }) => {
    const legacyInstallments = legacyDisplayInstallments(legacyInput);
    const extractedInstallments = mergeInstallments(extractedInput);

    const legacyRows = legacyProfitabilityByProperty(legacyInstallments, transactions);
    const extractedRows = computeProfitabilityByProperty(extractedInstallments, transactions);

    const names = Array.from(new Set([...legacyRows.map(r => r.name), ...extractedRows.map(r => r.name)]));
    const rows: Row[] = names.map(name => ({
        name,
        legacy: legacyRows.find(r => r.name === name),
        extracted: extractedRows.find(r => r.name === name),
    }));

    const countMatch = legacyInstallments.length === extractedInstallments.length;
    const diffs = rows.filter(r => {
        if (!r.legacy || !r.extracted) return true;
        return (
            Math.abs(r.legacy.revenue - r.extracted.revenue) > EPS ||
            Math.abs(r.legacy.expense - r.extracted.expense) > EPS ||
            Math.abs(r.legacy.netRevenue - r.extracted.netRevenue) > EPS ||
            Math.abs(r.legacy.margin - r.extracted.margin) > EPS
        );
    });
    const ok = countMatch && diffs.length === 0;

    return (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className={`flex items-center gap-3 p-4 ${ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                {ok
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    : <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />}
                <div className="flex-1">
                    <p className={`text-sm font-medium ${ok ? 'text-emerald-800' : 'text-red-800'}`}>
                        {ok ? 'IGUAL — extração é neutra neste caso' : `DIVERGENTE — ${diffs.length} imóvel(is) com diferença`}
                    </p>
                    <p className="text-[13px] text-gray-600 mt-0.5">
                        Parcelas: legado {legacyInstallments.length} × extraído {extractedInstallments.length}
                        {!countMatch && ' ← contagem diferente'}
                        {' · '}modo {extractedInput.mode}
                        {' · '}filtro {extractedInput.dealTypeFilter}
                        {' · '}projeto "{legacyInput.settings.name || '—'}"
                    </p>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">painel temporário · Fase 2</span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-2">Imóvel</th>
                            <th className="px-4 py-2 text-right">Receita (leg → ext)</th>
                            <th className="px-4 py-2 text-right">Custo (leg → ext)</th>
                            <th className="px-4 py-2 text-right">Líquida (leg → ext)</th>
                            <th className="px-4 py-2 text-right">Margem (leg → ext)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rows.map(r => {
                            const bad = diffs.includes(r);
                            const cell = (a?: number, b?: number, suffix = '') => (
                                <td className={`px-4 py-2 text-right tabular-nums ${bad ? 'text-red-600' : 'text-gray-700'}`}>
                                    {a === undefined ? '—' : money(a)}{suffix}
                                    {' → '}
                                    {b === undefined ? '—' : money(b)}{suffix}
                                </td>
                            );
                            return (
                                <tr key={r.name} className={bad ? 'bg-red-50/40' : undefined}>
                                    <td className="px-4 py-2 text-gray-900">{r.name}</td>
                                    {cell(r.legacy?.revenue, r.extracted?.revenue)}
                                    {cell(r.legacy?.expense, r.extracted?.expense)}
                                    {cell(r.legacy?.netRevenue, r.extracted?.netRevenue)}
                                    {cell(r.legacy?.margin, r.extracted?.margin, '%')}
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                                Nenhum imóvel neste recorte — troque de obra ou de filtro para exercitar a matriz.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProfitabilityDiffPanel;
