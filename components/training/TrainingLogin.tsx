import React, { useState } from 'react';
import { AlertCircle, Award, BookOpen, CheckCircle2, GraduationCap, History, Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { marcarLoginNestaAba } from '../../lib/loginNestaAba';

/**
 * Página de login EXCLUSIVA do Portal de Treinamentos (/portal-treinamentos).
 *
 * Pedido de 16/10/2026 (docs/planos/2026-10-16-login-exclusivo-portal-treinamentos.md):
 * até então a rota abria o `Auth` genérico com tema teal, que trazia "Voltar
 * para Portais" (expõe os outros oito portais), "Cadastre-se" (cadastro livre não
 * faz sentido num portal por convite do RH) e um "Esqueceu a senha?" que
 * devolvia a pessoa à raiz, não ao portal.
 *
 * Por que é um componente autônomo e não um tema a mais do `Auth`: o que os
 * dois compartilhariam são ~12 linhas (marcar a aba → signIn → erro). Extrair
 * um hook obrigaria a mexer no caminho dos outros portais para reaproveitar num
 * só. Quando o Portal do Parceiro ganhar página própria, aí nasce o hook comum.
 *
 * O que esta tela NÃO faz: validar o grupo nem abrir o portal. Depois do
 * `signInWithPassword`, o `useAuthSync` valida pela RPC
 * `academy_portal_user_my_access` e o `App.tsx` troca de tela; conta que não é
 * de treinando vê "Erro de Acesso" e cai no seletor (efeito de rota do App).
 *
 * `redirectTo` de "esqueci minha senha" é `/portal-treinamentos`: o link chega
 * com `#type=recovery`, o `ResetPassword` abre e, ao concluir, o efeito da rota
 * já pôs o grupo TREINANDO — mesmo trilho do convite por e-mail.
 */

type Modo = 'entrar' | 'esqueci';

const DESTAQUES = [
    { icone: BookOpen, titulo: 'Aulas e provas', texto: 'Assista no seu ritmo e faça a avaliação ao final.' },
    { icone: Award, titulo: 'Certificados', texto: 'Baixe o PDF e compartilhe o link de validação.' },
    { icone: History, titulo: 'Histórico de treinamentos', texto: 'Presenciais e a distância, com validade e reciclagem.' },
] as const;

/** Mensagens do Supabase Auth em português — o `Auth` genérico mostra o texto cru. */
export function mensagemDeErroDeLogin(err: unknown): string {
    const msg = String((err as { message?: string } | null)?.message || '');
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(msg)) return 'Este e-mail ainda não confirmou o convite. Abra o link que o RH enviou.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível entrar. Tente de novo.';
}

