// components/regulatoryMap/RegulatoryMapExcelImportModal.tsx
//
// Importação de mapa regulatório a partir de uma planilha Excel da prefeitura. Fluxo em 4
// passos: enviar arquivo → escolher a linha de cabeçalho → mapear cada coluna da planilha
// para um campo do Mapa Regulatório → revisar e importar. Não assume nenhum layout fixo —
// cada prefeitura publica sua tabela de um jeito diferente.
import React from 'react';
import { X, Upload, Loader2, FileSpreadsheet, ArrowRight, ArrowLeft, RotateCcw, CheckCircle2, Download } from 'lucide-react';
import { RegulatoryMapZoneInsert } from '../../types';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import {
    readSheetGrid, suggestMapping, buildZoneRows, downloadTemplateWorkbook, ColumnMapping, ParsedZoneRow,
} from '../../services/regulatoryMapExcelImport';
import { ZONE_COLUMNS } from '../RegulatoryZoneTable';

interface Props {
    regulatoryMapId: string;
    organizationId: string;
    onClose: () => void;
    onImported: () => void;
}

type Step = 'upload' | 'header' | 'mapping' | 'preview' | 'done';

const MAPPING_OPTIONS: { value: ColumnMapping; label: string }[] = [
    { value: 'ignore', label: 'Ignorar coluna' },
    ...ZONE_COLUMNS.map(c => ({ value: c.key as ColumnMapping, label: c.label })),
];

