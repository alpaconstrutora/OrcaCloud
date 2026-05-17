import React, { useState, useMemo } from 'react';
import { FileImage, Video, Eye, Download, ExternalLink, Search, BookOpen, Map, Camera, Play, FileText, Table2, Plus, Edit, Trash2 } from 'lucide-react';
import type { BrokerMaterial } from '../../types';

interface BrokerMaterialsProps {
    organizationId: string;
}

const TYPE_CONFIG: Record<BrokerMaterial['type'], { label: string; icon: any; color: string; bg: string }> = {
    BOOK: { label: 'Book Digital', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    PLANTA: { label: 'Planta Baixa', icon: Map, color: 'text-blue-600', bg: 'bg-blue-50' },
    RENDER: { label: 'Render / Foto', icon: Camera, color: 'text-purple-600', bg: 'bg-purple-50' },
    VIDEO: { label: 'Vídeo', icon: Play, color: 'text-red-600', bg: 'bg-red-50' },
    TOUR_360: { label: 'Tour 360°', icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    MEMORIAL: { label: 'Memorial', icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
    TABELA: { label: 'Tabela', icon: Table2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
};
import { brokerMaterialService } from '../../services/brokerMaterialService';
import { supabase } from '../../lib/supabase';
import { projectService, ProjectData } from '../../services/projectService';
import MaterialModal from '../MaterialModal';

const BrokerMaterials: React.FC<BrokerMaterialsProps> = ({ organizationId }) => {
    const [materials, setMaterials] = useState<BrokerMaterial[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<BrokerMaterial['type'] | 'all'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<BrokerMaterial | undefined>(undefined);

    React.useEffect(() => {
        loadMaterials();
    }, [organizationId]);

    const loadMaterials = async () => {
        try {
            setIsLoading(true);
            const [data, projectsData] = await Promise.all([
                brokerMaterialService.listMaterials(organizationId),
                projectService.listProjects()
            ]);
            setMaterials(data);
            setProjects(projectsData ? projectsData.map(p => ({ ...p, budget: [] })) : []);
        } catch (error) {
            console.error('Failed to load materials or projects:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMaterialClick = async (material: BrokerMaterial) => {
        if (!material.file_url) return;
        
        try {
            await brokerMaterialService.incrementViewsCount(material.id);
            setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, views_count: (m.views_count || 0) + 1 } : m));
        } catch (e) {
            console.error(e);
        }

        window.open(material.file_url, '_blank');
    };

    const handleSaveMaterial = async (data: Partial<BrokerMaterial>) => {
        try {
            await brokerMaterialService.saveMaterial(data);
            setIsMaterialModalOpen(false);
            setEditingMaterial(undefined);
            loadMaterials();
        } catch (err: any) {
            alert('Erro ao salvar material: ' + (err.message || 'Erro desconhecido'));
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        if (window.confirm('Excluir permanentemente este material de divulgação?')) {
            try {
                await brokerMaterialService.deleteMaterial(id);
                loadMaterials();
            } catch (err: any) {
                alert('Erro ao excluir: ' + (err.message || 'Erro desconhecido'));
            }
        }
    };

    const filtered = useMemo(() => {
        let result = materials;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(m => m.title.toLowerCase().includes(q) || m.project_name.toLowerCase().includes(q));
        }
        if (typeFilter !== 'all') result = result.filter(m => m.type === typeFilter);
        return result;
    }, [materials, search, typeFilter]);

    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        materials.forEach(m => { counts[m.type] = (counts[m.type] || 0) + 1; });
        return counts;
    }, [materials]);

    const gradients = [
        'from-indigo-500 to-purple-600',
        'from-blue-500 to-cyan-500',
        'from-emerald-500 to-teal-500',
        'from-amber-500 to-orange-500',
        'from-red-500 to-pink-500',
        'from-purple-500 to-indigo-500',
        'from-slate-600 to-slate-800',
    ];

    return (
        <div className="space-y-6">
            {/* Search & Filters */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar material..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Grid</button>
                        <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Lista</button>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setEditingMaterial(undefined);
                        setIsMaterialModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Novo Material
                </button>
            </div>

            {/* Type Filters */}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setTypeFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${typeFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    Todos ({materials.length})
                </button>
                {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
                    const count = typeCounts[type] || 0;
                    if (count === 0) return null;
                    const Icon = cfg.icon;
                    return (
                        <button key={type} onClick={() => setTypeFilter(type as BrokerMaterial['type'])}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${typeFilter === type ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map((mat, i) => {
                        const cfg = TYPE_CONFIG[mat.type];
                        const Icon = cfg.icon;
                        const gradient = gradients[i % gradients.length];

                        return (
                            <div key={mat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all group">
                                {/* Preview Area */}
                                <div className={`h-36 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
                                    <Icon className="w-12 h-12 text-white/30" />
                                    <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/30 backdrop-blur-sm text-white text-[10px] font-bold">
                                        v{mat.version}
                                    </div>
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <button 
                                            onClick={() => handleMaterialClick(mat)}
                                            className="p-3 bg-white rounded-xl shadow-lg transform scale-75 group-hover:scale-100 transition-all cursor-pointer z-10">
                                            <ExternalLink className="w-5 h-5 text-gray-900" />
                                        </button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color} mb-2`}>
                                        <Icon className="w-3 h-3" />{cfg.label}
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900 leading-tight mb-1 line-clamp-2">{mat.title}</h3>
                                    <p className="text-[10px] text-gray-400">{mat.project_name || 'Geral'}</p>

                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                        <div className="flex items-center gap-1 text-gray-400">
                                            <Eye className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold">{mat.views_count} views</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => { setEditingMaterial(mat); setIsMaterialModalOpen(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-indigo-600" title="Editar">
                                                <Edit className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDeleteMaterial(mat.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-red-500" title="Excluir">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Material</th>
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Tipo</th>
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Versão</th>
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Views</th>
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Atualizado</th>
                                <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(mat => {
                                const cfg = TYPE_CONFIG[mat.type];
                                const Icon = cfg.icon;
                                return (
                                    <tr key={mat.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4">
                                            <p className="text-sm font-bold text-gray-900">{mat.title}</p>
                                            <p className="text-[10px] text-gray-400">{mat.project_name || 'Geral'}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                                                <Icon className="w-3 h-3" />{cfg.label}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs font-bold text-gray-600">v{mat.version}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 text-gray-500">
                                                <Eye className="w-3.5 h-3.5" />
                                                <span className="text-xs font-bold">{mat.views_count}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs text-gray-500">{mat.updated_at ? new Date(mat.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-1">
                                                <button onClick={() => handleMaterialClick(mat)} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Visualizar"><ExternalLink className="w-4 h-4 text-emerald-500" /></button>
                                                <button onClick={() => { setEditingMaterial(mat); setIsMaterialModalOpen(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-indigo-600" title="Editar"><Edit className="w-4 h-4" /></button>
                                                <button onClick={() => handleDeleteMaterial(mat.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {filtered.length === 0 && !isLoading && (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <FileImage className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold">Nenhum material encontrado.</p>
                </div>
            )}

            {isLoading && (
                <div className="text-center py-16">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-4"></div>
                    <p className="text-sm text-gray-400">Carregando materiais...</p>
                </div>
            )}

            <MaterialModal
                isOpen={isMaterialModalOpen}
                onClose={() => { setIsMaterialModalOpen(false); setEditingMaterial(undefined); }}
                onSave={handleSaveMaterial}
                initialData={editingMaterial}
                projects={projects}
                organizationId={organizationId}
            />
        </div>
    );
};

export default BrokerMaterials;
