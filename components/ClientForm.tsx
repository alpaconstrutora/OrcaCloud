import React from 'react';
import { useOrgContext } from '../hooks/useOrgContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { ArrowLeft, User, Mail, Phone, FileText, MapPin, Building2, Search, Check } from 'lucide-react';
import { Client, Empreendimento } from '../types';
import CityStateSelect from './CityStateSelect';
import SaveStatus from './ui/SaveStatus';
import { useStore } from '../store/useStore';
import { clientCategoryService } from '../services/clientCategoryService';
import { ClientCategory } from '../types';
import { empreendimentoService } from '../services/empreendimentoService';
import { clientEmpreendimentoService } from '../services/clientEmpreendimentoService';
import { masterDataService, MasterState } from '../services/masterDataService';
import { MARITAL_STATUS_OPTIONS, MARITAL_REGIME_OPTIONS, hasSpouse } from '../constants/civilStatus';

/**
 * Cadastro de cliente — TELA, não drawer.
 *
 * Substituiu o `ClientModal.tsx` (que era um `Sheet`) a pedido do usuário em
 * 04/09/2026: "Invés de abrir drawer, abrir tela". Neste app "tela" tem
 * significado técnico fixo — troca de conteúdo IN-FLOW dentro do espaço da
 * página, com sidebar e abas visíveis; nunca `fixed inset-0`, nunca `Sheet`,
 * nunca `Modal`. Referência do cabeçalho: `ContractDetailView.tsx`.
 *
 * Quem troca lista ↔ formulário é o `ClientList` (estado `formState`), do mesmo
 * jeito que `SupplyChainOrderForm` é trocado pelo `AppRouter`.
 *
 * Duas abas desde 04/09/2026, a pedido do usuário: "Dados gerais" (tudo que
 * identifica e qualifica o cliente) e "Endereços e contatos" (e-mail, telefone e
 * o endereço inteiro). É um `<form>` só — a aba decide o que aparece, não o que
 * é gravado, então salvar de qualquer uma das duas grava o cadastro completo.
 */

interface ClientFormProps {
    /** Ausente = criação. */
    initialData?: Client;
    /**
     * Grava o cliente e os vínculos de empreendimento. Devolve o cliente salvo
     * (com id, no caso de criação) para o formulário assumir o modo edição.
     */
    onSubmit: (data: Partial<Client>, empreendimentoIds: string[]) => Promise<Client | null>;
    onClose: () => void;
}

const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';
const INPUT = 'w-full h-9 rounded-[6px] border border-gray-200 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const INPUT_ICON = 'w-full h-9 rounded-[6px] border border-gray-200 pl-9 pr-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const SELECT = `${INPUT} bg-white`;

// Abas do cadastro — §19.1 do guia (card branco, aba ativa `bg-white
// text-blue-600 shadow-sm` sobre trilho `bg-gray-50`). São dois grupos de
// campos da MESMA entidade: o `<h1>` continua sendo o nome do cliente e quem
// muda com a aba é o subtítulo, como em `LaborEmployeeForm.tsx`.
const CLIENT_TABS = [
    { id: 'geral', label: 'Dados gerais' },
    { id: 'contato', label: 'Endereços e contatos' },
] as const;

type ClientTabId = typeof CLIENT_TABS[number]['id'];

const TAB_SUBTITLES: Record<ClientTabId, string> = {
    geral: 'Identificação, organização, empreendimentos vinculados e qualificação civil.',
    contato: 'E-mail, telefone e endereço completo do cliente.',
};

const EMPTY_FORM: Partial<Client> = {
    name: '',
    email: '',
    phone: '',
    document: '',
    rg: '',
    rg_uf: '',
    rg_issuing_agency: '',
    // 'Brasileira' é SUGESTÃO de formulário, não default de banco — a coluna
    // nasceu sem DEFAULT justamente para não afirmar a nacionalidade dos
    // clientes já cadastrados (ver migration 20270842000000).
    nationality: 'Brasileira',
    profession: '',
    marital_status: '',
    marital_regime: '',
    spouse_name: '',
    spouse_document: '',
    legal_rep_name: '',
    legal_rep_document: '',
    legal_rep_rg: '',
    legal_rep_rg_uf: '',
    legal_rep_rg_issuing_agency: '',
    legal_rep_nationality: 'Brasileira',
    legal_rep_role: '',
    type: 'PF',
    address: '',
    address_number: '',
    neighborhood: '',
    city: '',
    state: '',
    category: 'Vendas',
    portal: 'Nenhum',
};

