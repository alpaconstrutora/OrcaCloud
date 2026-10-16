import React, { useState, useMemo } from 'react';
import { avisarAcaoDoPortal } from '../../utils/portalEventos';
import { FileImage, Video, Eye, Download, ExternalLink, Search, BookOpen, Map, Camera, Play, FileText, Table2, Plus } from 'lucide-react';
import { brokerPortalService } from '../../services/brokerPortalService';
import ActionIconButton from '../ui/ActionIconButton';
import type { BrokerMaterial } from '../../types';

interface BrokerMaterialsProps {
    organizationId: string;
    /**
     * Link do corretor (anon ou login por e-mail): lê pela RPC
     * fn_broker_portal_get_materials e NÃO oferece criar/editar/excluir — isso é
     * do gestor. Sem token, é a visão do gestor de sempre.
     */
    portalToken?: string;
    /** Celular: uma linha tocável por material (o "abrir" do cartão era hover). */
    compacto?: boolean;
}

const TYPE_CONFIG: Record<BrokerMaterial['type'], { label: string; icon: React.ElementType; color: string; bg: string }> = {
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
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';

const BrokerMaterials: React.FC<BrokerMaterialsProps> = ({ organizationId, portalToken, compacto = false }) => {
    // Criar/editar/excluir material é do gestor; o corretor só vê e baixa.
    // Na casca do celular (compacto) também não: até na prévia ela mostra o que o
    // corretor vê.
    const podeGerir = !portalToken && !compacto;
    const confirm = useConfirm();
    const [materials, setMaterials] = useState<BrokerMaterial[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // Busca sobrevive a navegar entre abas e recarregar (guia §3).
    const [search, setSearch] = usePersistedState<string>('brokerMaterials:busca', '');
    const [typeFilter, setTypeFilter] = useState<BrokerMaterial['type'] | 'all'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<BrokerMaterial | undefined>(undefined);

    React.useEffect(() => {
        loadMaterials();
    }, [organizationId, portalToken]);

    const loadMaterials = async () => {
        if (portalToken) {
            try {
                setIsLoading(true);
                setMaterials(await brokerPortalService.getMaterialsByToken(portalToken) as BrokerMaterial[]);
            } catch (error) {
                console.error('Failed to load materials by token:', error);
            } finally {
                setIsLoading(false);
            }
            return;
        }
        try {
            setIsLoading(true);
            const [data, projectsData] = await Promise.all([
                brokerMaterialService.listMaterials(organizationId),
                // Só OBRA (default): esta lista alimenta o seletor "Vincular a
                // Empreendimento" do MaterialModal, que GRAVA project_id. Oferecer
                // orçamento/planejamento aqui é a regra #3 furada na escrita.
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
        
        // Pelo link não há como gravar (a tabela é protegida por RLS): a contagem
        // de visualizações fica só para quem abre logado como gestor.
        if (!portalToken) {
            try {
                await brokerMaterialService.incrementViewsCount(material.id);
                setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, views_count: (m.views_count || 0) + 1 } : m));
            } catch (e) {
                console.error(e);
            }
        }

        avisarAcaoDoPortal('baixou-material');
        window.open(material.file_url, '_blank');
    };

    const handleSaveMaterial = async (data: Partial<BrokerMaterial>) => {
        try {
            await brokerMaterialService.saveMaterial(data);
            setIsMaterialModalOpen(false);
            setEditingMaterial(undefined);
            loadMaterials();
        } catch (err: unknown) {
            alert('Erro ao salvar material: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir material?',
            message: 'O material de divulgação será excluído permanentemente e some do portal dos corretores.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) {
            try {
                await brokerMaterialService.deleteMaterial(id);
                loadMaterials();
            } catch (err: unknown) {
                alert('Erro ao excluir: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
            }
        }
    };

    const filtered = useMemo(() => {
        let result = materials;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(m => (m.title || '').toLowerCase().includes(q) || (m.project_name || '').toLowerCase().includes(q));
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
        <div className={compacto ? 'space-y-4' : 'space-y-6'}>
            {/* Search & Filters */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar material..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <div className={`${compacto ? 'hidden' : 'flex'} bg-gray-100 rounded-xl p-1`}>
                        <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-form-input font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Grid</button>
                        <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-button font-bold transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Lista</button>
                    </div>
                </div>
                {podeGerir && (
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
                )}
            </div>

            {/* Type Filters — no celular, faixa rolável */}
            <div className={compacto ? 'flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide [&>button]:shrink-0 [&>button]:whitespace-nowrap' : 'flex flex-wrap gap-2'}>
                <button onClick={() => setTypeFilter('all')}
                    className={`px-4 py-2 rounded-xl text-button font-bold border transition-all ${typeFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
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

            {/* Celular: uma linha tocável por material */}
            {compacto && filtered.length > 0 && (
                <ul className="space-y-2">
                    {filtered.map(mat => {
                        const cfg = TYPE_CONFIG[mat.type] ?? TYPE_CONFIG.BOOK;
                        const Icon = cfg.icon;
                        return (
                            <li key={mat.id}>
                                <button
                                    type="button"
                                    onClick={() => handleMaterialClick(mat)}
                                    disabled={!mat.file_url}
                                    title={mat.file_url ? 'Abrir o material' : 'Material sem arquivo'}
                                    className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-left active:bg-gray-50 disabled:opacity-60"
                                >
                                    <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                                        <Icon className={`w-5 h-5 ${cfg.color}`} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-bold text-gray-900 line-clamp-2">{mat.title}</span>
                                        <span className="block text-xs text-gray-500 mt-0.5">
                                            {cfg.label}{mat.version ? ` · v${mat.version}` : ''}{mat.project_name ? ` · ${mat.project_name}` : ''}
                                        </span>
                                    </span>
                                    <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Grid View */}
            {!compacto && viewMode === 'grid' && (
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
                                    <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/30 backdrop-blur-sm text-white text-xs font-bold">
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
                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${cfg.bg} ${cfg.color} mb-2`}>
                                        <Icon className="w-3 h-3" />{cfg.label}
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900 leading-tight mb-1 line-clamp-2">{mat.title}</h3>
                                    <p className="text-xs text-gray-400">{mat.project_name || 'Geral'}</p>

                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                        <div className="flex items-center gap-1 text-gray-400">
                                            <Eye className="w-3.5 h-3.5" />
                                            <span className="text-xs font-bold">{mat.views_count} views</span>
                                        </div>
                                        {podeGerir && (
                                        <div className="flex gap-1.5">
                                            <ActionIconButton kind="edit" size="sm" onClick={() => { setEditingMaterial(mat); setIsMaterialModalOpen(true); }} />
                                            <ActionIconButton kind="delete" size="sm" onClick={() => handleDeleteMaterial(mat.id)} />
                                        </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {!compacto && viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Material</th>
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Tipo</th>
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Versão</th>
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Views</th>
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Atualizado</th>
                                <th className="text-left p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(mat => {
                                const cfg = TYPE_CONFIG[mat.type];
                                const Icon = cfg.icon;
                                return (
                                    <tr key={mat.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4">
                                            <p className="text-sm font-normal text-gray-900">{mat.title}</p>
                                            <p className="text-xs text-gray-400">{mat.project_name || 'Geral'}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1 text-sm font-normal ${cfg.color}`}>
                                                <Icon className="w-3 h-3" />{cfg.label}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-normal text-gray-600">v{mat.version}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 text-gray-500">
                                                <Eye className="w-3.5 h-3.5" />
                                                <span className="text-sm font-normal">{mat.views_count}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs text-gray-500">{mat.updated_at ? new Date(mat.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-1">
                                                <button onClick={() => handleMaterialClick(mat)} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Visualizar"><ExternalLink className="w-4 h-4 text-emerald-500" /></button>
                                                {podeGerir && <ActionIconButton kind="edit" onClick={() => { setEditingMaterial(mat); setIsMaterialModalOpen(true); }} />}
                                                {podeGerir && <ActionIconButton kind="delete" onClick={() => handleDeleteMaterial(mat.id)} />}
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

            {podeGerir && (
            <MaterialModal
                isOpen={isMaterialModalOpen}
                onClose={() => { setIsMaterialModalOpen(false); setEditingMaterial(undefined); }}
                onSave={handleSaveMaterial}
                initialData={editingMaterial}
                projects={projects}
                organizationId={organizationId}
            />
            )}
        </div>
    );
};

export default BrokerMaterials;
