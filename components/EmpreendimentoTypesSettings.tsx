import React from 'react';
import { useStore } from '../store/useStore';
import {
    empreendimentoTypeService,
    EmpreendimentoTypeRecord,
    EmpreendimentoMotorCategory,
    MOTOR_CATEGORY_OPTIONS,
    COLOR_OPTIONS,
    colorClasses,
} from '../services/empreendimentoTypeService';
import { Building2, Plus, Check, X, Loader2, Copy } from 'lucide-react';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';

const EmpreendimentoTypesSettings: React.FC = () => {
    const activeOrganizationId = useStore(state => state.activeOrganizationId);
    const orgId = activeOrganizationId ?? undefined;
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [types, setTypes] = React.useState<EmpreendimentoTypeRecord[]>([]);
    const [loading, setLoading] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [editCategory, setEditCategory] = React.useState<EmpreendimentoMotorCategory>('vertical');
    const [editColor, setEditColor] = React.useState('gray');

    const loadTypes = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await empreendimentoTypeService.list(orgId);
            setTypes(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => {
        loadTypes();
    }, [loadTypes]);

    const handleAdd = async () => {
        if (!editName.trim()) return;
        if (!orgId) { showToast('Selecione uma organização para criar um tipo de empreendimento.', 'error'); return; }
        try {
            await empreendimentoTypeService.create({ name: editName.trim(), motor_category: editCategory, color: editColor, description: null, organization_id: orgId });
            showToast('Tipo de empreendimento criado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await empreendimentoTypeService.update(id, { name: editName.trim(), motor_category: editCategory, color: editColor });
            showToast('Tipo de empreendimento atualizado com sucesso', 'success');
            cancelEdit();
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Excluir tipo de empreendimento?', message: 'Empreendimentos que já usam este tipo mantêm o valor salvo, mas ele deixa de aparecer no formulário. Tem certeza?', variant: 'danger' })) return;
        try {
            await empreendimentoTypeService.remove(id);
            showToast('Tipo de empreendimento excluído', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDuplicate = async (type: EmpreendimentoTypeRecord) => {
        if (!orgId) { showToast('Selecione uma organização para duplicar um tipo de empreendimento.', 'error'); return; }
        try {
            await empreendimentoTypeService.duplicate(type, orgId);
            showToast('Tipo de empreendimento duplicado com sucesso', 'success');
            loadTypes();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const startEdit = (type: EmpreendimentoTypeRecord) => {
        setEditingId(type.id);
        setEditName(type.name);
        setEditCategory(type.motor_category);
        setEditColor(type.color);
        setIsAdding(false);
    };

    const startAdd = () => {
        setIsAdding(true);
        setEditingId(null);
        setEditName('');
        setEditCategory('vertical');
        setEditColor('gray');
    };

    const cancelEdit = () => {
        setIsAdding(false);
        setEditingId(null);
        setEditName('');
        setEditCategory('vertical');
        setEditColor('gray');
    };

    const categoryLabel = (c: EmpreendimentoMotorCategory) => MOTOR_CATEGORY_OPTIONS.find(o => o.value === c)?.label ?? c;

    const selectCls = 'px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';

    const editorRow = (onConfirm: () => void) => (
        <div className="flex items-center gap-2 flex-1 flex-wrap">
            <input
                autoFocus
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nome do tipo de empreendimento..."
                className="flex-1 min-w-[10rem] px-3 py-1.5 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                onKeyDown={e => e.key === 'Enter' && onConfirm()}
            />
            <select value={editCategory} onChange={e => setEditCategory(e.target.value as EmpreendimentoMotorCategory)} className={selectCls}>
                {MOTOR_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={editColor} onChange={e => setEditColor(e.target.value)} className={selectCls}>
                {COLOR_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button onClick={onConfirm} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-colors"><Check className="w-5 h-5" /></button>
            <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-md transition-colors"><X className="w-5 h-5" /></button>
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                        <Building2 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Tipos de Empreendimento</h2>
                        <p className="text-sm text-gray-500 mt-1">Gerencie os tipos disponíveis no cadastro de Empreendimentos (Incorporação). A categoria define como o empreendimento é classificado no motor de Áreas NBR 12721.</p>
                    </div>
                </div>
                {!isAdding && !editingId && (
                    <Button onClick={startAdd} className="gap-2 shrink-0 text-sm bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/20">
                        <Plus className="w-4 h-4" /> Novo Tipo
                    </Button>
                )}
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
                                {editorRow(handleAdd)}
                            </li>
                        )}
                        {types.map(type => (
                            <li key={type.id} className="group flex items-center justify-between gap-2 p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-gray-50/50">
                                {editingId === type.id ? editorRow(() => handleUpdate(type.id)) : (
                                    <>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${colorClasses(type.color)}`}>
                                                {type.name}
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                                                {categoryLabel(type.motor_category)}
                                            </span>
                                            {type.is_system && (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                                                    Global
                                                </span>
                                            )}
                                        </div>
                                        {type.is_system ? (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <button onClick={() => handleDuplicate(type)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Duplicar">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 lg:opacity-100">
                                                <ActionIconButton kind="edit" onClick={() => startEdit(type)} />
                                                <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(type)} />
                                                <ActionIconButton kind="delete" onClick={() => handleDelete(type.id)} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        ))}
                        {!isAdding && types.length === 0 && (
                            <li className="text-center p-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                Nenhum tipo de empreendimento cadastrado.
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default EmpreendimentoTypesSettings;
