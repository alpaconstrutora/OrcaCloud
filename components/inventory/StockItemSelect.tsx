// components/inventory/StockItemSelect.tsx — combobox de busca no catálogo do Almoxarifado
//
// Substitui os três <input> de texto livre (Entrada/Saída/Ajuste, Requisição,
// Transferência) por um seletor do catálogo (stock_items) — é o item deste
// plano que corrige o cadastro de item de verdade: escolher do catálogo em
// vez de digitar, e poder cadastrar um item novo sem sair do formulário.
// Ver docs/planos/2026-08-21-almoxarifado-cadastro-de-itens.md.
import React from 'react';
import { Search, Plus, Package } from 'lucide-react';
import type { StockItem } from '../../types/inventory';

export interface StockItemSelectValue {
    inputCode?: string;
    inputDescription: string;
    inputUnit: string;
}

interface Props {
    items: StockItem[];
    value: StockItemSelectValue | null;
    onChange: (value: StockItemSelectValue) => void;
    onCreateNew: () => void;
    /** Ex: saldo disponível no almoxarifado escolhido — mostrado ao lado do item. */
    balanceHint?: (item: StockItem) => string | undefined;
    placeholder?: string;
    className?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const StockItemSelect: React.FC<Props> = ({ items, value, onChange, onCreateNew, balanceHint, placeholder, className = '' }) => {
    const [query, setQuery] = React.useState(value?.inputDescription ?? '');
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        setQuery(value?.inputDescription ?? '');
    }, [value?.inputDescription]);

    const results = React.useMemo(() => {
        const q = norm(query.trim());
        const pool = q.length === 0 ? items : items.filter(i =>
            norm(i.inputDescription).includes(q) || norm(i.inputCode).includes(q)
        );
        return pool.slice(0, 50);
    }, [items, query]);

    const handleSelect = (item: StockItem) => {
        onChange({ inputCode: item.inputCode, inputDescription: item.inputDescription, inputUnit: item.inputUnit });
        setQuery(item.inputDescription);
        setOpen(false);
    };

    return (
        <div className={`relative ${className}`}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder={placeholder ?? 'Buscar item do catálogo...'}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
            </div>

            {open && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-[6px] shadow-lg max-h-64 overflow-y-auto">
                    {results.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-400">
                            {items.length === 0 ? 'Nenhum item cadastrado ainda.' : 'Nenhum item encontrado.'}
                        </div>
                    )}
                    {results.map(item => (
                        <button
                            type="button"
                            key={item.id}
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                <Package className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="font-normal text-gray-800 truncate">{item.inputDescription}</span>
                                <span className="text-gray-400 shrink-0">{item.inputCode} · {item.inputUnit}</span>
                            </span>
                            {balanceHint?.(item) && (
                                <span className="text-xs text-gray-500 shrink-0">{balanceHint(item)}</span>
                            )}
                        </button>
                    ))}
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); onCreateNew(); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100"
                    >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        Cadastrar item novo
                    </button>
                </div>
            )}
        </div>
    );
};

export default StockItemSelect;
