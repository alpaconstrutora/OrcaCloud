import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, Mail, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { marcarLoginNestaAba } from '../../lib/loginNestaAba';
import { P } from './PortalKit';
import { mensagemDeErroDeLogin, mensagemDeErroDePrimeiroAcesso } from './PortalLogin';

/**
 * Login do Portal do Investidor (11/11/2026, docs/planos/2026-11-11-login-investidor-animado.md).
 *
 * Desenho a pedido do usuário, a partir de um vídeo de referência: cartão escuro
 * com borda coral brilhante e um painel diagonal que VARRE o cartão entre
 * "Entrar" (formulário à esquerda, boas-vindas à direita) e "Criar conta"
 * (invertido); os campos saem e entram escalonados.
 *
 * O Investidor não tem entrada própria (`lib/entradasDoPortal.ts`): chega aqui
 * pelo seletor de portais, e o `App.tsx` escolhe esta tela no lugar do `Auth`
 * genérico. Mantém o que o `Auth` fazia para o investidor — "Voltar para
 * Portais", cadastro e "esqueci a senha" voltando para "/" — com as mensagens do
 * Supabase em português (as mesmas do `PortalLogin`).
 *
 * Cor: o coral dos portais externos (§24, `P` do `PortalKit`), o mesmo que o
 * investidor vê lá dentro. Sem `dark:` — as cores são fixas, a tela é escura
 * sempre.
 *
 * Movimento: `motion-reduce:` desliga as transições. O lado escondido fica
 * `inert` (fora do Tab e do leitor de tela). No celular não há diagonal: um
 * formulário de cada vez, com a faixa coral de boas-vindas em cima.
 */

type Modo = 'entrar' | 'esqueci' | 'cadastro';

const FUNDO_PAGINA = '#111318';
const FUNDO_CARTAO = '#181A21';

const TITULO_POR_MODO: Record<Modo, string> = {
    entrar: 'Entrar',
    esqueci: 'Recuperar senha',
    cadastro: 'Criar conta',
};

const BOAS_VINDAS = {
    entrar: {
        titulo: 'Bem-vindo de volta!',
        texto: 'Sua carteira, os relatórios e as novas oportunidades estão aqui.',
    },
    cadastro: {
        titulo: 'Que bom ter você aqui!',
        texto: 'Crie seu acesso com o e-mail que a construtora cadastrou para você.',
    },
} as const;

// Curva e duração da varredura; os campos esperam o painel passar para entrar.
const CURVA = 'cubic-bezier(0.7, 0, 0.2, 1)';
const DURACAO_PAINEL = 900;
const ESPERA_ENTRADA = 420;
const PASSO = 70;

/**
 * Classe e atraso de um item que entra/sai escalonado. `saiPara` é o lado para
 * onde ele vai quando o seu formulário deixa de ser o ativo.
 */
function escalonado(
    ativo: boolean, ordem: number, saiPara: 'esquerda' | 'direita', extra = '',
): { className: string; style: React.CSSProperties } {
    const fora = saiPara === 'esquerda' ? 'md:-translate-x-[120%]' : 'md:translate-x-[120%]';
    return {
        className: `transition-all duration-700 motion-reduce:transition-none ${ativo ? 'opacity-100 translate-x-0' : `opacity-0 ${fora}`} ${extra}`.trim(),
        style: {
            transitionTimingFunction: CURVA,
            transitionDelay: `${ativo ? ESPERA_ENTRADA + ordem * PASSO : ordem * 40}ms`,
        },
    };
}

interface CampoProps {
    id: string;
    rotulo: string;
    icone: React.ElementType;
    tipo: 'email' | 'password';
    valor: string;
    aoMudar: (v: string) => void;
    autoComplete: string;
    placeholder: string;
}

/** Campo sublinhado; o rótulo e a linha acendem em coral com o foco. */
const Campo: React.FC<CampoProps> = ({ id, rotulo, icone: Icone, tipo, valor, aoMudar, autoComplete, placeholder }) => (
    <div className="group space-y-1">
        <label htmlFor={id} className="text-xs font-semibold text-slate-400 transition-colors group-focus-within:text-[var(--acento)]">
            {rotulo}
        </label>
        <div className="relative">
            <input
                id={id}
                type={tipo}
                autoComplete={autoComplete}
                inputMode={tipo === 'email' ? 'email' : undefined}
                value={valor}
                onChange={e => aoMudar(e.target.value)}
                placeholder={placeholder}
                className="h-9 w-full border-0 border-b-2 border-white/15 bg-transparent pr-7 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[var(--acento)] autofill:shadow-[inset_0_0_0_1000px_var(--cartao)] autofill:[-webkit-text-fill-color:white]"
            />
            <Icone className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-[var(--acento)]" />
        </div>
    </div>
);

