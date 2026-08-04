import React from 'react';
import { useOrgContext } from '../hooks/useOrgContext';
import { User, Mail, Phone, FileText, MapPin, Building2 } from 'lucide-react';
import { Client } from '../types';
import CityStateSelect from './CityStateSelect';
import Button from './ui/Button';
import { Sheet, SheetHeader, SheetTitle, SheetPanel, SheetFooter } from './ui/sheet';
import { useStore } from '../store/useStore';
import { clientCategoryService } from '../services/clientCategoryService';
import { ClientCategory } from '../types';
import { masterDataService, MasterState } from '../services/masterDataService';
import { MARITAL_STATUS_OPTIONS, MARITAL_REGIME_OPTIONS, hasSpouse } from '../constants/civilStatus';

interface ClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Client>) => Promise<void> | void;
    initialData?: Client;
}

const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const organizations = useStore(state => state.organizations);
    const [categories, setCategories] = React.useState<ClientCategory[]>([]);
    const [states, setStates] = React.useState<MasterState[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [formData, setFormData] = React.useState<Partial<Client>>({
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
        type: 'PF',
        address: '',
        address_number: '',
        neighborhood: '',
        city: '',
        state: '',
        category: 'Vendas',
        portal: 'Nenhum',
        organization_id: activeOrganizationId ?? undefined
    });

    const update = (patch: Partial<Client>) => {
        setFormData(prev => ({ ...prev, ...patch }));
        setDirty(true);
    };

    React.useEffect(() => {
        if (!isOpen) return;
        setDirty(false);
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                name: '',
                email: '',
                phone: '',
                document: '',
                rg: '',
                rg_uf: '',
                rg_issuing_agency: '',
                nationality: 'Brasileira',
                profession: '',
                marital_status: '',
                marital_regime: '',
                spouse_name: '',
                spouse_document: '',
                type: 'PF',
                address: '',
                address_number: '',
                neighborhood: '',
                city: '',
                state: '',
                category: 'Vendas',
                portal: 'Nenhum',
                organization_id: activeOrganizationId ?? undefined
            });
        }
    }, [initialData, isOpen, activeOrganizationId]);

    React.useEffect(() => {
        if (!isOpen) return;
        masterDataService.listStates('BR').then(setStates).catch(console.error);
    }, [isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;
        // As categorias dependem da organização ESCOLHIDA no formulário (campo abaixo),
        // não da organização ativa no seletor global — do contrário, com o seletor
        // global em "Todas as organizações" (activeOrganizationId null) essa lista
        // nunca era carregada e o campo "Tipo de Cliente" ficava vazio.
        clientCategoryService.list(formData.organization_id || undefined)
            .then(data => {
                setCategories(data);
                setFormData(prev => {
                    if (prev.category && data.some(c => c.name === prev.category)) return prev;
                    return { ...prev, category: data[0]?.name };
                });
            })
            .catch(console.error);
    }, [isOpen, formData.organization_id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name?.trim()) return;
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            setDirty(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="xl" dirty={dirty}>
            <SheetHeader onClose={onClose}>
                <SheetTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    {initialData ? 'Editar Cliente' : 'Novo Cliente'}
                </SheetTitle>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <SheetPanel className="p-6 space-y-6">
                    {initialData && (
                        <div className="w-32">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.code ?? ''}
                                onChange={(e) => update({ code: e.target.value })}
                                placeholder="001"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo / Razão Social</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.name}
                                onChange={(e) => update({ name: e.target.value })}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Organização</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <select
                                className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Portais</label>
                        <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Pessoa</label>
                            <select
                                className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={formData.type}
                                onChange={(e) => update({ type: e.target.value as 'PF' | 'PJ' })}
                            >
                                <option value="PF">Pessoa Física</option>
                                <option value="PJ">Pessoa Jurídica</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cliente</label>
                            <select
                                className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold text-blue-600"
                                value={formData.category}
                                onChange={(e) => update({ category: e.target.value as any })}
                            >
                                {categories.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="000.000.000-00"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.document}
                                    onChange={(e) => update({ document: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {formData.type === 'PF' && (
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">RG</label>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="00.000.000-0"
                                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.rg ?? ''}
                                        onChange={(e) => update({ rg: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                                <select
                                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Órgão Expedidor</label>
                                <input
                                    type="text"
                                    placeholder="SSP"
                                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.rg_issuing_agency ?? ''}
                                    onChange={(e) => update({ rg_issuing_agency: e.target.value })}
                                />
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
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nacionalidade</label>
                                    <input
                                        type="text"
                                        placeholder="Brasileira"
                                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.nationality ?? ''}
                                        onChange={(e) => update({ nationality: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Profissão</label>
                                    <input
                                        type="text"
                                        placeholder="Engenheiro(a) civil"
                                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.profession ?? ''}
                                        onChange={(e) => update({ profession: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil</label>
                                    <select
                                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Regime de Bens</label>
                                        <select
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cônjuge</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.spouse_name ?? ''}
                                            onChange={(e) => update({ spouse_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Cônjuge</label>
                                        <div className="relative">
                                            <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="000.000.000-00"
                                                className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.spouse_document ?? ''}
                                                onChange={(e) => update({ spouse_document: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="email"
                                    placeholder="exemplo@email.com"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.email}
                                    onChange={(e) => update({ email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="(00) 00000-0000"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.phone}
                                    onChange={(e) => update({ phone: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro / Rua</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Rua, Avenida, etc"
                                className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.address}
                                onChange={(e) => update({ address: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                            <input
                                type="text"
                                placeholder="Nome do bairro"
                                className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.neighborhood}
                                onChange={(e) => update({ neighborhood: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                            <input
                                type="text"
                                placeholder="Nº"
                                className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
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
                        labelCls="block text-sm font-medium text-gray-700 mb-1"
                        inputCls="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    />

                </SheetPanel>

                <SheetFooter>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Salvando...' : 'Salvar Cliente'}
                    </Button>
                </SheetFooter>
            </form>
        </Sheet>
    );
};

export default ClientModal;
