import React, { useState, useEffect } from 'react';
import { Save, Trash2, Download, X, FileText, Check, Plus } from 'lucide-react';
import { WBSGroup } from '../types';

interface WBSTemplate {
    id: string;
    name: string;
    wbs: WBSGroup[];
    createdAt: string;
}

interface WBSTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentWBS: WBSGroup[];
    onLoadTemplate: (wbs: WBSGroup[]) => void;
}

export const WBSTemplateModal: React.FC<WBSTemplateModalProps> = ({
    isOpen,
    onClose,
    currentWBS,
    onLoadTemplate
}) => {
    const [templates, setTemplates] = useState<WBSTemplate[]>([]);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [mode, setMode] = useState<'LIST' | 'SAVE'>('LIST');

    useEffect(() => {
        if (isOpen) {
            loadTemplates();
        }
    }, [isOpen]);

    const loadTemplates = () => {
        const saved = localStorage.getItem('wbs_templates');
        if (saved) {
            setTemplates(JSON.parse(saved));
        }
    };

    const handleSaveTemplate = () => {
        if (!newTemplateName.trim()) return;

        const newTemplate: WBSTemplate = {
            id: crypto.randomUUID(),
            name: newTemplateName,
            wbs: currentWBS,
            createdAt: new Date().toISOString()
        };

        const updatedTemplates = [...templates, newTemplate];
        localStorage.setItem('wbs_templates', JSON.stringify(updatedTemplates));
        setTemplates(updatedTemplates);
        setNewTemplateName('');
        setMode('LIST');
        alert('Modelo salvo com sucesso!');
    };

    const handleDeleteTemplate = (id: string) => {
        if (confirm('Tem certeza que deseja excluir este modelo?')) {
            const updatedTemplates = templates.filter(t => t.id !== id);
            localStorage.setItem('wbs_templates', JSON.stringify(updatedTemplates));
            setTemplates(updatedTemplates);
        }
    };

    const handleLoad = (template: WBSTemplate) => {
        if (confirm(`Deseja carregar o modelo "${template.name}"? A estrutura atual será substituída.`)) {
            onLoadTemplate(template.wbs);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Gerenciar Modelos de EAP
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                    {mode === 'LIST' ? (
                        <div className="space-y-4">
                            <button
                                onClick={() => setMode('SAVE')}
                                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
                            >
                                <Plus className="w-5 h-5" />
                                Salvar EAP Atual como Modelo
                            </button>

                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Modelos Salvos</h3>
                                {templates.length === 0 ? (
                                    <p className="text-sm text-gray-400 italic text-center py-4">Nenhum modelo salvo.</p>
                                ) : (
                                    templates.map(template => (
                                        <div key={template.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all group">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-800">{template.name}</h4>
                                                <p className="text-xs text-gray-400">{new Date(template.createdAt).toLocaleDateString()}</p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleLoad(template)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Carregar Modelo"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTemplate(template.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                                    title="Excluir Modelo"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Modelo</label>
                                <input
                                    type="text"
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                    placeholder="Ex: Padrão Minha Casa Minha Vida"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setMode('LIST')}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveTemplate}
                                    disabled={!newTemplateName.trim()}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Salvar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
