import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, DoorOpen } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { SortableHeader } from './ui/TableUtils';
import type { WarrantyUnitOption } from '../types/warranty';
import { ROLE_LABELS, unitLabel } from '../utils/warrantyAutofill';

/**
 * Seletor de Unidade — drawer lateral no molde do `ClientSelect` (§7.1.1):
 * colunas Unidade, Empreendimento e Cliente(s), busca por qualquer uma delas.
 *
 * Nasceu em Pós-Obra & Garantia (2026-10-10, "se o app já tem as informações
 * não vamos obrigar o usuário preencher manualmente"): a unidade deixou de ser
 * texto livre, e escolhê-la preenche empreendimento, obra e cliente.
 *
 * `preferredIds` restringe a lista às unidades de um cliente já escolhido, com
 * "Ver todas as unidades" para sair do recorte — o recorte nunca esconde nada
 * sem dizer.
 *
 * Só seleciona; cadastrar unidade continua em Incorporação › Empreendimento.
 */
interface Props {
    units: WarrantyUnitOption[];
    value: string;
    onChange: (unit: WarrantyUnitOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
    triggerClassName?: string;
    /** Unidades do cliente escolhido. Vazio/ausente = sem recorte. */
    preferredIds?: string[];
    /** Quem é o recorte, para o aviso ("Unidades de Fulano"). */
    preferredLabel?: string;
    /** Rótulo gravado quando a unidade não está na lista (chamado antigo, outra organização). */
    fallbackLabel?: string;
}

type ColKey = 'unidade' | 'empreendimento' | 'clientes';
const VAZIO = '—';

const TRIGGER_DEFAULT = 'w-full h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const UnitSelect: React.FC<Props> = ({
    units, value, onChange, placeholder = 'Selecionar unidade...', disabled = false,
    triggerClassName = TRIGGER_DEFAULT, preferredIds, preferredLabel, fallbackLabel,
}) => {
    const [open, setOpen] = useState(false);
    // Portal + montagem só ao abrir: mesmo motivo do ClientSelect (o formulário
    // que usa o campo pode estar dentro de um painel com `transform`).
    const [mounted, setMounted] = useState(false);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (open) {
            setMounted(true);
            const r = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(r);
        }
        setShown(false);
        const t = window.setTimeout(() => setMounted(false), 300);
        return () => window.clearTimeout(t);
    }, [open]);

    // Busca, ordenação e "ver todas" transitórias de propósito (§3.1 do guia):
    // zeram ao fechar, para o seletor nunca reabrir escondendo unidades.
    const [search, setSearch] = useState('');
    const [verTodas, setVerTodas] = useState(false);
    const [sortColumn, setSortColumn] = useState<ColKey | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!shown) return;
        const t = window.setTimeout(() => searchRef.current?.focus(), 50);
        return () => window.clearTimeout(t);
    }, [shown]);

    const linhas = useMemo(() => units.map((u, ordem) => ({
        unit: u,
        ordem,
        unidade: unitLabel(u),
        empreendimento: u.empreendimento_name ?? '',
        clientes: u.clients.map(c => (c.client_name ?? '').trim()).filter(Boolean).join(', '),
    })), [units]);

    const recorte = useMemo(() => new Set(preferredIds ?? []), [preferredIds]);
    const recortado = recorte.size > 0 && !verTodas;
    const selected = linhas.find(l => l.unit.unit_id === value);

    const visiveis = useMemo(() => {
        const q = search.trim().toLowerCase();
        const lista = linhas.filter(l => {
            if (recortado && !recorte.has(l.unit.unit_id)) return false;
            if (!q) return true;
            return l.unidade.toLowerCase().includes(q)
                || l.empreendimento.toLowerCase().includes(q)
                || l.clientes.toLowerCase().includes(q);
        });
        // Sem coluna escolhida, a ordem é a do diretório (empreendimento › torre
        // › unidade, como o cadastro) — alfabética em "Unidade" poria 101 antes de 11.
        if (!sortColumn) return lista;
        const dir = sortDirection === 'asc' ? 1 : -1;
        return [...lista].sort((a, b) => {
            const va = a[sortColumn], vb = b[sortColumn];
            if (!va && vb) return 1;
            if (va && !vb) return -1;
            return va.localeCompare(vb, 'pt-BR', { numeric: true }) * dir || a.ordem - b.ordem;
        });
    }, [linhas, search, sortColumn, sortDirection, recortado, recorte]);

    const onSort = (col: string) => {
        if (col === sortColumn) setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortColumn(col as ColKey); setSortDirection('asc'); }
    };

    const fechar = () => { setOpen(false); setSearch(''); setVerTodas(false); };
    const escolher = (u: WarrantyUnitOption | null) => { onChange(u); fechar(); };

    const thCls = 'px-4 py-2 border-r border-gray-100 last:border-r-0';
    const tdCls = 'px-4 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div>
            <div className="relative">
                <DoorOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    className={`${triggerClassName} flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pl-9 pr-2`}
                >
                    {selected ? (
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-gray-900 truncate">{selected.unidade}</span>
                            <span className="text-xs font-normal text-gray-400 truncate">{selected.empreendimento}</span>
                        </span>
                    ) : fallbackLabel ? (
                        <span className="text-gray-900 truncate flex-1 min-w-0" title={fallbackLabel}>{fallbackLabel}</span>
                    ) : (
                        <span className="text-gray-400 truncate">{placeholder}</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* zIndex 10000: vence o overlay do modal que o abriu (mesma camada do ClientSelect). */}
            {mounted && createPortal(
            <Sheet open={shown} onClose={fechar} side="right" size="2xl" zIndex={10000}>
                <SheetHeader onClose={fechar}>
                    <SheetTitle>Selecionar Unidade</SheetTitle>
                    <SheetDescription>Escolher a unidade preenche empreendimento, obra e cliente do chamado.</SheetDescription>
                </SheetHeader>

                <div className="p-4 border-b border-gray-100 shrink-0 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por unidade, empreendimento ou cliente..."
                            className="w-full h-9 pl-9 pr-3 text-form-input rounded-[6px] bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 font-medium text-slate-700"
                        />
                    </div>
                    {recorte.size > 0 && (
                        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                            <span>
                                {recortado
                                    ? `Mostrando as ${recorte.size} unidade(s)${preferredLabel ? ` de ${preferredLabel}` : ' do cliente'}.`
                                    : `Mostrando todas as ${linhas.length} unidades.`}
                            </span>
                            <button
                                type="button"
                                onClick={() => setVerTodas(v => !v)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                                {recortado ? 'Ver todas as unidades' : 'Só as do cliente'}
                            </button>
                        </div>
                    )}
                </div>

                <SheetPanel className="p-0">
                    {/* Unidade é curta ("Torre A · 302"); Empreendimento, texto livre,
                        absorve o resto e quebra em vez de truncar (§6.1.2). */}
                    <table className="w-full table-fixed">
                        <colgroup>
                            <col style={{ width: 170 }} />
                            <col />
                            <col style={{ width: 230 }} />
                        </colgroup>
                        <thead className="bg-gray-50/80 sticky top-0 z-10">
                            <tr>
                                <SortableHeader label="Unidade" colKey="unidade" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="Empreendimento" colKey="empreendimento" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                                <SortableHeader label="Cliente(s)" colKey="clientes" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} className={thCls} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {value && (
                                <tr onClick={() => escolher(null)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                                    <td colSpan={3} className="px-4 py-2 text-form-input font-medium text-slate-400">Sem unidade vinculada</td>
                                </tr>
                            )}
                            {visiveis.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-6 text-xs font-medium text-slate-400 text-center">
                                        {linhas.length === 0
                                            ? 'Nenhuma unidade cadastrada nos empreendimentos desta organização'
                                            : 'Nenhuma unidade encontrada'}
                                    </td>
                                </tr>
                            ) : visiveis.map(l => (
                                <tr
                                    key={l.unit.unit_id}
                                    onClick={() => escolher(l.unit)}
                                    className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${l.unit.unit_id === value ? 'bg-gray-100' : ''}`}
                                >
                                    <td className={`${tdCls} text-gray-900`}>
                                        <p className="break-words">{l.unidade}</p>
                                        {l.unit.unit_floor != null && !l.unit.lote && (
                                            <p className="text-xs text-gray-400">{l.unit.unit_floor === 0 ? 'Térreo' : `${l.unit.unit_floor}º pavimento`}</p>
                                        )}
                                    </td>
                                    <td className={`${tdCls} text-gray-600`}><p className="break-words">{l.empreendimento || VAZIO}</p></td>
                                    <td className={`${tdCls} text-gray-600`}>
                                        {l.unit.clients.length === 0 ? (
                                            <span className="text-gray-300">{VAZIO}</span>
                                        ) : l.unit.clients.map(c => (
                                            <p key={c.client_id} className="truncate" title={`${c.client_name ?? ''} — ${ROLE_LABELS[c.role] ?? c.role}`}>
                                                {c.client_name ?? VAZIO}
                                                <span className="text-xs text-gray-400"> · {ROLE_LABELS[c.role] ?? c.role}</span>
                                            </p>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SheetPanel>
            </Sheet>,
            document.body)}
        </div>
    );
};

export default UnitSelect;
