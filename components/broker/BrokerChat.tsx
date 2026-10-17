import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Pin, PinOff, ChevronLeft, ChevronDown, ChevronUp, Loader2, Building2 } from 'lucide-react';
import { brokerPortalService } from '../../services/brokerPortalService';
import { brokerService } from '../../services/brokerService';

/**
 * Chat do Portal do Corretor — dado REAL desde 17/10/2026 (antes, gerador fixo).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F5, decisão P2).
 *
 * Um canal por empreendimento: a incorporadora e os corretores HABILITADOS
 * naquele prédio (broker_property_access, a mesma régua do estoque). O corretor
 * vê só os canais dos prédios em que está habilitado; o gestor (visão interna)
 * vê os da organização, responde e fixa avisos. Sem token na visão do corretor
 * (prévia do gestor), só leitura. Atualiza sozinho a cada 15 s com a conversa
 * aberta (pelo link não há sessão para o tempo real do Supabase).
 */

interface Canal { building_id: string; nome: string; total: number; ultima?: { message: string; sender_type: string; sender_name?: string; created_at: string } | null }
interface Mensagem { id: string; sender_name?: string | null; sender_email?: string | null; sender_type: 'CORRETOR' | 'INCORPORADORA'; message: string; is_pinned: boolean; created_at: string }

interface BrokerChatProps {
    brokerEmail: string;
    portalToken?: string;
    organizationId?: string;
    visao?: 'corretor' | 'gestor';
    compacto?: boolean;
}

const INTERVALO_MS = 15000;

