import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import { getCodeLevel, getLevelStyle, sortByCode } from '../utils/codeHierarchy';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

export interface HierarchicalSelectItem {
    id: string;
    code?: string | null;
    name: string;
    /** Hierarquia EXPLÍCITA (grupo → filho), para catálogos cujo código é chato
     *  ("010") e não carrega o nível como o plano de contas ("1.2.3"). Quando
     *  algum item traz `parentId`, a lista vira o mesmo desenho da tela Minha
     *  Organização › Centro de Custo (`CostCenterModule`): accordion por grupo
     *  (chevron abre/fecha os filhos), código em texto simples, sem badge
     *  colorido. Buscando, a lista fica chata e cada filho mostra o grupo ao
     *  lado — igual à tela filtrada. Sem `parentId`, comportamento antigo
     *  (nível pelos pontos do código, badges). */
    parentId?: string | null;
    parentName?: string | null;
}

interface LinhaHierarquica {
    item: HierarchicalSelectItem;
    isGroup: boolean;
    hasChildren: boolean;
}

// Linhas visíveis no modo de hierarquia explícita — espelha `visibleRows` do
// CostCenterModule: sem busca, grupos por código com os filhos só dos grupos
// expandidos; com busca, lista chata (grupos e filhos que casam), sem accordion.
// Filho cujo grupo não está na lista entra como linha solta, no fim.
function linhasHierarquicas(
    items: HierarchicalSelectItem[],
    casa: (i: HierarchicalSelectItem) => boolean,
    filtrando: boolean,
    expandidos: Record<string, boolean>,
): LinhaHierarquica[] {
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
    const saida: LinhaHierarquica[] = [];
    for (const g of grupos) {
        const filhos = sortByCode(filhosDe.get(g.id) ?? []);
        if (filtrando) {
            if (casa(g)) saida.push({ item: g, isGroup: true, hasChildren: false });
            for (const f of filhos) if (casa(f)) saida.push({ item: f, isGroup: false, hasChildren: false });
        } else {
            saida.push({ item: g, isGroup: true, hasChildren: filhos.length > 0 });
            if (filhos.length > 0 && expandidos[g.id]) {
                for (const f of filhos) saida.push({ item: f, isGroup: false, hasChildren: false });
            }
        }
    }
    for (const o of sortByCode(orfaos)) {
        if (!filtrando || casa(o)) saida.push({ item: o, isGroup: false, hasChildren: false });
    }
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
    // Accordion do modo hierárquico. Ao abrir, começa com só o grupo do item
    // selecionado expandido (a tela de Centro de Custo abre tudo recolhido).
    const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
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
    const filtrando = q.trim() !== '';
    // Busca no modo hierárquico também acha pelo nome do grupo (a tela de
    // Centro de Custo pesquisa "por código, grupo, centro de custo").
    const casaComGrupo = (item: HierarchicalSelectItem) =>
        casa(item) || (!!q && !!item.parentName?.toLowerCase().includes(q));
    const linhas: LinhaHierarquica[] = hierarquiaExplicita
        ? linhasHierarquicas(items, casaComGrupo, filtrando, expandidos)
        : [];
    const filtered = hierarquiaExplicita
        ? []
        : sortByCode(items).filter(casa).map(item => ({ item, level: getCodeLevel(item.code) }));

    const gruposComFilhos = items.filter(g => !g.parentId && items.some(i => i.parentId === g.id)).map(g => g.id);
    const todosExpandidos = gruposComFilhos.length > 0 && gruposComFilhos.every(id => expandidos[id]);
    const alternarExpansao = (id: string) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
    const alternarTodos = () => setExpandidos(todosExpandidos ? {} : Object.fromEntries(gruposComFilhos.map(id => [id, true])));

    const abrir = () => {
        setSearch('');
        setExpandidos(selected?.parentId ? { [selected.parentId]: true } : {});
        setOpen(o => !o);
    };
    const closeAndClear = () => { setOpen(false); setSearch(''); };

    const nenhumResultado = hierarquiaExplicita ? linhas.length === 0 : filtered.length === 0;
    const selecionar = (item: HierarchicalSelectItem) => { onChange(getItemValue(item)); closeAndClear(); };

    // Modo hierárquico — mesmas classes das células de CostCenterModule
    // (renderCostCenterCell): chevron w-5 gray-400, código text-xs gray-500,
    // grupo text-sm gray-900, filho recuado; filtrando, o grupo do filho vai em
    // gray-500 antes do nome.
    const listaHierarquica = (
        <>
            {linhas.map(({ item, isGroup, hasChildren }) => {
                const isSelected = value === getItemValue(item);
                return (
                    <div
                        key={item.id}
                        className={`flex items-center gap-2 pr-3 py-2 transition-colors ${hoverCls} ${isSelected ? 'bg-gray-100' : ''}`}
                        style={{ paddingLeft: isGroup || filtrando ? 12 : 32 }}
                    >
                        {isGroup && hasChildren ? (
                            <button
                                type="button"
                                onClick={() => alternarExpansao(item.id)}
                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0 rounded transition-colors"
                                aria-label={expandidos[item.id] ? 'Recolher grupo' : 'Expandir grupo'}
                            >
                                {expandidos[item.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                        ) : (
                            <span className="w-5 h-5 shrink-0" />
                        )}
                        <button
                            type="button"
                            onMouseDown={() => selecionar(item)}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                            {item.code && (
                                <span className="text-xs font-normal text-gray-500 whitespace-nowrap w-9 shrink-0">{item.code}</span>
                            )}
                            {!isGroup && filtrando && item.parentName && (
                                <span className="text-sm font-normal text-gray-500 truncate shrink-0 max-w-[40%]">{item.parentName}</span>
                            )}
                            <span className="text-sm font-normal text-gray-900 truncate">{item.name}</span>
                        </button>
                    </div>
                );
            })}
        </>
    );

    // Lista filtrada — igual nos dois modos (dropdown/drawer), só muda o
    // container em volta (painel pequeno ancorado × Sheet lateral).
    const listBody = nenhumResultado ? (
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
            {hierarquiaExplicita && listaHierarquica}
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
            onClick={abrir}
            className="w-full flex items-center justify-between gap-2 bg-gray-50/50 border border-gray-100 rounded-2xl pl-4 pr-3 py-4 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        >
            {selected ? (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                    {selected.code && (hierarquiaExplicita ? (
                        <span className="shrink-0 text-xs font-normal text-gray-500">{selected.code}</span>
                    ) : (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-black ${getLevelStyle(getCodeLevel(selected.code), 'slate').codeCls}`}>
                            {selected.code}
                        </span>
                    ))}
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
                    <div className="p-4 border-b border-gray-100 shrink-0 flex items-center gap-2">
                        <div className="relative flex-1">
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
                        {hierarquiaExplicita && !filtrando && gruposComFilhos.length > 0 && (
                            <button
                                type="button"
                                onClick={alternarTodos}
                                title={todosExpandidos ? 'Recolher todos os grupos' : 'Expandir todos os grupos'}
                                className="h-9 w-9 flex items-center justify-center rounded-[6px] border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 shrink-0"
                            >
                                {todosExpandidos ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                            </button>
                        )}
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
