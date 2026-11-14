import React, { useEffect, useMemo, useState } from 'react';
import { Search, MoveHorizontal, Download, X, Link2, Check, Briefcase } from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { parseHashView } from '../../lib/tabRouter';
import {
    groupServiceContractsAnalysis, summarizeServiceRows,
    type ServiceContractsScope, type ServiceRowsSummary,
} from '../../lib/serviceContractAnalysis';
import { serviceContractAnalysisService, type ServiceContractsAnalysisRaw } from '../../services/serviceContractAnalysisService';
import ServiceContractsAnalysisOverview, {
    type ServiceAnalysisLeitura, type ServiceAnalysisDestino,
} from './ServiceContractsAnalysisOverview';

/**
 * Aba Análise de Comercial › Contratos de Serviço — recorte por cliente, duas
 * leituras, linha do tempo, tabela "Por cliente" e exportação. Aos moldes de
 * Venda de Ativos › Análise (`SalesModule.tsx`); plano
 * docs/planos/2026-11-13-contratos-servico-aba-analise.md.
 *
 * Uma consulta, muitos baldes: carrega o bruto uma vez e trocar de cliente ou
 * de leitura não dispara rede.
 */

// ── Tabela "Por cliente" ─────────────────────────────────────────────────────
// Sem coluna de ações: a única ação é recortar a aba, e ela mora no clique da
// linha (§9.1) — mesmo desenho de Venda de Ativos.
const COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Cliente', sortable: true },
    { key: 'contractsCount', label: 'Contratos', sortable: true },
    { key: 'contractedValue', label: 'Carteira contratada', sortable: true },
    { key: 'negotiationValue', label: 'Em negociação', sortable: true },
    { key: 'activeCount', label: 'Vigentes', sortable: true },
    { key: 'expiring90', label: 'Vencem em 90 dias', sortable: true },
    { key: 'variationRate', label: 'Variação por aditivos', sortable: true },
    { key: 'ticket', label: 'Ticket médio', sortable: true },
    { key: 'measured', label: 'Medido', sortable: true },
    { key: 'measuredRate', label: '% medido', sortable: true },
    { key: 'billed', label: 'Lançado em parcelas', sortable: true },
    { key: 'toBill', label: 'Saldo a faturar', sortable: true },
    { key: 'receivableOpen', label: 'A receber', sortable: true },
    { key: 'overdue90', label: 'Vencido > 90 dias', sortable: true },
    { key: 'received', label: 'Recebido', sortable: true },
];
/** Colunas que cada leitura mostra de saída (as outras ficam na engrenagem). */
const VISIVEIS: Record<ServiceAnalysisLeitura, string[]> = {
    comercial: ['name', 'contractsCount', 'contractedValue', 'negotiationValue', 'activeCount', 'expiring90', 'variationRate'],
    financeiro: ['name', 'contractedValue', 'measured', 'measuredRate', 'receivableOpen', 'overdue90', 'received', 'toBill'],
};
const columnsDa = (leitura: ServiceAnalysisLeitura): ColumnConfig[] =>
    COLUMNS.map(c => ({ ...c, defaultHidden: !VISIVEIS[leitura].includes(c.key) }));
const COLUMNS_COMERCIAL = columnsDa('comercial');
const COLUMNS_FINANCEIRO = columnsDa('financeiro');
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    name: 240, contractsCount: 120, contractedValue: 180, negotiationValue: 160, activeCount: 115, expiring90: 170,
    variationRate: 190, ticket: 150, measured: 140, measuredRate: 120, billed: 180, toBill: 160,
    receivableOpen: 140, overdue90: 165, received: 140,
};
const MONEY_KEYS = ['contractedValue', 'negotiationValue', 'ticket', 'measured', 'billed', 'toBill', 'receivableOpen', 'overdue90', 'received'];
const PCT_KEYS = ['variationRate', 'measuredRate'];

const LEITURAS: { id: ServiceAnalysisLeitura; label: string; dica: string }[] = [
    { id: 'comercial', label: 'Comercial', dica: 'Carteira contratada, o que está em negociação, o que vence e quanto os aditivos mexeram' },
    { id: 'financeiro', label: 'Financeiro', dica: 'Quanto foi medido, o que falta receber, o atraso e o saldo a faturar' },
];

