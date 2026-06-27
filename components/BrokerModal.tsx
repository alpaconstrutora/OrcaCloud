import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, FileText, Briefcase, Percent, Save, Link2, Copy, Check, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { BrokerProfile } from '../types';
import { Sheet, SheetHeader, SheetPanel, SheetFooter } from './ui/sheet';
import { brokerPortalService, BrokerPortalToken } from '../services/brokerPortalService';

interface BrokerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<BrokerProfile>) => Promise<void>;
    initialData?: BrokerProfile;
    organizationId?: string;
}

const BrokerModal: React.FC<BrokerModalProps> = ({ isOpen, onClose, onSave, initialData, organizationId }) => {
    const [formData, setFormData] = useState<Partial<BrokerProfile>>({
        name: '',
        email: '',
        phone: '',
        cpf: '',
        creci: '',
        agency_name: '',
        commission_rate: 5.0,
        is_active: true
    });
    const [loading, setLoading] = useState(false);
    const [dirty, setDirty] = useState(false);

    // Token de portal
    const [portalToken, setPortalToken] = useState<BrokerPortalToken | null>(null);
    const [tokenLoading, setTokenLoading] = useState(false);
    const [tokenCopied, setTokenCopied] = useState(false);

    const update = (patch: Partial<BrokerProfile>) => {
        setFormData(prev => ({ ...prev, ...patch }));
        setDirty(true);
    };

    useEffect(() => {
        setDirty(false);
        setPortalToken(null);
        if (initialData) {
            setFormData(initialData);
            if (initialData.id) {
                setTokenLoading(true);
                brokerPortalService.getTokenForBroker(initialData.id)
                    .then(setPortalToken)
                    .catch(console.error)
                    .finally(() => setTokenLoading(false));
            }
        } else {
            setFormData({
                name: '',
                email: '',
                phone: '',
                cpf: '',
                creci: '',
                agency_name: '',
                commission_rate: 5.0,
                is_active: true
            });
        }
    }, [initialData, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
            setDirty(false);
            onClose();
        } catch (err) {
            console.error('Error saving broker:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateToken = async () => {
        if (!initialData?.id || !organizationId) return;
        setTokenLoading(true);
        try {
            await brokerPortalService.generateToken(initialData.id, organizationId);
            const tok = await brokerPortalService.getTokenForBroker(initialData.id);
            setPortalToken(tok);
        } catch (err) {
            console.error('Erro ao gerar token:', err);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!portalToken?.token) return;
        const url = brokerPortalService.buildPortalUrl(portalToken.token);
        await navigator.clipboard.writeText(url);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    const handleRevokeToken = async () => {
        if (!initialData?.id || !confirm('Revogar acesso deste corretor ao portal?')) return;
        setTokenLoading(true);
        try {
            await brokerPortalService.revokeToken(initialData.id);
            setPortalToken(null);
        } catch (err) {
            console.error('Erro ao revogar token:', err);
        } finally {
            setTokenLoading(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="2xl" dirty={dirty}>
            {/* Header */}
            <SheetHeader onClose={onClose}>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                        <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                            {initialData ? 'Editar Corretor' : 'Novo Corretor'}
                        </h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gestão Comercial</p>
                    </div>
                </div>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <SheetPanel className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Nome Completo */}
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => update({ name: e.target.value })}
                                    placeholder="Ex: João Silva"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mail</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    required
                                    type="email"
                                    value={formData.email}
                                    onChange={e => update({ email: e.target.value })}
                                    placeholder="joao@exemplo.com"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Telefone */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                            <div className="relative group">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    value={formData.phone}
                                    onChange={e => update({ phone: e.target.value })}
                                    placeholder="(00) 00000-0000"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* CPF */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CPF</label>
                            <div className="relative group">
                                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    value={formData.cpf}
                                    onChange={e => update({ cpf: e.target.value })}
                                    placeholder="000.000.000-00"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* CRECI */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CRECI</label>
                            <div className="relative group">
                                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    value={formData.creci}
                                    onChange={e => update({ creci: e.target.value })}
                                    placeholder="Ex: 12345-F"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Imobiliária / Agência */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Imobiliária / Agência</label>
                            <div className="relative group">
                                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    value={formData.agency_name}
                                    onChange={e => update({ agency_name: e.target.value })}
                                    placeholder="Nome da Imobiliária"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        {/* Taxa de Comissão */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa de Comissão (%)</label>
                            <div className="relative group">
                                <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.commission_rate}
                                    onChange={e => update({ commission_rate: parseFloat(e.target.value) })}
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700"
                                />
                            </div>
                        </div>

                        {/* Status Ativo */}
                        <div className="md:col-span-2 flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 mt-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={e => update({ is_active: e.target.checked })}
                                className="w-5 h-5 rounded border-blue-200 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="is_active" className="text-sm font-black text-blue-900 cursor-pointer">
                                Corretor Ativo (Habilitado para novas vendas)
                            </label>
                        </div>
                    </div>

                    {/* Seção de Acesso ao Portal — somente em modo edição */}
                    {initialData && organizationId && (
                        <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Acesso ao Portal</label>
                            <p className="text-xs text-gray-400">Gere um link para que o corretor acesse o portal sem precisar de cadastro.</p>

                            {tokenLoading ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                </div>
                            ) : portalToken?.is_active ? (
                                <div className="space-y-2">
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                                        <p className="text-xs font-mono text-emerald-700 truncate">
                                            {brokerPortalService.buildPortalUrl(portalToken.token)}
                                        </p>
                                        <p className="text-[10px] text-emerald-500 mt-1">
                                            Válido até {new Date(portalToken.expires_at).toLocaleDateString('pt-BR')}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyLink}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                        >
                                            {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGenerateToken}
                                            className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-gray-300 hover:text-gray-700 transition-all"
                                            title="Gerar novo link (invalida o anterior)"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRevokeToken}
                                            className="flex items-center justify-center gap-2 px-4 py-3 border border-red-100 text-red-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 transition-all"
                                            title="Revogar acesso"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                        <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerateToken}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95"
                                    >
                                        <Link2 className="w-4 h-4" />
                                        Gerar Link de Acesso
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </SheetPanel>

                <SheetFooter>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 group disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                Salvar Corretor
                            </>
                        )}
                    </button>
                </SheetFooter>
            </form>
        </Sheet>
    );
};

export default BrokerModal;
