import React from 'react';
import { Layers, Box, Loader2, ChevronDown, ChevronRight, Maximize2, Star, Copy, Database, Trash2, Pencil, ArrowUp, ArrowDown } from 'lucide-react';
import { BudgetEntry, SinapiItem, SinapiType, CompositionComponent } from '../types';

interface BudgetRowProps {
    item: BudgetEntry;
    itemIndex: number;
    subIdDisplay: string;
    onUpdateQuantity: (id: string, qtd: number) => void;
    onUpdatePrice: (id: string, price: number) => void;
    onUpdateBDI: (id: string, bdi: number | undefined) => void;
    onUpdateComposition: (itemId: string, compIndex: number, updates: Partial<CompositionComponent>) => void;
    onSaveToCustomDB: (item: SinapiItem) => void;
    onDeleteItem: (e: React.MouseEvent, id: string) => void;
    onMoveItem?: (e: React.MouseEvent, id: string, direction: 'UP' | 'DOWN') => void;
    isFirst?: boolean;
    isLast?: boolean;
    globalBDI: number;
    viewMode?: 'inline' | 'modal';
    onOpenModal?: (item: BudgetEntry) => void;
    onDuplicateItem: (e: React.MouseEvent, id: string) => void;
    isFavorite?: boolean;
    onToggleFavorite?: (e: React.MouseEvent, code: string) => void;
    showNatureBreakdown?: boolean;
    natureBreakdown?: { material: number; labor: number; equipment: number; other: number };
    auxiliaryItems?: Map<string, SinapiItem>;
    isLocked?: boolean;
}

