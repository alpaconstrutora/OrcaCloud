import React, { useState, useEffect } from 'react';
import { X, Home, MapPin, DollarSign, Check, Info, Package, Layers, Settings, Building2, ArrowLeft } from 'lucide-react';
import { Property, PropertyStatus, Client } from '../types';
import { clientService } from '../services/clientService';
import { propertyTypesService, PropertyType } from '../services/propertyTypesService';
import PropertyTypesManager from './PropertyTypesManager';
import { Sheet, SheetPanel, SheetFooter } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';

interface PropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Property>) => void;
    initialData?: Property;
    defaultPurpose?: 'SALE' | 'RENTAL' | 'BOTH';
    buildings?: Property[];
    organizationId?: string;
    /**
     * 'sheet' (default) = painel lateral. 'page' = tela dedicada, ocupando o
     * conteúdo do módulo (UI_PATTERNS §2: fluxo multi-aba/multi-etapa).
     * No modo 'page' quem renderiza controla a montagem — o componente não
     * desenha backdrop nem se posiciona sozinho.
     */
    renderMode?: 'sheet' | 'page';
}

const PropertyModal: React.FC<PropertyModalProps> = ({ isOpen, onClose, onSubmit, initialData, defaultPurpose, buildings = [], organizationId, renderMode = 'sheet' }) => {
    const asPage = renderMode === 'page';
    const [formData, setFormData] = useState<Partial<Property>>({
        name: '',
        type: 'APARTMENT',
        purpose: defaultPurpose || 'BOTH',
        address: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: '',
        area: 0,
        price: 0,
        status: PropertyStatus.AVAILABLE,
        specs: {
            bedrooms: 0,
            bathrooms: 0,
            suites: 0,
            parkingSpaces: 0,
            floor: 0
        },
        block: '',
        floor: 0,
        private_area: 0,
        common_area: 0,
        total_area: 0,
        features: [],
        images: [],
        parent_id: undefined
    });

    const [dirty, setDirty] = useState(false);
    const update = (patch: Partial<Property>) => { setFormData(prev => ({ ...prev, ...patch })); setDirty(true); };
    const confirm = useConfirm();
    const handleRequestClose = React.useCallback(async () => {
        if (dirty) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas neste imóvel. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair sem salvar',
            });
            if (!ok) return;
        }
        setDirty(false);
        onClose();
    }, [dirty, onClose, confirm]);

    const [clients, setClients] = useState<Client[]>([]);
    const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
    const [isTypesManagerOpen, setIsTypesManagerOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setDirty(false);
        clientService.listClients().then(setClients).catch(console.error);
        propertyTypesService.listTypes().then(setPropertyTypes).catch(console.error);

        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                name: '',
                type: 'APARTMENT',
                purpose: defaultPurpose || 'BOTH',
                address: '',
                area: 0,
                price: 0,
                status: PropertyStatus.AVAILABLE,
                specs: { bedrooms: 0, bathrooms: 0, suites: 0, parkingSpaces: 0, floor: 0 },
                street: '',
                number: '',
                neighborhood: '',
                city: '',
                state: '',
                zip_code: '',
                features: [],
                images: [],
                parent_id: undefined
            });
        }
    }, [initialData, isOpen, defaultPurpose]);

    // Link reverso: descobre se este imóvel foi criado a partir de um Empreendimento
    const [emprOrigin, setEmprOrigin] = useState<{
        empreendimentoId: string; empreendimentoName: string;
        towerName: string; unitName: string;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || !initialData?.id) { setEmprOrigin(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('empreendimento_units')
                    .select('id, name, empreendimento_towers!inner(name, empreendimentos!inner(id, name))')
                    .eq('commercial_property_id', initialData.id)
                    .maybeSingle();
                if (cancelled) return;
                if (!data) { setEmprOrigin(null); return; }
                const tower = (data as any).empreendimento_towers;
                const empr  = tower?.empreendimentos;
                setEmprOrigin({
                    empreendimentoId:   empr?.id   ?? '',
                    empreendimentoName: empr?.name ?? '—',
                    towerName:          tower?.name ?? '—',
                    unitName:           (data as any).name,
                });
            } catch {
                if (!cancelled) setEmprOrigin(null);
            }
        })();
        return () => { cancelled = true; };
    }, [initialData?.id, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const content = (
        <>
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-6 shrink-0">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-11 h-11">
                                <Home className="w-5 h-5" />
                            </div>
                            <div className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                                {formData.type === 'BUILDING' ? 'EDIFÍCIO' : 'UNIDADE'}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                                    {initialData ? 'Editar Imóvel' : 'Novo Imóvel'}
                                </h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Status:</span>
                                    <span className={`text-[9px] font-bold uppercase ${formData.status === PropertyStatus.AVAILABLE ? 'text-green-600' : formData.status === PropertyStatus.SOLD ? 'text-blue-600' : formData.status === PropertyStatus.EXCHANGED ? 'text-purple-600' : 'text-amber-600'}`}>
                                        {formData.status === PropertyStatus.EXCHANGED ? 'Permutado' : formData.status}
                                    </span>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 font-medium leading-tight">
                                {initialData ? 'Atualize as informações do imóvel selecionado.' : 'Configure os dados do novo imóvel.'}
                            </p>
                            {emprOrigin && (
                                <div className="flex items-center gap-1.5 mt-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-lg w-fit">
                                    <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    <span className="text-[10px] font-bold text-blue-700">
                                        {emprOrigin.empreendimentoName}
                                    </span>
                                    <span className="text-[10px] text-blue-400">›</span>
                                    <span className="text-[10px] text-blue-600">{emprOrigin.towerName}</span>
                                    <span className="text-[10px] text-blue-400">›</span>
                                    <span className="text-[10px] font-bold text-blue-700">{emprOrigin.unitName}</span>
                                </div>
                            )}
                            {initialData?.planta_ai_study_id && (
                                <div 
                                    onClick={() => window.location.hash = `#/planta-ai?studyId=${initialData.planta_ai_study_id}`}
                                    className="flex items-center gap-1.5 mt-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg w-fit cursor-pointer hover:bg-indigo-100 transition-colors"
                                >
                                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">
                                        Gerado via Planta AI
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    {asPage ? (
                        <button
                            type="button"
                            onClick={handleRequestClose}
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar
                        </button>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRequestClose}
                            className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <SheetPanel className="p-6 space-y-6">
                    {/* Section: Identificação, Localização e Tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-8 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Info className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-xs">Identificação e Endereço</h3>
                            </div>
                            <div className="grid grid-cols-12 gap-x-4 gap-y-3">
                                <div className="space-y-1 col-span-12">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Nome do Empreendimento / Unidade</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => update({ name: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm shadow-inner"
                                        placeholder="Ex: Edifício Ocean View - Apto 501"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-10">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Logradouro</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            required
                                            type="text"
                                            value={formData.street || ''}
                                            onChange={(e) => update({ street: e.target.value, address: `${e.target.value}, ${formData.number || ''}` })}
                                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            placeholder="Rua, Avenida, etc."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Nº</label>
                                    <input
                                        type="text"
                                        value={formData.number || ''}
                                        onChange={(e) => update({ number: e.target.value, address: `${formData.street || ''}, ${e.target.value}` })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm text-center"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-5">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Bairro</label>
                                    <input
                                        type="text"
                                        value={formData.neighborhood || ''}
                                        onChange={(e) => update({ neighborhood: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-5">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Cidade</label>
                                    <input
                                        type="text"
                                        value={formData.city || ''}
                                        onChange={(e) => update({ city: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">UF</label>
                                    <input
                                        type="text"
                                        maxLength={2}
                                        value={formData.state || ''}
                                        onChange={(e) => update({ state: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm text-center uppercase"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-4 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Package className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-xs">Tipo e Finalidade</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5 col-span-2">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tipo</label>
                                        {organizationId && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsTypesManagerOpen(true)}
                                                className="h-auto px-0 gap-1 text-[9px] text-blue-400 hover:text-blue-600 hover:bg-transparent"
                                            >
                                                <Settings className="w-3 h-3" />
                                                Gerenciar
                                            </Button>
                                        )}
                                    </div>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => update({ type: e.target.value as Property['type'] })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                    >
                                        {propertyTypes.length > 0
                                            ? propertyTypes.map(t => (
                                                <option key={t.code} value={t.code}>{t.label}</option>
                                            ))
                                            : <>
                                                <option value="APARTMENT">Apartamento</option>
                                                <option value="HOUSE">Casa</option>
                                                <option value="LAND">Terreno / Lote</option>
                                                <option value="COMMERCIAL">Comercial</option>
                                                <option value="BUILDING">Edifício (Master)</option>
                                            </>
                                        }
                                    </select>
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Finalidade</label>
                                    <select
                                        value={formData.purpose || 'BOTH'}
                                        onChange={(e) => update({ purpose: e.target.value as Property['purpose'] })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                    >
                                        <option value="SALE">Apenas Venda</option>
                                        <option value="RENTAL">Apenas Aluguel</option>
                                        <option value="BOTH">Venda e Aluguel</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Bloco</label>
                                    <input
                                        type="text"
                                        value={formData.block || ''}
                                        onChange={(e) => update({ block: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-center uppercase text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Pavimento</label>
                                    <input
                                        type="number"
                                        value={formData.floor || 0}
                                        onChange={(e) => update({ floor: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-center text-sm"
                                    />
                                </div>
                                {formData.type !== 'BUILDING' && buildings.length > 0 && (
                                    <div className="space-y-1.5 col-span-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Vincular a Empreendimento (Opcional)</label>
                                        <select
                                            value={formData.parent_id || ''}
                                            onChange={(e) => update({ parent_id: e.target.value || undefined })}
                                            className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                        >
                                            <option value="">Nenhum (Unidade Independente)</option>
                                            {buildings.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section: Propriedade e Status (Horizontal) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-600">
                            <DollarSign className="w-4 h-4" />
                            <h3 className="font-black uppercase tracking-widest text-xs">Propriedade e Status</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5 font-mono">
                                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest px-1 flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" /> Valor de Venda (R$)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.initial_price || formData.price || 0}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        update({ initial_price: val, price: val });
                                    }}
                                    className="w-full px-4 py-2 bg-blue-50/50 border border-blue-100 focus:bg-white focus:border-blue-500 rounded-xl outline-none font-black text-gray-900 transition-all shadow-inner text-base"
                                    placeholder="0,00"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Mudar Status</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => update({ status: e.target.value as PropertyStatus })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                >
                                    <option value={PropertyStatus.AVAILABLE}>Disponível 🟢</option>
                                    <option value={PropertyStatus.RESERVED}>Reservado 🟡</option>
                                    <option value={PropertyStatus.SOLD}>Vendido 🔵</option>
                                    <option value={PropertyStatus.RENTED}>Alugado 🟣</option>
                                    <option value={PropertyStatus.EXCHANGED}>Permutado 🔄</option>
                                    <option value={PropertyStatus.MAINTENANCE}>Manutenção 🟠</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Cliente / Proprietário</label>
                                <select
                                    value={formData.client_id || ''}
                                    onChange={(e) => update({ client_id: e.target.value || undefined })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                >
                                    <option value="">Sem vínculo (Inventário)</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Novos atributos de inteligência de preço */}
                        {formData.type !== 'BUILDING' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-gray-50/50 rounded-2xl border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Posição no Pavimento</label>
                                    <select
                                        value={formData.position_type}
                                        onChange={(e) => update({ position_type: e.target.value as Property['position_type'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-form-input"
                                    >
                                        <option value="LATERAL">Lateral</option>
                                        <option value="FRONT">Frente (+)</option>
                                        <option value="BACK">Fundos (-)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Qualidade da Vista</label>
                                    <select
                                        value={formData.view_type}
                                        onChange={(e) => update({ view_type: e.target.value as Property['view_type'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-form-input"
                                    >
                                        <option value="NONE">Sem Vista (Base)</option>
                                        <option value="PARTIAL">Vista Parcial (+)</option>
                                        <option value="FULL">Vista Plena (++)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Orientação Solar</label>
                                    <select
                                        value={formData.sun_orientation}
                                        onChange={(e) => update({ sun_orientation: e.target.value as Property['sun_orientation'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-form-input"
                                    >
                                        <option value="NORTH">Norte (Melhor)</option>
                                        <option value="EAST">Leste (Manhã)</option>
                                        <option value="WEST">Oeste (Tarde)</option>
                                        <option value="SOUTH">Sul</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                </SheetPanel>
                <SheetFooter>
                    <button
                        type="button"
                        onClick={handleRequestClose}
                        className="px-6 py-2.5 bg-white text-gray-500 rounded-xl font-bold hover:text-gray-900 transition-all border border-gray-200 shadow-sm active:scale-95 text-sm"
                    >
                        Cancelar
                    </button>
                    <Button
                        type="submit"
                        className="px-8 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 active:scale-95 text-sm"
                    >
                        <Check className="w-4 h-4" />
                        Salvar Alterações
                    </Button>
                </SheetFooter>
                </form>
        </>
    );

    return (
        <>
        {/* Modo página: altura travada na viewport (padrão ImovibDetailView) — cabeçalho
            e rodapé ficam fixos e só o corpo rola (§6.4). */}
        {asPage ? (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
                {content}
            </div>
        ) : (
            <Sheet open={isOpen} onClose={handleRequestClose} size="2xl">
                {content}
            </Sheet>
        )}

        {organizationId && (
            <PropertyTypesManager
                isOpen={isTypesManagerOpen}
                onClose={() => setIsTypesManagerOpen(false)}
                organizationId={organizationId}
                onTypesChanged={() => propertyTypesService.listTypes().then(setPropertyTypes).catch(console.error)}
            />
        )}
        </>
    );
};

export default PropertyModal;
