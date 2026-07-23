import React from 'react';
import { supabase } from '../lib/supabase';
import { MOCK_SINAPI_DB } from '../constants';
import { Database, AlertTriangle, CheckCircle, Loader2, MessageCircle, Eye, EyeOff, Trash2, Hash, Mail, RotateCcw, ChevronRight, Layers, Percent } from 'lucide-react';
import { whatsappService, WhatsAppConfig } from '../services/whatsappService';
import { appSettingsService, AppSettings, APP_SETTINGS_DEFAULTS, TEMPLATE_VARS } from '../services/appSettingsService';
import { useConfirm } from './ui/confirm';
import ClientCategoriesSettings from './ClientCategoriesSettings';
import SupplierCategoriesSettings from './SupplierCategoriesSettings';
import FinancialCategoriesManager from './FinancialCategoriesManager';
import ContractTypesSettings from './ContractTypesSettings';
import EmpreendimentoTypesSettings from './EmpreendimentoTypesSettings';
import ContractIndexManager from './ContractIndexManager';

type SettingsLeafId =
    | 'geral'
    | 'cat-clientes' | 'cat-fornecedores' | 'cat-contratos'
    | 'cat-empreendimentos' | 'cat-financeiro'
    | 'indices' | 'whatsapp' | 'email' | 'database';

interface SettingsNavLeaf { id: SettingsLeafId; label: string; }
interface SettingsNavNode {
    id: string;
    label: string;
    icon: React.ElementType;
    children?: SettingsNavLeaf[];
    leafId?: SettingsLeafId;
}

const SETTINGS_NAV: SettingsNavNode[] = [
    { id: 'geral', label: 'Nomenclatura', icon: Hash, leafId: 'geral' },
    { id: 'categorias', label: 'Categorias Gerais', icon: Layers, children: [
        { id: 'cat-clientes', label: 'Clientes' },
        { id: 'cat-fornecedores', label: 'Fornecedores' },
        { id: 'cat-contratos', label: 'Tipos de Contrato' },
        { id: 'cat-empreendimentos', label: 'Tipos de Empreendimento' },
        { id: 'cat-financeiro', label: 'Financeiro' },
    ]},
    { id: 'indices', label: 'Índices de Reajuste', icon: Percent, leafId: 'indices' },
    { id: 'whatsapp', label: 'WhatsApp & Integrações', icon: MessageCircle, leafId: 'whatsapp' },
    { id: 'email', label: 'Templates de E-mail', icon: Mail, leafId: 'email' },
    { id: 'database', label: 'Banco de Dados', icon: Database, leafId: 'database' },
];

