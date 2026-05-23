import React from 'react';
import { X, Truck, Mail, Phone, FileText, MapPin, Tag, Building2, User } from 'lucide-react';
import { Supplier, Organization } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { organizationService } from '../services/organizationService';
import { useStore } from '../store/useStore';

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (supplier: Omit<Supplier, 'id' | 'created_at'>) => void;
    initialData?: Supplier;
}

const DEFAULT_CATEGORIES = [
    'Materiais de Construção',
    'Mão de Obra / Serviços',
    'Equipamentos / Ferramentas',
    'Consultoria / Projetos',
    'Transporte / Logística',
    'Outros'
];

const ESTADOS_BR = [
    { sigla: 'AC', nome: 'Acre' },
    { sigla: 'AL', nome: 'Alagoas' },
    { sigla: 'AP', nome: 'Amapá' },
    { sigla: 'AM', nome: 'Amazonas' },
    { sigla: 'BA', nome: 'Bahia' },
    { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'DF', nome: 'Distrito Federal' },
    { sigla: 'ES', nome: 'Espírito Santo' },
    { sigla: 'GO', nome: 'Goiás' },
    { sigla: 'MA', nome: 'Maranhão' },
    { sigla: 'MT', nome: 'Mato Grosso' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MG', nome: 'Minas Gerais' },
    { sigla: 'PA', nome: 'Pará' },
    { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'PR', nome: 'Paraná' },
    { sigla: 'PE', nome: 'Pernambuco' },
    { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' },
    { sigla: 'RN', nome: 'Rio Grande do Norte' },
    { sigla: 'RS', nome: 'Rio Grande do Sul' },
    { sigla: 'RO', nome: 'Rondônia' },
    { sigla: 'RR', nome: 'Roraima' },
    { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'SP', nome: 'São Paulo' },
    { sigla: 'SE', nome: 'Sergipe' },
    { sigla: 'TO', nome: 'Tocantins' },
];

function maskCNPJ(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCPF(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const { activeOrganizationId } = useStore();
    const [dynamicCategories, setDynamicCategories] = React.useState<string[]>(DEFAULT_CATEGORIES);
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [formData, setFormData] = React.useState<Omit<Supplier, 'id' | 'created_at'>>({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        document: '',
        type: 'PJ',
        category: DEFAULT_CATEGORIES[0],
        street: '',
        number: '',
        neighborhood: '',
        address: '',
        city: '',
        state: '',
        organization_id: null
    });

    const handleDocumentChange = (value: string) => {
        const masked = formData.type === 'PJ' ? maskCNPJ(value) : maskCPF(value);
        setFormData({ ...formData, document: masked });
    };

    const handleTypeChange = (type: 'PF' | 'PJ') => {
        setFormData({ ...formData, type, document: '' });
    };

    const loadCategories = async () => {
        try {
            const cats = await supplierCategoryService.listCategories(activeOrganizationId || undefined);
            setDynamicCategories(cats.length > 0 ? cats.map(c => c.name) : DEFAULT_CATEGORIES);
        } catch {
            setDynamicCategories(DEFAULT_CATEGORIES);
        }
    };

    const loadOrganizations = async () => {
        try {
            const orgs = await organizationService.listOrganizations();
            setOrganizations(orgs);
        } catch {
            setOrganizations([]);
        }
    };

    React.useEffect(() => {
        if (isOpen) {
            loadCategories();
            loadOrganizations();
        }
    }, [isOpen, activeOrganizationId]);

    React.useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                contact_name: initialData.contact_name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                document: initialData.document || '',
                type: initialData.type,
                category: initialData.category || 'Materiais de Construção',
                street: initialData.street || initialData.address || '',
                number: initialData.number || '',
                neighborhood: initialData.neighborhood || '',
                address: initialData.address || '',
                city: initialData.city || '',
                state: initialData.state || '',
                organization_id: initialData.organization_id || null
            });
        } else {
            setFormData({
                name: '',
                contact_name: '',
                email: '',
                phone: '',
                document: '',
                type: 'PJ',
                category: 'Materiais de Construção',
                street: '',
                number: '',
                neighborhood: '',
                address: '',
                city: '',
                state: '',
                organization_id: activeOrganizationId || null
            });
        }
    }, [initialData, isOpen, activeOrganizationId]);

    if (!isOpen) return null;

    const docPlaceholder = formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00';
    const docLabel = formData.type === 'PJ' ? 'CNPJ' : 'CPF';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            ...formData,
            address: [formData.street, formData.number, formData.neighborhood].filter(Boolean).join(', ')
        };
        onSubmit(payload);
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-12">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}></div>
            <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-gray-200">
                <div className="flex justify-between items-center px-12 py-8 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 rounded-2xl text-blue-600 shadow-sm shadow-blue-100">
                            <Truck className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 leading-none">
                                {initialData ? 'Editar Registro' : 'Novo Fornecedor'}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Gestão de Parceiros</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-md border border-transparent hover:border-gray-100 rounded-full transition-all duration-200">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-12 space-y-6">

                    {/* Razão Social / Nome */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Razão Social / Nome</label>
                        <div className="relative group">
                            <Truck className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                required
                                placeholder="Ex: Alpa Construtora Ltda"
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Nome do Contato */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Nome do Contato</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Ex: João da Silva"
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.contact_name}
                                onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Tipo + Documento */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Tipo Identificação</label>
                            <select
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-bold text-gray-700 appearance-none cursor-pointer"
                                value={formData.type}
                                onChange={e => handleTypeChange(e.target.value as 'PF' | 'PJ')}
                            >
                                <option value="PJ">🏢 Pessoa Jurídica</option>
                                <option value="PF">👤 Pessoa Física</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">{docLabel}</label>
                            <div className="relative group">
                                <FileText className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder={docPlaceholder}
                                    className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-mono font-bold text-gray-900"
                                    value={formData.document}
                                    onChange={e => handleDocumentChange(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Categoria */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Categoria de Atuação</label>
                        <div className="relative group">
                            <Tag className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <select
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-bold text-gray-700 appearance-none cursor-pointer"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            >
                                {dynamicCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Organização */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Organização</label>
                        <div className="relative group">
                            <Building2 className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <select
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-bold text-gray-700 appearance-none cursor-pointer"
                                value={formData.organization_id || ''}
                                onChange={e => setFormData({ ...formData, organization_id: e.target.value ? e.target.value : null })}
                            >
                                <option value="">🌐 Todas as Organizações</option>
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* E-mail + Telefone */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">E-mail Comercial</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="email"
                                    placeholder="comercial@empresa.com"
                                    className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">WhatsApp / Telefone</label>
                            <div className="relative group">
                                <Phone className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="(00) 0 0000-0000"
                                    className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Endereço: Rua */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Rua / Logradouro</label>
                        <div className="relative group">
                            <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Rua Exemplo"
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.street}
                                onChange={e => setFormData({ ...formData, street: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Número + Bairro */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Número</label>
                            <input
                                type="text"
                                placeholder="123 ou S/N"
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.number}
                                onChange={e => setFormData({ ...formData, number: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Bairro</label>
                            <input
                                type="text"
                                placeholder="Centro"
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.neighborhood}
                                onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Cidade + UF */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Cidade</label>
                            <input
                                type="text"
                                placeholder="São Paulo"
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.city}
                                onChange={e => setFormData({ ...formData, city: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Estado (UF)</label>
                            <select
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-bold text-gray-700 appearance-none cursor-pointer"
                                value={formData.state}
                                onChange={e => setFormData({ ...formData, state: e.target.value })}
                            >
                                <option value="">Selecione</option>
                                {ESTADOS_BR.map(estado => (
                                    <option key={estado.sigla} value={estado.sigla}>{estado.sigla} — {estado.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="flex gap-4 pt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-4 border-2 border-transparent text-gray-400 hover:text-gray-600 font-bold text-sm transition-all"
                        >
                            Descartar
                        </button>
                        <button
                            type="submit"
                            className="flex-[2] px-6 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 hover:shadow-blue-200 font-black text-sm uppercase tracking-widest active:scale-95"
                        >
                            {initialData ? 'Confirmar Ajustes' : 'Efetuar Cadastro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
