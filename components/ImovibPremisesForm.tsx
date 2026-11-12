import React, { useState, useEffect, useRef } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { FileText, PieChart, Activity, Save, Loader2, CalendarClock, MapPin, BookOpen } from 'lucide-react';
import ImovibCronogramaTab from './ImovibCronogramaTab';
import ImovibTerrenoTab from './ImovibTerrenoTab';
import ImovibZoneamentoCard from './ImovibZoneamentoCard';
import ImovibEstruturaJuridicaCard from './ImovibEstruturaJuridicaCard';
import ImovibComparaveisCard from './ImovibComparaveisCard';
import ImovibMercadoDeOrigemCard from './ImovibMercadoDeOrigemCard';
import ImovibMemorialTab from './ImovibMemorialTab';

const ORIGEM_DA_VSO: Record<'digitada' | 'comparaveis' | 'market', string> = {
    digitada: 'digitada',
    comparaveis: 'média dos comparáveis',
    market: 'absorção do Ópura Market',
};
import { useToast } from '../hooks/useToast';
import ImovibVinculoEmpreendimento from './ImovibVinculoEmpreendimento';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import {
    IMOVIB_MODALIDADES, opcoesComValorAtual,
    imovibCnpj, imovibIncorporadora, imovibGestor, imovibIdentificacaoParaGravar,
} from '../constants/imovibClassificacao';


interface ImovibPremisesFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
    /** Avisa o detalhe quando há edição pendente (item 5.4) — ele guarda a troca de aba e o "voltar". */
    onDirtyChange?: (dirty: boolean) => void;
}

// As duas sub-abas editam o mesmo formulário local, gravado por "Salvar Premissas".
// Blocos e Tipologia, Torres & Unidades e Mapa Regulatório saíram daqui em 2026-10-19:
// eles moram na Planta Inteligente (docs/planos/2026-10-19-imovib-premissas-planta-inteligente.md).
// Cronograma e Terreno entraram na Fase 5 do plano 2026-11-11 (itens 5.1, 5.2 e 5.9); Memorial, no item 10.1.
type SubAba = 'identificacao' | 'mercado' | 'cronograma' | 'terreno' | 'memorial';

// Item 5.2: CNPJ, incorporadora e gestor são editados nas colunas canônicas
// (`cnpj`/`developer`/`manager`, as mesmas da criação e da listagem). O valor
// abre com a leitura de compatibilidade (cai na coluna antiga quando a canônica
// está vazia), e salvar grava na canônica.
const comCanonicas = (s: ImovibStudy): Partial<ImovibStudy> => ({
    ...s,
    cnpj: imovibCnpj(s),
    developer: imovibIncorporadora(s),
    manager: imovibGestor(s),
});

