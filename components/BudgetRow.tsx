import MoneyCentsInput from './ui/MoneyCentsInput';
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Layers, Box, Loader2, ChevronDown, ChevronRight, Maximize2, Star, Pencil, ArrowUp, ArrowDown, ClipboardList, Database } from 'lucide-react';
import { BudgetEntry, SinapiItem, SinapiType, CompositionComponent } from '../types';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { useConfirm } from './ui/confirm';
import { Copy } from 'lucide-react';

/** Posição das colunas fixas à esquerda (BudgetEditor calcula pelas larguras atuais). */
export interface EsquerdaFixa { drag: number; item: number; base: number; codigo: number; descricao: number }
const SOMBRA_FIXA = '6px 0 8px -6px rgba(15, 23, 42, 0.14)';
/** Os handlers de mover/duplicar recebem o evento só para stopPropagation. */
const SEM_EVENTO = { stopPropagation() { /* nada */ }, preventDefault() { /* nada */ } } as unknown as React.MouseEvent;

interface BudgetRowProps {
    item: BudgetEntry;
    itemIndex: number;
    subIdDisplay: string;
    onUpdateQuantity: (id: string, qtd: number) => void;
    onUpdatePrice: (id: string, price: number) => void;
    onUpdateBDI: (id: string, bdi: number | undefined) => void;
    /** CPU "abaixo do item": chamado só no "Salvar no orçamento", com a composição do rascunho. */
    onSaveComposition: (itemId: string, novaComposicao: CompositionComponent[]) => void;
    onSaveToCustomDB: (item: SinapiItem) => void;
    onDeleteItem: (e: React.MouseEvent, id: string) => void;
    onMoveItem?: (e: React.MouseEvent, id: string, direction: 'UP' | 'DOWN') => void;
    isFirst?: boolean;
    isLast?: boolean;
    globalBDI: number;
    viewMode?: 'inline' | 'modal';
    onOpenModal?: (item: BudgetEntry) => void;
    onDuplicateItem: (e: React.MouseEvent, id: string) => void;
    onOpenDetails?: (item: BudgetEntry) => void;
    isFavorite?: boolean;
    onToggleFavorite?: (e: React.MouseEvent, code: string) => void;
    showNatureBreakdown?: boolean;
    natureBreakdown?: { material: number; labor: number; equipment: number; other: number };
    auxiliaryItems?: Map<string, SinapiItem>;
    isLocked?: boolean;
    /** Colunas fixas (arraste, Item, Base, Código, Descrição) — guia §6.13.1. */
    esquerdaFixa?: EsquerdaFixa;
}

/** Classe base de toda célula de dado — separador vertical + altura de linha (§6.6/§7.2).
 *  `px-3` (não `px-6`) por §7.3: com 12-15 colunas, 24px de cada lado estouraria a largura.
 *  (A tipografia/pílulas da antiga exceção §7.3 foi revogada em 17/10/2026 — vale o §7/§8.) */
const TD = 'px-3 py-2.5 border-r border-gray-100 last:border-r-0';

