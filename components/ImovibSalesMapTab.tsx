import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BrainCircuit, BarChart3, Home, TrendingUp, AlertCircle } from 'lucide-react';
import { ImovibStudy, ImovibUnitInstance, ImovibUnitInstanceInsert, HedonicPricingConfig, Property, PropertyStatus } from '../types';
import { imovibService } from '../services/imovibService';
import { pricingService } from '../services/pricingService';
import PricingIntelligenceModal from './PricingIntelligenceModal';
import { useImovibMath } from '../hooks/useImovibMath';
import { useConfirm } from './ui/confirm';
import { planejarRegeneracao } from '../utils/imovibEspelho';
import { useToast } from '../hooks/useToast';

interface ImovibSalesMapTabProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    'DISPONÍVEL': 'bg-emerald-100 text-emerald-700',
    'RESERVADO': 'bg-amber-100 text-amber-700',
    'VENDIDO': 'bg-blue-100 text-blue-700',
    'PERMUTADO': 'bg-purple-100 text-purple-700',
};

const POSITION_OPTIONS = ['FRENTE', 'LATERAL', 'FUNDOS'] as const;
const SUN_OPTIONS = ['NORTE', 'SUL', 'LESTE', 'OESTE'] as const;
const STATUS_OPTIONS = ['DISPONÍVEL', 'RESERVADO', 'PERMUTADO', 'VENDIDO'] as const;

