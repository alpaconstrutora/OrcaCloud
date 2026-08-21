// components/inventory/StockItemImportModal.tsx — importar itens para o catálogo do Almoxarifado
//
// Três origens (pedido do usuário): base de dados (SINAPI/Base Própria),
// obra/orçamento existente ("itens importados de obras antigas") e planilha
// Excel (obras que nunca entraram no sistema). Todas convergem numa única
// pré-visualização antes de confirmar. Ver
// docs/planos/2026-08-21-almoxarifado-cadastro-de-itens.md.
import React from 'react';
import ExcelJS from 'exceljs';
import {
    X, Search, FileSpreadsheet, Upload, Loader2, Package, Trash2,
    CheckCircle2, AlertCircle, Database, FolderOpen,
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';
import { projectService } from '../../services/projectService';
import { useStore } from '../../store/useStore';
import { onlyClassifications } from '../../utils/projectClassification';
import DatabasePickerModal from '../DatabasePickerModal';
import BudgetPickerModal from '../BudgetPickerModal';
import { SinapiItem, SinapiType, BudgetEntry } from '../../types';
import type { StockItem, StockItemImportRow, Warehouse } from '../../types/inventory';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    organizationId: string;
    existingItems: StockItem[];
    warehouses: Warehouse[];
    onImported: () => void;
}

type SourceTab = 'catalogo' | 'orcamento' | 'planilha';

const rowKey = (r: StockItemImportRow) => (r.inputCode ? `code:${r.inputCode}` : `desc:${r.inputDescription.toLowerCase()}|${r.inputUnit.toLowerCase()}`);

