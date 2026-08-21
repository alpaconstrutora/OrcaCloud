// components/inventory/StockItemSheet.tsx — cadastro/edição de item do catálogo do Almoxarifado
import React from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { inventoryService } from '../../services/inventoryService';
import { masterDataService, type MasterUnit } from '../../services/masterDataService';
import { supplierService } from '../../services/supplierService';
import type { StockItem, CreateStockItemInput } from '../../types/inventory';

/**
 * Cadastro de item avulso do almoxarifado. Painel lateral (UI_PATTERNS §3 —
 * "criar registro simples" é sempre lateral).
 *
 * Código é opcional: em branco, o banco gera AVU-000001 (trigger
 * fn_stock_items_generate_code, migration 20270913000004) — o campo mostra o
 * placeholder e nunca inventa um valor no front, para não colidir com a
 * numeração real do banco.
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const Campo: React.FC<{ label: string; ajuda?: string; children: React.ReactNode }> = ({ label, ajuda, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500">{label}</label>
        {children}
        {ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
    </div>
);

interface Props {
    open: boolean;
    onClose: () => void;
    organizationId: string;
    item: StockItem | null;
    onSaved: (item: StockItem) => void;
}

const StockItemSheet: React.FC<Props> = ({ open, onClose, organizationId, item, onSaved }) => {
    const editing = !!item;
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [dirty, setDirty] = React.useState(false);
    const [units, setUnits] = React.useState<MasterUnit[]>([]);
    const [suppliers, setSuppliers] = React.useState<Array<{ id: string; name: string }>>([]);

    const [form, setForm] = React.useState<CreateStockItemInput>({
        id: item?.id,
        inputCode: item?.inputCode ?? '',
        inputDescription: item?.inputDescription ?? '',
        inputUnit: item?.inputUnit ?? '',
        category: item?.category ?? '',
        defaultSupplierId: item?.defaultSupplierId ?? null,
        notes: item?.notes ?? '',
        isActive: item?.isActive ?? true,
    });

    React.useEffect(() => {
        if (!open) return;
        setForm({
            id: item?.id,
            inputCode: item?.inputCode ?? '',
            inputDescription: item?.inputDescription ?? '',
            inputUnit: item?.inputUnit ?? '',
            category: item?.category ?? '',
            defaultSupplierId: item?.defaultSupplierId ?? null,
            notes: item?.notes ?? '',
            isActive: item?.isActive ?? true,
        });
        setDirty(false);
        setError('');
    }, [open, item]);

    React.useEffect(() => {
        if (!open) return;
        masterDataService.listUnits().then(setUnits).catch(() => setUnits([]));
        supplierService.listSuppliers(organizationId).then(setSuppliers).catch(() => setSuppliers([]));
    }, [open, organizationId]);

    const set = <K extends keyof CreateStockItemInput>(k: K, v: CreateStockItemInput[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        setDirty(true);
    };

    const save = async () => {
        if (!form.inputDescription.trim() || !form.inputUnit.trim()) {
            setError('Descrição e unidade são obrigatórias.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const saved = await inventoryService.upsertStockItem(organizationId, {
                ...form,
                inputDescription: form.inputDescription.trim(),
                inputUnit: form.inputUnit.trim(),
                category: form.category?.trim() || undefined,
                notes: form.notes?.trim() || undefined,
                source: editing ? item?.source : 'avulso',
            });
            setDirty(false);
            onSaved(saved);
            onClose();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg" dirty={dirty}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editing ? 'Editar item' : 'Novo item'}</SheetTitle>
                <SheetDescription>
                    {editing ? 'Item do catálogo do almoxarifado.' : 'Cadastre um item avulso do almoxarifado. Sem código, o sistema gera um automaticamente.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Campo label="Código" ajuda={editing ? undefined : 'Deixe em branco para gerar automaticamente.'}>
                            <input
                                value={form.inputCode ?? ''}
                                onChange={e => set('inputCode', e.target.value)}
                                className={inputCls}
                                placeholder={editing ? undefined : 'Gerado automaticamente'}
                                disabled={editing}
                            />
                        </Campo>
                        <Campo label="Unidade *">
                            <input
                                list="stock-item-units"
                                value={form.inputUnit}
                                onChange={e => set('inputUnit', e.target.value)}
                                className={inputCls}
                                placeholder="sc, m³, un"
                            />
                            <datalist id="stock-item-units">
                                {units.map(u => <option key={u.id} value={u.symbol}>{u.name}</option>)}
                            </datalist>
                        </Campo>
                    </div>

                    <Campo label="Descrição *">
                        <input
                            value={form.inputDescription}
                            onChange={e => set('inputDescription', e.target.value)}
                            className={inputCls}
                            placeholder="Ex: Cimento CP-II 50kg"
                            autoFocus
                        />
                    </Campo>

                    <div className="grid grid-cols-2 gap-4">
                        <Campo label="Categoria">
                            <input
                                value={form.category ?? ''}
                                onChange={e => set('category', e.target.value)}
                                className={inputCls}
                                placeholder="Cimento, Aço, Hidráulica..."
                            />
                        </Campo>
                        <Campo label="Fornecedor padrão">
                            <select
                                value={form.defaultSupplierId ?? ''}
                                onChange={e => set('defaultSupplierId', e.target.value || null)}
                                className={inputCls}
                            >
                                <option value="">Nenhum</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </Campo>
                    </div>

                    <Campo label="Observações">
                        <textarea
                            value={form.notes ?? ''}
                            onChange={e => set('notes', e.target.value)}
                            className={inputCls + ' resize-none h-20'}
                        />
                    </Campo>

                    {editing && (
                        <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.isActive ?? true}
                                onChange={e => set('isActive', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600"
                            />
                            Item ativo
                        </label>
                    )}
                </div>
            </SheetPanel>

            <SheetFooter>
                {error && <p className="text-red-500 text-xs font-medium flex-1">{error}</p>}
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {saving && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {saving ? 'Salvando...' : editing ? 'Salvar item' : 'Criar item'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default StockItemSheet;
