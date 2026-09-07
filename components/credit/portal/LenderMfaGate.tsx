import React from 'react';
import { Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { GhostButton, PortalCard, PrimaryButton } from '../../portal/PortalKit';

/**
 * Segundo fator obrigatório para o credor (PRD §87).
 *
 * O Portal de Crédito é o primeiro portal do sistema em que um usuário EXTERNO
 * entra com login (decisão do usuário, 2026-09-07). Senha sozinha não basta
 * para quem vai baixar matrícula, balanço e rent roll de terceiros: este gate
 * só renderiza `children` quando a sessão está em `aal2`.
 *
 *   · sem fator cadastrado → cadastra TOTP (QR + código de 6 dígitos);
 *   · com fator, sessão em aal1 → pede o código;
 *   · aal2 → passa.
 *
 * ⚠️ Exige "Multi-Factor Authentication → TOTP" ligado no painel do Supabase
 * (Authentication › Providers). Sem isso `mfa.enroll` devolve erro e a tela
 * mostra a mensagem em vez de passar — nunca deixa passar sem o fator.
 */

type Estado = 'verificando' | 'ok' | 'cadastrar' | 'desafiar' | 'erro';

interface Props {
    children: React.ReactNode;
    onLogout: () => void;
}

const LenderMfaGate: React.FC<Props> = ({ children, onLogout }) => {
    const [estado, setEstado] = React.useState<Estado>('verificando');
    const [erro, setErro] = React.useState<string | null>(null);
    const [factorId, setFactorId] = React.useState<string | null>(null);
    const [qrCode, setQrCode] = React.useState<string | null>(null);
    const [secret, setSecret] = React.useState<string | null>(null);
    const [codigo, setCodigo] = React.useState('');
    const [enviando, setEnviando] = React.useState(false);

    const verificar = React.useCallback(async () => {
        setEstado('verificando');
        setErro(null);
        try {
            const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalErr) throw aalErr;
            if (aal?.currentLevel === 'aal2') { setEstado('ok'); return; }

            const { data: fatores, error: fErr } = await supabase.auth.mfa.listFactors();
            if (fErr) throw fErr;
            const verificado = (fatores?.totp ?? []).find(f => f.status === 'verified');
            if (verificado) {
                setFactorId(verificado.id);
                setEstado('desafiar');
                return;
            }
            // Cadastro abandonado no meio deixa fator "unverified" para trás;
            // limpa antes de cadastrar de novo, senão a lista cresce a cada tentativa.
            for (const f of (fatores?.totp ?? []).filter(f => (f.status as string) !== 'verified')) {
                await supabase.auth.mfa.unenroll({ factorId: f.id });
            }
            const { data: novo, error: eErr } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'ÒPURA · Portal de Crédito',
            });
            if (eErr) throw eErr;
            setFactorId(novo.id);
            setQrCode(novo.totp.qr_code);
            setSecret(novo.totp.secret);
            setEstado('cadastrar');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível verificar o segundo fator.');
            setEstado('erro');
        }
    }, []);

    React.useEffect(() => { void verificar(); }, [verificar]);

    const confirmar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!factorId || codigo.trim().length < 6) return;
        setEnviando(true);
        setErro(null);
        try {
            const { data: desafio, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
            if (cErr) throw cErr;
            const { error: vErr } = await supabase.auth.mfa.verify({
                factorId,
                challengeId: desafio.id,
                code: codigo.trim(),
            });
            if (vErr) throw vErr;
            setCodigo('');
            setEstado('ok');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Código inválido.');
        } finally {
            setEnviando(false);
        }
    };

    if (estado === 'ok') return <>{children}</>;

    return (
        <div className="min-h-screen bg-[#F2F2F4] flex items-center justify-center p-4 md:p-6">
            <PortalCard className="w-full max-w-md p-8">
                <div className="flex items-center gap-3 mb-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDEDE8] text-[#C24428]">
                        <ShieldCheck className="w-5 h-5" />
                    </span>
                    <div>
                        <h1 className="text-[15px] font-semibold text-[#1F2430]">Verificação em duas etapas</h1>
                        <p className="text-[12px] text-[#8A8F9A]">Obrigatória para acessar operações de crédito.</p>
                    </div>
                </div>

                {estado === 'verificando' && (
                    <div className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-[#E1553C] mx-auto" />
                        <p className="text-[13px] text-gray-400 mt-3">Verificando sua sessão...</p>
                    </div>
                )}

                {estado === 'erro' && (
                    <div className="space-y-4">
                        <p className="text-sm text-red-600">{erro}</p>
                        <div className="flex items-center justify-between">
                            <GhostButton onClick={onLogout}>Sair</GhostButton>
                            <PrimaryButton onClick={() => void verificar()}>Tentar novamente</PrimaryButton>
                        </div>
                    </div>
                )}

                {(estado === 'cadastrar' || estado === 'desafiar') && (
                    <form onSubmit={confirmar} className="space-y-5">
                        {estado === 'cadastrar' && (
                            <div className="space-y-3">
                                <p className="text-sm text-[#4A505C] leading-relaxed">
                                    Abra o seu aplicativo autenticador (Google Authenticator, Microsoft
                                    Authenticator, 1Password…) e escaneie o código abaixo.
                                </p>
                                {qrCode && (
                                    <div className="flex justify-center">
                                        <img src={qrCode} alt="QR Code do autenticador" className="w-44 h-44 rounded-lg border border-[#ECECEF] bg-white" />
                                    </div>
                                )}
                                {secret && (
                                    <p className="text-[12px] text-[#8A8F9A] text-center">
                                        Sem câmera? Digite a chave: <span className="font-mono text-[11px] text-[#4A505C]">{secret}</span>
                                    </p>
                                )}
                            </div>
                        )}
                        {estado === 'desafiar' && (
                            <p className="text-sm text-[#4A505C] leading-relaxed flex items-start gap-2">
                                <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-[#8A8F9A]" />
                                Digite o código de 6 dígitos do seu aplicativo autenticador.
                            </p>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">Código</label>
                            <input
                                autoFocus
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={codigo}
                                onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
                                className="w-full h-11 px-4 bg-white border border-[#ECECEF] rounded-[8px] text-lg tracking-[0.4em] text-center font-semibold text-[#1F2430] focus:outline-none focus:ring-2 focus:ring-[#E1553C]/25 focus:border-[#E1553C]"
                                placeholder="000000"
                            />
                        </div>

                        {erro && <p className="text-sm text-red-600">{erro}</p>}

                        <div className="flex items-center justify-between pt-1">
                            <GhostButton onClick={onLogout}>Sair</GhostButton>
                            <PrimaryButton type="submit" disabled={enviando || codigo.length < 6}>
                                {enviando ? 'Verificando...' : estado === 'cadastrar' ? 'Ativar e entrar' : 'Entrar'}
                            </PrimaryButton>
                        </div>
                    </form>
                )}
            </PortalCard>
        </div>
    );
};

export default LenderMfaGate;
