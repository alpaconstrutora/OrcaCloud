import React, { useState, useEffect } from 'react';
import { X, Save, FileType, Link as LinkIcon, Building2 } from 'lucide-react';
import { BrokerMaterial } from '../types';
import { ProjectData } from '../services/projectService';
import { brokerMaterialService } from '../services/brokerMaterialService';
import { UploadCloud, Loader2 } from 'lucide-react';

interface MaterialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<BrokerMaterial>) => void;
    initialData?: BrokerMaterial;
    projects: ProjectData[];
    organizationId: string;
}

const MATERIAL_TYPES = [
    { value: 'BOOK', label: 'Book Digital' },
    { value: 'PLANTA', label: 'Planta Baixa' },
    { value: 'RENDER', label: 'Render / Foto' },
    { value: 'VIDEO', label: 'Vídeo' },
    { value: 'TOUR_360', label: 'Tour 360°' },
    { value: 'MEMORIAL', label: 'Memorial Descritivo' },
    { value: 'TABELA', label: 'Tabela de Preços' }
];

const MaterialModal: React.FC<MaterialModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    projects,
    organizationId
}) => {
    const [formData, setFormData] = useState<Partial<BrokerMaterial>>({
        title: '',
        type: 'BOOK',
        file_url: '',
        project_id: '',
        project_name: '',
        version: 1,
        is_active: true,
        organization_id: organizationId
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                title: '',
                type: 'BOOK',
                file_url: '',
                project_id: '',
                project_name: '',
                version: 1,
                is_active: true,
                organization_id: organizationId
            });
        }
        setSelectedFile(null);
        setIsUploading(false);
    }, [initialData, isOpen, organizationId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!initialData?.file_url && !selectedFile) {
            alert('Por favor, selecione um arquivo para upload.');
            return;
        }

        try {
            setIsUploading(true);

            let uploadedUrl = formData.file_url;
            if (selectedFile) {
                uploadedUrl = await brokerMaterialService.uploadMaterialFile(organizationId, selectedFile);
            }

            // Find project name based on selection
            let projectName = formData.project_name || '';
            if (formData.project_id) {
                const project = projects.find(p => p.id === formData.project_id);
                if (project) {
                    projectName = project.name;
                }
            } else {
                projectName = 'Geral (Todos)';
            }

            onSave({
                ...formData,
                project_id: formData.project_id || undefined, // FIX for empty UUID
                file_url: uploadedUrl,
                project_name: projectName
            });
        } catch (error: any) {
            alert(error.message || 'Erro ao fazer upload do arquivo.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                            {initialData ? 'Editar Material de Venda' : 'Novo Material de Venda'}
                        </h2>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Disponibilize arquivos e links para o Portal do Corretor.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-xl transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                        {/* Title */}
                        <div>
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                                Título do Material *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Ex: Book Completo - Fase 1"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-gray-900"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Type */}
                            <div>
                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                                    <FileType className="w-4 h-4 inline-block mr-1" />
                                    Tipo do Documento *
                                </label>
                                <select
                                    required
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value as BrokerMaterial['type'] })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-gray-900"
                                >
                                    {MATERIAL_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Project Link */}
                            <div>
                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                                    <Building2 className="w-4 h-4 inline-block mr-1" />
                                    Vincular a Empreendimento
                                </label>
                                <select
                                    value={formData.project_id || ''}
                                    onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-gray-900"
                                >
                                    <option value="">Nenhum (Material Geral)</option>
                                    {projects.map(proj => (
                                        <option key={proj.id} value={proj.id}>{proj.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* File Upload Div */}
                        <div>
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                                <UploadCloud className="w-4 h-4 inline-block mr-1" />
                                Arquivo do Documento *
                            </label>

                            <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl transition-colors ${selectedFile ? 'bg-blue-50/50 border-blue-400' : 'hover:border-blue-400 bg-gray-50'}`}>
                                <div className="space-y-1 text-center">
                                    <UploadCloud className={`mx-auto h-10 w-10 ${selectedFile ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <div className="flex text-sm text-gray-600 justify-center">
                                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-2 py-1">
                                            <span>Faça upload do arquivo</span>
                                            <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setSelectedFile(e.target.files[0]);
                                                }
                                            }} />
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        {selectedFile ? <span className="text-blue-600 font-bold">{selectedFile.name}</span> : (formData.file_url ? 'Arquivo já enviado (Envie outro para substituir)' : 'PDF, Imagens, Tabelas ou Zip até 50MB')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Version */}
                            <div>
                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                                    Versão
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.version}
                                    onChange={(e) => setFormData({ ...formData, version: parseInt(e.target.value) || 1 })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-gray-900"
                                />
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center pt-8">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_active}
                                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">
                                        Material Ativo
                                    </span>
                                </label>
                            </div>
                        </div>

                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 mt-8">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="px-6 py-3 bg-blue-600 disabled:bg-blue-400 text-white font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center gap-2"
                        >
                            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {isUploading ? 'Enviando...' : 'Salvar Material'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MaterialModal;