const hora = (d: string) => {
    const dt = new Date(d);
    const hoje = new Date().toDateString() === dt.toDateString();
    return hoje ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const BrokerChat: React.FC<BrokerChatProps> = ({ brokerEmail, portalToken, organizationId, visao = 'corretor', compacto = false }) => {
    const ehGestor = visao === 'gestor' && !portalToken;
    const podeEnviar = !!portalToken || ehGestor;
    const eu = (brokerEmail || '').toLowerCase();

    const [canais, setCanais] = useState<Canal[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [verFixadas, setVerFixadas] = useState(true);
    const fimRef = useRef<HTMLDivElement>(null);

    const carregarCanais = useCallback(async () => {
        try {
            const lista = portalToken
                ? await brokerPortalService.getChatCanaisByToken(portalToken)
                : organizationId ? await brokerService.chatGestorCanais(organizationId) : [];
            setCanais(lista as Canal[]);
            setErro(null);
            // Um canal só: abre direto (não faz sentido uma lista de um item).
            if ((lista as Canal[]).length === 1) setAberto(a => a ?? (lista as Canal[])[0].building_id);
        } catch (e) {
            console.error('[BrokerChat]', e);
            setErro('Não foi possível carregar o chat agora.');
        } finally {
            setCarregando(false);
        }
    }, [portalToken, organizationId]);

    const carregarMensagens = useCallback(async (building: string) => {
        try {
            const lista = portalToken
                ? await brokerPortalService.getChatMensagensByToken(portalToken, building)
                : await brokerService.chatGestorMensagens(building);
            setMensagens(lista as Mensagem[]);
        } catch (e) {
            console.error('[BrokerChat] mensagens', e);
            setAviso('Não foi possível atualizar as mensagens.');
        }
    }, [portalToken]);

    useEffect(() => { setCarregando(true); carregarCanais(); }, [carregarCanais]);

    useEffect(() => {
        if (!aberto) return;
        setMensagens([]);
        carregarMensagens(aberto);
        const t = setInterval(() => carregarMensagens(aberto), INTERVALO_MS);
        return () => clearInterval(t);
    }, [aberto, carregarMensagens]);

    useEffect(() => { fimRef.current?.scrollIntoView?.({ block: 'end' }); }, [mensagens.length]);

    const fixadas = useMemo(() => mensagens.filter(m => m.is_pinned), [mensagens]);
    const canalAberto = canais.find(c => c.building_id === aberto) || null;

    const enviar = async () => {
        const t = texto.trim();
        if (!aberto || !t) return;
        setEnviando(true); setAviso(null);
        try {
            if (portalToken) await brokerPortalService.enviarChatByToken(portalToken, aberto, t);
            else await brokerService.chatGestorEnviar(aberto, t);
            setTexto('');
            await carregarMensagens(aberto);
            carregarCanais();
        } catch (e) {
            setAviso((e as { message?: string })?.message || 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    };

    const fixar = async (m: Mensagem) => {
        try {
            await brokerService.chatGestorFixar(m.id, !m.is_pinned);
            if (aberto) await carregarMensagens(aberto);
        } catch (e) {
            setAviso((e as { message?: string })?.message || 'Não foi possível fixar.');
        }
    };

    if (carregando) return <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" /></div>;
    if (erro) return <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">{erro}</p>;

    if (canais.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 text-center px-6 py-12">
                <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-600">
                    {ehGestor ? 'Esta organização não tem empreendimentos no comercial.' : 'Você ainda não está habilitado em nenhum empreendimento.'}
                </p>
                {!ehGestor && <p className="text-xs text-gray-400 mt-1">Cada empreendimento em que a incorporadora habilitar você tem um canal aqui.</p>}
            </div>
        );
    }

    // ── Lista de canais ─────────────────────────────────────────────────────
    if (!canalAberto) {
        return (
            <ul className="space-y-2" data-tour="chat-canais">
                {canais.map(c => (
                    <li key={c.building_id}>
                        <button
                            type="button"
                            onClick={() => setAberto(c.building_id)}
                            className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-left hover:border-indigo-200 active:bg-gray-50"
                        >
                            <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-gray-900 truncate">{c.nome}</span>
                                <span className="block text-xs text-gray-500 truncate">
                                    {c.ultima ? `${c.ultima.sender_type === 'INCORPORADORA' ? 'Incorporadora' : (c.ultima.sender_name || 'Corretor')}: ${c.ultima.message}` : 'Nenhuma mensagem ainda'}
                                </span>
                            </span>
                            {c.ultima && <span className="text-xs text-gray-400 shrink-0">{hora(c.ultima.created_at)}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        );
    }

    // ── Conversa ────────────────────────────────────────────────────────────
    return (
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden ${compacto ? 'h-[calc(100dvh-220px)] min-h-[360px]' : 'h-[600px]'}`} data-tour="chat-conversa">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 shrink-0">
                {canais.length > 1 && (
                    <button type="button" onClick={() => setAberto(null)} aria-label="Voltar aos canais" className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{canalAberto.nome}</p>
                    <p className="text-xs text-gray-500">Incorporadora e corretores habilitados</p>
                </div>
            </div>

            {fixadas.length > 0 && (
                <div className="bg-amber-50 border-b border-amber-100 shrink-0">
                    <button type="button" onClick={() => setVerFixadas(v => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-amber-800" aria-expanded={verFixadas}>
                        <span className="flex items-center gap-1.5"><Pin className="w-3.5 h-3.5" />Fixadas ({fixadas.length})</span>
                        {verFixadas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {verFixadas && (
                        <ul className="px-3 pb-2 space-y-1.5 max-h-32 overflow-y-auto">
                            {fixadas.map(m => <li key={m.id} className="text-sm text-amber-900 bg-white/70 rounded-lg px-2.5 py-1.5">{m.message}</li>)}
                        </ul>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50/50">
                {mensagens.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Nenhuma mensagem ainda. {podeEnviar ? 'Escreva a primeira.' : ''}</p>
                ) : mensagens.map(m => {
                    const minha = portalToken ? (m.sender_email || '').toLowerCase() === eu : (ehGestor && m.sender_type === 'INCORPORADORA');
                    const daIncorporadora = m.sender_type === 'INCORPORADORA';
                    return (
                        <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] ${minha ? 'items-end' : 'items-start'} flex flex-col`}>
                                {!minha && <span className={`text-xs mb-0.5 ${daIncorporadora ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}>{daIncorporadora ? `${m.sender_name || 'Incorporadora'} · incorporadora` : (m.sender_name || 'Corretor')}</span>}
                                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${minha ? 'bg-indigo-600 text-white rounded-br-md' : daIncorporadora ? 'bg-indigo-50 text-indigo-950 border border-indigo-100 rounded-bl-md' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'}`}>
                                    {m.message}
                                </div>
                                <span className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
                                    {hora(m.created_at)}
                                    {m.is_pinned && <Pin className="w-3 h-3 text-amber-500" aria-label="Fixada" />}
                                    {ehGestor && (
                                        <button type="button" onClick={() => fixar(m)} className="p-0.5 rounded hover:text-amber-600" title={m.is_pinned ? 'Desafixar' : 'Fixar como aviso'} aria-label={m.is_pinned ? 'Desafixar mensagem' : 'Fixar mensagem'}>
                                            {m.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                        </button>
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={fimRef} />
            </div>

            {aviso && <p className="text-xs text-red-600 px-3 pt-2 shrink-0">{aviso}</p>}

            {podeEnviar ? (
                <div className="flex items-end gap-2 p-3 border-t border-gray-100 shrink-0" data-tour="chat-enviar">
                    <textarea
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !compacto) { e.preventDefault(); enviar(); } }}
                        rows={1}
                        maxLength={2000}
                        placeholder={ehGestor ? 'Responder como incorporadora…' : 'Escreva sua mensagem…'}
                        aria-label="Mensagem"
                        className="flex-1 min-w-0 max-h-32 px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                        type="button"
                        onClick={enviar}
                        disabled={enviando || !texto.trim()}
                        aria-label="Enviar mensagem"
                        title={!texto.trim() ? 'Escreva a mensagem' : 'Enviar'}
                        className="h-10 w-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40"
                    >
                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            ) : (
                <p className="text-xs text-gray-400 text-center p-3 border-t border-gray-100 shrink-0">Prévia: o corretor escreve por aqui.</p>
            )}
        </div>
    );
};

export default BrokerChat;
