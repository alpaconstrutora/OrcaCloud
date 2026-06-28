import React, { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { biReportService } from '../services/biReportService';
import type { BIExecutiveSummary } from '../types/bi';

interface Props {
    summary: BIExecutiveSummary;
    dateFrom: string;
    dateTo: string;
    organizationName?: string;
    onNarrativeChange?: (text: string | null) => void;
}

const BINarrativeCard: React.FC<Props> = ({ summary, dateFrom, dateTo, organizationName, onNarrativeChange }) => {
    const [narrative, setNarrative] = useState<string | null>(null);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState<string | null>(null);
    const [expanded, setExpanded]   = useState(true);

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const text = await biReportService.generateNarrative(
                summary.kpis, dateFrom, dateTo, organizationName,
            );
            setNarrative(text);
            onNarrativeChange?.(text);
            setExpanded(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900">Resumo Executivo IA</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                            Gerado por Claude · {dateFrom} a {dateTo}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {narrative && (
                        <button onClick={() => setExpanded(e => !e)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    )}
                    <button
                        onClick={generate}
                        disabled={loading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            narrative
                                ? 'text-violet-600 hover:bg-violet-50 border border-violet-100'
                                : 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-200'
                        } disabled:opacity-50`}
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {narrative ? 'Regenerar' : 'Gerar Resumo'}
                    </button>
                </div>
            </div>

            {/* Body */}
            {error && (
                <div className="px-5 py-4 flex items-start gap-2 bg-red-50 text-red-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <p className="text-xs font-medium">{error}</p>
                </div>
            )}

            {loading && !narrative && (
                <div className="px-5 py-8 text-center">
                    <div className="inline-flex items-center gap-2 text-violet-600">
                        <Sparkles size={16} className="animate-pulse" />
                        <span className="text-sm font-medium">Analisando dados e gerando resumo…</span>
                    </div>
                </div>
            )}

            {!narrative && !loading && !error && (
                <div className="px-5 py-8 text-center text-gray-400">
                    <Sparkles size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Clique em "Gerar Resumo" para criar uma análise executiva automática com IA.</p>
                    <p className="text-xs mt-1 text-gray-300">Requer ANTHROPIC_API_KEY configurada no Supabase.</p>
                </div>
            )}

            {narrative && expanded && (
                <div className="px-5 py-4">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{narrative}</p>
                </div>
            )}
        </div>
    );
};

export default BINarrativeCard;
