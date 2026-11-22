import React from 'react';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import ActionIconButton from '../ui/ActionIconButton';
import { cpfValido, formatarCpf } from '../../supabase/functions/assinatura-interna/regras';
import {
    candidatosParaAssinar, cpfDoUsuarioNoRh, envioDeAssinaturaService,
    type CandidatosParaAssinar, type ClienteCandidato, type OrigemDaAssinatura, type ResultadoDoEnvio, type SignatarioParaEnviar,
} from '../../services/assinaturaInternaService';

/**
 * Enviar um documento para a assinatura interna (sem certificado, sem custo por
 * documento). Compradores entram TODOS (mesmo peso); representante da empresa
 * (membro), corretor da negociação e até 2 testemunhas são opcionais.
 * Nome, e-mail e CPF de comprador/corretor/membro vêm do CADASTRO — aqui só se
 * mostra o que falta; o servidor confere de novo.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F4/F5).
 */

const inputCls = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const soDigitos = (v: string) => v.replace(/\D/g, '');
const emailOk = (v?: string | null) => !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** O que falta no cadastro do comprador para assinar — `null` quando está pronto. */
export function faltaNoComprador(c: ClienteCandidato): string | null {
    if (!emailOk(c.email)) return 'sem e-mail no cadastro';
    const doc = soDigitos(c.document ?? '');
    if (doc.length === 14) {
        if (!c.legal_rep_name?.trim()) return 'pessoa jurídica sem representante legal no cadastro';
        if (!cpfValido(c.legal_rep_document)) return 'CPF do representante legal inválido no cadastro';
        return null;
    }
    return cpfValido(doc) ? null : 'sem CPF válido no cadastro';
}

interface Testemunha { nome: string; email: string; cpf: string }

interface Props {
    aberto: boolean;
    onFechar: () => void;
    origem: OrigemDaAssinatura | null;
    /** Título que vai no e-mail e no manifesto. */
    titulo: string;
    organizationId: string;
    contractId?: string | null;
    dealId?: string | null;
    onEnviado: (r: ResultadoDoEnvio) => void;
}

