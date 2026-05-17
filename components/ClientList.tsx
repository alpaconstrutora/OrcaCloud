import React from 'react';
import { clientService } from '../services/clientService';
import { projectService } from '../services/projectService';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, LayoutDashboard, Table2, Building2 } from 'lucide-react';
import { Client } from '../types';
import ClientModal from './ClientModal';

interface ClientListProps {
    onClientsChange?: () => void;
    onSelectClient?: (client: Client) => void;
    organizationId?: string;
}

const ClientList: React.FC<ClientListProps> = ({ onClientsChange, onSelectClient, organizationId }) => {
    const [clients, setClients] = React.useState<Client[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedClient, setSelectedClient] = React.useState<Client | undefined>(undefined);
    const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
    const [categoryFilter, setCategoryFilter] = React.useState<string>('all');

    React.useEffect(() => {
        loadData();
    }, [organizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [clientsData, projectsData] = await Promise.all([
                clientService.listClients(organizationId),
                projectService.listProjects()
            ]);
            setClients(clientsData);
            setProjects(projectsData || []);
        } catch (error) {
            console.error("Erro ao listar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadClients = loadData; // Alias for compatibility with existing calls

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) {
            try {
                await clientService.deleteClient(id);
                setClients(clients.filter(c => c.id !== id));
                if (onClientsChange) onClientsChange();
            } catch (error) {
                console.error("Erro ao excluir cliente:", error);
                alert("Erro ao excluir o cliente.");
            }
        }
    };

    const handleOpenModal = (client?: Client) => {
        setSelectedClient(client);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: Partial<Client>) => {
        try {
            await clientService.saveClient(data);
            setIsModalOpen(false);
            loadClients();
            if (onClientsChange) onClientsChange();
        } catch (error) {
            console.error("Erro ao salvar cliente:", error);
            alert("Erro ao salvar o cliente.");
        }
    };

    const [sortBy, setSortBy] = React.useState<string>('name-asc');

    const filteredClients = React.useMemo(() => {
        return clients
            .filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.document?.includes(searchTerm)
            )
            .filter(c => categoryFilter === 'all' || c.category === categoryFilter)
            .sort((a, b) => {
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [clients, searchTerm, sortBy, categoryFilter]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Clientes</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua base de contatos e clientes com infraestrutura premium.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Novo Cliente
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
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Filtrar:</span>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="all">Todos os Tipos</option>
                        <option value="Vendas">Vendas</option>
                        <option value="Locação">Locação</option>
                        <option value="Serviços">Serviços</option>
                    </select>
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
            ) : filteredClients.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-200 border-dashed">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">Nenhum cliente encontrado</h3>
                    <p className="text-gray-500 font-medium">
                        {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre seu primeiro cliente no botão acima.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cliente</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tipo</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Contato</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Documento</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Obra Vinculada</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredClients.map(client => (
                                    <tr key={client.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                    {client.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${client.category === 'Vendas' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                client.category === 'Locação' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                    client.category === 'Serviços' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                        'bg-gray-50 text-gray-400 border-gray-100'
                                                }`}>
                                                {client.category || 'Não definido'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                {client.email && (
                                                    <div className="flex items-center text-xs text-gray-600">
                                                        <Mail className="w-3 h-3 mr-1.5 text-blue-500" />
                                                        {client.email}
                                                    </div>
                                                )}
                                                {client.phone && (
                                                    <div className="flex items-center text-xs text-gray-600">
                                                        <Phone className="w-3 h-3 mr-1.5" />
                                                        {client.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-gray-600">{client.document || '-'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const clientProjects = projects.filter(p =>
                                                    p.settings?.clientId === client.id &&
                                                    p.settings?.classification === 'OBRA'
                                                );

                                                if (clientProjects.length === 0) {
                                                    return <span className="text-gray-400 text-sm">-</span>;
                                                }

                                                return (
                                                    <div className="flex flex-col gap-1.5">
                                                        {clientProjects.map(p => (
                                                            <div key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                                                                <Building2 className="w-3.5 h-3.5 text-blue-500" />
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
                                                {onSelectClient && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const fullClient = await clientService.getById(client.id);
                                                                if (fullClient) onSelectClient(fullClient);
                                                            } catch (error) {
                                                                console.error("Erro ao carregar dados completos do cliente:", error);
                                                                alert("Erro ao carregar os dados do portal deste cliente.");
                                                            }
                                                        }}
                                                        className="p-2 text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg transition-colors"
                                                        title="Acessar Portal"
                                                    >
                                                        <LayoutDashboard className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleOpenModal(client)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(client.id, client.name)}
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
                        {filteredClients.map(client => (
                            <div
                                key={client.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group flex flex-col"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-center mb-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4">
                                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                {client.name}
                                            </h3>
                                            <div className="flex gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {client.type === 'PF' ? 'PF' : 'PJ'}
                                                </span>
                                                {client.category && (
                                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${client.category === 'Vendas' ? 'bg-emerald-100 text-emerald-700' :
                                                        client.category === 'Locação' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {client.category}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        {client.email && (
                                            <div className="flex items-center text-sm text-gray-600 underline-offset-4 hover:underline cursor-pointer font-medium">
                                                <Mail className="w-4 h-4 mr-2 text-blue-500" />
                                                <span className="truncate">{client.email}</span>
                                            </div>
                                        )}
                                        {client.phone && (
                                            <div className="flex items-center text-sm text-gray-600 font-medium">
                                                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                                <span>{client.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-[11px] pt-2">
                                            <span className="text-gray-400 uppercase tracking-widest font-bold">Documento</span>
                                            <span className="text-gray-900 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{client.document || '-'}</span>
                                        </div>

                                        {/* Linked Projects for Grid View */}
                                        {(() => {
                                            const clientProjects = projects.filter(p =>
                                                p.settings?.clientId === client.id &&
                                                p.settings?.classification === 'OBRA'
                                            );

                                            if (clientProjects.length > 0) {
                                                return (
                                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-2">Obra Vinculada</span>
                                                        <div className="space-y-1">
                                                            {clientProjects.slice(0, 2).map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-xs text-gray-700 bg-blue-50/50 p-1.5 rounded-md border border-blue-100/50">
                                                                    <Building2 className="w-3 h-3 text-blue-500" />
                                                                    <span className="font-medium truncate">{p.name}</span>
                                                                </div>
                                                            ))}
                                                            {clientProjects.length > 2 && (
                                                                <span className="text-[10px] text-gray-400 pl-1">
                                                                    + {clientProjects.length - 2} outras obras
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

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-[2rem] border-t border-gray-100 flex justify-end gap-2">
                                    {onSelectClient && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const fullClient = await clientService.getById(client.id);
                                                    if (fullClient) onSelectClient(fullClient);
                                                } catch (error) {
                                                    console.error("Erro ao carregar dados completos do cliente:", error);
                                                    alert("Erro ao carregar os dados do portal deste cliente.");
                                                }
                                            }}
                                            className="p-2 text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-xl transition-all shadow-sm border border-transparent hover:border-indigo-100"
                                            title="Acessar Portal"
                                        >
                                            <LayoutDashboard className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleOpenModal(client)}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(client.id, client.name)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )
            }

            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={selectedClient}
            />
        </div >
    );
};

export default ClientList;
