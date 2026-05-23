import React from 'react';
import { X, Truck, Mail, Phone, FileText, MapPin, Tag, Building2 } from 'lucide-react';
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

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const { activeOrganizationId } = useStore();
    const [dynamicCategories, setDynamicCategories] = React.useState<string[]>(DEFAULT_CATEGORIES);
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [formData, setFormData] = React.useState<Omit<Supplier, 'id' | 'created_at'>>({
        name: '',
        email: '',
        phone: '',
        document: '',
        type: 'PJ',
        category: DEFAULT_CATEGORIES[0],
        address: '',
        city: '',
        state: '',
        organization_id: null
    });

    const loadCategories = async () => {
        try {
            const cats = await supplierCategoryService.listCategories(activeOrganizationId || undefined);
            if (cats.length > 0) {
                setDynamicCategories(cats.map(c => c.name));
            } else {
                setDynamicCategories(DEFAULT_CATEGORIES);
            }
        } catch (error) {
            console.error("Error loading categories in modal:", error);
            setDynamicCategories(DEFAULT_CATEGORIES);
        }
    };

    const loadOrganizations = async () => {
        try {
            const orgs = await organizationService.listOrganizations();
            setOrganizations(orgs);
        } catch (error) {
            console.error("Error loading organizations in modal:", error);
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
                email: initialData.email || '',
                phone: initialData.phone || '',
                document: initialData.document || '',
                type: initialData.type,
                category: initialData.category || 'Materiais de Construção',
                address: initialData.address || '',
                city: initialData.city || '',
                state: initialData.state || '',
                organization_id: initialData.organization_id || null
            });
        } else {
            setFormData({
                name: '',
                email: '',
                phone: '',
                document: '',
                type: 'PJ',
                category: 'Materiais de Construção',
                address: '',
                city: '',
                state: '',
                organization_id: activeOrganizationId || null
            });
        }
    }, [initialData, isOpen, activeOrganizationId]);

    if (!isOpen) return null;

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

                <form onSubmit={(e) => {
                    e.preventDefault();
                    console.log("[SUPPLIER MODAL] Enviando formData:", formData);
                    onSubmit(formData);
                }} className="flex-1 overflow-y-auto p-12 space-y-6">
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

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Tipo Identificação</label>
                            <select
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white font-bold text-gray-700 appearance-none cursor-pointer"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value as 'PF' | 'PJ' })}
                            >
                                <option value="PJ">🏢 Pessoa Jurídica</option>
                                <option value="PF">👤 Pessoa Física</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">CNPJ / CPF</label>
                            <div className="relative group">
                                <FileText className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="00.000.000/0000-00"
                                    className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-mono font-bold text-gray-900"
                                    value={formData.document}
                                    onChange={e => setFormData({ ...formData, document: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

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

                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Localização (Rua, Nº, Bairro)</label>
                        <div className="relative group">
                            <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Rua Exemplo, 123 - Centro"
                                className="pl-12 w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-gray-300 font-medium text-gray-900"
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>
                    </div>

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
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">UF</label>
                            <input
                                type="text"
                                maxLength={2}
                                placeholder="SP"
                                className="w-full rounded-2xl border border-gray-200 p-3.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none uppercase font-black text-gray-900 text-center tracking-tighter"
                                value={formData.state}
                                onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                            />
                        </div>
                    </div>

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
