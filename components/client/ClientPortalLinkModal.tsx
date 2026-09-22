import React from 'react';
import { Link2, Copy, Check, RefreshCw, X, Loader2 } from 'lucide-react';
import { Client } from '../../types';
import { clientPortalService, ClientPortalToken } from '../../services/clientPortalService';
import { useOrgContext, useOrgWriteTarget, targetOrgIds } from '../../hooks/useOrgContext';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import ActionIconButton from '../ui/ActionIconButton';

interface ClientPortalLinkModalProps {
    client: Client;
    /** Organização vinda da tela (prop do AppRouter). `null`/ausente = "Todas". */
    organizationId?: string | null;
    onClose: () => void;
}

/**
 * Modal "Link de Acesso" do Portal do Cliente — gerar, copiar, regenerar e
 * revogar o link público (sem login) de UM cliente.
 *
 * Vivia dentro de `ClientList.tsx` (estado + 3 handlers + JSX). Saiu de lá
 * quando o painel do cliente (`ClientArea`, visão do cliente pelo gestor)
 * ganhou o botão "Link de Acesso" no topo, espelhando o Portal do Fornecedor
 * (`SupplierPortalManager`): duas telas, um modal — nunca duas cópias.
 *
 * O componente é dono do próprio estado (token, carregando, copiado) e carrega
 * o token ao montar; quem o usa só decide QUANDO ele existe (`{cliente && <… />}`).
 */
const ClientPortalLinkModal: React.FC<ClientPortalLinkModalProps> = ({ client, organizationId, onClose }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    // REGRA #5: o seletor do topo manda; sem topo, a organização do próprio
    // cliente (entidade-pai); sem as duas, o hook pergunta (modo 'single' — o
    // link tem UMA organização dona). Nunca `organizations[0]`.
    const { orgId: orgDoTopo } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [token, setToken] = React.useState<ClientPortalToken | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [copied, setCopied] = React.useState(false);
    // Quantas unidades de condomínio este cliente ocupa. Serve só para AVISAR
    // quem gera o link — sem isso, ninguém descobre que o mesmo link abre a aba
    // Condomínio, e o portal do condômino continua sendo emitido à toa.
    const [unidadesDoCliente, setUnidadesDoCliente] = React.useState<number | null>(null);

    React.useEffect(() => {
        let vivo = true;
        setLoading(true);
        setUnidadesDoCliente(null);
        clientPortalService.getTokenForClient(client.id)
            .then((tok) => { if (vivo) setToken(tok); })
            .catch((e) => console.error(e))
            .finally(() => { if (vivo) setLoading(false); });
        // Depois e à parte: é informativo, e falhar aqui não pode impedir de
        // copiar o link.
        clientPortalService.getCondominioForClient(client.id)
            .then((c) => { if (vivo) setUnidadesDoCliente(c.unidades.length); })
            .catch(() => { if (vivo) setUnidadesDoCliente(null); });
        return () => { vivo = false; };
    }, [client.id]);

    const handleGenerateToken = async () => {
        let orgId: string | null = organizationId || orgDoTopo || client.organization_id || null;
        if (!orgId) {
            const alvo = await resolveWriteOrg('single');
            if (!alvo) return; // cancelou, ou não pertence a organização nenhuma
            orgId = targetOrgIds(alvo)[0] ?? null;
        }
        if (!orgId) {
            showToast('Selecione uma organização específica no seletor do topo para gerar o link de acesso.', 'error');
            return;
        }
        setLoading(true);
        try {
            await clientPortalService.generateToken(client.id, orgId);
            setToken(await clientPortalService.getTokenForClient(client.id));
            showToast('Link gerado com sucesso!', 'success');
        } catch (e) {
            console.error('[ClientPortal] Erro ao gerar token:', e);
            showToast('Erro ao gerar link.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!token) return;
        await navigator.clipboard.writeText(clientPortalService.buildPortalUrl(token.token));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevokeToken = async () => {
        const ok = await confirm({
            title: 'Revogar acesso ao portal?',
            message: 'O cliente perderá o acesso ao portal através deste link.',
            variant: 'warning',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
        setLoading(true);
        try {
            await clientPortalService.revokeToken(client.id);
            setToken(null);
            showToast('Acesso revogado.', 'success');
        } catch (e) {
            showToast('Erro ao revogar.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        {/* Fora do overlay: o clique dentro da pergunta de organização não pode
            borbulhar até o `onClick={onClose}` do fundo. E z-[200] < 210 do
            `orgTargetModal`, para a pergunta ficar POR CIMA deste modal. */}
        {orgTargetModal}
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md p-8 space-y-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Link de Acesso</h3>
                        <p className="text-sm text-gray-400 font-medium mt-0.5">{client.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-[6px] hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    </div>
                ) : token && token.is_active ? (
                    <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-[10px] p-4">
                            <p className="text-xs font-semibold text-emerald-600 mb-2">Link ativo</p>
                            <p className="text-xs text-gray-700 break-all leading-relaxed">
                                {clientPortalService.buildPortalUrl(token.token)}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                                Expira em: {new Date(token.expires_at).toLocaleDateString('pt-BR')}
                                {token.last_used_at && ` · Último acesso: ${new Date(token.last_used_at).toLocaleDateString('pt-BR')}`}
                            </p>
                            {/* O mesmo link abre o condomínio — a razão de existir da
                                aba. Sem dizer aqui, quem gera continua mandando dois. */}
                            {!!unidadesDoCliente && (
                                <p className="text-xs text-emerald-700 mt-2 pt-2 border-t border-emerald-100">
                                    Este cliente ocupa {unidadesDoCliente === 1 ? '1 unidade' : `${unidadesDoCliente} unidades`} de condomínio.
                                    Habilite a aba <strong>Condomínio</strong> no portal e este mesmo link mostra
                                    unidades, avisos e documentos do prédio.
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopyLink}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copiado!' : 'Copiar Link'}
                            </button>
                            <ActionIconButton
                                kind="history"
                                title="Gerar novo link (invalida o anterior)"
                                icon={<RefreshCw className="w-4 h-4" />}
                                onClick={handleGenerateToken}
                            />
                            <ActionIconButton kind="delete" title="Revogar acesso" onClick={handleRevokeToken} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-6 text-center">
                            <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                            <p className="text-xs text-gray-400 mt-1">Gere um link para que o cliente acesse o portal sem precisar de cadastro.</p>
                        </div>
                        <button
                            onClick={handleGenerateToken}
                            className="w-full flex items-center justify-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <Link2 className="w-4 h-4" />
                            Gerar Link de Acesso
                        </button>
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

export default ClientPortalLinkModal;