export const RegulatoryMapExcelImportModal: React.FC<Props> = ({ regulatoryMapId, organizationId, onClose, onImported }) => {
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [step, setStep] = React.useState<Step>('upload');
    const [fileName, setFileName] = React.useState('');
    const [grid, setGrid] = React.useState<string[][]>([]);
    const [headerRowIndex, setHeaderRowIndex] = React.useState(0);
    const [mapping, setMapping] = React.useState<ColumnMapping[]>([]);
    const [parsedRows, setParsedRows] = React.useState<ParsedZoneRow[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [importing, setImporting] = React.useState(false);
    const [importResult, setImportResult] = React.useState<{ created: number; updated: number } | null>(null);

    const handleFile = async (file: File) => {
        setError(null);
        setFileName(file.name);
        try {
            const g = await readSheetGrid(file);
            if (g.length === 0) { setError('Planilha vazia.'); return; }
            setGrid(g);
            setHeaderRowIndex(0);
            setStep('header');
        } catch (err: any) {
            setError(err.message || 'Não foi possível ler o arquivo. Confira se é um .xlsx válido.');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const confirmHeaderRow = () => {
        const headerRow = grid[headerRowIndex] || [];
        setMapping(suggestMapping(headerRow));
        setStep('mapping');
    };

    const confirmMapping = () => {
        if (!mapping.some(m => m !== 'ignore')) {
            setError('Mapeie ao menos uma coluna para continuar.');
            return;
        }
        setError(null);
        setParsedRows(buildZoneRows(grid, headerRowIndex, mapping));
        setStep('preview');
    };

    const toggleRow = (key: string) => {
        setParsedRows(prev => prev.map(r => r.key === key ? { ...r, selected: !r.selected } : r));
    };

    const toggleAll = () => {
        const allSelected = parsedRows.every(r => r.selected);
        setParsedRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
    };

    const handleImport = async () => {
        const chosen = parsedRows.filter(r => r.selected);
        if (chosen.length === 0) return;
        setImporting(true);
        setError(null);
        try {
            const inserts: RegulatoryMapZoneInsert[] = chosen.map((r) => ({
                regulatory_map_id: regulatoryMapId,
                organization_id: organizationId,
                sort_order: 0,
                ...r.values,
            }));
            // upsert por (macroárea, zona): reimportar a mesma planilha (ou uma versão
            // atualizada) atualiza as zonas já cadastradas em vez de duplicar.
            const result = await regulatoryMapService.upsertZonesFromImport({ regulatoryMapId, zones: inserts });
            setImportResult(result);
            setStep('done');
        } catch (err: any) {
            setError(err.message || 'Erro ao importar zonas.');
        } finally {
            setImporting(false);
        }
    };

    const reset = () => {
        setStep('upload');
        setFileName('');
        setGrid([]);
        setMapping([]);
        setParsedRows([]);
        setError(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const selectedCount = parsedRows.filter(r => r.selected).length;
    const previewRows = grid.slice(0, 20);
    const colCount = grid[0]?.length || 0;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[10px] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-blue-600" /> Importar planilha Excel
                        </h2>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            {step === 'upload' && 'Envie a planilha de zoneamento da prefeitura (.xlsx)'}
                            {step === 'header' && `Clique na linha que contém os títulos das colunas — "${fileName}"`}
                            {step === 'mapping' && 'Diga o que cada coluna da planilha representa'}
                            {step === 'preview' && `${parsedRows.length} zona(s) encontrada(s) — revise antes de importar`}
                            {step === 'done' && 'Importação concluída'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {error && (
                        <div className="mx-6 mt-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-[10px] p-3 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {step === 'upload' && (
                        <div className="p-8">
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-[10px] p-16 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
                            >
                                <div className="p-4 bg-gray-100 rounded-[10px] group-hover:bg-blue-100 transition-colors">
                                    <FileSpreadsheet className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-gray-700">Arraste a planilha aqui</p>
                                    <p className="text-xs text-gray-400 mt-1">ou clique para selecionar — .xlsx ou .xls</p>
                                </div>
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                                className="hidden"
                            />
                            <div className="flex items-center justify-center gap-2 mt-5">
                                <p className="text-xs text-gray-400">Não tem uma planilha ainda?</p>
                                <button
                                    type="button"
                                    onClick={downloadTemplateWorkbook}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> Baixar modelo (.xlsx)
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'header' && (
                        <div className="p-6">
                            <div className="overflow-x-auto border border-gray-200 rounded-[10px]">
                                <table className="min-w-max text-sm">
                                    <tbody>
                                        {previewRows.map((row, rIdx) => (
                                            <tr
                                                key={rIdx}
                                                onClick={() => setHeaderRowIndex(rIdx)}
                                                className={`cursor-pointer border-b border-gray-100 last:border-0 ${
                                                    rIdx === headerRowIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <td className="px-2 py-1.5 text-xs text-gray-300 font-mono w-8 text-right border-r border-gray-100">{rIdx + 1}</td>
                                                {row.map((cell, cIdx) => (
                                                    <td key={cIdx} className="px-3 py-1.5 border-r border-gray-50 last:border-r-0 whitespace-pre-line max-w-[220px] truncate">
                                                        {cell || <span className="text-gray-300">—</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                Linha selecionada: <strong className="text-gray-600">{headerRowIndex + 1}</strong>. Os dados das zonas começam na linha seguinte.
                            </p>
                        </div>
                    )}

                    {step === 'mapping' && (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Array.from({ length: colCount }).map((_, colIdx) => (
                                    <div key={colIdx} className="border border-gray-200 rounded-[10px] p-3">
                                        <p className="text-xs font-semibold text-gray-400 mb-1 truncate">
                                            Coluna {colIdx + 1}: <span className="text-gray-700">{grid[headerRowIndex]?.[colIdx] || '—'}</span>
                                        </p>
                                        <p className="text-xs text-gray-400 truncate mb-2">
                                            Ex.: {grid[headerRowIndex + 1]?.[colIdx] || '—'}
                                        </p>
                                        <select
                                            value={mapping[colIdx] ?? 'ignore'}
                                            onChange={e => setMapping(prev => prev.map((m, i) => i === colIdx ? e.target.value as ColumnMapping : m))}
                                            className="w-full h-9 px-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        >
                                            {MAPPING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div>
                            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={parsedRows.length > 0 && parsedRows.every(r => r.selected)} onChange={toggleAll} className="rounded" />
                                    Selecionar todas
                                </label>
                                <span className="text-xs font-semibold text-gray-400">{selectedCount} de {parsedRows.length} selecionadas</span>
                            </div>
                            <div className="overflow-x-auto max-h-96">
                                <table className="min-w-max text-sm w-full">
                                    <thead className="bg-gray-50 text-xs font-semibold text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 w-8" />
                                            {ZONE_COLUMNS.filter(c => mapping.includes(c.key)).map(c => (
                                                <th key={c.key} className="px-3 py-2 text-left whitespace-nowrap">{c.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {parsedRows.map(r => (
                                            <tr key={r.key} onClick={() => toggleRow(r.key)} className={`cursor-pointer ${r.selected ? '' : 'opacity-40'} hover:bg-gray-50`}>
                                                <td className="px-3 py-2">
                                                    <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.key)} onClick={e => e.stopPropagation()} className="rounded" />
                                                </td>
                                                {ZONE_COLUMNS.filter(c => mapping.includes(c.key)).map(c => (
                                                    <td key={c.key} className="px-3 py-2 whitespace-nowrap">{r.values[c.key] || '—'}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === 'done' && importResult && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
                            <div className="p-4 bg-emerald-50 rounded-full">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">
                                    {importResult.created} nova(s) · {importResult.updated} atualizada(s)
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Zonas já cadastradas (mesma macroárea + zona) foram atualizadas em vez de duplicadas.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                    {step === 'upload' && <button onClick={onClose} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>}

                    {step === 'header' && (
                        <>
                            <button onClick={reset} className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"><RotateCcw className="w-3.5 h-3.5" /> Trocar arquivo</button>
                            <button onClick={confirmHeaderRow} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">Continuar <ArrowRight className="w-3.5 h-3.5" /></button>
                        </>
                    )}

                    {step === 'mapping' && (
                        <>
                            <button onClick={() => setStep('header')} className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</button>
                            <button onClick={confirmMapping} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">Continuar <ArrowRight className="w-3.5 h-3.5" /></button>
                        </>
                    )}

                    {step === 'preview' && (
                        <>
                            <button onClick={() => setStep('mapping')} className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</button>
                            <button
                                onClick={handleImport}
                                disabled={importing || selectedCount === 0}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60"
                            >
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                Importar {selectedCount} zona{selectedCount !== 1 ? 's' : ''}
                            </button>
                        </>
                    )}

                    {step === 'done' && (
                        <button
                            onClick={() => { onImported(); onClose(); }}
                            className="ml-auto flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            Concluir
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RegulatoryMapExcelImportModal;
