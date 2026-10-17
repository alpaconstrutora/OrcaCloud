import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, ExternalLink, Loader2, Mail, UserPlus, Clock, CheckCircle2, Info } from 'lucide-react';
import { brokerPortalService } from '../../services/brokerPortalService';
import { brokerService } from '../../services/brokerService';
import { academyPortalUsersService } from '../../services/academyPortalUsersService';

/**
 * Treinamento do Portal do Corretor — pela ACADEMIA desde 17/10/2026 (antes, um
 * gerador fixo no componente). Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md
 * (F6, decisão P1: reusar a Academia).
 *
 * O corretor é aluno externo da Academia, como o terceirizado. O gestor libera o
 * acesso aqui (academy_portal_users_create, tipo TERCEIRO) e manda o convite; a
 * atribuição de cursos continua em Portais › Portal de Treinamentos. O corretor vê
 * os cursos atribuídos e abre a sala de aula no Portal de Treinamentos.
 */

interface Matricula {
    id: string;
    curso: string;
    nr_referencia?: string | null;
    status: string;
    percentual?: number | null;
    data_limite?: string | null;
    data_conclusao?: string | null;
    carga_horaria?: number | null;
}
interface Situacao {
    acesso: boolean;
    acesso_id?: string | null;
    bloqueado: boolean;
    convidado_em?: string | null;
    ultimo_acesso?: string | null;
    matriculas: Matricula[];
    email?: string;
}
interface CorretorBasico { name?: string | null; email?: string | null; phone?: string | null; cpf?: string | null; agency_name?: string | null }

interface BrokerTrainingProps {
    brokerEmail: string;
    portalToken?: string;
    organizationId?: string;
    visao?: 'corretor' | 'gestor';
    /** gestor: o corretor aberto (para liberar o acesso com nome/telefone/CPF dele) */
    corretor?: CorretorBasico | null;
    compacto?: boolean;
}

// Os mesmos rótulos do Portal de Treinamentos (training/portal/TraineeEnrollmentsTab).
export const STATUS_MATRICULA: Record<string, { label: string; cor: string }> = {
    NAO_INICIADO: { label: 'Não iniciado', cor: 'text-gray-600' },
    EM_ANDAMENTO: { label: 'Em andamento', cor: 'text-teal-700' },
    AGUARDANDO_AVALIACAO: { label: 'Aguardando avaliação', cor: 'text-amber-700' },
    REPROVADO: { label: 'Reprovado', cor: 'text-rose-700' },
    CONCLUIDO: { label: 'Concluído', cor: 'text-emerald-700' },
    EXPIRADO: { label: 'Prazo vencido', cor: 'text-rose-700' },
};

const data = (d?: string | null) => (d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '');
const msg = (e: unknown) => (e as { message?: string })?.message || 'Não foi possível concluir. Tente de novo.';

