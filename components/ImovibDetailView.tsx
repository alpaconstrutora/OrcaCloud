import React, { useState, useEffect } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { PlantaAiIntegration } from '../services/plantaAiIntegration';
import { ArrowLeft, Building2, Calculator, Loader2, AlertCircle, LineChart, Landmark, Award, Layers, PlusCircle, Pencil } from 'lucide-react';
import ImovibPremisesForm from './ImovibPremisesForm';
import ImovibStaticViability from './ImovibStaticViability';
import ImovibDynamicForm from './ImovibDynamicForm';
import ImovibCashFlow from './ImovibCashFlow';
import ImovibExecutiveSummary from './ImovibExecutiveSummary';
import ImovibCapexForm from './ImovibCapexForm';
import ImovibFundingForm from './ImovibFundingForm';
import ImovibSensitivityForm from './ImovibSensitivityForm';
import ImovibEsgReportForm from './ImovibEsgReportForm';
import ImovibForm from './ImovibForm';
import { ErrorBoundary } from './ErrorBoundary';
import { useToast } from '../hooks/useToast';
import { useImovibPodeEditar, ImovibEdicaoProvider } from '../hooks/useImovibEdicao';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

interface ImovibDetailViewProps {
    studyId: string;
    onBack: () => void;
}

type AbaDoEstudo = 'executive_summary' | 'premises' | 'capex' | 'funding' | 'risk_scenarios' | 'esg_report' | 'viability_static' | 'viability_dynamic';

