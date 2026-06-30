import React, { useEffect, useState } from 'react';
import { Building, Loader2, MapPin, Plus, Save, Trash2, Users } from 'lucide-react';
import { ImovibBlock, ImovibRegulatoryZone, ImovibStudy, ImovibUnit } from '../types';
import { imovibService } from '../services/imovibService';

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
    { label: 'Lateral Direita (m)', key: 'terreno_lateral_direita' as keyof ImovibStudy },
    { label: 'Lateral Esquerda (m)', key: 'terreno_lateral_esquerda' as keyof ImovibStudy },
    { label: 'Area do Terreno (m2)', key: 'terreno_area' as keyof ImovibStudy },
];

const ImovibBlocksTypologyTab: React.FC<Props> = ({ study, onDataChanged }) => {
    const [formData, setFormData] = useState<Partial<ImovibStudy>>(study);
    const [regulatoryZones, setRegulatoryZones] = useState<ImovibRegulatoryZone[]>([]);
    const [addingBlock, setAddingBlock] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    const [blockNameError, setBlockNameError] = useState(false);
    const [savingLand, setSavingLand] = useState(false);

    useEffect(() => {
        setFormData(study);
    }, [study]);

    useEffect(() => {
        imovibService.getRegulatoryZones(study.id).then(setRegulatoryZones).catch(console.error);
    }, [study.id]);

    const handleSaveLand = async () => {
        try {
            setSavingLand(true);
            const payload: Partial<ImovibStudy> = {};
            LAND_FIELDS.forEach(({ key }) => {
                (payload as any)[key] = (formData as any)[key] ?? null;
            });
            await imovibService.updateStudy(study.id, payload as any);
            onDataChanged();
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar dados do terreno.');
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
            await imovibService.createBlock({
                study_id: study.id,
                name: newBlockName,
                construction_cost_sqm: 0,
                sales_price_sqm: 0,
            });
            setNewBlockName('');
            onDataChanged();
        } catch (e) {
            console.error(e);
        } finally {
            setAddingBlock(false);
        }
    };

    const handleDeleteBlock = async (id: string) => {
        if (confirm('Deseja excluir este bloco?')) {
            await imovibService.deleteBlock(id);
            onDataChanged();
        }
    };

    const handleUpdateBlock = async (block: ImovibBlock, field: keyof ImovibBlock, value: string) => {
        try {
            await imovibService.updateBlock(block.id, {
                [field]: field === 'name' ? value : parseFloat(value) || 0
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddUnit = async (blockId: string) => {
        try {
            await imovibService.createUnit({
                block_id: blockId,
                name: 'Nova Tipologia',
                quantity: 1,
                private_area: 0,
                common_area: 0
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateUnit = async (unit: ImovibUnit, field: keyof ImovibUnit, value: string | boolean) => {
        try {
            await imovibService.updateUnit(unit.id, {
                [field]: typeof value === 'boolean' ? value : field === 'name' ? value : parseFloat(value as string) || 0
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

    const area = (formData as any).terreno_area as number | null;
    const firstZone = regulatoryZones[0];
    const toVal = firstZone ? parseRegVal(firstZone.taxa_ocupacao_maxima) : null;
    const toBase = (area && toVal != null) ? toVal * area : null;

    const fmtArea = (v: number | null) =>
        v == null ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m2';

    const calc = (raw: string | undefined) => {
        const n = parseRegVal(raw);
        if (n == null) return 'N.A.';
        if (!area) return '- (sem area)';
        return fmtArea(n * area);
    };

    const calcs = firstZone ? [
        { label: 'C.A. Minimo', raw: firstZone.ca_minimo, suffix: firstZone.ca_minimo !== 'N.A.' ? ` (x${firstZone.ca_minimo})` : '' },
        { label: 'C.A. Basico', raw: firstZone.ca_basico, suffix: firstZone.ca_basico !== 'N.A.' ? ` (x${firstZone.ca_basico})` : '' },
        { label: 'C.A. Maximo', raw: firstZone.ca_maximo, suffix: firstZone.ca_maximo !== 'N.A.' ? ` (x${firstZone.ca_maximo})` : '' },
        { label: 'T.O. Max.', raw: firstZone.taxa_ocupacao_maxima, suffix: firstZone.taxa_ocupacao_maxima !== 'N.A.' ? ` (x${firstZone.taxa_ocupacao_maxima})` : '' },
        { label: 'T.Perm. Min.', raw: firstZone.taxa_permeabilidade_minima, suffix: firstZone.taxa_permeabilidade_minima !== 'N.A.' ? ` (x${firstZone.taxa_permeabilidade_minima})` : '' },
        { label: 'Gabarito', raw: firstZone.gabarito_altura_maxima, isGabarito: true },
    ] : [];

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-indigo-500" />
                        Dados do Terreno
                    </h2>
                    <button
                        onClick={handleSaveLand}
                        disabled={savingLand}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm disabled:opacity-60"
                    >
                        {savingLand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {savingLand ? 'Salvando...' : 'Salvar Terreno'}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {LAND_FIELDS.map(({ label, key }) => (
                        <div key={String(key)}>
                            <label className="block text-form-label font-black uppercase tracking-wider text-slate-400 mb-2">{label}</label>
                            <input
                                type="number"
                                value={(formData as any)[key] ?? ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value === '' ? null : parseFloat(e.target.value) || null }))}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium transition-all"
                                placeholder="0"
                            />
                        </div>
                    ))}
                </div>

                {!regulatoryZones.length ? (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                        <p className="text-xs text-slate-400 font-medium">
                            Preencha o <strong>Mapa Regulatorio</strong> para visualizar o potencial construtivo.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                                Potencial Construtivo - {firstZone.zona || 'Zona'}{regulatoryZones.length > 1 ? ` (+${regulatoryZones.length - 1})` : ''}
                            </h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {calcs.map(({ label, raw, suffix, isGabarito }) => {
                                const display = isGabarito
                                    ? (raw && raw !== 'N.A.' ? raw + ' m' : 'N.A.')
                                    : calc(raw);
                                const isNA = display === 'N.A.' || display.startsWith('-');
                                return (
                                    <div key={label} className={`rounded-2xl p-4 border ${isNA ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-100'}`}>
                                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">
                                            {label}{suffix}
                                        </p>
                                        <p className={`text-base font-black ${isNA ? 'text-slate-400' : 'text-indigo-700'}`}>
                                            {display}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between mb-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-500" />
                    Blocos e Tipologias
                </h2>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Nome do Bloco/Fase"
                            value={newBlockName}
                            onChange={(e) => { setNewBlockName(e.target.value); setBlockNameError(false); }}
                            className={`px-4 py-2 bg-slate-50 border rounded-xl focus:border-indigo-500 outline-none text-sm font-medium transition-colors ${blockNameError ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                        />
                        <button
                            onClick={handleAddBlock}
                            disabled={addingBlock}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add Bloco
                        </button>
                    </div>
                    {blockNameError && <p className="text-xs text-red-500 font-medium">Digite um nome para o bloco</p>}
                </div>
            </div>

            <div className="space-y-6">
                {(!study.blocks || study.blocks.length === 0) ? (
                    <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-12 text-center">
                        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">Nenhum bloco cadastrado</h3>
                        <p className="text-slate-500 font-medium mt-1">Adicione o primeiro bloco para iniciar a definicao de tipologias de unidades.</p>
                    </div>
                ) : (
                    study.blocks.map(block => (
                        <div key={block.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                            <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold shrink-0">
                                        {block.name.charAt(0).toUpperCase()}
                                    </div>
                                    <input
                                        type="text"
                                        className="font-black text-xl text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                                        defaultValue={block.name}
                                        onBlur={(e) => handleUpdateBlock(block, 'name', e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                                    <button
                                        onClick={() => handleDeleteBlock(block.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                                        title="Excluir Bloco"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-0 overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-white border-b border-slate-100 text-xs font-black tracking-widest uppercase text-slate-400">
                                            <th className="px-6 py-4">Tipologia da Unidade</th>
                                            <th className="px-6 py-4 w-32 text-center">Unidades por Pavimento</th>
                                            <th className="px-6 py-4 w-32 text-right">Area Priv. (m2)</th>
                                            <th className="px-6 py-4 w-32 text-right">Area Com. (m2)</th>
                                            <th className="px-6 py-4 w-36 text-right">Area Livre (m2)</th>
                                            <th className="px-6 py-4 w-28 text-center">Pavimentos</th>
                                            <th className="px-6 py-4 w-32 text-center">Unidades Totais</th>
                                            <th className="px-6 py-4 w-40 text-right">Area Privativa Total (m2)</th>
                                            <th className="px-6 py-4 w-36 text-right">Area Total (m2)</th>
                                            <th className="px-6 py-4 w-20 text-center">Venda</th>
                                            <th className="px-6 py-4 w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {block.units?.map(unit => {
                                            const areaLivre = toBase != null
                                                ? toBase - (((unit.private_area || 0) * (unit.quantity || 0)) + (unit.common_area || 0))
                                                : null;
                                            const livreFmt = areaLivre == null
                                                ? '-'
                                                : areaLivre.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m2';
                                            const livreNeg = areaLivre != null && areaLivre < 0;
                                            return (
                                                <tr key={unit.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="text"
                                                            defaultValue={unit.name}
                                                            onBlur={(e) => handleUpdateUnit(unit, 'name', e.target.value)}
                                                            className="w-full bg-transparent border-none p-1 focus:ring-1 focus:ring-indigo-500 rounded font-bold text-slate-700"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            defaultValue={unit.quantity}
                                                            onBlur={(e) => handleUpdateUnit(unit, 'quantity', e.target.value)}
                                                            className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-center font-medium text-slate-800"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 relative">
                                                        <input
                                                            type="number"
                                                            defaultValue={unit.private_area}
                                                            onBlur={(e) => handleUpdateUnit(unit, 'private_area', e.target.value)}
                                                            className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-right font-medium text-slate-800"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            defaultValue={unit.common_area}
                                                            onBlur={(e) => handleUpdateUnit(unit, 'common_area', e.target.value)}
                                                            className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-right font-medium text-slate-800"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <span className={`text-sm font-bold ${areaLivre == null ? 'text-slate-300' : livreNeg ? 'text-red-500' : 'text-emerald-600'}`}>
                                                            {livreFmt}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            defaultValue={unit.pavimentos ?? 1}
                                                            min={1}
                                                            onBlur={(e) => handleUpdateUnit(unit, 'pavimentos' as any, e.target.value)}
                                                            className="w-full bg-slate-100/50 border border-slate-200 p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-center font-medium text-slate-800"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {(unit.quantity || 0) * (unit.pavimentos ?? 1)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <span className="text-sm font-bold text-violet-700">
                                                            {((unit.private_area || 0) * (unit.quantity || 0) * (unit.pavimentos ?? 1))
                                                                .toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m2
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        {(() => {
                                                            const pav = unit.pavimentos ?? 1;
                                                            const areaTotal = toBase != null ? toBase * pav : null;
                                                            const totalFmt = areaTotal == null ? '-'
                                                                : areaTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m2';
                                                            return (
                                                                <span className={`text-sm font-bold ${areaTotal == null ? 'text-slate-300' : 'text-indigo-700'}`}>
                                                                    {totalFmt}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={unit.is_vendavel !== false}
                                                            onChange={(e) => handleUpdateUnit(unit, 'is_vendavel', e.target.checked)}
                                                            className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                                                            title="Incluir em Vendas de Ativos"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <button
                                                            onClick={() => handleDeleteUnit(unit.id)}
                                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors w-full flex justify-center opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {toBase != null && block.units && block.units.length > 0 && (
                                            <tr className="bg-indigo-50/60 border-t-2 border-indigo-100">
                                                <td colSpan={8} className="px-6 py-3 text-right">
                                                    <span className="text-xs font-black tracking-widest uppercase text-indigo-400">Total Area</span>
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className="text-sm font-black text-indigo-700">
                                                        {block.units.reduce((sum, u) => sum + toBase * (u.pavimentos ?? 1), 0)
                                                            .toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m2
                                                    </span>
                                                </td>
                                                <td colSpan={2} />
                                            </tr>
                                        )}
                                        <tr>
                                            <td colSpan={11} className="px-6 py-4 bg-slate-50/50">
                                                <button
                                                    onClick={() => handleAddUnit(block.id)}
                                                    className="text-button font-black tracking-widest uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" /> Adicionar Tipologia
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ImovibBlocksTypologyTab;