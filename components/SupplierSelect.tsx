import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, Tag } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { SortableHeader } from './ui/TableUtils';
import { getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';

/**
 * Seletor de Fornecedor — drawer lateral com a lista em TRÊS colunas
 * ordenáveis (Nome, CNPJ/CPF, Categoria), busca por nome/documento e filtro
 * por categoria (pedido de 2026-09-10: o nome vinha com o CNPJ colado).
 *
 * Só seleciona; cadastrar fornecedor continua fora (botão "Novo" de quem usa).
 * Aceita a lista como `supplierService.listSuppliers` devolve.
 */
export interface SupplierOption {
    id: string;
    name: string;
    nickname?: string | null;
    document?: string | null;
    category?: string | null;
}

interface Props {
    suppliers: SupplierOption[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** 'md' (padrão) é o campo de formulário; 'sm' é o gatilho compacto h-9
     *  para barras/linhas, no recorte dos outros controles. */
    size?: 'md' | 'sm';
}

type ColKey = 'name' | 'document' | 'category';
const SEM_CATEGORIA = '—';

const SupplierSelect: React.FC<Props> = ({
    suppliers, value, onChange, placeholder = 'Selecione um fornecedor', disabled = false, size = 'md',
}) => {
    const [open, setOpen] = useState(false);
    // Busca/filtro/ordenação transitórios de propósito (exceção ao §3 do
    // guia, que é para filtro de TELA): zeram ao fechar; se persistissem, o
    // seletor reabriria filtrado e esconderia fornecedores sem aviso.
    const [search, setSearch] = useState('');
    const [categoria, setCategoria] = useState('');
    const [sortColumn, setSortColumn] = useState<ColKey>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const modo = appSettingsService.get().supplierNameDisplay;
    const linhas = useMemo(() => suppliers.map(s => ({
        id: s.id,
        // trim: cadastro com espaço à frente ia para o topo da ordenação.
        name: getSupplierDisplayName(s, modo).trim(),
        document: s.document?.trim() || '',
        category: s.category?.trim() || '',
    })), [suppliers, modo]);

    const categorias = useMemo(
        () => [...new Set(linhas.map(l => l.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        [linhas],
    );

    const selected = linhas.find(l => l.id === value);

    const visiveis = useMemo(() => {
        const q = search.trim().toLowerCase();
        const qDigits = q.replace(/\D/g, '');
        const lista = linhas.filter(l => {
            if (categoria && l.category !== categoria) return false;
            if (!q) return true;
            return l.name.toLowerCase().includes(q)
                || (qDigits.length > 0 && l.document.replace(/\D/g, '').includes(qDigits))
                || l.document.toLowerCase().includes(q);
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        // CNPJ/CPF ordena pelos dígitos: com e sem máscara ficam juntos.
        const chave = (l: typeof lista[number]) => sortColumn === 'document' ? l.document.replace(/\D/g, '') : l[sortColumn];
        return [...lista].sort((a, b) => {
            const va = chave(a), vb = chave(b);
            // Vazio sempre por último, em qualquer direção.
            if (!va && vb) return 1;
            if (va && !vb) return -1;
            return va.localeCompare(vb, 'pt-BR', { numeric: true }) * dir;
        });
    }, [linhas, search, categoria, sortColumn, sortDirection]);

    const onSort = (col: string) => {
        if (col === sortColumn) setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortColumn(col as ColKey); setSortDirection('asc'); }
    };

    const fechar = () => { setOpen(false); setSearch(''); setCategoria(''); };
    const escolher = (id: string) => { onChange(id); fechar(); };

    const thCls = 'px-4 py-2 border-r border-gray-100 last:border-r-0';
    const tdCls = 'px-4 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                className={`w-full flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    size === 'sm'
                        ? 'h-9 bg-gray-50 border border-gray-200 rounded-[6px] pl-3 pr-2'
                        : 'bg-gray-50/50 border border-gray-100 rounded-2xl pl-4 pr-3 py-4'
                }`}
            >
                {selected ? (
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-sm text-gray-900 truncate ${size === 'sm' ? 'font-medium' : 'font-bold'}`}>{selected.name}</span>
                        {selected.document && (
                            <span className="text-xs font-normal text-gray-400 truncate shrink-0">{selected.document}</span>
                        )}
                    </span>
                ) : (
                    <span className="text-sm text-gray-400 truncate">{placeholder}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            <Sheet open={open} onClose={fechar} side="right" size="2xl">
                <SheetHeader onClose={fechar}>
                    <SheetTitle>Selecionar Fornecedor</SheetTitle>
                    <SheetDescription>Busque por nome ou CNPJ/CPF, filtre pela categoria e clique na linha para selecionar.</SheetDescription>
                </SheetHeader>

                <div className="p-4 border-b border-gray-100 shrink-0 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nome ou CNPJ/CPF..."
                            className="w-full h-9 pl-9 pr-3 text-form-input rounded-[6px] bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 font-medium text-slate-700"
                        />
                    </div>
                    <div className="relative flex items-center shrink-0">
                        <Tag className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <select
                            value={categoria}
                            onChange={e => setCategoria(e.target.value)}
                            disabled={categorias.length === 0}
                            title="Filtrar por categoria"
                            className="h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed max-w-[220px]"
                        >
                            <option value="">Todas as categorias</option>
                            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5" />
                    </div>
                </div>

                <SheetPanel className="p-0">
                    {/* Larguras em px, não em %: o drawer tem 672px (`size="2xl"`) e
                        com 27% (~181px) a Categoria cortava "Materiais de Construção"
                        e "Engenharia e Arquitetura" (2026-09-11). CNPJ mascarado tem
                        18 caracteres fixos e Categoria vem de um catálogo curto —
                        as duas cabem inteiras em largura fixa; o Nome, que é o
                        único texto livre, absorve o resto e trunca com tooltip.
                        Alargar o Sheet não é opção (ver o aviso em `ui/sheet.tsx`). */}
                    <table className="w-full table-fixed">
                        <colgroup>
                            <col />
                            <col style={{ width: 168 }} />
                            <col style={{ width: 212 }} />
                        </colgroup>
                        <thead className="bg-gray-50/80 sticky top-0 z-10">
                            <tr>
                                <SortableHeader label="Nome" colKey="name" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="CNPJ / CPF" colKey="document" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="Categoria" colKey="category" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {value && (
                                <tr onClick={() => escolher('')} className="cursor-pointer hover:bg-gray-50 transition-colors">
                                    <td colSpan={3} className="px-4 py-2 text-form-input font-medium text-slate-400">{placeholder}</td>
                                </tr>
                            )}
                            {visiveis.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-6 text-xs font-medium text-slate-400 text-center">Nenhum fornecedor encontrado</td>
                                </tr>
                            ) : visiveis.map(l => (
                                <tr
                                    key={l.id}
                                    onClick={() => escolher(l.id)}
                                    className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${l.id === value ? 'bg-gray-100' : ''}`}
                                >
                                    <td className={`${tdCls} text-gray-900`}><p className="truncate" title={l.name}>{l.name}</p></td>
                                    <td className={`${tdCls} text-gray-600 whitespace-nowrap`}>{l.document || <span className="text-gray-300">{SEM_CATEGORIA}</span>}</td>
                                    <td className={`${tdCls} text-gray-600`}><p className="truncate" title={l.category || undefined}>{l.category || <span className="text-gray-300">{SEM_CATEGORIA}</span>}</p></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default SupplierSelect;
