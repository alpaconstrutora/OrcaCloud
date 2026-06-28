import React from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabase';

interface SinapiImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const UFS = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
    'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];
const DEFAULT_UF = 'SP';
const BATCH = 200;

function cellValue(v: unknown): string | number {
    if (v == null) return '';
    if (typeof v === 'object' && v !== null) {
        if ('result' in v) return cellValue((v as { result: unknown }).result);
        if ('text' in v) return String((v as { text: unknown }).text);
    }
    return v as string | number;
}
function str(v: unknown): string { return String(cellValue(v) ?? '').trim(); }
function num(v: unknown): number {
    const n = Number(cellValue(v));
    return Number.isFinite(n) ? n : 0;
}

function sheetToObjects(ws: ExcelJS.Worksheet): Record<string, unknown>[] {
    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        headers[col] = str(cell.value).toLowerCase();
    });
    const rows: Record<string, unknown>[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const obj: Record<string, unknown> = {};
        let hasData = false;
        row.eachCell({ includeEmpty: false }, (cell, col) => {
            const key = headers[col];
            if (!key) return;
            obj[key] = cell.value;
            hasData = true;
        });
        if (hasData) rows.push(obj);
    }
    return rows;
}

interface ParsedResult {
    items: Record<string, unknown>[];
    itemCount: number;
    compositionCount: number;
}

async function parseWorkbook(file: File, referenceDate: string): Promise<ParsedResult> {
    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);

    const itensWs = wb.getWorksheet('Itens');
    const compWs = wb.getWorksheet('Composicoes');
    if (!itensWs) throw new Error('Aba "Itens" não encontrada. Use o template SINAPI.');

    // Composições: agrupa filhos por código pai
    const compByParent = new Map<string, unknown[]>();
    if (compWs) {
        for (const row of sheetToObjects(compWs)) {
            const parent = str(row['codigo_pai']);
            const childCode = str(row['codigo_item']);
            if (!parent || !childCode) continue;
            if (!compByParent.has(parent)) compByParent.set(parent, []);
            compByParent.get(parent)!.push({
                code: childCode,
                description: str(row['descricao_item']),
                unit: str(row['unidade_item']),
                type: str(row['tipo_item']).toUpperCase() || 'INPUT',
                quantity: num(row['coeficiente']),
            });
        }
    }

    const itemRows = sheetToObjects(itensWs);
    const items: Record<string, unknown>[] = [];

    for (const row of itemRows) {
        const code = str(row['codigo']);
        if (!code) continue;

        const prices: Record<string, { com: number; sem: number }> = {};
        for (const uf of UFS) {
            prices[uf] = {
                sem: num(row[`${uf.toLowerCase()}_sem`]),
                com: num(row[`${uf.toLowerCase()}_com`]),
            };
        }
        let price = prices[DEFAULT_UF]?.sem || prices[DEFAULT_UF]?.com || 0;
        if (!price) {
            price = UFS.map(uf => prices[uf].sem || prices[uf].com).find(v => v > 0) ?? 0;
        }

        const composition = compByParent.get(code);
        items.push({
            code,
            reference_date: referenceDate,
            description: str(row['descricao']),
            unit: str(row['unidade']),
            type: str(row['tipo']).toUpperCase() || 'INPUT',
            nature: str(row['natureza']) || null,
            category: str(row['grupo']) || null,
            price,
            prices,
            composition: composition ? JSON.stringify(composition) : null,
            source: 'SINAPI',
            origin: 'SINAPI',
        });
    }

    if (items.length === 0) throw new Error('Nenhum item válido encontrado na aba Itens.');
    return { items, itemCount: items.length, compositionCount: compByParent.size };
}

