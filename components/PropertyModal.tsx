import React, { useState, useEffect } from 'react';
import { X, Home, MapPin, DollarSign, Check, Info, Layers, Settings, Building2, ArrowLeft, FileText } from 'lucide-react';
import { Property, PropertyStatus, Client } from '../types';
import { Company } from '../types/company';
import { clientService } from '../services/clientService';
import { companyService } from '../services/companyService';
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

// §8: status é texto colorido, sem pílula/uppercase — e em português, não o
// enum cru ("RENTED") que aparecia no cabeçalho.
const STATUS_LABEL: Record<string, string> = {
    [PropertyStatus.AVAILABLE]: 'Disponível',
    [PropertyStatus.RESERVED]: 'Reservado',
    [PropertyStatus.SOLD]: 'Vendido',
    [PropertyStatus.RENTED]: 'Alugado',
    [PropertyStatus.EXCHANGED]: 'Permutado',
    [PropertyStatus.MAINTENANCE]: 'Manutenção',
    [PropertyStatus.STUDY]: 'Em estudo',
};
const STATUS_COLOR: Record<string, string> = {
    [PropertyStatus.AVAILABLE]: 'text-green-700',
    [PropertyStatus.RESERVED]: 'text-amber-700',
    [PropertyStatus.SOLD]: 'text-blue-700',
    [PropertyStatus.RENTED]: 'text-purple-700',
    [PropertyStatus.EXCHANGED]: 'text-indigo-700',
    [PropertyStatus.MAINTENANCE]: 'text-orange-700',
    [PropertyStatus.STUDY]: 'text-gray-600',
};

// §16 (escala compacta) + §21 (rótulo sentence case). Base sem cor de fundo/borda
// para as variantes não conflitarem na ordem do CSS gerado.
const FIELD_BASE = 'w-full h-9 px-3 rounded-[6px] outline-none text-sm transition-all';
const INPUT_CLS = `${FIELD_BASE} bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`;
const SELECT_CLS = `${INPUT_CLS} cursor-pointer`;
const PRICE_CLS = `${FIELD_BASE} bg-blue-50/60 border border-blue-200 text-gray-900 font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`;
const LABEL_CLS = 'text-xs font-semibold text-slate-500';

