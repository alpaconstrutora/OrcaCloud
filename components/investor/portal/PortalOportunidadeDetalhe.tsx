/**
 * Detalhe da oportunidade no Portal do Investidor pelo LINK (conferência de 16/11/2026, plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 7). Antes, pelo link, a
 * oportunidade era só uma linha que expandia: o painel de viabilidade, o PDF e o Data Room viviam no
 * detalhe do app interno. No vocabulário do portal (§24).
 *
 * Tela própria (pedido de 16/11/2026: a lista ocupava metade da tela e empurrava o painel para baixo):
 * a lista sai enquanto o detalhe está aberto; "← Oportunidades" volta. Um cabeçalho só — nome, versão
 * e "Baixar relatório (PDF)" — acima das abas; o painel vem sem o título que repetia a aba.
 *
 * - Viabilidade: a versão publicada (fn_investor_portal_get_versao, pela oportunidade) no
 *   ImovibPainelDoInvestidor. Lida uma vez ao abrir: o cabeçalho a mostra nas duas abas.
 * - Documentos: o Data Room pelo token (DataRoomPanel em modo portal).
 */
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { InvestorOpportunity } from '../../../services/investorPortalService';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import type { VersaoPublicada } from '../../../utils/imovibVersoes';
import { linhaDaVersao } from '../../../utils/imovibRelatorio';
import ImovibPainelDoInvestidor, { BotaoDoRelatorio } from './ImovibPainelDoInvestidor';
import DataRoomPanel from '../DataRoomPanel';
import { PortalCard, PortalTabs, PortalLoading, GhostButton } from '../../portal/PortalKit';

export type AbaDoDetalhe = 'viabilidade' | 'documentos';

interface Props {
    opportunity: InvestorOpportunity;
    portalToken: string;
    aba: AbaDoDetalhe;
    onAba: (aba: AbaDoDetalhe) => void;
    /** Volta para a lista de oportunidades. */
    onVoltar: () => void;
}

const PortalOportunidadeDetalhe: React.FC<Props> = ({ opportunity, portalToken, aba, onAba, onVoltar }) => {
    const comEstudo = !!opportunity.imovib_study_id;
    const [vp, setVp] = React.useState<VersaoPublicada | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [carregando, setCarregando] = React.useState(comEstudo);
    const ref = React.useRef<HTMLElement>(null);

    React.useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [opportunity.id]);

    React.useEffect(() => {
        if (!comEstudo || !opportunity.id) return;
        let vivo = true;
        setCarregando(true);
        setErro(null);
        investorPortalTokenService.getVersaoPublicadaByToken(portalToken, opportunity.id)
            .then(v => { if (vivo) setVp(v); })
            .catch(e => { if (vivo) { setVp(null); setErro((e as Error).message); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [comEstudo, opportunity.id, portalToken]);

    const abas = [
        ...(comEstudo ? [{ id: 'viabilidade', label: 'Viabilidade' }] : []),
        { id: 'documentos', label: 'Documentos' },
    ];

    return (
        <section ref={ref} aria-label={opportunity.title} className="scroll-mt-4 portal-entra space-y-3">
            <GhostButton onClick={onVoltar} aria-label="Voltar para Oportunidades" className="-ml-3">
                <ArrowLeft className="w-4 h-4" /> Oportunidades
            </GhostButton>
            <PortalCard className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4 pb-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-[#1F2430] tracking-tight [text-wrap:balance]">{opportunity.title}</h3>
                        {vp && <p className="text-[13px] text-[#5F6573] mt-0.5">{linhaDaVersao(vp.versao)}</p>}
                    </div>
                    {vp && <BotaoDoRelatorio versaoPublicada={vp} accent="portal" />}
                </div>
                <PortalTabs tabs={abas} active={aba} onChange={id => onAba(id as AbaDoDetalhe)} />
                {/* key: trocar de aba entra o conteúdo novo (portal-troca, index.css). */}
                <div key={aba} className="p-5 portal-troca">
                    {aba === 'viabilidade' && comEstudo && (
                        carregando ? <PortalLoading label="Carregando a viabilidade..." />
                            : erro ? <p role="alert" className="text-sm text-[#5F6573]">{erro}</p>
                                : vp ? <ImovibPainelDoInvestidor versaoPublicada={vp} study={vp.study} cenarios={vp.cenarios} accent="portal" semTitulo />
                                    : null
                    )}
                    {aba === 'documentos' && opportunity.id && (
                        <DataRoomPanel
                            opportunityId={opportunity.id}
                            organizationId={opportunity.organization_id}
                            isAdmin={false}
                            portalToken={portalToken}
                        />
                    )}
                </div>
            </PortalCard>
        </section>
    );
};

export default PortalOportunidadeDetalhe;