const StockItemImportModal: React.FC<Props> = ({ isOpen, onClose, organizationId, existingItems, warehouses, onImported }) => {
    const { allProjects } = useStore();
    const projectOptions = React.useMemo(
        () => onlyClassifications(allProjects, 'OBRA', 'ORCAMENTO').sort((a, b) => a.name.localeCompare(b.name)),
        [allProjects]
    );

    const [source, setSource] = React.useState<SourceTab>('catalogo');
    const [pendingRows, setPendingRows] = React.useState<StockItemImportRow[]>([]);

    // (a) base de dados
    const [dbPickerOpen, setDbPickerOpen] = React.useState(false);

    // (b) obra/orçamento
    const [selectedProjectId, setSelectedProjectId] = React.useState('');
    const [projectBudget, setProjectBudget] = React.useState<BudgetEntry[] | null>(null);
    const [loadingProject, setLoadingProject] = React.useState(false);
    const [budgetPickerOpen, setBudgetPickerOpen] = React.useState(false);
    const [skippedNonInsumo, setSkippedNonInsumo] = React.useState(0);

    // (c) planilha
    const [file, setFile] = React.useState<File | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [parseError, setParseError] = React.useState('');
    const [launchInitialStock, setLaunchInitialStock] = React.useState(false);
    const [initialStockWarehouseId, setInitialStockWarehouseId] = React.useState('');

    // importação
    const [importing, setImporting] = React.useState(false);
    const [importError, setImportError] = React.useState('');
    const [importSummary, setImportSummary] = React.useState<{ created: number; updated: number; skipped: number } | null>(null);

    React.useEffect(() => {
        if (!isOpen) {
            setSource('catalogo');
            setPendingRows([]);
            setSelectedProjectId('');
            setProjectBudget(null);
            setFile(null);
            setParseError('');
            setLaunchInitialStock(false);
            setInitialStockWarehouseId('');
            setImportError('');
            setImportSummary(null);
            setSkippedNonInsumo(0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const existingCodes = new Set(existingItems.map(i => i.inputCode));

    const addRows = (rows: StockItemImportRow[]) => {
        setPendingRows(prev => {
            const seen = new Set(prev.map(rowKey));
            const next = [...prev];
            for (const r of rows) {
                const k = rowKey(r);
                if (!seen.has(k)) { seen.add(k); next.push(r); }
            }
            return next;
        });
    };

    const removeRow = (idx: number) => setPendingRows(prev => prev.filter((_, i) => i !== idx));

    // ── (a) base de dados ────────────────────────────────────────────────────
    const handleDbSelectMany = (items: SinapiItem[]) => {
        addRows(items.map(item => ({
            inputCode: item.code,
            inputDescription: item.description,
            inputUnit: item.unit,
            category: item.category,
            unitCostHint: item.price || undefined,
            source: 'catalogo' as const,
        })));
    };

    // ── (b) obra / orçamento ─────────────────────────────────────────────────
    const loadProjectBudget = async (projectId: string) => {
        setSelectedProjectId(projectId);
        setProjectBudget(null);
        if (!projectId) return;
        setLoadingProject(true);
        try {
            let data = await projectService.loadProject(projectId);
            if ((!data?.budget || data.budget.length === 0) && data?.settings?.linkedProjectId) {
                const linked = await projectService.loadProject(data.settings.linkedProjectId);
                if (linked?.budget?.length > 0) data = { ...data, budget: linked.budget };
            }
            setProjectBudget(data?.budget ?? []);
        } catch {
            setProjectBudget([]);
        } finally {
            setLoadingProject(false);
        }
    };

    const handleBudgetSelect = (entries: BudgetEntry[]) => {
        // Almoxarifado guarda insumo, não serviço/composição. BudgetPickerModal já
        // explode composição escolhida individualmente (MaterialSelectionModal
        // interno) — o filtro aqui só protege a seleção em lote de grupo/etapa,
        // que pode trazer tipos mistos sem passar pela explosão.
        const insumos = entries.filter(e => e.sinapiItem?.type === SinapiType.INPUT);
        setSkippedNonInsumo(s => s + (entries.length - insumos.length));
        addRows(insumos.map(e => ({
            inputCode: e.sinapiItem.code,
            inputDescription: e.sinapiItem.description,
            inputUnit: e.sinapiItem.unit,
            category: typeof e.sinapiItem.category === 'string' ? e.sinapiItem.category : undefined,
            unitCostHint: e.sinapiItem.price || undefined,
            source: 'orcamento' as const,
            originProjectId: selectedProjectId,
        })));
        setBudgetPickerOpen(false);
    };

    // ── (c) planilha ─────────────────────────────────────────────────────────
    const parseSheet = async (f: File) => {
        setParseError('');
        try {
            const buf = await f.arrayBuffer();
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const ws = wb.worksheets[0];
            const rows: StockItemImportRow[] = [];
            ws.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // cabeçalho
                const code = row.getCell(1).text?.trim();
                const description = row.getCell(2).text?.trim();
                const unit = row.getCell(3).text?.trim();
                const category = row.getCell(4).text?.trim();
                const costText = (row.getCell(5).text ?? '').trim().replace(/^R\$\s?/, '').replace(/\./g, '').replace(',', '.');
                const cost = costText ? parseFloat(costText) : NaN;
                const qtyText = (row.getCell(6).text ?? '').trim().replace(',', '.');
                const qty = qtyText ? parseFloat(qtyText) : NaN;

                if (!description || !unit) return; // mínimo obrigatório
                rows.push({
                    inputCode: code || undefined,
                    inputDescription: description,
                    inputUnit: unit,
                    category: category || undefined,
                    unitCostHint: !isNaN(cost) ? cost : undefined,
                    initialQuantity: !isNaN(qty) && qty > 0 ? qty : undefined,
                    source: 'planilha' as const,
                });
            });
            if (rows.length === 0) { setParseError('Nenhuma linha válida encontrada. Confira se a planilha tem Descrição e Unidade.'); return; }
            addRows(rows);
        } catch {
            setParseError('Erro ao ler o arquivo. Verifique se é um .xlsx válido.');
        }
    };

    const validateAndSetFile = (f: File) => {
        if (!f.name.endsWith('.xlsx')) { setParseError('Selecione um arquivo Excel (.xlsx).'); return; }
        setFile(f);
        parseSheet(f);
    };

    const hasInitialQuantities = pendingRows.some(r => r.initialQuantity);

    // ── confirmação ───────────────────────────────────────────────────────────
    const handleImport = async () => {
        if (pendingRows.length === 0) return;
        if (hasInitialQuantities && launchInitialStock && !initialStockWarehouseId) {
            setImportError('Escolha o almoxarifado para lançar o saldo inicial.');
            return;
        }
        setImporting(true);
        setImportError('');
        try {
            const result = await inventoryService.importStockItems(organizationId, pendingRows);
            if (launchInitialStock && initialStockWarehouseId) {
                for (const r of result.results) {
                    const qty = r.row.initialQuantity;
                    if (r.status !== 'error' && r.item && qty && qty > 0) {
                        await inventoryService.createMovement(organizationId, {
                            warehouseId: initialStockWarehouseId,
                            inputCode: r.item.inputCode,
                            inputDescription: r.item.inputDescription,
                            inputUnit: r.item.inputUnit,
                            type: 'in',
                            quantity: qty,
                            unitCost: r.row.unitCostHint,
                            notes: 'Saldo inicial importado',
                        });
                    }
                }
            }
            setImportSummary({ created: result.created, updated: result.updated, skipped: result.skipped });
            onImported();
        } catch (e: unknown) {
            setImportError((e as Error).message);
        } finally {
            setImporting(false);
        }
    };

    const TABS: Array<{ key: SourceTab; label: string; icon: React.ReactNode }> = [
        { key: 'catalogo', label: 'Base de dados', icon: <Database className="w-4 h-4" /> },
        { key: 'orcamento', label: 'Obra / Orçamento', icon: <FolderOpen className="w-4 h-4" /> },
        { key: 'planilha', label: 'Planilha', icon: <FileSpreadsheet className="w-4 h-4" /> },
    ];

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[88vh] flex flex-col overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Importar Itens</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Cadastre vários itens de uma vez no catálogo do almoxarifado.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                {importSummary ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                        <div className="text-center">
                            <p className="text-lg font-bold text-gray-900">Importação concluída</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {importSummary.created} {importSummary.created === 1 ? 'item criado' : 'itens criados'}
                                {importSummary.updated > 0 && `, ${importSummary.updated} atualizado${importSummary.updated === 1 ? '' : 's'}`}
                                {importSummary.skipped > 0 && `, ${importSummary.skipped} ignorado${importSummary.skipped === 1 ? '' : 's'}`}.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                        >
                            Fechar
                        </button>
                    </div>
                ) : (
                <>
                <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 bg-white shrink-0">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setSource(t.key)}
                            className={`flex items-center gap-2 px-3 h-9 rounded-t-[6px] text-sm font-medium transition-all border-b-2 ${
                                source === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {source === 'catalogo' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">Busque na base SINAPI ou na Base Própria e selecione um ou mais itens.</p>
                            <button
                                onClick={() => setDbPickerOpen(true)}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px]"
                            >
                                <Search className="w-[15px] h-[15px]" />
                                Buscar itens
                            </button>
                        </div>
                    )}

                    {source === 'orcamento' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">Escolha uma obra ou orçamento já cadastrado e selecione os insumos a trazer para o almoxarifado.</p>
                            <select
                                value={selectedProjectId}
                                onChange={e => loadProjectBudget(e.target.value)}
                                className="w-full max-w-md h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            >
                                <option value="">Selecione uma obra ou orçamento...</option>
                                {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>

                            {loadingProject && <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando orçamento...</p>}

                            {projectBudget && !loadingProject && (
                                projectBudget.length === 0 ? (
                                    <p className="text-sm text-gray-400">Este projeto não tem itens de orçamento.</p>
                                ) : (
                                    <button
                                        onClick={() => setBudgetPickerOpen(true)}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px]"
                                    >
                                        <Search className="w-[15px] h-[15px]" />
                                        Selecionar itens do orçamento ({projectBudget.length})
                                    </button>
                                )
                            )}
                            {skippedNonInsumo > 0 && (
                                <p className="text-xs text-amber-600">{skippedNonInsumo} item(ns) de composição/serviço foram ignorados — almoxarifado guarda só insumos.</p>
                            )}
                        </div>
                    )}

                    {source === 'planilha' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">Colunas: <strong>1 Código (opcional)</strong> · <strong>2 Descrição</strong> · <strong>3 Unidade</strong> · <strong>4 Categoria</strong> · <strong>5 Custo unitário (opcional)</strong> · <strong>6 Qtd. saldo inicial (opcional)</strong>.</p>
                            <div
                                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) validateAndSetFile(e.dataTransfer.files[0]); }}
                                className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-[10px] transition-all ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                            >
                                <FileSpreadsheet className="w-8 h-8 text-gray-300" />
                                <p className="text-sm text-gray-500">{file ? file.name : 'Arraste um .xlsx ou clique para escolher'}</p>
                                <label className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px] cursor-pointer">
                                    <Upload className="w-[15px] h-[15px]" />
                                    Escolher arquivo
                                    <input type="file" accept=".xlsx" className="hidden" onChange={e => e.target.files?.[0] && validateAndSetFile(e.target.files[0])} />
                                </label>
                            </div>
                            {parseError && <p className="text-sm text-red-500 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {parseError}</p>}

                            {hasInitialQuantities && (
                                <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 space-y-2">
                                    <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={launchInitialStock} onChange={e => setLaunchInitialStock(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                        Lançar saldo inicial das quantidades da planilha
                                    </label>
                                    {launchInitialStock && (
                                        <select
                                            value={initialStockWarehouseId}
                                            onChange={e => setInitialStockWarehouseId(e.target.value)}
                                            className="w-full max-w-xs h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        >
                                            <option value="">Selecione o almoxarifado...</option>
                                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pré-visualização — comum às três origens */}
                    <div className="border-t border-gray-100 pt-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Pré-visualização ({pendingRows.length} {pendingRows.length === 1 ? 'item' : 'itens'})</p>
                        {pendingRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 bg-gray-50/50 rounded-[10px]">
                                <Package className="w-8 h-8 mb-2 text-gray-300" />
                                <p className="text-sm">Nenhum item selecionado ainda.</p>
                            </div>
                        ) : (
                            <div className="border border-gray-100 rounded-[10px] overflow-hidden">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className="px-4 py-2 border-r border-gray-100">Código</th>
                                            <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                                            <th className="px-4 py-2 border-r border-gray-100">Unidade</th>
                                            <th className="px-4 py-2 border-r border-gray-100">Status</th>
                                            <th className="px-4 py-2 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pendingRows.map((r, idx) => {
                                            const exists = r.inputCode ? existingCodes.has(r.inputCode) : false;
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{r.inputCode || '—'}</td>
                                                    <td className="px-4 py-2 border-r border-gray-100 text-gray-700">{r.inputDescription}</td>
                                                    <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{r.inputUnit}</td>
                                                    <td className="px-4 py-2 border-r border-gray-100">
                                                        <span className={exists ? 'text-amber-700' : 'text-green-700'}>{exists ? 'Já existe' : 'Novo'}</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <button onClick={() => removeRow(idx)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                    {importError ? <p className="text-red-500 text-sm font-medium">{importError}</p> : <span />}
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="h-9 px-3.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-[6px] transition-all">Cancelar</button>
                        <button
                            onClick={handleImport}
                            disabled={pendingRows.length === 0 || importing}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            {importing && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                            {importing ? 'Importando...' : `Importar ${pendingRows.length > 0 ? pendingRows.length : ''}`}
                        </button>
                    </div>
                </div>
                </>
                )}
            </div>

            <DatabasePickerModal
                isOpen={dbPickerOpen}
                onClose={() => setDbPickerOpen(false)}
                onSelect={() => {}}
                multiple
                onSelectMany={handleDbSelectMany}
                title="Buscar itens para o almoxarifado"
                subtitle="Selecione um ou mais itens da base de dados."
                zIndex={120}
            />

            {projectBudget && (
                <BudgetPickerModal
                    isOpen={budgetPickerOpen}
                    onClose={() => setBudgetPickerOpen(false)}
                    onSelect={handleBudgetSelect}
                    budget={projectBudget}
                />
            )}
        </div>
    );
};

export default StockItemImportModal;
