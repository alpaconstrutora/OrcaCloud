import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert, Copy, TrendingUp, RefreshCw, Landmark, FileText, AlertTriangle,
} from 'lucide-react';
import { reconciliationAnomalyService } from '../services/reconciliationAnomalyService';
import { useToast } from '../hooks/useToast';
import type { ReconciliationAnomalies } from '../types/financial';

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDate(d?: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
}

interface SectionProps {
    title: string;
    subtitle: string;
    count: number;
    icon: React.ElementType;
    accent: string;
    children: React.ReactNode;
}
function Section({ title, subtitle, count, icon: Icon, accent, children }: SectionProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${count > 0 ? accent : 'bg-gray-50 text-gray-300'}`}>{count}</span>
            </div>
            {count > 0 && <div className="border-t border-gray-50 divide-y divide-gray-50">{children}</div>}
            {count === 0 && (
                <div className="border-t border-gray-50 px-5 py-6 text-center text-xs text-gray-300 font-semibold">
                    Nada suspeito por aqui. 🎉
                </div>
            )}
        </div>
    );
}

interface AnomaliesPanelProps {
    organizationId: string;
}

const AnomaliesPanel: React.FC<AnomaliesPanelProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const [data, setData] = useState<ReconciliationAnomalies | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            setData(await reconciliationAnomalyService.getAnomalies(organizationId));
        } catch (e) {
            console.error('[AnomaliesPanel]', e);
            showToast('Erro ao carregar anomalias', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, showToast]);

    useEffect(() => { load(); }, [load]);

    const c = data?.counts ?? { duplicates: 0, value_outliers: 0 };
    const total = c.duplicates + c.value_outliers;

    return (
        <div className="space-y-4 min-h-[500px]">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Detecção de Anomalias
                    {total > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">{total}</span>}
                </h4>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-50"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <p className="px-1 text-xs text-gray-400 font-medium">
                Análise dos últimos 180 dias. Sinais para investigação — nenhuma alteração é feita automaticamente.
            </p>

            {/* Duplicidades */}
            <Section
                title="Possíveis duplicidades"
                subtitle="Mesmo valor, direção e contraparte numa janela de até 7 dias"
                count={c.duplicates}
                icon={Copy}
                accent="bg-red-50 text-red-600"
            >
                {(data?.duplicates ?? []).map(d => (
                    <div key={`${d.id_a}-${d.id_b}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                        {d.source === 'BANK'
                            ? <Landmark className="w-4 h-4 text-gray-400" />
                            : <FileText className="w-4 h-4 text-gray-400" />}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{d.party}</p>
                            <p className="text-xs text-gray-400 font-medium">
                                {d.source === 'BANK' ? 'Extrato' : 'Lançamentos'} · {formatDate(d.date_a)} e {formatDate(d.date_b)}
                                <span className="text-red-400 font-bold"> · {d.days_apart}d de intervalo</span>
                            </p>
                        </div>
                        <span className={`tabular-nums font-black text-sm ${d.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatBRL(d.amount)}
                            <span className="text-xs text-gray-300 font-bold"> ×2</span>
                        </span>
                    </div>
                ))}
            </Section>

            {/* Valores fora do padrão */}
            <Section
                title="Valores fora do padrão"
                subtitle="Pagamento muito acima do histórico do fornecedor (z-score ≥ 3)"
                count={c.value_outliers}
                icon={TrendingUp}
                accent="bg-amber-50 text-amber-600"
            >
                {(data?.value_outliers ?? []).map(o => (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{o.party}</p>
                            <p className="text-xs text-gray-400 font-medium">
                                {o.category ? `${o.category} · ` : ''}{formatDate(o.dt)} · média {formatBRL(o.avg_a)} ({o.n} lançs.)
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="tabular-nums font-black text-sm text-red-600">{formatBRL(o.amount)}</p>
                            <p className="text-xs text-amber-500 font-black">{o.z}× desvio</p>
                        </div>
                    </div>
                ))}
            </Section>
        </div>
    );
};

export default AnomaliesPanel;
