import React from 'react';
import { X, Upload, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import ExcelJS from 'exceljs';
import { BudgetEntry } from '../types';

interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (projectData: { name: string, budget: BudgetEntry[], settings?: any }) => void;
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [file, setFile] = React.useState<File | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

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
    };

    const processFile = async () => {
        if (!file) return;

        setIsLoading(true);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);

            const worksheet = workbook.worksheets[0];

            // Parse settings from key-value pairs
            const settings: any = {};
            let projectName = file.name.replace('.xlsx', '');

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header

                const field = row.getCell(1).text.trim();
                const value = row.getCell(2).text.trim();

                // Map fields to settings properties
                if (field === 'Nome da Obra' && value) projectName = value;
                if (field === 'Cliente/Proprietário') settings.client = value;
                if (field === 'Endereço') settings.street = value;
                if (field === 'Número') settings.number = value;
                if (field === 'Complemento') settings.complement = value;
                if (field === 'Bairro') settings.neighborhood = value;
                if (field === 'Cidade') settings.city = value;
                if (field === 'Estado') settings.state = value;
                if (field === 'CEP') settings.zipCode = value;
                if (field === 'Observações') settings.notes = value;
                if (field === 'Localização (UF)') settings.location = value;
                if (field === 'Padrão Construtivo') settings.standard = value;
                if (field === 'Área Estimada (m²)') settings.area = Number(value) || 0;
                if (field === 'CUB (R$/m²)') settings.cubRate = Number(value) || 0;
                if (field === 'BDI (%)') settings.bdi = Number(value) || 0;
                if (field === 'Encargos Sociais (%)') settings.ls = Number(value) || 0;
                if (field === 'Base de Dados') settings.database = value || 'SINAPI';
                if (field === 'Mês de Referência') settings.referenceMonth = value;
                if (field === 'Modo de Encargos') settings.socialChargesMode = value;
                if (field === 'Salvamento Automático') settings.autoSave = value === 'Sim';
            });

            if (!projectName) {
                throw new Error("Nome da obra não encontrado no arquivo.");
            }

            onImport({ name: projectName, budget: [], settings });
            onClose();

        } catch (err) {
            console.error("Erro ao processar arquivo:", err);
            setError("Erro ao processar o arquivo. Verifique se é um Excel válido com dados da obra.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                        Importar do Excel
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">

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
                            id="excel-upload"
                            onChange={handleFileChange}
                        />
                        <label htmlFor="excel-upload" className="cursor-pointer w-full h-full flex flex-col items-center">
                            {file ? (
                                <>
                                    <FileSpreadsheet className="w-12 h-12 text-emerald-600 mb-3" />
                                    <p className="font-medium text-gray-900">{file.name}</p>
                                    <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                                    <p className="font-medium text-gray-700">Clique para selecionar</p>
                                    <p className="text-sm text-gray-400 mt-1">ou arraste seu arquivo aqui</p>
                                    <p className="text-xs text-gray-300 mt-2">Suporta apenas .xlsx</p>
                                </>
                            )}
                        </label>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={processFile}
                        disabled={!file || isLoading}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {isLoading ? 'Processando...' : 'Importar Obra'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExcelImportModal;