const TrainingLogin: React.FC = () => {
    const [modo, setModo] = useState<Modo>('entrar');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const emailLimpo = email.trim().toLowerCase();
    const faltaCampo = modo === 'entrar' ? (!emailLimpo || !senha) : !emailLimpo;
    const desabilitado = enviando || faltaCampo;
    // Botão desabilitado sempre diz o motivo; enquanto envia, o próprio rótulo é o motivo.
    const motivo = !enviando && faltaCampo
        ? (modo === 'entrar' ? 'Informe e-mail e senha para entrar.' : 'Informe o e-mail para receber as instruções.')
        : null;

    const trocarModo = (novo: Modo) => {
        setModo(novo);
        setErro(null);
        setSucesso(null);
        setSenha('');
    };

    const aoEnviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (desabilitado) return;
        setErro(null);
        setSucesso(null);
        setEnviando(true);
        try {
            if (modo === 'entrar') {
                // Login feito NESTA aba: só ela pode desconectar a conta se o portal
                // não combinar (lib/loginNestaAba.ts). Marcar ANTES do signIn.
                marcarLoginNestaAba(emailLimpo);
                const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
                    redirectTo: `${window.location.origin}/portal-treinamentos`,
                });
                if (error) throw error;
                // O servidor responde 200 também para e-mail desconhecido — a mensagem não afirma.
                setSucesso('Se este e-mail tiver acesso ao portal, enviamos as instruções para criar uma senha nova.');
            }
        } catch (err) {
            console.error('Erro no login do Portal de Treinamentos:', err);
            setErro(modo === 'entrar' ? mensagemDeErroDeLogin(err) : 'Não foi possível enviar as instruções. Tente de novo.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
            {/* Painel de identidade — só no desktop (a partir de 1024px) */}
            <aside className="hidden lg:flex flex-col justify-between bg-teal-700 text-white p-12 xl:p-16">
                <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-white/10">
                        <GraduationCap className="h-7 w-7" />
                    </span>
                    <span className="text-sm font-semibold text-teal-100">Academia ÒPURA</span>
                </div>

                <div className="space-y-8">
                    <div>
                        <h1 className="text-3xl xl:text-4xl font-black tracking-tight">Portal de Treinamentos</h1>
                        <p className="mt-3 max-w-md text-base text-teal-100">
                            Acesso de colaboradores e terceirizados aos treinamentos da sua empresa.
                        </p>
                    </div>
                    <ul className="space-y-5">
                        {DESTAQUES.map(d => (
                            <li key={d.titulo} className="flex gap-3">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                                    <d.icone className="h-[18px] w-[18px]" />
                                </span>
                                <div>
                                    <p className="font-semibold">{d.titulo}</p>
                                    <p className="text-sm text-teal-100">{d.texto}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="text-xs text-teal-200">Acesso por convite do RH da empresa.</p>
            </aside>

            {/* Formulário — casca fora do <Layout>: gutter p-4 md:p-6 à mão (§20.2.1) */}
            <main className="flex min-h-screen flex-col justify-center p-4 md:p-6 lg:min-h-0 lg:p-12">
                <div className="mx-auto w-full max-w-sm">
                    <img src="/opura-logo.svg" alt="ÒPURA" className="mb-8 h-8 w-auto" />

                    {/* Cabeçalho compacto até o tablet — no desktop o painel já se apresenta */}
                    <div className="mb-6 flex items-center gap-3 lg:hidden">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-teal-600 text-white">
                            <GraduationCap className="h-5 w-5" />
                        </span>
                        <h1 className="text-xl font-black text-slate-900">Portal de Treinamentos</h1>
                    </div>

                    <h2 className="text-2xl font-black text-slate-900">{modo === 'entrar' ? 'Entrar' : 'Recuperar senha'}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {modo === 'entrar'
                            ? 'Use o e-mail em que recebeu o convite.'
                            : 'Enviaremos um link para você criar uma senha nova.'}
                    </p>

                    <form onSubmit={aoEnviar} noValidate className="mt-6 space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="tl-email" className="text-xs font-semibold text-slate-500">E-mail</label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    id="tl-email"
                                    type="email"
                                    autoComplete="email"
                                    inputMode="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    className="h-10 w-full rounded-[6px] border border-slate-300 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                                />
                            </div>
                        </div>

                        {modo === 'entrar' && (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="tl-senha" className="text-xs font-semibold text-slate-500">Senha</label>
                                    <button
                                        type="button"
                                        onClick={() => trocarModo('esqueci')}
                                        className="text-xs font-medium text-teal-700 hover:text-teal-900"
                                    >
                                        Esqueci minha senha
                                    </button>
                                </div>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="tl-senha"
                                        type="password"
                                        autoComplete="current-password"
                                        value={senha}
                                        onChange={e => setSenha(e.target.value)}
                                        placeholder="Sua senha"
                                        className="h-10 w-full rounded-[6px] border border-slate-300 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                                    />
                                </div>
                            </div>
                        )}

                        {erro && (
                            <div role="alert" className="flex items-start gap-2 rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{erro}</span>
                            </div>
                        )}
                        {sucesso && (
                            <div role="status" className="flex items-start gap-2 rounded-[6px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{sucesso}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={desabilitado}
                            aria-describedby={motivo ? 'tl-motivo' : undefined}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-teal-600 text-[13px] font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {enviando ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {modo === 'entrar' ? 'Entrando…' : 'Enviando…'}
                                </>
                            ) : (
                                modo === 'entrar' ? 'Entrar' : 'Enviar instruções'
                            )}
                        </button>
                        {motivo && <p id="tl-motivo" className="text-center text-xs text-slate-400">{motivo}</p>}

                        {modo === 'esqueci' && (
                            <button
                                type="button"
                                onClick={() => trocarModo('entrar')}
                                className="w-full text-center text-sm font-medium text-teal-700 hover:text-teal-900"
                            >
                                Voltar para entrar
                            </button>
                        )}
                    </form>

                    <p className="mt-8 text-center text-xs text-slate-400">
                        Não recebeu o convite? Fale com o RH da sua empresa.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default TrainingLogin;
