import React from 'react';
import { FileText, RefreshCw, CheckCircle2, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { investorPortalService, InvestorReport } from '../../services/investorPortalService';

interface Props {
    organizationId: string;
}

const MonthlyReportTrigger: React.FC<Props> = ({ organizationId }) => {
    const [recent, setRecent] = React.useState<InvestorReport[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [triggering, setTriggering] = React.useState(false);
    const [lastResult, setLastResult] = React.useState<string | null>(null);

    const loadRecent = React.useCallback(() => {
        investorPortalService.listReports(organizationId, undefined, 'relatorio')
            .then(r => setRecent(r.slice(0, 5)))
            .catch(err => console.error('Error loading reports', err))
            .finally(() => setLoading(false));
    }, [organizationId]);

    React.useEffect(() => { loadRecent(); }, [loadRecent]);

    const handleTrigger = async () => {
        setTriggering(true);
        setLastResult(null);
        try {
            const { data, error } = await supabase.rpc('trigger_monthly_investor_report');
            if (error) throw error;
            setLastResult(`Relatório gerado em ${new Date().toLocaleString('pt-BR')}`);
            loadRecent();
        } catch (err: any) {
            setLastResult(`Erro: ${err?.message || 'Falha na geração'}`);
            console.error('Error triggering report', err);
        } finally {
            setTriggering(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Relatórios Mensais Automáticos</h3>
                    <p className="text-sm text-gray-500 mt-1">Gerado automaticamente no dia 1º de cada mês. Pode ser disparado manualmente abaixo.</p>
                </div>
                <button
                    onClick={handleTrigger}
                    disabled={triggering}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`} />
                    {triggering ? 'Gerando...' : 'Gerar Agora'}
                </button>
            </div>

            {lastResult && (
                <div className={`flex items-center gap-3 p-4 rounded-xl text-sm font-medium ${
                    lastResult.startsWith('Erro')
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {lastResult}
                </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <h4 className="text-sm font-bold text-gray-700">Últimos relatórios gerados</h4>
                </div>
                {loading ? (
                    <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
                ) : recent.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">Nenhum relatório gerado ainda.</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {recent.map(r => (
                            <div key={r.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{r.name}</p>
                                        <p className="text-xs text-gray-400">{r.report_date}</p>
                                    </div>
                                </div>
                                {r.url && (
                                    <button
                                        onClick={() => window.open(r.url, '_blank')}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-700"
                                    >
                                        Abrir
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                <p className="text-xs font-bold text-blue-800 mb-1">Agendamento automático</p>
                <p className="text-xs text-blue-700">
                    Cron configurado para <strong>todo dia 1º às 06:00 UTC</strong>. Gera um registro em Documentos
                    e um Comunicado automático para todos os investidores da organização.
                    O relatório em PDF detalhado pode ser anexado manualmente na aba Documentos após geração.
                </p>
            </div>
        </div>
    );
};

export default MonthlyReportTrigger;
