import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, User } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { SortableHeader } from './ui/TableUtils';

/**
 * Seletor de Cliente — drawer lateral com a lista em três colunas ordenáveis
 * (Nome, CPF/CNPJ, Cidade/UF) e busca por nome, documento ou e-mail. Mesmo
 * desenho do `SupplierSelect` (pedido de 2026-09-12, Pós-Obra & Garantia: o
 * `<select>` nativo não tem busca e uma organização tem dezenas de clientes).
 *
 * Só seleciona; cadastrar cliente continua em Minha Organização › Meus Clientes.
 * Aceita a lista como `clientService.listClients` devolve.
 */
export interface ClientOption {
    id: string;
    name: string;
    document?: string | null;
    email?: string | null;
    city?: string | null;
    state?: string | null;
}

interface Props {
    clients: ClientOption[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Ícone-âncora à esquerda do gatilho (o formulário de Garantia usa `User`
     *  nos três vínculos). `null` para gatilho sem ícone. */
    icon?: React.ElementType | null;
    /** Classe do gatilho — por padrão o campo `h-9` da escala compacta (§16).
     *  Passe a classe do formulário quando ele tiver a própria régua. */
    triggerClassName?: string;
}

type ColKey = 'name' | 'document' | 'city';
const VAZIO = '—';

const TRIGGER_DEFAULT = 'w-full h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const ClientSelect: React.FC<Props> = ({
    clients, value, onChange, placeholder = 'Selecionar cliente...', disabled = false, icon: Icon = User, triggerClassName = TRIGGER_DEFAULT,
}) => {
    const [open, setOpen] = useState(false);
    // Busca/ordenação transitórias de propósito (exceção ao §3 do guia, que é
    // para filtro de TELA): zeram ao fechar; se persistissem, o seletor
    // reabriria filtrado e esconderia clientes sem aviso.
    const [search, setSearch] = useState('');
    const [sortColumn, setSortColumn] = useState<ColKey>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    // O `Sheet` mantém o conteúdo montado enquanto fechado, então `autoFocus`
    // dispararia uma vez só, na montagem (oculta). O foco tem de ir ao abrir.
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => searchRef.current?.focus(), 50);
        return () => window.clearTimeout(t);
    }, [open]);

    const linhas = useMemo(() => clients.map(c => ({
        id: c.id,
        // trim: cadastro com espaço à frente ia para o topo da ordenação.
        name: (c.name ?? '').trim(),
        document: c.document?.trim() || '',
        email: c.email?.trim() || '',
        city: [c.city?.trim(), c.state?.trim()].filter(Boolean).join(' / '),
    })), [clients]);

    const selected = linhas.find(l => l.id === value);

    const visiveis = useMemo(() => {
        const q = search.trim().toLowerCase();
        const qDigits = q.replace(/\D/g, '');
        const lista = linhas.filter(l => {
            if (!q) return true;
            return l.name.toLowerCase().includes(q)
                || l.email.toLowerCase().includes(q)
                // Dígitos só quando a busca TEM dígito — "abc" não vira coringa
                // sobre todo CPF (bug já visto em Colaboradores).
                || (qDigits.length > 0 && l.document.replace(/\D/g, '').includes(qDigits))
                || l.document.toLowerCase().includes(q);
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        // CPF/CNPJ ordena pelos dígitos: com e sem máscara ficam juntos.
        const chave = (l: typeof lista[number]) => sortColumn === 'document' ? l.document.replace(/\D/g, '') : l[sortColumn];
        return [...lista].sort((a, b) => {
            const va = chave(a), vb = chave(b);
            // Vazio sempre por último, em qualquer direção.
            if (!va && vb) return 1;
            if (va && !vb) return -1;
            return va.localeCompare(vb, 'pt-BR', { numeric: true }) * dir;
        });
    }, [linhas, search, sortColumn, sortDirection]);

    const onSort = (col: string) => {
        if (col === sortColumn) setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortColumn(col as ColKey); setSortDirection('asc'); }
    };

    const fechar = () => { setOpen(false); setSearch(''); };
    const escolher = (id: string) => { onChange(id); fechar(); };

    const thCls = 'px-4 py-2 border-r border-gray-100 last:border-r-0';
    const tdCls = 'px-4 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div>
            <div className="relative">
                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />}
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    className={`${triggerClassName} flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${Icon ? 'pl-9' : 'pl-3'} pr-2`}
                >
                    {selected ? (
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-gray-900 truncate">{selected.name}</span>
                            {selected.document && (
                                <span className="text-xs font-normal text-gray-400 truncate shrink-0">{selected.document}</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-gray-400 truncate">{placeholder}</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>

            <Sheet open={open} onClose={fechar} side="right" size="2xl">
                <SheetHeader onClose={fechar}>
                    <SheetTitle>Selecionar Cliente</SheetTitle>
                    <SheetDescription>Busque por nome, CPF/CNPJ ou e-mail e clique na linha para selecionar.</SheetDescription>
                </SheetHeader>

                <div className="p-4 border-b border-gray-100 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
                            className="w-full h-9 pl-9 pr-3 text-form-input rounded-[6px] bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 font-medium text-slate-700"
                        />
                    </div>
                </div>

                <SheetPanel className="p-0">
                    {/* Larguras em px: CPF/CNPJ mascarado tem até 18 caracteres e
                        Cidade/UF é curto. O Nome, único texto livre, absorve o resto
                        e QUEBRA em linha em vez de truncar (§6.1.2 / SupplierSelect). */}
                    <table className="w-full table-fixed">
                        <colgroup>
                            <col />
                            <col style={{ width: 168 }} />
                            <col style={{ width: 190 }} />
                        </colgroup>
                        <thead className="bg-gray-50/80 sticky top-0 z-10">
                            <tr>
                                <SortableHeader label="Nome" colKey="name" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="CPF / CNPJ" colKey="document" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="Cidade / UF" colKey="city" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
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
                                    <td colSpan={3} className="px-4 py-6 text-xs font-medium text-slate-400 text-center">
                                        {linhas.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente encontrado'}
                                    </td>
                                </tr>
                            ) : visiveis.map(l => (
                                <tr
                                    key={l.id}
                                    onClick={() => escolher(l.id)}
                                    className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${l.id === value ? 'bg-gray-100' : ''}`}
                                >
                                    <td className={`${tdCls} text-gray-900`}>
                                        <p className="break-words">{l.name}</p>
                                        {l.email && <p className="text-xs text-gray-400 break-all">{l.email}</p>}
                                    </td>
                                    <td className={`${tdCls} text-gray-600 whitespace-nowrap`}>{l.document || <span className="text-gray-300">{VAZIO}</span>}</td>
                                    <td className={`${tdCls} text-gray-600`}><p className="truncate" title={l.city || undefined}>{l.city || <span className="text-gray-300">{VAZIO}</span>}</p></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default ClientSelect;
