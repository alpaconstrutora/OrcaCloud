import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { marcarLoginNestaAba } from '../../lib/loginNestaAba';
import type { EntradaDoPortal } from '../../lib/entradasDoPortal';

/**
 * Página de login EXCLUSIVA de um portal (/portal-cliente, /portal-fornecedor,
 * /portal-parceiro, /portal-corretor, /portal-treinamentos).
 *
 * Nasceu em 16/10/2026 como `TrainingLogin` (só Treinamentos) e no mesmo dia foi
 * generalizada para os demais portais com entrada própria
 * (docs/planos/2026-10-16-portais-login-exclusivo-convite.md). A identidade
 * (rota, cor, ícone, textos, se permite "primeiro acesso") vem da
 * `EntradaDoPortal` — `lib/entradasDoPortal.ts`.
 *
 * Por que não é mais um tema do `Auth`: o `Auth` tem "Voltar para Portais" (expõe
 * os outros portais), "Cadastre-se" para todos e "esqueci a senha" voltando à
 * raiz. Aqui não há "Voltar"; "Primeiro acesso" só onde a empresa cadastra a
 * pessoa e ela cria a própria conta; e todo link volta para a rota do portal.
 *
 * O que esta tela NÃO faz: validar o grupo nem abrir o portal. Depois do
 * `signInWithPassword`, o `useAuthSync` valida (`profileService.validateAccess`)
 * e o `App.tsx` troca de tela; conta que não é daquele portal vê "Erro de
 * Acesso" e cai no seletor (efeito de rota do App).
 */

type Modo = 'entrar' | 'esqueci' | 'primeiro-acesso';

/** Mensagens do Supabase Auth em português — o `Auth` genérico mostra o texto cru. */
export function mensagemDeErroDeLogin(err: unknown): string {
    const msg = String((err as { message?: string } | null)?.message || '');
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado. Abra o link que chegou na sua caixa de entrada.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível entrar. Tente de novo.';
}

