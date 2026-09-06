import React from 'react';
import {
    ArrowRightLeft, Briefcase, Calendar, Check, CheckCircle2, DollarSign, ExternalLink,
    FileText, Pencil, Plus, Trash2, UserPlus, X,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { formatMoney, formatDateBR } from '../ui/Format';
import { LazySelect, type LazyOption } from './LazySelect';
import type { ColumnConfig } from '../ui/TableUtils';
import type { FilterFieldConfig } from '../ui/FilterUtils';
import type { BankTransaction, InternalTransaction, BankTransactionStatus } from '../../types';

/**
 * Configuração e desenho das três tabelas da Conciliação Bancária: o Extrato, e os dois
 * lados de Pendentes (banco e interno).
 *
 * Isto saiu de `BankReconciliation.tsx` (item 3.4 do plano) por um motivo diferente das
 * abas: aqui **não há estado nenhum para passar**. Eram declarações de módulo — listas de
 * coluna, rótulos, classes de célula e três funções `render*Cell` que recebem tudo por um
 * objeto `ctx`. Mover 550 linhas assim custa zero prop e não tem como mudar comportamento.
 *
 * ⚠️ Por que o ramo de Pendentes/Extrato NÃO virou componente junto: ele lê mais de 40
 * estados do pai (buscas, filtros, ordenação, seleção, paginação, larguras de coluna, sete
 * dropdowns). Um componente com 40 props é o mesmo acoplamento com mais cerimônia, e cada
 * prop é uma chance de errar a ligação. As abas que valiam a pena (Regras, Categorias,
 * Conciliados) já saíram; o resto do ganho estava aqui.
 */

export const STATEMENT_COLUMNS: ColumnConfig[] = [
    { key: 'description',  label: 'Descrição',          sortable: true },
    { key: 'client',       label: 'Cliente',            sortable: true },
    { key: 'creditor',     label: 'Credor',             sortable: true },
    { key: 'category',     label: 'Categoria',          sortable: true },
    { key: 'project',      label: 'Obra',               sortable: true },
    { key: 'costCenter',   label: 'Centro de Custo',    sortable: true },
    { key: 'date',         label: 'Data',               sortable: true },
    { key: 'amount',       label: 'Valor',              sortable: true },
    // Status mistura dado (situação da conciliação) com ação inline (Aceitar/Rejeitar
    // quando RULE_APPLIED) — não é um valor único comparável, guia §6.3.
    { key: 'status',       label: 'Status',             sortable: false },
    { key: 'actions',      label: 'Ações',              sortable: false },
];

// Campo de bankSortField que cada coluna ordena (state próprio da toolbar, não o
// sortColumn genérico de useTableColumns — ver bankSortField/bankSortOrder no
// componente). Ausente = não ordenável (ex: status mistura dado com ação inline).
export type BankSortField = 'date' | 'amount' | 'description' | 'category' | 'counterparty' | 'project' | 'costCenter';
export type InternalSortField = 'date' | 'amount' | 'description' | 'category' | 'entity';

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (coluna estrutural fixa no fim,
// nunca arrastável — ver renderização da tabela).
export const STATEMENT_COLUMN_HEADERS: Record<string, { label: string; className: string; sortField?: BankSortField }> = {
    description: { label: 'Descrição',       sortField: 'description',  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    client:      { label: 'Cliente',         sortField: 'counterparty', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    creditor:    { label: 'Credor',          sortField: 'counterparty', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    category:    { label: 'Categoria',       sortField: 'category',     className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    project:     { label: 'Obra',            sortField: 'project',      className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    costCenter:  { label: 'Centro de Custo', sortField: 'costCenter',   className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    date:        { label: 'Data',            sortField: 'date',         className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    amount:      { label: 'Valor',           sortField: 'amount',       className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    status:      { label: 'Status',                                     className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
};

// Classes específicas por coluna do <td> (além da base comum, aplicada na renderização
// da linha) — extraídas 1:1 das classes que já estavam hardcoded em cada <td>. Cor
// dinâmica de 'amount' (verde/vermelho por direção) fica dentro da célula (span), não aqui.
export const STATEMENT_TD_CLASS: Record<string, string> = {
    description: 'text-sm font-normal text-gray-700 overflow-hidden',
    client:      'text-sm font-normal text-gray-700 overflow-hidden',
    creditor:    'text-sm font-normal text-gray-700 overflow-hidden',
    category:    'text-sm font-normal text-gray-700 overflow-hidden',
    project:     'text-sm font-normal text-gray-700 overflow-hidden',
    costCenter:  'text-sm font-normal text-gray-700 overflow-hidden',
    date:        'text-sm font-normal text-gray-600 text-center whitespace-nowrap',
    amount:      'text-sm font-medium text-right whitespace-nowrap',
    status:      'text-center',
};

// Filtro avançado do Extrato (guia §5.1 / paridade com SupplierList.tsx). Cobre
// campos que os chips de categoria/contraparte/fluxo/data não cobrem (descrição,
// valor) — permite regras tipo "valor > 1000" ou "descrição contém PIX".
export const STATEMENT_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'description',  label: 'Descrição',          type: 'text'   },
    { key: 'client',       label: 'Cliente',            type: 'text'   },
    { key: 'creditor',     label: 'Credor',             type: 'text'   },
    { key: 'category',     label: 'Categoria',          type: 'text'   },
    { key: 'amount',       label: 'Valor',              type: 'number' },
    { key: 'direction',    label: 'Tipo', type: 'select', options: [
        { value: 'CREDIT', label: 'Entrada (crédito)' }, { value: 'DEBIT', label: 'Saída (débito)' },
    ] },
];

// Com o filtro Receitas/Despesas ativo, a coluna do lado que não se aplica
// (Credor em Receitas, Cliente em Despesas) só mostraria "—" em toda linha —
// por isso soma-se ao filtro de colunas do usuário (tableColumns.visibleColumns),
// em vez de deixá-la visível e vazia.
export function isStatementColumnVisibleForFlow(key: string, flowFilter: 'ALL' | 'INCOME' | 'EXPENSE'): boolean {
    if (key === 'creditor' && flowFilter === 'INCOME') return false;
    if (key === 'client' && flowFilter === 'EXPENSE') return false;
    return true;
}

export function getBankTxFilterValue(tx: BankTransaction, key: string): unknown {
    switch (key) {
        case 'description':  return tx.description_normalized || tx.description_raw || '';
        case 'client':       return tx.direction === 'CREDIT' ? (tx.counterparty_name ?? '') : '';
        case 'creditor':     return tx.direction === 'DEBIT' ? (tx.counterparty_name ?? '') : '';
        case 'category':     return tx.category ?? '';
        case 'amount':       return tx.amount ?? 0;
        case 'direction':    return tx.direction ?? '';
        default: return null;
    }
}

// Colunas da tabela de Extrato Bancário na aba Pendentes (visualização em linha).
// sortable:true só nas colunas que o campo de ordenação da toolbar (bankSortField) suporta.
export const PENDING_BANK_COLUMNS: ColumnConfig[] = [
    { key: 'counterparty', label: 'Contraparte',     sortable: true  },
    { key: 'category',     label: 'Categoria',       sortable: true  },
    { key: 'project',      label: 'Obra',            sortable: false },
    { key: 'costCenter',   label: 'Centro de Custo', sortable: false },
    { key: 'date',         label: 'Data',            sortable: true  },
    { key: 'amount',       label: 'Valor',           sortable: true  },
    { key: 'actions',      label: 'Ações',           sortable: false },
];

// Larguras padrão — arraste a borda direita do cabeçalho para ajustar; duplo clique restaura.
export const DEFAULT_PENDING_BANK_COL_WIDTHS: Record<string, number> = {
    counterparty: 160,
    category: 140,
    project: 140,
    costCenter: 159,
    date: 100,
    amount: 130,
    actions: 160,
};

// Header por coluna (ver STATEMENT_COLUMN_HEADERS acima) — 'actions' fica fora, é
// coluna estrutural fixa no fim. sortField ausente = sortable={false} (project/costCenter
// não têm campo de ordenação próprio nesta tabela, igual ao original).
export const PENDING_BANK_COLUMN_HEADERS: Record<string, { label: string; className: string; sortField?: BankSortField }> = {
    counterparty: { label: 'Contraparte',     sortField: 'counterparty', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    category:     { label: 'Categoria',       sortField: 'category',     className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    project:      { label: 'Obra',                                       className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    costCenter:   { label: 'Centro de Custo',                            className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    date:         { label: 'Data',            sortField: 'date',         className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    amount:       { label: 'Valor',           sortField: 'amount',       className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
};

// Classes específicas por coluna do <td> (a parte comum "px-6 {cellPad} border-r
// border-gray-100" é montada na renderização da linha, junto com o onClick de
// stopPropagation que só as colunas com <LazySelect> têm). Cor dinâmica de 'amount'
// fica dentro da célula (span), não aqui.
export const PENDING_BANK_TD_META: Record<string, { className: string; stopPropagation?: boolean }> = {
    counterparty: { className: '',                                                         stopPropagation: true },
    category:     { className: '',                                                         stopPropagation: true },
    project:      { className: '',                                                         stopPropagation: true },
    costCenter:   { className: '',                                                         stopPropagation: true },
    date:         { className: 'text-center text-sm font-normal text-gray-500 whitespace-nowrap' },
    amount:       { className: 'text-right text-sm font-medium whitespace-nowrap' },
};

// Colunas da tabela de Lançamentos Internos na aba Pendentes (visualização em linha).
// sortable:true só nas colunas que o campo de ordenação da toolbar (internalSortField) suporta.
export const PENDING_INTERNAL_COLUMNS: ColumnConfig[] = [
    { key: 'description',  label: 'Descrição',            sortable: true  },
    { key: 'client',       label: 'Cliente',              sortable: true  },
    { key: 'creditor',     label: 'Credor',               sortable: true  },
    { key: 'category',     label: 'Categoria',            sortable: true  },
    { key: 'project',      label: 'Obra',                 sortable: false },
    { key: 'costCenter',   label: 'Centro de Custo',      sortable: false },
    { key: 'date',         label: 'Data',                 sortable: true  },
    { key: 'amount',       label: 'Valor',                sortable: true  },
    { key: 'actions',      label: 'Ações',                sortable: false },
];

export const DEFAULT_PENDING_INTERNAL_COL_WIDTHS: Record<string, number> = {
    description: 220,
    client: 130,
    creditor: 130,
    category: 140,
    project: 120,
    costCenter: 159,
    date: 100,
    amount: 130,
    actions: 160,
};

// Header por coluna — 'client'/'creditor' não levam sortField aqui porque a coluna
// ordena por um campo composto ('entity' → 'party', ver internalSortField no
// componente) tratado à parte na renderização do <thead>, não pelo mapeamento
// genérico das demais colunas.
export const PENDING_INTERNAL_COLUMN_HEADERS: Record<string, { label: string; className: string; sortField?: InternalSortField }> = {
    description: { label: 'Descrição',       sortField: 'description', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    client:      { label: 'Cliente',                                    className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    creditor:    { label: 'Credor',                                     className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    category:    { label: 'Categoria',       sortField: 'category',     className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    project:     { label: 'Obra',                                       className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    costCenter:  { label: 'Centro de Custo',                            className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    date:        { label: 'Data',            sortField: 'date',         className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    amount:      { label: 'Valor',           sortField: 'amount',       className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
};

// Classes específicas por coluna do <td> — base comum "px-6 {cellPad} border-r
// border-gray-100" é montada na renderização da linha.
export const PENDING_INTERNAL_TD_CLASS: Record<string, string> = {
    description: '',
    client:      'text-sm font-normal text-gray-700 truncate max-w-[160px]',
    creditor:    'text-sm font-normal text-gray-700 truncate max-w-[160px]',
    category:    '',
    project:     'text-sm font-normal text-sky-700 truncate max-w-[110px]',
    costCenter:  'text-sm font-normal text-violet-700 truncate max-w-[130px]',
    date:        'text-center text-sm font-normal text-gray-500 whitespace-nowrap',
    amount:      'text-right text-sm font-medium text-gray-900 whitespace-nowrap',
};

// Larguras de coluna da tabela de Extrato — ajustáveis pelo usuário (arraste a borda
// direita do cabeçalho); persistidas em localStorage. Duplo clique restaura o padrão.
export const DEFAULT_STATEMENT_COL_WIDTHS: Record<string, number> = {
    description: 260,
    client: 160,
    creditor: 160,
    category: 160,
    project: 160,
    costCenter: 179,
    date: 110,
    amount: 130,
    status: 150,
    actions: 90,
};

// Status simples colorido (guia UI/UX seção 8) — sem pílula/fundo/uppercase.
export const STATEMENT_STATUS_LABELS: Partial<Record<BankTransactionStatus, string>> = {
    IMPORTED: 'Importado',
    NORMALIZED: 'Normalizado',
    CONFIRMED: 'Confirmado',
    MATCHED: 'Conciliado',
    LOCKED: 'Período fechado',
    IGNORED: 'Ignorado',
    TRANSFER: 'Transferência entre contas',
};
export const STATEMENT_STATUS_COLORS: Partial<Record<BankTransactionStatus, string>> = {
    IMPORTED: 'text-gray-500',
    NORMALIZED: 'text-gray-600',
    CONFIRMED: 'text-blue-700',
    MATCHED: 'text-emerald-700',
    LOCKED: 'text-gray-500',
    IGNORED: 'text-gray-400',
    TRANSFER: 'text-indigo-700',
};


// Conteúdo de cada <td> da tabela de Extrato (aba "Extrato Bancário"), por coluna —
// extraído para função pura para que o <tbody> possa mapear
// `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de repetir um
// bloco condicional fixo por coluna. `ctx` reúne o que a célula precisa e que só
// existe dentro do componente (opções de <select>, handlers, resolução de nome).
export interface StatementRowCtx {
    cpRegistered: boolean;
    clienteOptions: LazyOption[];
    credorOptions: LazyOption[];
    categoryOptions: LazyOption[];
    projectOptions: LazyOption[];
    costCenterOptions: LazyOption[];
    projectName: (id?: string | null) => string | null;
    costCenterName: (id?: string | null) => string | null;
    onUpdateCounterparty: (id: string, v: string) => void;
    onUpdateCategory: (id: string, v: string) => void;
    onUpdateProject: (id: string, v: string) => void;
    onUpdateCostCenter: (id: string, v: string) => void;
    onRegisterEntity: (tx: BankTransaction) => void;
    onRejectRule: (id: string) => void;
    onConfirmMatch: (bankTxId: string, internalTxId?: string) => void;
}

export function renderStatementCell(key: string, tx: BankTransaction, ctx: StatementRowCtx): React.ReactNode {
    switch (key) {
        case 'description':
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {tx.direction === 'DEBIT' ? <ArrowRightLeft className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </div>
                    <p className="truncate" title={tx.description_normalized || tx.description_raw}>{tx.description_normalized || tx.description_raw}</p>
                </div>
            );
        case 'client':
            return tx.direction === 'CREDIT' ? (
                <div className="flex items-center gap-1.5 min-w-0">
                    <LazySelect
                        value={tx.counterparty_name || ''}
                        currentLabel={tx.counterparty_name || ''}
                        onChange={(v) => ctx.onUpdateCounterparty(tx.id, v)}
                        options={ctx.clienteOptions}
                        placeholder="— selecionar"
                        className={`text-sm font-normal border-b border-dashed bg-transparent focus:outline-none cursor-pointer flex-1 min-w-0 truncate ${tx.counterparty_name ? 'text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200'}`}
                    />
                    {!ctx.cpRegistered && (
                        <button
                            onClick={() => ctx.onRegisterEntity(tx)}
                            className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shrink-0"
                            title="Cadastrar cliente a partir do extrato"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            ) : (
                <span className="text-gray-300">—</span>
            );
        case 'creditor':
            return tx.direction === 'DEBIT' ? (
                <div className="flex items-center gap-1.5 min-w-0">
                    <LazySelect
                        value={tx.counterparty_name || ''}
                        currentLabel={tx.counterparty_name || ''}
                        onChange={(v) => ctx.onUpdateCounterparty(tx.id, v)}
                        options={ctx.credorOptions}
                        placeholder="— selecionar"
                        className={`text-sm font-normal border-b border-dashed bg-transparent focus:outline-none cursor-pointer flex-1 min-w-0 truncate ${tx.counterparty_name ? 'text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200'}`}
                    />
                    {!ctx.cpRegistered && (
                        <button
                            onClick={() => ctx.onRegisterEntity(tx)}
                            className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shrink-0"
                            title="Cadastrar credor a partir do extrato"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            ) : (
                <span className="text-gray-300">—</span>
            );
        case 'category':
            return (
                <LazySelect
                    value={tx.category || ''}
                    currentLabel={tx.category || ''}
                    onChange={(v) => ctx.onUpdateCategory(tx.id, v)}
                    options={ctx.categoryOptions}
                    placeholder="Categoria"
                    className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${tx.category ? 'text-gray-900 bg-gray-50 border-gray-100' : 'text-gray-400 bg-white border-dashed border-gray-200'}`}
                />
            );
        case 'project':
            return (
                <LazySelect
                    value={tx.project_id || ''}
                    currentLabel={ctx.projectName(tx.project_id) || ''}
                    onChange={(v) => ctx.onUpdateProject(tx.id, v)}
                    options={ctx.projectOptions}
                    placeholder="Obra"
                    className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${tx.project_id ? 'text-gray-900 bg-blue-50 border-blue-100' : 'text-gray-400 bg-white border-dashed border-gray-200'}`}
                />
            );
        case 'costCenter':
            return (
                <LazySelect
                    value={tx.cost_center_id || ''}
                    currentLabel={ctx.costCenterName(tx.cost_center_id) || ''}
                    onChange={(v) => ctx.onUpdateCostCenter(tx.id, v)}
                    options={ctx.costCenterOptions}
                    placeholder="Centro de Custo"
                    className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${tx.cost_center_id ? 'text-gray-900 bg-violet-50 border-violet-100' : 'text-gray-400 bg-white border-dashed border-gray-200'}`}
                />
            );
        case 'date':
            return formatDateBR(tx.transaction_date);
        case 'amount':
            return (
                <span className={tx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}>
                    {tx.direction === 'DEBIT' ? '-' : '+'} {formatMoney(tx.amount)}
                </span>
            );
        case 'status':
            return tx.status === 'RULE_APPLIED' ? (
                <div className="flex items-center justify-center gap-1.5">
                    <button
                        onClick={() => ctx.onRejectRule(tx.id)}
                        className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 px-2 py-1 rounded-lg transition-all"
                        title="Rejeitar Automático"
                    >
                        <X className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => ctx.onConfirmMatch(tx.id)}
                        className="text-xs font-semibold text-white bg-purple-600 px-3 py-1 rounded-lg hover:bg-purple-700 transition-all"
                    >
                        Aceitar
                    </button>
                </div>
            ) : (
                <span className={`text-sm font-normal ${STATEMENT_STATUS_COLORS[tx.status] || 'text-gray-600'}`}>
                    {STATEMENT_STATUS_LABELS[tx.status] || tx.status}
                </span>
            );
        default:
            return null;
    }
}

// Conteúdo de cada <td> da tabela de Pendentes › Extrato Bancário, por coluna —
// mesmo motivo de renderStatementCell acima.
export interface PendingBankRowCtx {
    clienteOptions: LazyOption[];
    credorOptions: LazyOption[];
    categoryOptions: LazyOption[];
    projectOptions: LazyOption[];
    costCenterOptions: LazyOption[];
    projectName: (id?: string | null) => string | null;
    costCenterName: (id?: string | null) => string | null;
    onUpdateCounterparty: (id: string, v: string) => void;
    onUpdateCategory: (id: string, v: string) => void;
    onUpdateProject: (id: string, v: string) => void;
    onUpdateCostCenter: (id: string, v: string) => void;
}

export function renderPendingBankCell(key: string, tx: BankTransaction, ctx: PendingBankRowCtx): React.ReactNode {
    switch (key) {
        case 'counterparty':
            return (
                <LazySelect
                    value={tx.counterparty_name || ''}
                    currentLabel={tx.counterparty_name || ''}
                    onChange={(v) => ctx.onUpdateCounterparty(tx.id, v)}
                    options={tx.direction === 'DEBIT' ? ctx.credorOptions : ctx.clienteOptions}
                    placeholder={tx.direction === 'DEBIT' ? 'Credor' : 'Cliente'}
                    className={`text-sm font-normal bg-transparent focus:outline-none cursor-pointer w-full ${tx.counterparty_name ? 'text-gray-700' : 'text-gray-400'}`}
                />
            );
        case 'category':
            return (
                <LazySelect
                    value={tx.category || ''}
                    currentLabel={tx.category || ''}
                    onChange={(v) => ctx.onUpdateCategory(tx.id, v)}
                    options={ctx.categoryOptions}
                    placeholder="—"
                    className={`text-sm font-normal bg-transparent focus:outline-none cursor-pointer w-full ${tx.category ? 'text-gray-700' : 'text-gray-400'}`}
                />
            );
        case 'project':
            return (
                <LazySelect
                    value={tx.project_id || ''}
                    currentLabel={ctx.projectName(tx.project_id) || ''}
                    onChange={(v) => ctx.onUpdateProject(tx.id, v)}
                    options={ctx.projectOptions}
                    placeholder="—"
                    className={`text-sm font-normal bg-transparent focus:outline-none cursor-pointer w-full ${tx.project_id ? 'text-gray-700' : 'text-gray-400'}`}
                />
            );
        case 'costCenter':
            return (
                <LazySelect
                    value={tx.cost_center_id || ''}
                    currentLabel={ctx.costCenterName(tx.cost_center_id) || ''}
                    onChange={(v) => ctx.onUpdateCostCenter(tx.id, v)}
                    options={ctx.costCenterOptions}
                    placeholder="—"
                    className={`text-sm font-normal bg-transparent focus:outline-none cursor-pointer w-full ${tx.cost_center_id ? 'text-gray-700' : 'text-gray-400'}`}
                />
            );
        case 'date':
            return formatDateBR(tx.transaction_date);
        case 'amount':
            return (
                <span className={tx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}>
                    {tx.direction === 'DEBIT' ? '-' : '+'} {formatMoney(tx.amount)}
                </span>
            );
        default:
            return null;
    }
}

// Conteúdo de cada <td> da tabela de Pendentes › Lançamentos Internos, por coluna —
// mesmo motivo de renderStatementCell acima.
export interface PendingInternalRowCtx {
    getSourceMeta: (ss?: string) => { label: string; color: string } | null;
    getOriginLink: (tx: InternalTransaction) => { view: string; ref: string } | null;
    goToOrigin: (tx: InternalTransaction) => void;
    txCode: (tx: InternalTransaction) => string | null;
    displayTitle: (tx: InternalTransaction) => string;
    displayPartyName: (tx: InternalTransaction) => string | null;
    displayDate: (tx: InternalTransaction) => string;
    projectName: (id?: string | null) => string | null;
    costCenterName: (id?: string | null) => string | null;
    categoryOptions: LazyOption[];
    onUpdateCategory: (id: string, v: string) => void;
}

export function renderPendingInternalCell(key: string, tx: InternalTransaction, ctx: PendingInternalRowCtx): React.ReactNode {
    switch (key) {
        case 'description': {
            const originMeta = ctx.getSourceMeta(tx.source_system);
            const originLink = ctx.getOriginLink(tx);
            const originTextColor = originMeta?.color.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-normal text-gray-900 truncate" title={ctx.displayTitle(tx)}>
                        {ctx.displayTitle(tx)}
                    </p>
                    {ctx.txCode(tx) && (
                        <span title="Código de origem" className="shrink-0 text-xs font-normal text-gray-400">
                            Nº {ctx.txCode(tx)}
                        </span>
                    )}
                    {originMeta && (
                        originLink ? (
                            <button
                                onClick={() => ctx.goToOrigin(tx)}
                                title={`Abrir em ${originMeta.label}`}
                                className={`shrink-0 flex items-center gap-1 text-xs font-normal hover:underline cursor-pointer ${originTextColor}`}
                            >
                                {originMeta.label}
                                <ExternalLink className="w-3 h-3" />
                            </button>
                        ) : (
                            <span className={`shrink-0 text-xs font-normal ${originTextColor}`}>{originMeta.label}</span>
                        )
                    )}
                </div>
            );
        }
        case 'client':
            return tx.party_type === 'CLIENT' || tx.direction === 'CREDIT'
                ? (ctx.displayPartyName(tx) || ctx.getSourceMeta(tx.source_system)?.label || <span className="text-gray-300">—</span>)
                : <span className="text-gray-300">—</span>;
        case 'creditor':
            return !(tx.party_type === 'CLIENT' || tx.direction === 'CREDIT')
                ? (ctx.displayPartyName(tx) || ctx.getSourceMeta(tx.source_system)?.label || <span className="text-gray-300">—</span>)
                : <span className="text-gray-300">—</span>;
        case 'category':
            return (
                <LazySelect
                    value={tx.category || ''}
                    currentLabel={tx.category || ''}
                    onChange={(v) => ctx.onUpdateCategory(tx.id, v)}
                    options={ctx.categoryOptions}
                    placeholder="—"
                    className={`text-sm font-normal bg-transparent focus:outline-none cursor-pointer w-full ${tx.category ? 'text-gray-700' : 'text-gray-400'}`}
                />
            );
        case 'project':
            return ctx.projectName(tx.project_id) || <span className="text-gray-300">—</span>;
        case 'costCenter':
            return ctx.costCenterName(tx.cost_center_id) || <span className="text-gray-300">—</span>;
        case 'date':
            return formatDateBR(ctx.displayDate(tx));
        case 'amount':
            return formatMoney(tx.amount);
        default:
            return null;
    }
}
