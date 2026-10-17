import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { avisarAcaoDoPortal } from '../../utils/portalEventos';
import { Plus, Phone, Mail, MessageSquare, Calendar, Search, Clock, FileText, StickyNote, Loader2, Pencil, Users, Shield } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { brokerPortalService } from '../../services/brokerPortalService';
import { brokerService } from '../../services/brokerService';

/**
 * Leads do Portal do Corretor — dado REAL desde 17/10/2026 (antes, gerador fixo).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F3, decisão P4).
 *
 * O funil é do corretor: ele cria, edita, muda de etapa e registra contatos, tudo
 * pelas RPCs do token (fn_broker_portal_lead_*), presas a ele. O gestor (visão
 * interna) vê os leads da organização só para leitura, com o corretor de cada um.
 * Sem token e na visão do corretor (prévia do gestor), mostra os leads daquele
 * corretor sem permitir gravar — a prévia não escreve em nome dele.
 *
 * Vocabulário = CHECKs de `broker_portal_leads` / `_lead_interactions`.
 */

type Etapa = 'LEAD' | 'VISITA' | 'PROPOSTA' | 'NEGOCIACAO' | 'VENDA' | 'PERDIDO';

interface Interacao { id: string; type: string; description: string; created_by?: string | null; created_at: string }
interface Lead {
    id: string;
    broker_email: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    cpf?: string | null;
    income?: number | null;
    origin?: string | null;
    stage: Etapa;
    interest?: string | null;
    notes?: string | null;
    protection_until?: string | null;
    created_at: string;
    updated_at?: string | null;
    interacoes?: Interacao[];
}

interface BrokerLeadManagerProps {
    brokerEmail: string;
    portalToken?: string;
    organizationId?: string;
    visao?: 'corretor' | 'gestor';
    compacto?: boolean;
}

export const ETAPAS: { id: Etapa; label: string; cor: string }[] = [
    { id: 'LEAD', label: 'Lead', cor: 'text-gray-600' },
    { id: 'VISITA', label: 'Visita', cor: 'text-blue-600' },
    { id: 'PROPOSTA', label: 'Proposta', cor: 'text-amber-600' },
    { id: 'NEGOCIACAO', label: 'Negociação', cor: 'text-purple-600' },
    { id: 'VENDA', label: 'Venda', cor: 'text-emerald-600' },
    { id: 'PERDIDO', label: 'Perdido', cor: 'text-red-600' },
];
const ETAPA_BY_ID = Object.fromEntries(ETAPAS.map(e => [e.id, e])) as Record<Etapa, typeof ETAPAS[number]>;

export const ORIGENS: Record<string, string> = {
    DIRETO: 'Contato direto', SITE: 'Site', INDICACAO: 'Indicação', PLANTAO: 'Plantão', REDES_SOCIAIS: 'Redes sociais', OUTRO: 'Outro',
};