const SectionHeader: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
        <Icon className="w-3.5 h-3.5 text-blue-600" />
        <h3 className="text-[13px] font-bold text-gray-700">{title}</h3>
    </div>
);

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
                message: 'Há alterações não salvas nesta unidade. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair sem salvar',
            });
            if (!ok) return;
        }
        setDirty(false);
        onClose();
    }, [dirty, onClose, confirm]);

    const [clients, setClients] = useState<Client[]>([]);
    // REGRA #5: sem organizationId (seletor global em "Todas"), lista o que a RLS
    // permitir em vez de bloquear — o campo de empresa proprietária nunca fica morto.
    const [companies, setCompanies] = useState<Company[]>([]);
    const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
    const [isTypesManagerOpen, setIsTypesManagerOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setDirty(false);
        clientService.listClients().then(setClients).catch(console.error);
        companyService.list(organizationId || undefined).then(setCompanies).catch(console.error);
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
    }, [initialData, isOpen, defaultPurpose, organizationId]);

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

    // O tipo já diz se é unidade ou edifício — o título carrega essa informação
    // (era um chip "UNIDADE"/"EDIFÍCIO" separado, altura à toa no cabeçalho).
    const isBuilding = formData.type === 'BUILDING';
    const screenTitle = initialData
        ? (isBuilding ? 'Editar Edifício' : 'Editar Unidade')
        : (isBuilding ? 'Novo Edifício' : 'Nova Unidade');

    const content = (
        <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex justify-between items-center gap-4 shrink-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="bg-blue-600 w-9 h-9 rounded-[10px] text-white flex items-center justify-center shrink-0">
                            <Home className="w-[18px] h-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="font-black text-slate-800 text-lg leading-tight">{screenTitle}</h3>
                                {initialData && (
                                    <span className={`text-sm font-normal ${STATUS_COLOR[formData.status as string] || 'text-gray-600'}`}>
                                        {STATUS_LABEL[formData.status as string] || formData.status}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[13px] text-gray-500 leading-tight">
                                <span>
                                    {initialData
                                        ? `Atualize os dados ${isBuilding ? 'do edifício' : 'da unidade'}.`
                                        : `Preencha os dados ${isBuilding ? 'do novo edifício' : 'da nova unidade'}.`}
                                </span>
                                {emprOrigin && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-[6px] text-[11px] text-blue-700">
                                        <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
                                        {emprOrigin.empreendimentoName}
                                        <span className="text-blue-300">›</span>
                                        {emprOrigin.towerName}
                                        <span className="text-blue-300">›</span>
                                        {emprOrigin.unitName}
                                    </span>
                                )}
                                {initialData?.planta_ai_study_id && (
                                    <button
                                        type="button"
                                        onClick={() => { window.location.hash = `#/planta-ai?studyId=${initialData.planta_ai_study_id}`; }}
                                        className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                                    >
                                        <Layers className="w-3 h-3 shrink-0" />
                                        Gerado via Planta AI
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    {asPage ? (
                        <Button type="button" variant="secondary" onClick={handleRequestClose} className="shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                            Voltar
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRequestClose}
                            className="text-gray-400 hover:text-gray-600 shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <SheetPanel className="p-5 space-y-4">
                    {/* Identificação, tipo e endereço num único grid de 12 colunas: as
                        duas colunas de alturas diferentes deixavam meia tela vazia. */}
                    <section className="space-y-2.5">
                        <SectionHeader icon={Info} title="Identificação e endereço" />
                        <div className="grid grid-cols-12 gap-x-3 gap-y-2.5">
                            <div className="space-y-1 col-span-12 md:col-span-6">
                                <label className={LABEL_CLS}>Nome do empreendimento / unidade</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => update({ name: e.target.value })}
                                    className={INPUT_CLS}
                                    placeholder="Ex: Edifício Ocean View - Apto 501"
                                />
                            </div>
                            <div className="space-y-1 col-span-6 md:col-span-3">
                                <div className="flex items-center justify-between gap-2 h-4">
                                    <label className={LABEL_CLS}>Tipo</label>
                                    {organizationId && (
                                        <button
                                            type="button"
                                            onClick={() => setIsTypesManagerOpen(true)}
                                            className="flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:text-blue-700"
                                        >
                                            <Settings className="w-3 h-3" />
                                            Gerenciar
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={formData.type}
                                    onChange={(e) => update({ type: e.target.value as Property['type'] })}
                                    className={SELECT_CLS}
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
                            <div className="space-y-1 col-span-6 md:col-span-3">
                                <label className={LABEL_CLS}>Finalidade</label>
                                <select
                                    value={formData.purpose || 'BOTH'}
                                    onChange={(e) => update({ purpose: e.target.value as Property['purpose'] })}
                                    className={SELECT_CLS}
                                >
                                    <option value="SALE">Apenas venda</option>
                                    <option value="RENTAL">Apenas aluguel</option>
                                    <option value="BOTH">Venda e aluguel</option>
                                </select>
                            </div>

                            <div className="space-y-1 col-span-12 md:col-span-5">
                                <label className={LABEL_CLS}>Logradouro</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        required
                                        type="text"
                                        value={formData.street || ''}
                                        onChange={(e) => update({ street: e.target.value, address: `${e.target.value}, ${formData.number || ''}` })}
                                        className={`${INPUT_CLS} pl-9`}
                                        placeholder="Rua, avenida, etc."
                                    />
                                </div>
                            </div>
                            <div className="space-y-1 col-span-4 md:col-span-2">
                                <label className={LABEL_CLS}>Nº</label>
                                <input
                                    type="text"
                                    value={formData.number || ''}
                                    onChange={(e) => update({ number: e.target.value, address: `${formData.street || ''}, ${e.target.value}` })}
                                    className={`${INPUT_CLS} text-center`}
                                />
                            </div>
                            <div className="space-y-1 col-span-8 md:col-span-5">
                                <label className={LABEL_CLS}>Bairro</label>
                                <input
                                    type="text"
                                    value={formData.neighborhood || ''}
                                    onChange={(e) => update({ neighborhood: e.target.value })}
                                    className={INPUT_CLS}
                                />
                            </div>

                            <div className="space-y-1 col-span-8 md:col-span-4">
                                <label className={LABEL_CLS}>Cidade</label>
                                <input
                                    type="text"
                                    value={formData.city || ''}
                                    onChange={(e) => update({ city: e.target.value })}
                                    className={INPUT_CLS}
                                />
                            </div>
                            <div className="space-y-1 col-span-4 md:col-span-2">
                                <label className={LABEL_CLS}>UF</label>
                                <input
                                    type="text"
                                    maxLength={2}
                                    value={formData.state || ''}
                                    onChange={(e) => update({ state: e.target.value.toUpperCase() })}
                                    className={`${INPUT_CLS} text-center uppercase`}
                                />
                            </div>
                            <div className="space-y-1 col-span-6 md:col-span-3">
                                <label className={LABEL_CLS}>Bloco</label>
                                <input
                                    type="text"
                                    value={formData.block || ''}
                                    onChange={(e) => update({ block: e.target.value })}
                                    className={`${INPUT_CLS} text-center uppercase`}
                                />
                            </div>
                            <div className="space-y-1 col-span-6 md:col-span-3">
                                <label className={LABEL_CLS}>Pavimento</label>
                                <input
                                    type="number"
                                    value={formData.floor || 0}
                                    onChange={(e) => update({ floor: parseInt(e.target.value) })}
                                    className={`${INPUT_CLS} text-center`}
                                />
                            </div>

                            {!isBuilding && buildings.length > 0 && (
                                <div className="space-y-1 col-span-12 md:col-span-6">
                                    <label className={LABEL_CLS}>Vincular a empreendimento (opcional)</label>
                                    <select
                                        value={formData.parent_id || ''}
                                        onChange={(e) => update({ parent_id: e.target.value || undefined })}
                                        className={SELECT_CLS}
                                    >
                                        <option value="">Nenhum (unidade independente)</option>
                                        {buildings.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Registro do imóvel — identifica a unidade na cláusula de objeto do
                        contrato ("objeto da matrícula nº X do Cartório de …") e na
                        cláusula de encargos (inscrição de IPTU). Migration 20270842000001. */}
                    <section className="space-y-2.5">
                        <SectionHeader icon={FileText} title="Registro do imóvel" />
                        <div className="grid grid-cols-12 gap-x-3 gap-y-2.5">
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                <label className={LABEL_CLS}>Matrícula</label>
                                <input
                                    type="text"
                                    value={formData.registration_number || ''}
                                    onChange={(e) => update({ registration_number: e.target.value })}
                                    placeholder="12.345"
                                    className={INPUT_CLS}
                                />
                            </div>
                            <div className="space-y-1 col-span-12 md:col-span-6">
                                <label className={LABEL_CLS}>Cartório de registro de imóveis</label>
                                <input
                                    type="text"
                                    value={formData.registry_office || ''}
                                    onChange={(e) => update({ registry_office: e.target.value })}
                                    placeholder="1º Ofício de Registro de Imóveis de Belo Horizonte/MG"
                                    className={INPUT_CLS}
                                />
                            </div>
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                <label className={LABEL_CLS}>Inscrição imobiliária (IPTU)</label>
                                <input
                                    type="text"
                                    value={formData.iptu_registration || ''}
                                    onChange={(e) => update({ iptu_registration: e.target.value })}
                                    className={INPUT_CLS}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Propriedade e status — valor, situação, proprietário e empresa do
                        grupo dona do imóvel numa única linha. A empresa decide o regime
                        tributário na geração de Tributos a Pagar e é quem assina como
                        LOCADOR na minuta de locação. */}
                    <section className="space-y-2.5">
                        <SectionHeader icon={DollarSign} title="Propriedade e status" />
                        <div className="grid grid-cols-12 gap-x-3 gap-y-2.5">
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                <label className={`${LABEL_CLS} text-blue-600`}>Valor de venda (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.initial_price || formData.price || 0}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        update({ initial_price: val, price: val });
                                    }}
                                    className={PRICE_CLS}
                                    placeholder="0,00"
                                />
                            </div>
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                <label className={LABEL_CLS}>Mudar status</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => update({ status: e.target.value as PropertyStatus })}
                                    className={SELECT_CLS}
                                >
                                    <option value={PropertyStatus.AVAILABLE}>Disponível</option>
                                    <option value={PropertyStatus.RESERVED}>Reservado</option>
                                    <option value={PropertyStatus.SOLD}>Vendido</option>
                                    <option value={PropertyStatus.RENTED}>Alugado</option>
                                    <option value={PropertyStatus.EXCHANGED}>Permutado</option>
                                    <option value={PropertyStatus.MAINTENANCE}>Manutenção</option>
                                </select>
                            </div>
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                <label className={LABEL_CLS}>Cliente / proprietário</label>
                                <select
                                    value={formData.client_id || ''}
                                    onChange={(e) => update({ client_id: e.target.value || undefined })}
                                    className={SELECT_CLS}
                                >
                                    <option value="">Sem vínculo (inventário)</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1 col-span-12 md:col-span-3">
                                {/* Rótulo curto de propósito: com "(locador)" ele quebrava em duas
                                    linhas no painel lateral (672px) e desalinhava o select dos
                                    outros três da linha. A função de locador está na dica abaixo. */}
                                <label className={LABEL_CLS}>Empresa proprietária</label>
                                <select
                                    value={formData.company_id || ''}
                                    onChange={(e) => update({ company_id: e.target.value || undefined })}
                                    className={SELECT_CLS}
                                >
                                    <option value="">Herdar do empreendimento</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-gray-400 leading-snug">
                                    Define o regime tributário da locação e quem assina como locador.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Atributos de inteligência de preço */}
                    {!isBuilding && (
                        <section className="space-y-2.5">
                            <SectionHeader icon={Layers} title="Atributos de precificação" />
                            <div className="grid grid-cols-12 gap-x-3 gap-y-2.5">
                                <div className="space-y-1 col-span-12 md:col-span-4">
                                    <label className={LABEL_CLS}>Posição no pavimento</label>
                                    <select
                                        value={formData.position_type}
                                        onChange={(e) => update({ position_type: e.target.value as Property['position_type'] })}
                                        className={SELECT_CLS}
                                    >
                                        <option value="LATERAL">Lateral</option>
                                        <option value="FRONT">Frente (+)</option>
                                        <option value="BACK">Fundos (-)</option>
                                    </select>
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-4">
                                    <label className={LABEL_CLS}>Qualidade da vista</label>
                                    <select
                                        value={formData.view_type}
                                        onChange={(e) => update({ view_type: e.target.value as Property['view_type'] })}
                                        className={SELECT_CLS}
                                    >
                                        <option value="NONE">Sem vista (base)</option>
                                        <option value="PARTIAL">Vista parcial (+)</option>
                                        <option value="FULL">Vista plena (++)</option>
                                    </select>
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-4">
                                    <label className={LABEL_CLS}>Orientação solar</label>
                                    <select
                                        value={formData.sun_orientation}
                                        onChange={(e) => update({ sun_orientation: e.target.value as Property['sun_orientation'] })}
                                        className={SELECT_CLS}
                                    >
                                        <option value="NORTH">Norte (melhor)</option>
                                        <option value="EAST">Leste (manhã)</option>
                                        <option value="WEST">Oeste (tarde)</option>
                                        <option value="SOUTH">Sul</option>
                                    </select>
                                </div>
                            </div>
                        </section>
                    )}

                </SheetPanel>
                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={handleRequestClose}>
                        Cancelar
                    </Button>
                    <Button type="submit">
                        <Check className="w-[15px] h-[15px]" />
                        Salvar Alterações
                    </Button>
                </SheetFooter>
                </form>
        </>
    );

    return (
        <>
        {/* Modo página: `max-h` (não `h`) — o cartão para na altura do conteúdo, então o
            rodapé sobe junto quando o formulário é curto (edifício não tem os atributos
            de precificação) em vez de deixar meia tela em branco. Passando da viewport,
            cabeçalho e rodapé ficam fixos e só o corpo rola (§6.4). */}
        {asPage ? (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
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
