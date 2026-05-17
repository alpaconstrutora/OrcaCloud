import React, { useState, useEffect } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { ArrowLeft, Building2, Calculator, Loader2, AlertCircle, LineChart, Landmark, Award } from 'lucide-react';
import ImovibPremisesForm from './ImovibPremisesForm';
import ImovibStaticViability from './ImovibStaticViability';
import ImovibDynamicForm from './ImovibDynamicForm';
import ImovibCashFlow from './ImovibCashFlow';
import ImovibExecutiveSummary from './ImovibExecutiveSummary';
import ImovibCapexForm from './ImovibCapexForm';
import ImovibFundingForm from './ImovibFundingForm';
import ImovibSensitivityForm from './ImovibSensitivityForm';
import ImovibEsgReportForm from './ImovibEsgReportForm';
import { ErrorBoundary } from './ErrorBoundary';

interface ImovibDetailViewProps {
    studyId: string;
    onBack: () => void;
}

const ImovibDetailView: React.FC<ImovibDetailViewProps> = ({ studyId, onBack }) => {
    const [study, setStudy] = useState<ImovibStudy | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'executive_summary' | 'premises' | 'capex' | 'funding' | 'risk_scenarios' | 'esg_report' | 'viability_static' | 'viability_dynamic'>('executive_summary');

    useEffect(() => {
        loadStudyDetails(true);
    }, [studyId]);

    const loadStudyDetails = async (showGlobalLoader = false) => {
        try {
            if (showGlobalLoader) setLoading(true);
            const data = await imovibService.getStudyById(studyId, true);
            setStudy(data);
        } catch (err: any) {
            setError(err.message);
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
                        onClick={onBack}
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
                        </div>
                        <p className="text-gray-500 text-sm font-medium">
                            {study.segment} {study.sub_classification ? `• ${study.sub_classification}` : ''} {study.phase ? `• ${study.phase}` : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-14rem)]">
                {/* Tabs */}
                <div className="flex items-center border-b border-gray-100 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('executive_summary')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors rounded-tl-3xl ${activeTab === 'executive_summary'
                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <AlertCircle className="w-4 h-4" /> {/* Or any cool icon */}
                        Resumo Executivo
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('premises')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'premises'
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Building2 className="w-4 h-4" />
                        Premissas
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('capex')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'capex'
                            ? 'text-rose-600 border-b-2 border-rose-600 bg-rose-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Calculator className="w-4 h-4" />
                        Orçamento (CAPEX)
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('funding')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'funding'
                            ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Landmark className="w-4 h-4" /> {/* Need to import Landmark if not already */}
                        Receitas & Capital
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('risk_scenarios')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'risk_scenarios'
                            ? 'text-rose-600 border-b-2 border-rose-600 bg-rose-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <AlertCircle className="w-4 h-4" />
                        Sensibilidade & Risco
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('esg_report')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'esg_report'
                            ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Award className="w-4 h-4" /> {/* Need to import Award */}
                        ESG & Parecer
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('viability_static')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors ${activeTab === 'viability_static'
                            ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Calculator className="w-4 h-4" />
                        Estática
                    </button>
                    <div className="w-px h-8 bg-gray-100 shrink-0"></div>
                    <button
                        onClick={() => setActiveTab('viability_dynamic')}
                        className={`flex whitespace-nowrap items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-widest uppercase transition-colors rounded-tr-3xl ${activeTab === 'viability_dynamic'
                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        Dinâmica
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                    {activeTab === 'executive_summary' && (
                        <ErrorBoundary>
                            <ImovibExecutiveSummary study={study} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'premises' && (
                        <ImovibPremisesForm study={study} onDataChanged={loadStudyDetails} />
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
                            <ImovibSensitivityForm study={study} onDataChanged={loadStudyDetails} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'esg_report' && (
                        <ErrorBoundary>
                            <ImovibEsgReportForm study={study} onDataChanged={loadStudyDetails} />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'viability_static' && (
                        <ImovibStaticViability study={study} />
                    )}
                    {activeTab === 'viability_dynamic' && (
                        <ErrorBoundary>
                            <ImovibDynamicForm study={study} onDataChanged={() => loadStudyDetails(false)} />
                            <ImovibCashFlow study={study} />
                        </ErrorBoundary>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImovibDetailView;
