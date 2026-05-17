import React from 'react';
import { Search, Plus, Edit2, Trash2, Truck, Mail, Phone, Tag, LayoutDashboard, Table2, Loader2 } from 'lucide-react';
import { Supplier } from '../types';
import { supplierService } from '../services/supplierService';
import { SupplierModal } from './SupplierModal';
import { SupplierCategoryModal } from './SupplierCategoryModal';

interface SupplierListProps {
    organizationId?: string;
}

export const SupplierList: React.FC<SupplierListProps> = ({ organizationId }) => {
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isIdInitialized, setIsIdInitialized] = React.useState(false);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = React.useState(false);
    const [editingSupplier, setEditingSupplier] = React.useState<Supplier | undefined>();
    const [sortBy, setSortBy] = React.useState<string>('name-asc');
    const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');

    const loadSuppliers = async () => {
        setIsLoading(true);
        try {
            const data = await supplierService.listSuppliers(organizationId);
            setSuppliers(data);
        } catch (error) {
            console.error("Erro ao listar fornecedores:", error);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        loadSuppliers();
    }, [organizationId]);

    const handleAdd = async (data: Partial<Supplier>) => {
        try {
            // Convert empty strings to null for unique/optional fields
            const sanitizedData = Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
            );

            const payload = {
                ...sanitizedData,
                organization_id: organizationId
            };
            await supplierService.addSupplier(payload as Omit<Supplier, 'id' | 'created_at'>);
            setIsModalOpen(false);
            loadSuppliers();
        } catch (error) {
            console.error("Erro ao adicionar fornecedor:", error);
            alert("Erro ao adicionar o fornecedor.");
        }
    };

    const handleEdit = async (data: Partial<Supplier>) => {
        try {
            if (!editingSupplier?.id) return;
            // Convert empty strings to null for unique/optional fields
            const sanitizedData = Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
            );

            await supplierService.updateSupplier(editingSupplier.id, sanitizedData);
            setIsModalOpen(false);
            loadSuppliers();
        } catch (error) {
            console.error("Erro ao editar fornecedor:", error);
            alert("Erro ao editar o fornecedor.");
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o fornecedor "${name}"?`)) {
            try {
                await supplierService.deleteSupplier(id);
                setSuppliers(suppliers.filter(s => s.id !== id));
            } catch (error) {
                console.error("Erro ao excluir fornecedor:", error);
                alert("Erro ao excluir o fornecedor.");
            }
        }
    };

    const filteredSuppliers = React.useMemo(() => {
        return suppliers
            .filter(s =>
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.document?.includes(searchTerm) ||
                s.category?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [suppliers, searchTerm, sortBy]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Fornecedores</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua rede de parceiros e fornecedores com agilidade premium.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsCategoryModalOpen(true)}
                        className="flex items-center gap-3 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-[1.25rem] hover:bg-gray-50 font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95"
                    >
                        <Tag className="w-5 h-5 text-blue-500" />
                        Categorias
                    </button>
                    <button
                        onClick={() => { setEditingSupplier(undefined); setIsModalOpen(true); }}
                        className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Novo Fornecedor
                    </button>
                </div>
            </div>

            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, categoria, e-mail ou documento..."
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
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
                        <option value="category">Categoria</option>
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
            ) : viewMode === 'list' ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-gray-100">
                                    <th className="px-6 py-5">Fornecedor</th>
                                    <th className="px-6 py-5">Categoria</th>
                                    <th className="px-6 py-5">Contato</th>
                                    <th className="px-6 py-5">Documento</th>
                                    <th className="px-6 py-5 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredSuppliers.length > 0 ? (
                                    filteredSuppliers.map(supplier => (
                                        <tr
                                            key={supplier.id}
                                            onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                                            className="hover:bg-blue-50/30 transition-all duration-200 group cursor-pointer"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                                                        <Truck className="w-5 h-5 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{supplier.name}</p>
                                                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-tight">{supplier.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-gray-50 text-gray-600 rounded-lg border border-gray-100 group-hover:bg-white group-hover:border-blue-100 transition-all">
                                                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className="text-xs font-semibold">{supplier.category}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1.5">
                                                    {supplier.email && (
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                            {supplier.email}
                                                        </div>
                                                    )}
                                                    {supplier.phone && (
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                            {supplier.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-gray-600 font-mono bg-gray-100/50 px-2 py-1 rounded-md border border-gray-100">
                                                    {supplier.document || '---'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); setIsModalOpen(true); }}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-blue-100 rounded-xl transition-all"
                                                        title="Editar"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id, supplier.name); }}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-red-100 rounded-xl transition-all"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-4 max-w-xs mx-auto">
                                                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center animate-pulse">
                                                    <Truck className="w-10 h-10 text-blue-200" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-lg font-bold text-gray-900">Nenhum Fornecedor</h4>
                                                    <p className="text-sm text-gray-500">Comece sua base de parceiros cadastrando o primeiro fornecedor.</p>
                                                </div>
                                                <button
                                                    onClick={() => { setEditingSupplier(undefined); setIsModalOpen(true); }}
                                                    className="mt-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-bold text-sm"
                                                >
                                                    Cadastrar Agora
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSuppliers.length > 0 ? (
                        filteredSuppliers.map(supplier => (
                            <div
                                key={supplier.id}
                                onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group flex flex-col overflow-hidden cursor-pointer"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                                            <Truck className="w-6 h-6" />
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-600 rounded-lg border border-gray-100 group-hover:bg-white transition-all">
                                            <Tag className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{supplier.category}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors mb-1 line-clamp-1">
                                        {supplier.name}
                                    </h3>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-6">
                                        {supplier.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                                    </p>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        {supplier.email && (
                                            <div className="flex items-center gap-2.5 text-sm text-gray-600 underline-offset-4 hover:underline cursor-pointer">
                                                <Mail className="w-4 h-4 text-blue-400" />
                                                <span className="truncate">{supplier.email}</span>
                                            </div>
                                        )}
                                        {supplier.phone && (
                                            <div className="flex items-center gap-2.5 text-sm text-gray-600">
                                                <Phone className="w-4 h-4 text-gray-400" />
                                                <span>{supplier.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-[11px] pt-2">
                                            <span className="text-gray-400 font-bold uppercase tracking-widest">Documento</span>
                                            <span className="text-gray-900 font-mono font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                                {supplier.document || '---'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-2xl border-t border-gray-100 flex justify-end gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); setIsModalOpen(true); }}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id, supplier.name); }}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex flex-col items-center justify-center space-y-4 max-w-xs mx-auto">
                                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center">
                                    <Truck className="w-10 h-10 text-blue-200" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-lg font-bold text-gray-900">Nenhum Fornecedor</h4>
                                    <p className="text-sm text-gray-500">Comece sua base de parceiros cadastrando o primeiro fornecedor.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <SupplierModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={editingSupplier ? handleEdit : handleAdd}
                initialData={editingSupplier}
            />
            <SupplierCategoryModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                organizationId={organizationId}
            />
        </div>
    );
};
