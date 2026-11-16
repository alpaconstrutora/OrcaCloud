/**
 * Detalhe da oportunidade no Portal do Investidor pelo LINK (conferência de 16/11/2026, plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 7). Antes, pelo link, a
 * oportunidade era só uma linha que expandia: o painel de viabilidade, o PDF e o Data Room viviam no
 * detalhe do app interno. Abre abaixo da lista (não em tela cheia), no vocabulário do portal (§24).
 *
 * - Viabilidade: a versão publicada (fn_investor_portal_get_versao, pela oportunidade) no
 *   ImovibPainelDoInvestidor, com o botão do PDF.
 * - Documentos: o Data Room pelo token (DataRoomPanel em modo portal).
 */
import React from 'react';
import { X } from 'lucide-react';
import type { InvestorOpportunity } from '../../../services/investorPortalService';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import type { VersaoPublicada } from '../../../utils/imovibVersoes';
import ImovibPainelDoInvestidor from './ImovibPainelDoInvestidor';
import DataRoomPanel from '../DataRoomPanel';
import { PortalCard, PortalTabs, PortalLoading, GhostButton } from '../../portal/PortalKit';

export type AbaDoDetalhe = 'viabilidade' | 'documentos';

interface Props {
    opportunity: InvestorOpportunity;
    portalToken: string;
    aba: AbaDoDetalhe;
    onAba: (aba: AbaDoDetalhe) => void;
    onFechar: () => void;
}

const PortalOportunidadeDetalhe: React.FC<Props> = ({ opportunity, portalToken, aba, onAba, onFechar }) => {
    const comEstudo = !!opportunity.imovib_study_id;
    const [vp, setVp] = React.useState<VersaoPublicada | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [carregando, setCarregando] = React.useState(false);
    const ref = React.useRef<HTMLElement>(null);

    React.useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [opportunity.id]);

    React.useEffect(() => {
        if (!comEstudo || aba !== 'viabilidade' || !opportunity.id) return;
        let vivo = true;
        setCarregando(true);
        setErro(null);
        investorPortalTokenService.getVersaoPublicadaByToken(portalToken, opportunity.id)
            .then(v => { if (vivo) setVp(v); })
            .catch(e => { if (vivo) { setVp(null); setErro((e as Error).message); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [comEstudo, aba, opportunity.id, portalToken]);

    const abas = [
        ...(comEstudo ? [{ id: 'viabilidade', label: 'Viabilidade' }] : []),
        { id: 'documentos', label: 'Documentos' },
    ];

    return (
        <section ref={ref} aria-label={opportunity.title} className="scroll-mt-4 portal-entra">
            <PortalCard className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 pt-4">
                    <h3 className="text-[15px] font-semibold text-[#1F2430] tracking-tight truncate">{opportunity.title}</h3>
                    <GhostButton onClick={onFechar} aria-label="Fechar o detalhe">
                        <X className="w-4 h-4" /> Fechar
                    </GhostButton>
                </div>
                <PortalTabs tabs={abas} active={aba} onChange={id => onAba(id as AbaDoDetalhe)} />
                {/* key: trocar de aba entra o conteúdo novo (portal-troca, index.css). */}
                <div key={aba} className="p-5 portal-troca">
                    {aba === 'viabilidade' && comEstudo && (
                        carregando ? <PortalLoading label="Carregando a viabilidade..." />
                            : erro ? <p role="alert" className="text-sm text-[#5F6573]">{erro}</p>
                                : vp ? <ImovibPainelDoInvestidor versaoPublicada={vp} study={vp.study} cenarios={vp.cenarios} accent="portal" />
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
