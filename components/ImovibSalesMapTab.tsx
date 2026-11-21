import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, BrainCircuit, BarChart3, Home, TrendingUp, AlertCircle, AlertTriangle } from 'lucide-react';
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
import { useImovibPreferencias } from '../hooks/useImovibPreferencias';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import ImovibEspelhoForaDoVgvSheet from './ImovibEspelhoForaDoVgvSheet';
import { OPCOES_AGRUPAR_ESPELHO, chaveDoEspelho, ordemDoEspelho, SEM_ROTULO_ESPELHO, valorNoVgv, type CampoAgruparEspelho, type LinhaDoEspelho } from '../utils/imovibEspelhoGrupos';

interface ImovibSalesMapTabProps {
    study: ImovibStudy;
    onDataChanged: () => void;
    /** Abre as Preferências do estudo (painel do triângulo "Unidades fora do VGV"). */
    onAbrirPreferencias?: () => void;
    /** Desenha a barra das sub-abas de Receitas com as ações do espelho (Regenerar, Inteligência de Precificação)
     *  à direita. Sem ela, as ações ficam numa linha própria acima do espelho. */
    barraDeAbas?: (acoes: React.ReactNode) => React.ReactNode;
}

// Tabela padrão (§6.10): ordenação, Agrupar (§6.12), redimensionar e auto-ajuste (§6.1.2) vêm do StandardTable.
const COLUNAS_ESPELHO: StandardTableColumn[] = [
    { key: 'name', label: 'Unidade', width: 210 },
    { key: 'torre', label: 'Torre', width: 120 },
    { key: 'floor', label: 'Andar', width: 90, align: 'center' },
    { key: 'area', label: 'Á. priv.', width: 110, align: 'right' },
    { key: 'price', label: 'Preço', width: 140, align: 'right' },
    { key: 'm2', label: 'Vlr/m²', width: 120, align: 'right' },
    { key: 'peso_pos', label: 'Peso pos.', width: 120, align: 'center' },
    { key: 'peso_sol', label: 'Peso sol', width: 110, align: 'center' },
    { key: 'position_type', label: 'Posição', width: 130, align: 'center' },
    { key: 'sun_orientation', label: 'Sol', width: 120, align: 'center' },
    { key: 'status', label: 'Status', width: 140, align: 'center' },
];

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