const formatBRL = (value: number): string =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const ImovibSalesMapTab: React.FC<ImovibSalesMapTabProps> = ({ study, onDataChanged }) => {
    const [instances, setInstances] = useState<ImovibUnitInstance[]>([]);
    const [loading, setLoading] = useState(true);
    // Falha ao ler o espelho ≠ espelho vazio: com erro, a tela mostra o erro e
    // "Tentar de novo"; o estado vazio (com Gerar) só aparece se a leitura deu certo.
    const [loadError, setLoadError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [pricingModalOpen, setPricingModalOpen] = useState(false);

    const blocks = study.blocks || [];
    const math = useImovibMath(study);
    const confirm = useConfirm();
    const { showToast } = useToast();

    const blockMap = Object.fromEntries(blocks.map(b => [b.id, b.name]));

    const loadInstances = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await imovibService.getUnitInstances(study.id);
            setInstances(data);
        } catch (err) {
            console.error('Error loading unit instances:', err);
            setLoadError((err as Error)?.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [study.id]);

    useEffect(() => {
        loadInstances();
    }, [loadInstances]);

    // Gerar: cria SÓ o que falta, lendo o espelho do banco na hora. Antes, se o
    // carregamento tinha falhado, a tela mostrava "não gerado" e Gerar inseria
    // tudo de novo (duplicava).
    const generateInstances = async () => {
        setGenerating(true);
        try {
            const atuais = await imovibService.getUnitInstances(study.id);
            const plano = planejarRegeneracao(study, atuais);
            await imovibService.createUnitInstances(plano.criar);
            await loadInstances();
            onDataChanged();
        } catch (err) {
            console.error('Error generating instances:', err);
            showToast(`Erro ao gerar o espelho de vendas: ${(err as Error).message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // Regenerar: alinha o espelho às tipologias SEM apagar e recriar — unidade que
    // continua existindo mantém id, preço, status, posição e sol (o vínculo com o
    // empreendimento sobrevive); sobrando só sai com confirmação própria.
    const handleRegenerate = async () => {
        setGenerating(true);
        try {
            const atuais = await imovibService.getUnitInstances(study.id);
            const plano = planejarRegeneracao(study, atuais);
            if (!plano.criar.length && !plano.atualizar.length && !plano.sobrando.length) {
                showToast('O espelho já está de acordo com as tipologias. Nada a fazer.', 'success');
                return;
            }
            const ok = await confirm({
                title: 'Alinhar o espelho às tipologias?',
                message: `${plano.criar.length} unidade(s) a criar e ${plano.atualizar.length} a atualizar (pavimento, área ou tipologia). Preço, status, posição e orientação das unidades existentes são mantidos.`,
                confirmLabel: 'Alinhar',
            });
            if (!ok) return;
            let removerSobrando = false;
            if (plano.sobrando.length) {
                removerSobrando = await confirm({
                    title: `Remover ${plano.sobrando.length} unidade(s) que não existem mais nas tipologias?`,
                    message: `${plano.sobrando.slice(0, 8).map(i => i.name).join(', ')}${plano.sobrando.length > 8 ? '…' : ''}. Se escolher manter, elas continuam no espelho (e no VGV).`,
                    confirmLabel: 'Remover',
                    cancelLabel: 'Manter',
                    variant: 'danger',
                });
            }
            await imovibService.createUnitInstances(plano.criar);
            await Promise.all(plano.atualizar.map(a => imovibService.updateUnitInstance(a.id, a.campos)));
            if (removerSobrando) await imovibService.deleteUnitInstancesByIds(plano.sobrando.map(i => i.id));
            await loadInstances();
            onDataChanged();
        } catch (err) {
            console.error('Error regenerating instances:', err);
            showToast(`Erro ao regenerar o espelho de vendas: ${(err as Error).message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const handleInlineUpdate = async (
        id: string,
        field: 'position_type' | 'sun_orientation' | 'status',
        value: string
    ) => {
        setInstances(prev =>
            prev.map(i => i.id === id ? { ...i, [field]: value as any } : i)
        );
        try {
            await imovibService.updateUnitInstance(id, { [field]: value as any });
            // Status muda o VGV (permutada sai): recarrega o estudo para o motor.
            if (field === 'status') onDataChanged();
        } catch (err) {
            console.error('Error updating instance:', err);
            showToast(`Erro ao salvar a unidade (a alteração foi desfeita): ${(err as Error).message}`, 'error');
            await loadInstances();
        }
    };

    const handleApplyPricing = async (config: HedonicPricingConfig) => {
        try {
            // Map position_type (PT-BR) → Property.position_type (EN)
            const positionMap: Record<string, Property['position_type']> = {
                FRENTE: 'FRONT',
                LATERAL: 'LATERAL',
                FUNDOS: 'BACK',
            };
            // Map sun_orientation (PT-BR) → Property.sun_orientation (EN)
            const sunMap: Record<string, Property['sun_orientation']> = {
                NORTE: 'NORTH',
                SUL: 'SOUTH',
                LESTE: 'EAST',
                OESTE: 'WEST',
            };
            // Map status → PropertyStatus
            const statusMap: Record<string, PropertyStatus> = {
                DISPONÍVEL: PropertyStatus.AVAILABLE,
                RESERVADO: PropertyStatus.RESERVED,
                VENDIDO: PropertyStatus.SOLD,
                PERMUTADO: PropertyStatus.EXCHANGED,
            };

            const adaptedUnits: Property[] = instances.map(inst => ({
                id: inst.id,
                name: inst.name,
                type: 'APARTMENT',
                address: '',
                area: inst.private_area,
                private_area: inst.private_area,
                price: inst.price,
                status: statusMap[inst.status] ?? PropertyStatus.AVAILABLE,
                floor: inst.floor,
                position_type: positionMap[inst.position_type] ?? 'LATERAL',
                view_type: 'NONE',
                sun_orientation: sunMap[inst.sun_orientation] ?? 'NORTH',
                specs: {},
            }));

            // Modelo hedônico com pesos embutidos: instância de estudo de viabilidade não
            // tem regras da aba Inteligência (elas são por edifício do Comercial), então
            // a Imovib segue com o cálculo antigo — Venda de Unidades usa área × regras.
            const priced = pricingService.calculateHedonicPrices(adaptedUnits, config);

            // Save updates for instances with price > 0
            const savePromises = priced
                .filter(p => p.price > 0)
                .map(p => imovibService.updateUnitInstance(p.id, { price: p.price }));

            await Promise.all(savePromises);
            await loadInstances();
            onDataChanged();
        } catch (err) {
            console.error('Error applying pricing:', err);
            showToast(`Erro ao aplicar a precificação: ${(err as Error).message}`, 'error');
        } finally {
            setPricingModalOpen(false);
        }
    };

    // KPI calculations
    const totalUnits = instances.length;
    const soldUnits = instances.filter(i => i.status === 'VENDIDO').length;
    // VGV do motor — o mesmo do Resumo, da Estática e da listagem (unidade sem
    // preço vale área × preço/m² do bloco; permutada fica fora; com prêmio ESG).
    const vgvTotal = math.vgvTotal;

    if (loading) {
        return (
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Home className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Vendas de Ativos</h2>
                        <p className="text-slate-500 text-sm font-medium mt-0.5">Unidades individualizadas do empreendimento</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {!loadError && instances.length > 0 && (
                        <>
                            <button
                                onClick={handleRegenerate}
                                disabled={generating}
                                title="Regenerar espelho"
                                className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-5 h-5 ${generating ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={() => setPricingModalOpen(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl font-black text-button uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                            >
                                <BrainCircuit className="w-4 h-4" />
                                Inteligência de Precificação
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* KPIs */}
            {!loadError && instances.length > 0 && (
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                    <div className="p-5 flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">VGV Total</p>
                            <p className="font-black text-slate-900 text-lg leading-tight">
                                {vgvTotal > 0 ? formatBRL(vgvTotal) : '—'}
                            </p>
                        </div>
                    </div>
                    <div className="p-5 flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Home className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Unidades</p>
                            <p className="font-black text-slate-900 text-lg leading-tight">{totalUnits}</p>
                        </div>
                    </div>
                    <div className="p-5 flex items-center gap-3">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Vendidas</p>
                            <p className="font-black text-slate-900 text-lg leading-tight">{soldUnits}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Body */}
            {loadError ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-red-50 rounded-2xl">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <p className="font-black text-slate-800 text-lg">Erro ao carregar as unidades do espelho de vendas</p>
                        <p className="text-slate-500 text-sm mt-1">{loadError}</p>
                    </div>
                    <button
                        onClick={loadInstances}
                        className="flex items-center gap-2 h-9 px-4 bg-white border border-slate-200 text-slate-700 rounded-[6px] text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar de novo
                    </button>
                </div>
            ) : instances.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-slate-100 rounded-2xl">
                        <Home className="w-10 h-10 text-slate-400" />
                    </div>
                    <div>
                        <p className="font-black text-slate-800 text-lg">Vendas de Ativos não gerado</p>
                        <p className="text-slate-500 text-sm mt-1">
                            Clique no botão abaixo para expandir as tipologias e gerar as unidades individuais.
                        </p>
                    </div>
                    {blocks.length === 0 ? (
                        <p className="text-amber-600 text-sm font-bold">
                            Adicione blocos e tipologias primeiro na aba de Tipologias.
                        </p>
                    ) : (
                        <button
                            onClick={generateInstances}
                            disabled={generating}
                            className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                        >
                            {generating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Gerando...
                                </>
                            ) : (
                                <>
                                    <Home className="w-4 h-4" />
                                    Gerar Vendas de Ativos
                                </>
                            )}
                        </button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Unidade</th>
                                <th className="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Bloco</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Andar</th>
                                <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Á. Priv.</th>
                                <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Preço</th>
                                <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Vlr/m²</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Peso Pos.</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Peso Sol</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Posição</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Sol</th>
                                <th className="text-center px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {instances.map((inst, idx) => {
                                const pricePerSqm =
                                    inst.price > 0 && inst.private_area > 0
                                        ? Math.round(inst.price / inst.private_area)
                                        : null;
                                return (
                                    <tr
                                        key={inst.id}
                                        className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                                    >
                                        {/* Unidade */}
                                        <td className="px-4 py-2.5 text-slate-800">{inst.name}</td>

                                        {/* Bloco */}
                                        <td className="px-4 py-2.5 text-slate-600 font-medium">
                                            {blockMap[inst.block_id] || '—'}
                                        </td>

                                        {/* Andar */}
                                        <td className="px-4 py-2.5 text-center text-slate-600 font-medium">{inst.floor}</td>

                                        {/* Área Privativa */}
                                        <td className="px-4 py-2.5 text-right text-slate-600 font-medium">
                                            {inst.private_area > 0 ? `${inst.private_area} m²` : '—'}
                                        </td>

                                        {/* Preço */}
                                        <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                                            {inst.price > 0 ? formatBRL(inst.price) : '—'}
                                        </td>

                                        {/* VLR/m² */}
                                        <td className="px-4 py-2.5 text-right text-slate-600 font-medium">
                                            {pricePerSqm ? formatBRL(pricePerSqm) : '—'}
                                        </td>

                                        {/* Peso Pos. */}
                                        <td className="px-4 py-2.5 text-center text-sm">
                                            <div className="flex flex-col items-center">
                                                <span className="text-slate-900 leading-none mb-0.5">
                                                    {inst.position_type === 'FRENTE' ? '1.03x' : inst.position_type === 'FUNDOS' ? '0.97x' : '1.00x'}
                                                </span>
                                                <span className="text-slate-500 text-xs">
                                                    {inst.position_type === 'FRENTE' ? 'Frente' : inst.position_type === 'FUNDOS' ? 'Fundos' : 'Lateral / Base'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Peso Sol */}
                                        <td className="px-4 py-2.5 text-center text-sm">
                                            <div className="flex flex-col items-center">
                                                <span className="text-slate-900 leading-none mb-0.5">
                                                    {inst.sun_orientation === 'NORTE' ? '1.02x' : inst.sun_orientation === 'LESTE' ? '1.01x' : inst.sun_orientation === 'OESTE' ? '0.99x' : '0.98x'}
                                                </span>
                                                <span className="text-slate-500 text-xs">
                                                    {inst.sun_orientation === 'NORTE' ? 'Norte' : inst.sun_orientation === 'LESTE' ? 'Leste' : inst.sun_orientation === 'OESTE' ? 'Oeste' : 'Sul'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Posição */}
                                        <td className="px-4 py-2.5 text-center">
                                            <select
                                                value={inst.position_type}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'position_type', e.target.value)
                                                }
                                                className="text-sm font-normal bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer"
                                            >
                                                {POSITION_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Sol */}
                                        <td className="px-4 py-2.5 text-center">
                                            <select
                                                value={inst.sun_orientation}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'sun_orientation', e.target.value)
                                                }
                                                className="text-sm font-normal bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer"
                                            >
                                                {SUN_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-2.5 text-center">
                                            <select
                                                value={inst.status}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'status', e.target.value)
                                                }
                                                className={`text-sm font-normal border rounded px-2 py-1 focus:outline-none cursor-pointer ${STATUS_COLORS[inst.status] || 'bg-slate-100 text-slate-700'} border-transparent`}
                                            >
                                                {STATUS_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <PricingIntelligenceModal
                isOpen={pricingModalOpen}
                onClose={() => setPricingModalOpen(false)}
                onApply={handleApplyPricing}
                buildingName={study.name}
            />
        </div>
    );
};

export default ImovibSalesMapTab;