/** Mensagens do `signUp` ("primeiro acesso"). */
export function mensagemDeErroDePrimeiroAcesso(err: unknown): string {
    const msg = String((err as { message?: string } | null)?.message || '');
    if (/already|registered|exists/i.test(msg)) return 'Este e-mail já tem conta. Entre com a sua senha ou use "Esqueci minha senha".';
    if (/password/i.test(msg) && /short|least|6/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível criar a conta. Tente de novo.';
}

const TITULO_POR_MODO: Record<Modo, string> = {
    'entrar': 'Entrar',
    'esqueci': 'Recuperar senha',
    'primeiro-acesso': 'Primeiro acesso',
};

const PortalLogin: React.FC<{ entrada: EntradaDoPortal }> = ({ entrada }) => {
    const { cores } = entrada;
    const [modo, setModo] = useState<Modo>('entrar');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const emailLimpo = email.trim().toLowerCase();
    const pedeSenha = modo !== 'esqueci';
    const faltaCampo = pedeSenha ? (!emailLimpo || !senha) : !emailLimpo;
    const senhaCurta = modo === 'primeiro-acesso' && senha.length > 0 && senha.length < 6;
    const desabilitado = enviando || faltaCampo || senhaCurta;
    // Botão desabilitado sempre diz o motivo; enquanto envia, o próprio rótulo é o motivo.
    const motivo = enviando ? null
        : senhaCurta ? 'A senha precisa ter pelo menos 6 caracteres.'
        : faltaCampo
            ? (modo === 'esqueci' ? 'Informe o e-mail para receber as instruções.'
                : modo === 'primeiro-acesso' ? 'Informe o e-mail cadastrado e escolha uma senha.'
                : 'Informe e-mail e senha para entrar.')
            : null;

    const trocarModo = (novo: Modo) => {
        setModo(novo);
        setErro(null);
        setSucesso(null);
        setSenha('');
    };

    const subtitulo = modo === 'entrar' ? entrada.dica
        : modo === 'esqueci' ? 'Enviaremos um link para você criar uma senha nova.'
        : 'Use o e-mail que a construtora cadastrou e escolha a sua senha.';

    const rotulo = enviando
        ? (modo === 'entrar' ? 'Entrando…' : modo === 'esqueci' ? 'Enviando…' : 'Criando a conta…')
        : (modo === 'entrar' ? 'Entrar' : modo === 'esqueci' ? 'Enviar instruções' : 'Criar senha e entrar');

    const aoEnviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (desabilitado) return;
        setErro(null);
        setSucesso(null);
        setEnviando(true);
        const voltarPara = `${window.location.origin}${entrada.rota}`;
        try {
            if (modo === 'entrar') {
                // Login feito NESTA aba: só ela pode desconectar a conta se o portal
                // não combinar (lib/loginNestaAba.ts). Marcar ANTES do signIn.
                marcarLoginNestaAba(emailLimpo);
                const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
                if (error) throw error;
            } else if (modo === 'esqueci') {
                const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, { redirectTo: voltarPara });
                if (error) throw error;
                // O servidor responde 200 também para e-mail desconhecido — a mensagem não afirma.
                setSucesso('Se este e-mail tiver acesso ao portal, enviamos as instruções para criar uma senha nova.');
            } else {
                marcarLoginNestaAba(emailLimpo);
                const { data, error } = await supabase.auth.signUp({
                    email: emailLimpo,
                    password: senha,
                    options: { emailRedirectTo: voltarPara },
                });
                if (error) throw error;
                // Com confirmação de e-mail ligada o Supabase devolve o usuário SEM sessão.
                if (data?.user && !data.session) {
                    setModo('entrar');
                    setSenha('');
                    setSucesso('Conta criada. Confirme pelo link que enviamos ao seu e-mail e depois entre com a sua senha.');
                }
                // Com sessão, o App já troca de tela sozinho (useAuthSync valida o acesso).
            }
        } catch (err) {
            console.error(`Erro na entrada do ${entrada.titulo}:`, err);
            setErro(modo === 'entrar' ? mensagemDeErroDeLogin(err)
                : modo === 'esqueci' ? 'Não foi possível enviar as instruções. Tente de novo.'
                : mensagemDeErroDePrimeiroAcesso(err));
        } finally {
            setEnviando(false);
        }
    };

    const classeInput = `h-10 w-full rounded-[6px] border border-slate-300 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors focus:ring-2 ${cores.foco}`;
    const classeLink = `text-xs font-medium ${cores.link}`;

    return (
        <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
            {/* Painel de identidade — só no desktop (a partir de 1024px) */}
            <aside className={`hidden lg:flex flex-col justify-between ${cores.painel} text-white p-12 xl:p-16`}>
                <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-white/10">
                        <entrada.icone className="h-7 w-7" />
                    </span>
                    <span className={`text-sm font-semibold ${cores.painelTexto}`}>{entrada.assinatura}</span>
                </div>

                <div className="space-y-8">
                    <div>
                        <h1 className="text-3xl xl:text-4xl font-black tracking-tight">{entrada.titulo}</h1>
                        <p className={`mt-3 max-w-md text-base ${cores.painelTexto}`}>{entrada.descricao}</p>
                    </div>
                    <ul className="space-y-5">
                        {entrada.destaques.map(d => (
                            <li key={d.titulo} className="flex gap-3">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                                    <d.icone className="h-[18px] w-[18px]" />
                                </span>
                                <div>
                                    <p className="font-semibold">{d.titulo}</p>
                                    <p className={`text-sm ${cores.painelTexto}`}>{d.texto}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className={`text-xs ${cores.painelRodape}`}>
                    {entrada.permitePrimeiroAcesso ? 'Acesso para quem a construtora cadastrou.' : 'Acesso por convite.'}
                </p>
            </aside>

            {/* Formulário — casca fora do <Layout>: gutter p-4 md:p-6 à mão (§20.2.1) */}
            <main className="flex min-h-screen flex-col justify-center p-4 md:p-6 lg:min-h-0 lg:p-12">
                <div className="mx-auto w-full max-w-sm">
                    <img src="/opura-logo.svg" alt="ÒPURA" className="mb-8 h-8 w-auto" />

                    {/* Cabeçalho compacto até o tablet — no desktop o painel já se apresenta */}
                    <div className="mb-6 flex items-center gap-3 lg:hidden">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${cores.iconeMovel} text-white`}>
                            <entrada.icone className="h-5 w-5" />
                        </span>
                        <h1 className="text-xl font-black text-slate-900">{entrada.titulo}</h1>
                    </div>

                    <h2 className="text-2xl font-black text-slate-900">{TITULO_POR_MODO[modo]}</h2>
                    <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>

                    <form onSubmit={aoEnviar} noValidate className="mt-6 space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="pl-email" className="text-xs font-semibold text-slate-500">E-mail</label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    id="pl-email"
                                    type="email"
                                    autoComplete="email"
                                    inputMode="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    className={classeInput}
                                />
                            </div>
                        </div>

                        {pedeSenha && (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="pl-senha" className="text-xs font-semibold text-slate-500">
                                        {modo === 'primeiro-acesso' ? 'Escolha uma senha' : 'Senha'}
                                    </label>
                                    {modo === 'entrar' && (
                                        <button type="button" onClick={() => trocarModo('esqueci')} className={classeLink}>
                                            Esqueci minha senha
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="pl-senha"
                                        type="password"
                                        autoComplete={modo === 'primeiro-acesso' ? 'new-password' : 'current-password'}
                                        value={senha}
                                        onChange={e => setSenha(e.target.value)}
                                        placeholder={modo === 'primeiro-acesso' ? 'Mínimo de 6 caracteres' : 'Sua senha'}
                                        className={classeInput}
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
                            aria-describedby={motivo ? 'pl-motivo' : undefined}
                            className={`flex h-10 w-full items-center justify-center gap-2 rounded-[6px] ${cores.botao} text-[13px] font-medium text-white transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                            {rotulo}
                        </button>
                        {motivo && <p id="pl-motivo" className="text-center text-xs text-slate-400">{motivo}</p>}

                        {modo !== 'entrar' && (
                            <button type="button" onClick={() => trocarModo('entrar')} className={`w-full text-center text-sm font-medium ${cores.link}`}>
                                Voltar para entrar
                            </button>
                        )}
                        {modo === 'entrar' && entrada.permitePrimeiroAcesso && (
                            <p className="text-center text-sm text-slate-500">
                                Primeiro acesso?{' '}
                                <button type="button" onClick={() => trocarModo('primeiro-acesso')} className={`font-medium ${cores.link}`}>
                                    Crie sua senha
                                </button>
                            </p>
                        )}
                    </form>

                    <p className="mt-8 text-center text-xs text-slate-400">{entrada.rodape}</p>
                </div>
            </main>
        </div>
    );
};

export default PortalLogin;
