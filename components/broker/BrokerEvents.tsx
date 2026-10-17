import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, MapPin, Users, Clock, CheckCircle2, Plus, Loader2, Pencil, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { brokerPortalService } from '../../services/brokerPortalService';
import { brokerService } from '../../services/brokerService';

/**
 * Agenda do Portal do Corretor — dado REAL desde 17/10/2026 (antes, gerador fixo).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F4, decisão P4).
 *
 * Gestor (visão interna): cria, edita e cancela eventos (plantão, visita à obra,
 * lançamento…) e vê quem se inscreveu. Corretor (link): vê os eventos da
 * organização e se inscreve ou cancela pelas RPCs do token — o banco recusa
 * evento lotado, cancelado ou que já passou. "Lotado" é calculado, não gravado.
 * Sem token na visão do corretor (prévia do gestor): só leitura.
 */

type TipoEvento = 'PLANTAO' | 'LANCAMENTO' | 'TREINAMENTO' | 'VISITA_OBRA' | 'NETWORKING' | 'OUTRO';

interface Evento {
    id: string;
    title: string;
    description?: string | null;
    type: TipoEvento;
    date: string;
    end_date?: string | null;
    location?: string | null;
    max_capacity?: number | null;
    status: 'ABERTO' | 'LOTADO' | 'ENCERRADO' | 'CANCELADO';
    inscritos: number;
    minha_inscricao?: string | null;
    inscricoes?: { id: string; broker_email: string; status: string }[];
}

interface BrokerEventsProps {
    brokerEmail: string;
    portalToken?: string;
    organizationId?: string;
    visao?: 'corretor' | 'gestor';
    compacto?: boolean;
}

export const TIPOS_EVENTO: Record<TipoEvento, { label: string; cor: string }> = {
    PLANTAO: { label: 'Plantão', cor: 'text-indigo-600' },
    LANCAMENTO: { label: 'Lançamento', cor: 'text-emerald-600' },
    TREINAMENTO: { label: 'Treinamento', cor: 'text-purple-600' },
    VISITA_OBRA: { label: 'Visita à obra', cor: 'text-amber-600' },
    NETWORKING: { label: 'Networking', cor: 'text-blue-600' },
    OUTRO: { label: 'Outro', cor: 'text-gray-600' },
};

const ATIVAS = ['CONFIRMADA', 'PRESENTE'];

/** Situação mostrada: cancelado/encerrado gravados; lotado e passado CALCULADOS. */
export const situacaoDoEvento = (e: Pick<Evento, 'status' | 'date' | 'end_date' | 'max_capacity' | 'inscritos'>, agora = Date.now()) => {
    if (e.status === 'CANCELADO') return { id: 'CANCELADO', label: 'Cancelado', cor: 'text-red-600' };
    if (e.status === 'ENCERRADO' || new Date(e.end_date || e.date).getTime() < agora) return { id: 'PASSADO', label: 'Já aconteceu', cor: 'text-gray-500' };
    if (e.max_capacity && e.inscritos >= e.max_capacity) return { id: 'LOTADO', label: 'Lotado', cor: 'text-red-600' };
    return { id: 'ABERTO', label: 'Inscrições abertas', cor: 'text-emerald-600' };
};

const quando = (d: string) => new Date(d).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
/** ISO → valor do <input type="datetime-local"> no fuso do navegador. */
const paraInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const z = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};

const VAZIO = { id: '', title: '', type: 'PLANTAO' as TipoEvento, date: '', end_date: '', location: '', max_capacity: '', description: '' };

const msg = (e: unknown) => (e as { message?: string })?.message || 'Não foi possível concluir. Tente de novo.';

