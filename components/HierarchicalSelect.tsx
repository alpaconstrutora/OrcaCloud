import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { getCodeLevel, getLevelStyle, sortByCode } from '../utils/codeHierarchy';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

export interface HierarchicalSelectItem {
    id: string;
    code?: string | null;
    name: string;
    /** Hierarquia EXPLÍCITA (grupo → filho), para catálogos cujo código é chato
     *  ("010") e não carrega o nível como o plano de contas ("1.2.3"). Quando
     *  algum item traz `parentId`, a lista sai agrupada: cada grupo seguido dos
     *  seus filhos, recuados; a busca que acha um filho mantém o grupo dele
     *  visível, e buscar pelo nome do grupo traz os filhos. Sem `parentId`,
     *  comportamento antigo (nível pelos pontos do código). */
    parentId?: string | null;
    parentName?: string | null;
}

// Ordem de exibição: grupos por código, cada um seguido dos filhos por código.
// Filho cujo grupo não está na lista vai para o fim, sem recuo.
function ordenarPorGrupo(items: HierarchicalSelectItem[]): { item: HierarchicalSelectItem; level: number }[] {
    const ids = new Set(items.map(i => i.id));
    const grupos = sortByCode(items.filter(i => !i.parentId));
    const filhosDe = new Map<string, HierarchicalSelectItem[]>();
    const orfaos: HierarchicalSelectItem[] = [];
    for (const i of items) {
        if (!i.parentId) continue;
        if (!ids.has(i.parentId)) { orfaos.push(i); continue; }
        const lista = filhosDe.get(i.parentId) ?? [];
        lista.push(i);
        filhosDe.set(i.parentId, lista);
    }
    const saida: { item: HierarchicalSelectItem; level: number }[] = [];
    for (const g of grupos) {
        saida.push({ item: g, level: 1 });
        for (const f of sortByCode(filhosDe.get(g.id) ?? [])) saida.push({ item: f, level: 2 });
    }
    for (const o of sortByCode(orfaos)) saida.push({ item: o, level: 1 });
    return saida;
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
    /** Subtítulo e placeholder da busca no drawer. Os defaults falam em "código"
     *  (plano de contas / centro de custo); catálogos sem código (fornecedor)
     *  passam o próprio texto. */
    drawerDescription?: string;
    searchPlaceholder?: string;
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
    drawerDescription = 'Busque pelo código ou nome para selecionar.',
    searchPlaceholder = 'Buscar por código ou nome...',
}) => {
    const [open, setOpen] = useState(false);
    // Busca transitória de propósito (exceção ao §3 do guia, que é para filtro
    // de TELA): limpa ao fechar; se persistisse, o seletor reabriria filtrado
    // e esconderia itens sem o usuário ver por quê.
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

    const q = search.toLowerCase();
    const casa = (item: HierarchicalSelectItem) =>
        !q || !!item.code?.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);

    const hierarquiaExplicita = items.some(i => i.parentId);
    let filtered: { item: HierarchicalSelectItem; level: number }[];
    if (hierarquiaExplicita) {
        const ordenados = ordenarPorGrupo(items);
        // Filho entra se ele OU o grupo dele casa; grupo entra se ele OU algum
        // filho casa — assim o resultado da busca nunca perde a estrutura.
        const porId = new Map(items.map(i => [i.id, i]));
        const grupoCasa = (item: HierarchicalSelectItem) => {
            const g = item.parentId ? porId.get(item.parentId) : undefined;
            return !!g && casa(g);
        };
        const algumFilhoCasa = (grupo: HierarchicalSelectItem) =>
            items.some(i => i.parentId === grupo.id && casa(i));
        filtered = ordenados.filter(({ item }) =>
            casa(item) || (item.parentId ? grupoCasa(item) : algumFilhoCasa(item)));
    } else {
        filtered = sortByCode(items).filter(casa).map(item => ({ item, level: getCodeLevel(item.code) }));
    }

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
            {filtered.map(({ item, level }) => {
                const lvl = getLevelStyle(level, 'slate');
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
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-black ${getLevelStyle(selected.parentId ? 2 : getCodeLevel(selected.code), 'slate').codeCls}`}>
                            {selected.code}
                        </span>
                    )}
                    {/* Filho de grupo: o grupo vai junto, senão "010 - Galeria Altavista"
                        fechado não diz se é Condomínios, Obra ou Assistência Técnica. */}
                    {selected.parentName && (
                        <span className="text-sm font-medium text-gray-400 truncate shrink-0">{selected.parentName} ›</span>
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
                        <SheetDescription>{drawerDescription}</SheetDescription>
                    </SheetHeader>
                    <div className="p-4 border-b border-gray-100 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                autoFocus
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
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
