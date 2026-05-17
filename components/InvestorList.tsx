import React from 'react';
import { investorService, Investor } from '../services/investorService';
import { projectService } from '../services/projectService';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, TrendingUp, LayoutDashboard, Table2, Building2 } from 'lucide-react';
import InvestorModal from './InvestorModal';

interface InvestorListProps {
    onInvestorsChange?: () => void;
    organizationId?: string;
}

const InvestorList: React.FC<InvestorListProps> = ({ onInvestorsChange, organizationId }) => {
    const [investors, setInvestors] = React.useState<Investor[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedInvestor, setSelectedInvestor] = React.useState<Investor | undefined>(undefined);
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');

    React.useEffect(() => {
        loadData();
    }, [organizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [investorsData, projectsData] = await Promise.all([
                investorService.listInvestors(organizationId),
                projectService.listProjects()
            ]);
            setInvestors(investorsData);
            setProjects(projectsData || []);
        } catch (error) {
            console.error("Erro ao listar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadInvestors = loadData;

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o investidor "${name}"?`)) {
            try {
                await investorService.deleteInvestor(id);
                setInvestors(investors.filter(i => i.id !== id));
            } catch (error) {
                console.error("Erro ao excluir investidor:", error);
                alert("Erro ao excluir o investidor.");
            }
        }
    };

    const handleOpenModal = (investor?: Investor) => {
        setSelectedInvestor(investor);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: Partial<Investor>) => {
        try {
            const saved = await investorService.saveInvestor(data);
            setIsModalOpen(false);
            loadInvestors();
            return saved;
        } catch (error: any) {
            console.error("Erro ao salvar investidor:", error);
            alert(`Erro ao salvar o investidor: ${error.message || 'Erro desconhecido'}`);
            throw error;
        }
    };

    const [sortBy, setSortBy] = React.useState<string>('name-asc');

    const filteredInvestors = React.useMemo(() => {
        return investors
            .filter(i =>
                i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.document?.includes(searchTerm)
            )
            .sort((a, b) => {
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [investors, searchTerm, sortBy]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Nossos Investidores</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua base de investidores e sócios com transparência e alta performance.</p>
                </div>
                <button
                    onClick={() => { setSelectedInvestor(undefined); handleOpenModal(); }}
                    className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Novo Investidor
                </button>
            </div>

            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                        <option value="recent">Mais Recentes</option>
                    </select>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : filteredInvestors.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-200 border-dashed">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">Nenhum investidor encontrado</h3>
                    <p className="text-gray-500 font-medium">
                        {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre seu primeiro investidor no botão acima.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Investidor</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Acesso / Contato</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Documento</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Obra Vinculada</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredInvestors.map(investor => (
                                    <tr key={investor.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mr-3">
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">{investor.name}</div>
                                                    <div className="text-xs text-gray-500">Perfil Investidor</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center text-xs text-gray-600">
                                                    <Mail className="w-3 h-3 mr-1.5 text-purple-500" />
                                                    <span className="font-medium">{investor.email}</span>
                                                </div>
                                                {investor.phone && (
                                                    <div className="flex items-center text-xs text-gray-600">
                                                        <Phone className="w-3 h-3 mr-1.5" />
                                                        {investor.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-gray-600">{investor.document || '-'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const investorProjects = projects.filter(p =>
                                                    p.settings?.investorId === investor.id &&
                                                    p.settings?.classification === 'OBRA'
                                                );

                                                if (investorProjects.length === 0) {
                                                    return <span className="text-gray-400 text-sm">-</span>;
                                                }

                                                return (
                                                    <div className="flex flex-col gap-1.5">
                                                        {investorProjects.map(p => (
                                                            <div key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                                                                <Building2 className="w-3.5 h-3.5 text-purple-500" />
                                                                <span className="font-medium truncate max-w-[200px]" title={p.name}>
                                                                    {p.name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenModal(investor)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(investor.id, investor.name)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredInvestors.map(investor => (
                            <div
                                key={investor.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group flex flex-col"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-center mb-4">
                                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4">
                                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                                                {investor.name}
                                            </h3>
                                            <span className="text-xs text-gray-500 bg-purple-50 px-2 py-0.5 rounded-full">Investidor</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        <div className="flex items-center text-sm text-gray-600">
                                            <Mail className="w-4 h-4 mr-2 text-purple-500" />
                                            <span className="truncate">{investor.email}</span>
                                        </div>
                                        {investor.phone && (
                                            <div className="flex items-center text-sm text-gray-600">
                                                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                                <span>{investor.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs pt-2">
                                            <span className="text-gray-400 uppercase tracking-wider font-semibold">Documento</span>
                                            <span className="text-gray-700 font-medium bg-gray-100 px-2 py-0.5 rounded">{investor.document || '-'}</span>
                                        </div>

                                        {/* Linked Projects for Grid View */}
                                        {(() => {
                                            const investorProjects = projects.filter(p =>
                                                p.settings?.investorId === investor.id &&
                                                p.settings?.classification === 'OBRA'
                                            );

                                            if (investorProjects.length > 0) {
                                                return (
                                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-2">Obra Vinculada</span>
                                                        <div className="space-y-1">
                                                            {investorProjects.slice(0, 2).map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-xs text-gray-700 bg-purple-50/50 p-1.5 rounded-md border border-purple-100/50">
                                                                    <Building2 className="w-3 h-3 text-purple-500" />
                                                                    <span className="font-medium truncate">{p.name}</span>
                                                                </div>
                                                            ))}
                                                            {investorProjects.length > 2 && (
                                                                <span className="text-[10px] text-gray-400 pl-1">
                                                                    + {investorProjects.length - 2} outras obras
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100 flex justify-end gap-2">
                                    <button
                                        onClick={() => handleOpenModal(investor)}
                                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-white rounded-lg transition-all shadow-sm"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(investor.id, investor.name)}
                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg transition-all shadow-sm"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            <InvestorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={selectedInvestor}
            />
        </div>
    );
};

export default InvestorList;
