import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    /** Valor gravado quando `valueField="name"` e o nome exibido foi encurtado
     *  (ex.: exibe "Galeria Altavista", grava o achatado "Obra > Galeria
     *  Altavista", que é o que o registro legado guarda). */
    fullName?: string;
    /** `false` = só agrupa, não é escolhível (ex.: cabeçalho de organização
     *  quando a lista junta várias orgs). Clicar no nome expande/recolhe.
     *  Buscando, some da lista — os filhos aparecem com ele como `parentName`. */
    selecionavel?: boolean;
}

interface LinhaHierarquica {
    item: HierarchicalSelectItem;
    /** Tem filhos na lista (mostra o chevron quando não está filtrando). */
    hasChildren: boolean;
    /** Profundidade na árvore — 0 = raiz. Vira o recuo da linha. */
    depth: number;
}

// Linhas visíveis no modo agrupado — espelha `visibleRows` do CostCenterModule:
// sem busca, árvore por código com os filhos só dos nós expandidos; com busca,
// lista chata (todo nó que casa), sem accordion e sem recuo. Funciona para
// qualquer profundidade: Centro de Custo tem 2 níveis (grupo → filho), o
// Plano de Contas tem até 4 ("1" → "1.2" → "1.2.3" → "1.2.3.9"). Nó cujo pai
// não está na lista entra como raiz solta, no fim.
function linhasHierarquicas(
    items: HierarchicalSelectItem[],
    casa: (i: HierarchicalSelectItem) => boolean,
    filtrando: boolean,
    expandidos: Record<string, boolean>,
): LinhaHierarquica[] {
    const ids = new Set(items.map(i => i.id));
    const raizes: HierarchicalSelectItem[] = [];
    const orfaos: HierarchicalSelectItem[] = [];
    const filhosDe = new Map<string, HierarchicalSelectItem[]>();
    for (const i of items) {
        if (!i.parentId) { raizes.push(i); continue; }
        if (!ids.has(i.parentId)) { orfaos.push(i); continue; }
        const lista = filhosDe.get(i.parentId) ?? [];
        lista.push(i);
        filhosDe.set(i.parentId, lista);
    }
    const saida: LinhaHierarquica[] = [];
    const visita = (item: HierarchicalSelectItem, depth: number) => {
        const filhos = sortByCode(filhosDe.get(item.id) ?? []);
        if (filtrando) {
            if (casa(item) && item.selecionavel !== false) saida.push({ item, hasChildren: false, depth: 0 });
            for (const f of filhos) visita(f, depth + 1);
            return;
        }
        saida.push({ item, hasChildren: filhos.length > 0, depth });
        if (filhos.length > 0 && expandidos[item.id]) for (const f of filhos) visita(f, depth + 1);
    };
    for (const r of sortByCode(raizes)) visita(r, 0);
    for (const o of sortByCode(orfaos)) visita(o, 0);
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
    /** 'md' (padrão) é o campo de formulário; 'sm' é o gatilho compacto h-9
     *  para barras de cabeçalho/toolbar, no recorte dos outros controles. */
    size?: 'md' | 'sm';
    /** Gatilho desabilitado (só o campo fechado; o drawer não abre). */
    disabled?: boolean;
    /** Força o modo agrupado (accordion, código em texto simples, sem badge)
     *  mesmo quando nenhum item traz `parentId` — ex.: plano de contas de uma
     *  org que só tem contas de 1º nível. Sem isso o modo é inferido. */
    agrupado?: boolean;
    /** Classe do gatilho quando a tela tem a própria régua (substitui a de `size`). */
    triggerClassName?: string;
    /** Célula de tabela: nome em peso normal, sem o "Grupo ›" antes (a coluna já é
     *  estreita) — o drawer continua mostrando a hierarquia inteira. */
    compact?: boolean;
    /** Texto do gatilho quando `value` não resolve para nenhum item (ex.: centro de
     *  custo de organização que a conta não atende). */
    fallbackLabel?: string;
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
    size = 'md',
    disabled = false,
    agrupado = false,
    triggerClassName,
    compact = false,
    fallbackLabel,
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

    // Clique fora só fecha o painel ANCORADO (dropdown). No modo drawer o
    // painel sai por portal — todo clique dentro dele seria "fora" do wrapper e
    // o fecharia no mousedown; ali quem fecha é o backdrop/ESC do próprio Sheet.
    useEffect(() => {
        if (panelVariant === 'drawer') return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [panelVariant]);

    // Drawer por PORTAL em `document.body`, montado só enquanto aberto — igual ao
    // `ClientSelect`. Este campo vive dentro de formulários em `Sheet`, cujo
    // painel tem `transform` + `overflow-hidden`: um `fixed` filho fica preso ao
    // painel, e o "deslocamento de saída" do Sheet fechado caía DENTRO da área
    // visível (medido em 2026-09-13: o seletor de centro de custo aparecia
    // aberto ao abrir o drawer de manutenção, sem ninguém clicar). `shown` vira
    // true um frame depois, para a transição de entrada acontecer.
    const [mounted, setMounted] = useState(false);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (panelVariant !== 'drawer') return;
        if (open) {
            setMounted(true);
            const r = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(r);
        }
        setShown(false);
        const t = window.setTimeout(() => setMounted(false), 300);
        return () => window.clearTimeout(t);
    }, [open, panelVariant]);

    const getItemValue = (item: HierarchicalSelectItem): string => {
        if (valueField === 'code') return item.code ?? '';
        if (valueField === 'name') return item.fullName ?? item.name;
        return item.id;
    };

    const selected = items.find(item => getItemValue(item) === value);

    const q = search.toLowerCase();
    const casa = (item: HierarchicalSelectItem) =>
        !q || !!item.code?.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);

    const hierarquiaExplicita = agrupado || items.some(i => i.parentId);
    const itemPorId = new Map(items.map(i => [i.id, i]));
    // Largura da coluna de código = o maior código da lista ("1.2.3.9" não cabe
    // nos 36px que bastavam para "010").
    const larguraCodigo = Math.max(4, ...items.map(i => i.code?.trim().length ?? 0));
    // Cabeçalho (nó não selecionável — ex.: organização) acima do item, se houver.
    // Na busca ele vai antes do pai: "Alpa › Impostos › 1.1.1 PIS" e "SPE › Impostos ›
    // 1.1.1 PIS" deixam de ser duas linhas iguais.
    const cabecalhoDe = (item: HierarchicalSelectItem): string | null => {
        for (let atual = item.parentId ? itemPorId.get(item.parentId) : undefined; atual; atual = atual.parentId ? itemPorId.get(atual.parentId) : undefined) {
            if (atual.selecionavel === false) return atual.name;
        }
        return null;
    };
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

    const comFilhos = new Set(items.map(i => i.parentId).filter((id): id is string => !!id && itemPorId.has(id)));
    const gruposComFilhos = items.filter(g => comFilhos.has(g.id)).map(g => g.id);
    const todosExpandidos = gruposComFilhos.length > 0 && gruposComFilhos.every(id => expandidos[id]);
    const alternarExpansao = (id: string) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
    const alternarTodos = () => setExpandidos(todosExpandidos ? {} : Object.fromEntries(gruposComFilhos.map(id => [id, true])));

    const abrir = () => {
        setSearch('');
        // Abre só o caminho até o item selecionado (todos os ancestrais), como a
        // tela de Centro de Custo abre recolhida.
        const caminho: Record<string, boolean> = {};
        for (let atual = selected; atual?.parentId; atual = itemPorId.get(atual.parentId)) caminho[atual.parentId] = true;
        setExpandidos(caminho);
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
            {linhas.map(({ item, hasChildren, depth }) => {
                const isSelected = value === getItemValue(item);
                return (
                    <div
                        key={item.id}
                        className={`flex items-center gap-2 pr-3 py-2 transition-colors ${hoverCls} ${isSelected ? 'bg-gray-100' : ''}`}
                        style={{ paddingLeft: filtrando ? 12 : 12 + depth * 20 }}
                    >
                        {hasChildren ? (
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
                        {item.selecionavel === false ? (
                            <button
                                type="button"
                                onClick={() => alternarExpansao(item.id)}
                                className="flex-1 min-w-0 flex items-center gap-3 text-left"
                            >
                                <span className="text-sm font-semibold text-gray-700 truncate">{item.name}</span>
                            </button>
                        ) : (
                        <button
                            type="button"
                            onMouseDown={() => selecionar(item)}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                            {item.code && (
                                <span className="text-xs font-normal text-gray-500 whitespace-nowrap shrink-0" style={{ width: `${larguraCodigo}ch` }}>{item.code}</span>
                            )}
                            {filtrando && (item.parentName || cabecalhoDe(item)) && (
                                <span className="text-sm font-normal text-gray-500 truncate shrink-0 max-w-[40%]">
                                    {[cabecalhoDe(item), cabecalhoDe(item) === item.parentName ? null : item.parentName].filter(Boolean).join(' › ')}
                                </span>
                            )}
                            <span className="text-sm font-normal text-gray-900 truncate">{item.name}</span>
                        </button>
                        )}
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
            disabled={disabled}
            aria-haspopup={panelVariant === 'drawer' ? 'dialog' : 'listbox'}
            aria-expanded={open}
            className={`w-full flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                triggerClassName ?? (size === 'sm'
                    ? 'h-9 bg-gray-50 border border-gray-200 rounded-[6px] pl-3 pr-2'
                    : 'bg-gray-50/50 border border-gray-100 rounded-2xl pl-4 pr-3 py-4')
            }`}
        >
            {selected ? (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                    {selected.code && !compact && (hierarquiaExplicita ? (
                        <span className="shrink-0 text-xs font-normal text-gray-500">{selected.code}</span>
                    ) : (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-black ${getLevelStyle(getCodeLevel(selected.code), 'slate').codeCls}`}>
                            {selected.code}
                        </span>
                    ))}
                    {/* Filho de grupo: o grupo vai junto, senão "010 - Galeria Altavista"
                        fechado não diz se é Condomínios, Obra ou Assistência Técnica. */}
                    {selected.parentName && !compact && (
                        <span className="text-sm font-medium text-gray-400 truncate shrink-0">{selected.parentName} ›</span>
                    )}
                    <span className={`text-sm text-gray-900 truncate ${compact ? 'font-normal' : size === 'sm' ? 'font-medium' : 'font-bold'}`}>{selected.name}</span>
                </span>
            ) : fallbackLabel ? (
                <span className="text-sm font-normal text-gray-900 truncate flex-1 min-w-0" title={fallbackLabel}>{fallbackLabel}</span>
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
                {/* zIndex 10000: por portal, fica FORA do overlay que o abriu e precisa
                    vencer o z-index dele (mesma camada do `ClientSelect`). */}
                {mounted && createPortal(
                <Sheet open={shown} onClose={closeAndClear} side="right" size="sm" zIndex={10000}>
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
                </Sheet>,
                document.body)}
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
