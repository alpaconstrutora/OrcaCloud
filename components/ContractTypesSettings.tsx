import React from 'react';
import { useStore } from '../store/useStore';
import { contractTypeService } from '../services/contractTypeService';
import { ContractTypeRecord } from '../types';
import { FileText, Plus, Edit2, Trash2, Check, X, Loader2, Copy, Download } from 'lucide-react';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { ContractTypeCategory } from '../constants/contractTypes';

const CATEGORIES: ContractTypeCategory[] = ['Serviços', 'Suprimentos', 'Geral'];

const ContractTypesSettings: React.FC = () => {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const orgId = activeOrganizationId ?? undefined;
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [types, setTypes] = React.useState<ContractTypeRecord[]>([]);
    const [loading, setLoading] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editCategory, setEditCategory] = React.useState<ContractTypeCategory>('Geral');

    const loadTypes = React.useCallback(async () => {
        if (!activeOrganizationId) return;
        setLoading(true);
        try {
            const data = await contractTypeService.listTypes(orgId);
            setTypes(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, orgId, showToast]);

    React.useEffect(() => {
        loadTypes();
    }, [loadTypes]);

    const handleAdd = async () => {
        if (!editName.trim()) return;
        try {
            await contractTypeService.createType({ name: editName.trim(), category: editCategory, organization_id: orgId });
            showToast('Tipo de contrato criado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await contractTypeService.updateType(id, { name: editName.trim(), category: editCategory });
            showToast('Tipo de contrato atualizado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir tipo de contrato?', message: 'Tem certeza que deseja excluir este tipo de contrato?', variant: 'danger' })) return;
        try {
            await contractTypeService.deleteType(id);
            showToast('Tipo de contrato excluído', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (type: ContractTypeRecord) => {
        try {
            await contractTypeService.createType({ name: `${type.name} (Cópia)`, category: type.category, organization_id: orgId });
            showToast('Tipo de contrato duplicado com sucesso', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleImportDefaults = async () => {
        if (!await confirm({ title: 'Importar Tipos Padrão', message: 'Deseja importar os tipos de contrato padrão do sistema para poder editá-los?' })) return;
        setLoading(true);
        try {
            await contractTypeService.importDefaults(orgId);
            showToast('Tipos padrão importados com sucesso', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message || 'Erro ao importar tipos padrão', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (type: ContractTypeRecord) => {
        setEditingId(type.id);
        setEditName(type.name);
        setEditCategory(type.category);
        setIsAdding(false);
    };

    const startAdd = () => {
        setIsAdding(true);
        setEditingId(null);
        setEditName('');
        setEditCategory('Geral');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setEditingId(null);
        setEditName('');
        setEditCategory('Geral');
    };

    const isDefault = (type: ContractTypeRecord) => !type.organization_id || type.id.startsWith('default-');

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                        <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tipos de Contrato</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos de contrato disponíveis em Suprimentos e Serviços.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!loading && types.some(isDefault) && (
                        <Button onClick={handleImportDefaults} variant="secondary" className="gap-2 shrink-0 text-sm hidden sm:flex">
                            <Download className="w-4 h-4" /> Importar Padrões
                        </Button>
                    )}
                    {!isAdding && !editingId && (
                        <Button onClick={startAdd} className="gap-2 shrink-0 text-sm bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/20">
                            <Plus className="w-4 h-4" /> Novo Tipo
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                {loading ? (
                    <div className="flex items-center justify-center p-8 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {isAdding && (
                            <li className="flex items-center gap-2 p-2 border border-indigo-200 rounded-lg bg-indigo-50/50">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Nome do tipo de contrato..."
                                    className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                />
                                <select
                                    value={editCategory}
                                    onChange={e => setEditCategory(e.target.value as ContractTypeCategory)}
                                    className="px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button onClick={handleAdd} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                            </li>
                        )}
                        {types.map(type => (
                            <li key={type.id} className="group flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-gray-50/50">
                                {editingId === type.id ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(type.id)}
                                        />
                                        <select
                                            value={editCategory}
                                            onChange={e => setEditCategory(e.target.value as ContractTypeCategory)}
                                            className="px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <button onClick={() => handleUpdate(type.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
                                        <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-700">{type.name}</span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 ml-2">
                                                {type.category}
                                            </span>
                                            {isDefault(type) && (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                                                    Global
                                                </span>
                                            )}
                                        </div>
                                        {isDefault(type) ? (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <button onClick={() => handleDuplicate(type)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Duplicar">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <button onClick={() => startEdit(type)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Editar">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDuplicate(type)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Duplicar">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(type.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Excluir">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        ))}
                        {!isAdding && types.length === 0 && (
                            <li className="text-center p-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                Nenhum tipo de contrato cadastrado.
                                <div className="mt-4 flex justify-center">
                                    <Button onClick={handleImportDefaults} variant="secondary" className="gap-2 text-sm">
                                        <Download className="w-4 h-4" /> Importar Padrões
                                    </Button>
                                </div>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ContractTypesSettings;