export function EnviarParaAssinaturaSheet({ aberto, onFechar, origem, titulo, organizationId, contractId, dealId, onEnviado }: Props) {
    const [cand, setCand] = React.useState<CandidatosParaAssinar | null>(null);
    const [erroCarga, setErroCarga] = React.useState<string | null>(null);
    const [tituloEdit, setTituloEdit] = React.useState(titulo);
    const [representante, setRepresentante] = React.useState<string>('');
    const [cpfRepresentante, setCpfRepresentante] = React.useState('');
    const [cpfDoRh, setCpfDoRh] = React.useState<string | null>(null);
    const [comCorretor, setComCorretor] = React.useState(false);
    const [testemunhas, setTestemunhas] = React.useState<Testemunha[]>([]);
    const [enviando, setEnviando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!aberto) return;
        setCand(null); setErroCarga(null); setErro(null); setTestemunhas([]); setComCorretor(false);
        setTituloEdit(titulo);
        candidatosParaAssinar({ organizationId, contractId, dealId })
            .then(c => { setCand(c); setRepresentante(c.eu && c.membros.some(m => m.user_id === c.eu) ? c.eu : ''); })
            .catch(e => setErroCarga(e instanceof Error ? e.message : 'Não foi possível carregar os signatários.'));
    }, [aberto, organizationId, contractId, dealId, titulo]);

    React.useEffect(() => {
        setCpfDoRh(null); setCpfRepresentante('');
        if (!representante) return;
        void cpfDoUsuarioNoRh(representante).then(setCpfDoRh).catch(() => setCpfDoRh(null));
    }, [representante]);

    const compradores = cand?.compradores ?? [];
    const comFalta = compradores.map(c => ({ c, falta: faltaNoComprador(c) }));
    const corretorFalta = cand?.corretor
        ? (!emailOk(cand.corretor.email) ? 'sem e-mail no cadastro' : !cpfValido(cand.corretor.cpf) ? 'sem CPF válido no cadastro' : null)
        : null;

    const motivo = (): string | null => {
        if (!cand) return 'Carregando os signatários…';
        if (compradores.length === 0) return 'O documento não tem comprador/cliente vinculado.';
        const f = comFalta.find(x => x.falta);
        if (f) return `${f.c.name}: ${f.falta}. Corrija o cadastro do cliente.`;
        if (representante && !cpfDoRh && !cpfValido(cpfRepresentante)) return 'Informe o CPF do representante da empresa.';
        if (comCorretor && corretorFalta) return `Corretor ${corretorFalta}.`;
        for (const t of testemunhas) {
            if (!t.nome.trim()) return 'Informe o nome de cada testemunha.';
            if (!emailOk(t.email)) return `E-mail inválido para ${t.nome || 'a testemunha'}.`;
            if (!cpfValido(t.cpf)) return `CPF inválido para ${t.nome || 'a testemunha'}.`;
        }
        if (!tituloEdit.trim()) return 'Informe o título do documento.';
        return null;
    };
    const motivoDesligado = motivo();

    const enviar = async () => {
        if (!origem || motivoDesligado) return;
        const signatarios: SignatarioParaEnviar[] = [
            ...compradores.map(c => ({ canal: 'PORTAL_CLIENTE' as const, client_id: c.id })),
            ...(representante ? [{ canal: 'MEMBRO' as const, user_id: representante, ...(cpfDoRh ? {} : { cpf: soDigitos(cpfRepresentante) }) }] : []),
            ...(comCorretor && cand?.corretor ? [{ canal: 'PORTAL_CORRETOR' as const, broker_id: cand.corretor.id }] : []),
            ...testemunhas.map(t => ({ canal: 'LINK' as const, nome: t.nome.trim(), email: t.email.trim(), cpf: soDigitos(t.cpf) })),
        ];
        setEnviando(true);
        setErro(null);
        try {
            onEnviado(await envioDeAssinaturaService.criar(origem, signatarios, tituloEdit.trim()));
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    };

    const setTestemunha = (i: number, patch: Partial<Testemunha>) =>
        setTestemunhas(ts => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

    return (
        <Sheet open={aberto} onClose={onFechar} size="lg">
            <SheetHeader onClose={onFechar}>
                <SheetTitle>Enviar para assinatura no portal</SheetTitle>
                <SheetDescription>Assinatura eletrônica sem certificado: código por e-mail, CPF e aceite. Sem custo por documento.</SheetDescription>
            </SheetHeader>
            <SheetPanel>
                {erroCarga ? (
                    <p className="p-6 text-sm text-red-700">{erroCarga}</p>
                ) : !cand ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : (
                    <div className="p-6 space-y-8">
                        <div className="space-y-1.5">
                            <label htmlFor="assinatura-titulo" className="text-xs font-semibold text-slate-500">Título do documento</label>
                            <input id="assinatura-titulo" value={tituloEdit} onChange={e => setTituloEdit(e.target.value)} maxLength={200} className={inputCls} />
                            <p className="text-xs text-gray-500">Vai no e-mail de cada signatário e no manifesto de assinaturas.</p>
                        </div>

                        <div className="space-y-4">
                            <div className="border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Compradores</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Todos assinam, com o mesmo peso, pelo Portal do Cliente. Quem não tem acesso recebe pelo e-mail.</p>
                            </div>
                            {compradores.length === 0 ? (
                                <p className="text-sm text-gray-600">Nenhum comprador/cliente vinculado a este documento.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100">
                                    {comFalta.map(({ c, falta }) => (
                                        <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                                            <span className="min-w-0">
                                                <span className="block text-gray-900 truncate">
                                                    {soDigitos(c.document ?? '').length === 14 && c.legal_rep_name ? `${c.legal_rep_name} (por ${c.name})` : c.name}
                                                </span>
                                                <span className="block text-xs text-gray-500 truncate">{c.email || 'sem e-mail'}</span>
                                            </span>
                                            {falta ? <span className="text-red-700 text-right shrink-0">{falta}</span> : <span className="text-emerald-700 shrink-0">Pronto</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Pela empresa</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="assinatura-representante" className="text-xs font-semibold text-slate-500">Representante que assina</label>
                                    <select id="assinatura-representante" value={representante} onChange={e => setRepresentante(e.target.value)} className={inputCls}>
                                        <option value="">Ninguém da empresa assina</option>
                                        {cand.membros.map(m => (
                                            <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.user_id === cand.eu ? ' (você)' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                {representante && (
                                    <div className="space-y-1.5">
                                        <label htmlFor="assinatura-cpf-rep" className="text-xs font-semibold text-slate-500">CPF do representante</label>
                                        {cpfDoRh ? (
                                            <>
                                                <input id="assinatura-cpf-rep" value={formatarCpf(cpfDoRh)} readOnly className={`${inputCls} bg-gray-50`} />
                                                <p className="text-xs text-gray-500">Vem do cadastro no RH.</p>
                                            </>
                                        ) : (
                                            <input id="assinatura-cpf-rep" inputMode="numeric" value={cpfRepresentante} placeholder="000.000.000-00"
                                                onChange={e => setCpfRepresentante(soDigitos(e.target.value).slice(0, 11))} className={inputCls} />
                                        )}
                                    </div>
                                )}
                            </div>
                            {cand.corretor && (
                                <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={comCorretor} onChange={e => setComCorretor(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/30 shrink-0" />
                                    <span>
                                        O corretor {cand.corretor.name} também assina (pelo Portal do Corretor)
                                        {corretorFalta && <span className="block text-xs text-red-700">Corretor {corretorFalta}.</span>}
                                    </span>
                                </label>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">Testemunhas</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">Assinam por um link pessoal enviado ao e-mail, sem conta.</p>
                                </div>
                                <span title={testemunhas.length >= 2 ? 'No máximo 2 testemunhas.' : undefined}>
                                    <button type="button" onClick={() => setTestemunhas(ts => [...ts, { nome: '', email: '', cpf: '' }])}
                                        disabled={testemunhas.length >= 2}
                                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed">
                                        <Plus className="w-[15px] h-[15px]" /> Testemunha
                                    </button>
                                </span>
                            </div>
                            {testemunhas.map((t, i) => (
                                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_10rem_auto] gap-x-3 gap-y-2 items-end">
                                    <div className="space-y-1.5">
                                        <label htmlFor={`t-nome-${i}`} className="text-xs font-semibold text-slate-500">Nome</label>
                                        <input id={`t-nome-${i}`} value={t.nome} onChange={e => setTestemunha(i, { nome: e.target.value })} className={inputCls} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor={`t-email-${i}`} className="text-xs font-semibold text-slate-500">E-mail</label>
                                        <input id={`t-email-${i}`} type="email" value={t.email} onChange={e => setTestemunha(i, { email: e.target.value })} className={inputCls} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor={`t-cpf-${i}`} className="text-xs font-semibold text-slate-500">CPF</label>
                                        <input id={`t-cpf-${i}`} inputMode="numeric" value={t.cpf} placeholder="000.000.000-00"
                                            onChange={e => setTestemunha(i, { cpf: soDigitos(e.target.value).slice(0, 11) })} className={inputCls} />
                                    </div>
                                    <ActionIconButton kind="delete" title="Tirar testemunha" icon={<Trash2 className="w-4 h-4" />}
                                        onClick={() => setTestemunhas(ts => ts.filter((_, idx) => idx !== i))} />
                                </div>
                            ))}
                        </div>

                        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                {motivoDesligado && cand && <span className="mr-auto text-xs text-gray-500">{motivoDesligado}</span>}
                <button type="button" onClick={onFechar}
                    className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                    Cancelar
                </button>
                <span title={motivoDesligado ?? undefined}>
                    <button type="button" onClick={() => void enviar()} disabled={!!motivoDesligado || enviando || !origem}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100">
                        {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                        Enviar para assinar
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
}

export default EnviarParaAssinaturaSheet;
