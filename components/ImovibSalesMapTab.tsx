import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BrainCircuit, BarChart3, Home, TrendingUp, AlertCircle } from 'lucide-react';
import { ImovibStudy, ImovibUnitInstance, ImovibUnitInstanceInsert, HedonicPricingConfig, Property, PropertyStatus } from '../types';
import { imovibService } from '../services/imovibService';
import { pricingService } from '../services/pricingService';
import PricingIntelligenceModal from './PricingIntelligenceModal';
import { useImovibMath } from '../hooks/useImovibMath';
import { useConfirm } from './ui/confirm';
import { planejarRegeneracao } from '../utils/imovibEspelho';
import { previewWriteBackImovib, applyWriteBackImovib } from '../services/sync/writeBackImovib';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { KpiCard } from './ui/KpiCard';

interface ImovibSalesMapTabProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

// §8 do guia: status é texto colorido — sem pílula/fundo.
const STATUS_COLORS: Record<string, string> = {
    'DISPONÍVEL': 'text-emerald-700',
    'RESERVADO': 'text-amber-700',
    'VENDIDO': 'text-blue-700',
    'PERMUTADO': 'text-purple-700',
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
    const { pode, motivo } = useImovibEdicao();

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

    // Estudo vinculado a empreendimento (19/10/2026): o espelho nasce das UNIDADES
    // REAIS do empreendimento — as que a Planta Inteligente envia —, não da expansão
    // de tipologias. É o write-back que já existia na Central de Sync: cria o que
    // falta, atualiza só estrutura (nome, pavimento, área, posição, sol), nunca
    // preço nem status do espelho, e nunca apaga.
    const empreendimentoId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const alinharPeloEmpreendimento = async (empId: string) => {
        setGenerating(true);
        try {
            const itens = await previewWriteBackImovib(empId);
            if (!itens.length) {
                showToast('O espelho já está de acordo com as unidades do empreendimento. Nada a fazer.', 'success');
                return;
            }
            const criar = itens.filter(i => i.kind === 'create').length;
            const ok = await confirm({
                title: 'Alinhar o espelho às unidades do empreendimento?',
                message: `De "${study.estrutura?.empreendimento_nome}": ${criar} unidade(s) a criar e ${itens.length - criar} a atualizar (nome, pavimento, área, posição ou orientação). Preço e status do espelho são mantidos; nada é apagado.`,
                confirmLabel: 'Alinhar',
            });
            if (!ok) return;
            await applyWriteBackImovib(empId, itens.map(i => i.unitId));
            await loadInstances();
            onDataChanged();
        } catch (err) {
            console.error('Error aligning instances with empreendimento:', err);
            showToast(`Erro ao alinhar o espelho ao empreendimento: ${(err as Error).message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // Gerar: cria SÓ o que falta, lendo o espelho do banco na hora. Antes, se o
    // carregamento tinha falhado, a tela mostrava "não gerado" e Gerar inseria
    // tudo de novo (duplicava).
    const generateInstances = async () => {
        if (empreendimentoId) return alinharPeloEmpreendimento(empreendimentoId);
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
        if (empreendimentoId) return alinharPeloEmpreendimento(empreendimentoId);
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
            <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-[6px]">
                        <Home className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Vendas de Ativos</h2>
                        <p className="text-slate-500 text-sm mt-0.5">Unidades individualizadas do empreendimento</p>
                    </div>
                </div>
                {/* Regenerar e Precificação gravam no espelho. */}
                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 flex items-center gap-3 flex-wrap">
                    {!loadError && instances.length > 0 && (
                        <>
                            <button
                                onClick={handleRegenerate}
                                disabled={generating}
                                title={!pode ? motivo : 'Regenerar espelho'}
                                className="h-9 w-9 flex items-center justify-center bg-white border border-gray-200 text-slate-600 rounded-[6px] hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={() => setPricingModalOpen(true)}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                            >
                                <BrainCircuit className="w-[15px] h-[15px]" />
                                Inteligência de Precificação
                            </button>
                        </>
                    )}
                </fieldset>
            </div>

            {/* KPIs — §4: KpiCard */}
            {!loadError && instances.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-gray-100">
                    <KpiCard
                        label="VGV Total"
                        value={vgvTotal > 0 ? formatBRL(vgvTotal) : '—'}
                        icon={<BarChart3 className="w-4 h-4" />}
                        color="blue"
                    />
                    <KpiCard
                        label="Total Unidades"
                        value={totalUnits}
                        icon={<Home className="w-4 h-4" />}
                        color="emerald"
                    />
                    <KpiCard
                        label="Vendidas"
                        value={soldUnits}
                        icon={<TrendingUp className="w-4 h-4" />}
                        color="amber"
                    />
                </div>
            )}

            {/* Body */}
            {loadError ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-red-50 rounded-[10px]">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-900">Erro ao carregar as unidades do espelho de vendas</p>
                        <p className="text-slate-500 text-sm mt-1">{loadError}</p>
                    </div>
                    <button
                        onClick={loadInstances}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-slate-700 rounded-[6px] font-medium text-[13px] hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar de novo
                    </button>
                </div>
            ) : instances.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-slate-100 rounded-[10px]">
                        <Home className="w-10 h-10 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-900">Vendas de Ativos não gerado</p>
                        <p className="text-slate-500 text-sm mt-1">
                            {empreendimentoId
                                ? 'Clique no botão abaixo para trazer as unidades do empreendimento vinculado.'
                                : 'Clique no botão abaixo para expandir as tipologias e gerar as unidades individuais.'}
                        </p>
                    </div>
                    {blocks.length === 0 ? (
                        <p className="text-amber-600 text-sm font-medium">
                            {empreendimentoId
                                ? 'O empreendimento vinculado ainda não tem torres: envie o estudo de massa a ele na Planta Inteligente.'
                                : 'Este estudo não tem blocos: vincule um empreendimento em Premissas › Identificação.'}
                        </p>
                    ) : (
                        <button
                            onClick={generateInstances}
                            disabled={generating || !pode}
                            title={!pode ? motivo : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] font-medium text-[13px] hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  {/* Posição, Sol e Status gravam na hora (handleInlineUpdate). */}
                  <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                <th className="text-left px-6 py-2 border-r border-gray-100 last:border-r-0">Unidade</th>
                                <th className="text-left px-6 py-2 border-r border-gray-100 last:border-r-0">Bloco</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Andar</th>
                                <th className="text-right px-6 py-2 border-r border-gray-100 last:border-r-0">Á. Priv.</th>
                                <th className="text-right px-6 py-2 border-r border-gray-100 last:border-r-0">Preço</th>
                                <th className="text-right px-6 py-2 border-r border-gray-100 last:border-r-0">Vlr/m²</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Peso Pos.</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Peso Sol</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Posição</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Sol</th>
                                <th className="text-center px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {instances.map((inst) => {
                                const pricePerSqm =
                                    inst.price > 0 && inst.private_area > 0
                                        ? Math.round(inst.price / inst.private_area)
                                        : null;
                                return (
                                    <tr
                                        key={inst.id}
                                        className="hover:bg-blue-50/50 transition-colors"
                                    >
                                        {/* Unidade */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{inst.name}</td>

                                        {/* Bloco */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                            {blockMap[inst.block_id] || '—'}
                                        </td>

                                        {/* Andar */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal text-gray-600">{inst.floor}</td>

                                        {/* Área Privativa */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                            {inst.private_area > 0 ? `${inst.private_area} m²` : '—'}
                                        </td>

                                        {/* Preço */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                            {inst.price > 0 ? formatBRL(inst.price) : '—'}
                                        </td>

                                        {/* VLR/m² */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                            {pricePerSqm ? formatBRL(pricePerSqm) : '—'}
                                        </td>

                                        {/* Peso Pos. */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal">
                                            <div className="flex flex-col items-center">
                                                <span className="text-gray-700 leading-none mb-0.5">
                                                    {inst.position_type === 'FRENTE' ? '1.03x' : inst.position_type === 'FUNDOS' ? '0.97x' : '1.00x'}
                                                </span>
                                                <span className="text-gray-500 text-xs">
                                                    {inst.position_type === 'FRENTE' ? 'Frente' : inst.position_type === 'FUNDOS' ? 'Fundos' : 'Lateral / Base'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Peso Sol */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal">
                                            <div className="flex flex-col items-center">
                                                <span className="text-gray-700 leading-none mb-0.5">
                                                    {inst.sun_orientation === 'NORTE' ? '1.02x' : inst.sun_orientation === 'LESTE' ? '1.01x' : inst.sun_orientation === 'OESTE' ? '0.99x' : '0.98x'}
                                                </span>
                                                <span className="text-gray-500 text-xs">
                                                    {inst.sun_orientation === 'NORTE' ? 'Norte' : inst.sun_orientation === 'LESTE' ? 'Leste' : inst.sun_orientation === 'OESTE' ? 'Oeste' : 'Sul'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Posição */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                            <select
                                                value={inst.position_type}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'position_type', e.target.value)
                                                }
                                                className="text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {POSITION_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Sol */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                            <select
                                                value={inst.sun_orientation}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'sun_orientation', e.target.value)
                                                }
                                                className="text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {SUN_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                            <select
                                                value={inst.status}
                                                onChange={e =>
                                                    handleInlineUpdate(inst.id, 'status', e.target.value)
                                                }
                                                className={`text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed ${STATUS_COLORS[inst.status] || 'text-gray-700'}`}
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
                  </fieldset>
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
