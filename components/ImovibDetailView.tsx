import React, { useState, useEffect } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { ArrowLeft, Building2, Calculator, Loader2, AlertCircle, LineChart, Landmark, Pencil, FileBarChart } from 'lucide-react';
import ImovibPremisesForm from './ImovibPremisesForm';
import ImovibStaticViability from './ImovibStaticViability';
import ImovibDynamicForm from './ImovibDynamicForm';
import ImovibCashFlow from './ImovibCashFlow';
import ImovibExecutiveSummary from './ImovibExecutiveSummary';
import ImovibCapexForm from './ImovibCapexForm';
import ImovibFundingForm from './ImovibFundingForm';
import ImovibSensitivityForm from './ImovibSensitivityForm';
import ImovibForm from './ImovibForm';
import { ErrorBoundary } from './ErrorBoundary';
import { useToast } from '../hooks/useToast';
import { useImovibPodeEditar, ImovibEdicaoProvider } from '../hooks/useImovibEdicao';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { TabsBar, TabsBarItem } from './ui/TabsBar';

interface ImovibDetailViewProps {
    studyId: string;
    onBack: () => void;
}

type AbaDoEstudo = 'executive_summary' | 'premises' | 'capex' | 'funding' | 'risk_scenarios' | 'viability_static' | 'viability_dynamic';

const ABAS_DO_ESTUDO: TabsBarItem<AbaDoEstudo>[] = [
    { id: 'executive_summary', label: 'Resumo Executivo', icon: <FileBarChart className="w-4 h-4" /> },
    { id: 'premises', label: 'Premissas', icon: <Building2 className="w-4 h-4" /> },
    { id: 'capex', label: 'Orçamento (CAPEX)', icon: <Calculator className="w-4 h-4" /> },
    { id: 'funding', label: 'Receitas e Capital', icon: <Landmark className="w-4 h-4" /> },
    { id: 'risk_scenarios', label: 'Sensibilidade e Risco', icon: <AlertCircle className="w-4 h-4" /> },
    { id: 'viability_static', label: 'Estática', icon: <Calculator className="w-4 h-4" /> },
    { id: 'viability_dynamic', label: 'Dinâmica', icon: <LineChart className="w-4 h-4" /> },
];


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
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="mt-4 text-gray-500 font-medium">Carregando dados do estudo...</p>
            </div>
        );
    }

    if (error || !study) {
        return (
            <div className="bg-red-50 text-red-600 p-6 rounded-[10px] flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="font-medium text-sm">{error || 'Estudo não encontrado.'}</p>
                <button onClick={onBack} className="ml-auto underline text-sm text-red-700">Voltar</button>
            </div>
        );
    }

    // Botão secundário compacto (§17): h-9, rounded-[6px], sentence case.
    const botaoSecundario = 'flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] border transition-all disabled:opacity-50 disabled:cursor-not-allowed';

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            {/* Cabeçalho (§20): título solto, fora de card; ações à direita. */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        onClick={voltar}
                        title="Voltar para a lista de estudos"
                        aria-label="Voltar para a lista de estudos"
                        className="p-2 hover:bg-gray-100 rounded-[6px] transition-colors text-gray-500 mt-0.5"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{study.name}</h1>
                            <span className="text-sm text-gray-500">v{study.version}</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
                            {[study.segment, study.sub_classification, study.phase].filter(Boolean).join(' • ') || 'Estudo de viabilidade'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                        type="button"
                        onClick={abrirEdicao}
                        disabled={!edicao.pode}
                        title={!edicao.pode ? edicao.motivo : 'Editar nome, versão e classificação do estudo'}
                        className={`${botaoSecundario} text-slate-700 bg-white border-gray-200 hover:bg-gray-50`}
                    >
                        <Pencil className="w-[15px] h-[15px]" />
                        Editar
                    </button>
                </div>
            </div>

            {!edicao.pode && (
                <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800">
                    Somente leitura — {edicao.motivo}
                </div>
            )}

            {/* Abas (§19.1): TabsBar padrão — card branco, trilho cinza, quebra de linha
                em vez de rolagem lateral. O conteúdo rola com a página (antes ficava numa
                caixa h-[calc(100vh-14rem)] com rolagem própria dentro da página). */}
            <TabsBar<AbaDoEstudo> tabs={ABAS_DO_ESTUDO} value={activeTab} onChange={irPara} />

            <div>
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