const TIPOS_CONTATO: { id: string; label: string; icon: React.ElementType }[] = [
    { id: 'LIGACAO', label: 'Ligação', icon: Phone },
    { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
    { id: 'VISITA', label: 'Visita', icon: Calendar },
    { id: 'EMAIL', label: 'E-mail', icon: Mail },
    { id: 'PROPOSTA', label: 'Proposta', icon: FileText },
    { id: 'NOTE', label: 'Anotação', icon: StickyNote },
];
const ICONE_CONTATO = Object.fromEntries(TIPOS_CONTATO.map(t => [t.id, t.icon])) as Record<string, React.ElementType>;

const VAZIO = { id: '', name: '', phone: '', email: '', origin: 'DIRETO', interest: '', notes: '' };

const msgErro = (e: unknown) => {
    const m = (e as { message?: string })?.message || '';
    if (/23514/.test(String((e as { code?: string })?.code)) || /check constraint/i.test(m)) return 'Valor não aceito pelo sistema.';
    return m || 'Não foi possível salvar. Tente de novo.';
};

const soDigitos = (s?: string | null) => (s || '').replace(/\D/g, '');
const dataCurta = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const BrokerLeadManager: React.FC<BrokerLeadManagerProps> = ({ brokerEmail, portalToken, organizationId, visao = 'corretor', compacto = false }) => {
    const ehGestor = visao === 'gestor' && !portalToken;
    // Só quem entra pelo link grava (as RPCs exigem o token do corretor).
    const podeEditar = !!portalToken;

    const [leads, setLeads] = useState<Lead[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState<string | null>(null);
    const [busca, setBusca] = usePersistedState<string>('brokerLeads:busca', '');
    const [filtro, setFiltro] = useState<Etapa | 'all'>('all');
    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [form, setForm] = useState<typeof VAZIO | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [contato, setContato] = useState({ tipo: 'LIGACAO', texto: '' });

    const carregar = useCallback(async () => {
        setErroCarga(null);
        try {
            const dados = portalToken
                ? await brokerPortalService.getLeadsByToken(portalToken)
                : organizationId
                    ? await brokerService.listLeadsDaOrganizacao(organizationId, ehGestor ? undefined : brokerEmail)
                    : [];
            setLeads((dados as Lead[]).map(l => ({
                ...l,
                interacoes: [...(l.interacoes || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
            })));
        } catch (e) {
            console.error('[BrokerLeadManager]', e);
            setErroCarga('Não foi possível carregar os leads agora.');
        } finally {
            setCarregando(false);
        }
    }, [portalToken, organizationId, ehGestor, brokerEmail]);

    useEffect(() => { setCarregando(true); carregar(); }, [carregar]);

    const contagem = useMemo(() => {
        const c: Record<string, number> = {};
        leads.forEach(l => { c[l.stage] = (c[l.stage] || 0) + 1; });
        return c;
    }, [leads]);

    const visiveis = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return leads.filter(l =>
            (filtro === 'all' || l.stage === filtro) &&
            (!q || l.name.toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q)
                || soDigitos(l.phone).includes(soDigitos(q)) && soDigitos(q).length > 0
                || (ehGestor && l.broker_email.toLowerCase().includes(q))));
    }, [leads, busca, filtro, ehGestor]);

    const aberto = leads.find(l => l.id === abertoId) || null;

    const salvarForm = async () => {
        if (!portalToken || !form) return;
        setSalvando(true); setErroForm(null);
        try {
            const novo = !form.id;
            const r = await brokerPortalService.salvarLeadByToken(portalToken, { ...form, id: form.id || null });
            await carregar();
            setForm(null);
            if (novo) { avisarAcaoDoPortal('criou-lead'); setAbertoId((r as Lead)?.id ?? null); }
        } catch (e) {
            setErroForm(msgErro(e));
        } finally {
            setSalvando(false);
        }
    };

    const mudarEtapa = async (etapa: Etapa) => {
        if (!portalToken || !aberto || aberto.stage === etapa) return;
        setSalvando(true); setErroForm(null);
        try {
            await brokerPortalService.etapaLeadByToken(portalToken, aberto.id, etapa);
            await carregar();
        } catch (e) {
            setErroForm(msgErro(e));
        } finally {
            setSalvando(false);
        }
    };

    const registrarContato = async () => {
        if (!portalToken || !aberto || !contato.texto.trim()) return;
        setSalvando(true); setErroForm(null);
        try {
            await brokerPortalService.interacaoLeadByToken(portalToken, aberto.id, contato.tipo, contato.texto.trim());
            setContato(c => ({ ...c, texto: '' }));
            await carregar();
        } catch (e) {
            setErroForm(msgErro(e));
        } finally {
            setSalvando(false);
        }
    };

    const diasDeProtecao = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

    return (
        <div className={compacto ? 'space-y-4' : 'space-y-6'}>
            {/* Busca + novo */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        data-tour="leads-busca"
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder={ehGestor ? 'Buscar lead ou corretor…' : 'Buscar lead…'}
                        className="w-full h-10 pl-10 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                </div>
                {podeEditar && (
                    <button
                        type="button"
                        data-tour="leads-novo"
                        onClick={() => { setErroForm(null); setForm({ ...VAZIO }); }}
                        className="shrink-0 h-10 px-4 flex items-center gap-1.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold active:bg-indigo-700 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4" /> Novo lead
                    </button>
                )}
            </div>

            {/* Etapas = filtro (faixa rolável no celular) */}
            <div className={compacto ? 'flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide' : 'flex flex-wrap gap-2'} role="group" aria-label="Filtrar por etapa">
                {[{ id: 'all' as const, label: 'Todos', cor: 'text-gray-700' }, ...ETAPAS].map(e => {
                    const n = e.id === 'all' ? leads.length : (contagem[e.id] || 0);
                    const ativo = filtro === e.id;
                    return (
                        <button
                            key={e.id}
                            type="button"
                            onClick={() => setFiltro(e.id as Etapa | 'all')}
                            aria-pressed={ativo}
                            className={`shrink-0 whitespace-nowrap h-8 px-3 rounded-xl border text-sm ${ativo ? 'bg-gray-900 text-white border-gray-900' : `bg-white border-gray-200 ${e.cor}`}`}
                        >
                            {e.label} ({n})
                        </button>
                    );
                })}
            </div>

            {carregando ? (
                <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" /></div>
            ) : erroCarga ? (
                <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">{erroCarga}</p>
            ) : visiveis.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 text-center px-6 py-12">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-600">
                        {leads.length === 0 ? (ehGestor ? 'Nenhum corretor cadastrou leads ainda.' : 'Nenhum lead ainda.') : 'Nenhum lead com esse filtro.'}
                    </p>
                    {leads.length === 0 && podeEditar && <p className="text-xs text-gray-400 mt-1">Cadastre os interessados que você atende para acompanhar cada um até a venda.</p>}
                </div>
            ) : (
                <ul className={compacto ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'} data-tour="leads-lista">
                    {visiveis.map(l => {
                        const et = ETAPA_BY_ID[l.stage] || ETAPAS[0];
                        const ultimo = l.interacoes?.[0];
                        const dias = diasDeProtecao(l.protection_until);
                        return (
                            <li key={l.id}>
                                <button
                                    type="button"
                                    onClick={() => { setErroForm(null); setAbertoId(l.id); }}
                                    className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-indigo-200 active:bg-gray-50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-bold text-gray-900 truncate">{l.name}</p>
                                        <span className={`text-sm shrink-0 ${et.cor}`}>{et.label}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                                        {[l.interest, l.origin ? ORIGENS[l.origin] || l.origin : null].filter(Boolean).join(' · ') || 'Sem interesse informado'}
                                    </p>
                                    {ehGestor && <p className="text-xs text-indigo-600 mt-1 truncate">{l.broker_email}</p>}
                                    <div className="flex items-center justify-between gap-2 mt-2 text-xs text-gray-400">
                                        <span className="truncate">{ultimo ? `Último contato: ${dataCurta(ultimo.created_at)}` : `Cadastrado em ${dataCurta(l.created_at)}`}</span>
                                        {dias !== null && (
                                            <span className={`inline-flex items-center gap-1 shrink-0 ${dias < 15 ? 'text-red-600' : 'text-emerald-600'}`} title="Dias de proteção do lead">
                                                <Shield className="w-3 h-3" />{dias}d
                                            </span>
                                        )}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Ficha do lead */}
            <Sheet open={!!aberto && !form} onClose={() => setAbertoId(null)} size="xl">
                {aberto && (
                    <>
                        <SheetHeader onClose={() => setAbertoId(null)}>
                            <SheetTitle>{aberto.name}</SheetTitle>
                            <SheetDescription>
                                {[aberto.interest, aberto.origin ? ORIGENS[aberto.origin] || aberto.origin : null, ehGestor ? aberto.broker_email : null].filter(Boolean).join(' · ') || 'Lead'}
                            </SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-4 py-5 md:px-6 space-y-5">
                            {/* Atalhos de contato */}
                            {(aberto.phone || aberto.email) && (
                                <div className="flex flex-wrap gap-2">
                                    {aberto.phone && (
                                        <a href={`tel:${soDigitos(aberto.phone)}`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
                                            <Phone className="w-4 h-4" /> {aberto.phone}
                                        </a>
                                    )}
                                    {aberto.phone && (
                                        <a href={`https://wa.me/55${soDigitos(aberto.phone).replace(/^55/, '')}`} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
                                            <MessageSquare className="w-4 h-4" /> WhatsApp
                                        </a>
                                    )}
                                    {aberto.email && (
                                        <a href={`mailto:${aberto.email}`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 max-w-full">
                                            <Mail className="w-4 h-4 shrink-0" /> <span className="truncate">{aberto.email}</span>
                                        </a>
                                    )}
                                </div>
                            )}

                            {/* Etapa */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2">Etapa</p>
                                {podeEditar ? (
                                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Etapa do lead">
                                        {ETAPAS.map(e => (
                                            <button
                                                key={e.id}
                                                type="button"
                                                disabled={salvando}
                                                onClick={() => mudarEtapa(e.id)}
                                                aria-pressed={aberto.stage === e.id}
                                                className={`h-9 rounded-xl border text-sm ${aberto.stage === e.id ? 'bg-indigo-600 border-indigo-600 text-white' : `bg-white border-gray-200 ${e.cor}`} disabled:opacity-60`}
                                            >
                                                {e.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-sm ${ETAPA_BY_ID[aberto.stage]?.cor}`}>{ETAPA_BY_ID[aberto.stage]?.label}</p>
                                )}
                            </div>

                            {aberto.notes && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-1">Observações</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-line">{aberto.notes}</p>
                                </div>
                            )}

                            {/* Registrar contato */}
                            {podeEditar && (
                                <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
                                    <p className="text-xs font-semibold text-gray-500">Registrar contato</p>
                                    <select
                                        value={contato.tipo}
                                        onChange={e => setContato(c => ({ ...c, tipo: e.target.value }))}
                                        aria-label="Tipo de contato"
                                        className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm"
                                    >
                                        {TIPOS_CONTATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <textarea
                                        value={contato.texto}
                                        onChange={e => setContato(c => ({ ...c, texto: e.target.value }))}
                                        rows={2}
                                        placeholder="O que foi conversado"
                                        aria-label="Descrição do contato"
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={registrarContato}
                                        disabled={salvando || !contato.texto.trim()}
                                        title={!contato.texto.trim() ? 'Escreva o que foi conversado' : undefined}
                                        className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                                    >
                                        Registrar
                                    </button>
                                </div>
                            )}

                            {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}

                            {/* Histórico */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2">Histórico</p>
                                {(aberto.interacoes || []).length === 0 ? (
                                    <p className="text-sm text-gray-400">Nenhum contato registrado.</p>
                                ) : (
                                    <ol className="space-y-3">
                                        {(aberto.interacoes || []).map(i => {
                                            const Icon = ICONE_CONTATO[i.type] || Clock;
                                            return (
                                                <li key={i.id} className="flex items-start gap-3">
                                                    <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                                                    <span className="min-w-0">
                                                        <span className="block text-sm text-gray-800">{i.description}</span>
                                                        <span className="block text-xs text-gray-400 mt-0.5">{new Date(i.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}
                            </div>
                        </SheetPanel>
                        {podeEditar && (
                            <SheetFooter>
                                <button
                                    type="button"
                                    onClick={() => { setErroForm(null); setForm({ id: aberto.id, name: aberto.name, phone: aberto.phone || '', email: aberto.email || '', origin: aberto.origin || 'DIRETO', interest: aberto.interest || '', notes: aberto.notes || '' }); }}
                                    className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Pencil className="w-4 h-4" /> Editar dados
                                </button>
                            </SheetFooter>
                        )}
                    </>
                )}
            </Sheet>

            {/* Cadastro / edição */}
            <Sheet open={!!form} onClose={() => setForm(null)} size="lg" dirty={!!form && !!form.name && !form.id}>
                {form && (
                    <>
                        <SheetHeader onClose={() => setForm(null)}>
                            <SheetTitle>{form.id ? 'Editar lead' : 'Novo lead'}</SheetTitle>
                            <SheetDescription>Só você e a incorporadora veem os seus leads.</SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-4 py-5 md:px-6 space-y-3">
                            {([
                                ['name', 'Nome *', 'Nome completo', 'text'],
                                ['phone', 'Telefone', '(00) 00000-0000', 'tel'],
                                ['email', 'E-mail', 'email@exemplo.com', 'email'],
                                ['interest', 'Interesse', 'Ex.: 3 dormitórios, Torre A', 'text'],
                            ] as const).map(([campo, rotulo, ph, tipo]) => (
                                <label key={campo} className="block">
                                    <span className="text-xs font-semibold text-gray-500">{rotulo}</span>
                                    <input
                                        type={tipo}
                                        value={form[campo]}
                                        onChange={e => setForm(f => f && ({ ...f, [campo]: e.target.value }))}
                                        placeholder={ph}
                                        className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </label>
                            ))}
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Origem</span>
                                <select
                                    value={form.origin}
                                    onChange={e => setForm(f => f && ({ ...f, origin: e.target.value }))}
                                    className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white"
                                >
                                    {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500">Observações</span>
                                <textarea
                                    value={form.notes}
                                    onChange={e => setForm(f => f && ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    className="mt-1 w-full p-3 rounded-xl border border-gray-200 text-sm"
                                />
                            </label>
                            {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}
                        </SheetPanel>
                        <SheetFooter>
                            <button type="button" onClick={() => setForm(null)} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                            <button
                                type="button"
                                onClick={salvarForm}
                                disabled={salvando || !form.name.trim()}
                                title={!form.name.trim() ? 'Informe o nome do lead' : undefined}
                                className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                            >
                                {salvando ? 'Salvando…' : form.id ? 'Salvar' : 'Cadastrar'}
                            </button>
                        </SheetFooter>
                    </>
                )}
            </Sheet>
        </div>
    );
};

export default BrokerLeadManager;
