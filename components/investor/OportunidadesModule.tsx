import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useConfirm } from '../ui/confirm';
import { investorPortalService, type InvestorOpportunity } from '../../services/investorPortalService';
import { ehGestorDoInvestidor } from '../../utils/gestorDoInvestidor';
import OpportunitiesTab from './OpportunitiesTab';

/**
 * Incorporação › Oportunidades — o ÚNICO lugar para gerir oportunidades: criar, editar, publicar e os interesses
 * até virar sócio (plano docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md, F2).
 * Antes esta rota montava o painel do investidor inteiro (11 abas: Carteira, Fiscal, Financeiro...).
 *
 * REGRA #5: a organização é a do seletor do topo; "Todas" = null = sem filtro na leitura (a RLS recorta) e
 * criar pergunta a org (OpportunitiesTab → useOrgWriteTarget).
 */
interface Props {
    profile?: { group?: string; role?: string } | null;
}

const OportunidadesModule: React.FC<Props> = ({ profile }) => {
    const { orgId } = useOrgContext();
    const gestor = ehGestorDoInvestidor(profile);
    const [opportunities, setOpportunities] = React.useState<InvestorOpportunity[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const confirm = useConfirm();

    const carregar = React.useCallback(() => {
        let vivo = true;
        setCarregando(true);
        setErro(null);
        investorPortalService.listOpportunities(orgId, !gestor)
            .then(o => { if (vivo) setOpportunities(o); })
            .catch(e => { if (vivo) setErro((e as Error).message || 'Não foi possível carregar as oportunidades.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [orgId, gestor]);
    React.useEffect(() => carregar(), [carregar]);

    const openConfirm = async (msg: string, onConfirm: () => void) => {
        if (await confirm({ title: msg, variant: 'danger', confirmLabel: 'Remover' })) onConfirm();
    };

    const excluir = (id: string) => {
        investorPortalService.deleteOpportunity(id)
            .then(() => setOpportunities(prev => prev.filter(o => o.id !== id)))
            .catch(e => setErro(`Não foi possível excluir: ${(e as Error).message}`));
    };

    return (
        <div className="space-y-3">
            {erro && (
                <div role="alert" className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{erro} <button type="button" onClick={carregar} className="underline font-medium">Tentar novamente</button></span>
                </div>
            )}
            <OpportunitiesTab
                opportunities={opportunities}
                isAdmin={gestor}
                titulo="Oportunidades"
                loading={carregando}
                organizationId={orgId}
                onDelete={excluir}
                onUpdate={updated => setOpportunities(prev =>
                    prev.some(o => o.id === updated.id)
                        ? prev.map(o => (o.id === updated.id ? updated : o))
                        : [updated, ...prev])}
                openConfirm={openConfirm}
            />
        </div>
    );
};

export default OportunidadesModule;