const BrokerEvents: React.FC<BrokerEventsProps> = ({ brokerEmail, portalToken, organizationId, visao = 'corretor', compacto = false }) => {
    const ehGestor = visao === 'gestor' && !portalToken;
    const podeInscrever = !!portalToken;
    const confirm = useConfirm();

    const [eventos, setEventos] = useState<Evento[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'proximos' | 'inscritos' | 'passados'>('proximos');
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [form, setForm] = useState<typeof VAZIO | null>(null);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [abertoId, setAbertoId] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setErro(null);
        try {
            if (portalToken) {
                setEventos(await brokerPortalService.getEventosByToken(portalToken) as Evento[]);
            } else if (organizationId) {
                const email = (brokerEmail || '').toLowerCase();
                const lista = await brokerService.listEventos(organizationId);
                setEventos((lista as Evento[]).map(e => ({
                    ...e,
                    inscritos: (e.inscricoes || []).filter(i => ATIVAS.includes(i.status)).length,
                    minha_inscricao: (e.inscricoes || []).find(i => i.broker_email.toLowerCase() === email)?.status ?? null,
                })));
            } else {
                setEventos([]);
            }
        } catch (e) {
            console.error('[BrokerEvents]', e);
            setErro('Não foi possível carregar a agenda agora.');
        } finally {
            setCarregando(false);
        }
    }, [portalToken, organizationId, brokerEmail]);

    useEffect(() => { setCarregando(true); carregar(); }, [carregar]);

    const visiveis = useMemo(() => {
        const agora = Date.now();
        return eventos.filter(e => {
            const passou = new Date(e.end_date || e.date).getTime() < agora;
            if (filtro === 'passados') return passou;
            if (filtro === 'inscritos') return !ehGestor && e.minha_inscricao && ATIVAS.includes(e.minha_inscricao);
            return !passou && (ehGestor || e.status !== 'CANCELADO');
        }).sort((a, b) => filtro === 'passados' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    }, [eventos, filtro, ehGestor]);

    const alternar = async (ev: Evento) => {
        if (!portalToken) return;
        setOcupado(ev.id); setAviso(null);
        try {
            const inscrito = ev.minha_inscricao && ATIVAS.includes(ev.minha_inscricao);
            if (inscrito) await brokerPortalService.cancelarInscricaoByToken(portalToken, ev.id);
            else await brokerPortalService.inscreverEventoByToken(portalToken, ev.id);
            await carregar();
        } catch (e) {
            setAviso(msg(e));
            await carregar();
        } finally {
            setOcupado(null);
        }
    };

    const salvar = async () => {
        if (!form || !organizationId) return;
        setErroForm(null);
        if (!form.title.trim() || !form.date) { setErroForm('Informe o título e a data do evento.'); return; }
        if (form.end_date && new Date(form.end_date) < new Date(form.date)) { setErroForm('O término é antes do início.'); return; }
        setOcupado('form');
        try {
            await brokerService.salvarEvento({
                id: form.id || undefined,
                organization_id: organizationId,
                title: form.title.trim(),
                type: form.type,
                date: new Date(form.date).toISOString(),
                end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
                location: form.location.trim() || null,
                max_capacity: form.max_capacity ? Math.max(1, Number(form.max_capacity)) : null,
                description: form.description.trim() || null,
                ...(form.id ? {} : { status: 'ABERTO' }),
            });
            setForm(null);
            await carregar();
        } catch (e) {
            setErroForm(msg(e));
        } finally {
            setOcupado(null);
        }
    };

    const cancelarEvento = async (ev: Evento) => {
        const ok = await confirm({
            title: 'Cancelar evento?',
            message: `"${ev.title}" fica marcado como cancelado para todos os corretores${ev.inscritos ? ` (${ev.inscritos} inscrito${ev.inscritos > 1 ? 's' : ''})` : ''}.`,
            variant: 'danger',
            confirmLabel: 'Cancelar evento',
            cancelLabel: 'Voltar',
        });
        if (!ok) return;
        try {
            await brokerService.cancelarEvento(ev.id);
            setAbertoId(null);
            await carregar();
        } catch (e) {
            setAviso(msg(e));
        }
    };

    const aberto = eventos.find(e => e.id === abertoId) || null;
    const FILTROS = ehGestor
        ? [{ id: 'proximos' as const, label: 'Próximos' }, { id: 'passados' as const, label: 'Passados' }]
        : [{ id: 'proximos' as const, label: 'Próximos' }, { id: 'inscritos' as const, label: 'Minhas inscrições' }, { id: 'passados' as const, label: 'Passados' }];

    return (
        <div className={compacto ? 'space-y-4' : 'space-y-6'}>
            <div className="flex items-center justify-between gap-2">
                <div className={`flex bg-gray-100 rounded-xl p-1 ${compacto ? 'flex-1' : ''}`} role="group" aria-label="Filtrar eventos">
                    {FILTROS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFiltro(f.id)}
                            aria-pressed={filtro === f.id}
                            className={`${compacto ? 'flex-1' : ''} px-3 h-8 rounded-lg text-sm font-medium whitespace-nowrap ${filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {ehGestor && organizationId && (
                    <button
                        type="button"
                        onClick={() => { setErroForm(null); setForm({ ...VAZIO }); }}
                        className="shrink-0 h-10 px-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4" /> Novo evento
                    </button>
                )}
            </div>

            {aviso && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{aviso}</p>}

            {carregando ? (
                <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" /></div>
            ) : erro ? (
                <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">{erro}</p>
            ) : visiveis.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 text-center px-6 py-12">
                    <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-600">
                        {filtro === 'inscritos' ? 'Você não está inscrito em nenhum evento.' : filtro === 'passados' ? 'Nenhum evento nos últimos 60 dias.' : ehGestor ? 'Nenhum evento marcado. Crie o primeiro.' : 'Nenhum evento marcado pela incorporadora.'}
                    </p>
                </div>
            ) : (
                <ul className={compacto ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'} data-tour="agenda-lista">
                    {visiveis.map(ev => {
                        const tipo = TIPOS_EVENTO[ev.type] || TIPOS_EVENTO.OUTRO;
                        const sit = situacaoDoEvento(ev);
                        const inscrito = !!ev.minha_inscricao && ATIVAS.includes(ev.minha_inscricao);
                        const pct = ev.max_capacity ? Math.min(100, (ev.inscritos / ev.max_capacity) * 100) : 0;
                        const podeAgir = podeInscrever && (sit.id === 'ABERTO' || (sit.id === 'LOTADO' && inscrito));
                        return (
                            <li key={ev.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${inscrito ? 'border-indigo-200' : 'border-gray-100'} ${sit.id === 'PASSADO' || sit.id === 'CANCELADO' ? 'opacity-75' : ''}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <span className={`text-xs font-semibold ${tipo.cor}`}>{tipo.label}</span>
                                    <span className={`text-xs ${sit.cor}`}>{sit.label}</span>
                                </div>
                                <p className="text-base font-bold text-gray-900 mt-1">{ev.title}</p>
                                {ev.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ev.description}</p>}
                                <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                                    <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400 shrink-0" />{quando(ev.date)}{ev.end_date ? ` até ${new Date(ev.end_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                                    {ev.location && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400 shrink-0" /><span className="truncate">{ev.location}</span></p>}
                                    <p className="flex items-center gap-2"><Users className="w-4 h-4 text-gray-400 shrink-0" />{ev.max_capacity ? `${ev.inscritos} de ${ev.max_capacity} vagas` : `${ev.inscritos} inscrito${ev.inscritos === 1 ? '' : 's'}`}</p>
                                    {ev.max_capacity ? (
                                        <div className="bg-gray-100 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
                                    ) : null}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                    {ehGestor ? (
                                        <>
                                            <button type="button" onClick={() => setAbertoId(ev.id)} className="text-sm text-indigo-600 font-medium hover:underline">
                                                Ver inscritos ({ev.inscritos})
                                            </button>
                                            {ev.status !== 'CANCELADO' && sit.id !== 'PASSADO' && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setErroForm(null); setForm({ id: ev.id, title: ev.title, type: ev.type, date: paraInput(ev.date), end_date: paraInput(ev.end_date), location: ev.location || '', max_capacity: ev.max_capacity ? String(ev.max_capacity) : '', description: ev.description || '' }); }}
                                                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    <Pencil className="w-4 h-4" /> Editar
                                                </button>
                                            )}
                                        </>
                                    ) : inscrito ? (
                                        <>
                                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><CheckCircle2 className="w-4 h-4" />Inscrito</span>
                                            {podeAgir && (
                                                <button type="button" disabled={ocupado === ev.id} onClick={() => alternar(ev)} className="text-sm text-red-600 font-medium disabled:opacity-50">
                                                    Cancelar inscrição
                                                </button>
                                            )}
                                        </>
                                    ) : podeInscrever ? (
                                        <button
                                            type="button"
                                            disabled={!podeAgir || ocupado === ev.id}
                                            onClick={() => alternar(ev)}
                                            title={!podeAgir ? sit.label : undefined}
                                            className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-500"
                                        >
                                            {ocupado === ev.id ? 'Inscrevendo…' : sit.id === 'ABERTO' ? 'Inscrever-me' : sit.label}
                                        </button>
                                    ) : (
                                        <span className="text-sm text-gray-400">{sit.label}</span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Gestor: inscritos de um evento */}
            <Sheet open={!!aberto && ehGestor} onClose={() => setAbertoId(null)} size="lg">
                {aberto && (
                    <>
                        <SheetHeader onClose={() => setAbertoId(null)}>
                            <SheetTitle>{aberto.title}</SheetTitle>
                            <SheetDescription>{quando(aberto.date)}{aberto.location ? ` · ${aberto.location}` : ''}</SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-4 py-5 md:px-6">
                            {(aberto.inscricoes || []).filter(i => ATIVAS.includes(i.status)).length === 0 ? (
                                <p className="text-sm text-gray-500">Nenhum corretor inscrito ainda.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {(aberto.inscricoes || []).filter(i => ATIVAS.includes(i.status)).map(i => (
                                        <li key={i.id} className="py-2.5 flex items-center justify-between gap-3">
                                            <span className="text-sm text-gray-800 truncate">{i.broker_email}</span>
                                            <span className="text-xs text-emerald-600">{i.status === 'PRESENTE' ? 'Presente' : 'Confirmada'}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SheetPanel>
                        {aberto.status !== 'CANCELADO' && situacaoDoEvento(aberto).id !== 'PASSADO' && (
                            <SheetFooter>
                                <button type="button" onClick={() => cancelarEvento(aberto)} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50">
                                    <X className="w-4 h-4" /> Cancelar evento
                                </button>
                            </SheetFooter>
                        )}
                    </>
                )}
            </Sheet>

            {/* Gestor: criar / editar evento */}
            <Sheet open={!!form} onClose={() => setForm(null)} size="lg">
                {form && (
                    <>
                        <SheetHeader onClose={() => setForm(null)}>
                            <SheetTitle>{form.id ? 'Editar evento' : 'Novo evento'}</SheetTitle>
                            <SheetDescription>Os corretores da organização veem o evento na Agenda do portal e podem se inscrever.</SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-4 py-5 md:px-6 space-y-3">
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Título *</span>
                                <input value={form.title} onChange={e => setForm(f => f && ({ ...f, title: e.target.value }))} placeholder="Ex.: Plantão de vendas — fim de semana"
                                    className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Tipo</span>
                                <select value={form.type} onChange={e => setForm(f => f && ({ ...f, type: e.target.value as TipoEvento }))} className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white">
                                    {Object.entries(TIPOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-500">Início *</span>
                                    <input type="datetime-local" value={form.date} onChange={e => setForm(f => f && ({ ...f, date: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-500">Término</span>
                                    <input type="datetime-local" value={form.end_date} onChange={e => setForm(f => f && ({ ...f, end_date: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Local</span>
                                <input value={form.location} onChange={e => setForm(f => f && ({ ...f, location: e.target.value }))} placeholder="Ex.: Stand de vendas — Rua…"
                                    className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Vagas</span>
                                <input type="number" min={1} value={form.max_capacity} onChange={e => setForm(f => f && ({ ...f, max_capacity: e.target.value }))} placeholder="Em branco = sem limite"
                                    className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Descrição</span>
                                <textarea value={form.description} onChange={e => setForm(f => f && ({ ...f, description: e.target.value }))} rows={3} className="mt-1 w-full p-3 rounded-xl border border-gray-200 text-sm" />
                            </label>
                            {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}
                        </SheetPanel>
                        <SheetFooter>
                            <button type="button" onClick={() => setForm(null)} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                            <button
                                type="button"
                                onClick={salvar}
                                disabled={ocupado === 'form' || !form.title.trim() || !form.date}
                                title={!form.title.trim() || !form.date ? 'Informe o título e o início' : undefined}
                                className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                            >
                                {ocupado === 'form' ? 'Salvando…' : form.id ? 'Salvar' : 'Criar evento'}
                            </button>
                        </SheetFooter>
                    </>
                )}
            </Sheet>
        </div>
    );
};

export default BrokerEvents;
