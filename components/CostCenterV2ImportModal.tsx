import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, CheckCircle2, XCircle, FileSpreadsheet, ArrowRight, RotateCcw } from 'lucide-react';
import Button from './ui/Button';
import { costCenterService } from '../services/costCenterService';

interface ParsedRow {
    index: number;
    group: string;
    name: string;
    description: string;
    status: 'ok' | 'error';
    errorMsg?: string;
    selected: boolean;
}

interface Props {
    organizationId: string;
    onClose: () => void;
    onSuccess: () => void;
}

// Sheet + modal seguem docs/ui_ux_guia_unificado.md §21 (título sentence case,
// rótulo text-xs font-semibold text-slate-500) — arquivo novo, não herda o
// estilo antigo uppercase/tracking-widest do CostCenterImportModal.tsx (Plano
// de Contas legado).
const CostCenterV2ImportModal: React.FC<Props> = ({ organizationId, onClose, onSuccess }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; errors: number } | null>(null);
    const [fileName, setFileName] = useState('');

    const parseFile = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

            const parsed: ParsedRow[] = raw.map((r, i) => {
                const group = String(r['Grupo'] || r['group'] || '').trim();
                const name = String(r['Centro de custo'] || r['name'] || '').trim();
                const description = String(r['Descrição'] || r['Descricao'] || r['description'] || '').trim();

                // Só grupo (sem "Centro de custo") cria o grupo; nome fica vazio.
                if (!group && !name) {
                    return { index: i, group, name, description, status: 'error', errorMsg: 'Preencha ao menos Grupo ou Centro de custo', selected: false };
                }
                return { index: i, group, name: name || group, description, status: 'ok', selected: true };
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

    const handleImport = async () => {
        const toImport = rows.filter(r => r.selected && r.status !== 'error');
        if (toImport.length === 0) return;

        setImporting(true);
        try {
            const res = await costCenterService.importRows(
                organizationId,
                toImport.map(r => ({ group: r.group || undefined, name: r.name, description: r.description || undefined })),
            );
            const errorCount = rows.filter(r => r.status === 'error').length;
            setResult({ created: res.created, errors: res.errors + errorCount });
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Importar centro de custo</h3>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                            {step === 'upload' && 'Selecione um arquivo .xlsx ou .csv'}
                            {step === 'preview' && `${rows.length} linha(s) encontrada(s) em "${fileName}"`}
                            {step === 'done' && 'Importação concluída'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 -m-1 hover:bg-gray-100 rounded-[6px] transition-all shrink-0">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {step === 'upload' && (
                        <div className="p-8">
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-[10px] p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
                            >
                                <div className="p-4 bg-gray-100 rounded-[10px] group-hover:bg-blue-100 transition-colors">
                                    <FileSpreadsheet className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-gray-700">Arraste o arquivo aqui</p>
                                    <p className="text-xs text-gray-400 mt-1">ou clique para selecionar — .xlsx ou .csv, colunas Grupo / Centro de custo / Descrição</p>
                                </div>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                        </div>
                    )}

                    {step === 'preview' && (
                        <div>
                            <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                                <span className="text-emerald-600">{rows.filter(r => r.status === 'ok').length} válidas</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-red-500">{errorCount} erros</span>
                            </div>
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50 text-gray-500 text-xs font-semibold">
                                    <tr>
                                        <th className="px-4 py-2 text-center w-10"></th>
                                        <th className="px-4 py-2 text-left">Grupo</th>
                                        <th className="px-4 py-2 text-left">Centro de custo</th>
                                        <th className="px-4 py-2 text-left">Descrição</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {rows.map(row => (
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
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-700">{row.group || '-'}</td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-700">
                                                {row.name}
                                                {row.errorMsg && <p className="text-xs text-red-500 mt-0.5">{row.errorMsg}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-500">{row.description || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {step === 'done' && result && (
                        <div className="p-10 flex flex-col items-center gap-6 text-center">
                            <div className="p-5 bg-emerald-50 rounded-[10px]">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Importação concluída</h3>
                                <p className="text-sm text-gray-500 mt-1">Os centros de custo foram processados com sucesso.</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="px-6 py-4 bg-emerald-50 rounded-[10px] text-center border border-emerald-100">
                                    <p className="text-2xl font-black text-emerald-600">{result.created}</p>
                                    <p className="text-xs font-semibold text-emerald-500 mt-1">Criados</p>
                                </div>
                                {result.errors > 0 && (
                                    <div className="px-6 py-4 bg-red-50 rounded-[10px] text-center border border-red-100">
                                        <p className="text-2xl font-black text-red-500 flex items-center gap-1.5 justify-center"><XCircle className="w-5 h-5" />{result.errors}</p>
                                        <p className="text-xs font-semibold text-red-400 mt-1">Ignorados</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    {step === 'upload' && <Button variant="ghost" onClick={onClose}>Cancelar</Button>}
                    {step === 'preview' && (
                        <>
                            <Button variant="ghost" onClick={reset}><RotateCcw className="w-3.5 h-3.5" />Trocar arquivo</Button>
                            <button
                                onClick={handleImport}
                                disabled={selectedCount === 0 || importing}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                <Upload className="w-4 h-4" />
                                {importing ? 'Importando...' : `Importar ${selectedCount} registro${selectedCount !== 1 ? 's' : ''}`}
                                {!importing && <ArrowRight className="w-3.5 h-3.5" />}
                            </button>
                        </>
                    )}
                    {step === 'done' && (
                        <>
                            <Button variant="ghost" onClick={reset}><RotateCcw className="w-3.5 h-3.5" />Nova importação</Button>
                            <button
                                onClick={() => { onSuccess(); onClose(); }}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
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

export default CostCenterV2ImportModal;
