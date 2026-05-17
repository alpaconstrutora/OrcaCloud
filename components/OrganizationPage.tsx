import React, { useState, useRef } from 'react';
import { Organization } from '../types';
import { Building2, Save, Upload, Trash2, Globe, Mail, Phone, MapPin } from 'lucide-react';

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
                <button
                    onClick={handleSubmit}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm"
                >
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                </button>
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
                    </div>
                </div>
        </div>
    );
};

export default OrganizationPage;