const moeda = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct1 = (v: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const variacao = (v: number) =>
    `${v < 0 ? '−' : v > 0 ? '+' : ''}${(Math.abs(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** `—` para "não medido": zero é afirmação, `null` é ausência de base. */
const orDash = (v: number | null | undefined, f: (n: number) => string) => (v == null ? '—' : f(v));

/** Valor de cada coluna (ordenar e exportar leem o MESMO número da célula). */
const valorDa = (key: string, r: ServiceContractsScope): string | number | null => {
    switch (key) {
        case 'name': return r.name;
        case 'contractsCount': return r.contractsCount;
        case 'contractedValue': return r.contractedValue;
        case 'negotiationValue': return r.negotiationValue;
        case 'activeCount': return r.active.count;
        case 'expiring90': return r.expiring90.count;
        case 'variationRate': return r.variationRate;
        case 'ticket': return r.ticket;
        case 'measured': return r.measurement?.measured ?? null;
        case 'measuredRate': return r.measurement?.rate ?? null;
        case 'billed': return r.aging?.billed ?? null;
        case 'toBill': return r.toBill;
        case 'receivableOpen': return r.aging?.totalOpen ?? null;
        case 'overdue90': return r.aging?.over90 ?? null;
        case 'received': return r.aging?.received ?? null;
        default: return null;
    }
};

const textoDa = (key: string, v: string | number | null): string => {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (key === 'variationRate') return variacao(v);
    if (PCT_KEYS.includes(key)) return pct1(v);
    if (MONEY_KEYS.includes(key)) return moeda(v);
    return String(v);
};

const rodapeDa = (key: string, f: ServiceRowsSummary): string | number | null => {
    const valores: Record<string, number | null> = {
        contractsCount: f.contractsCount, contractedValue: f.contractedValue, negotiationValue: f.negotiationValue,
        activeCount: f.activeCount, expiring90: f.expiring90Count, variationRate: f.variationRate, ticket: f.ticket,
        measured: f.measured, measuredRate: f.measuredRate, billed: f.billed, toBill: f.toBill,
        receivableOpen: f.receivableOpen, overdue90: f.overdue90, received: f.received,
    };
    return valores[key] ?? null;
};

/** Recorte lido do link (`#/service-contracts?aba=analise&cli=…&leitura=…`). */
export const linkDaAnaliseServico = (): { cli?: string; leitura?: ServiceAnalysisLeitura } | null => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (q.get('aba') !== 'analise') return null;
    const leitura = q.get('leitura');
    return {
        cli: q.get('cli') ?? undefined,
        leitura: leitura === 'comercial' || leitura === 'financeiro' ? leitura : undefined,
    };
};

type Carga = { estado: 'loading' } | { estado: 'error' } | { estado: 'ready'; raw: ServiceContractsAnalysisRaw };

interface Props {
    onOpenContract: (id: string) => void;
    onToast: (message: string, type?: 'success' | 'error') => void;
}

