import React from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileSpreadsheet, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import ExcelJS from 'exceljs';
import { SinapiItem, SinapiType } from '../types';

interface DatabaseExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (items: any[]) => Promise<void>;
}

const DatabaseExcelImportModal: React.FC<DatabaseExcelImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [file, setFile] = React.useState<File | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [preview, setPreview] = React.useState<any[]>([]);

    if (!isOpen) return null;

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        if (!selectedFile.name.endsWith('.xlsx')) {
            setError('Por favor, selecione um arquivo Excel (.xlsx)');
            return;
        }
        setError(null);
        setFile(selectedFile);
        parsePreview(selectedFile);
    };

    const parsePreview = async (file: File) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            const worksheet = workbook.worksheets[0];

            const items: any[] = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header

                // Mapeamento simples: Col 1: Código, Col 2: Descrição, Col 3: Unid, Col 4: Preço, Col 5: Tipo, Col 6: Grupo
                const code = row.getCell(1).text?.trim();
                const description = row.getCell(2).text?.trim();
                const unit = row.getCell(3).text?.trim();
                const price = parseFloat(row.getCell(4).text?.replace('R$', '').replace('.', '').replace(',', '.') || '0');
                const typeStr = row.getCell(5).text?.trim().toUpperCase();
                const category = row.getCell(6).text?.trim();

                if (description && unit) { // Minimo requerido
                    let type = SinapiType.INPUT;
                    if (typeStr && (typeStr.includes('COMP') || typeStr.includes('SERV'))) {
                        type = SinapiType.COMPOSITION; // Ou serviço, simplificando
                    }

                    items.push({
                        code: code || `IMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                        description,
                        unit,
                        price,
                        type,
                        category: category || 'DIVERSOS',
                        source: 'Própria'
                    });
                }
            });
            setPreview(items.slice(0, 5)); // Show first 5
        } catch (err) {
            console.error("Erro ao ler preview", err);
            setError("Erro ao ler o arquivo. Verifique o formato.");
        }
    }

    const handleImport = async () => {
        if (!file) return;

        setIsLoading(true);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            const worksheet = workbook.worksheets[0];

            const items: any[] = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const code = row.getCell(1).text?.trim();
                const description = row.getCell(2).text?.trim();
                const unit = row.getCell(3).text?.trim();
                // Handle different number formats (1.200,00 or 1200.00)
                let priceText = row.getCell(4).text?.trim() || '0';
                // Remove R$ symbol
                priceText = priceText.replace(/^R\$\s?/, '');

                let price = 0;
                // Simple heuristic: if contains comma, treat as decimal separator
                if (priceText.includes(',')) {
                    priceText = priceText.replace(/\./g, '').replace(',', '.');
                    price = parseFloat(priceText);
                } else {
                    price = parseFloat(priceText);
                }

                if (isNaN(price)) price = 0;

                const typeStr = row.getCell(5).text?.trim().toUpperCase();
                const category = row.getCell(6).text?.trim();

                if (description && unit) {
                    let type = SinapiType.INPUT;
                    // Map user input to enum
                    if (typeStr) {
                        if (typeStr.includes('COMP') || typeStr.includes('SERVIÇO') || typeStr.includes('SERVICO')) type = SinapiType.COMPOSITION;
                        else if (typeStr.includes('INSUMO')) type = SinapiType.INPUT;
                    }

                    items.push({
                        code: code || `IMP-${Math.floor(Math.random() * 100000)}`,
                        description,
                        unit,
                        price,
                        type,
                        category: category || 'IMPORTADO',
                        source: 'Própria'
                    });
                }
            });

            if (items.length === 0) {
                setError("Nenhum item válido encontrado. Verifique se o arquivo não está vazio.");
                setIsLoading(false);
                return;
            }

            await onImport(items);
            onClose();
        } catch (err) {
            console.error("Erro ao processar arquivo:", err);
            setError("Erro ao processar o arquivo. Verifique o formato.");
        } finally {
            setIsLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                        Importar Base de Dados
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {!file ? (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer mb-4
                    ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'}`}
                        >
                            <input
                                type="file"
                                accept=".xlsx"
                                className="hidden"
                                id="db-excel-upload"
                                onChange={handleFileChange}
                            />
                            <label htmlFor="db-excel-upload" className="cursor-pointer w-full h-full flex flex-col items-center">
                                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                                <p className="font-medium text-gray-700">Clique para selecionar</p>
                                <p className="text-sm text-gray-400 mt-1">ou arraste seu arquivo Excel (.xlsx)</p>
                            </label>
                        </div>
                    ) : (
                        <div className="mb-6">
                            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100 mb-4">
                                <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800">{file.name}</p>
                                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {preview.length > 0 && (
                                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                                    <p className="font-bold text-gray-500 mb-2 uppercase">Pré-visualização ({preview.length} itens)</p>
                                    <div className="space-y-1">
                                        {preview.map((item, i) => (
                                            <div key={i} className="grid grid-cols-12 gap-2 border-b border-gray-100 pb-1 last:border-0">
                                                <div className="col-span-2 font-mono text-gray-400">{item.code}</div>
                                                <div className="col-span-6 truncate text-gray-700">{item.description}</div>
                                                <div className="col-span-2 text-right text-emerald-600 font-bold">R$ {item.price.toFixed(2)}</div>
                                                <div className="col-span-2 text-right text-gray-400">{item.unit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-blue-50 p-3 rounded-lg flex gap-3 text-xs text-blue-800 mb-6">
                        <HelpCircle className="w-5 h-5 shrink-0 text-blue-600" />
                        <div>
                            <p className="font-bold mb-1">Formato Esperado (Colunas):</p>
                            <p>1. Código (Opcional), 2. Descrição, 3. Unidade, 4. Preço Unitário, 5. Tipo (Insumo/Composição), 6. Categoria</p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={!file || isLoading}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {isLoading ? 'Processando...' : 'Importar Itens'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DatabaseExcelImportModal;
