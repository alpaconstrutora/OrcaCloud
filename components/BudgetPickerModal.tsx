import React from 'react';
import {
    Search,
    X,
    Loader2,
    ChevronRight,
    Target,
    Hash,
    Layers
} from 'lucide-react';
import { BudgetEntry, SinapiType } from '../types';
import MaterialSelectionModal from './MaterialSelectionModal';

interface BudgetPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: BudgetEntry) => void;
    budget: BudgetEntry[];
}

const BudgetPickerModal: React.FC<BudgetPickerModalProps> = ({ isOpen, onClose, onSelect, budget }) => {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedComposition, setSelectedComposition] = React.useState<BudgetEntry | null>(null);
    const [isMaterialModalOpen, setIsMaterialModalOpen] = React.useState(false);

    if (!isOpen) return null;

    // Filter budget items based on search term
    // Only show items that have a description and are not purely structural (optional, usually items with cost/unit are preferred)
    const filteredBudget = budget.filter(item => {
        const term = searchTerm.toLowerCase();

        // Resilient searching across different possible structures
        const description = (
            item.sinapiItem?.description ||
            (item as any).description ||
            'Sem descrição'
        ).toLowerCase();

        const code = (
            item.sinapiItem?.code ||
            (item as any).wbs ||
            (item as any).code ||
            ''
        ).toLowerCase();

        return description.includes(term) || code.includes(term);
    });

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl h-full max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-50 bg-gray-50/30">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Importar do Orçamento</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Selecione um item da EAP (WBS) para vincular ao contrato</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all border border-transparent hover:border-gray-100 group">
                        <X className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                    </button>
                </div>

                {/* Search Provider */}
                <div className="p-6 border-b border-gray-50 bg-white">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Buscar por descrição ou código WBS..."
                            className="w-full pl-11 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {filteredBudget.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                <Search className="w-8 h-8 text-gray-200" />
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-tight">
                                Nenhum item encontrado no orçamento<br />com o termo selecionado.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredBudget.map((item, idx) => (
                                <button
                                    key={item.id || idx}
                                    onClick={() => {
                                        if (item.sinapiItem?.type === SinapiType.COMPOSITION) {
                                            setSelectedComposition(item);
                                            setIsMaterialModalOpen(true);
                                        } else {
                                            onSelect(item);
                                        }
                                    }}
                                    className="w-full bg-white p-5 rounded-[24px] border border-gray-100 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/5 cursor-pointer transition-all group flex items-center justify-between text-left"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all border border-gray-100">
                                            <Hash className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                                                    {item.sinapiItem?.code || (item as any).wbs || (item as any).code || 'S/N'}
                                                </span>
                                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                    {item.sinapiItem?.unit || (item as any).unit || 'UNID'}
                                                </span>
                                            </div>
                                            <p className="text-sm font-black text-gray-900 uppercase tracking-tight truncate leading-tight">
                                                {item.sinapiItem?.description || (item as any).description || 'Item sem descrição'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 ml-4">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Valor Unit.</p>
                                            <p className="text-sm font-black text-gray-900 tracking-tighter">
                                                R$ {Number(item.sinapiItem?.price || (item as any).unitCost || (item as any).price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        {item.sinapiItem?.type === SinapiType.COMPOSITION ? (
                                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all border border-blue-100 shadow-sm animate-pulse" title="Ver Composição">
                                                <Layers className="w-5 h-5" />
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-300 group-hover:text-blue-600 group-hover:bg-blue-50 transition-all border border-gray-100">
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {selectedComposition && (
                    <MaterialSelectionModal 
                        isOpen={isMaterialModalOpen}
                        onClose={() => {
                            setIsMaterialModalOpen(false);
                            setSelectedComposition(null);
                        }}
                        item={selectedComposition.sinapiItem!}
                        budgetQuantity={selectedComposition.quantity}
                        onSelect={(selected) => {
                            // Para contratos, adicionamos cada insumo individualmente
                            selected.forEach(insumo => {
                                onSelect({
                                    id: insumo.code,
                                    sinapiItem: {
                                        code: insumo.code,
                                        description: insumo.description,
                                        unit: insumo.unit,
                                        price: insumo.price || 0,
                                        type: insumo.type,
                                        category: insumo.category ?? '',
                                        source: 'Própria',
                                        isOverride: true,
                                    },
                                    quantity: insumo.selectedQuantity,
                                    phase: '',
                                    group: '',
                                });
                            });
                            setIsMaterialModalOpen(false);
                            setSelectedComposition(null);
                            onClose(); // Fecha o picker principal
                        }}
                    />
                )}

                {/* Footer Info */}
                <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{filteredBudget.length} Itens Disponíveis</span>
                    <div className="flex items-center gap-2 text-blue-600">
                        <Target className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Selecione para vincular</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BudgetPickerModal;
