import React from 'react';
import { supabase } from '../lib/supabase';
import { MOCK_SINAPI_DB } from '../constants';
import { Database, AlertTriangle, CheckCircle, Loader2, MessageCircle, Eye, EyeOff, Trash2, Hash, Mail, RotateCcw } from 'lucide-react';
import { whatsappService, WhatsAppConfig } from '../services/whatsappService';
import { appSettingsService, AppSettings, APP_SETTINGS_DEFAULTS, TEMPLATE_VARS } from '../services/appSettingsService';

const Settings: React.FC = () => {
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

    const handleWaClear = () => {
        if (!confirm('Remover as credenciais WhatsApp salvas?')) return;
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

    const handleAppSettingsReset = (section: 'numbering' | 'whatsapp' | 'email') => {
        if (!confirm('Restaurar padrões desta seção?')) return;
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
        if (!confirm('Isso irá migrar os itens do MOCK_SINAPI_DB para a tabela sinapi_items no Supabase. Certifique-se que a tabela foi criada. Deseja continuar?')) {
            return;
        }

        setStatus('MIGRATING');
        setMessage('Iniciando migração...');

        try {
            // Transform data to match SQL schema
            const itemsToInsert = MOCK_SINAPI_DB.map(item => ({
                code: item.code,
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

            const { error } = await supabase.from('sinapi_items').upsert(itemsToInsert, { onConflict: 'code' });

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
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Configurações do Sistema</h1>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div>
                            <span className="block text-sm font-medium text-gray-700">Migração Inicial</span>
                            <span className="text-xs text-gray-500">Envia itens do MOCK_CONSTANTS para a tabela 'sinapi_items'</span>
                        </div>
                        <button
                            onClick={runMigration}
                            disabled={status === 'MIGRATING'}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {status === 'MIGRATING' && <Loader2 className="w-4 h-4 animate-spin" />}
                            Configurar Base
                        </button>
                    </div>

                    {status !== 'IDLE' && (
                        <div className={`mt-4 p-4 rounded-md flex items-center gap-3 ${status === 'SUCCESS' ? 'bg-green-50 text-green-700' : status === 'ERROR' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                            {status === 'SUCCESS' ? <CheckCircle className="w-5 h-5" /> : status === 'ERROR' ? <AlertTriangle className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                            <span className="text-sm font-medium">{message}</span>
                        </div>
                    )}
                </div>
            </div>
            {/* Numeração de Pedidos */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
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
                    <button onClick={() => handleAppSettingsReset('numbering')} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>
                <div className="mt-6 border-t border-gray-100 pt-6 grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Prefixo</label>
                        <input
                            type="text"
                            value={appSettings.orderPrefix}
                            onChange={e => setAppSettings(s => ({ ...s, orderPrefix: e.target.value }))}
                            placeholder="PO-"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Ex: <span className="font-mono">{appSettings.orderPrefix}123456</span></p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Sufixo de Duplicata</label>
                        <input
                            type="text"
                            value={appSettings.orderDuplicateSuffix}
                            onChange={e => setAppSettings(s => ({ ...s, orderDuplicateSuffix: e.target.value }))}
                            placeholder="-DUP"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Ex: <span className="font-mono">{appSettings.orderPrefix}123456{appSettings.orderDuplicateSuffix}</span></p>
                    </div>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 transition-all">
                        {appSettingsSaved ? <CheckCircle className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* Templates de E-mail */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
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
                    <button onClick={() => handleAppSettingsReset('email')} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>
                <div className="mt-4 mb-3 flex flex-wrap gap-2">
                    <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                    {TEMPLATE_VARS.email.map(v => (
                        <span key={v} className="font-mono text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100">{v}</span>
                    ))}
                </div>
                <div className="border-t border-gray-100 pt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Assunto</label>
                        <input
                            type="text"
                            value={appSettings.emailStatusChangeSubject}
                            onChange={e => setAppSettings(s => ({ ...s, emailStatusChangeSubject: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Corpo</label>
                        <textarea
                            rows={3}
                            value={appSettings.emailStatusChangeBody}
                            onChange={e => setAppSettings(s => ({ ...s, emailStatusChangeBody: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all">
                        {appSettingsSaved ? <CheckCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* Z-API / WhatsApp */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                        <MessageCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-800">WhatsApp Business (API Oficial)</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${isWaActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
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
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Phone Number ID</label>
                        <input
                            type="text"
                            value={waForm.phoneNumberId}
                            onChange={e => setWaForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                            placeholder="ex: 123456789012345"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                        />
                        <p className="text-xs text-gray-400 mt-1">Encontrado em Meta for Developers → seu app → WhatsApp → API Setup.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Access Token</label>
                        <div className="relative">
                            <input
                                type={showToken ? 'text' : 'password'}
                                value={waForm.accessToken}
                                onChange={e => setWaForm(f => ({ ...f, accessToken: e.target.value }))}
                                placeholder="••••••••••••••••"
                                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
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
                            className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-red-600 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Limpar credenciais
                        </button>
                        <button
                            onClick={handleWaSave}
                            disabled={!waForm.phoneNumberId || !waForm.accessToken}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-black hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            {waSaved ? <CheckCircle className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                            {waSaved ? 'Salvo!' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
            {/* Templates WhatsApp */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
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
                    <button onClick={() => handleAppSettingsReset('whatsapp')} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" /> Padrões
                    </button>
                </div>

                {/* Template: Pedido Enviado */}
                <div className="mt-6 border-t border-gray-100 pt-6 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-widest">Pedido Enviado ao Fornecedor</label>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                        {TEMPLATE_VARS.whatsappOrderSent.map(v => (
                            <span key={v} className="font-mono text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-md border border-green-100">{v}</span>
                        ))}
                    </div>
                    <textarea
                        rows={8}
                        value={appSettings.whatsappOrderSentTemplate}
                        onChange={e => setAppSettings(s => ({ ...s, whatsappOrderSentTemplate: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono resize-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                    />
                </div>

                {/* Template: Mudança de Status */}
                <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-widest">Mudança de Status</label>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest self-center">Variáveis:</span>
                        {TEMPLATE_VARS.whatsappStatusChange.map(v => (
                            <span key={v} className="font-mono text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-md border border-green-100">{v}</span>
                        ))}
                    </div>
                    <textarea
                        rows={5}
                        value={appSettings.whatsappStatusChangeTemplate}
                        onChange={e => setAppSettings(s => ({ ...s, whatsappStatusChangeTemplate: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono resize-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                    />
                </div>

                <div className="flex justify-end mt-4">
                    <button onClick={handleAppSettingsSave} className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-black hover:bg-green-700 transition-all">
                        {appSettingsSaved ? <CheckCircle className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                        {appSettingsSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