const ImovibDetailView: React.FC<ImovibDetailViewProps> = ({ studyId, onBack }) => {
    const [study, setStudy] = useState<ImovibStudy | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<AbaDoEstudo>('executive_summary');
    // canEditImovib (plano 2026-10-12, item 4.6): sem a permissão na org DONA do
    // estudo, ele abre só para leitura. Antes dos returns antecipados (regra dos Hooks).
    const edicao = useImovibPodeEditar(study?.organization_id);
    // Editar nome/versão/classificação (item 5.1) — o mesmo drawer da criação.
    const [editando, setEditando] = useState(false);
    // Premissas › Identificação/Mercado guardam o formulário em estado local
    // (item 5.4, §25). O filho avisa aqui quando há edição pendente; toda saída
    // que desmontaria ou recarregaria aquele formulário passa por `podeSair`.
    const premissas = useUnsavedChanges();
    // Trocar a key remonta Premissas: é assim que "Sair e descartar" volta o
    // formulário ao que está gravado quando ele continua na tela (ex.: Editar).
    const [premissasKey, setPremissasKey] = useState(0);
    const podeSair = async (): Promise<boolean> => {
        if (!premissas.dirty) return true;
        if (!(await premissas.confirmDiscard())) return false;
        premissas.markSaved();
        setPremissasKey(k => k + 1);
        return true;
    };
    const irPara = async (aba: AbaDoEstudo) => {
        if (aba === activeTab) return;
        if (await podeSair()) setActiveTab(aba);
    };
    const voltar = async () => {
        if (await podeSair()) onBack();
    };
    const abrirEdicao = async () => {
        if (await podeSair()) setEditando(true);
    };

    useEffect(() => {
        loadStudyDetails(true);
    }, [studyId]);

    const loadStudyDetails = async (showGlobalLoader = false) => {
        try {
            if (showGlobalLoader) setLoading(true);
            const data = await imovibService.getStudyById(studyId, true);
            setStudy(data);
        } catch (err: any) {
            console.error('Error loading IMOVIB study:', err);
            // Carga inicial: sem estudo na tela, o erro ocupa o lugar dela.
            // Recarga depois de salvar: o estudo continua na tela e o erro vira
            // toast — trocar a tela inteira pelo erro descartaria o que está aberto.
            if (showGlobalLoader || !study) setError(`Erro ao carregar o estudo: ${err?.message ?? err}`);
            else showToast(`Erro ao atualizar os dados do estudo (os números na tela podem estar desatualizados): ${err?.message ?? err}`, 'error');
        } finally {
            if (showGlobalLoader) setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="mt-4 text-gray-500 font-medium">Carregando dados do estudo...</p>
            </div>
        );
    }

    if (error || !study) {
        return (
            <div className="bg-red-50 text-red-600 p-6 rounded-2xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="font-medium text-sm">{error || 'Estudo não encontrado.'}</p>
                <button onClick={onBack} className="ml-auto underline text-sm text-red-700">Voltar</button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                    <button
                        onClick={voltar}
                        title="Voltar para a lista de estudos"
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 mt-1"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{study.name}</h1>
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-black tracking-wider uppercase rounded-lg border border-blue-100">
                                v{study.version}
                            </span>
                            <button
                                type="button"
                                onClick={abrirEdicao}
                                disabled={!edicao.pode}
                                title={!edicao.pode ? edicao.motivo : 'Editar nome, versão e classificação do estudo'}
                                className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-slate-600 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 hover:text-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Editar
                            </button>
                        </div>
                        <p className="text-gray-500 text-sm font-medium">
                            {study.segment} {study.sub_classification ? `• ${study.sub_classification}` : ''} {study.phase ? `• ${study.phase}` : ''}
                        </p>
                        {study.planta_ai_study_id ? (
                            <button
                                disabled={!edicao.pode}
                                title={!edicao.pode ? edicao.motivo : undefined}
                                onClick={async () => {
                                    if (!(await podeSair())) return;
                                    const res = await PlantaAiIntegration.updatePlantaAiFromImovib(study.id, study.planta_ai_study_id!);
                                    if (!res.success) {
                                        showToast("Erro ao atualizar o Planta AI: " + res.error, 'error');
                                    }
                                    window.location.hash = `#/planta-ai?studyId=${study.planta_ai_study_id}`;
                                }}
                                className="mt-3 flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors rounded-xl border border-indigo-200 text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
                            >
                                <Layers className="w-4 h-4" />
                                Modificar Arquitetura (Planta AI)
                            </button>
                        ) : (
                            <button
                                disabled={!edicao.pode}
                                title={!edicao.pode ? edicao.motivo : undefined}
                                onClick={async () => {
                                    if (!study.organization_id) return;
                                    if (!(await podeSair())) return;
                                    const res = await PlantaAiIntegration.createPlantaAiFromImovib(study.id, study.organization_id, study.name);
                                    if (res.success && res.plantaAiStudyId) {
                                        window.location.hash = `#/planta-ai?studyId=${res.plantaAiStudyId}`;
                                    } else {
                                        showToast("Erro ao criar estudo na Planta AI: " + res.error, 'error');
                                    }
                                }}
                                className="mt-3 flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors rounded-xl border border-emerald-200 text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                            >
                                <PlusCircle className="w-4 h-4" />
                                Gerar Arquitetura (Planta AI)
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {!edicao.pode && (
                <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800">
                    Somente leitura — {edicao.motivo}
                </div>
            )}

            {/* Main Content Area */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-14rem)]">
                {/* Tabs */}
                <div className="flex items-center border-b border-gray-100 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => irPara('executive_summary')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors rounded-tl-3xl ${activeTab === 'executive_summary'
                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <AlertCircle className="w-4 h-4" /> {/* Or any cool icon */}
                        Resumo Executivo
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('premises')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'premises'
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Building2 className="w-4 h-4" />
                        Premissas
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('capex')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'capex'
                            ? 'text-rose-600 border-b-2 border-rose-600 bg-rose-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Calculator className="w-4 h-4" />
                        Orçamento (CAPEX)
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('funding')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'funding'
                            ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Landmark className="w-4 h-4" /> {/* Need to import Landmark if not already */}
                        Receitas & Capital
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('risk_scenarios')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'risk_scenarios'
                            ? 'text-rose-600 border-b-2 border-rose-600 bg-rose-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <AlertCircle className="w-4 h-4" />
                        Sensibilidade & Risco
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('esg_report')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'esg_report'
                            ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Award className="w-4 h-4" /> {/* Need to import Award */}
                        ESG & Parecer
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('viability_static')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'viability_static'
                            ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Calculator className="w-4 h-4" />
                        Estática
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => irPara('viability_dynamic')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors rounded-tr-3xl ${activeTab === 'viability_dynamic'
                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        Dinâmica
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                  <ImovibEdicaoProvider value={edicao}>
                    {activeTab === 'executive_summary' && (
                        <ErrorBoundary>
                            <ImovibExecutiveSummary study={study} onIrPara={irPara} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'premises' && (
                        <ImovibPremisesForm
                            key={premissasKey}
                            study={study}
                            onDataChanged={loadStudyDetails}
                            onDirtyChange={(d) => (d ? premissas.markDirty() : premissas.markSaved())}
                        />
                    )}
                    {activeTab === 'capex' && (
                        <ErrorBoundary>
                            <ImovibCapexForm study={study} onDataChanged={() => loadStudyDetails(false)} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'funding' && (
                        <ErrorBoundary>
                            <ImovibFundingForm study={study} onDataChanged={loadStudyDetails} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'risk_scenarios' && (
                        <ErrorBoundary>
                            <ImovibSensitivityForm study={study} onDataChanged={loadStudyDetails} onIrPara={irPara} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'esg_report' && (
                        <ErrorBoundary>
                            <ImovibEsgReportForm study={study} onDataChanged={loadStudyDetails} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'viability_static' && (
                        <ImovibStaticViability study={study} onIrPara={irPara} />
                    )}
                    {activeTab === 'viability_dynamic' && (
                        <ErrorBoundary>
                            <ImovibDynamicForm study={study} onDataChanged={() => loadStudyDetails(false)} />
                            <ImovibCashFlow study={study} onIrPara={irPara} />
                        </ErrorBoundary>
                    )}
                  </ImovibEdicaoProvider>
                </div>
            </div>

            {/* Salvo → recarrega o detalhe (cabeçalho e abas leem o estudo novo). */}
            <ImovibForm
                open={editando}
                study={study}
                onClose={() => setEditando(false)}
                onSaved={() => { setEditando(false); loadStudyDetails(false); }}
            />
        </div>
    );
};

export default ImovibDetailView;
