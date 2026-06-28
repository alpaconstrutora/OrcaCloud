import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Shield, Upload, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import {
    creditAnalysisService, DealCreditAnalysis, CreditChecklist, CreditResult,
    CHECKLIST_LABELS, CHECKLIST_WEIGHTS, calcScore, suggestResult,
} from '../services/creditAnalysisService';

interface Props {
    dealId: string;
    organizationId: string;
    clientName?: string;
}

const RESULT_CONFIG: Record<CreditResult, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    PENDENTE:    { label: 'Pendente',     color: 'text-gray-500',   bg: 'bg-gray-50',    icon: <Clock size={16} /> },
    EM_ANALISE:  { label: 'Em Análise',   color: 'text-amber-600',  bg: 'bg-amber-50',   icon: <Shield size={16} /> },
    APROVADO:    { label: 'Aprovado',     color: 'text-emerald-600',bg: 'bg-emerald-50', icon: <ShieldCheck size={16} /> },
    REPROVADO:   { label: 'Reprovado',    color: 'text-red-600',    bg: 'bg-red-50',     icon: <ShieldAlert size={16} /> },
};

export const CreditAnalysisPanel: React.FC<Props> = ({ dealId, organizationId, clientName }) => {
    const [analysis, setAnalysis] = useState<DealCreditAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const [checklist, setChecklist] = useState<Partial<CreditChecklist>>({});
    const [notes, setNotes] = useState('');
    const [result, setResult] = useState<CreditResult>('PENDENTE');
    const [notification, setNotification] = useState<string | null>(null);

    const notify = (msg: string) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

    useEffect(() => {
        if (!dealId) return;
        setLoading(true);
        creditAnalysisService.get(dealId)
            .then(data => {
                if (data) {
                    setAnalysis(data);
                    setChecklist(data.checklist ?? {});
                    setNotes(data.notes ?? '');
                    setResult(data.result);
                }
            })
            .finally(() => setLoading(false));
    }, [dealId]);

    const score = calcScore(checklist);
    const suggested = suggestResult(score);

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await creditAnalysisService.upsert(organizationId, dealId, {
                score, result, checklist, notes: notes || undefined,
                analyzed_by: 'Usuário',
                analyzed_at: new Date().toISOString(),
            });
            setAnalysis(updated);
            notify('Análise salva.');
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`);
        } finally { setSaving(false); }
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const url = await creditAnalysisService.uploadReport(organizationId, dealId, file);
            const updated = await creditAnalysisService.upsert(organizationId, dealId, { report_pdf_url: url });
            setAnalysis(updated);
            notify('Laudo enviado.');
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`);
        } finally { setUploading(false); }
    };

    const cfg = RESULT_CONFIG[analysis?.result ?? 'PENDENTE'];

    return (
        <div className="border border-gray-100 rounded-3xl overflow-hidden">
            {notification && (
                <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl text-sm shadow-lg">
                    {notification}
                </div>
            )}

            {/* Header — clicável para expandir */}
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-5 py-4 bg-white hover:bg-gray-50 transition-colors text-left"
            >
                <div className={`p-2 rounded-xl ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                </div>
                <div className="flex-1">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Análise de Crédito</p>
                    {loading ? (
                        <p className="text-sm text-gray-400">Carregando…</p>
                    ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                            {analysis && (
                                <span className="text-xs text-gray-400">— Score {analysis.score ?? 0}/100</span>
                            )}
                        </div>
                    )}
                </div>
                <span className="text-xs text-gray-300">{expanded ? '▲' : '▼'}</span>
            </button>

            {expanded && !loading && (
                <div className="px-5 pb-5 pt-1 space-y-5 bg-gray-50/50">
                    {/* Score bar */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Score Documental</p>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-black text-gray-900">{score}</span>
                                <span className="text-xs text-gray-400">/100</span>
                                {suggested !== result && (
                                    <button
                                        onClick={() => setResult(suggested)}
                                        className="text-xs text-blue-600 hover:underline"
                                    >
                                        Sugerir: {RESULT_CONFIG[suggested].label}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Documentos</p>
                        <div className="grid grid-cols-1 gap-1.5">
                            {(Object.keys(CHECKLIST_LABELS) as (keyof CreditChecklist)[]).map(key => (
                                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                    <div
                                        onClick={() => setChecklist(prev => ({ ...prev, [key]: !prev[key] }))}
                                        className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                            checklist[key]
                                                ? 'bg-emerald-500 border-emerald-500'
                                                : 'bg-white border-gray-300 group-hover:border-emerald-400'
                                        }`}
                                    >
                                        {checklist[key] && <CheckCircle2 size={13} className="text-white" />}
                                    </div>
                                    <span className="text-sm text-gray-700 flex-1">{CHECKLIST_LABELS[key]}</span>
                                    <span className="text-xs text-gray-400 font-mono">+{CHECKLIST_WEIGHTS[key]}pts</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Resultado */}
                    <div className="space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Parecer</p>
                        <div className="flex gap-2">
                            {(['PENDENTE', 'EM_ANALISE', 'APROVADO', 'REPROVADO'] as CreditResult[]).map(r => (
                                <button
                                    key={r}
                                    onClick={() => setResult(r)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                        result === r
                                            ? `${RESULT_CONFIG[r].bg} ${RESULT_CONFIG[r].color} ring-1 ring-current`
                                            : 'bg-white text-gray-400 hover:bg-gray-100'
                                    }`}
                                >
                                    {RESULT_CONFIG[r].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notas */}
                    <div className="space-y-1.5">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Observações</p>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Restrições encontradas, condicionantes, justificativa do parecer…"
                            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    {/* Laudo PDF */}
                    <div className="space-y-1.5">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Laudo de Crédito (PDF)</p>
                        {analysis?.report_pdf_url ? (
                            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                                <FileText size={15} className="text-blue-600" />
                                <a href={analysis.report_pdf_url} target="_blank" rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:underline flex-1 truncate">
                                    Ver laudo anexado
                                </a>
                            </div>
                        ) : (
                            <label className="flex items-center gap-2 p-3 bg-white border border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                                <Upload size={15} className="text-gray-400" />
                                <span className="text-sm text-gray-500">{uploading ? 'Enviando…' : 'Anexar PDF do laudo'}</span>
                                <input type="file" accept=".pdf" className="hidden" disabled={uploading}
                                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                            </label>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 py-3 bg-blue-600 text-white rounded-2xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Salvando…' : 'Salvar Análise'}
                        </button>
                    </div>

                    {analysis?.analyzed_by && (
                        <p className="text-xs text-gray-400 text-center">
                            Analisado por {analysis.analyzed_by}
                            {analysis.analyzed_at && ` em ${new Date(analysis.analyzed_at).toLocaleDateString('pt-BR')}`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default CreditAnalysisPanel;
