import React from 'react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ENDERECO_PRO, ORIGEM_PRO } from '../../utils/proPublico';

/**
 * Entrada do ÒPURA Pro público: Google ou código por e-mail — sem senha
 * (14/11/2026, docs/planos/2026-11-14-opura-pro-publico.md, P2).
 *
 * O e-mail do Supabase pode trazer o CÓDIGO (modelo com {{ .Token }}) ou o LINK (modelo
 * padrão). A tela aceita os dois: quem recebeu o link só toca nele e volta para /pro já
 * dentro. Conta nova criada por aqui nasce com `user_metadata.origem = 'pro'`.
 */

const CAMPO = 'w-full h-12 bg-white border border-slate-300 rounded-[6px] px-3 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';
const PRIMARIO = 'w-full h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-base transition-colors disabled:opacity-60';
const SECUNDARIO = 'w-full h-12 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-base transition-colors disabled:opacity-60';
const ESPERA_REENVIO_S = 60;

const voltaParaOPro = () => `${window.location.origin}${ENDERECO_PRO}`;

const LogoGoogle: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

export const ProEntrada: React.FC = () => {
  const [etapa, setEtapa] = React.useState<'email' | 'codigo'>('email');
  const [email, setEmail] = React.useState('');
  const [codigo, setCodigo] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState('');
  const [esperaReenvio, setEsperaReenvio] = React.useState(0);
  const idEmail = React.useId();
  const idCodigo = React.useId();

  React.useEffect(() => {
    if (esperaReenvio <= 0) return;
    const t = setTimeout(() => setEsperaReenvio(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [esperaReenvio]);

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const entrarComGoogle = async () => {
    setErro('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: voltaParaOPro() },
    });
    if (error) {
      console.error('Google:', error);
      setErro('Entrar com Google não está disponível agora. Use o código por e-mail.');
    }
  };

  const enviarCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!emailValido || enviando) return;
    setEnviando(true);
    setErro('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: voltaParaOPro(),
        data: { origem: ORIGEM_PRO },
      },
    });
    setEnviando(false);
    if (error) {
      console.error('Código por e-mail:', error);
      setErro(/rate|seconds|segundos/i.test(error.message)
        ? 'Muitos pedidos seguidos. Espere um minuto e peça de novo.'
        : 'Não foi possível enviar o código. Confira o e-mail e a internet.');
      return;
    }
    setEtapa('codigo');
    setCodigo('');
    setEsperaReenvio(ESPERA_REENVIO_S);
  };

  const conferirCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length !== 6 || enviando) return;
    setEnviando(true);
    setErro('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: codigo, type: 'email' });
    setEnviando(false);
    if (error) {
      console.error('Conferir código:', error);
      setErro('Código errado ou vencido. Confira os 6 números ou peça um novo.');
    }
    // Sucesso: o onAuthStateChange do ProPublico troca a tela.
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <main className="flex-1 w-full max-w-sm mx-auto px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 flex flex-col">
        <div className="mb-8">
          <p className="text-2xl font-black text-slate-900">ÒPURA Pro</p>
          <p className="text-base text-slate-700 mt-1.5">
            Orçamento no WhatsApp, Pix na hora e a agenda do seu serviço. Grátis.
          </p>
        </div>

        {etapa === 'email' ? (
          <div className="space-y-6">
            <h1 className="text-lg font-semibold text-slate-900">Entrar ou criar conta</h1>
            <button type="button" onClick={entrarComGoogle} className={SECUNDARIO}>
              <LogoGoogle />
              Continuar com Google
            </button>

            <div className="flex items-center gap-3 text-sm text-slate-600" aria-hidden>
              <span className="h-px flex-1 bg-slate-200" /> ou <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={enviarCodigo} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor={idEmail} className="block text-xs font-semibold text-slate-500">Seu e-mail</label>
                <input
                  id={idEmail}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={CAMPO}
                />
              </div>
              <button
                type="submit"
                disabled={!emailValido || enviando}
                title={!emailValido ? 'Digite um e-mail válido.' : undefined}
                className={PRIMARIO}
              >
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Mail className="w-5 h-5" aria-hidden />}
                Receber código por e-mail
              </button>
              <p className="text-sm text-slate-600">Sem senha: a gente manda um código de 6 números para o seu e-mail.</p>
            </form>
          </div>
        ) : (
          <form onSubmit={conferirCodigo} className="space-y-4">
            <button
              type="button"
              onClick={() => { setEtapa('email'); setErro(''); }}
              className="inline-flex items-center gap-1 min-h-11 -ml-2 px-2 text-sm font-medium text-blue-700"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              Trocar e-mail
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Confira seu e-mail</h1>
            <p className="text-base text-slate-700">
              Mandamos um código para <span className="font-semibold text-slate-900 break-all">{email.trim()}</span>.
              Digite os 6 números — ou, se veio um link, é só tocar nele.
            </p>
            <div className="space-y-1.5">
              <label htmlFor={idCodigo} className="block text-xs font-semibold text-slate-500">Código</label>
              <input
                id={idCodigo}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${CAMPO} tracking-[0.4em] text-center tabular-nums`}
              />
            </div>
            <button
              type="submit"
              disabled={codigo.length !== 6 || enviando}
              title={codigo.length !== 6 ? 'Digite os 6 números do código.' : undefined}
              className={PRIMARIO}
            >
              {enviando && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
              Entrar
            </button>
            <button
              type="button"
              onClick={() => enviarCodigo()}
              disabled={esperaReenvio > 0 || enviando}
              className="w-full min-h-11 text-sm font-medium text-blue-700 disabled:text-slate-600"
            >
              {esperaReenvio > 0 ? `Pedir outro código em ${esperaReenvio} s` : 'Pedir outro código'}
            </button>
          </form>
        )}

        {erro && <p className="mt-4 text-sm text-red-700" role="alert">{erro}</p>}
      </main>
    </div>
  );
};

export default ProEntrada;
