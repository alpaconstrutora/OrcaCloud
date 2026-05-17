import React, { useState, useEffect } from 'react';
import {
    X,
    Layers,
    Package,
    Plus,
    CheckCircle2,
    Search,
    AlertCircle
} from 'lucide-react';
import { SinapiItem, CompositionComponent, SinapiType } from '../types';

interface MaterialSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: SinapiItem;
    budgetQuantity: number;
    onSelect: (selectedInsumos: (CompositionComponent & { selectedQuantity: number })[]) => void;
    customPrices?: Map<string, number>;
}

const MaterialSelectionModal: React.FC<MaterialSelectionModalProps> = ({
    isOpen,
    onClose,
    item,
    budgetQuantity,
    onSelect,
    customPrices
}) => {
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
    const [customQuantities, setCustomQuantities] = useState<Map<string, number>>(new Map());
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && item.composition) {
            // Pre-fill quantities and select all by default? 
            // Better to let user select, but pre-calculate suggested quantities
            const initialQuantities = new Map<string, number>();
            item.composition.forEach(comp => {
                initialQuantities.set(comp.code, (comp.quantity || 0) * budgetQuantity);
            });
            setCustomQuantities(initialQuantities);
            
            // Auto-select materials by default? The user said "select specific items"
            // Let's start with nothing selected to be safe, or select all materials.
            // Selecting all materials seems more helpful.
            const initialSelected = new Set<string>();
            item.composition.forEach(comp => {
                if (comp.type === SinapiType.INPUT) {
                    initialSelected.add(comp.code);
                }
            });
            setSelectedCodes(initialSelected);
        }
    }, [isOpen, item, budgetQuantity]);

    if (!isOpen) return null;

    const toggleInsumo = (code: string) => {
        const newSelected = new Set(selectedCodes);
        if (newSelected.has(code)) {
            newSelected.delete(code);
        } else {
            newSelected.add(code);
        }
        setSelectedCodes(newSelected);
    };

    const updateQuantity = (code: string, qty: number) => {
        const newQuantities = new Map(customQuantities);
        newQuantities.set(code, Math.max(0, qty));
        setCustomQuantities(newQuantities);
    };

    const handleConfirm = () => {
        const selected = (item.composition || [])
            .filter(comp => selectedCodes.has(comp.code))
            .map(comp => ({
                ...comp,
                selectedQuantity: customQuantities.get(comp.code) || 0
            }));
        
        onSelect(selected);
        onClose();
    };

    const filteredComposition = (item.composition || []).filter(comp => 
        comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl h-full max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-100">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
                                <Layers className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Seleção de Insumos da Composição</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Selecione os materiais e ajuste as quantidades para o pedido</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all border border-transparent hover:border-gray-100 group">
                            <X className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                        </button>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Serviço/Item Orçado</span>
                                <p className="text-sm font-black text-gray-900 uppercase leading-tight truncate">{item.description}</p>
                            </div>
                            <div className="w-px h-8 bg-gray-100" />
                            <div className="text-right">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Quantidade Orçada</span>
                                <p className="text-sm font-black text-gray-900">{budgetQuantity} {item.unit}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-8 py-4 border-b border-gray-50 bg-white">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar insumo por descrição ou código..."
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Content Table */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    <table className="w-full text-left">
                        <thead className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">
                            <tr>
                                <th className="pb-4 w-10 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={selectedCodes.size === filteredComposition.length && filteredComposition.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedCodes(new Set(filteredComposition.map(c => c.code)));
                                            } else {
                                                setSelectedCodes(new Set());
                                            }
                                        }}
                                    />
                                </th>
                                <th className="pb-4 px-4 text-center">Código</th>
                                <th className="pb-4 px-4">Descrição do Insumo</th>
                                <th className="pb-4 px-4 text-center">Unid.</th>
                                <th className="pb-4 px-4 text-right">Coeficiente</th>
                                <th className="pb-4 px-4 text-right text-emerald-600">Preço Unit.</th>
                                <th className="pb-4 px-4 text-right text-indigo-600">Qtd. Necessária</th>
                                <th className="pb-4 px-4 text-right text-indigo-600 w-32">Qtd. p/ Pedido</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredComposition.map((comp, idx) => (
                                <tr 
                                    key={`${comp.code}-${idx}`}
                                    className={`group hover:bg-blue-50/30 transition-colors ${selectedCodes.has(comp.code) ? 'bg-blue-50/20' : ''}`}
                                >
                                    <td className="py-4 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedCodes.has(comp.code)}
                                            onChange={() => toggleInsumo(comp.code)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className="py-4 px-4 text-center font-mono text-[11px] text-gray-400 font-bold">{comp.code}</td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 uppercase leading-tight">{comp.description}</span>
                                            <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${comp.type === SinapiType.COMPOSITION ? 'text-blue-500' : 'text-amber-500'}`}>
                                                {comp.type === SinapiType.COMPOSITION ? 'Composição Auxiliar' : 'Insumo'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center text-[11px] font-black text-gray-400 uppercase">{comp.unit}</td>
                                    <td className="py-4 px-4 text-right font-bold text-gray-600">{comp.quantity?.toFixed(4)}</td>
                                    <td className="py-4 px-4 text-right font-black text-emerald-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customPrices?.get(comp.code) ?? comp.price ?? 0)}
                                    </td>
                                    <td className="py-4 px-4 text-right font-black text-gray-900 bg-gray-50/50">
                                        {((comp.quantity || 0) * budgetQuantity).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {selectedCodes.has(comp.code) ? (
                                            <input 
                                                type="number"
                                                step="any"
                                                min={0}
                                                className="w-full text-right bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                                                value={customQuantities.get(comp.code) || 0}
                                                onChange={(e) => updateQuantity(comp.code, parseFloat(e.target.value) || 0)}
                                            />
                                        ) : (
                                            <span className="text-gray-200 font-bold">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredComposition.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Search className="w-8 h-8 text-gray-200" />
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nenhum insumo encontrado</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Insumos Selecionados</span>
                            <span className="text-lg font-black text-gray-900">{selectedCodes.size} de {item.composition?.length || 0}</span>
                        </div>
                        {selectedCodes.size > 0 && (
                            <div className="flex items-center gap-2 bg-blue-600/10 text-blue-600 px-4 py-2 rounded-2xl border border-blue-100">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest italic">Revise as quantidades antes de confirmar</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onClose}
                            className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirm}
                            disabled={selectedCodes.size === 0}
                            className={`px-10 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 shadow-xl transition-all active:scale-95 ${
                                selectedCodes.size === 0 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-900/10'
                            }`}
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Adicionar ao Pedido
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MaterialSelectionModal;