const getTypeBadge = (type: SinapiType, onClick?: (e: React.MouseEvent) => void) => {
    if (type === SinapiType.COMPOSITION) {
        return (
            <button
                onClick={onClick}
                type="button"
                // Repete o botão da CPU da coluna Item: fica no mouse, sai do Tab e do leitor de tela.
                tabIndex={-1}
                aria-hidden="true"
                className={`flex items-center justify-center bg-blue-100 text-blue-700 p-1 rounded-[6px] border border-blue-200 transition-all ${onClick ? 'hover:bg-blue-200 hover:border-blue-300 active:scale-95 cursor-pointer' : ''}`}
                title={onClick ? "Ver detalhes da composição" : "Composição"}
            >
                <Layers className="w-3 h-3" />
            </button>
        );
    }
    // Tipo = texto colorido simples (§8): sem pílula, fundo nem caixa alta.
    if (type === SinapiType.SERVICE) {
        return (
            <span className="flex items-center gap-1 shrink-0 text-sm font-normal text-purple-700">
                <Loader2 className="w-3 h-3" />
                Serviço
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 shrink-0 text-sm font-normal text-amber-700">
            <Box className="w-3 h-3" />
            Insumo
        </span>
    );
};

export const BudgetRow: React.FC<BudgetRowProps> = ({
    item,
    itemIndex,
    subIdDisplay,
    onUpdateQuantity,
    onUpdatePrice,
    onUpdateBDI,
    onSaveComposition,
    onSaveToCustomDB,
    onDeleteItem,
    onMoveItem,
    isFirst,
    isLast,
    globalBDI,
    viewMode = 'modal',
    onOpenModal,
    onDuplicateItem,
    onOpenDetails,
    isFavorite,
    onToggleFavorite,
    showNatureBreakdown,
    natureBreakdown,
    auxiliaryItems,
    isLocked,
    esquerdaFixa,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isSavingCustom, setIsSavingCustom] = React.useState(false);
    const hasComposition = item.sinapiItem?.composition && item.sinapiItem.composition.length > 0;
    const canOpenCPU = item.sinapiItem?.type === SinapiType.COMPOSITION || hasComposition;
    const hasCalculationMemory = !!(item.calculationMemory?.formula?.trim() || item.calculationMemory?.justification?.trim() || item.calculationMemory?.result !== undefined);
    // Colunas da tabela (BudgetEditor.tsx monta o mesmo <colgroup>): drag + 10
    // redimensionáveis + espaçador (§6.1.1) + preço total, mais 3 de natureza.
    const totalCols = showNatureBreakdown ? 16 : 13;

    // Célula fixa: fundo opaco (o resto da linha rola por baixo). #fafcff = o hover blue-50/30
    // da linha já composto sobre o branco.
    const FUNDO_FIXO = `bg-white group-hover:bg-[#fafcff] ${isExpanded ? '!bg-[#fbfdff]' : ''}`;
    const fixa = (left: number | undefined, ultima = false): React.CSSProperties | undefined =>
        left === undefined ? undefined : { position: 'sticky', left, zIndex: 1, ...(ultima ? { boxShadow: SOMBRA_FIXA } : {}) };

    // CPU "abaixo do item" com RASCUNHO (2ª crítica, 2026-11-14): editar não grava; "Salvar no
    // orçamento" grava, "Cancelar" descarta, recolher com pendência pergunta. Mesma regra da janela.
    const confirm = useConfirm();
    const [compRascunho, setCompRascunho] = React.useState<CompositionComponent[] | null>(null);
    const composicaoNaTela = compRascunho ?? item.sinapiItem?.composition ?? [];
    const precoDoComp = (comp: CompositionComponent) => comp.price || auxiliaryItems?.get(comp.code)?.price || 0;
    const precoUnitarioRascunho = composicaoNaTela.reduce((acc, comp) => acc + (comp.quantity || 0) * precoDoComp(comp), 0);
    const alterarComp = (idx: number, updates: Partial<CompositionComponent>) => {
        if (isLocked) return;
        const nova = [...composicaoNaTela];
        nova[idx] = { ...nova[idx], ...updates };
        setCompRascunho(nova);
    };
    const descartarRascunho = async (): Promise<boolean> => {
        if (!compRascunho) return true;
        const ok = await confirm({
            title: 'Descartar as alterações da composição?',
            message: 'As quantidades e preços alterados aqui não vão para o orçamento.',
            variant: 'warning',
            confirmLabel: 'Descartar',
            cancelLabel: 'Continuar editando',
        });
        if (ok) setCompRascunho(null);
        return ok;
    };
    const alternarCpuInline = async () => {
        if (isExpanded && !(await descartarRascunho())) return;
        setIsExpanded(!isExpanded);
    };

    const codigoDoItem = `${subIdDisplay}${(itemIndex + 1).toString().padStart(2, '0')}`;

    const handleToggleCPU = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'modal') {
            onOpenModal?.(item);
        } else if (canOpenCPU) {
            void alternarCpuInline();
        }
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSavingCustom(true);
        try {
            if (item.sinapiItem) {
                await onSaveToCustomDB(item.sinapiItem);
            }
        } finally {
            setIsSavingCustom(false);
        }
    };

    return (
        <>
            <tr
                ref={setNodeRef}
                style={style}
                className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors group ${isExpanded ? 'bg-blue-50/20' : ''} ${isDragging ? 'relative z-50 bg-white shadow-xl' : ''}`}
            >
                <td style={fixa(esquerdaFixa?.drag)} className={`${TD} text-center ${esquerdaFixa ? FUNDO_FIXO : ''}`}>
                    <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-700" title="Arrastar para reordenar">
                        <GripVertical className="w-3.5 h-3.5" />
                    </button>
                </td>

                <td style={fixa(esquerdaFixa?.item)} className={`${TD} text-sm font-normal text-gray-600 whitespace-nowrap ${esquerdaFixa ? FUNDO_FIXO : ''}`}>
                    <div className="flex items-center gap-1.5">
                        {canOpenCPU && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (viewMode === 'modal') {
                                        onOpenModal?.(item);
                                    } else {
                                        void alternarCpuInline();
                                    }
                                }}
                                className="text-gray-500 hover:text-blue-600 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors shrink-0"
                                title={viewMode === 'modal' ? "Ver CPU em Janela" : (isExpanded ? "Recolher CPU" : "Expandir CPU")}
                                aria-label={`${viewMode === 'modal' ? 'Ver composição em janela' : (isExpanded ? 'Recolher composição' : 'Expandir composição')} do item ${codigoDoItem}`}
                                aria-expanded={viewMode === 'inline' ? isExpanded : undefined}
                            >
                                {viewMode === 'modal' ? (
                                    <Maximize2 className="w-3 h-3" />
                                ) : (
                                    isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                                )}
                            </button>
                        )}
                        {codigoDoItem}
                    </div>
                </td>

                {/* Origem — texto colorido simples (§8) */}
                <td style={fixa(esquerdaFixa?.base)} className={`${TD} text-center text-sm font-normal ${item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'text-emerald-700' : 'text-blue-700'} ${esquerdaFixa ? FUNDO_FIXO : ''}`}>
                    {item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'Própria' : 'SINAPI'}
                </td>

                {/* Código — texto atenuado (§7) */}
                <td style={fixa(esquerdaFixa?.codigo)} className={`${TD} text-center text-sm font-normal text-gray-600 ${esquerdaFixa ? FUNDO_FIXO : ''}`}>{item.sinapiItem?.code || '---'}</td>

                <td style={fixa(esquerdaFixa?.descricao, true)} className={`${TD} text-sm text-gray-600 leading-snug ${esquerdaFixa ? FUNDO_FIXO : ''}`}>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => onToggleFavorite?.(e, item.sinapiItem?.code)}
                            className="text-gray-400 hover:text-amber-500 transition-colors p-1 -ml-1 rounded-full hover:bg-amber-50 shrink-0"
                            title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        >
                            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-500 text-amber-500' : 'text-gray-500'}`} />
                        </button>
                        {item.sinapiItem && getTypeBadge(item.sinapiItem.type, canOpenCPU ? handleToggleCPU : undefined)}
                        {/* Até 2 linhas (o texto SINAPI chega a 5): o inteiro fica no title. */}
                        <span className="line-clamp-2" title={item.sinapiItem?.description || undefined}>{item.sinapiItem?.description || 'Descrição não disponível'}</span>
                    </div>
                </td>

                <td className={TD}>
                    <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => onUpdateQuantity(item.id, Number(e.target.value))}
                        aria-label={`Quantidade do item ${codigoDoItem}`}
                        disabled={isLocked}
                        className={`w-full text-center text-sm border rounded-[6px] py-0.5 focus:ring-2 focus:ring-blue-500 outline-none ${isLocked ? 'bg-gray-50 text-gray-900 border-gray-100 cursor-not-allowed' : 'border-gray-200'}`}
                    />
                </td>

                <td className={`${TD} text-center text-sm text-gray-500`}>{item.sinapiItem?.unit || '---'}</td>

                <td className={TD}>
                    <div className={`flex items-center justify-center gap-1 bg-white border rounded-[6px] px-1 transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${item.sinapiItem?.isOverride ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'} ${isLocked ? 'bg-gray-50 border-gray-100' : 'group-hover:border-blue-300'}`}>
                        <span className="text-xs text-gray-500 shrink-0">R$</span>
                        <MoneyCentsInput
                            value={Number(item.sinapiItem?.price || 0).toFixed(2)}
                            onChange={(v) => onUpdatePrice(item.id, v === '' ? 0 : Number(v))}
                            aria-label={`Custo unitário do item ${codigoDoItem}`}
                            disabled={isLocked}
                            className={`w-full text-center text-sm outline-none bg-transparent py-0.5 ${isLocked ? 'cursor-not-allowed' : ''} ${item.sinapiItem?.isOverride ? 'text-amber-700' : 'text-gray-900'}`}
                        />
                        {item.sinapiItem?.isOverride && (
                            <span title="Item editado pelo usuário">
                                <Pencil className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                            </span>
                        )}
                    </div>
                </td>

                <td className={`${TD} text-right text-sm font-medium text-gray-500 whitespace-nowrap`}>
                    R$ {(item.quantity * (item.sinapiItem?.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>

                <td className={TD}>
                    <div className={`flex items-center justify-center gap-1 bg-white border rounded-[6px] px-1 transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${isLocked ? 'bg-gray-50 border-gray-100' : 'border-gray-200 group-hover:border-blue-300'}`}>
                        <input
                            aria-label={`BDI do item ${codigoDoItem} (%); vazio usa o BDI global`}
                            type="number"
                            step="0.1"
                            placeholder={globalBDI.toString()}
                            value={item.bdi ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                onUpdateBDI(item.id, val === '' ? undefined : Number(val));
                            }}
                            disabled={isLocked}
                            className={`w-full text-center text-sm outline-none bg-transparent py-0.5 text-gray-900 placeholder:text-gray-500 ${isLocked ? 'cursor-not-allowed' : ''}`}
                        />
                        <span className="text-xs text-gray-400 shrink-0">%</span>
                    </div>
                </td>

                <td className={`${TD} text-right text-sm font-medium text-blue-600 whitespace-nowrap`}>
                    R$ {((item.sinapiItem?.price || 0) * (1 + (item.bdi ?? globalBDI) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>

                {/* Espaçador (§6.1.1) — casa com o <col /> sem largura do colgroup */}
                <td aria-hidden="true" className="border-r border-gray-100"></td>

                {/* Preço total + ações. Total = valor financeiro (§7, font-medium); ações sempre visíveis (§9). */}
                <td className={TD}>
                    {/* Valor + memória de cálculo + ⋮ numa linha (§9.2): eram 7 botões soltos
                        embaixo do valor, e a lixeira ficava colada em "Salvar na Base Própria". A
                        memória fica à vista: é pendência técnica (âmbar quando falta). */}
                    <div className="flex items-center justify-end gap-1.5">
                        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">R$ {((item.quantity * (item.sinapiItem?.price || 0)) * (1 + (item.bdi ?? globalBDI) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <ActionIconButton
                            kind="annotate"
                            size="sm"
                            tone={hasCalculationMemory ? 'neutral' : 'attention'}
                            icon={<ClipboardList className={`w-3.5 h-3.5 ${hasCalculationMemory ? 'text-emerald-600' : 'text-amber-500'}`} />}
                            title={hasCalculationMemory ? "Editar memória de cálculo" : "Item sem memória de cálculo"}
                            onClick={(e) => { e.stopPropagation(); onOpenDetails?.(item); }}
                        />
                        <InlineDisclosureMenu
                            menuItems={[
                                ...(onMoveItem ? [
                                    { icon: <ArrowUp className="w-[18px] h-[18px]" />, label: 'Mover para cima', onClick: () => onMoveItem(SEM_EVENTO, item.id, 'UP'), disabled: !!isFirst, title: isFirst ? 'Já é o primeiro item da subetapa' : undefined },
                                    { icon: <ArrowDown className="w-[18px] h-[18px]" />, label: 'Mover para baixo', onClick: () => onMoveItem(SEM_EVENTO, item.id, 'DOWN'), disabled: !!isLast, title: isLast ? 'Já é o último item da subetapa' : undefined },
                                ] : []),
                                { icon: <Copy className="w-[18px] h-[18px]" />, label: 'Duplicar item', onClick: () => onDuplicateItem(SEM_EVENTO, item.id) },
                                {
                                    icon: isSavingCustom ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Database className="w-[18px] h-[18px]" />,
                                    // Pelo efeito: o item é COPIADO para a base própria (o orçamento não muda).
                                    label: 'Copiar para a base própria',
                                    onClick: () => { void handleSave(SEM_EVENTO); },
                                    disabled: isSavingCustom || !!isLocked,
                                    title: isLocked ? 'Orçamento fechado: não pode ser alterado' : undefined,
                                },
                            ]}
                            showDelete
                            onDelete={() => onDeleteItem(SEM_EVENTO, item.id)}
                            deleteDisabled={!!isLocked}
                            deleteDisabledTitle={isLocked ? 'Orçamento fechado: não pode ser alterado' : undefined}
                        />
                    </div>
                </td>

                {showNatureBreakdown && natureBreakdown && (
                    <>
                        <td className={`${TD} text-right text-sm text-blue-700 font-medium bg-blue-50/30 whitespace-nowrap`}>{(natureBreakdown.labor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={`${TD} text-right text-sm text-blue-700 font-medium bg-blue-50/30 whitespace-nowrap`}>{(natureBreakdown.material).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={`${TD} text-right text-sm text-blue-700 font-medium bg-blue-50/30 whitespace-nowrap`}>{(natureBreakdown.equipment).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </>
                )}
            </tr>

            {/* Composição (CPU) expandida — linha própria que atravessa a tabela inteira. O bloco
                interno é sticky (§6.13): com a tabela rolada à direita ele continua à vista. */}
            {viewMode === 'inline' && isExpanded && canOpenCPU && (
                <tr>
                    <td colSpan={totalCols} className="bg-gray-50/50 px-4 py-3">
                        <div className="sticky left-6 max-w-5xl">
                            <div className="grid grid-cols-12 gap-2 px-3 mb-1 text-xs font-semibold text-gray-600">
                                <div className="col-span-1 text-center">Código</div>
                                <div className="col-span-5">Insumo / composição</div>
                                <div className="col-span-1 text-center">Unid.</div>
                                <div className="col-span-2 text-center" title="Coeficiente: quanto do insumo entra em 1 unidade do serviço">Coef.</div>
                                <div className="col-span-1 text-center">Preço (R$)</div>
                                <div className="col-span-2 text-right">Parcial por {item.sinapiItem?.unit || 'un'}</div>
                            </div>
                            <div className="space-y-1">
                                {composicaoNaTela.map((comp, idx) => {
                                    const preco = precoDoComp(comp);
                                    const parcial = (comp.quantity || 0) * preco;
                                    return (
                                        <div key={`${item.id}-comp-${idx}`} className="grid grid-cols-12 gap-2 items-center text-sm text-gray-700 hover:bg-gray-100 py-2 px-3 rounded-[6px]">
                                            <div className="col-span-1 text-center text-gray-600">{comp.code}</div>
                                            <div className="col-span-5 flex items-center gap-2 min-w-0">
                                                <span className={`shrink-0 ${comp.type === SinapiType.COMPOSITION ? 'text-blue-700' : 'text-amber-700'}`}>
                                                    {comp.type === SinapiType.COMPOSITION ? 'Composição' : 'Insumo'}
                                                </span>
                                                <span className="leading-snug truncate" title={comp.description || ''}>{comp.description || 'Pendente de carga...'}</span>
                                            </div>
                                            <div className="col-span-1 text-center text-gray-600">{comp.unit || '-'}</div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    value={comp.quantity || 0}
                                                    onChange={(e) => alterarComp(idx, { quantity: Number(e.target.value) })}
                                                    disabled={isLocked}
                                                    aria-label={`Coeficiente de ${comp.description || comp.code}`}
                                                    className="w-full text-center outline-none bg-white border border-gray-200 rounded-[6px] py-0.5 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <div className="flex items-center justify-center gap-0.5 bg-white border border-gray-200 rounded-[6px] px-1 focus-within:ring-2 focus-within:ring-blue-500">
                                                    <MoneyCentsInput
                                                        value={preco}
                                                        onChange={(v) => alterarComp(idx, { price: v === '' ? 0 : Number(v) })}
                                                        disabled={isLocked}
                                                        aria-label={`Preço de ${comp.description || comp.code}`}
                                                        className="w-full text-center outline-none bg-transparent py-0.5 text-sm disabled:cursor-not-allowed"
                                                    />
                                                </div>
                                            </div>
                                            <div className="col-span-2 text-right font-medium text-gray-900">
                                                R$ {parcial.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-sm">
                                <div className="text-gray-700">
                                    Preço unitário <strong className="text-gray-900">R$ {precoUnitarioRascunho.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{item.sinapiItem?.unit || 'un'}</strong>
                                    {' '}× {item.quantity.toLocaleString('pt-BR')} {item.sinapiItem?.unit || 'un'} = <strong className="text-gray-900">R$ {(precoUnitarioRascunho * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> no item
                                    {compRascunho && <span className="ml-2 text-amber-700 font-medium">· Alterações ainda não salvas no orçamento</span>}
                                    {isLocked && <span className="ml-2 text-gray-600">· Orçamento fechado: só consulta</span>}
                                </div>
                                {compRascunho && (
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => { void descartarRascunho(); }} className="px-3 py-1.5 rounded-[6px] text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
                                        <button
                                            type="button"
                                            onClick={() => { onSaveComposition(item.id, compRascunho); setCompRascunho(null); }}
                                            className="px-4 py-1.5 rounded-[6px] text-sm font-bold bg-blue-600 text-white hover:bg-blue-700"
                                        >
                                            Salvar no orçamento
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};