const Settings: React.FC = () => {
    const confirm = useConfirm();
    const [activeLeaf, setActiveLeaf] = React.useState<SettingsLeafId>('geral');
    const [isCategoriasOpen, setIsCategoriasOpen] = React.useState(false);

    const [status, setStatus] = React.useState<'IDLE' | 'MIGRATING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [message, setMessage] = React.useState('');

    // WhatsApp Business (Cloud API oficial)
    const [waForm, setWaForm] = React.useState<WhatsAppConfig>(() => whatsappService.getConfig());
    const [showToken, setShowToken] = React.useState(false);
    const [waSaved, setWaSaved] = React.useState(false);
    const isWaActive = whatsappService.isConfigured();

    const handleWaSave = () => {
        whatsappService.saveConfig(waForm);
        setWaSaved(true);
        setTimeout(() => setWaSaved(false), 3000);
    };

    const handleWaClear = async () => {
        if (!await confirm({ title: 'Remover credenciais WhatsApp?', message: 'As credenciais salvas serão apagadas.', variant: 'danger', confirmLabel: 'Remover' })) return;
        whatsappService.clearConfig();
        setWaForm({ phoneNumberId: '', accessToken: '' });
    };

    // App settings state
    const [appSettings, setAppSettings] = React.useState<AppSettings>(() => appSettingsService.get());
    const [appSettingsSaved, setAppSettingsSaved] = React.useState(false);

    const handleAppSettingsSave = () => {
        appSettingsService.save(appSettings);
        setAppSettingsSaved(true);
        setTimeout(() => setAppSettingsSaved(false), 3000);
    };

    const handleAppSettingsReset = async (section: 'numbering' | 'whatsapp' | 'email') => {
        if (!await confirm({ title: 'Restaurar padrões desta seção?', variant: 'warning', confirmLabel: 'Restaurar' })) return;
        const patch: Partial<AppSettings> =
            section === 'numbering' ? {
                orderPrefix: APP_SETTINGS_DEFAULTS.orderPrefix,
                orderDuplicateSuffix: APP_SETTINGS_DEFAULTS.orderDuplicateSuffix,
            } : section === 'whatsapp' ? {
                whatsappOrderSentTemplate: APP_SETTINGS_DEFAULTS.whatsappOrderSentTemplate,
                whatsappStatusChangeTemplate: APP_SETTINGS_DEFAULTS.whatsappStatusChangeTemplate,
            } : {
                emailStatusChangeSubject: APP_SETTINGS_DEFAULTS.emailStatusChangeSubject,
                emailStatusChangeBody: APP_SETTINGS_DEFAULTS.emailStatusChangeBody,
            };
        setAppSettings(prev => ({ ...prev, ...patch }));
        appSettingsService.save({ ...appSettings, ...patch });
    };

    const runMigration = async () => {
        if (!await confirm({
            title: 'Migrar itens SINAPI?',
            message: 'Isso irá migrar os itens do MOCK_SINAPI_DB para a tabela sinapi_items no Supabase. Certifique-se que a tabela foi criada.',
            variant: 'warning',
            confirmLabel: 'Continuar',
        })) {
            return;
        }

        setStatus('MIGRATING');
        setMessage('Iniciando migração...');

        try {
            // Transform data to match SQL schema
            const itemsToInsert = MOCK_SINAPI_DB.map(item => ({
                code: item.code,
                // Competência do mock = 12/2025 (PK composta code+reference_date).
                reference_date: '2025-12-01',
                description: item.description,
                unit: item.unit,
                price: item.price,
                type: item.type,
                category: item.category,
                // store composition as JSONB even if schema doesn't explicitly validate it, Supabase allows it if column exists
                // If column doesn't exist, this key will be ignored by Supabase usually, or throw error if strict.
                // We'll try to insert it. If it fails, user needs to add column.
                composition: item.composition ? JSON.stringify(item.composition) : null
            }));

            // Check if table exists by selecting one item
            const { error: checkError } = await supabase.from('sinapi_items').select('code').limit(1);
            if (checkError) {
                if (checkError.code === '42P01') { // undefined_table
                    throw new Error("A tabela 'sinapi_items' não existe. Por favor, rode o SQL no Supabase.");
                }
                // Ignore other errors for now, might be empty table or permission
            }

            const { error } = await supabase.from('sinapi_items').upsert(itemsToInsert, { onConflict: 'code,reference_date' });

            if (error) throw error;

            setStatus('SUCCESS');
            setMessage(`Sucesso! ${itemsToInsert.length} itens foram migrados/atualizados.`);

        } catch (error: any) {
            console.error('Migration error:', error);
            setStatus('ERROR');
            setMessage(`Erro na migração: ${error.message || JSON.stringify(error)}`);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Configurações do Sistema</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie todas as configurações de sistema, categorias, integrações e banco de dados.</p>
            </div>

            <div className="flex gap-6 items-start">
                <aside className="w-64 shrink-0 bg-gray-50 border border-gray-100 rounded-[10px] p-2 flex flex-col gap-0.5">
                    {SETTINGS_NAV.map(node => node.children ? (
                        <div key={node.id}>
                            <button
                                onClick={() => setIsCategoriasOpen(v => !v)}
                                className={`flex items-center w-full px-3 h-9 rounded-[6px] text-sm font-medium justify-between transition-all ${
                                    node.children.some(c => c.id === activeLeaf) ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                }`}
                            >
                                <span className="flex items-center gap-2.5"><node.icon className="w-4 h-4" />{node.label}</span>
                                <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isCategoriasOpen ? 'rotate-90' : ''}`} />
                            </button>
                            {isCategoriasOpen && (
                                <div className="mt-0.5 ml-4 pl-4 border-l border-gray-200 flex flex-col gap-0.5">
                                    {node.children.map(leaf => (
                                        <button
                                            key={leaf.id}
                                            onClick={() => setActiveLeaf(leaf.id)}
                                            className={`px-3 h-8 rounded-[6px] text-sm font-medium text-left transition-all ${
                                                activeLeaf === leaf.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        >{leaf.label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            key={node.id}
                            onClick={() => setActiveLeaf(node.leafId!)}
                            className={`flex items-center gap-2.5 w-full px-3 h-9 rounded-[6px] text-sm font-medium transition-all ${
                                activeLeaf === node.leafId ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                            }`}
                        >
                            <node.icon className="w-4 h-4" />{node.label}
                        </button>
                    ))}
                </aside>

                <div className="flex-1 min-w-0 space-y-6">

            {activeLeaf === 'database' && (
                <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <Database className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Banco de Dados SINAPI</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Gerencie a sincronização entre a base de dados local (Mock) e o Supabase.
                        </p>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-6">
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-[10px] border border-gray-200">
                        <div>
                            <span className="block text-sm font-medium text-gray-700">Migração Inicial</span>
                            <span className="text-xs text-gray-500">Envia itens do MOCK_CONSTANTS para a tabela 'sinapi_items'</span>
                        </div>
                        <button
                            onClick={runMigration}
                            disabled={status === 'MIGRATING'}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'MIGRATING' && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                            Configurar Base
                        </button>
                    </div>

                    {status !== 'IDLE' && (
                        <div className={`mt-4 p-4 rounded-[10px] flex items-center gap-3 ${status === 'SUCCESS' ? 'bg-green-50 text-green-700' : status === 'ERROR' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                            {status === 'SUCCESS' ? <CheckCircle className="w-5 h-5" /> : status === 'ERROR' ? <AlertTriangle className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                            <span className="text-sm font-medium">{message}</span>
                        </div>
                    )}
                </div>
            </div>
            )}

            {activeLeaf === 'geral' && (
                <div className="space-y-6">
                    {/* Numeração de Pedidos */}
                    <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-50 rounded-lg">
                            <Hash className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Numeração de Pedidos</h2>
                            <p className="text-sm text-gray-500 mt-1">Prefixo e sufixo usados na geração automática dos números de pedido.</p>
                        </div>
                    </div>
                    <button onClick={() => handleAppSettingsReset('numbering')} className="flex items-center gap-1.5 text-button text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>
                <div className="mt-6 border-t border-gray-100 pt-6 grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Prefixo</label>
                        <input
                            type="text"
                            value={appSettings.orderPrefix}
                            onChange={e => setAppSettings(s => ({ ...s, orderPrefix: e.target.value }))}
                            placeholder="PO-"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                        <p className="text-xs text-gray-400 mt-1">Ex: <span className="font-mono">{appSettings.orderPrefix}123456</span></p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Sufixo de Duplicata</label>
                        <input
                            type="text"
                            value={appSettings.orderDuplicateSuffix}
                            onChange={e => setAppSettings(s => ({ ...s, orderDuplicateSuffix: e.target.value }))}
                            placeholder="-DUP"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                        <p className="text-xs text-gray-400 mt-1">Ex: <span className="font-mono">{appSettings.orderPrefix}123456{appSettings.orderDuplicateSuffix}</span></p>
                    </div>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95">
                        {appSettingsSaved ? <CheckCircle className="w-[15px] h-[15px]" /> : <Hash className="w-[15px] h-[15px]" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>
                </div>
            )}

            {activeLeaf === 'email' && (
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <Mail className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Templates de E-mail</h2>
                            <p className="text-sm text-gray-500 mt-1">Assunto e corpo do e-mail enviado ao fornecedor em cada mudança de status.</p>
                        </div>
                    </div>
                    <button onClick={() => handleAppSettingsReset('email')} className="flex items-center gap-1.5 text-button text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>
                <div className="mt-4 mb-3 flex flex-wrap gap-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                    {TEMPLATE_VARS.email.map(v => (
                        <span key={v} className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-[6px] border border-blue-100">{v}</span>
                    ))}
                </div>
                <div className="border-t border-gray-100 pt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Assunto</label>
                        <input
                            type="text"
                            value={appSettings.emailStatusChangeSubject}
                            onChange={e => setAppSettings(s => ({ ...s, emailStatusChangeSubject: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Corpo</label>
                        <textarea
                            rows={3}
                            value={appSettings.emailStatusChangeBody}
                            onChange={e => setAppSettings(s => ({ ...s, emailStatusChangeBody: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        {appSettingsSaved ? <CheckCircle className="w-[15px] h-[15px]" /> : <Mail className="w-[15px] h-[15px]" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>
            )}

            {activeLeaf === 'whatsapp' && (
                <div className="space-y-6">
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                        <MessageCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-800">WhatsApp Business (API Oficial)</h2>
                            <span className={`text-sm font-normal ${isWaActive ? 'text-green-700' : 'text-gray-500'}`}>
                                {isWaActive ? 'Configurado' : 'Não configurado'}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            Envio automático via <strong>Meta Cloud API</strong> ao marcar pedidos como "Enviado". Configure em{' '}
                            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">developers.facebook.com</a>.
                        </p>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone Number ID</label>
                        <input
                            type="text"
                            value={waForm.phoneNumberId}
                            onChange={e => setWaForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                            placeholder="ex: 123456789012345"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                        />
                        <p className="text-xs text-gray-400 mt-1">Encontrado em Meta for Developers → seu app → WhatsApp → API Setup.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Access Token</label>
                        <div className="relative">
                            <input
                                type={showToken ? 'text' : 'password'}
                                value={waForm.accessToken}
                                onChange={e => setWaForm(f => ({ ...f, accessToken: e.target.value }))}
                                placeholder="••••••••••••••••"
                                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                            >
                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Use um token permanente de System User para produção.</p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <button
                            onClick={handleWaClear}
                            className="flex items-center gap-2 text-button font-bold text-gray-400 hover:text-red-600 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Limpar credenciais
                        </button>
                        <button
                            onClick={handleWaSave}
                            disabled={!waForm.phoneNumberId || !waForm.accessToken}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-green-600 text-white rounded-[6px] hover:bg-green-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {waSaved ? <CheckCircle className="w-[15px] h-[15px]" /> : <MessageCircle className="w-[15px] h-[15px]" />}
                            {waSaved ? 'Salvo!' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
            {/* Templates WhatsApp */}
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-green-50 rounded-lg">
                            <MessageCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Templates WhatsApp</h2>
                            <p className="text-sm text-gray-500 mt-1">Texto das mensagens enviadas ao fornecedor via Z-API.</p>
                        </div>
                    </div>
                    <button onClick={() => handleAppSettingsReset('whatsapp')} className="flex items-center gap-1.5 text-button text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>

                {/* Template: Pedido Enviado */}
                <div className="mt-6 border-t border-gray-100 pt-6 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-500">Pedido Enviado ao Fornecedor</label>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                        {TEMPLATE_VARS.whatsappOrderSent.map(v => (
                            <span key={v} className="font-mono text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-[6px] border border-green-100">{v}</span>
                        ))}
                    </div>
                    <textarea
                        rows={8}
                        value={appSettings.whatsappOrderSentTemplate}
                        onChange={e => setAppSettings(s => ({ ...s, whatsappOrderSentTemplate: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono resize-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                    />
                </div>

                {/* Template: Mudança de Status */}
                <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-500">Mudança de Status</label>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                        {TEMPLATE_VARS.whatsappStatusChange.map(v => (
                            <span key={v} className="font-mono text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-[6px] border border-green-100">{v}</span>
                        ))}
                    </div>
                    <textarea
                        rows={5}
                        value={appSettings.whatsappStatusChangeTemplate}
                        onChange={e => setAppSettings(s => ({ ...s, whatsappStatusChangeTemplate: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono resize-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                    />
                </div>

                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-1.5 h-9 px-3.5 bg-green-600 text-white rounded-[6px] hover:bg-green-700 font-medium text-[13px] transition-all active:scale-95">
                        {appSettingsSaved ? <CheckCircle className="w-[15px] h-[15px]" /> : <MessageCircle className="w-[15px] h-[15px]" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>
                </div>
            )}

            {activeLeaf === 'cat-clientes' && <ClientCategoriesSettings />}
            {activeLeaf === 'cat-fornecedores' && <SupplierCategoriesSettings />}
            {activeLeaf === 'cat-contratos' && <ContractTypesSettings />}
            {activeLeaf === 'cat-empreendimentos' && <EmpreendimentoTypesSettings />}
            {activeLeaf === 'cat-financeiro' && (
                // Para separar visualmente sem destoar, envolvemos num container branco parecido
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                    <FinancialCategoriesManager />
                </div>
            )}

            {activeLeaf === 'indices' && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                    <ContractIndexManager />
                </div>
            )}
                </div>
            </div>
        </div>
    );
};

export default Settings;