const ClientForm: React.FC<ClientFormProps> = ({ initialData, onSubmit, onClose }) => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const organizations = useStore(state => state.organizations);
    const [categories, setCategories] = React.useState<ClientCategory[]>([]);
    const [states, setStates] = React.useState<MasterState[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [activeTab, setActiveTab] = React.useState<ClientTabId>('geral');
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const [formData, setFormData] = React.useState<Partial<Client>>({
        ...EMPTY_FORM,
        ...(initialData ?? {}),
        organization_id: initialData?.organization_id ?? activeOrganizationId ?? undefined,
    });

    // Vínculo explícito Cliente ↔ Empreendimento (migration 20270918000027).
    const [empreendimentos, setEmpreendimentos] = React.useState<Empreendimento[]>([]);
    const [empreendimentoIds, setEmpreendimentoIds] = React.useState<string[]>([]);
    // Filtro transiente da lista de empreendimentos DENTRO do formulário — não é
    // a busca de uma tela/lista (§3), então não persiste: guardá-lo entre
    // sessões vazaria o filtro de um cliente para o cadastro do próximo.
    const [filtroEmpreendimento, setFiltroEmpreendimento] = React.useState('');

    const update = (patch: Partial<Client>) => {
        setFormData(prev => ({ ...prev, ...patch }));
        markDirty();
    };

    React.useEffect(() => {
        masterDataService.listStates('BR').then(setStates).catch(console.error);
    }, []);

    React.useEffect(() => {
        // As categorias dependem da organização ESCOLHIDA no formulário (campo
        // abaixo), não da organização ativa no seletor global — do contrário,
        // com o seletor global em "Todas as organizações" essa lista nunca era
        // carregada e o campo "Tipo de Cliente" ficava vazio.
        clientCategoryService.list(formData.organization_id || undefined)
            .then(data => {
                setCategories(data);
                setFormData(prev => {
                    if (prev.category && data.some(c => c.name === prev.category)) return prev;
                    return { ...prev, category: data[0]?.name };
                });
            })
            .catch(console.error);
    }, [formData.organization_id]);

    React.useEffect(() => {
        // Sem organização escolhida ("Todas"), lista sem `.eq()` e deixa a RLS
        // recortar — nunca bloqueia o carregamento (REGRA #5).
        empreendimentoService.list(formData.organization_id || undefined)
            .then(setEmpreendimentos)
            .catch(console.error);
    }, [formData.organization_id]);

    React.useEffect(() => {
        if (!initialData?.id) return;
        clientEmpreendimentoService.listIdsByClient(initialData.id)
            .then(setEmpreendimentoIds)
            .catch(console.error);
    }, [initialData?.id]);

    const toggleEmpreendimento = (id: string) => {
        setEmpreendimentoIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
        markDirty();
    };

    const empreendimentosFiltrados = React.useMemo(() => {
        const termo = filtroEmpreendimento.trim().toLowerCase();
        const lista = termo
            ? empreendimentos.filter(e => e.name?.toLowerCase().includes(termo))
            : empreendimentos;
        // Selecionados primeiro: com muitos empreendimentos, o que já está
        // marcado não pode ficar escondido no fim de uma lista rolável.
        return [...lista].sort((a, b) => {
            const sa = empreendimentoIds.includes(a.id) ? 0 : 1;
            const sb = empreendimentoIds.includes(b.id) ? 0 : 1;
            return sa !== sb ? sa - sb : (a.name || '').localeCompare(b.name || '', 'pt-BR');
        });
    }, [empreendimentos, filtroEmpreendimento, empreendimentoIds]);

    const handleBack = async () => {
        if (await confirmDiscard()) onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name?.trim()) {
            // O nome vive na aba "Dados gerais": submeter de outra aba sem ele
            // não pode falhar em silêncio — traz o usuário para o campo faltante.
            setActiveTab('geral');
            return;
        }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const saved = await onSubmit(formData, empreendimentoIds);
            markSaved();
            setSavedAt(Date.now());
            // §25: criar fecha (a tarefa acabou); editar permanece na tela.
            if (!initialData) {
                onClose();
                return;
            }
            if (saved) setFormData(prev => ({ ...prev, ...saved }));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela in-flow — seta "voltar" + h1 text-2xl (§20; 3xl é
                só para o topo de uma lista-raiz). Mesmo padrão de ContractDetailView. */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={handleBack}
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group"
                    title="Voltar para a lista"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-600">
                            {initialData ? (initialData.code || 'Cliente') : 'Novo cadastro'}
                        </span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full" />
                        <span className="text-xs font-medium text-gray-400">Meus Clientes</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                        {initialData ? (formData.name || initialData.name) : 'Novo cliente'}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{TAB_SUBTITLES[activeTab]}</p>
                </div>
            </div>

            {/* Toolbar de abas — anatomia canônica §19.1. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {CLIENT_TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 space-y-6">
                        {activeTab === 'geral' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    {initialData && (
                                        <div>
                                            <label className={LABEL}>Código</label>
                                            <input
                                                type="text"
                                                className={INPUT}
                                                value={formData.code ?? ''}
                                                onChange={(e) => update({ code: e.target.value })}
                                                placeholder="001"
                                            />
                                        </div>
                                    )}
                                    <div className={initialData ? 'md:col-span-3' : 'md:col-span-4'}>
                                        <label className={LABEL}>Nome completo / Razão social</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                className={INPUT_ICON}
                                                value={formData.name ?? ''}
                                                onChange={(e) => update({ name: e.target.value })}
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={LABEL}>Organização</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <select
                                                className={`${INPUT_ICON} bg-white`}
                                                value={formData.organization_id ?? ''}
                                                onChange={(e) => update({ organization_id: e.target.value || undefined })}
                                            >
                                                <option value="">Todas as Organizações</option>
                                                {organizations.map(org => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className={LABEL}>Portais</label>
                                        <select
                                            className={SELECT}
                                            value={formData.portal ?? 'Nenhum'}
                                            onChange={(e) => update({ portal: e.target.value as Client['portal'] })}
                                        >
                                            <option value="Nenhum">Nenhum</option>
                                            <option value="Portal do Cliente">Portal do Cliente</option>
                                        </select>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Selecione "Portal do Cliente" para exibir este cliente na tabela do Portal do Cliente.
                                        </p>
                                    </div>
                                </div>

                                {/* ── Empreendimentos vinculados ─────────────────────────
                                    Vínculo EXPLÍCITO (client_empreendimentos). A coluna da
                                    lista soma este com o vínculo DERIVADO da obra
                                    (projects.settings.clientId → empreendimento-pai). */}
                                <div>
                                    <label className={LABEL}>Empreendimentos vinculados</label>
                                    <div className="rounded-[10px] border border-gray-200 overflow-hidden">
                                        <div className="p-2 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                                            <div className="flex-1 relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Filtrar empreendimentos..."
                                                    value={filtroEmpreendimento}
                                                    onChange={(e) => setFiltroEmpreendimento(e.target.value)}
                                                    className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                />
                                            </div>
                                            <span className="text-xs font-medium text-gray-400 shrink-0 pr-1">
                                                {empreendimentoIds.length} selecionado{empreendimentoIds.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                                            {empreendimentosFiltrados.length === 0 ? (
                                                <p className="text-sm font-normal text-gray-400 px-3 py-6 text-center">
                                                    {empreendimentos.length === 0
                                                        ? 'Nenhum empreendimento cadastrado nesta organização.'
                                                        : 'Nenhum empreendimento corresponde ao filtro.'}
                                                </p>
                                            ) : empreendimentosFiltrados.map(emp => {
                                                const marcado = empreendimentoIds.includes(emp.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={emp.id}
                                                        onClick={() => toggleEmpreendimento(emp.id)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${marcado ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                                                    >
                                                        <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 ${marcado ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                                                            {marcado && <Check className="w-3 h-3" />}
                                                        </span>
                                                        <Building2 className={`w-4 h-4 shrink-0 ${marcado ? 'text-blue-600' : 'text-gray-300'}`} />
                                                        <span className={`block truncate text-sm font-normal ${marcado ? 'text-blue-700' : 'text-gray-700'}`} title={emp.name}>
                                                            {emp.name}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        O vínculo por obra (Obra › Cliente) continua valendo e aparece na lista junto com os escolhidos aqui.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={LABEL}>Tipo de pessoa</label>
                                        <select
                                            className={SELECT}
                                            value={formData.type}
                                            onChange={(e) => update({ type: e.target.value as 'PF' | 'PJ' })}
                                        >
                                            <option value="PF">Pessoa Física</option>
                                            <option value="PJ">Pessoa Jurídica</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={LABEL}>Tipo de cliente</label>
                                        <select
                                            className={SELECT}
                                            value={formData.category}
                                            onChange={(e) => update({ category: e.target.value as Client['category'] })}
                                        >
                                            {categories.map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={LABEL}>CPF / CNPJ</label>
                                        <div className="relative">
                                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="000.000.000-00"
                                                className={INPUT_ICON}
                                                value={formData.document ?? ''}
                                                onChange={(e) => update({ document: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {formData.type === 'PF' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className={LABEL}>RG</label>
                                            <div className="relative">
                                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="00.000.000-0"
                                                    className={INPUT_ICON}
                                                    value={formData.rg ?? ''}
                                                    onChange={(e) => update({ rg: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={LABEL}>UF</label>
                                            <select
                                                className={SELECT}
                                                value={formData.rg_uf ?? ''}
                                                onChange={(e) => update({ rg_uf: e.target.value })}
                                            >
                                                <option value="">—</option>
                                                {states.map(s => (
                                                    <option key={s.id} value={s.code}>{s.code}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={LABEL}>Órgão expedidor</label>
                                            <input
                                                type="text"
                                                placeholder="SSP"
                                                className={INPUT}
                                                value={formData.rg_issuing_agency ?? ''}
                                                onChange={(e) => update({ rg_issuing_agency: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Representante legal (PJ) — quem assina pela empresa. Sem isso a
                                    cláusula de qualificação do cliente PJ na minuta não diz quem a
                                    representa ("neste ato representada por..."). Mesmos nomes de campo
                                    da qualificação civil PF abaixo, prefixados legal_rep_ — vocabulário
                                    único, sem cônjuge/estado civil (não se aplica a quem assina PELA
                                    empresa). Migration 20270867000000. */}
                                {formData.type === 'PJ' && (
                                    <div className="space-y-4 pt-2 border-t border-gray-100">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                            <User className="w-4 h-4 text-blue-600" />
                                            Representante legal
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={LABEL}>Nome do representante</label>
                                                <input
                                                    type="text"
                                                    className={INPUT}
                                                    value={formData.legal_rep_name ?? ''}
                                                    onChange={(e) => update({ legal_rep_name: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className={LABEL}>Cargo / qualificação</label>
                                                <input
                                                    type="text"
                                                    placeholder="Sócio-administrador, Procurador..."
                                                    className={INPUT}
                                                    value={formData.legal_rep_role ?? ''}
                                                    onChange={(e) => update({ legal_rep_role: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className={LABEL}>CPF</label>
                                                <div className="relative">
                                                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="000.000.000-00"
                                                        className={INPUT_ICON}
                                                        value={formData.legal_rep_document ?? ''}
                                                        onChange={(e) => update({ legal_rep_document: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={LABEL}>Nacionalidade</label>
                                                <input
                                                    type="text"
                                                    placeholder="Brasileira"
                                                    className={INPUT}
                                                    value={formData.legal_rep_nationality ?? ''}
                                                    onChange={(e) => update({ legal_rep_nationality: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className={LABEL}>RG</label>
                                                <div className="relative">
                                                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="00.000.000-0"
                                                        className={INPUT_ICON}
                                                        value={formData.legal_rep_rg ?? ''}
                                                        onChange={(e) => update({ legal_rep_rg: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={LABEL}>UF do RG</label>
                                                <select
                                                    className={SELECT}
                                                    value={formData.legal_rep_rg_uf ?? ''}
                                                    onChange={(e) => update({ legal_rep_rg_uf: e.target.value })}
                                                >
                                                    <option value="">—</option>
                                                    {states.map(s => (
                                                        <option key={s.id} value={s.code}>{s.code}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={LABEL}>Órgão expedidor</label>
                                                <input
                                                    type="text"
                                                    placeholder="SSP"
                                                    className={INPUT}
                                                    value={formData.legal_rep_rg_issuing_agency ?? ''}
                                                    onChange={(e) => update({ legal_rep_rg_issuing_agency: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Qualificação civil — abre a cláusula de qualificação das partes
                                    nos contratos gerados ("FULANO, brasileiro, casado sob o regime
                                    de comunhão parcial, engenheiro, portador do RG…"). Só PF: a
                                    qualificação de PJ sai de razão social + CNPJ + sede.
                                    Vocabulário em constants/civilStatus.ts, compartilhado com o
                                    cadastro de fiador (contract_guarantors). */}
                                {formData.type === 'PF' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className={LABEL}>Nacionalidade</label>
                                                <input
                                                    type="text"
                                                    placeholder="Brasileira"
                                                    className={INPUT}
                                                    value={formData.nationality ?? ''}
                                                    onChange={(e) => update({ nationality: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className={LABEL}>Profissão</label>
                                                <input
                                                    type="text"
                                                    placeholder="Engenheiro(a) civil"
                                                    className={INPUT}
                                                    value={formData.profession ?? ''}
                                                    onChange={(e) => update({ profession: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className={LABEL}>Estado civil</label>
                                                <select
                                                    className={SELECT}
                                                    value={formData.marital_status ?? ''}
                                                    onChange={(e) => {
                                                        // Sair de casado/união estável limpa regime e cônjuge:
                                                        // deixá-los preenchidos faria a minuta afirmar um
                                                        // cônjuge que o estado civil já nega.
                                                        const next = e.target.value;
                                                        update(hasSpouse(next)
                                                            ? { marital_status: next }
                                                            : { marital_status: next, marital_regime: '', spouse_name: '', spouse_document: '' });
                                                    }}
                                                >
                                                    <option value="">Não informado</option>
                                                    {MARITAL_STATUS_OPTIONS.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {hasSpouse(formData.marital_status) && (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className={LABEL}>Regime de bens</label>
                                                    <select
                                                        className={SELECT}
                                                        value={formData.marital_regime ?? ''}
                                                        onChange={(e) => update({ marital_regime: e.target.value })}
                                                    >
                                                        <option value="">Não informado</option>
                                                        {MARITAL_REGIME_OPTIONS.map(r => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={LABEL}>Nome do cônjuge</label>
                                                    <input
                                                        type="text"
                                                        className={INPUT}
                                                        value={formData.spouse_name ?? ''}
                                                        onChange={(e) => update({ spouse_name: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={LABEL}>CPF do cônjuge</label>
                                                    <div className="relative">
                                                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            placeholder="000.000.000-00"
                                                            className={INPUT_ICON}
                                                            value={formData.spouse_document ?? ''}
                                                            onChange={(e) => update({ spouse_document: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'contato' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={LABEL}>E-mail</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="email"
                                                placeholder="exemplo@email.com"
                                                className={INPUT_ICON}
                                                value={formData.email ?? ''}
                                                onChange={(e) => update({ email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={LABEL}>Telefone</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="(00) 00000-0000"
                                                className={INPUT_ICON}
                                                value={formData.phone ?? ''}
                                                onChange={(e) => update({ phone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className={LABEL}>Logradouro / rua</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Rua, Avenida, etc"
                                            className={INPUT_ICON}
                                            value={formData.address ?? ''}
                                            onChange={(e) => update({ address: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className={LABEL}>Bairro</label>
                                        <input
                                            type="text"
                                            placeholder="Nome do bairro"
                                            className={INPUT}
                                            value={formData.neighborhood ?? ''}
                                            onChange={(e) => update({ neighborhood: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className={LABEL}>Número</label>
                                        <input
                                            type="text"
                                            placeholder="Nº"
                                            className={INPUT}
                                            value={formData.address_number ?? ''}
                                            onChange={(e) => update({ address_number: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <CityStateSelect
                                    cep={formData.zip_code}
                                    stateCode={formData.state}
                                    cityName={formData.city}
                                    onChange={({ cep, stateCode, cityName }) => update({
                                        zip_code: cep,
                                        state: stateCode || '',
                                        city: cityName || '',
                                    })}
                                    labelCls={LABEL}
                                    inputCls={`${INPUT} bg-white`}
                                />
                            </div>
                        )}
                    </div>

                    {/* Rodapé canônico da §25 — "Voltar" (não "Cancelar") em edição:
                        o que já foi salvo fica salvo. */}
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                        {initialData && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center justify-center h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                        >
                            {initialData ? 'Voltar' : 'Cancelar'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !formData.name?.trim() || (!!initialData && !dirty)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Salvando...' : initialData ? 'Salvar alterações' : 'Salvar cliente'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ClientForm;
