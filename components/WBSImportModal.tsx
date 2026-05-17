import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, Check, X, ChevronRight, ChevronDown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { WBSGroup, WBSPhase } from '../types';

interface WBSImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (wbs: WBSGroup[]) => void;
}

export const WBSImportModal: React.FC<WBSImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [parsedWBS, setParsedWBS] = useState<WBSGroup[] | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        const files = e.dataTransfer.files;
        if (files.length > 0) processFile(files[0]);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = async (file: File) => {
        setFileName(file.name);
        setError(null);
        setParsedWBS(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const wbs = parseWBSFromData(jsonData as any[][]);
                if (wbs.length === 0) {
                    setError("Não foi possível identificar uma estrutura válida no arquivo.");
                } else {
                    setParsedWBS(wbs);
                }
            } catch (err) {
                console.error("Error parsing file:", err);
                setError("Erro ao ler o arquivo. Verifique se é um Excel válido.");
            }
        };
        reader.readAsBinaryString(file);
    };

    const parseWBSFromData = (data: any[][]): WBSGroup[] => {
        // Expected Logic:
        // Try to identify columns for Group, Phase, Subphase
        // Or strictly strictly assume columns A, B, C map to Group, Phase, Subphase names

        const wbs: WBSGroup[] = [];
        let currentGroup: WBSGroup | null = null;
        let currentPhase: WBSPhase | null = null;

        // Skip header if it looks like a header (optional, simple check)
        let startIndex = 0;
        if (data.length > 0 && typeof data[0][0] === 'string' &&
            (data[0][0].toLowerCase().includes('grupo') || data[0][0].toLowerCase().includes('item'))) {
            startIndex = 1;
        }

        for (let i = startIndex; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const groupName = row[0]?.toString().trim();
            const phaseName = row[1]?.toString().trim();
            const subPhaseName = row[2]?.toString().trim();

            if (groupName) {
                // Check if existing group or new
                // If it's a new group line
                if (!currentGroup || currentGroup.name !== groupName) {
                    // Create new group
                    currentGroup = {
                        id: (wbs.length + 1).toString().padStart(2, '0'),
                        name: groupName,
                        phases: []
                    };
                    wbs.push(currentGroup);
                    currentPhase = null; // Reset phase when group changes
                }
            }

            if (currentGroup && phaseName) {
                if (!currentPhase || currentPhase.name !== phaseName) {
                    currentPhase = {
                        id: `${currentGroup.id}.${(currentGroup.phases.length + 1).toString().padStart(2, '0')}`,
                        name: phaseName,
                        subPhases: []
                    };
                    currentGroup.phases.push(currentPhase);
                }
            }

            if (currentPhase && subPhaseName) {
                // Add subphase
                currentPhase.subPhases.push(subPhaseName);
            }
        }

        // Post-processing to ensure IDs and Names are clean/formatted
        return wbs.map((g, gIdx) => {
            const gId = (gIdx + 1).toString().padStart(2, '0');
            const gName = g.name.match(/^\d+\.?\s/) ? g.name : `${gId}. ${g.name}`;

            const phases = g.phases.map((p, pIdx) => {
                const pId = (pIdx + 1).toString().padStart(2, '0');
                const pName = p.name.match(/^\d+\.\d+\.?\s/) ? p.name : `${gId}.${pId}. ${p.name}`;

                const subPhases = p.subPhases.map((s, sIdx) => {
                    const sId = (sIdx + 1).toString().padStart(2, '0');
                    return s.match(/^\d+\.\d+\.\d+\.?\s/) ? s : `${gId}.${pId}.${sId}. ${s}`;
                });

                return { ...p, id: `${gId}.${pId}`, name: pName, subPhases };
            });

            return { ...g, id: gId, name: gName, phases };
        });
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ["Grupo", "Etapa", "Subetapa"],
            ["01. Serviços Preliminares", "", ""],
            ["01. Serviços Preliminares", "01. Projetos", ""],
            ["01. Serviços Preliminares", "01. Projetos", "Arquitetônico"],
            ["01. Serviços Preliminares", "01. Projetos", "Estrutural"],
            ["02. Estrutura", "01. Fundações", "Estacas"],
            ["02. Estrutura", "01. Fundações", "Blocos"],
            ["02. Estrutura", "02. Superestrutura", "Pilares"]
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo EAP");
        XLSX.writeFile(wb, "modelo_importacao_eap.xlsx");
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        Importar EAP (WBS)
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {!parsedWBS ? (
                        <div className="space-y-6">
                            <div
                                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className={`w-12 h-12 mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                                <p className="text-lg font-medium text-gray-700">Arrastar e soltar arquivo Excel aqui</p>
                                <p className="text-sm text-gray-500 mt-2">ou clique para selecionar</p>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".xlsx, .xls, .csv"
                                    onChange={handleFileSelect}
                                />
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    Importante
                                </h4>
                                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                                    <li>A importação <strong>substituirá</strong> a estrutura atual da EAP.</li>
                                    <li>Recomendamos usar o modelo padrão para garantir a formatação correta.</li>
                                    <li>O arquivo deve conter colunas para Grupo, Etapa e Subetapa.</li>
                                </ul>
                            </div>

                            <div className="flex justify-center">
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                                >
                                    <Download className="w-4 h-4" />
                                    Baixar Modelo de Planilha
                                </button>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-gray-700">Pré-visualização da Estrutura</h3>
                                <button
                                    onClick={() => setParsedWBS(null)}
                                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                                >
                                    Escolher outro arquivo
                                </button>
                            </div>

                            <div className="border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto bg-gray-50 p-2 text-sm">
                                {parsedWBS.map((group) => (
                                    <div key={group.id} className="mb-2">
                                        <div className="font-bold text-gray-800 py-1 px-2 bg-white rounded border border-gray-200 mb-1">
                                            {group.name}
                                        </div>
                                        <div className="pl-4 border-l-2 border-gray-200 ml-2 space-y-1">
                                            {group.phases.map((phase) => (
                                                <div key={phase.id}>
                                                    <div className="font-medium text-gray-700 py-0.5 flex items-center gap-1">
                                                        <ChevronRight className="w-3 h-3 text-gray-400" />
                                                        {phase.name}
                                                    </div>
                                                    {phase.subPhases.length > 0 && (
                                                        <div className="pl-5 text-gray-500 text-xs space-y-0.5">
                                                            {phase.subPhases.map((sub, idx) => (
                                                                <div key={idx} className="flex items-center gap-1">
                                                                    <div className="w-1 h-1 rounded-full bg-gray-300" />
                                                                    {sub}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    {parsedWBS && (
                        <button
                            onClick={() => onImport(parsedWBS)}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Confirmar Importação
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
