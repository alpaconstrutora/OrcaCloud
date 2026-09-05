import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText as FileIcon, CheckCircle2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { PaymentAccount } from '../types';

interface FileEntry {
    name: string;
    size: number;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    accounts: PaymentAccount[];
    selectedAccountId: string | null;
    onSelectAccount: (id: string) => void;
    competencia: string;
    onSelectCompetencia: (year: string, month: string) => void;
    onClearCompetencia: () => void;
    isImporting: boolean;
    importingMessage: string | null;
    onImportFiles: (files: FileList | File[]) => Promise<void>;
}

// Só promessas que o código cumpre. "Arquivo original preservado" saiu daqui em
// 05/09/2026 porque nada ia ao Storage; volta quando o registro de importação
// (plano 2026-09-05, item 2.4) existir.
const IMPORT_RULES = [
    ['Idempotência', 'Lançamento duplicado é reconhecido por conta, data, valor, direção e descrição — reimportar o mesmo extrato não duplica nada'],
    ['Conta certa', 'OFX de outra conta (número diferente do cadastrado) é recusado com aviso'],
    ['Linhas de saldo', '"Saldo do dia", "saldo anterior" e totais da planilha são descartados — não são movimentos'],
    ['Formatos aceitos', 'OFX (1.x e 2.x), CSV (; ou ,), Excel (XLSX/XLS) e CNAB 240. CNAB 400 ainda não foi verificado com arquivo real'],
    ['Múltiplos arquivos', 'Envie vários extratos de uma vez — cada um é processado individualmente e o que falhar é avisado'],
    ['Regras', 'Após a importação, as regras cadastradas são aplicadas automaticamente'],
] as const;

export default function BankStatementImportDrawer({
    open,
    onClose,
    accounts,
    selectedAccountId,
    onSelectAccount,
    competencia,
    onSelectCompetencia,
    onClearCompetencia,
    isImporting,
    importingMessage,
    onImportFiles,
}: Props) {
    const [dragging, setDragging] = useState(false);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const year = competencia ? competencia.split('-')[0] : '';
    const month = competencia.includes('-') ? competencia.split('-')[1] : '';

    const processFiles = useCallback(async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        if (!selectedAccountId) return;

        const fileArray = Array.from(fileList);
        setFiles(fileArray.map(f => ({ name: f.name, size: f.size, progress: 30, status: 'uploading' })));

        try {
            await onImportFiles(fileList);
            setFiles(fileArray.map(f => ({ name: f.name, size: f.size, progress: 100, status: 'done' })));
        } catch (err: any) {
            setFiles(fileArray.map(f => ({ name: f.name, size: f.size, progress: 100, status: 'error', error: err?.message })));
        }
    }, [selectedAccountId, onImportFiles]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        processFiles(e.dataTransfer.files);
    }, [processFiles]);

    return (
        <Sheet open={open} onClose={() => { setFiles([]); onClose(); }}>
            <SheetHeader onClose={() => { setFiles([]); onClose(); }}>
                <SheetTitle>Importar Extrato</SheetTitle>
                <SheetDescription>Envie arquivos do extrato bancário para conciliação automática.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-6">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Conta bancária</label>
                            <select
                                value={selectedAccountId || ''}
                                onChange={(e) => onSelectAccount(e.target.value)}
                                className="h-10 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                                <option value="">Selecione uma conta...</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.account_number}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Competência</label>
                            <div className="flex gap-2">
                                <select
                                    value={year}
                                    onChange={(e) => onSelectCompetencia(e.target.value, month || '01')}
                                    className="h-10 flex-1 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">Ano</option>
                                    {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - 25 + i).map(y => (
                                        <option key={y} value={String(y)}>{y}</option>
                                    ))}
                                </select>
                                <select
                                    value={month}
                                    onChange={(e) => onSelectCompetencia(year || String(new Date().getFullYear()), e.target.value)}
                                    className="h-10 flex-1 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">Mês</option>
                                    {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => (
                                        <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                                    ))}
                                </select>
                                {competencia && (
                                    <button
                                        onClick={onClearCompetencia}
                                        className="px-2 text-xs text-gray-400 hover:text-red-500"
                                        title="Limpar competência"
                                    >
                                        Limpar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
                    <div
                        className={`border-2 border-dashed rounded-[10px] px-8 py-14 text-center transition-all ${
                            !selectedAccountId ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60' :
                            dragging ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 bg-white hover:border-blue-400 cursor-pointer'
                        }`}
                        onDragOver={e => { if (selectedAccountId) { e.preventDefault(); setDragging(true); } }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={selectedAccountId ? handleDrop : undefined}
                        onClick={() => selectedAccountId && inputRef.current?.click()}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            accept=".ofx,.csv,.txt,.ret,.cnab,.xlsx,.xls"
                            multiple
                            onChange={e => processFiles(e.target.files)}
                        />
                        <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-[10px] flex items-center justify-center mx-auto mb-4 text-blue-600">
                            <UploadCloud className="w-6 h-6" />
                        </div>
                        <div className="text-[15px] font-bold text-gray-900 mb-1.5">
                            {selectedAccountId ? 'Arraste o extrato aqui ou clique para selecionar' : 'Selecione uma conta bancária para importar'}
                        </div>
                        <div className="text-sm text-gray-500 mb-5">Múltiplos arquivos • OFX, CSV, CNAB, XLSX</div>
                        <button
                            onClick={e => e.stopPropagation()}
                            disabled={isImporting || !selectedAccountId}
                            className="h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                        >
                            {isImporting ? (importingMessage || 'Importando…') : 'Selecionar arquivos'}
                        </button>
                    </div>

                    {files.length > 0 && (
                        <div className="mt-5">
                            {files.map((f, i) => (
                                <div key={i} className="py-3 border-t border-gray-100">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <div className="flex items-center gap-2.5">
                                            <FileIcon className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-sm font-normal text-gray-700">{f.name}</span>
                                            <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                        <div>
                                            {f.status === 'done' && (
                                                <span className="text-sm font-normal text-emerald-700">importado</span>
                                            )}
                                            {f.status === 'error' && (
                                                <span className="text-sm font-normal text-red-600">{f.error || 'erro'}</span>
                                            )}
                                            {f.status === 'uploading' && <span className="text-sm font-normal text-blue-600">{f.progress}%</span>}
                                        </div>
                                    </div>
                                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${f.status === 'error' ? 'bg-red-500' : f.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                            style={{ width: `${f.progress}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-4 pb-2.5 border-b border-gray-100">Regras de importação</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {IMPORT_RULES.map(([title, desc]) => (
                            <div key={title} className="flex gap-2.5 items-start">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-sm font-bold text-gray-800 mb-0.5">{title}</div>
                                    <div className="text-xs text-gray-500">{desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </SheetPanel>
        </Sheet>
    );
}
