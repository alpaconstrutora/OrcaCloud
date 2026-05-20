import React, { useState, useEffect, useMemo } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    AreaChart, Area, XAxis, YAxis, Tooltip
} from 'recharts';
import {
    Zap, Clock, CheckCircle2, AlertCircle, Trash2,
    Plus, Shield, CreditCard, ArrowUpRight,
    Search, Filter, History, Settings, TrendingUp, Wallet,
    Loader2, Save, LayoutGrid, List, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProjectSettings, FinancialInfo, BillingRule, PaymentInstallment, Client } from '../types';
import { clientService } from '../services/clientService';
import { commercialService } from '../services/commercialService';
import { webhookService } from '../services/webhookService';
import { PropertyDeal } from '../types/imovib';

interface AutomationHistoryItem {
    id: string;
    created_at: string;
    event_type: 'contract_sent' | 'order_sent' | 'billing_triggered';
    reference_id?: string;
    reference_name?: string;
    status: 'success' | 'error';
    error_message?: string;
    payload?: unknown;
    converted_at?: string;
    converted_value?: number;
    project_id?: string;
    organization_id?: string;
}

interface AutomationManagerProps {
    settings: ProjectSettings;
    onUpdateSettings: (settings: ProjectSettings) => void;
    organizationId?: string;
}