const ServiceContractsAnalysisTab: React.FC<Props> = ({ onOpenContract, onToast }) => {
    const { orgId } = useOrgContext();
    // Recorte, leitura e detalhamento persistidos: o usuário volta querendo o
    // recorte em que estava (mesma decisão de Locações e Vendas).
    const [clientId, setClientId] = usePersistedState('serviceContracts:analysisClient', 'ALL');
    const [search, setSearch] = usePersistedState('serviceContracts:analysisSearch', '');
    const [leitura, setLeitura] = usePersistedState<ServiceAnalysisLeitura>('serviceContracts:analysisLeitura', 'comercial');
    const [showDetail, setShowDetail] = usePersistedState('serviceContracts:analysisDetail', false);
    const [linkCopiado, setLinkCopiado] = useState(false);
    const [carga, setCarga] = useState<Carga>({ estado: 'loading' });
    const [reload, setReload] = useState(0);

    const columnsComercial = useTableColumns(COLUMNS_COMERCIAL, 'serviceContractsAnalysisColumns:comercial');
    const columnsFinanceiro = useTableColumns(COLUMNS_FINANCEIRO, 'serviceContractsAnalysisColumns:financeiro');
    const tableColumns = leitura === 'financeiro' ? columnsFinanceiro : columnsComercial;
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'serviceContractsAnalysisColWidths');
    const visibleColumns = COLUMNS.filter(c => tableColumns.visibleColumns.includes(c.key));
    const tableTotalWidth = visibleColumns.reduce((sum, c) => sum + cols.getWidth(c.key), 0);

    // Link do recorte: o primeiro efeito LÊ (uma vez, guardado em estado — o
    // StrictMode roda efeitos duas vezes e o de baixo já teria reescrito o
    // endereço); o segundo mantém `?aba=analise&cli=…&leitura=…` em dia por
    // `replaceState`, sem entrada no histórico. Mesmo desenho de Vendas.
    const [linkInicial] = useState(linkDaAnaliseServico);
    useEffect(() => {
        // Link sem `cli` é "Todos os clientes" (Copiar link só escreve `cli`
        // fora de Todos) — não o recorte salvo neste navegador.
        if (linkInicial) setClientId(linkInicial.cli ?? 'ALL');
        if (linkInicial?.leitura) setLeitura(linkInicial.leitura);
        const aoMudarEndereco = () => {
            const link = linkDaAnaliseServico();
            if (!link) return;
            setClientId(link.cli ?? 'ALL');
            if (link.leitura) setLeitura(link.leitura);
        };
        window.addEventListener('hashchange', aoMudarEndereco);
        return () => window.removeEventListener('hashchange', aoMudarEndereco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const vista = parseHashView(window.location.hash);
        if (!vista) return;
        const alvo = `#/${vista}?${new URLSearchParams({
            aba: 'analise',
            ...(clientId !== 'ALL' ? { cli: clientId } : {}),
            leitura,
        }).toString()}`;
        if (window.location.hash !== alvo) window.history.replaceState(null, '', alvo);
    }, [clientId, leitura]);
    // Saindo da aba (Contratos, ou o detalhe de um contrato), o endereço volta a ser só a vista.
    useEffect(() => () => {
        const vista = parseHashView(window.location.hash);
        if (vista && window.location.hash !== `#/${vista}`) window.history.replaceState(null, '', `#/${vista}`);
    }, []);

    // Carga: contratos + parcelas + medições + nomes. Trocar recorte não dispara rede.
    useEffect(() => {
        let alive = true;
        setCarga({ estado: 'loading' });
        serviceContractAnalysisService.load(orgId)
            .then(raw => { if (alive) setCarga({ estado: 'ready', raw }); })
            .catch(() => { if (alive) setCarga({ estado: 'error' }); });
        return () => { alive = false; };
    }, [orgId, reload]);

    const analysis = useMemo(() => carga.estado === 'ready'
        ? groupServiceContractsAnalysis({
            contracts: carga.raw.contracts,
            receivablesByContract: carga.raw.receivablesByContract,
            measurements: carga.raw.measurements,
            clientNames: carga.raw.clientNames,
        })
        : null, [carga]);

    /** O recorte ativo; cliente que sumiu cai no total, não zera a tela. */
    const scope = analysis ? ((clientId !== 'ALL' && analysis.byId.get(clientId)) || analysis.total) : null;
    const isAll = !scope || scope.clientId === 'ALL';

    // Linhas "Por cliente": busca + ordenação pelo cabeçalho. "Não medido" vai
    // para o fim nos dois sentidos — não é o menor valor.
    const rows = useMemo(() => {
        if (!analysis) return [];
        const termo = search.trim().toLowerCase();
        const filtradas = termo ? analysis.rows.filter(r => r.name.toLowerCase().includes(termo)) : analysis.rows;
        const col = tableColumns.sortColumn;
        if (!col) return filtradas;
        const dir = tableColumns.sortDirection;
        return [...filtradas].sort((a, b) => {
            const av = valorDa(col, a);
            const bv = valorDa(col, b);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'string' || typeof bv === 'string') {
                const cmp = String(av).localeCompare(String(bv), 'pt-BR');
                return dir === 'asc' ? cmp : -cmp;
            }
            return dir === 'asc' ? av - bv : bv - av;
        });
    }, [analysis, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Rodapé sobre as linhas VISÍVEIS; ponderado — sem busca, igual ao topo. */
    const footer = useMemo(() => summarizeServiceRows(rows), [rows]);

    const irPara = (destino: ServiceAnalysisDestino) => {
        if (destino === 'contas-a-receber') useStore.getState().setActiveView(destino);
    };

    const copiarLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setLinkCopiado(true);
            window.setTimeout(() => setLinkCopiado(false), 2000);
        } catch {
            onToast('Não foi possível copiar o link — copie da barra de endereço.', 'error');
        }
    };

    // Exporta a tabela como está na tela: colunas visíveis na ordem, linhas
    // filtradas e ordenadas, e a linha de total. Números como NÚMERO; "não
    // medido" como célula vazia, nunca 0.
    const exportar = async () => {
        const XLSX = await import('xlsx');
        const formatoDe = (key: string) => PCT_KEYS.includes(key) ? '0.0%' : MONEY_KEYS.includes(key) ? '"R$" #,##0' : undefined;
        const linhas = [
            ...rows.map(r => visibleColumns.map(c => ({ v: valorDa(c.key, r), z: formatoDe(c.key) }))),
            visibleColumns.map(c => c.key === 'name'
                ? { v: search.trim() ? 'Total das linhas filtradas' : 'Total da carteira', z: undefined }
                : { v: rodapeDa(c.key, footer), z: formatoDe(c.key) }),
        ];
        const ws = XLSX.utils.aoa_to_sheet([visibleColumns.map(c => c.label), ...linhas.map(l => l.map(x => x.v))]);
        linhas.forEach((l, i) => l.forEach((x, j) => {
            const ref = XLSX.utils.encode_cell({ r: i + 1, c: j });
            if (x.v != null && x.z && ws[ref]) ws[ref].z = x.z;
        }));
        ws['!cols'] = visibleColumns.map(c => ({ wch: c.key === 'name' ? 34 : 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Por cliente');
        XLSX.writeFile(wb, `contratos-servico-analise-${leitura}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <>
            {/* Seletor de escopo (§5.3) — decide de QUAL carteira os números
                abaixo falam; por isso vem antes deles. */}
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="service-analysis-client" className="text-xs font-semibold text-slate-500">Cliente</label>
                    <select
                        id="service-analysis-client"
                        value={scope ? clientId : 'ALL'}
                        onChange={e => setClientId(e.target.value)}
                        disabled={!analysis}
                        className="h-9 pl-3 pr-8 max-w-full bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer disabled:cursor-wait"
                    >
                        <option value="ALL">Todos os clientes ({analysis
                            ? `${analysis.total.contractsCount} contrato${analysis.total.contractsCount === 1 ? '' : 's'}`
                            : '…'})</option>
                        {analysis?.rows.map(r => (
                            <option key={r.clientId} value={r.clientId}>
                                {r.name} ({r.contractsCount} contrato{r.contractsCount === 1 ? '' : 's'})
                            </option>
                        ))}
                    </select>
                    <div role="radiogroup" aria-label="Leitura da análise" className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 sm:ml-2">
                        {LEITURAS.map(l => (
                            <button
                                key={l.id}
                                type="button"
                                role="radio"
                                aria-checked={leitura === l.id}
                                onClick={() => setLeitura(l.id)}
                                title={l.dica}
                                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${leitura === l.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    {!isAll && (
                        <button
                            onClick={() => setClientId('ALL')}
                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:text-gray-900 transition-all shrink-0"
                        >
                            <X className="w-4 h-4" />
                            Ver todos os clientes
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={copiarLink}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:text-gray-900 transition-all whitespace-nowrap"
                        title="Copia o endereço desta análise — abre no mesmo cliente e na mesma leitura"
                    >
                        {linkCopiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
                        {linkCopiado ? 'Link copiado' : 'Copiar link'}
                    </button>
                </div>
            </div>

            {carga.estado === 'loading' ? (
                <div className="text-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
            ) : carga.estado === 'error' || !scope || !analysis ? (
                <div role="alert" className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12 px-4">
                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível carregar os contratos de serviço</h3>
                    <p className="text-sm text-gray-500 mb-4">A análise depende dos contratos e das parcelas deles.</p>
                    <button type="button" onClick={() => setReload(n => n + 1)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Tentar de novo</button>
                </div>
            ) : (
                <>
                    {/* KPIs, linha do tempo, gráficos e detalhamento do recorte. A
                        tabela abaixo fecha com eles por construção: os dois saem
                        de `groupServiceContractsAnalysis`. */}
                    <ServiceContractsAnalysisOverview
                        scope={scope}
                        rows={analysis.rows}
                        isAll={isAll}
                        onSelectClient={setClientId}
                        showDetail={showDetail}
                        onToggleDetail={() => setShowDetail(!showDetail)}
                        leitura={leitura}
                        onNavigate={irPara}
                        onOpenContract={onOpenContract}
                    />

                    {/* Tabela por cliente — toolbar acoplada (§5.2). */}
                    {isAll && (
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                            <div className="p-2 border-b border-gray-100 bg-white">
                                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                                    <div className="flex-1 relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente..."
                                            aria-label="Buscar cliente"
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                        <ColumnConfigButton
                                            columns={COLUMNS}
                                            visibleColumns={tableColumns.visibleColumns}
                                            showColumnConfig={tableColumns.showColumnConfig}
                                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                            onToggleColumn={tableColumns.toggleColumn}
                                            onReset={tableColumns.resetColumns}
                                        />
                                        <button
                                            onClick={() => cols.autoFit()}
                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                            title="Ajustar largura das colunas ao conteúdo"
                                            aria-label="Ajustar largura das colunas ao conteúdo"
                                        >
                                            <MoveHorizontal className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={exportar}
                                            disabled={rows.length === 0}
                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={rows.length === 0 ? 'Nada para exportar: nenhuma linha na tabela' : 'Exportar a tabela para Excel (colunas visíveis, na ordem da tela)'}
                                            aria-label="Exportar a tabela para Excel"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {rows.length === 0 ? (
                                <div className="text-center py-12">
                                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum cliente encontrado</h3>
                                    <p className="text-sm text-gray-500">
                                        {search ? 'Tente ajustar a busca.' : 'Nenhum contrato de serviço cadastrado nesta organização.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-auto max-h-[70vh]">
                                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                                        <caption className="sr-only">Análise dos contratos de serviço por cliente — escolha um cliente para recortar a aba</caption>
                                        <colgroup>
                                            {visibleColumns.map(c => (
                                                <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                                            ))}
                                            {/* Espaçador (§6.1.1). */}
                                            <col />
                                        </colgroup>
                                        <thead>
                                            <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                                {visibleColumns.map(c => (
                                                    <SortableHeader
                                                        key={c.key}
                                                        colKey={c.key}
                                                        label={c.label}
                                                        uppercase={false}
                                                        sortColumn={tableColumns.sortColumn}
                                                        sortDirection={tableColumns.sortDirection}
                                                        onSort={tableColumns.handleColumnSort}
                                                        className={`px-6 py-2 border-r border-gray-100 overflow-hidden ${c.key === 'name' ? 'sticky left-0 z-20 bg-white' : ''}`}
                                                    >
                                                        <cols.ResizeHandle colKey={c.key} />
                                                    </SortableHeader>
                                                ))}
                                                <th aria-hidden="true" className="border-r border-gray-100"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {rows.map(row => (
                                                // Clique na linha = recortar a aba no cliente (§9.1).
                                                <tr
                                                    key={row.clientId}
                                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                    onClick={() => setClientId(row.clientId)}
                                                    title={`Ver a análise de ${row.name}`}
                                                >
                                                    {visibleColumns.map(c => (
                                                        <td
                                                            key={c.key}
                                                            className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm ${
                                                                c.key === 'name' ? 'sticky left-0 z-[1] bg-white group-hover:bg-[#f7fbff] ' : ''
                                                            }${
                                                                MONEY_KEYS.includes(c.key)
                                                                    ? 'font-medium text-gray-800'
                                                                    : c.key === 'name'
                                                                        ? 'font-normal text-gray-700 truncate'
                                                                        : 'font-normal text-gray-600'
                                                            }`}
                                                        >
                                                            {c.key === 'name' ? (
                                                                // O teclado e o leitor de tela chegam pelo nome, que é botão.
                                                                <button
                                                                    type="button"
                                                                    onClick={e => { e.stopPropagation(); setClientId(row.clientId); }}
                                                                    className="max-w-full truncate text-left rounded-[4px] hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                                                    aria-label={`Ver a análise de ${row.name}`}
                                                                >
                                                                    {row.name}
                                                                </button>
                                                            ) : textoDa(c.key, valorDa(c.key, row))}
                                                        </td>
                                                    ))}
                                                    <td aria-hidden="true"></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* Rodapé: somas e taxas PONDERADAS sobre as linhas
                                            visíveis — sem busca, igual aos indicadores do topo. */}
                                        <tfoot>
                                            <tr className="border-t border-gray-100 bg-gray-50/80">
                                                {visibleColumns.map((c, idx) => (
                                                    <td
                                                        key={c.key}
                                                        className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm ${c.key === 'name' ? 'sticky left-0 z-[1] bg-gray-50 ' : ''}${
                                                            MONEY_KEYS.includes(c.key) ? 'font-medium text-gray-800' : 'font-normal text-gray-500'
                                                        }`}
                                                    >
                                                        {idx === 0
                                                            ? (search.trim() ? 'Total das linhas filtradas' : 'Total da carteira')
                                                            : textoDa(c.key, rodapeDa(c.key, footer))}
                                                    </td>
                                                ))}
                                                <td aria-hidden="true"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default ServiceContractsAnalysisTab;
