import React, { useRef, useState } from 'react';
import { X, Upload, CheckCircle2, XCircle, FileSpreadsheet, ArrowRight, RotateCcw, Download } from 'lucide-react';
import Button from './ui/Button';
import { Client } from '../types';
import { clientService } from '../services/clientService';
import {
    parseClientSheet, sheetRowToClient, downloadClientImportTemplate,
    onlyDigits, IMPORT_COLUMNS, ClientSheetRow,
} from '../utils/clientExcel';

/**
 * Importação de clientes por planilha (Meus Clientes).
 *
 * Molde de `CostCenterV2ImportModal.tsx` (upload → prévia → resultado), com uma
 * diferença de regra combinada com o usuário em 04/09/2026: linha cujo CPF/CNPJ
 * já existe **atualiza** o cadastro, não é ignorada. A prévia mostra a ação por
 * linha antes de gravar qualquer coisa.
 *
 * ⚠️ Organização de destino: modo `'single'` (o pai resolve via
 * `resolveWriteOrg('single')` e passa `organizationId`), não `'all-allowed'`.
 * Cliente é registro operacional de UMA organização — replicá-lo em todas as do
 * usuário esbarraria na checagem de CPF/CNPJ único
 * (`assertDocumentNotDuplicated`, que é global) e criaria N cadastros da mesma
 * pessoa. É a exceção 4 da REGRA #5 do CLAUDE.md.
 */

type RowAction = 'criar' | 'atualizar' | 'erro';

interface ParsedRow {
    index: number;
    name: string;
    document: string;
    category: string;
    email: string;
    action: RowAction;
    errorMsg?: string;
    /** Cliente existente casado por documento — alvo do update. */
    matchId?: string;
    selected: boolean;
    payload: Partial<Client>;
}

interface Props {
    /** Organização de destino já resolvida pelo pai (nunca `null` aqui). */
    organizationId: string;
    /** Clientes já carregados na tela — base do casamento por documento. */
    existingClients: Client[];
    onClose: () => void;
    /** Chamado ao concluir; o pai recarrega a lista. */
    onSuccess: () => void;
}

