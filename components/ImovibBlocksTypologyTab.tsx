// components/ImovibBlocksTypologyTab.tsx
//
// Blocos e Tipologias do estudo de Viabilidade. Usa o mesmo primitivo <TorreCard> do
// Empreendimento — casca visual idêntica, miolo diferente: aqui o corpo do card é a tabela de
// TIPOLOGIAS (quantidade × área), não unidades individuais, porque a Viabilidade estima em vez
// de registrar. A consistência é da casca; o conteúdo respeita o modelo de cada módulo.
import React, { useEffect, useState } from 'react';
import { Building, Loader2, MapPin, Plus, Save, Users, Check, X, AlertCircle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { ImovibBlock, ImovibRegulatoryZone, ImovibStudy, ImovibUnit } from '../types';
import { imovibService } from '../services/imovibService';
import { TorreCard, TorreEmpty } from './torres/TorreCard';

const parseRegVal = (v: string | undefined): number | null => {
    if (!v || v === 'N.A.' || v.trim() === '') return null;
    return parseFloat(v.replace(',', '.')) || null;
};

interface Props {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const LAND_FIELDS: { label: string; key: keyof ImovibStudy }[] = [
    { label: 'Frente (m)', key: 'terreno_frente' as keyof ImovibStudy },
    { label: 'Fundos (m)', key: 'terreno_fundos' as keyof ImovibStudy },
    { label: 'Lateral direita (m)', key: 'terreno_lateral_direita' as keyof ImovibStudy },
    { label: 'Lateral esquerda (m)', key: 'terreno_lateral_esquerda' as keyof ImovibStudy },
    { label: 'Área do terreno (m²)', key: 'terreno_area' as keyof ImovibStudy },
];

const ImovibBlocksTypologyTab: React.FC<Props> = ({ study, onDataChanged }) => {
    const confirm = useConfirm();
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(study);
    const [regulatoryZones, setRegulatoryZones] = useState<ImovibRegulatoryZone[]>([]);
    const [addingBlock, setAddingBlock] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    const [blockNameError, setBlockNameError] = useState(false);
    const [savingLand, setSavingLand] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [editBlockName, setEditBlockName] = useState('');
    const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const notify = (msg: string, type: 'success' | 'error' = 'success') => {
        setNotice({ msg, type });
        setTimeout(() => setNotice(null), 4000);
    };

    useEffect(() => { setFormData(study); }, [study]);
    useEffect(() => {
        imovibService.getRegulatoryZones(study.id).then(setRegulatoryZones).catch(console.error);
    }, [study.id]);

    const handleSaveLand = async () => {
        try {
            setSavingLand(true);
            const payload: Partial<ImovibStudy> = {};
            LAND_FIELDS.forEach(({ key }) => { (payload as any)[key] = (formData as any)[key] ?? null; });
            await imovibService.updateStudy(study.id, payload as any);
            onDataChanged();
        } catch (error) {
            console.error(error);
            notify('Erro ao salvar dados do terreno.', 'error');
        } finally {
            setSavingLand(false);
        }
    };

    const handleAddBlock = async () => {
        if (!newBlockName.trim()) {
            setBlockNameError(true);
            setTimeout(() => setBlockNameError(false), 2000);
            return;
        }
        try {
            setAddingBlock(true);
            setBlockNameError(false);
            await imovibService.createBlock({ study_id: study.id, name: newBlockName, construction_cost_sqm: 0, sales_price_sqm: 0 });
            setNewBlockName('');
            onDataChanged();
        } catch (e) {
            console.error(e);
            notify('Erro ao adicionar bloco.', 'error');
        } finally {
            setAddingBlock(false);
        }
    };

    const handleDeleteBlock = async (block: ImovibBlock) => {
        const ok = await confirm({
            title: 'Excluir bloco?',
            message: `O bloco "${block.name}" e suas tipologias serão excluídos.`,
            confirmLabel: 'Excluir',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await imovibService.deleteBlock(block.id);
            onDataChanged();
        } catch (e) {
            console.error(e);
            notify('Erro ao excluir bloco.', 'error');
        }
    };

    const startEditBlock = (block: ImovibBlock) => {
        setEditingBlockId(block.id);
        setEditBlockName(block.name);
    };

    const handleSaveBlockName = async (block: ImovibBlock) => {
        if (!editBlockName.trim()) { notify('Informe o nome do bloco.', 'error'); return; }
        try {
            await imovibService.updateBlock(block.id, { name: editBlockName.trim() });
            setEditingBlockId(null);
            onDataChanged();
        } catch (e) {
            console.error(e);
            notify('Erro ao salvar o nome do bloco.', 'error');
        }
    };

    const handleAddUnit = async (blockId: string) => {
        try {
            await imovibService.createUnit({ block_id: blockId, name: 'Nova Tipologia', quantity: 1, private_area: 0, common_area: 0 });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateUnit = async (unit: ImovibUnit, field: keyof ImovibUnit, value: string | boolean) => {
        try {
            await imovibService.updateUnit(unit.id, {
                [field]: typeof value === 'boolean' ? value : field === 'name' ? value : parseFloat(value as string) || 0,
            });
            if (field === 'is_vendavel' && value === false) {
                await imovibService.deleteUnitInstancesByUnit(unit.id);
            }
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteUnit = async (id: string) => {
        await imovibService.deleteUnit(id);
        onDataChanged();
    };

    // ── Potencial construtivo (lógica preservada) ────────────────────────────
    const area = (formData as any).terreno_area as number | null;
    const firstZone = regulatoryZones[0];
    const toVal = firstZone ? parseRegVal(firstZone.taxa_ocupacao_maxima) : null;
    const toBase = (area && toVal != null) ? toVal * area : null;

    const fmtArea = (v: number | null) => v == null ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
    const calc = (raw: string | undefined) => {
        const n = parseRegVal(raw);
        if (n == null) return 'N.A.';
        if (!area) return '- (sem área)';
        return fmtArea(n * area);
    };
    const calcs = firstZone ? [
        { label: 'C.A. Mínimo', raw: firstZone.ca_minimo, suffix: firstZone.ca_minimo !== 'N.A.' ? ` (x${firstZone.ca_minimo})` : '' },
        { label: 'C.A. Básico', raw: firstZone.ca_basico, suffix: firstZone.ca_basico !== 'N.A.' ? ` (x${firstZone.ca_basico})` : '' },
        { label: 'C.A. Máximo', raw: firstZone.ca_maximo, suffix: firstZone.ca_maximo !== 'N.A.' ? ` (x${firstZone.ca_maximo})` : '' },
        { label: 'T.O. Máx.', raw: firstZone.taxa_ocupacao_maxima, suffix: firstZone.taxa_ocupacao_maxima !== 'N.A.' ? ` (x${firstZone.taxa_ocupacao_maxima})` : '' },
        { label: 'T.Perm. Mín.', raw: firstZone.taxa_permeabilidade_minima, suffix: firstZone.taxa_permeabilidade_minima !== 'N.A.' ? ` (x${firstZone.taxa_permeabilidade_minima})` : '' },
        { label: 'Gabarito', raw: firstZone.gabarito_altura_maxima, isGabarito: true },
    ] : [];

    const inputCls = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';
    const cellInputCls = 'w-full bg-gray-50 border border-gray-200 px-2 py-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-[6px] text-sm font-normal text-gray-800';

    return (
        <div className="space-y-6">
            {/* Dados do terreno + potencial construtivo */}
            <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-indigo-500" /> Dados do terreno
                    </h2>
                    <button onClick={handleSaveLand} disabled={savingLand}
                        className="h-9 flex items-center gap-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[6px] font-medium text-[13px] transition-all disabled:opacity-60">
                        {savingLand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {savingLand ? 'Salvando…' : 'Salvar terreno'}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {LAND_FIELDS.map(({ label, key }) => (
                        <div key={String(key)}>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                            <input type="number" value={(formData as any)[key] ?? ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value === '' ? null : parseFloat(e.target.value) || null }))}
                                className={inputCls} placeholder="0" />
                        </div>
                    ))}
                </div>

                {!regulatoryZones.length ? (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <p className="text-xs text-gray-400 font-medium">
                            Preencha o <strong>Mapa Regulatório</strong> para visualizar o potencial construtivo.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-4">
                            Potencial construtivo — {firstZone.zona || 'Zona'}{regulatoryZones.length > 1 ? ` (+${regulatoryZones.length - 1})` : ''}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {calcs.map(({ label, raw, suffix, isGabarito }) => {
                                const display = isGabarito ? (raw && raw !== 'N.A.' ? raw + ' m' : 'N.A.') : calc(raw);
                                const isNA = display === 'N.A.' || display.startsWith('-');
                                return (
                                    <div key={label} className={`rounded-[10px] p-3 border ${isNA ? 'bg-gray-50 border-gray-200' : 'bg-indigo-50 border-indigo-100'}`}>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">{label}{suffix}</p>
                                        <p className={`text-base font-black ${isNA ? 'text-gray-400' : 'text-indigo-700'}`}>{display}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Blocos e tipologias — mesma casca do Empreendimento */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-500" /> Blocos e tipologias
                </h2>
                <div className="flex items-center gap-2">
                    <input type="text" placeholder="Nome do bloco/fase" value={newBlockName}
                        onChange={(e) => { setNewBlockName(e.target.value); setBlockNameError(false); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                        className={`h-9 px-3 bg-white border rounded-[6px] outline-none text-sm font-medium transition-colors focus:border-indigo-500 ${blockNameError ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                    <button onClick={handleAddBlock} disabled={addingBlock}
                        className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[6px] font-medium text-[13px] transition-all disabled:opacity-50 flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Adicionar bloco
                    </button>
                </div>
            </div>

            <div className="space-y-2.5">
                {(!study.blocks || study.blocks.length === 0) ? (
                    <TorreEmpty icon={Users} text="Nenhum bloco cadastrado. Adicione o primeiro para definir as tipologias." />
                ) : (
                    study.blocks.map(block => {
                        const isOpen = expandedId === block.id;
                        const isEditing = editingBlockId === block.id;
                        const totalUnid = (block.units || []).reduce((s, u) => s + (u.quantity || 0) * (u.pavimentos ?? 1), 0);
                        const subtitle = `${block.units?.length ?? 0} tipologia(s) · ${totalUnid} unid.`;

                        const editHeader = (
                            <div className="flex items-center gap-2 flex-1 flex-wrap">
                                <input className="h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-indigo-500 bg-white"
                                    value={editBlockName} onChange={e => setEditBlockName(e.target.value)} autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleSaveBlockName(block)} />
                                <button onClick={() => handleSaveBlockName(block)} className="h-9 w-9 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingBlockId(null)} className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );

                        const actions = (
                            <>
                                <ActionIconButton kind="edit" title="Renomear bloco" onClick={() => startEditBlock(block)} />
                                <ActionIconButton kind="delete" title="Excluir bloco" onClick={() => handleDeleteBlock(block)} />
                            </>
                        );

                        return (
                            <TorreCard
                                key={block.id}
                                icon={Building}
                                tint="indigo"
                                title={block.name}
                                subtitle={subtitle}
                                actions={actions}
                                headerOverride={isEditing ? editHeader : undefined}
                                expandable
                                isOpen={isOpen}
                                onToggle={() => setExpandedId(isOpen ? null : block.id)}
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2">Tipologia</th>
                                                <th className="px-4 py-2 w-28 text-center">Un./pav.</th>
                                                <th className="px-4 py-2 w-28 text-right">Área priv. (m²)</th>
                                                <th className="px-4 py-2 w-28 text-right">Área com. (m²)</th>
                                                <th className="px-4 py-2 w-32 text-right">Área livre (m²)</th>
                                                <th className="px-4 py-2 w-24 text-center">Pavimentos</th>
                                                <th className="px-4 py-2 w-28 text-center">Unid. totais</th>
                                                <th className="px-4 py-2 w-36 text-right">Área priv. total (m²)</th>
                                                <th className="px-4 py-2 w-32 text-right">Área total (m²)</th>
                                                <th className="px-4 py-2 w-20 text-center">Venda</th>
                                                <th className="px-4 py-2 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {block.units?.map(unit => {
                                                const areaLivre = toBase != null
                                                    ? toBase - (((unit.private_area || 0) * (unit.quantity || 0)) + (unit.common_area || 0))
                                                    : null;
                                                const livreFmt = areaLivre == null ? '-'
                                                    : areaLivre.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
                                                const livreNeg = areaLivre != null && areaLivre < 0;
                                                return (
                                                    <tr key={unit.id} className="hover:bg-gray-50 transition-colors group">
                                                        <td className="px-4 py-2.5">
                                                            <input type="text" defaultValue={unit.name}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'name', e.target.value)}
                                                                className="w-full bg-transparent border-none p-1 focus:ring-1 focus:ring-indigo-500 rounded text-sm font-normal text-gray-700" />
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <input type="number" defaultValue={unit.quantity}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'quantity', e.target.value)}
                                                                className={`${cellInputCls} text-center`} />
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <input type="number" defaultValue={unit.private_area}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'private_area', e.target.value)}
                                                                className={`${cellInputCls} text-right`} />
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <input type="number" defaultValue={unit.common_area}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'common_area', e.target.value)}
                                                                className={`${cellInputCls} text-right`} />
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            <span className={`text-sm font-medium ${areaLivre == null ? 'text-gray-300' : livreNeg ? 'text-red-500' : 'text-emerald-600'}`}>{livreFmt}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <input type="number" defaultValue={unit.pavimentos ?? 1} min={1}
                                                                onBlur={(e) => handleUpdateUnit(unit, 'pavimentos' as any, e.target.value)}
                                                                className={`${cellInputCls} text-center`} />
                                                        </td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <span className="text-sm font-normal text-gray-700">{(unit.quantity || 0) * (unit.pavimentos ?? 1)}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            <span className="text-sm font-medium text-violet-700">
                                                                {((unit.private_area || 0) * (unit.quantity || 0) * (unit.pavimentos ?? 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            {(() => {
                                                                const pav = unit.pavimentos ?? 1;
                                                                const areaTotal = toBase != null ? toBase * pav : null;
                                                                return (
                                                                    <span className={`text-sm font-medium ${areaTotal == null ? 'text-gray-300' : 'text-indigo-700'}`}>
                                                                        {areaTotal == null ? '-' : areaTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²'}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <input type="checkbox" checked={unit.is_vendavel !== false}
                                                                onChange={(e) => handleUpdateUnit(unit, 'is_vendavel', e.target.checked)}
                                                                className="w-4 h-4 rounded accent-emerald-600 cursor-pointer" title="Incluir em Vendas de Ativos" />
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" onClick={() => handleDeleteUnit(unit.id)} />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {toBase != null && block.units && block.units.length > 0 && (
                                                <tr className="bg-indigo-50/60 border-t-2 border-indigo-100">
                                                    <td colSpan={8} className="px-4 py-2.5 text-right">
                                                        <span className="text-xs font-black tracking-widest uppercase text-indigo-400">Total área</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <span className="text-sm font-medium text-indigo-700">
                                                            {block.units.reduce((sum, u) => sum + toBase * (u.pavimentos ?? 1), 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                                                        </span>
                                                    </td>
                                                    <td colSpan={2} />
                                                </tr>
                                            )}
                                            <tr>
                                                <td colSpan={11} className="px-4 py-3 bg-gray-50/50">
                                                    <button onClick={() => handleAddUnit(block.id)}
                                                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors">
                                                        <Plus className="w-3.5 h-3.5" /> Adicionar tipologia
                                                    </button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </TorreCard>
                        );
                    })
                )}
            </div>

            {notice && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notice.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" /> {notice.msg}
                </div>
            )}
        </div>
    );
};

export default ImovibBlocksTypologyTab;
