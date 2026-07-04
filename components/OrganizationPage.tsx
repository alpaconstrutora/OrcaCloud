import React, { useState, useRef, useEffect } from 'react';
import { Organization } from '../types';
import { PaymentAccount } from '../types/financial';
import { financialRegistryService } from '../services/financialRegistryService';
import { Building2, Save, Upload, Trash2, Globe, Mail, Phone, MapPin, Landmark, Plus, X } from 'lucide-react';
import Button from './ui/Button';

interface OrganizationPageProps {
    organization: Organization | null;
    onUpdate: (org: Organization, close?: boolean) => void;
    onBack?: () => void;
}

const OrganizationPage: React.FC<OrganizationPageProps> = ({ organization, onUpdate, onBack }) => {
    const [formData, setFormData] = useState<Organization>(organization || {
        id: crypto.randomUUID(),
        name: '',
        address: {},
        members: [],
        customRoles: []
    });
    const [logoPreview, setLogoPreview] = useState<string | null>(organization?.logoUrl || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [accountForm, setAccountForm] = useState({ name: '', bank: '', branch: '', account_number: '', description: '' });
    const [accountSaving, setAccountSaving] = useState(false);

    useEffect(() => {
        if (!organization?.id) return;
        setAccountsLoading(true);
        financialRegistryService.listPaymentAccounts(organization.id)
            .then(setAccounts)
            .catch(console.error)
            .finally(() => setAccountsLoading(false));
    }, [organization?.id]);

    const handleAddAccount = async () => {
        if (!accountForm.name.trim() || !organization?.id) return;
        setAccountSaving(true);
        try {
            const created = await financialRegistryService.createPaymentAccount({
                organization_id: organization.id,
                name: accountForm.name.trim(),
                bank: accountForm.bank.trim() || undefined,
                branch: accountForm.branch.trim() || undefined,
                account_number: accountForm.account_number.trim() || undefined,
                description: accountForm.description.trim() || undefined,
            });
            setAccounts(prev => [...prev, created]);
            setAccountForm({ name: '', bank: '', branch: '', account_number: '', description: '' });
            setShowAccountForm(false);
        } catch (err) {
            console.error(err);
        } finally {
            setAccountSaving(false);
        }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('Remover esta conta?')) return;
        try {
            await financialRegistryService.deletePaymentAccount(id);
            setAccounts(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.startsWith('address.')) {
            const addressField = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                address: {
                    ...prev.address,
                    [addressField]: value
                }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setLogoPreview(base64String);
                setFormData(prev => ({ ...prev, logoUrl: base64String }));
            };
            reader.readAsDataURL(file);
        }
    };

    const removeLogo = () => {
        setLogoPreview(null);
        setFormData(prev => ({ ...prev, logoUrl: undefined }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdate(formData);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="text-sm text-gray-500 hover:text-gray-700 mb-2 hover:underline flex items-center gap-1"
                        >
                            &larr; Voltar para lista
                        </button>
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">
                        {organization ? 'Editar Organização' : 'Nova Organização'}
                    </h1>
                    <p className="text-gray-500">Gerencie os dados da sua empresa para relatórios e documentos.</p>
                </div>
                <Button
                    onClick={handleSubmit}
                    className="flex items-center transition-all"
                >
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                </Button>
            </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column - Logo & Basic Info */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4 block">Logotipo da Empresa</h3>
                            <div className="flex flex-col items-center">
                                <div className="w-full aspect-video bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center mb-4 overflow-hidden relative group">
                                    {logoPreview ? (
                                        <>
                                            <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button
                                                    onClick={removeLogo}
                                                    className="p-2 bg-white rounded-full text-red-600 hover:text-red-700"
                                                    title="Remover logo"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center p-4">
                                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                            <p className="text-sm text-gray-500">Nenhuma logo</p>
                                        </div>
                                    )}
                                </div>

                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleLogoUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center transition-colors"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Carregar Imagem
                                </button>
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Recomendado: POS ou JPG até 2MB.<br />Fundo transparente é ideal.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Details Form */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Basic Details */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-blue-600" />
                                Dados Gerais
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social / Nome Fantasia</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="Ex: Construtora Exemplo Ltda"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                                    <input
                                        type="text"
                                        name="cnpj"
                                        value={formData.cnpj || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="00.000.000/0000-00"
                                    />
                                </div>
                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                                    <div className="relative">
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            name="website"
                                            value={formData.website || ''}
                                            onChange={handleChange}
                                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                            placeholder="www.suaempresa.com.br"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Phone className="w-5 h-5 text-blue-600" />
                                Contato
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Comercial</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email || ''}
                                            onChange={handleChange}
                                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                            placeholder="contato@empresa.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            name="phone"
                                            value={formData.phone || ''}
                                            onChange={handleChange}
                                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-blue-600" />
                                Endereço
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                                    <input
                                        type="text"
                                        name="address.zipCode"
                                        value={formData.address.zipCode || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="00000-000"
                                    />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rua / Avenida</label>
                                    <input
                                        type="text"
                                        name="address.street"
                                        value={formData.address.street || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="Rua das Flores"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                                    <input
                                        type="text"
                                        name="address.number"
                                        value={formData.address.number || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="123"
                                    />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                                    <input
                                        type="text"
                                        name="address.neighborhood"
                                        value={formData.address.neighborhood || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="Centro"
                                    />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                                    <input
                                        type="text"
                                        name="address.city"
                                        value={formData.address.city || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="São Paulo"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                    <input
                                        type="text"
                                        name="address.state"
                                        value={formData.address.state || ''}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        placeholder="SP"
                                        maxLength={2}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bank Accounts */}
                        {organization?.id && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <Landmark className="w-5 h-5 text-blue-600" />
                                        Contas Bancárias
                                    </h3>
                                    <button
                                        onClick={() => setShowAccountForm(v => !v)}
                                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Vincular conta
                                    </button>
                                </div>

                                {showAccountForm && (
                                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="md:col-span-2">
                                                <label className="block text-form-label font-medium text-gray-600 mb-1">Nome da conta *</label>
                                                <input
                                                    type="text"
                                                    value={accountForm.name}
                                                    onChange={e => setAccountForm(p => ({ ...p, name: e.target.value }))}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Ex: Conta Corrente Principal"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-form-label font-medium text-gray-600 mb-1">Banco</label>
                                                <input
                                                    type="text"
                                                    value={accountForm.bank}
                                                    onChange={e => setAccountForm(p => ({ ...p, bank: e.target.value }))}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Ex: Itaú, Bradesco, Nubank"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-form-label font-medium text-gray-600 mb-1">Agência</label>
                                                <input
                                                    type="text"
                                                    value={accountForm.branch}
                                                    onChange={e => setAccountForm(p => ({ ...p, branch: e.target.value }))}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="0000"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-form-label font-medium text-gray-600 mb-1">Número da conta</label>
                                                <input
                                                    type="text"
                                                    value={accountForm.account_number}
                                                    onChange={e => setAccountForm(p => ({ ...p, account_number: e.target.value }))}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="00000-0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-form-label font-medium text-gray-600 mb-1">Descrição</label>
                                                <input
                                                    type="text"
                                                    value={accountForm.description}
                                                    onChange={e => setAccountForm(p => ({ ...p, description: e.target.value }))}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => { setShowAccountForm(false); setAccountForm({ name: '', bank: '', branch: '', account_number: '', description: '' }); }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                                            >
                                                Cancelar
                                            </button>
                                            <Button
                                                onClick={handleAddAccount}
                                                disabled={accountSaving || !accountForm.name.trim()}
                                                size="sm"
                                                className="disabled:opacity-50"
                                            >
                                                {accountSaving ? 'Salvando…' : 'Salvar conta'}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {accountsLoading ? (
                                    <p className="text-sm text-gray-400 text-center py-4">Carregando contas…</p>
                                ) : accounts.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma conta vinculada ainda.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {accounts.map(acc => (
                                            <div key={acc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 truncate">{acc.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {[acc.bank, acc.branch && `Ag. ${acc.branch}`, acc.account_number && `Cc. ${acc.account_number}`].filter(Boolean).join(' · ') || acc.description || '—'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteAccount(acc.id)}
                                                    className="ml-3 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0"
                                                    title="Remover conta"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Client Categories (Movido para Configurações) */}
                    </div>
                </div>
        </div>
    );
};

export default OrganizationPage;
