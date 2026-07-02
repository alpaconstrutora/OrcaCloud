import React from 'react';
import { Bell, CheckCircle2, Plus, Send, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import {
    announcementsService,
    InvestorAnnouncement,
    AnnouncementType,
    ANNOUNCEMENT_TYPE_LABELS,
} from '../../services/announcementsService';
import MigrationBanner, { isTableMissing } from './MigrationBanner';
import Button from '../ui/Button';

interface Props {
    organizationId: string;
    investorId?: string;
    isAdmin?: boolean;
}

const TYPE_COLORS: Record<AnnouncementType, string> = {
    aviso: 'bg-amber-50 text-amber-700 border-amber-100',
    assembleia: 'bg-purple-50 text-purple-700 border-purple-100',
    votacao: 'bg-blue-50 text-blue-700 border-blue-100',
    comunicado: 'bg-gray-50 text-gray-700 border-gray-100',
};

const emptyForm = (): Partial<InvestorAnnouncement> => ({
    type: 'comunicado',
    title: '',
    body: '',
    requires_acknowledgment: false,
});

const CommunicationCenter: React.FC<Props> = ({ organizationId, investorId, isAdmin }) => {
    const [items, setItems] = React.useState<InvestorAnnouncement[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [tableMissing, setTableMissing] = React.useState(false);
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [showForm, setShowForm] = React.useState(false);
    const [form, setForm] = React.useState<Partial<InvestorAnnouncement>>(emptyForm());
    const [saving, setSaving] = React.useState(false);
    const [ackPending, setAckPending] = React.useState<string | null>(null);

    const load = React.useCallback(() => {
        setLoading(true);
        const fn = isAdmin
            ? announcementsService.listAll(organizationId)
            : announcementsService.list(organizationId, investorId);
        fn.then(setItems)
            .catch(err => {
                if (isTableMissing(err)) setTableMissing(true);
                else console.error('Error loading announcements', err);
            })
            .finally(() => setLoading(false));
    }, [organizationId, investorId, isAdmin]);

    React.useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!form.title?.trim() || !form.body?.trim()) { alert('Preencha título e corpo.'); return; }
        setSaving(true);
        try {
            const saved = await announcementsService.save({
                organization_id: organizationId,
                title: form.title,
                body: form.body,
                type: form.type as AnnouncementType,
                requires_acknowledgment: form.requires_acknowledgment ?? false,
                published_at: null,
            } as any);
            setItems(prev => [saved, ...prev]);
            setForm(emptyForm());
            setShowForm(false);
        } catch (err) {
            console.error('Error saving announcement', err);
            if (isTableMissing(err)) setTableMissing(true);
            else alert('Erro ao salvar comunicado.');
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async (item: InvestorAnnouncement) => {
        try {
            await announcementsService.publish(item.id!);
            setItems(prev => prev.map(a => a.id === item.id
                ? { ...a, published_at: new Date().toISOString() } : a));
        } catch (err) {
            console.error('Error publishing', err);
        }
    };

    const handleAck = async (item: InvestorAnnouncement, vote?: string) => {
        if (!investorId) return;
        setAckPending(item.id!);
        try {
            await announcementsService.acknowledge(item.id!, investorId, vote);
            setItems(prev => prev.map(a => a.id === item.id
                ? { ...a, user_acknowledged: true, user_vote: vote ?? null } : a));
        } catch (err) {
            console.error('Error acknowledging', err);
        } finally {
            setAckPending(null);
        }
    };

    const pendingAcks = items.filter(a =>
        a.requires_acknowledgment && !a.user_acknowledged && a.published_at
    ).length;

    if (loading) {
        return <div className="py-12 text-center text-sm text-gray-400">Carregando comunicados...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-gray-900">Central de Comunicados</h3>
                    {pendingAcks > 0 && (
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                            <Bell className="w-3.5 h-3.5" />
                            {pendingAcks} pendente{pendingAcks > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => setShowForm(v => !v)}
                        className="flex items-center gap-2 rounded-xl text-button"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Comunicado
                    </Button>
                )}
            </div>

            {/* New announcement form (admin) */}
            {isAdmin && showForm && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1 col-span-2">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Título</span>
                            <input
                                type="text"
                                value={form.title || ''}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: Reunião de Prestação de Contas — Mar/26"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</span>
                            <select
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value as AnnouncementType }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {Object.entries(ANNOUNCEMENT_TYPE_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.requires_acknowledgment ?? false}
                                onChange={e => setForm(f => ({ ...f, requires_acknowledgment: e.target.checked }))}
                                className="w-4 h-4 accent-blue-600"
                            />
                            <span className="text-sm text-gray-700">Requer aceite digital</span>
                        </label>
                        <label className="flex flex-col gap-1 col-span-2">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Corpo</span>
                            <textarea
                                rows={4}
                                value={form.body || ''}
                                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                placeholder="Texto completo do comunicado..."
                            />
                        </label>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 rounded-xl"
                        >
                            <Send className="w-4 h-4" />
                            {saving ? 'Salvando...' : 'Salvar Rascunho'}
                        </Button>
                    </div>
                </div>
            )}

            {/* List */}
            {items.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                    <Bell className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-400">Nenhum comunicado publicado.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map(item => {
                        const isExpanded = expanded === item.id;
                        const isDraft = !item.published_at;
                        const needsAck = item.requires_acknowledgment && !item.user_acknowledged && !isAdmin;
                        const isVoting = item.type === 'votacao' && !item.user_acknowledged && !isAdmin;

                        return (
                            <div
                                key={item.id}
                                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${needsAck ? 'border-amber-200' : 'border-gray-100'}`}
                            >
                                <div
                                    className="p-5 cursor-pointer flex items-start gap-4 hover:bg-gray-50/50 transition-colors"
                                    onClick={() => setExpanded(isExpanded ? null : item.id!)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full border text-xs font-black uppercase tracking-wider ${TYPE_COLORS[item.type]}`}>
                                                {ANNOUNCEMENT_TYPE_LABELS[item.type]}
                                            </span>
                                            {isDraft && isAdmin && (
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold uppercase">Rascunho</span>
                                            )}
                                            {needsAck && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold uppercase flex items-center gap-1">
                                                    <Bell className="w-3 h-3" /> Aceite pendente
                                                </span>
                                            )}
                                            {item.user_acknowledged && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Aceito
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {item.published_at
                                                ? new Date(item.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : 'Não publicado'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {isAdmin && isDraft && (
                                            <Button
                                                size="sm"
                                                onClick={e => { e.stopPropagation(); handlePublish(item); }}
                                                className="flex items-center gap-1 rounded-lg text-button"
                                            >
                                                <Send className="w-3.5 h-3.5" /> Publicar
                                            </Button>
                                        )}
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-4 animate-in fade-in duration-150">
                                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{item.body}</p>

                                        {/* Votação */}
                                        {isVoting && (
                                            <div className="flex items-center gap-3 pt-2">
                                                <p className="text-xs font-bold text-gray-500">Seu voto:</p>
                                                {(['sim', 'nao', 'abstencao'] as const).map(v => (
                                                    <button
                                                        key={v}
                                                        disabled={ackPending === item.id}
                                                        onClick={() => handleAck(item, v)}
                                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-button font-bold transition-all disabled:opacity-60 ${
                                                            v === 'sim' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                            : v === 'nao' ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                    >
                                                        {v === 'sim' && <ThumbsUp className="w-3.5 h-3.5" />}
                                                        {v === 'nao' && <ThumbsDown className="w-3.5 h-3.5" />}
                                                        {v === 'abstencao' && <Minus className="w-3.5 h-3.5" />}
                                                        {v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Abstenção'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Resultado do voto */}
                                        {item.user_vote && (
                                            <p className="text-xs text-gray-500">
                                                Seu voto: <span className="font-bold capitalize">{item.user_vote}</span>
                                            </p>
                                        )}

                                        {/* Aceite simples */}
                                        {item.requires_acknowledgment && item.type !== 'votacao' && !item.user_acknowledged && !isAdmin && (
                                            <Button
                                                disabled={ackPending === item.id}
                                                onClick={() => handleAck(item)}
                                                className="flex items-center gap-2 rounded-xl transition-colors"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {ackPending === item.id ? 'Confirmando...' : 'Confirmar Leitura'}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CommunicationCenter;
