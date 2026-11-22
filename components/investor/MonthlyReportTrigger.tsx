import React from 'react';
import { FileText, RefreshCw, CheckCircle2, Calendar, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { investorPortalService, InvestorReport } from '../../services/investorPortalService';
import { generateMonthlyReportPdf } from '../../services/pdfReportService';
import { investorService } from '../../services/investorService';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';
import { abrirArquivoAssinado, BUCKET_DOCUMENTOS } from '../../lib/storageAssinado';
import Button from '../ui/Button';

interface Props {
    /** A org do topo; `null` = "Todas": lista os relatórios de todas e "Gerar" pergunta a org. REGRA #5. */
    organizationId: string | null;
}

type GenStep = 'idle' | 'inserting' | 'generating' | 'uploading' | 'done' | 'error';

const STEP_LABELS: Record<GenStep, string> = {
    idle:       '',
    inserting:  'Criando registro...',
    generating: 'Gerando PDF...',
    uploading:  'Enviando para storage...',
    done:       '',
    error:      '',
};

const MonthlyReportTrigger: React.FC<Props> = ({ organizationId: orgDoTopo }) => {
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [recent, setRecent]       = React.useState<InvestorReport[]>([]);
    const [loading, setLoading]     = React.useState(true);
    const [step, setStep]           = React.useState<GenStep>('idle');
    const [lastMsg, setLastMsg]     = React.useState<string | null>(null);
    const [lastError, setLastError] = React.useState<string | null>(null);

    const loadRecent = React.useCallback(() => {
        (async () => {
            try {
                let q = supabase
                    .from('investor_reports')
                    .select('id, name, report_date, url, created_at')
                    .ilike('name', 'Relatório Mensal%')
                    .order('created_at', { ascending: false })
                    .limit(5);
                if (orgDoTopo) q = q.eq('organization_id', orgDoTopo);
                const { data } = await q;
                setRecent((data ?? []) as InvestorReport[]);
            } catch { /* silently ignore */ } finally {
                setLoading(false);
            }
        })();
    }, [orgDoTopo]);

    React.useEffect(() => { loadRecent(); }, [loadRecent]);

    const handleTrigger = async () => {
        if (step !== 'idle' && step !== 'done' && step !== 'error') return;
        // O relatório é de UMA org: o topo, ou a escolhida no modal com o topo em "Todas".
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const organizationId = target.orgId;
        setLastMsg(null);
        setLastError(null);

        const now = new Date();
        const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthLabel = ref.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
        const reportName = `Relatório Mensal — ${monthLabel}`;

        // Fase A2 do plano 2026-11-21-portal-do-investidor-consolidacao: um PDF POR INVESTIDOR, só com os números
        // dele, gravado com o destinatário. Antes era um PDF da org inteira, sem destinatário, que ia a todos.
        // O registro só nasce com o arquivo pronto, e o comunicado só sai se algum relatório saiu.
        try {
            setStep('generating');
            const investidores = await investorService.listInvestors(organizationId);
            let gerados = 0;
            for (const inv of investidores as { id: string; name: string }[]) {
                setStep('uploading');
                const caminho = await generateMonthlyReportPdf(organizationId, { id: inv.id, name: inv.name });
                if (!caminho) continue;   // investidor sem obra nem lançamento nesta org
                setStep('inserting');
                const { error: insErr } = await supabase.from('investor_reports').insert({
                    organization_id: organizationId,
                    investor_id: inv.id,
                    name: reportName,
                    type: 'PDF',
                    category: 'relatorio',
                    report_date: now.toLocaleDateString('pt-BR'),
                    url: caminho,
                });
                if (insErr) throw insErr;
                gerados++;
            }

            if (gerados > 0) {
                await supabase.from('investor_announcements').insert({
                    organization_id: organizationId,
                    title: `${reportName} disponível`,
                    body: `O seu relatório de evolução física e financeira referente a ${monthLabel} está disponível na seção Documentos do seu portal.`,
                    type: 'comunicado',
                    published_at: now.toISOString(),
                    requires_acknowledgment: false,
                });
            }

            setStep('done');
            setLastMsg(gerados > 0
                ? `${gerados} relatório(s) gerado(s) em ${now.toLocaleString('pt-BR')}, um por investidor.`
                : 'Nenhum investidor com obra ou lançamento nesta organização: nenhum relatório gerado.');
            loadRecent();
        } catch (err: any) {
            console.error('Error generating report', err);
            setLastError(err?.message || 'Falha na geração do relatório.');
            setStep('error');
        }
    };

    const triggering = step === 'inserting' || step === 'generating' || step === 'uploading';

    return (
        <div className="space-y-6">
            {orgTargetModal}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Relatórios Mensais Automáticos</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Gerado automaticamente no dia 1º de cada mês. Pode ser disparado manualmente abaixo.
                    </p>
                </div>
                <Button
                    onClick={handleTrigger}
                    disabled={triggering}
                    className="flex items-center gap-2 rounded-xl transition-colors"
                >
                    {triggering
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />
                    }
                    {triggering ? (STEP_LABELS[step] || 'Gerando...') : 'Gerar Agora'}
                </Button>
            </div>

            {/* Feedback de progresso */}
            {triggering && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm font-medium text-blue-700">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {STEP_LABELS[step]}
                </div>
            )}

            {lastMsg && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {lastMsg}
                </div>
            )}

            {lastError && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-sm font-medium text-red-700">
                    <span className="shrink-0">⚠</span>
                    {lastError}
                </div>
            )}

            {/* Lista de relatórios recentes */}
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
                                    <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{r.name}</p>
                                        <p className="text-xs text-gray-400">{r.report_date}</p>
                                    </div>
                                </div>
                                {r.url ? (
                                    <button
                                        type="button"
                                        onClick={() => { abrirArquivoAssinado(BUCKET_DOCUMENTOS, r.url).catch(err => console.error('[MonthlyReportTrigger] abrir relatório:', err)); }}
                                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Baixar PDF
                                    </button>
                                ) : (
                                    <span className="text-xs text-gray-300">Sem arquivo</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                <p className="text-xs font-bold text-blue-800 mb-1">Agendamento automático</p>
                <p className="text-xs text-blue-700">
                    Cron configurado para <strong>todo dia 1º às 06:00 UTC</strong>. Gera o PDF automaticamente
                    com resumo de empreendimentos, financeiro e marcos concluídos, e envia um Comunicado para
                    todos os investidores da organização.
                </p>
            </div>
        </div>
    );
};

export default MonthlyReportTrigger;