const getTypeBadge = (type: SinapiType, onClick?: (e: React.MouseEvent) => void) => {
    if (type === SinapiType.COMPOSITION) {
        return (
            <button
                onClick={onClick}
                type="button"
                className={`flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-blue-200 transition-all ${onClick ? 'hover:bg-blue-200 hover:border-blue-300 active:scale-95 cursor-pointer' : ''}`}
                title={onClick ? "Ver detalhes da composição" : undefined}
            >
                <Layers className="w-3 h-3" />
                COMPOSIÇÃO
            </button>
        );
    }
    if (type === SinapiType.SERVICE) {
        return (
            <span className="flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-purple-200">
                <Loader2 className="w-3 h-3" />
                SERVIÇO
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-amber-200">
            <Box className="w-3 h-3" />
            INSUMO
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
    onUpdateComposition,
    onSaveToCustomDB,
    onDeleteItem,
    onMoveItem,
    isFirst,
    isLast,
    globalBDI,
    viewMode = 'modal',
    onOpenModal,
    onDuplicateItem,
    isFavorite,
    onToggleFavorite,
    showNatureBreakdown,
    natureBreakdown,
    auxiliaryItems,
    isLocked
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isSavingCustom, setIsSavingCustom] = React.useState(false);
    const hasComposition = item.sinapiItem?.composition && item.sinapiItem.composition.length > 0;
    const canOpenCPU = item.sinapiItem?.type === SinapiType.COMPOSITION || hasComposition;

    const handleToggleCPU = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'modal') {
            onOpenModal?.(item);
        } else if (canOpenCPU) {
            setIsExpanded(!isExpanded);
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
        <div className="border-t border-gray-50 hover:bg-blue-50/20 group">
            <div className={`group relative grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 px-4 py-2 hover:bg-gray-50/80 transition-all items-center border-b border-gray-100 ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                <div className="text-[10px] font-mono font-black text-gray-400 flex items-center gap-1.5">
                    {canOpenCPU && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (viewMode === 'modal') {
                                    onOpenModal?.(item);
                                } else {
                                    setIsExpanded(!isExpanded);
                                }
                            }}
                            className="text-gray-500 hover:text-blue-600 focus:outline-none transition-colors"
                            title={viewMode === 'modal' ? "Ver CPU em Janela" : (isExpanded ? "Recolher CPU" : "Expandir CPU")}
                        >
                            {viewMode === 'modal' ? (
                                <Maximize2 className="w-3 h-3" />
                            ) : (
                                isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                            )}
                        </button>
                    )}
                    {subIdDisplay}{(itemIndex + 1).toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-center flex justify-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'PRÓPRIA' : 'SINAPI'}
                    </span>
                </div>
                <div className="text-xs font-mono text-gray-600 bg-gray-50 px-1 py-0.5 rounded border border-gray-100 text-center">{item.sinapiItem?.code || '---'}</div>
                <div className="text-sm text-gray-600 leading-tight">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => onToggleFavorite?.(e, item.sinapiItem?.code)}
                                className="text-gray-400 hover:text-amber-500 transition-colors p-1 -ml-1 rounded-full hover:bg-amber-50"
                                title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            >
                                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                            </button>
                            {item.sinapiItem && getTypeBadge(item.sinapiItem.type, canOpenCPU ? handleToggleCPU : undefined)}
                            <span>{item.sinapiItem?.description || 'Descrição não disponível'}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => onUpdateQuantity(item.id, Number(e.target.value))}
                        disabled={isLocked}
                        className={`w-full text-center text-sm border rounded py-0.5 focus:ring-1 focus:ring-blue-500 ${isLocked ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed' : 'border-gray-200'}`}
                    />
                </div>
                <div className="text-center text-xs text-gray-500">{item.sinapiItem?.unit || '---'}</div>

                <div className="text-center text-[13px] text-gray-600">
                    <div className={`flex items-center justify-center gap-1 bg-white border rounded px-1 transition-colors ${item.sinapiItem?.isOverride ? 'border-amber-200 bg-amber-50/30' : ''} ${isLocked ? 'bg-gray-50 border-gray-100' : 'group-hover:border-blue-300'}`}>
                        <span className="text-[10px] text-gray-400">R$</span>
                        <input
                            type="number"
                            step="0.01"
                            value={Number(item.sinapiItem?.price || 0).toFixed(2)}
                            onChange={(e) => onUpdatePrice(item.id, Number(e.target.value))}
                            disabled={isLocked}
                            className={`w-full text-center outline-none bg-transparent py-0.5 ${isLocked ? 'text-gray-400 cursor-not-allowed' : ''} ${item.sinapiItem?.isOverride ? 'text-amber-700 font-semibold' : ''}`}
                        />
                        {item.sinapiItem?.isOverride && (
                            <span title="Item editado pelo usuário">
                                <Pencil className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-center text-[12px] font-medium text-gray-500 italic">
                    R$ {(item.quantity * (item.sinapiItem?.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>

                <div className="text-center text-[13px] text-gray-600">
                    <div className={`flex items-center justify-center gap-1 bg-white border rounded px-1 transition-colors ${isLocked ? 'bg-gray-50 border-gray-100' : 'group-hover:border-blue-300'}`}>
                        <input
                            type="number"
                            step="0.1"
                            placeholder={globalBDI.toString()}
                            value={item.bdi ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                onUpdateBDI(item.id, val === '' ? undefined : Number(val));
                            }}
                            disabled={isLocked}
                            className={`w-full text-center outline-none bg-transparent py-0.5 placeholder:text-gray-300 ${isLocked ? 'text-gray-400 cursor-not-allowed' : ''}`}
                        />
                        <span className="text-[10px] text-gray-400 font-bold">%</span>
                    </div>
                </div>

                <div className="text-center text-[12px] font-bold text-blue-600">
                    R$ {((item.sinapiItem?.price || 0) * (1 + (item.bdi ?? globalBDI) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>

                <div className="flex justify-end items-center relative group/total">
                    <span className="text-sm font-black text-gray-900">R$ {((item.quantity * (item.sinapiItem?.price || 0)) * (1 + (item.bdi ?? globalBDI) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <div className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/95 shadow-sm rounded border border-gray-100 px-1 z-10">
                        {onMoveItem && (
                            <div className="flex flex-col border-r border-gray-100 pr-1 mr-0.5">
                                {!isFirst && (
                                    <button
                                        type="button"
                                        onClick={(e) => onMoveItem(e, item.id, 'UP')}
                                        className="text-gray-400 hover:text-blue-600 p-0.5 hover:bg-blue-50 rounded transition-all"
                                        title="Mover para Cima"
                                    >
                                        <ArrowUp className="w-3 h-3" />
                                    </button>
                                )}
                                {!isLast && (
                                    <button
                                        type="button"
                                        onClick={(e) => onMoveItem(e, item.id, 'DOWN')}
                                        className="text-gray-400 hover:text-blue-600 p-0.5 hover:bg-blue-50 rounded transition-all"
                                        title="Mover para Baixo"
                                    >
                                        <ArrowDown className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={(e) => onDuplicateItem(e, item.id)}
                            className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-all"
                            title="Duplicar Item"
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSavingCustom || isLocked}
                            className={`p-1 rounded transition-all ${isSavingCustom || isLocked ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                            title="Salvar na Base Própria"
                        >
                            {isSavingCustom ? <Loader2 className="w-3 h-4 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => onDeleteItem(e, item.id)}
                            disabled={isLocked}
                            className={`p-1 rounded transition-all ${isLocked ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                            title="Excluir item"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {showNatureBreakdown && natureBreakdown && (
                    <>
                        <div className="text-right text-[11px] text-blue-700 font-mono italic bg-blue-50/30 rounded px-1 border-y border-r border-l-2 border-blue-100/60 font-bold ml-2 shadow-sm">{(natureBreakdown.labor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-right text-[11px] text-blue-700 font-mono italic bg-blue-50/30 rounded px-1 border border-blue-100/60 font-bold shadow-sm">{(natureBreakdown.material).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-right text-[11px] text-blue-700 font-mono italic bg-blue-50/30 rounded px-1 border border-blue-100/60 font-bold shadow-sm">{(natureBreakdown.equipment).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </>
                )}
            </div>

            {/* Render Composition Children (Ingredients) */}
            {viewMode === 'inline' && isExpanded && canOpenCPU && (
                <div className="bg-gray-50/50 border-t border-gray-100 pr-4 py-2">
                    {/* CPU Sub-header for Alignment */}
                    <div className="grid grid-cols-12 gap-2 px-4 mb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        <div className="col-span-1 flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" />
                            CPU
                        </div>
                        <div className="col-span-1 text-center">Código</div>
                        <div className="col-span-4">Descrição dos Insumos/Serviços</div>
                        <div className="col-span-1 text-center">Qtd</div>
                        <div className="col-span-1 text-center">Unid.</div>
                        <div className="col-span-1 text-center">Unitário</div>
                        <div className="col-span-1 text-center"></div>
                        <div className="col-span-2 text-right">Subtotal</div>
                    </div>

                    <div className="space-y-1">
                        {item.sinapiItem?.composition?.map((comp, idx) => {
                            const auxItem = auxiliaryItems?.get(comp.code);
                            const displayPrice = comp.price || auxItem?.price || 0;
                            const displaySubtotal = item.quantity * (comp.quantity || 0) * displayPrice;

                            return (
                                <div key={`${item.id}-comp-${idx}`} className="grid grid-cols-12 gap-2 items-center text-xs text-gray-600 hover:bg-gray-100 py-1.5 px-4 rounded">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-1 text-center font-mono text-[10px] text-gray-500 text-center">{comp.code}</div>
                                    <div className="col-span-4 flex items-center gap-2">
                                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${comp.type === SinapiType.COMPOSITION ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                            {comp.type === SinapiType.COMPOSITION ? 'COMP' : 'INS'}
                                        </span>
                                        <span className="leading-tight text-[11px]" title={comp.description || ''}>{comp.description || 'Pendente de carga...'}</span>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <input
                                            type="number"
                                            step="0.0001"
                                            value={comp.quantity || 0}
                                            onChange={(e) => onUpdateComposition(item.id, idx, { quantity: Number(e.target.value) })}
                                            className="w-full text-center outline-none bg-white border border-gray-200 rounded py-0.5 text-[11px] focus:ring-1 focus:ring-blue-400"
                                        />
                                    </div>
                                    <div className="col-span-1 text-center text-gray-400 text-[11px]">{comp.unit || '-'}</div>
                                    <div className="col-span-1 text-center">
                                        <div className="flex items-center justify-center gap-0.5 bg-white border border-gray-200 rounded px-1 focus-within:ring-1 focus-within:ring-blue-400">
                                            <span className="text-[9px] text-gray-400">R$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={displayPrice}
                                                onChange={(e) => onUpdateComposition(item.id, idx, { price: Number(e.target.value) })}
                                                className="w-full text-center outline-none bg-transparent py-0.5 text-[11px]"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-1"></div>
                                    <div className="col-span-2 text-right font-medium text-gray-800 text-[11px]">
                                        R$ {displaySubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 text-right text-xs text-gray-400 border-t border-gray-200 pt-1">
                        * Valores calculados com base na quantidade do item pai ({item.quantity} {item.sinapiItem?.unit || 'un'})
                    </div>
                </div>
            )}
        </div>
    );
};