const ImovibPremisesForm: React.FC<ImovibPremisesFormProps> = ({ study, onDataChanged, onDirtyChange }) => {
    const [activeTab, setActiveTab] = useState<SubAba>('identificacao');
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(() => comCanonicas(study));
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();
    // §25: Identificação e Mercado ficam em estado local até "Salvar Premissas".
    // guardarNavegacao: trocar de módulo pelo menu / voltar do navegador / fechar
    // a aba também perguntam (lib/guardaDeSaida.ts) — Premissas desmonta ao sair.
    const { dirty, markDirty, markSaved } = useUnsavedChanges({ guardarNavegacao: true });
    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;
    useEffect(() => { onDirtyChangeRef.current?.(dirty); }, [dirty]);
    // Desmontou (troca de aba já confirmada pelo detalhe): nada mais pendente aqui.
    useEffect(() => () => onDirtyChangeRef.current?.(false), []);

    useEffect(() => {
        setFormData(comCanonicas(study));
    }, [study]);

    const setCampo = (field: keyof ImovibStudy, valor: unknown) => {
        setFormData(prev => ({ ...prev, [field]: valor }));
        markDirty();
    };
    // Item 7.1/7.2: a VSO dos comparáveis ou do Market vira a VSO da região e a VSO
    // mensal da curva de vendas — no formulário, grava com "Salvar Premissas".
    const usarVso = (fonte: 'comparaveis' | 'market') => (vso: number) => {
        setCampo('vso_regional_percent', vso);
        setCampo('vso_regional_source', fonte);
        setCampo('sales_vso_percent', vso);
    };

    const handleSaveAllForm = async () => {
        try {
            setIsSaving(true);
            // capex_seeded_at é do CAPEX: gravar o valor de quando a tela abriu poderia
            // devolver null e fazer o template de rubricas voltar.
            // unit_instances (espelho), estrutura e funding_sources vêm montados em memória, não são colunas.
            // opura_terrain_study_id não é editado aqui e o banco o zera quando o estudo de terreno é apagado (item 7.2).
            // Parecer e mínimos (item 10.3) gravam no cartão do Resumo: regravar o valor de quando
            // a tela abriu apagaria um parecer registrado por outra pessoa nesse meio-tempo.
            const { id, created_at, updated_at, blocks, capex_items, unit_instances, estrutura, funding_sources, organization_id, capex_seeded_at, opura_terrain_study_id,
                recommendation, recommendation_notes, recommended_by, recommended_at, recommended_by_user_id, recommendation_snapshot, hurdle_irr_spread, hurdle_margin_percent, hurdle_max_exposure, ...cleanData } = formData as any;
            await imovibService.updateStudy(study.id, {
                ...cleanData,
                ...imovibIdentificacaoParaGravar({
                    cnpj: String(formData.cnpj ?? ''),
                    developer: String(formData.developer ?? ''),
                    manager: String(formData.manager ?? ''),
                }),
            });
            markSaved();
            showToast('Premissas salvas com sucesso!', 'success');
            onDataChanged();
        } catch (error) {
            console.error(error);
            showToast(`Erro ao salvar as premissas: ${(error as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    // Helper to render input field
    const renderInput = (label: string, field: keyof ImovibStudy, type: 'text' | 'number' | 'date' = 'text', placeholder: string = "", isPercent: boolean = false) => {
        return (
            <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {label} {isPercent && '(%)'}
                </label>
                <input
                    type={type}
                    value={(formData[field as keyof ImovibStudy] as string | number) ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => {
                        const val = type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value;
                        setCampo(field, val);
                    }}
                    className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
            </div>
        );
    };

    // Helper for Textarea
    const renderTextarea = (label: string, field: keyof ImovibStudy, placeholder: string = "", rows: number = 3) => {
        return (
            <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {label}
                </label>
                <textarea
                    value={(formData[field as keyof ImovibStudy] as string) ?? ''}
                    placeholder={placeholder}
                    rows={rows}
                    onChange={(e) => setCampo(field, e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                />
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Header / Tabs */}
            <div className="bg-white rounded-[10px] p-1.5 border border-slate-100 shadow-sm flex flex-wrap gap-1.5 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                {[
                    { id: 'identificacao', label: '0. Identificação', icon: <FileText className="w-4 h-4" /> },
                    { id: 'mercado', label: '1. Mercado', icon: <PieChart className="w-4 h-4" /> },
                    { id: 'cronograma', label: '2. Cronograma', icon: <CalendarClock className="w-4 h-4" /> },
                    { id: 'terreno', label: '3. Terreno', icon: <MapPin className="w-4 h-4" /> },
                    { id: 'memorial', label: '4. Memorial', icon: <BookOpen className="w-4 h-4" /> },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as SubAba)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all ${activeTab === tab.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
                </div>
                <button
                    onClick={handleSaveAllForm}
                    disabled={isSaving || !pode || !dirty}
                    title={!pode ? motivo : isSaving ? 'Salvando...' : !dirty ? 'Nada foi alterado em Identificação, Mercado, Cronograma, Terreno ou Memorial.' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Salvando...' : 'Salvar Premissas'}
                </button>
            </div>

            {/* TAB: IDENTIFICAÇÃO */}
            {activeTab === 'identificacao' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                Módulo 0 — Ficha de Identificação
                            </h2>
                            <p className="text-slate-500 text-sm mt-1">Informações legais e contextuais da análise.</p>
                        </div>

                        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderInput('CNPJ da SPE', 'cnpj', 'text', 'Ex: 00.000.000/0001-00')}
                            {renderInput('Incorporadora / Desenvolvedor', 'developer', 'text', 'Nome da Empresa')}
                            {renderInput('Gestor do Projeto', 'manager', 'text', 'Nome do Responsável')}
                            {renderInput('Data-base da Análise', 'base_date', 'date')}
                            {/* Mesma lista da criação (item 5.2); valor antigo digitado à mão continua como opção. */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Modalidade de Desenvolvimento</label>
                                <select
                                    value={formData.development_modality ?? ''}
                                    onChange={(e) => setCampo('development_modality', e.target.value)}
                                    className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                                >
                                    <option value="">Selecione...</option>
                                    {opcoesComValorAtual(IMOVIB_MODALIDADES, formData.development_modality).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        </fieldset>

                        {/* Daqui a Viabilidade lê a estrutura que a Planta Inteligente envia ao empreendimento. */}
                        <div className="pt-6 border-t border-slate-100">
                            <ImovibVinculoEmpreendimento study={study} onDataChanged={onDataChanged} />
                        </div>
                    </div>
                    <ImovibEstruturaJuridicaCard study={study} formData={formData} setCampo={setCampo} />
                    <ImovibZoneamentoCard study={study} />
                </div>
            )}

            {activeTab === 'cronograma' && <ImovibCronogramaTab study={study} formData={formData} setCampo={setCampo} />}
            {activeTab === 'terreno' && <ImovibTerrenoTab study={study} formData={formData} setCampo={setCampo} />}
            {activeTab === 'memorial' && <ImovibMemorialTab study={study} formData={formData} setCampo={setCampo} />}

            {/* TAB: MERCADO */}
            {activeTab === 'mercado' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-indigo-500" />
                                Módulo 1 — Análise de Mercado
                            </h2>
                            <p className="text-slate-500 text-sm mt-1">Inteligência de mercado, demanda e concorrência.</p>
                        </div>

                        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-1 gap-6">
                            {renderTextarea('Macrolocalização (Cidade/Região)', 'location_macro', 'Dinâmica econômica local...')}
                            {renderTextarea('Microlocalização (Bairro/Vizinhança)', 'location_micro', 'Infraestrutura de transportes, saúde...')}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {renderInput('Score de Localização (1-10)', 'location_score', 'number')}
                                {/* Item 7.3: de onde veio a VSO e onde ela é usada. */}
                                <div>
                                    <label htmlFor="imovib-vso-regional" className="block text-xs font-semibold text-slate-500 mb-1.5">VSO Histórica Região (%)</label>
                                    <input
                                        id="imovib-vso-regional"
                                        type="number"
                                        value={(formData.vso_regional_percent as number | undefined) ?? ''}
                                        onChange={(e) => {
                                            setCampo('vso_regional_percent', e.target.value === '' ? null : parseFloat(e.target.value));
                                            setCampo('vso_regional_source', 'digitada');
                                        }}
                                        className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    />
                                    <p className="text-xs text-slate-600 mt-1">
                                        {formData.vso_regional_percent != null ? `Origem: ${ORIGEM_DA_VSO[formData.vso_regional_source ?? 'digitada']}. ` : ''} É referência; a curva de vendas do tipo VSO (aba Receitas) usa a VSO mensal, que os botões "Usar na curva de vendas" preenchem junto.
                                    </p>
                                </div>
                            </div>

                            {renderTextarea('Público Alvo / Buyer Persona', 'target_audience', 'Perfil de renda, ocupação familiar...')}
                            {renderTextarea('Demanda e Déficit', 'demand_deficit', 'Déficit habitacional por faixa de renda...')}
                        </fieldset>
                    </div>

                    <ImovibComparaveisCard study={study} onUsarVso={usarVso('comparaveis')} tipoDaCurva={String(formData.sales_curve_type ?? 'linear')} />

                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm">
                        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0">
                            {renderTextarea('Análise de Concorrentes (texto de apoio)', 'competitors_analysis', 'Oferta ativa num raio de influência, tickets médios...')}
                        </fieldset>
                    </div>

                    <ImovibMercadoDeOrigemCard study={study} onUsarVso={usarVso('market')} tipoDaCurva={String(formData.sales_curve_type ?? 'linear')} />
                </div>
            )}
        </div>
    );
};

export default ImovibPremisesForm;
