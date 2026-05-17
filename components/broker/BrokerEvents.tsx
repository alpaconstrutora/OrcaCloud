import React, { useState } from 'react';
import { Calendar, MapPin, Users, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { BrokerEvent } from '../../types';

interface BrokerEventsProps {
    brokerEmail: string;
}

const TYPE_CONFIG: Record<BrokerEvent['type'], { label: string; color: string; bg: string; border: string }> = {
    PLANTAO: { label: 'Plantão', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    LANCAMENTO: { label: 'Lançamento', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    TREINAMENTO: { label: 'Treinamento', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    VISITA_OBRA: { label: 'Visita à Obra', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    NETWORKING: { label: 'Networking', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    OUTRO: { label: 'Outro', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    ABERTO: { label: 'Aberto', color: 'text-emerald-600' },
    LOTADO: { label: 'Lotado', color: 'text-red-600' },
    ENCERRADO: { label: 'Encerrado', color: 'text-gray-500' },
    CANCELADO: { label: 'Cancelado', color: 'text-red-500' },
};

const generateDemoEvents = (): BrokerEvent[] => {
    const now = new Date();
    return [
        { id: 'ev1', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Plantão de Vendas — Final de Semana', description: 'Plantão especial com condições exclusivas para fechamento no local.', type: 'PLANTAO', date: new Date(now.getTime() + 2 * 86400000).toISOString(), end_date: new Date(now.getTime() + 2 * 86400000 + 8 * 3600000).toISOString(), location: 'Stand de Vendas - Av. Brasil, 1500', max_capacity: 20, registered_count: 14, is_registered: true, status: 'ABERTO' },
        { id: 'ev2', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Visita à Obra — Torre A', description: 'Acompanhe o andamento da obra e veja os acabamentos sendo instalados.', type: 'VISITA_OBRA', date: new Date(now.getTime() + 5 * 86400000).toISOString(), location: 'Canteiro de Obras - Rua das Flores, 200', max_capacity: 10, registered_count: 8, is_registered: false, status: 'ABERTO' },
        { id: 'ev3', organization_id: 'demo', title: 'Lançamento — Edifício Horizonte', description: 'Evento de lançamento do novo empreendimento com coquetel.', type: 'LANCAMENTO', date: new Date(now.getTime() + 10 * 86400000).toISOString(), location: 'Espaço Eventos - Shopping Center', max_capacity: 100, registered_count: 67, is_registered: false, status: 'ABERTO' },
        { id: 'ev4', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Treinamento: Técnicas de Fechamento', description: 'Curso presencial de 4 horas sobre técnicas avançadas de negociação.', type: 'TREINAMENTO', date: new Date(now.getTime() + 15 * 86400000).toISOString(), location: 'Sala de Reuniões - Sede da Incorporadora', max_capacity: 30, registered_count: 22, is_registered: true, status: 'ABERTO' },
        { id: 'ev5', organization_id: 'demo', title: 'Happy Hour — Corretores Top 10', description: 'Encontro exclusivo para os 10 melhores corretores do trimestre.', type: 'NETWORKING', date: new Date(now.getTime() + 20 * 86400000).toISOString(), location: 'Restaurante Jardim', max_capacity: 10, registered_count: 10, is_registered: false, status: 'LOTADO' },
        { id: 'ev6', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Plantão Anterior', type: 'PLANTAO', date: new Date(now.getTime() - 5 * 86400000).toISOString(), location: 'Stand de Vendas', max_capacity: 20, registered_count: 18, is_registered: true, status: 'ENCERRADO' },
    ];
};

const BrokerEvents: React.FC<BrokerEventsProps> = ({ brokerEmail }) => {
    const [events, setEvents] = useState<BrokerEvent[]>(generateDemoEvents);
    const [filter, setFilter] = useState<'proximos' | 'inscritos' | 'passados'>('proximos');

    const now = new Date();
    const filtered = events.filter(ev => {
        if (filter === 'proximos') return new Date(ev.date) >= now && ev.status !== 'CANCELADO';
        if (filter === 'inscritos') return ev.is_registered;
        return new Date(ev.date) < now || ev.status === 'ENCERRADO';
    });

    const handleToggleRegister = (event: BrokerEvent) => {
        setEvents(prev => prev.map(ev => {
            if (ev.id !== event.id) return ev;
            if (ev.is_registered) {
                return { ...ev, is_registered: false, registered_count: ev.registered_count - 1 };
            }
            if (ev.status === 'LOTADO' || ev.status === 'ENCERRADO') return ev;
            const newCount = ev.registered_count + 1;
            return {
                ...ev, is_registered: true, registered_count: newCount,
                status: ev.max_capacity && newCount >= ev.max_capacity ? 'LOTADO' : ev.status
            };
        }));
    };

    const formatDate = (d: string) => {
        const date = new Date(d);
        return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    };
    const formatTime = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const daysUntil = (d: string) => {
        const diff = Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);
        if (diff === 0) return 'Hoje';
        if (diff === 1) return 'Amanhã';
        return `em ${diff} dias`;
    };

    return (
        <div className="space-y-6">
            {/* Filter Tabs */}
            <div className="flex gap-2">
                {([['proximos', 'Próximos'], ['inscritos', 'Inscritos'], ['passados', 'Passados']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setFilter(id)}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(event => {
                    const cfg = TYPE_CONFIG[event.type];
                    const statusCfg = STATUS_LABELS[event.status];
                    const isPast = new Date(event.date) < now;
                    const capacityPct = event.max_capacity ? (event.registered_count / event.max_capacity) * 100 : 0;

                    return (
                        <div key={event.id}
                            className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${event.is_registered ? 'border-indigo-200' : 'border-gray-100'} ${isPast ? 'opacity-70' : ''}`}>
                            {/* Date Banner */}
                            <div className={`px-5 py-3 flex items-center justify-between ${cfg.bg} border-b ${cfg.border}`}>
                                <div className="flex items-center gap-2">
                                    <Calendar className={`w-4 h-4 ${cfg.color}`} />
                                    <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                                </div>
                                <span className={`text-xs font-bold ${isPast ? 'text-gray-400' : 'text-indigo-600'}`}>
                                    {isPast ? 'Encerrado' : daysUntil(event.date)}
                                </span>
                            </div>

                            <div className="p-5">
                                <h3 className="text-sm font-black text-gray-900 leading-tight">{event.title}</h3>
                                {event.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{event.description}</p>}

                                <div className="flex flex-col gap-2 mt-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="font-medium">{formatDate(event.date)} às {formatTime(event.date)}</span>
                                    </div>
                                    {event.location && (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="font-medium">{event.location}</span>
                                        </div>
                                    )}
                                    {event.max_capacity && (
                                        <div className="flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5 text-gray-400" />
                                            <div className="flex-1">
                                                <div className="flex justify-between text-[10px] font-bold mb-1">
                                                    <span className="text-gray-500">{event.registered_count}/{event.max_capacity} vagas</span>
                                                    <span className={capacityPct >= 90 ? 'text-red-500' : 'text-gray-400'}>{Math.round(capacityPct)}%</span>
                                                </div>
                                                <div className="bg-gray-100 rounded-full h-1.5">
                                                    <div className={`rounded-full h-1.5 transition-all ${capacityPct >= 90 ? 'bg-red-500' : capacityPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${Math.min(100, capacityPct)}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!isPast && (
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        {event.is_registered ? (
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                                                    <CheckCircle2 className="w-4 h-4" /> Inscrito
                                                </span>
                                                <button onClick={() => handleToggleRegister(event)}
                                                    className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors">
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : event.status === 'LOTADO' ? (
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                                                <AlertTriangle className="w-4 h-4" /> Evento lotado
                                            </span>
                                        ) : (
                                            <button onClick={() => handleToggleRegister(event)}
                                                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                                                Inscrever-se
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold">Nenhum evento encontrado.</p>
                </div>
            )}
        </div>
    );
};

export default BrokerEvents;