const ClientImportModal: React.FC<Props> = ({ organizationId, existingClients, onClose, onSuccess }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null);
    const [fileName, setFileName] = useState('');

    const porDocumento = React.useMemo(() => {
        const map = new Map<string, Client>();
        for (const c of existingClients) {
            const digits = onlyDigits(c.document);
            if (digits && !map.has(digits)) map.set(digits, c);
        }
        return map;
    }, [existingClients]);

    const parseFile = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const linhas = parseClientSheet(e.target?.result as ArrayBuffer);
            setRows(linhas.map((linha, i) => montarLinha(linha, i)));
            setStep('preview');
        };
        reader.readAsArrayBuffer(file);
    };

    const montarLinha = (linha: ClientSheetRow, index: number): ParsedRow => {
        const payload = sheetRowToClient(linha);
        const nome = payload.name ?? '';
        const documento = linha['CPF/CNPJ'] ?? '';
        const base = {
            index,
            name: nome,
            document: documento,
            category: payload.category ?? '',
            email: payload.email ?? '',
            payload,
        };

        if (!nome.trim()) {
            return { ...base, action: 'erro' as const, errorMsg: 'Linha sem "Nome"', selected: false };
        }

        const existente = porDocumento.get(onlyDigits(documento));
        return existente
            ? { ...base, action: 'atualizar' as const, matchId: existente.id, selected: true }
            : { ...base, action: 'criar' as const, selected: true };
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
        setRows(prev => prev.map(r => r.index === index && r.action !== 'erro' ? { ...r, selected: !r.selected } : r));
    };

    const handleImport = async () => {
        const alvos = rows.filter(r => r.selected && r.action !== 'erro');
        if (alvos.length === 0) return;

        setImporting(true);
        try {
            // Sequencial de propósito: `saveClient` checa duplicidade de documento
            // e, na criação, pede o próximo código sequencial da organização
            // (`get_next_client_code`). Em paralelo, duas linhas sem código pegariam
            // o MESMO número.
            let created = 0;
            let updated = 0;
            let errors = rows.filter(r => r.action === 'erro').length;

            for (const linha of alvos) {
                try {
                    if (linha.action === 'atualizar') {
                        await clientService.saveClient({ ...linha.payload, id: linha.matchId });
                        updated++;
                    } else {
                        await clientService.saveClient({ ...linha.payload, organization_id: organizationId });
                        created++;
                    }
                } catch (err) {
                    console.error('[IMPORT CLIENTES] Falha na linha', linha.index + 2, err);
                    errors++;
                }
            }

            setResult({ created, updated, errors });
            setStep('done');
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

    const selectedCount = rows.filter(r => r.selected && r.action !== 'erro').length;
    const criarCount = rows.filter(r => r.selected && r.action === 'criar').length;
    const atualizarCount = rows.filter(r => r.selected && r.action === 'atualizar').length;
    const errorCount = rows.filter(r => r.action === 'erro').length;

    const ACTION_LABEL: Record<RowAction, { texto: string; cor: string }> = {
        criar: { texto: 'Criar', cor: 'text-emerald-600' },
        atualizar: { texto: 'Atualizar', cor: 'text-blue-600' },
        erro: { texto: 'Erro', cor: 'text-red-500' },
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Importar clientes</h3>
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
                        <div className="p-8 space-y-4">
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
                                    <p className="text-xs text-gray-400 mt-1">
                                        ou clique para selecionar — .xlsx ou .csv
                                    </p>
                                </div>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />

                            <div className="rounded-[10px] border border-gray-100 bg-gray-50/60 p-4">
                                <p className="text-xs font-semibold text-slate-500 mb-1.5">Colunas esperadas</p>
                                <p className="text-sm font-normal text-gray-600 leading-relaxed">
                                    {IMPORT_COLUMNS.join(' · ')}
                                </p>
                                <p className="text-xs text-gray-400 mt-2">
                                    Linha cujo CPF/CNPJ já existe <strong className="text-gray-600">atualiza</strong> o cadastro;
                                    as demais criam um cliente novo. Coluna em branco não apaga o que já está gravado.
                                </p>
                                <button
                                    type="button"
                                    onClick={downloadClientImportTemplate}
                                    className="mt-3 flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                                >
                                    <Download className="w-4 h-4" />
                                    Baixar planilha modelo
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div>
                            <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                                <span className="text-emerald-600">{criarCount} a criar</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-blue-600">{atualizarCount} a atualizar</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-red-500">{errorCount} erros</span>
                            </div>
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50 text-gray-500 text-xs font-semibold">
                                    <tr>
                                        <th className="px-4 py-2 text-center w-10"></th>
                                        <th className="px-4 py-2 text-left">Ação</th>
                                        <th className="px-4 py-2 text-left">Nome</th>
                                        <th className="px-4 py-2 text-left">CPF/CNPJ</th>
                                        <th className="px-4 py-2 text-left">Tipo</th>
                                        <th className="px-4 py-2 text-left">E-mail</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {rows.map(row => (
                                        <tr
                                            key={row.index}
                                            onClick={() => toggleRow(row.index)}
                                            className={`transition-colors ${row.action === 'erro' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                                        >
                                            <td className="px-4 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={row.selected}
                                                    disabled={row.action === 'erro'}
                                                    onChange={() => toggleRow(row.index)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="rounded"
                                                />
                                            </td>
                                            <td className={`px-4 py-2.5 text-sm font-normal ${ACTION_LABEL[row.action].cor}`}>
                                                {ACTION_LABEL[row.action].texto}
                                            </td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-700">
                                                <span className="block truncate max-w-[240px]" title={row.name}>{row.name || '-'}</span>
                                                {row.errorMsg && <p className="text-xs text-red-500 mt-0.5">{row.errorMsg}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{row.document || '-'}</td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{row.category || '-'}</td>
                                            <td className="px-4 py-2.5 text-sm font-normal text-gray-500">
                                                <span className="block truncate max-w-[200px]" title={row.email}>{row.email || '-'}</span>
                                            </td>
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
                                <p className="text-sm text-gray-500 mt-1">Os clientes foram processados.</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="px-6 py-4 bg-emerald-50 rounded-[10px] text-center border border-emerald-100">
                                    <p className="text-2xl font-black text-emerald-600">{result.created}</p>
                                    <p className="text-xs font-semibold text-emerald-500 mt-1">Criados</p>
                                </div>
                                <div className="px-6 py-4 bg-blue-50 rounded-[10px] text-center border border-blue-100">
                                    <p className="text-2xl font-black text-blue-600">{result.updated}</p>
                                    <p className="text-xs font-semibold text-blue-500 mt-1">Atualizados</p>
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

export default ClientImportModal;