const AutomationManager: React.FC<AutomationManagerProps> = ({ settings, onUpdateSettings, organizationId }) => {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'painel' | 'config' | 'ruler' | 'history'>(
        (localStorage.getItem('automation_active_tab') as 'painel' | 'config' | 'ruler' | 'history') || 'ruler'
    );
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('automation_view_mode') as 'grid' | 'list') || 'list'
    );
    const [automationHistory, setAutomationHistory] = useState<AutomationHistoryItem[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [commercialDeals, setCommercialDeals] = useState<PropertyDeal[]>([]);
    const [selectedHistory, setSelectedHistory] = useState<AutomationHistoryItem | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const [localFinancialInfo, setLocalFinancialInfo] = useState<FinancialInfo>(settings.financialInfo || {
        totalValue: 0,
        paymentMethod: '',
        installments: [],
        transactions: []
    });

    useEffect(() => {
        if (settings.financialInfo) {
            setLocalFinancialInfo(settings.financialInfo);
        }
    }, [settings.financialInfo]);

    // Persistência de estado
    useEffect(() => {
        localStorage.setItem('automation_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem('automation_view_mode', viewMode);
    }, [viewMode]);

    const financialInfo = localFinancialInfo;

    // Derived Ruler Installments - This is the reactive source of truth
    const readyInstallments = useMemo(() => {
        const insts: PaymentInstallment[] = financialInfo.installments || [];
        const rules: BillingRule[] = financialInfo.billingRules || [];
        const ready: { inst: PaymentInstallment; rule: BillingRule }[] = [];

        // Use Brazil/Sao Paulo timezone for "today"
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const pendingInsts = insts.filter(i => i.status === 'PENDING' || (i.status as string) === 'PENDENTE');

        for (const inst of pendingInsts) {
            const dueDate = inst.dueDate;
            if (!dueDate) continue;

            for (const rule of rules) {
                if (!rule.active) continue;
                if (rule.minValue && inst.value < rule.minValue) continue;

                // Normalize date to midday to avoid timezone shift issues during calculation
                const targetDate = new Date(dueDate + 'T12:00:00');
                targetDate.setDate(targetDate.getDate() + (rule.days || 0));

                const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                if (targetDateStr === today) {
                    ready.push({ inst, rule });
                }
            }
        }
        return ready;
    }, [financialInfo.installments, financialInfo.billingRules]);

    const metrics = useMemo(() => {
        const successes = automationHistory.filter(h => h.status === 'success').length;
        const total = automationHistory.length;
        const successRate = total > 0 ? (successes / total) * 100 : 100;

        const next7DaysValue = readyInstallments.reduce((sum, item) => sum + (item.inst.value || 0), 0);

        // Activity Chart Data (last 7 days)
        const activityData = Array.from({ length: 7 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            const dateStr = date.toISOString().split('T')[0];
            const items = automationHistory.filter(h => h.created_at?.startsWith(dateStr));
            return {
                name: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
                sucesso: items.filter(h => h.status === 'success').length,
                falha: items.filter(h => h.status === 'error').length
            };
        });

        // Distribution Data
        const distributionData = [
            { name: 'Contratos', value: automationHistory.filter(h => h.event_type === 'contract_sent').length, color: '#3b82f6' },
            { name: 'Pedidos', value: automationHistory.filter(h => h.event_type === 'order_sent').length, color: '#10b981' },
            { name: 'Cobrança', value: automationHistory.filter(h => h.event_type === 'billing_triggered').length, color: '#8b5cf6' }
        ].filter(d => d.value > 0);

        // ROI Metrics
        const billingTriggers = automationHistory.filter(h => h.event_type === 'billing_triggered' && h.status === 'success');
        const conversions = billingTriggers.filter(h => h.converted_at);
        const conversionRate = billingTriggers.length > 0 ? (conversions.length / billingTriggers.length) * 100 : 0;
        const recoveredValue = conversions.reduce((sum, h) => sum + (h.converted_value || 0), 0);

        return {
            successRate, totalDisparos: total, next7DaysValue,
            activityData, distributionData, conversionRate, recoveredValue
        };
    }, [automationHistory, readyInstallments]);

    useEffect(() => {
        fetchInitialData();
    }, [settings.id]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            let historyQuery = supabase
                .from('automation_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            const filters: string[] = [];
            if (settings.id) filters.push(`project_id.eq.${settings.id}`);
            const orgId = organizationId || settings.organizationId;
            if (orgId) filters.push(`organization_id.eq.${orgId}`);

            if (filters.length > 0) {
                historyQuery = historyQuery.or(filters.join(','));
            }

            const [clientsList, dealsList, historyData] = await Promise.all([
                clientService.listClients(),
                commercialService.listDeals(),
                historyQuery
            ]);

            setClients(clientsList);
            setCommercialDeals(dealsList);
            if (historyData.data) setAutomationHistory(historyData.data);
        } catch (error) {
            console.error("Error fetching automation data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTestWebhook = async (url: string) => {
        if (!url) return alert('Insira uma URL primeiro');
        try {
            setLoading(true);
            await webhookService.pingWebhook(url);
            alert('Conexão bem-sucedida!');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert(`Falha na conexão: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRetryHistory = async (item: AutomationHistoryItem) => {
        try {
            setLoading(true);
            const referenceData = commercialDeals.find(d => d.id === item.reference_id) || { id: item.reference_id, number: item.reference_name };
            if (item.event_type === 'order_sent') {
                alert('Funcionalidade de reenvio de pedido disparada.');
            } else if (item.event_type === 'contract_sent') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await webhookService.triggerContractSentWebhook(referenceData as any, undefined, settings, true);
                alert('Contrato reenviado com sucesso!');
            }
            fetchInitialData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert(`Erro no reenvio: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveGlobal = (field: keyof FinancialInfo, value: FinancialInfo[keyof FinancialInfo]) => {
        setLocalFinancialInfo(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleCommitChanges = async () => {
        setIsSaving(true);
        try {
            const newSettings = {
                ...settings,
                financialInfo: localFinancialInfo
            };
            await onUpdateSettings(newSettings);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error("Error saving automation settings:", error);
            alert("Erro ao salvar configurações.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncRuler = async () => {
        if (readyInstallments.length === 0) return alert("Nenhuma parcela pronta para disparo hoje.");

        if (!window.confirm(`Deseja disparar ${readyInstallments.length} eventos de cobrança agora?`)) return;

        try {
            setLoading(true);
            let successCount = 0;
            let errorCount = 0;

            for (const item of readyInstallments) {
                try {
                    await webhookService.triggerBillingWebhook(item, settings);
                    successCount++;
                } catch (err) {
                    console.error("Error triggering billing:", err);
                    errorCount++;
                }
            }

            alert(`Sincronização concluída!\nSucessos: ${successCount}${errorCount > 0 ? `\nFalhas: ${errorCount}` : ''}`);
            fetchInitialData();
        } catch (error) {
            console.error("Error in sync ruler:", error);
            alert("Erro durante a sincronização.");
        } finally {
            setLoading(false);
        }
    };

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-medium text-gray-900 tracking-tight">Central de Automação</h2>
                    <p className="text-sm text-gray-500 font-medium tracking-tight">Gerencie e monitore suas integrações inteligentes.</p>
                </div>
                <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                    <button onClick={() => setActiveTab('painel')} className={`px-5 py-2.5 rounded-xl text-[12px] font-medium uppercase tracking-widest transition-all ${activeTab === 'painel' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Painel</button>
                    <button onClick={() => setActiveTab('config')} className={`px-5 py-2.5 rounded-xl text-[12px] font-medium uppercase tracking-widest transition-all ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Configurações</button>
                    <button onClick={() => setActiveTab('ruler')} className={`px-5 py-2.5 rounded-xl text-[12px] font-medium uppercase tracking-widest transition-all ${activeTab === 'ruler' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Régua</button>
                    <button onClick={() => setActiveTab('history')} className={`px-5 py-2.5 rounded-xl text-[12px] font-medium uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Histórico</button>
                </div>
            </div>

            {/* Save Status Banner */}
            {activeTab !== 'painel' && activeTab !== 'history' && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ${JSON.stringify(localFinancialInfo) !== JSON.stringify(settings.financialInfo) ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
                    <div className="bg-gray-900 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-6 border border-white/10 backdrop-blur-xl">
                        <div className="flex flex-col">
                            <span className="text-[12px] font-medium uppercase tracking-widest text-blue-400">Alterações Pendentes</span>
                            <span className="text-xs text-gray-400">Você possui mudanças não salvas nestas configurações.</span>
                        </div>
                        <button
                            onClick={handleCommitChanges}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-medium text-[12px] uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </div>
            )}

            {showSuccess && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[110] animate-in slide-in-from-top-4">
                    <div className="bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 font-medium text-[12px] uppercase tracking-widest">
                        <CheckCircle2 className="w-4 h-4" /> Configurações Salvas com Sucesso!
                    </div>
                </div>
            )}

            {activeTab === 'painel' && (
                <div className="space-y-8">
                    {/* KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-40">
                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Taxa de Sucesso</span>
                            <div className="flex items-end justify-between">
                                <span className={`text-4xl font-medium tracking-tighter ${metrics.successRate > 90 ? 'text-emerald-500' : 'text-orange-500'}`}>{metrics.successRate.toFixed(1)}%</span>
                                <div className={`p-2 rounded-xl ${metrics.successRate > 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                    <Shield className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-40">
                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Total de Disparos</span>
                            <div className="flex items-end justify-between">
                                <span className="text-4xl font-medium tracking-tighter text-blue-600">{metrics.totalDisparos}</span>
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                    <Zap className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between h-40">
                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Taxa de Conversão</span>
                            <div className="flex items-end justify-between">
                                <span className={`text-4xl font-medium tracking-tighter ${metrics.conversionRate > 20 ? 'text-emerald-500' : 'text-indigo-500'}`}>{metrics.conversionRate.toFixed(1)}%</span>
                                <div className={`p-2 rounded-xl ${metrics.conversionRate > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-indigo-600 p-8 rounded-[2rem] shadow-xl shadow-indigo-600/20 text-white flex flex-col justify-between h-40">
                            <span className="text-[12px] font-medium uppercase tracking-widest opacity-80">Valor Recuperado (ROI)</span>
                            <div className="flex items-end justify-between">
                                <span className="text-2xl font-medium tracking-tighter">{fmt(metrics.recoveredValue)}</span>
                                <div className="p-2 bg-white/10 text-white rounded-xl">
                                    <Wallet className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-8 bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm">
                            <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest mb-8">Atividade de Redução de Fricção (7 dias)</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={metrics.activityData}>
                                        <defs>
                                            <linearGradient id="colorSucesso" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" fontSize={10} fontWeight="500" axisLine={false} tickLine={false} />
                                        <YAxis fontSize={10} fontWeight="500" axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: '500' }}
                                        />
                                        <Area type="monotone" dataKey="sucesso" stroke="#10b981" fillOpacity={1} fill="url(#colorSucesso)" strokeWidth={3} />
                                        <Area type="monotone" dataKey="falha" stroke="#ef4444" fill="transparent" strokeWidth={1} strokeDasharray="5 5" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="lg:col-span-4 bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col items-center">
                            <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest mb-8 self-start">Mix de Eventos</h4>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={metrics.distributionData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={8}
                                            dataKey="value"
                                        >
                                            {metrics.distributionData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 space-y-2 w-full">
                                {metrics.distributionData.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">{d.name}</span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-900">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Top Failures */}
                    <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden mt-8">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                            <div>
                                <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest">Principais Falhas Detectadas</h4>
                                <p className="text-[12px] text-gray-400 font-medium uppercase tracking-widest mt-1">Padrões de erro que precisam de sua atenção</p>
                            </div>
                        </div>
                        <div className="p-8">
                            {automationHistory.filter(h => h.status === 'error').length > 0 ? (
                                <div className="space-y-4">
                                    {Object.entries(
                                        automationHistory
                                            .filter(h => h.status === 'error')
                                            .reduce<Record<string, number>>((acc, h) => {
                                                const msg = (h.error_message || 'Erro Desconhecido').slice(0, 80);
                                                acc[msg] = (acc[msg] || 0) + 1;
                                                return acc;
                                            }, {})
                                    )
                                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                                        .slice(0, 3)
                                        .map(([error, count], i) => (
                                            <div key={i} className="flex items-center gap-4 p-4 bg-red-50/50 rounded-2xl border border-red-100/50">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-red-100 flex items-center justify-center text-red-600 font-medium text-sm">
                                                    {count as number}x
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-gray-900 leading-none mb-1">{error}</p>
                                                    <p className="text-[12px] text-red-600 font-medium uppercase tracking-widest">Frequência Alta</p>
                                                </div>
                                                <button
                                                    onClick={() => setActiveTab('history')}
                                                    className="px-4 py-2 bg-white border border-red-100 text-red-600 text-[12px] font-medium uppercase rounded-lg hover:bg-red-50 transition-colors tracking-widest"
                                                >
                                                    Ver Histórico
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum erro recorrente detectado</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'config' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { label: 'Webhook Suprimentos (Pedidos/Cotações)', field: 'webhookUrl', color: 'blue', icon: ArrowUpRight },
                            { label: 'Webhook Cobrança', field: 'billingWebhookUrl', color: 'emerald', icon: CreditCard },
                            { label: 'Webhook Contrato', field: 'contractWebhookUrl', color: 'indigo', icon: Shield }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 bg-${item.color}-50 rounded-xl`}>
                                            <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                                        </div>
                                        <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest">{item.label}</h4>
                                    </div>
                                    <button
                                        onClick={() => handleTestWebhook((financialInfo[item.field as keyof FinancialInfo] as string) || '')}
                                        className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-400 hover:text-blue-600"
                                        title="Testar Conexão"
                                    >
                                        <Zap className="w-4 h-4" />
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={(financialInfo[item.field as keyof FinancialInfo] as string) || ''}
                                    onChange={e => handleSaveGlobal(item.field as keyof FinancialInfo, e.target.value)}
                                    placeholder="URL do Webhook..."
                                    className="w-full bg-gray-50 px-4 py-3 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white font-mono text-[12px] font-medium outline-none transition-all"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="bg-white border border-gray-100 p-8 rounded-[2rem] shadow-sm max-w-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                <Clock className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest">Agendamento Automático</h4>
                                <p className="text-[12px] text-gray-400 font-medium uppercase tracking-widest mt-1">Defina o horário do disparo diário da régua</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <select
                                value={financialInfo.billingTriggerHour ?? 9}
                                onChange={e => handleSaveGlobal('billingTriggerHour', Number(e.target.value))}
                                className="bg-gray-50 px-6 py-4 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white font-medium text-sm outline-none transition-all"
                            >
                                {Array.from({ length: 24 }).map((_, i) => (
                                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                                ))}
                            </select>
                            <span className="text-[12px] font-medium text-gray-500 uppercase tracking-widest">Horário de Brasília (BRT)</span>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-100 p-8 rounded-[2rem] shadow-sm max-w-xl">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                    <Settings className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest">Templates de Contrato</h4>
                                    <p className="text-[12px] text-gray-400 font-medium uppercase tracking-widest mt-1">Escolha as variações para emissão</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const newTemplate = { id: crypto.randomUUID(), name: '', externalId: '' };
                                    handleSaveGlobal('contractTemplates', [...(financialInfo.contractTemplates || []), newTemplate]);
                                }}
                                className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {(financialInfo.contractTemplates || []).map((template, idx) => (
                                <div key={template.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex gap-4 items-start">
                                    <div className="flex-1 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1 block">Nome do Template</label>
                                                <input
                                                    type="text"
                                                    value={template.name}
                                                    onChange={e => {
                                                        const newTemplates = [...(financialInfo.contractTemplates || [])];
                                                        newTemplates[idx].name = e.target.value;
                                                        handleSaveGlobal('contractTemplates', newTemplates);
                                                    }}
                                                    placeholder="Ex: Contrato de Mão de Obra"
                                                    className="w-full bg-white px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1 block">ID Externo (Make/Webhook)</label>
                                                <input
                                                    type="text"
                                                    value={template.externalId}
                                                    onChange={e => {
                                                        const newTemplates = [...(financialInfo.contractTemplates || [])];
                                                        newTemplates[idx].externalId = e.target.value;
                                                        handleSaveGlobal('contractTemplates', newTemplates);
                                                    }}
                                                    placeholder="Ex: TPL_FINANCE_001"
                                                    className="w-full bg-white px-3 py-2 rounded-xl border border-gray-200 font-mono text-[12px] font-medium outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newTemplates = (financialInfo.contractTemplates || []).filter(t => t.id !== template.id);
                                            handleSaveGlobal('contractTemplates', newTemplates);
                                        }}
                                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {(!financialInfo.contractTemplates || financialInfo.contractTemplates.length === 0) && (
                                <p className="text-[12px] text-gray-400 font-medium uppercase text-center py-4 italic">Nenhum template cadastrado.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ruler' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-8">
                        <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                            <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                                <div>
                                    <h4 className="text-xs font-medium text-gray-900 uppercase tracking-widest">Regras de Automação</h4>
                                    <p className="text-[12px] text-gray-400 font-medium uppercase mt-1">Defina quando e como os disparos ocorrem</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                                        <button 
                                            onClick={() => setViewMode('list')}
                                            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                            title="Visualização em Linha"
                                        >
                                            <List className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('grid')}
                                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                            title="Visualização em Grade"
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newRule: BillingRule = {
                                                id: crypto.randomUUID(),
                                                days: 0,
                                                time: '09:00',
                                                active: true,
                                                triggerMode: 'AUTOMATIC'
                                            };
                                            handleSaveGlobal('billingRules', [...(financialInfo.billingRules || []), newRule]);
                                        }}
                                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    {(financialInfo.billingRules || []).map((rule, idx) => (
                                        viewMode === 'grid' ? (
                                            <div key={rule.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
                                                <div className={`p-2 rounded-xl ${rule.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                                                    <Zap className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div className="grid grid-cols-4 gap-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Disparo</span>
                                                            <select
                                                                value={rule.days}
                                                                onChange={e => {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].days = Number(e.target.value);
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }}
                                                                className="bg-transparent text-xs font-medium text-gray-700 outline-none"
                                                            >
                                                                <option value="-1">1 dia antes</option>
                                                                <option value="0">No dia do vencimento</option>
                                                                <option value="1">1 dia depois</option>
                                                                <option value="3">3 dias depois</option>
                                                                <option value="7">7 dias depois</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Valor Mínimo</span>
                                                            <input
                                                                type="number"
                                                                value={rule.minValue || ''}
                                                                onChange={e => {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].minValue = Number(e.target.value);
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }}
                                                                placeholder="R$ 0,00"
                                                                className="bg-transparent text-xs font-medium text-gray-700 outline-none w-24"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Modo</span>
                                                            <span className="text-xs font-medium text-gray-700">{rule.triggerMode === 'AUTOMATIC' ? 'Automático' : 'Manual'}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Status</span>
                                                            <button
                                                                onClick={() => {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].active = !newRules[idx].active;
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }}
                                                                className={`text-[12px] font-medium uppercase text-left ${rule.active ? 'text-emerald-600' : 'text-gray-400'}`}
                                                            >
                                                                {rule.active ? 'Ativo' : 'Pausado'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Template da Mensagem</span>
                                                        <textarea
                                                            value={rule.messageTemplate || ''}
                                                            onChange={e => {
                                                                const newRules = [...(financialInfo.billingRules || [])];
                                                                newRules[idx].messageTemplate = e.target.value;
                                                                handleSaveGlobal('billingRules', newRules);
                                                            }}
                                                            placeholder="Ex: Olá {{cliente}}, seu boleto de {{valor}} vence em {{vencimento}}."
                                                            className="w-full bg-white/50 border border-gray-100 rounded-xl p-3 text-xs font-medium outline-none focus:border-blue-200 focus:bg-white transition-all min-h-[60px] resize-none"
                                                        />
                                                        <div className="flex gap-2 mt-1">
                                                            {['cliente', 'valor', 'vencimento', 'descricao', 'projeto'].map(v => (
                                                                <button
                                                                    key={v}
                                                                    onClick={() => {
                                                                        const newRules = [...(financialInfo.billingRules || [])];
                                                                        const current = newRules[idx].messageTemplate || '';
                                                                        newRules[idx].messageTemplate = current + ` {{${v}}}`;
                                                                        handleSaveGlobal('billingRules', newRules);
                                                                    }}
                                                                    className="text-[8px] font-black uppercase tracking-tighter bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                                >
                                                                    +{v}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newRules = (financialInfo.billingRules || []).filter(r => r.id !== rule.id);
                                                        handleSaveGlobal('billingRules', newRules);
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div key={rule.id} className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2 rounded-lg ${rule.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                                                        <Zap className="w-4 h-4" />
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-4 flex-1 gap-4 items-center">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Disparo</span>
                                                            <select
                                                                value={rule.days}
                                                                onChange={e => {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].days = Number(e.target.value);
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }}
                                                                className="bg-transparent text-[11px] font-bold text-gray-700 outline-none mt-1"
                                                            >
                                                                <option value="-1">1 dia antes</option>
                                                                <option value="0">No dia</option>
                                                                <option value="1">1 dia depois</option>
                                                                <option value="3">3 dias depois</option>
                                                                <option value="7">7 dias depois</option>
                                                            </select>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Mínimo</span>
                                                            <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-gray-700">
                                                                <span>R$</span>
                                                                <input
                                                                    type="number"
                                                                    value={rule.minValue || ''}
                                                                    onChange={e => {
                                                                        const newRules = [...(financialInfo.billingRules || [])];
                                                                        newRules[idx].minValue = Number(e.target.value);
                                                                        handleSaveGlobal('billingRules', newRules);
                                                                    }}
                                                                    placeholder="0,00"
                                                                    className="bg-transparent outline-none w-16"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Modo</span>
                                                            <span className="text-[11px] font-bold text-gray-700 mt-1">{rule.triggerMode === 'AUTOMATIC' ? 'Automático' : 'Manual'}</span>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Status</span>
                                                            <button
                                                                onClick={() => {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].active = !newRules[idx].active;
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }}
                                                                className={`text-[10px] font-black uppercase text-left mt-1 ${rule.active ? 'text-emerald-600' : 'text-gray-400'}`}
                                                            >
                                                                {rule.active ? 'Ativo' : 'Pausado'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            const newRules = (financialInfo.billingRules || []).filter(r => r.id !== rule.id);
                                                            handleSaveGlobal('billingRules', newRules);
                                                        }}
                                                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="flex items-center gap-4 pl-12">
                                                    <div className="flex-1 bg-white/40 rounded-xl px-3 py-1.5 flex items-center justify-between group/template">
                                                        <span className="text-[11px] font-medium text-gray-500 italic truncate max-w-[400px]">
                                                            {rule.messageTemplate || "Sem template de mensagem configurado..."}
                                                        </span>
                                                        <button 
                                                            onClick={() => {
                                                                // Expand logic? For now just visual placeholder
                                                                const template = prompt("Edite o template da mensagem:", rule.messageTemplate || "");
                                                                if (template !== null) {
                                                                    const newRules = [...(financialInfo.billingRules || [])];
                                                                    newRules[idx].messageTemplate = template;
                                                                    handleSaveGlobal('billingRules', newRules);
                                                                }
                                                            }}
                                                            className="text-[9px] font-black text-blue-600 uppercase tracking-widest opacity-0 group-hover/template:opacity-100 transition-opacity"
                                                        >
                                                            Editar Template
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    ))}
                                    {(!financialInfo.billingRules || financialInfo.billingRules.length === 0) && (
                                        <div className="text-center py-8 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhuma regra configurada</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                            <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                                <div>
                                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Régua de Hoje</h4>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Parcelas prontas para disparo</p>
                                </div>
                                <span className="px-3 py-1 bg-white border border-gray-100 text-blue-600 rounded-full text-[10px] font-black">{readyInstallments.length} Ativas</span>
                            </div>
                            <div className="p-6">
                                {readyInstallments.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {readyInstallments.map(({ inst, rule }, idx) => (
                                            <div key={`${inst.id}-${idx}`} className="p-5 border border-gray-100 bg-gray-50/50 rounded-3xl hover:border-blue-200 transition-all group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-gray-900">{inst.clientName || 'N/A'}</span>
                                                        <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">{inst.description || inst.propertyName || 'N/A'}</span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-50">{fmt(inst.value)}</span>
                                                </div>
                                                <div className="flex justify-between items-center mt-3">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        {rule.days === 0 ? 'Disparo hoje' : rule.days < 0 ? `${Math.abs(rule.days)}d Antes` : `${rule.days}d Depois`}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                                                        <Zap className="w-3 h-3 animate-pulse" /> Pronto
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 opacity-30">
                                        <Clock className="w-10 h-10 mx-auto mb-3" />
                                        <p className="text-xs font-black uppercase tracking-widest">Sem disparos para hoje</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-indigo-600 p-10 rounded-[2.5rem] shadow-xl shadow-indigo-600/20 text-white space-y-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Zap className="w-24 h-24" />
                            </div>
                            <div className="relative z-10">
                                <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Sync Manual</h4>
                                <p className="text-sm font-medium leading-relaxed">Execute as regras de cobrança imediatamente.</p>
                            </div>
                            <button
                                onClick={handleSyncRuler}
                                className="w-full bg-white text-indigo-600 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg active:scale-95 relative z-10"
                            >
                                Rodar Régua Agora
                            </button>
                            <div className="pt-4 border-t border-white/10 relative z-10">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-80">
                                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                    Agendamento Ativo
                                </div>
                                <p className="text-[10px] opacity-60 mt-1">Próximo disparo automático: {(financialInfo.billingTriggerHour ?? 9).toString().padStart(2, '0')}:00 (Brasília)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Data/Hora</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Evento</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Referência</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {automationHistory.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/20 transition-colors group">
                                        <td className="px-6 py-4 text-[11px] font-bold text-gray-500 whitespace-nowrap">
                                            {new Date(item.created_at).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${item.event_type === 'contract_sent' ? 'bg-blue-50 text-blue-600' :
                                                item.event_type === 'order_sent' ? 'bg-emerald-50 text-emerald-600' :
                                                    'bg-purple-50 text-purple-600'
                                                }`}>
                                                {item.event_type === 'contract_sent' ? 'Contrato' :
                                                    item.event_type === 'order_sent' ? 'Pedido' :
                                                        'Cobrança'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-xs text-gray-700">{item.reference_name || 'N/A'}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                <span className={`text-[10px] font-black uppercase ${item.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {item.status === 'success' ? 'Sucesso' : 'Falha'}
                                                </span>
                                                {item.converted_at && (
                                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[8px] font-black uppercase tracking-widest">
                                                        <CheckCircle2 className="w-3 h-3" /> Convertido
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setSelectedHistory(item)} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-100 text-gray-400 hover:text-blue-600 transition-all font-black text-[9px] uppercase tracking-widest">Detalhes</button>
                                                {item.status === 'error' && (
                                                    <button onClick={() => handleRetryHistory(item)} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-100 text-gray-400 hover:text-emerald-600 transition-all font-black text-[9px] uppercase tracking-widest">Reenviar</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* History Details Modal */}
            {selectedHistory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-2xl border border-gray-100 animate-in zoom-in-95">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Detalhes do Evento</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">ID: {selectedHistory.id}</p>
                            </div>
                            <button onClick={() => setSelectedHistory(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                                <Plus className="w-6 h-6 rotate-45 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {selectedHistory.error_message && (
                                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-4 h-4 text-red-600" />
                                        <span className="text-xs font-black text-red-600 uppercase tracking-widest">Erro Reportado</span>
                                    </div>
                                    <p className="text-sm text-red-700 font-medium">{selectedHistory.error_message}</p>
                                </div>
                            )}

                            <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">Payload Enviado (JSON)</span>
                                <div className="bg-gray-900 p-6 rounded-3xl overflow-hidden border border-gray-800">
                                    <pre className="text-[11px] text-emerald-400 font-mono leading-relaxed overflow-x-auto max-h-[300px] custom-scrollbar">
                                        {JSON.stringify(selectedHistory.payload, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 flex gap-4">
                            <button
                                onClick={() => { handleRetryHistory(selectedHistory); setSelectedHistory(null); }}
                                className={`flex-1 ${selectedHistory.status === 'success' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-600/20'} py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all`}
                                disabled={selectedHistory.status === 'success'}
                            >
                                {selectedHistory.status === 'success' ? 'Já Enviado com Sucesso' : 'Tentar Reenvio'}
                            </button>
                            <button onClick={() => setSelectedHistory(null)} className="px-8 bg-gray-50 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100">Fechar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AutomationManager;
