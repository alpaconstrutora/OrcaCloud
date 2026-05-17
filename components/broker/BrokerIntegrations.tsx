import React, { useState } from 'react';
import { Link2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Settings, Zap, Database, FileSignature, CreditCard, Plug } from 'lucide-react';
import type { BrokerIntegration } from '../../types';

interface BrokerIntegrationsProps {
    organizationId: string;
}

const TYPE_CONFIG: Record<BrokerIntegration['type'], { icon: any; color: string; bg: string; label: string }> = {
    CRM: { icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'CRM' },
    ERP: { icon: Settings, color: 'text-blue-600', bg: 'bg-blue-50', label: 'ERP' },
    ASSINATURA: { icon: FileSignature, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Assinatura Digital' },
    PAGAMENTO: { icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Pagamento' },
    OUTRO: { icon: Plug, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Outro' },
};

const STATUS_CONFIG: Record<BrokerIntegration['status'], { icon: any; color: string; bg: string; label: string }> = {
    ATIVO: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Ativo' },
    INATIVO: { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-50', label: 'Inativo' },
    CONFIGURANDO: { icon: Settings, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Configurando' },
    ERRO: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Erro' },
};

const generateDemoIntegrations = (): BrokerIntegration[] => [
    { id: 'int-1', name: 'Hypnobox CRM', type: 'CRM', provider: 'Hypnobox', status: 'ATIVO', last_sync: new Date(Date.now() - 5 * 60000).toISOString(), events_count: 234, description: 'Sincronização bidirecional de leads e propostas.' },
    { id: 'int-2', name: 'Sienge ERP', type: 'ERP', provider: 'Softplan', status: 'ATIVO', last_sync: new Date(Date.now() - 30 * 60000).toISOString(), events_count: 156, description: 'Integração com módulo de vendas e financeiro.' },
    { id: 'int-3', name: 'Clicksign', type: 'ASSINATURA', provider: 'Clicksign', status: 'ATIVO', last_sync: new Date(Date.now() - 2 * 3600000).toISOString(), events_count: 42, description: 'Assinatura digital de contratos e propostas.' },
    { id: 'int-4', name: 'D4Sign', type: 'ASSINATURA', provider: 'D4Sign', status: 'INATIVO', description: 'Alternativa de assinatura digital.' },
    { id: 'int-5', name: 'CV CRM', type: 'CRM', provider: 'Construtor de Vendas', status: 'CONFIGURANDO', events_count: 0, description: 'CRM imobiliário especializado em vendas.' },
    { id: 'int-6', name: 'Gateway de Pagamento', type: 'PAGAMENTO', provider: 'PagSeguro', status: 'ERRO', last_sync: new Date(Date.now() - 24 * 3600000).toISOString(), events_count: 8, description: 'Processamento de pagamentos de reservas.' },
];

const BrokerIntegrations: React.FC<BrokerIntegrationsProps> = ({ organizationId }) => {
    const [integrations, setIntegrations] = useState<BrokerIntegration[]>(generateDemoIntegrations);

    const formatTimeAgo = (dateStr?: string) => {
        if (!dateStr) return 'Nunca';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}min atrás`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h atrás`;
        return `${Math.floor(hours / 24)}d atrás`;
    };

    const handleToggle = (id: string) => {
        setIntegrations(prev => prev.map(i => {
            if (i.id !== id) return i;
            return { ...i, status: i.status === 'ATIVO' ? 'INATIVO' : 'ATIVO' };
        }));
    };

    const handleSync = (id: string) => {
        setIntegrations(prev => prev.map(i => {
            if (i.id !== id) return i;
            return { ...i, last_sync: new Date().toISOString(), status: 'ATIVO' };
        }));
    };

    const activeCount = integrations.filter(i => i.status === 'ATIVO').length;
    const errorCount = integrations.filter(i => i.status === 'ERRO').length;

    return (
        <div className="space-y-6">
            {/* Summary Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Integrações Ativas</p>
                            <p className="text-3xl font-black text-emerald-600 mt-1">{activeCount}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl"><Link2 className="w-5 h-5 text-emerald-600" /></div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Eventos Sincronizados</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{integrations.reduce((a, i) => a + (i.events_count || 0), 0)}</p>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl"><Zap className="w-5 h-5 text-indigo-600" /></div>
                    </div>
                </div>
                {errorCount > 0 && (
                    <div className="bg-red-50 rounded-2xl border border-red-100 p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em]">Com Erro</p>
                                <p className="text-3xl font-black text-red-600 mt-1">{errorCount}</p>
                            </div>
                            <div className="p-3 bg-red-100 rounded-xl"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Integration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.map(integration => {
                    const typeCfg = TYPE_CONFIG[integration.type];
                    const statusCfg = STATUS_CONFIG[integration.status];
                    const TypeIcon = typeCfg.icon;
                    const StatusIcon = statusCfg.icon;

                    return (
                        <div key={integration.id}
                            className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${integration.status === 'ERRO' ? 'border-red-200' : integration.status === 'ATIVO' ? 'border-gray-100' : 'border-gray-100 opacity-75'}`}>
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-xl ${typeCfg.bg}`}>
                                            <TypeIcon className={`w-5 h-5 ${typeCfg.color}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-gray-900">{integration.name}</h3>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${typeCfg.bg} ${typeCfg.color}`}>
                                                {typeCfg.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black ${statusCfg.bg} ${statusCfg.color}`}>
                                        <StatusIcon className="w-3.5 h-3.5" />
                                        {statusCfg.label}
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500 mb-4">{integration.description}</p>

                                <div className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-4">
                                        {integration.last_sync && (
                                            <span className="text-gray-400 font-medium">
                                                Sync: <span className="font-bold text-gray-600">{formatTimeAgo(integration.last_sync)}</span>
                                            </span>
                                        )}
                                        {integration.events_count !== undefined && (
                                            <span className="text-gray-400 font-medium">
                                                Eventos: <span className="font-bold text-gray-600">{integration.events_count}</span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-1.5">
                                        {integration.status === 'ATIVO' && (
                                            <button onClick={() => handleSync(integration.id)}
                                                className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-500 transition-colors" title="Sincronizar">
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => handleToggle(integration.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${integration.status === 'ATIVO'
                                                ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                                            {integration.status === 'ATIVO' ? 'Desativar' : 'Ativar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Webhook Activity Placeholder */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h3 className="text-sm font-black text-gray-900 mb-2">Webhooks Configurados</h3>
                <p className="text-xs text-gray-400 mb-4">Eventos que acionam notificações automáticas para os sistemas integrados.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['Lead Criado', 'Proposta Enviada', 'Venda Fechada', 'Reserva Expirada'].map(event => (
                        <div key={event} className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-gray-700">{event}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BrokerIntegrations;
