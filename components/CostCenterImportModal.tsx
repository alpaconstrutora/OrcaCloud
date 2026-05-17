import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    X, Upload, CheckCircle2, AlertTriangle, XCircle,
    FileSpreadsheet, ArrowRight, RotateCcw
} from 'lucide-react';
import { CostCenter } from '../types/financial';
import { financialRegistryService } from '../services/financialRegistryService';

interface ParsedRow {
    index: number;
    code: string;
    name: string;
    status: 'new' | 'update' | 'error';
    errorMsg?: string;
    existingId?: string;
    selected: boolean;
}

interface Props {
    organizationId: string;
    existingCostCenters: CostCenter[];
    onClose: () => void;
    onSuccess: () => void;
}

const STATUS_CONFIG = {
    new:    { label: 'Novo',       icon: CheckCircle2,    color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
    update: { label: 'Atualizar',  icon: AlertTriangle,   color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200'   },
    error:  { label: 'Erro',       icon: XCircle,         color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200'     },
};

const CostCenterImportModal: React.FC<Props> = ({
    organizationId,
    existingCostCenters,
    onClose,
    onSuccess,
}) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null);
    const [fileName, setFileName] = useState('');

    const parseFile = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

            const existingByCode = new Map(
                existingCostCenters
                    .filter(c => c.code)
                    .map(c => [c.code!.trim().toLowerCase(), c])
            );

            const codesInFile = new Set<string>();
            const parsed: ParsedRow[] = raw.map((r, i) => {
                const name = String(r['Nome'] || r['name'] || '').trim();
                const code = String(r['Código'] || r['Codigo'] || r['code'] || '').trim();

                if (!name) {
                    return { index: i, code, name, status: 'error', errorMsg: 'Nome obrigatório', selected: false };
                }

                const codeKey = code.toLowerCase();
                if (code && codesInFile.has(codeKey)) {
                    return { index: i, code, name, status: 'error', errorMsg: 'Código duplicado no arquivo', selected: false };
                }
                if (code) codesInFile.add(codeKey);

                const existing = code ? existingByCode.get(codeKey) : undefined;
                if (existing) {
                    return { index: i, code, name, status: 'update', existingId: existing.id, selected: true };
                }

                return { index: i, code, name, status: 'new', selected: true };
            });

            setRows(parsed);
            setStep('preview');
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) parseFile(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
    };

    const toggleRow = (index: number) => {
        setRows(prev => prev.map(r => r.index === index && r.status !== 'error' ? { ...r, selected: !r.selected } : r));
    };

    const toggleAll = () => {
        const selectableRows = rows.filter(r => r.status !== 'error');
        const allSelected = selectableRows.every(r => r.selected);
        setRows(prev => prev.map(r => r.status === 'error' ? r : { ...r, selected: !allSelected }));
    };

    const handleImport = async () => {
        const toImport = rows.filter(r => r.selected && r.status !== 'error');
        if (toImport.length === 0) return;

        setImporting(true);
        try {
            const res = await financialRegistryService.upsertCostCenters(organizationId, toImport);
            const errorCount = rows.filter(r => r.status === 'error').length;
            setResult({ ...res, errors: errorCount });
            setStep('done');
        } catch (err) {
            console.error(err);
            alert('Erro ao importar. Verifique os dados e tente novamente.');
        } finally {
            setImporting(false);
        }
    };

    const reset = () => {
        setStep('upload');
        setRows([]);
        setFileName('');
        setResult(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const selectedCount = rows.filter(r => r.selected && r.status !== 'error').length;
    const errorCount = rows.filter(r => r.status === 'error').length;
    const selectableRows = rows.filter(r => r.status !== 'error');
    const allSelected = selectableRows.length > 0 && selectableRows.every(r => r.selected);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                            Importar Centros de Custo
                        </h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                            {step === 'upload' && 'Selecione um arquivo .xlsx ou .csv'}
                            {step === 'preview' && `${rows.length} linha(s) encontrada(s) em "${fileName}"`}
                            {step === 'done' && 'Importação concluída'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {/* STEP: upload */}
                    {step === 'upload' && (
                        <div className="p-8">
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-2xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
                            >
                                <div className="p-4 bg-gray-100 rounded-2xl group-hover:bg-blue-100 transition-colors">
                                    <FileSpreadsheet className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-gray-700">Arraste o arquivo aqui</p>
                                    <p className="text-xs text-gray-400 mt-1">ou clique para selecionar — .xlsx ou .csv</p>
                                </div>
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>
                    )}

                    {/* STEP: preview */}
                    {step === 'preview' && (
                        <div>
                            {/* summary bar */}
                            <div className="flex items-center gap-3 px-8 py-4 bg-gray-50 border-b border-gray-100 text-[11px] font-black uppercase tracking-widest">
                                <span className="text-emerald-600">{rows.filter(r => r.status === 'new').length} novos</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-amber-600">{rows.filter(r => r.status === 'update').length} a atualizar</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-red-500">{errorCount} erros</span>
                            </div>

                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                                    <tr>
                                        <th className="px-4 py-3 text-center w-10">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={toggleAll}
                                                className="rounded"
                                            />
                                        </th>
                                        <th className="px-4 py-3 text-left w-28">Código</th>
                                        <th className="px-4 py-3 text-left">Nome</th>
                                        <th className="px-4 py-3 text-center w-32">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {rows.map(row => {
                                        const cfg = STATUS_CONFIG[row.status];
                                        const StatusIcon = cfg.icon;
                                        return (
                                            <tr
                                                key={row.index}
                                                onClick={() => toggleRow(row.index)}
                                                className={`transition-colors ${row.status === 'error' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                                            >
                                                <td className="px-4 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.selected}
                                                        disabled={row.status === 'error'}
                                                        onChange={() => toggleRow(row.index)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="rounded"
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded uppercase tracking-wider">
                                                        {row.code || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className="text-sm font-bold text-gray-800">{row.name || <span className="text-red-400 italic">vazio</span>}</span>
                                                    {row.errorMsg && (
                                                        <p className="text-[10px] text-red-400 font-bold mt-0.5">{row.errorMsg}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* STEP: done */}
                    {step === 'done' && result && (
                        <div className="p-12 flex flex-col items-center gap-6 text-center">
                            <div className="p-5 bg-emerald-50 rounded-3xl">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Importação concluída</h3>
                                <p className="text-sm text-gray-500 mt-1">Os centros de custo foram processados com sucesso.</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="px-6 py-4 bg-emerald-50 rounded-2xl text-center border border-emerald-100">
                                    <p className="text-2xl font-black text-emerald-600">{result.created}</p>
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">Criados</p>
                                </div>
                                <div className="px-6 py-4 bg-amber-50 rounded-2xl text-center border border-amber-100">
                                    <p className="text-2xl font-black text-amber-600">{result.updated}</p>
                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-1">Atualizados</p>
                                </div>
                                {result.errors > 0 && (
                                    <div className="px-6 py-4 bg-red-50 rounded-2xl text-center border border-red-100">
                                        <p className="text-2xl font-black text-red-500">{result.errors}</p>
                                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mt-1">Ignorados</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 bg-gray-50/50">
                    {step === 'upload' && (
                        <button onClick={onClose} className="text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors">
                            Cancelar
                        </button>
                    )}

                    {step === 'preview' && (
                        <>
                            <button onClick={reset} className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" />
                                Trocar arquivo
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={selectedCount === 0 || importing}
                                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/10 active:scale-95"
                            >
                                <Upload className="w-4 h-4" />
                                {importing ? 'Importando...' : `Importar ${selectedCount} registro${selectedCount !== 1 ? 's' : ''}`}
                                {!importing && <ArrowRight className="w-3.5 h-3.5" />}
                            </button>
                        </>
                    )}

                    {step === 'done' && (
                        <>
                            <button onClick={reset} className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" />
                                Nova importação
                            </button>
                            <button
                                onClick={() => { onSuccess(); onClose(); }}
                                className="flex items-center gap-2 bg-black text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 active:scale-95"
                            >
                                Concluir
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CostCenterImportModal;
