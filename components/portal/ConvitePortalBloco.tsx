import React, { useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';
import { portalInviteService, type PortalComConvite } from '../../services/portalInviteService';
import { ENTRADAS_DO_PORTAL } from '../../lib/entradasDoPortal';
import { ProfileGroup } from '../../types';

/**
 * "Acesso por e-mail e senha" — bloco do convite por e-mail, usado pelos
 * modais de acesso ao portal (Cliente: `client/ClientPortalLinkModal`;
 * Fornecedor: `supplier/SupplierPortalManager`; Corretor: `BrokerList`) e pelo
 * card Síndico de Portais › Portal do Condomínio (20/10/2026).
 * Pedido de 16/10/2026 (docs/planos/2026-10-16-portais-login-exclusivo-convite.md).
 *
 * Um bloco, três telas — nunca três cópias. Quem toasta é o pai (cada tela tem
 * o seu toast); este bloco só devolve o resultado por `onResultado`.
 */
interface Props {
    portal: PortalComConvite;
    /** id do cadastro (clients / suppliers / broker_profiles); no síndico, do CONDOMÍNIO. */
    id: string;
    email?: string | null;
    /** `portal_invited_at` do cadastro, se já houve convite. */
    invitedAt?: string | null;
    onResultado: (r: { ok: boolean; mensagem: string; invitedAt?: string }) => void;
}

const GRUPO: Record<PortalComConvite, ProfileGroup> = {
    cliente: ProfileGroup.CLIENT,
    fornecedor: ProfileGroup.SUPPLIER,
    corretor: ProfileGroup.BROKER,
    sindico: ProfileGroup.SINDICO,
};

const formatarDataHora = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ConvitePortalBloco: React.FC<Props> = ({ portal, id, email, invitedAt, onResultado }) => {
    const entrada = ENTRADAS_DO_PORTAL[GRUPO[portal]]!;
    const [enviando, setEnviando] = useState(false);
    const [ultimoEnvio, setUltimoEnvio] = useState<string | null>(invitedAt ?? null);
    const emailLimpo = (email || '').trim().toLowerCase();
    const semEmail = !emailLimpo;
    const rotaCompleta = `${typeof window !== 'undefined' ? window.location.origin : ''}${entrada.rota}`;

    const enviar = async () => {
        if (semEmail || enviando) return;
        setEnviando(true);
        try {
            const { kind, invitedAt: quando } = await portalInviteService.enviarConvite(portal, id);
            setUltimoEnvio(quando);
            onResultado({
                ok: true,
                invitedAt: quando,
                mensagem: kind === 'invite'
                    ? `Convite enviado para ${emailLimpo}.`
                    : `Convite enviado para ${emailLimpo}. O e-mail já tinha cadastro: o link é para redefinir a senha.`,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            onResultado({ ok: false, mensagem: `O convite não foi enviado${msg ? `: ${msg}` : '.'}` });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="rounded-[10px] border border-slate-200 bg-white p-4 space-y-3" data-testid="convite-portal">
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${entrada.cores.iconeMovel} text-white`}>
                    <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">Acesso por e-mail e senha</p>
                    <p className="text-xs text-slate-500">
                        {semEmail
                            ? 'Este cadastro não tem e-mail. Preencha o e-mail para enviar o convite.'
                            : <>A pessoa recebe um e-mail para criar a senha e entra em <span className="font-medium text-slate-700 break-all">{rotaCompleta}</span>.</>}
                    </p>
                    {!semEmail && <p className="mt-1 text-xs text-slate-600 break-all">{emailLimpo}</p>}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                    {ultimoEnvio ? `Convite enviado em ${formatarDataHora(ultimoEnvio)}` : 'Nenhum convite enviado ainda'}
                </p>
                <div className="flex flex-col items-end gap-1">
                    <button
                        type="button"
                        onClick={enviar}
                        disabled={semEmail || enviando}
                        aria-describedby={semEmail ? `convite-motivo-${id}` : undefined}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${entrada.cores.botao}`}
                    >
                        {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                        {enviando ? 'Enviando…' : ultimoEnvio ? 'Reenviar convite' : 'Enviar convite'}
                    </button>
                    {semEmail && <p id={`convite-motivo-${id}`} className="text-[11px] text-slate-400">Sem e-mail no cadastro.</p>}
                </div>
            </div>
        </div>
    );
};

export default ConvitePortalBloco;