const Matriculas: React.FC<{ itens: Matricula[] }> = ({ itens }) => (
    <ul className="space-y-2">
        {itens.map(m => {
            const st = STATUS_MATRICULA[m.status] || { label: m.status, cor: 'text-gray-600' };
            const pct = Math.max(0, Math.min(100, Number(m.percentual) || 0));
            return (
                <li key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold text-gray-900">{m.curso}</p>
                        <span className={`text-xs shrink-0 ${st.cor}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {[m.nr_referencia, m.carga_horaria ? `${m.carga_horaria} h` : null,
                          m.status === 'CONCLUIDO' && m.data_conclusao ? `Concluído em ${data(m.data_conclusao)}` : m.data_limite ? `Prazo: ${data(m.data_limite)}` : null]
                          .filter(Boolean).join(' · ')}
                    </p>
                    {m.status !== 'CONCLUIDO' && (
                        <div className="mt-2 bg-gray-100 rounded-full h-1.5" title={`${pct}% concluído`}>
                            <div className="bg-teal-600 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                    )}
                </li>
            );
        })}
    </ul>
);

const BrokerTraining: React.FC<BrokerTrainingProps> = ({ brokerEmail, portalToken, organizationId, visao = 'corretor', corretor, compacto = false }) => {
    const ehGestor = visao === 'gestor' && !portalToken;
    // Gestor: SÓ o corretor aberto — sem ele, `brokerEmail` é o e-mail do próprio
    // administrador, e a tela ofereceria liberar treinamento para ele.
    const email = (portalToken ? '' : ehGestor ? (corretor?.email || '') : (corretor?.email || brokerEmail || '')).toLowerCase();

    const [sit, setSit] = useState<Situacao | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setErro(null);
        try {
            if (portalToken) setSit(await brokerPortalService.getTreinamentosByToken(portalToken));
            else if (organizationId && email) setSit(await brokerService.treinamentosDoCorretor(organizationId, email));
            else setSit(null);
        } catch (e) {
            console.error('[BrokerTraining]', e);
            setErro('Não foi possível carregar os treinamentos agora.');
        } finally {
            setCarregando(false);
        }
    }, [portalToken, organizationId, email]);

    useEffect(() => { setCarregando(true); carregar(); }, [carregar]);

    const liberar = async () => {
        if (!organizationId || !email) return;
        setOcupado(true); setAviso(null);
        try {
            await academyPortalUsersService.create({
                orgId: organizationId,
                tipo: 'TERCEIRO',
                name: corretor?.name || email,
                email,
                phone: corretor?.phone || undefined,
                cpf: corretor?.cpf || undefined,
                empresaTerceira: corretor?.agency_name || 'Corretor de imóveis',
                funcao: 'Corretor',
            });
            setAviso('Acesso liberado. Agora envie o convite para ele criar a senha.');
            await carregar();
        } catch (e) {
            setAviso(msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const convidar = async () => {
        if (!sit?.acesso_id) return;
        setOcupado(true); setAviso(null);
        try {
            const r = await academyPortalUsersService.invite(sit.acesso_id);
            setAviso(r.kind === 'recovery' ? `E-mail para redefinir a senha enviado para ${email}.` : `Convite enviado para ${email}.`);
            await carregar();
        } catch (e) {
            setAviso(msg(e));
        } finally {
            setOcupado(false);
        }
    };

    if (carregando) return <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-teal-600 mx-auto" /></div>;
    if (erro) return <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">{erro}</p>;

    const vazio = (titulo: string, texto?: string) => (
        <div className="bg-white rounded-2xl border border-gray-100 text-center px-6 py-12">
            <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600">{titulo}</p>
            {texto && <p className="text-xs text-gray-400 mt-1">{texto}</p>}
        </div>
    );

    // ── Gestor ──────────────────────────────────────────────────────────────
    if (ehGestor) {
        if (!email) return vazio('Abra o portal de um corretor para cuidar do treinamento dele.', 'Em Comercial › Corretores, escolha o corretor e volte a esta aba.');
        return (
            <div className={compacto ? 'space-y-4' : 'space-y-6'}>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3" data-tour="treinamento-acesso">
                    <div className="flex items-start gap-3">
                        <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><GraduationCap className="w-5 h-5" /></span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">Portal de Treinamentos</p>
                            <p className="text-xs text-gray-500 truncate">{email}</p>
                            <p className="text-xs mt-1">
                                {sit?.acesso
                                    ? <span className="text-emerald-700">Acesso liberado{sit.ultimo_acesso ? ` · último acesso em ${data(sit.ultimo_acesso)}` : sit.convidado_em ? ` · convite enviado em ${data(sit.convidado_em)}` : ' · convite ainda não enviado'}</span>
                                    : sit?.bloqueado
                                        ? <span className="text-rose-700">Acesso bloqueado — reative em Portais › Portal de Treinamentos</span>
                                        : <span className="text-gray-500">Ainda sem acesso aos treinamentos</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!sit?.acesso && !sit?.bloqueado && (
                            <button type="button" onClick={liberar} disabled={ocupado} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                                <UserPlus className="w-4 h-4" /> Liberar Portal de Treinamentos
                            </button>
                        )}
                        {sit?.acesso && (
                            <button type="button" onClick={convidar} disabled={ocupado} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                <Mail className="w-4 h-4" /> {sit.convidado_em ? 'Reenviar convite' : 'Enviar convite por e-mail'}
                            </button>
                        )}
                    </div>
                    {aviso && <p className="text-sm text-teal-800 bg-teal-50 rounded-xl px-3 py-2">{aviso}</p>}
                    <p className="text-xs text-gray-500 flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        Os cursos são atribuídos em Portais › Portal de Treinamentos › Atribuições — o corretor aparece lá como terceiro.
                    </p>
                </div>
                {sit?.acesso && (sit.matriculas.length ? <Matriculas itens={sit.matriculas} /> : vazio('Nenhum curso atribuído a este corretor ainda.'))}
            </div>
        );
    }

    // ── Corretor ────────────────────────────────────────────────────────────
    if (!sit?.acesso) {
        return sit?.bloqueado
            ? vazio('Seu acesso aos treinamentos está bloqueado.', 'Fale com a incorporadora.')
            : vazio('A incorporadora ainda não liberou treinamentos para você.', 'Quando liberar, você recebe um convite por e-mail e os cursos aparecem aqui.');
    }
    const meuEmail = sit.email || email;
    return (
        <div className={compacto ? 'space-y-4' : 'space-y-6'}>
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-teal-100">Seus treinamentos</p>
                        <p className="text-2xl font-black mt-1">
                            {sit.matriculas.filter(m => m.status === 'CONCLUIDO').length} de {sit.matriculas.length}
                            <span className="text-sm font-semibold text-teal-100"> concluídos</span>
                        </p>
                    </div>
                    <GraduationCap className="w-10 h-10 text-white/40 shrink-0" />
                </div>
                {portalToken ? (
                    <a
                        href={`${window.location.origin}/portal-treinamentos`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-white text-teal-800 text-sm font-semibold"
                    >
                        <ExternalLink className="w-4 h-4" /> Abrir sala de aula
                    </a>
                ) : (
                    <p className="mt-3 text-xs text-teal-100">Prévia: o corretor abre a sala de aula por aqui.</p>
                )}
                <p className="mt-3 text-xs text-teal-100 flex items-start gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Entre com {meuEmail} e a senha criada pelo convite. Não recebeu? Peça à incorporadora para reenviar.
                </p>
            </div>
            {sit.matriculas.length ? <Matriculas itens={sit.matriculas} /> : vazio('Nenhum curso atribuído ainda.', 'Quando a incorporadora atribuir um curso, ele aparece aqui.')}
            {sit.matriculas.some(m => m.status === 'CONCLUIDO') && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />Os certificados ficam no Portal de Treinamentos, aba Certificados.</p>
            )}
        </div>
    );
};

export default BrokerTraining;
