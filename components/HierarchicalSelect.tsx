import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { getCodeLevelStyle, sortByCode } from '../utils/codeHierarchy';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

export interface HierarchicalSelectItem {
    id: string;
    code?: string | null;
    name: string;
}

interface Props {
    items: HierarchicalSelectItem[];
    value: string;
    onChange: (value: string) => void;
    valueField?: 'id' | 'code' | 'name';
    placeholder?: string;
    hoverCls?: string;
    /** 'dropdown' (padrão) abre o painel pequeno ancorado no campo. 'drawer'
     *  abre um painel lateral (Sheet) com a lista inteira — para catálogos
     *  longos (ex: Plano de Contas) onde o dropdown de max-h-56 atrapalha a
     *  busca. Só seleciona; não cria/edita/exclui itens. */
    panelVariant?: 'dropdown' | 'drawer';
    /** Título do drawer quando panelVariant='drawer'. Usa `placeholder` se omitido. */
    drawerTitle?: string;
}

const HierarchicalSelect: React.FC<Props> = ({
    items,
    value,
    onChange,
    valueField = 'id',
    placeholder = 'Selecione...',
    hoverCls = 'hover:bg-gray-50',
    panelVariant = 'dropdown',
    drawerTitle,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getItemValue = (item: HierarchicalSelectItem): string => {
        if (valueField === 'code') return item.code ?? '';
        if (valueField === 'name') return item.name;
        return item.id;
    };

    const selected = items.find(item => getItemValue(item) === value);

    const filtered = sortByCode(items).filter(item => {
        if (!search) return true;
        const q = search.toLowerCase();
        return item.code?.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });

    const closeAndClear = () => { setOpen(false); setSearch(''); };

    // Lista filtrada — igual nos dois modos (dropdown/drawer), só muda o
    // container em volta (painel pequeno ancorado × Sheet lateral).
    const listBody = filtered.length === 0 ? (
        <div className="px-4 py-3 text-xs font-medium text-slate-400 text-center">Nenhum resultado</div>
    ) : (
        <>
            <button
                type="button"
                onMouseDown={() => { onChange(''); closeAndClear(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-form-input font-medium text-slate-400 transition-colors ${hoverCls}`}
            >
                {placeholder}
            </button>
            {filtered.map(item => {
                const lvl = getCodeLevelStyle(item.code, 'slate');
                const itemValue = getItemValue(item);
                const isSelected = value === itemValue;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => { onChange(itemValue); closeAndClear(); }}
                        className={`w-full flex items-center gap-2.5 py-2 pr-3 text-left transition-colors group ${hoverCls} ${isSelected ? 'bg-slate-50' : ''}`}
                        style={{ paddingLeft: 12 + lvl.indent }}
                    >
                        {item.code && (
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono w-[90px] truncate text-xs font-black ${lvl.codeCls}`}>
                                {item.code}
                            </span>
                        )}
                        <span className={`${lvl.nameCls} truncate group-hover:text-slate-900`}>{item.name}</span>
                    </button>
                );
            })}
        </>
    );

    const triggerButton = (
        <button
            type="button"
            onClick={() => { setOpen(o => !o); setSearch(''); }}
            className="w-full flex items-center justify-between gap-2 bg-gray-50/50 border border-gray-100 rounded-2xl pl-4 pr-3 py-4 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        >
            {selected ? (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                    {selected.code && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-black ${getCodeLevelStyle(selected.code, 'slate').codeCls}`}>
                            {selected.code}
                        </span>
                    )}
                    <span className="text-sm font-bold text-gray-900 truncate">{selected.name}</span>
                </span>
            ) : (
                <span className="text-sm text-gray-400 truncate">{placeholder}</span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
    );

    if (panelVariant === 'drawer') {
        return (
            <div ref={wrapperRef}>
                {triggerButton}
                <Sheet open={open} onClose={closeAndClear} side="right" size="sm">
                    <SheetHeader onClose={closeAndClear}>
                        <SheetTitle>{drawerTitle || placeholder}</SheetTitle>
                        <SheetDescription>Busque pelo código ou nome para selecionar.</SheetDescription>
                    </SheetHeader>
                    <div className="p-4 border-b border-gray-100 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                autoFocus
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por código ou nome..."
                                className="w-full h-9 pl-9 pr-3 text-form-input rounded-[6px] bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 font-medium text-slate-700"
                            />
                        </div>
                    </div>
                    <SheetPanel>{listBody}</SheetPanel>
                </Sheet>
            </div>
        );
    }

    return (
        <div ref={wrapperRef} className="relative">
            {triggerButton}

            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    <div className="sticky top-0 bg-white border-b border-slate-100 p-2">
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full text-form-input px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 font-medium text-slate-700"
                        />
                    </div>
                    {listBody}
                </div>
            )}
        </div>
    );
};

export default HierarchicalSelect;