const SinapiImportModal: React.FC<SinapiImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [file, setFile] = React.useState<File | null>(null);
    const [referenceMonth, setReferenceMonth] = React.useState('');   // 'YYYY-MM' from input[type=month]
    const [stage, setStage] = React.useState<'pick' | 'preview' | 'importing' | 'done' | 'error'>('pick');
    const [parsed, setParsed] = React.useState<ParsedResult | null>(null);
    const [parseError, setParseError] = React.useState<string | null>(null);
    const [progress, setProgress] = React.useState({ current: 0, total: 0 });
    const [importError, setImportError] = React.useState<string | null>(null);

    if (!isOpen) return null;

    // Derive reference_date and label from input[type=month]
    const referenceDate = referenceMonth ? `${referenceMonth}-01` : '';
    const label = referenceMonth
        ? (() => { const [y, m] = referenceMonth.split('-'); return `${m}/${y}`; })()
        : '';

    const reset = () => {
        setFile(null);
        setReferenceMonth('');
        setStage('pick');
        setParsed(null);
        setParseError(null);
        setProgress({ current: 0, total: 0 });
        setImportError(null);
    };

    const handleClose = () => { reset(); onClose(); };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) acceptFile(f);
    };

    const acceptFile = (f: File) => {
        if (!f.name.endsWith('.xlsx')) {
            setParseError('Selecione um arquivo .xlsx (template SINAPI).');
            return;
        }
        setParseError(null);
        setFile(f);
        setStage('pick');
    };

    const handleParse = async () => {
        if (!file || !referenceDate) return;
        setParseError(null);
        setStage('preview');
        try {
            const result = await parseWorkbook(file, referenceDate);
            setParsed(result);
        } catch (e: unknown) {
            setParseError(e instanceof Error ? e.message : String(e));
            setStage('pick');
        }
    };

    const handleImport = async () => {
        if (!parsed || !referenceDate || !label) return;
        setStage('importing');
        setImportError(null);

        const { items } = parsed;
        const totalBatches = Math.ceil(items.length / BATCH);
        setProgress({ current: 0, total: totalBatches });

        try {
            for (let i = 0; i < items.length; i += BATCH) {
                const slice = items.slice(i, i + BATCH);
                const isLast = i + BATCH >= items.length;
                const { error } = await supabase.functions.invoke('sinapi-import', {
                    body: {
                        items: slice,
                        reference_date: referenceDate,
                        label,
                        is_last: isLast,
                        total_count: items.length,
                    },
                });
                if (error) throw new Error(error.message);
                setProgress(p => ({ ...p, current: p.current + 1 }));
            }
            setStage('done');
            onSuccess();
        } catch (e: unknown) {
            setImportError(e instanceof Error ? e.message : String(e));
            setStage('error');
        }
    };

    const canParse = !!file && !!referenceMonth;

    const modal = (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-600 p-2 rounded-lg text-white">
                            <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Importar Competência SINAPI</h2>
                            <p className="text-[11px] text-gray-400">Planilha consolidada (.xlsx) + mês de referência</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-5">

                    {/* Stage: pick / preview */}
                    {(stage === 'pick' || stage === 'preview') && (
                        <>
                            {/* Drop zone */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${isDragging ? 'border-emerald-400 bg-emerald-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'}`}
                                onClick={() => document.getElementById('sinapi-file-input')?.click()}
                            >
                                <input
                                    id="sinapi-file-input"
                                    type="file"
                                    accept=".xlsx"
                                    className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
                                />
                                {file ? (
                                    <div className="flex items-center justify-center gap-2 text-emerald-700">
                                        <FileSpreadsheet className="w-5 h-5" />
                                        <span className="font-bold text-sm">{file.name}</span>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                                        <p className="text-sm font-medium text-gray-500">Arraste o arquivo ou clique para selecionar</p>
                                        <p className="text-[11px] text-gray-400 mt-1">Apenas .xlsx (template Modelo_SINAPI)</p>
                                    </>
                                )}
                            </div>

                            {/* Mês/Ano */}
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                    Mês de Referência
                                </label>
                                <input
                                    type="month"
                                    value={referenceMonth}
                                    onChange={(e) => { setReferenceMonth(e.target.value); setStage('pick'); setParsed(null); }}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                                {referenceMonth && (
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Competência: <strong className="text-emerald-600">{label}</strong>
                                        &nbsp;· reference_date: <code className="text-gray-500">{referenceDate}</code>
                                    </p>
                                )}
                            </div>

                            {parseError && (
                                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {parseError}
                                </div>
                            )}

                            {/* Preview result */}
                            {stage === 'preview' && !parsed && (
                                <div className="flex items-center gap-2 text-gray-500 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Lendo planilha…
                                </div>
                            )}
                            {parsed && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col gap-2">
                                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Prévia</p>
                                    <div className="flex gap-6">
                                        <div>
                                            <p className="text-2xl font-black text-emerald-700">{parsed.itemCount.toLocaleString('pt-BR')}</p>
                                            <p className="text-[11px] text-emerald-600">itens (insumos + composições)</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-black text-emerald-700">{parsed.compositionCount.toLocaleString('pt-BR')}</p>
                                            <p className="text-[11px] text-emerald-600">composições com sub-itens</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-emerald-600 mt-1">
                                        Serão enviados em {Math.ceil(parsed.itemCount / BATCH)} lotes de {BATCH}.
                                        Itens existentes serão atualizados (upsert).
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Stage: importing */}
                    {stage === 'importing' && (
                        <div className="flex flex-col gap-4 py-2">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-emerald-600 shrink-0" />
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Importando competência {label}…</p>
                                    <p className="text-[11px] text-gray-500">Lote {progress.current} de {progress.total}</p>
                                </div>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Stage: done */}
                    {stage === 'done' && (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                            <p className="font-bold text-gray-900">Competência {label} importada!</p>
                            <p className="text-sm text-gray-500">
                                {parsed?.itemCount.toLocaleString('pt-BR')} itens em sinapi_items.<br />
                                O dropdown de referência foi atualizado.
                            </p>
                        </div>
                    )}

                    {/* Stage: error */}
                    {stage === 'error' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-sm">Falha na importação</p>
                                    <p className="text-xs mt-0.5">{importError}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    {stage === 'done' ? (
                        <button onClick={handleClose} className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all">
                            Fechar
                        </button>
                    ) : stage === 'error' ? (
                        <>
                            <button onClick={handleClose} className="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded-xl transition-all">
                                Cancelar
                            </button>
                            <button onClick={() => setStage('preview')} className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all flex items-center gap-1.5">
                                Tentar novamente
                            </button>
                        </>
                    ) : stage === 'importing' ? (
                        <span className="text-xs text-gray-400 italic py-2">Aguarde a conclusão…</span>
                    ) : (
                        <>
                            <button onClick={handleClose} className="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded-xl transition-all">
                                Cancelar
                            </button>
                            {!parsed ? (
                                <button
                                    onClick={handleParse}
                                    disabled={!canParse}
                                    className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                    Analisar planilha
                                </button>
                            ) : (
                                <button
                                    onClick={handleImport}
                                    className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center gap-1.5"
                                >
                                    <Upload className="w-4 h-4" />
                                    Importar {label}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default SinapiImportModal;