const InvestorLogin: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
    const [modo, setModo] = useState<Modo>('entrar');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const cadastro = modo === 'cadastro';
    const emailLimpo = email.trim().toLowerCase();
    const pedeSenha = modo !== 'esqueci';
    const faltaCampo = pedeSenha ? (!emailLimpo || !senha) : !emailLimpo;
    const senhaCurta = cadastro && senha.length > 0 && senha.length < 6;
    const desabilitado = enviando || faltaCampo || senhaCurta;
    // Botão desabilitado sempre diz o motivo; enquanto envia, o próprio rótulo é o motivo.
    const motivo = enviando ? null
        : senhaCurta ? 'A senha precisa ter pelo menos 6 caracteres.'
        : faltaCampo
            ? (modo === 'esqueci' ? 'Informe o e-mail para receber as instruções.'
                : cadastro ? 'Informe o e-mail e escolha uma senha.'
                : 'Informe e-mail e senha para entrar.')
            : null;

    const trocarModo = (novo: Modo) => {
        setModo(novo);
        setErro(null);
        setSucesso(null);
        setSenha('');
    };

    // Por lado, não pelo modo atual: durante a varredura o formulário que SAI
    // continua com o próprio rótulo (medido no navegador: trocava para "Criar conta").
    const rotuloDoBotao = (m: Modo) => enviando
        ? (m === 'entrar' ? 'Entrando…' : m === 'esqueci' ? 'Enviando…' : 'Criando a conta…')
        : (m === 'entrar' ? 'Entrar' : m === 'esqueci' ? 'Enviar instruções' : 'Criar conta');
    // Modo que o lado ENTRAR mostra — no cadastro ele volta a ser "Entrar".
    const modoDoLadoEntrar: Modo = cadastro ? 'entrar' : modo;

    const aoEnviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (desabilitado) return;
        setErro(null);
        setSucesso(null);
        setEnviando(true);
        const voltarPara = `${window.location.origin}/`;
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
            console.error('Erro na entrada do Portal do Investidor:', err);
            setErro(modo === 'entrar' ? mensagemDeErroDeLogin(err)
                : modo === 'esqueci' ? 'Não foi possível enviar as instruções. Tente de novo.'
                : mensagemDeErroDePrimeiroAcesso(err));
        } finally {
            setEnviando(false);
        }
    };

    /** Mensagens, botão e motivo — os mesmos nos dois lados; só o lado ativo os mostra. */
    const rodapeDoFormulario = (prefixo: string, modoDoLado: Modo, ordemInicial: number, ativo: boolean, saiPara: 'esquerda' | 'direita') => {
        const item = (ordem: number) => escalonado(ativo, ordemInicial + ordem, saiPara);
        return (
            <>
                {ativo && erro && (
                    <div role="alert" className="flex items-start gap-2 rounded-[6px] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{erro}</span>
                    </div>
                )}
                {ativo && sucesso && (
                    <div role="status" className="flex items-start gap-2 rounded-[6px] border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{sucesso}</span>
                    </div>
                )}
                <div {...item(0)}>
                    <button
                        type="submit"
                        disabled={desabilitado}
                        aria-describedby={ativo && motivo ? `${prefixo}-motivo` : undefined}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-white shadow-[0_6px_20px_-6px_var(--acento)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                        style={{ backgroundImage: `linear-gradient(90deg, ${P.accentHover}, ${P.accent})` }}
                    >
                        {ativo && enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {rotuloDoBotao(modoDoLado)}
                    </button>
                    {ativo && motivo && <p id={`${prefixo}-motivo`} className="mt-2 text-center text-xs text-slate-400">{motivo}</p>}
                </div>
            </>
        );
    };

    const ladoEntrarAtivo = !cadastro;
    const corDoLink = 'font-semibold text-[var(--acento)] hover:brightness-125';

    // Painel diagonal: na entrada fica à direita inclinado para um lado; no
    // cadastro, à esquerda inclinado para o outro. O transform interpola os dois.
    const transformDoPainel = cadastro ? 'translateX(-36%) skewX(-18deg)' : 'translateX(96%) skewX(18deg)';
    const transformDoRastro = cadastro ? 'translateX(-30%) skewX(-18deg)' : 'translateX(90%) skewX(18deg)';

    return (
        <div
            className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6"
            style={{ backgroundColor: FUNDO_PAGINA, ['--acento' as string]: P.accent, ['--cartao' as string]: FUNDO_CARTAO } as React.CSSProperties}
        >
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-6 flex items-center gap-2 self-start text-sm font-medium text-slate-400 transition-colors hover:text-white md:absolute md:left-8 md:top-8 md:mb-0"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para Portais
                </button>
            )}

            <div className="mb-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] text-white" style={{ backgroundColor: P.accent }}>
                    <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                    <h1 className="text-lg font-bold leading-tight text-white">Portal do Investidor</h1>
                    <p className="text-xs text-slate-400">Gestão de patrimônio, cotas e novos empreendimentos</p>
                </div>
            </div>

            <div
                className="relative w-full max-w-[820px] overflow-hidden rounded-[16px] border-2 md:h-[500px]"
                style={{
                    backgroundColor: FUNDO_CARTAO,
                    borderColor: P.accent,
                    boxShadow: `0 0 28px -4px ${P.accent}, inset 0 0 18px -10px ${P.accent}`,
                }}
            >
                {/* Rastro e painel diagonais — só a partir do tablet */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-[15%] left-0 hidden h-[130%] w-[62%] opacity-40 transition-transform motion-reduce:transition-none md:block"
                    style={{
                        backgroundColor: P.accentHover,
                        transform: transformDoRastro,
                        transitionDuration: `${DURACAO_PAINEL}ms`,
                        transitionTimingFunction: CURVA,
                        transitionDelay: '120ms',
                    }}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-[15%] left-0 hidden h-[130%] w-[62%] transition-transform motion-reduce:transition-none md:block"
                    style={{
                        backgroundImage: `linear-gradient(135deg, ${P.accent} 0%, ${P.accentHover} 45%, #3A1A14 100%)`,
                        transform: transformDoPainel,
                        transitionDuration: `${DURACAO_PAINEL}ms`,
                        transitionTimingFunction: CURVA,
                    }}
                />

                {/* Faixa de boas-vindas do celular (sem diagonal) */}
                <div className="px-6 py-5 md:hidden" style={{ backgroundImage: `linear-gradient(135deg, ${P.accent}, ${P.accentHover})` }}>
                    <p className="text-lg font-bold text-white">{BOAS_VINDAS[cadastro ? 'cadastro' : 'entrar'].titulo}</p>
                    <p className="mt-1 text-sm text-white/85">{BOAS_VINDAS[cadastro ? 'cadastro' : 'entrar'].texto}</p>
                </div>

                {/* Boas-vindas sobre o painel — entrada à direita, cadastro à esquerda */}
                <div aria-hidden={cadastro} className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 flex-col items-end justify-center pl-16 pr-10 text-right md:flex">
                    <p {...escalonado(!cadastro, 0, 'direita', 'text-3xl font-black leading-tight text-white')}>
                        {BOAS_VINDAS.entrar.titulo}
                    </p>
                    <p {...escalonado(!cadastro, 1, 'direita', 'mt-3 max-w-[240px] text-sm text-white/85')}>
                        {BOAS_VINDAS.entrar.texto}
                    </p>
                </div>
                <div aria-hidden={!cadastro} className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 flex-col items-start justify-center pl-10 pr-16 md:flex">
                    <p {...escalonado(cadastro, 0, 'esquerda', 'text-3xl font-black leading-tight text-white')}>
                        {BOAS_VINDAS.cadastro.titulo}
                    </p>
                    <p {...escalonado(cadastro, 1, 'esquerda', 'mt-3 max-w-[240px] text-sm text-white/85')}>
                        {BOAS_VINDAS.cadastro.texto}
                    </p>
                </div>

                {/* Lado ENTRAR (e "esqueci") — metade esquerda */}
                <div
                    inert={!ladoEntrarAtivo}
                    data-testid="lado-entrar"
                    className={`${ladoEntrarAtivo ? '' : 'max-md:hidden'} relative md:absolute md:inset-y-0 md:left-0 md:flex md:w-1/2 md:flex-col md:justify-center`}
                >
                    <form onSubmit={aoEnviar} noValidate className="space-y-5 px-6 py-8 md:px-12 md:py-0">
                        <div {...escalonado(ladoEntrarAtivo, 0, 'esquerda')}>
                            <h2 className="text-2xl font-black text-white">{TITULO_POR_MODO[modoDoLadoEntrar]}</h2>
                            {modo === 'esqueci' && (
                                <p className="mt-1 text-sm text-slate-400">Enviaremos um link para você criar uma senha nova.</p>
                            )}
                        </div>
                        <div {...escalonado(ladoEntrarAtivo, 1, 'esquerda')}>
                            <Campo
                                id="il-email" rotulo="E-mail" icone={Mail} tipo="email"
                                valor={email} aoMudar={setEmail} autoComplete="email" placeholder="seu@email.com"
                            />
                        </div>
                        {modo !== 'esqueci' && (
                            <div {...escalonado(ladoEntrarAtivo, 2, 'esquerda')}>
                                <Campo
                                    id="il-senha" rotulo="Senha" icone={Lock} tipo="password"
                                    valor={senha} aoMudar={setSenha} autoComplete="current-password" placeholder="Sua senha"
                                />
                                <div className="mt-2 text-right">
                                    <button type="button" onClick={() => trocarModo('esqueci')} className={`text-xs ${corDoLink}`}>
                                        Esqueci minha senha
                                    </button>
                                </div>
                            </div>
                        )}
                        {rodapeDoFormulario('il-entrar', modoDoLadoEntrar, 3, ladoEntrarAtivo, 'esquerda')}
                        <p {...escalonado(ladoEntrarAtivo, 4, 'esquerda', 'text-center text-sm text-slate-400')}>
                            {modo === 'esqueci' ? (
                                <button type="button" onClick={() => trocarModo('entrar')} className={corDoLink}>
                                    Voltar para entrar
                                </button>
                            ) : (
                                <>
                                    Ainda não tem acesso?{' '}
                                    <button type="button" onClick={() => trocarModo('cadastro')} className={corDoLink}>
                                        Criar conta
                                    </button>
                                </>
                            )}
                        </p>
                    </form>
                </div>

                {/* Lado CADASTRO — metade direita */}
                <div
                    inert={ladoEntrarAtivo}
                    data-testid="lado-cadastro"
                    className={`${ladoEntrarAtivo ? 'max-md:hidden' : ''} relative md:absolute md:inset-y-0 md:right-0 md:flex md:w-1/2 md:flex-col md:justify-center`}
                >
                    <form onSubmit={aoEnviar} noValidate className="space-y-5 px-6 py-8 md:px-12 md:py-0">
                        <div {...escalonado(cadastro, 0, 'direita')}>
                            <h2 className="text-2xl font-black text-white">{TITULO_POR_MODO.cadastro}</h2>
                        </div>
                        <div {...escalonado(cadastro, 1, 'direita')}>
                            <Campo
                                id="ic-email" rotulo="E-mail" icone={Mail} tipo="email"
                                valor={email} aoMudar={setEmail} autoComplete="email" placeholder="seu@email.com"
                            />
                        </div>
                        <div {...escalonado(cadastro, 2, 'direita')}>
                            <Campo
                                id="ic-senha" rotulo="Escolha uma senha" icone={Lock} tipo="password"
                                valor={senha} aoMudar={setSenha} autoComplete="new-password" placeholder="Mínimo de 6 caracteres"
                            />
                        </div>
                        {rodapeDoFormulario('il-cadastro', 'cadastro', 3, cadastro, 'direita')}
                        <p {...escalonado(cadastro, 4, 'direita', 'text-center text-sm text-slate-400')}>
                            Já tem acesso?{' '}
                            <button type="button" onClick={() => trocarModo('entrar')} className={corDoLink}>
                                Entrar
                            </button>
                        </p>
                    </form>
                </div>
            </div>

            <p className="mt-8 max-w-sm text-center text-xs text-slate-500">
                Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
            </p>
        </div>
    );
};

export default InvestorLogin;
