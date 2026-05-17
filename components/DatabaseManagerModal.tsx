import React from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Edit2, Trash2, Copy, Save, Database, Loader2 } from 'lucide-react';
import { customDatabaseService } from '../services/customDatabaseService';
import { CustomDatabase } from '../types';

interface DatabaseManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (db: CustomDatabase) => void;
    currentDbId?: string;
}

const DatabaseManagerModal: React.FC<DatabaseManagerModalProps> = ({ isOpen, onClose, onSelect, currentDbId }) => {
    const [databases, setDatabases] = React.useState<CustomDatabase[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isEditing, setIsEditing] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editDesc, setEditDesc] = React.useState('');
    const [isCreating, setIsCreating] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            loadDatabases();
        }
    }, [isOpen]);

    const loadDatabases = async () => {
        setIsLoading(true);
        try {
            const dbs = await customDatabaseService.listDatabases();
            setDatabases(dbs);
        } catch (error) {
            console.error("Erro ao carregar bases:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!editName.trim()) return;
        try {
            const newDb = await customDatabaseService.createDatabase(editName, editDesc);
            setDatabases([...databases, newDb]);
            setIsCreating(false);
            setEditName('');
            setEditDesc('');
        } catch (error) {
            alert('Erro ao criar base de dados.');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const updated = await customDatabaseService.updateDatabase(id, { name: editName, description: editDesc });
            setDatabases(databases.map(db => db.id === id ? updated : db));
            setIsEditing(null);
            setEditName('');
            setEditDesc('');
        } catch (error) {
            alert('Erro ao atualizar base de dados.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja excluir a base "${name}"? Todos os itens associados serão perdidos.`)) return;
        try {
            await customDatabaseService.deleteDatabase(id);
            setDatabases(databases.filter(db => db.id !== id));
            if (currentDbId === id) {
                onSelect({ id: '', name: 'Minha Base Própria', created_at: '' }); // Reset selection logic needs care
            }
        } catch (error) {
            alert('Erro ao excluir base de dados.');
        }
    };

    const handleDuplicate = async (db: CustomDatabase) => {
        // Logic to be implemented in service
        try {
            // For now, simpler implementation: client-side dup logic or service
            // Let's implement full dupe in service later
            alert("Duplicação será implementada em breve.");
        } catch (error) {
            console.error(error);
        }
    };

    const startEdit = (db: CustomDatabase) => {
        setIsEditing(db.id);
        setEditName(db.name);
        setEditDesc(db.description || '');
        setIsCreating(false);
    };

    const startCreate = () => {
        setIsCreating(true);
        setIsEditing(null);
        setEditName('');
        setEditDesc('');
    }

    if (!isOpen) return null;


    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Database className="w-5 h-5 text-blue-600" />
                        Gerenciar Bases Próprias
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {!isCreating && !isEditing && (
                        <button
                            onClick={startCreate}
                            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 font-bold hover:border-blue-300 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Criar Nova Base de Dados
                        </button>
                    )}

                    {(isCreating || isEditing) && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                            <h4 className="text-sm font-bold text-blue-800 uppercase">
                                {isCreating ? 'Nova Base' : 'Editar Base'}
                            </h4>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Nome da Base (ex: Tabela 2024)"
                                className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="Descrição (opcional)"
                                className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={editDesc}
                                onChange={e => setEditDesc(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => { setIsCreating(false); setIsEditing(null); }}
                                    className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => isCreating ? handleCreate() : handleUpdate(isEditing!)}
                                    disabled={!editName.trim()}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {databases.map(db => (
                                <div
                                    key={db.id}
                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${currentDbId === db.id
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300'
                                        : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-sm'
                                        }`}
                                >
                                    <div className="flex-1 cursor-pointer" onClick={() => onSelect(db)}>
                                        <h4 className="font-bold text-gray-800">{db.name}</h4>
                                        {db.description && (
                                            <p className="text-xs text-gray-500">{db.description}</p>
                                        )}
                                        <span className="text-[10px] text-gray-400">
                                            Criado em: {new Date(db.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 pl-4 border-l border-gray-100 ml-4">
                                        <button
                                            onClick={() => startEdit(db)}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDuplicate(db)}
                                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="Duplicar (Em breve)"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(db.id, db.name)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        {currentDbId === db.id ? (
                                            <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg ml-2">
                                                Ativa
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => onSelect(db)}
                                                className="px-3 py-1 bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white text-xs font-bold rounded-lg ml-2 transition-colors"
                                            >
                                                Selecionar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {databases.length === 0 && !isLoading && (
                                <div className="text-center py-8 text-gray-400">
                                    <p>Nenhuma base encontrada.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DatabaseManagerModal;