const ImovibSalesMapTab: React.FC<ImovibSalesMapTabProps> = ({ study, onDataChanged, onAbrirPreferencias, barraDeAbas }) => {
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
    // Preferência do usuário (Preferências do estudo, plano 2026-11-20-imovib-preferencias-estudo): não vendável
    // no empreendimento fica fora da lista por padrão; "sem unidade" sempre aparece (pede ação).
    const { exibirNaoVendaveis } = useImovibPreferencias();

    const blockMap = useMemo(() => Object.fromEntries(blocks.map(b => [b.id, b.name])) as Record<string, string>, [blocks]);
    const precoM2Da = useMemo(() => Object.fromEntries(blocks.map(b => [b.id, b.sales_price_sqm || 0])) as Record<string, number>, [blocks]);
    const [foraDoVgvAberto, setForaDoVgvAberto] = useState(false);

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

            const adaptedUnits: Property[] = instances.filter(inst => !marcaDe.get(inst.id)).map(inst => ({
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

    // Plano 2026-11-19-espelho-vendavel-vgv: com empreendimento vinculado, unidade não vendável nele ou sem
    // unidade nele fica fora do VGV. A marca vem do estudo carregado (derivada na leitura).
    const marcaDe = useMemo(() => new Map((study.unit_instances || []).filter(i => i.fora_do_vgv).map(i => [i.id, i.fora_do_vgv!])), [study.unit_instances]);
    // Agrupar (§6.12): Torre, Andar, Status e No VGV; total do grupo = o que soma no VGV (utils/imovibEspelhoGrupos).
    const linhaDe = useCallback((i: ImovibUnitInstance): LinhaDoEspelho => ({
        torre: blockMap[i.block_id], andar: i.floor, status: i.status, marca: marcaDe.get(i.id),
        preco: i.price, area: i.private_area, precoM2: precoM2Da[i.block_id],
    }), [blockMap, marcaDe, precoM2Da]);
    const agrupamento = useMemo(() => ({
        opcoes: OPCOES_AGRUPAR_ESPELHO,
        chave: (campo: string, i: ImovibUnitInstance) => chaveDoEspelho(campo, linhaDe(i)),
        semRotulo: (campo: string) => SEM_ROTULO_ESPELHO[campo as CampoAgruparEspelho] ?? 'Sem grupo',
        ordem: ordemDoEspelho,
        valor: (i: ImovibUnitInstance) => valorNoVgv(linhaDe(i)),
        title: 'Agrupar as unidades',
        tituloTotal: 'Soma no VGV (preço, ou área × preço/m² da torre)',
        padrao: 'torre',
    }), [linhaDe]);
    const naoVendaveis = instances.filter(i => marcaDe.get(i.id) === 'nao_vendavel');
    const semUnidade = instances.filter(i => marcaDe.get(i.id) === 'sem_unidade');
    // Revisão (I1): a marca vem do estudo carregado e pode estar velha — confere o vínculo no banco na hora;
    // vendida/reservada nunca sai por aqui.
    const removerSemUnidade = async () => {
        const vendidas = semUnidade.filter(i => i.status !== 'DISPONÍVEL');
        const candidatas = semUnidade.filter(i => i.status === 'DISPONÍVEL');
        let ligadasAgora = new Set<string>();
        try {
            ligadasAgora = candidatas.length ? await imovibService.instanciasLigadasAoEmpreendimento(candidatas.map(i => i.id)) : new Set();
        } catch (err) {
            showToast(`Não foi possível conferir o vínculo com o empreendimento: ${(err as Error).message}`, 'error');
            return;
        }
        const alvo = candidatas.filter(i => !ligadasAgora.has(i.id));
        const ficam = [
            ...vendidas.map(i => `${i.name} (vendida ou reservada)`),
            ...candidatas.filter(i => ligadasAgora.has(i.id)).map(i => `${i.name} (já ligada ao empreendimento)`),
        ];
        if (!alvo.length) {
            showToast(`Nada a remover${ficam.length ? `: ${ficam.join(', ')}` : ''}.`, 'success');
            onDataChanged();
            return;
        }
        const nomes = alvo.map(i => i.name);
        const ok = await confirm({
            title: `Remover ${alvo.length} unidade(s) do espelho sem unidade no empreendimento?`,
            message: `${nomes.slice(0, 12).join(', ')}${nomes.length > 12 ? '…' : ''}. Elas já estão fora do VGV; remover só limpa o espelho. Não dá para desfazer.`
                + (ficam.length ? `\n\nFicam no espelho: ${ficam.join(', ')}.` : '')
                + `\n\nSe elas existem no empreendimento com outro vínculo, use "Alinhar" antes — ele liga em vez de duplicar.`,
            confirmLabel: 'Remover', variant: 'danger',
        });
        if (!ok) return;
        try {
            await imovibService.deleteUnitInstancesByIds(alvo.map(i => i.id));
            await loadInstances();
            onDataChanged();
        } catch (err) {
            showToast(`Erro ao remover as unidades sem correspondência: ${(err as Error).message}`, 'error');
        }
    };

    // KPI calculations
    const totalUnits = instances.length;
    const soldUnits = instances.filter(i => i.status === 'VENDIDO').length;
    // VGV do motor — o mesmo do Resumo, da Estática e da listagem (unidade sem
    // preço vale área × preço/m² do bloco; permutada fica fora).
    const vgvTotal = math.vgvTotal;
    const foraDoVgv = naoVendaveis.length + semUnidade.length;
    const mensagemForaDoVgv = `${foraDoVgv} unidade(s) do espelho fora do VGV`
        + (naoVendaveis.length > 0 ? ` · ${naoVendaveis.length} não vendável no empreendimento${!exibirNaoVendaveis ? ` (${naoVendaveis.length === 1 ? 'oculta' : 'ocultas'} na lista — Preferências)` : ''}` : '')
        + (semUnidade.length > 0 ? ` · ${semUnidade.length} sem unidade no empreendimento (${formatBRL(semUnidade.reduce((t, x) => t + (x.price || 0), 0))} em preço)` : '')
        + '. Para mudar o que é vendável, use a coluna "Vendável" em Empreendimento › Espelho de vendas.';

    // Regenerar e Precificação gravam no espelho: sem permissão, desligados com o motivo. Moram na barra das sub-abas
    // de Receitas (pedido de 20/11, plano 2026-11-20-imovib-espelho-aba-tabela-padrao) — quem desenha a barra é o
    // ImovibReceitasForm, por `barraDeAbas`; sozinho (sem a barra), o espelho os põe numa linha à direita.
    const acoes = (
        <>
            <span className="inline-flex" title={!pode ? motivo : undefined}>
                <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={generating || !pode}
                    title={pode ? 'Regenerar espelho' : undefined}
                    aria-label="Regenerar espelho"
                    className="h-9 w-9 flex items-center justify-center bg-white border border-gray-200 text-slate-600 rounded-[6px] hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                </button>
            </span>
            <span className="inline-flex" title={!pode ? motivo : undefined}>
                <button
                    type="button"
                    onClick={() => setPricingModalOpen(true)}
                    disabled={!pode}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainCircuit className="w-[15px] h-[15px]" />
                    Inteligência de Precificação
                </button>
            </span>
        </>
    );
    const barra = barraDeAbas ? barraDeAbas(acoes) : <div className="flex justify-end gap-2">{acoes}</div>;

    if (loading) {
        return (
            <>
            {barra}
            <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
            </>
        );
    }

    return (
        <>
        {barra}
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
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
                // Posição, Sol e Status gravam na hora (handleInlineUpdate); sem permissão, os selects ficam
                // desligados com o motivo — o resto da toolbar (busca, Grupo, colunas) segue livre.
                <StandardTable<ImovibUnitInstance>
                    storageKey="imovib:espelho"
                    columns={COLUNAS_ESPELHO}
                    rows={instances.filter(i => exibirNaoVendaveis || marcaDe.get(i.id) !== 'nao_vendavel')}
                    rowKey={i => i.id}
                    dense
                    bare
                    searchText={i => `${i.name} ${blockMap[i.block_id] ?? ''}`}
                    searchPlaceholder="Buscar unidade ou torre…"
                    agrupamento={agrupamento}
                    sortValue={(k, i) => {
                        switch (k) {
                            case 'name': return i.name;
                            case 'torre': return blockMap[i.block_id] ?? '';
                            case 'floor': return i.floor;
                            case 'area': return i.private_area;
                            case 'price': return marcaDe.get(i.id) ? -1 : i.price;
                            case 'm2': return i.price > 0 && i.private_area > 0 ? i.price / i.private_area : 0;
                            case 'peso_pos': case 'position_type': return i.position_type;
                            case 'peso_sol': case 'sun_orientation': return i.sun_orientation;
                            case 'status': return i.status;
                            default: return null;
                        }
                    }}
                    toolbarRight={(
                        <div className="flex items-center gap-2 shrink-0">
                        {foraDoVgv > 0 && (
                        <span className="relative inline-flex shrink-0">
                            <ActionIconButton
                                kind="view"
                                tone="attention"
                                icon={<AlertTriangle className="w-4 h-4" />}
                                title={mensagemForaDoVgv}
                                aria-label={`Unidades fora do VGV (${foraDoVgv})`}
                                className="flex h-9 w-9 items-center justify-center"
                                onClick={() => setForaDoVgvAberto(true)}
                            />
                            <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">{foraDoVgv}</span>
                        </span>
                        )}
                        </div>
                    )}
                    renderCell={(k, inst) => {
                        const marca = marcaDe.get(inst.id);
                        switch (k) {
                            case 'name': return (
                                <span className="text-sm font-normal text-gray-700">
                                    {inst.name}
                                    {marca && <span className="block text-xs text-amber-800">{marca === 'nao_vendavel' ? 'Não vendável no empreendimento' : 'Sem unidade no empreendimento'}</span>}
                                </span>
                            );
                            case 'torre': return <span className="text-sm font-normal text-gray-700">{blockMap[inst.block_id] || '—'}</span>;
                            case 'floor': return <span className="text-sm font-normal text-gray-600">{inst.floor}</span>;
                            case 'area': return <span className="text-sm font-normal text-gray-600">{inst.private_area > 0 ? `${inst.private_area} m²` : '—'}</span>;
                            case 'price': return marca
                                ? <span className="text-xs font-normal text-amber-800">fora do VGV</span>
                                : <span className="text-sm font-medium text-gray-800">{inst.price > 0 ? formatBRL(inst.price) : '—'}</span>;
                            case 'm2': {
                                const m2 = inst.price > 0 && inst.private_area > 0 ? Math.round(inst.price / inst.private_area) : null;
                                return <span className="text-sm font-medium text-gray-800">{m2 ? formatBRL(m2) : '—'}</span>;
                            }
                            case 'peso_pos': return (
                                <span className="flex flex-col items-center text-sm font-normal">
                                    <span className="text-gray-700 leading-none mb-0.5">{inst.position_type === 'FRENTE' ? '1.03x' : inst.position_type === 'FUNDOS' ? '0.97x' : '1.00x'}</span>
                                    <span className="text-gray-500 text-xs">{inst.position_type === 'FRENTE' ? 'Frente' : inst.position_type === 'FUNDOS' ? 'Fundos' : 'Lateral / Base'}</span>
                                </span>
                            );
                            case 'peso_sol': return (
                                <span className="flex flex-col items-center text-sm font-normal">
                                    <span className="text-gray-700 leading-none mb-0.5">{inst.sun_orientation === 'NORTE' ? '1.02x' : inst.sun_orientation === 'LESTE' ? '1.01x' : inst.sun_orientation === 'OESTE' ? '0.99x' : '0.98x'}</span>
                                    <span className="text-gray-500 text-xs">{inst.sun_orientation === 'NORTE' ? 'Norte' : inst.sun_orientation === 'LESTE' ? 'Leste' : inst.sun_orientation === 'OESTE' ? 'Oeste' : 'Sul'}</span>
                                </span>
                            );
                            case 'position_type': return (
                                <select aria-label={`Posição — ${inst.name}`} value={inst.position_type} disabled={!pode} title={!pode ? motivo : undefined}
                                    onChange={e => handleInlineUpdate(inst.id, 'position_type', e.target.value)}
                                    className="text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed">
                                    {POSITION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            );
                            case 'sun_orientation': return (
                                <select aria-label={`Sol — ${inst.name}`} value={inst.sun_orientation} disabled={!pode} title={!pode ? motivo : undefined}
                                    onChange={e => handleInlineUpdate(inst.id, 'sun_orientation', e.target.value)}
                                    className="text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed">
                                    {SUN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            );
                            case 'status': return (
                                <select aria-label={`Status — ${inst.name}`} value={inst.status} disabled={!pode} title={!pode ? motivo : undefined}
                                    onChange={e => handleInlineUpdate(inst.id, 'status', e.target.value)}
                                    className={`text-sm font-normal bg-gray-50 border border-gray-100 rounded-[6px] px-2 py-1 focus:outline-none focus:border-blue-400 cursor-pointer disabled:cursor-not-allowed ${STATUS_COLORS[inst.status] || 'text-gray-700'}`}>
                                    {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            );
                            default: return null;
                        }
                    }}
                />
            )}

            <ImovibEspelhoForaDoVgvSheet
                open={foraDoVgvAberto}
                onClose={() => setForaDoVgvAberto(false)}
                mensagem={mensagemForaDoVgv}
                naoVendaveis={naoVendaveis.length}
                semUnidade={semUnidade.length}
                onAbrirPreferencias={onAbrirPreferencias ? () => { setForaDoVgvAberto(false); onAbrirPreferencias(); } : undefined}
                onRemoverSemUnidade={() => { setForaDoVgvAberto(false); void removerSemUnidade(); }}
                podeRemover={pode}
                motivo={motivo}
            />

            <PricingIntelligenceModal
                isOpen={pricingModalOpen}
                onClose={() => setPricingModalOpen(false)}
                onApply={handleApplyPricing}
                buildingName={study.name}
            />
        </div>
        </>
    );
};

export default ImovibSalesMapTab;
