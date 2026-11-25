/**
 * Detalhe da oportunidade — UMA tela para o investidor (link) e para o gestor (app). Plano
 * docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md, F4: '"Ver" do gestor = a mesma
 * tela do portal, mais uma faixa só do gestor'. Antes o gestor abria outro detalhe (OpportunityDetail), com outras
 * abas e um formulário de interesse que o investidor nunca via.
 *
 * Origem (conferência de 16/11/2026, plano 2026-11-15-imovib-investidor-relatorio-e-dashboard, Fase 7): tela
 * própria — a lista sai enquanto o detalhe está aberto; "← Oportunidades" volta. Um cabeçalho só (nome, versão e
 * "Baixar relatório (PDF)") acima das abas.
 *
 * De onde lê (a `fonte`):
 * - investidor (`portalToken`): as RPCs do link — fn_investor_portal_get_versao, _get_obra, _get_acompanhamento.
 * - gestor (sem token): a versão pela sessão (imovibService.versaoPublicada, a RLS de membro) e a obra e o
 *   acompanhamento por fn_oportunidade_vista_do_gestor, que chama as MESMAS funções internas das RPCs do link.
 * - Documentos: DataRoomPanel — pelo token, só leitura; o gestor escolhe o que entra (isAdmin).
 */
import React from 'react';
import { ArrowLeft, Pencil, Users } from 'lucide-react';
import { investorPortalService, type InvestorOpportunity } from '../../../services/investorPortalService';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import { imovibService } from '../../../services/imovibService';
import { resultadosDoEstudo, type VersaoPublicada } from '../../../utils/imovibVersoes';
import { diferencasDaVersaoPublicada, textoDasDiferencas, type DiferencaDaVersao } from '../../../utils/imovibVersaoDesatualizada';
import type { RealizadoDoInvestidor } from '../../../utils/acompanhamentoDoInvestidor';
import { linhaDaVersao } from '../../../utils/imovibRelatorio';
import ImovibPainelDoInvestidor, { BotaoDoRelatorio } from './ImovibPainelDoInvestidor';
import DataRoomPanel from '../DataRoomPanel';
import ListasDaVersao from './ListasDaVersao';
import PortalAcompanhamento from './PortalAcompanhamento';
import ApresentacaoDaOportunidade, { type ObraAoVivo } from '../ApresentacaoDaOportunidade';
import { naVitrine } from '../../../utils/oportunidadeNumerosDaVersao';
import { PortalCard, PortalTabs, PortalLoading, GhostButton } from '../../portal/PortalKit';

export type AbaDoDetalhe = 'apresentacao' | 'acompanhamento' | 'viabilidade' | 'documentos';

/** Só no app: o que a faixa do gestor oferece. */
export interface DoGestor {
    onEditar: () => void;
    onVerInteresses: () => void;
    uploadedBy?: string;
}

interface Props {
    opportunity: InvestorOpportunity;
    /** Investidor pelo link. Sem ele, é o gestor no app (e `gestor` traz a faixa). */
    portalToken?: string;
    gestor?: DoGestor;
    aba: AbaDoDetalhe;
    onAba: (aba: AbaDoDetalhe) => void;
    /** Volta para a lista de oportunidades. */
    onVoltar: () => void;
}

interface Fonte {
    versao: () => Promise<VersaoPublicada>;
    obra: () => Promise<ObraAoVivo | null>;
    acompanhamento: () => Promise<RealizadoDoInvestidor | null>;
}

function fonteDaOportunidade(opportunity: InvestorOpportunity, portalToken?: string): Fonte {
    const id = opportunity.id!;
    if (portalToken) {
        return {
            versao: () => investorPortalTokenService.getVersaoPublicadaByToken(portalToken, id),
            obra: () => investorPortalTokenService.getObraDaOportunidadeByToken(portalToken, id),
            acompanhamento: () => investorPortalTokenService.getAcompanhamentoByToken(portalToken, id),
        };
    }
    let vista: ReturnType<typeof investorPortalService.vistaDoGestor> | null = null;
    const daVista = () => (vista ??= investorPortalService.vistaDoGestor(id));
    return {
        versao: () => opportunity.imovib_version_id
            ? imovibService.versaoPublicada(opportunity.imovib_version_id)
            : Promise.reject(new Error('Esta oportunidade ainda não tem a versão do estudo que o investidor vê: escolha-a em Editar.')),
        obra: () => daVista().then(v => v.obra),
        acompanhamento: () => daVista().then(v => v.acompanhamento),
    };
}

const PortalOportunidadeDetalhe: React.FC<Props> = ({ opportunity, portalToken, gestor, aba, onAba, onVoltar }) => {
    const comEstudo = !!opportunity.imovib_study_id;
    const ehGestor = !portalToken && !!gestor;
    const fonte = React.useMemo(() => fonteDaOportunidade(opportunity, portalToken),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [opportunity.id, opportunity.imovib_version_id, portalToken]);
    const [vp, setVp] = React.useState<VersaoPublicada | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [carregando, setCarregando] = React.useState(comEstudo);
    const ref = React.useRef<HTMLElement>(null);
    // Fase C8: a mesma apresentação para os dois (captação, ficha técnica, fotos, equipe, distâncias, simulador).
    const [obra, setObra] = React.useState<ObraAoVivo | null>(null);
    const op = React.useMemo(() => naVitrine(opportunity), [opportunity]);
    const fichaTecnica = (vp?.calculo?.secoes?.find(x => x.id === 'produto')?.tabelas?.[0]?.linhas ?? null) as [string, string][] | null;

    React.useEffect(() => {
        if (!opportunity.id) return;
        let vivo = true;
        fonte.obra()
            .then(o => { if (vivo) setObra(o); })
            .catch(() => { if (vivo) setObra(null); });
        return () => { vivo = false; };
    }, [opportunity.id, fonte]);

    React.useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [opportunity.id]);

    React.useEffect(() => {
        if (!comEstudo || !opportunity.id) return;
        let vivo = true;
        setCarregando(true);
        setErro(null);
        fonte.versao()
            .then(v => { if (vivo) setVp(v); })
            .catch(e => { if (vivo) { setVp(null); setErro((e as Error).message); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [comEstudo, opportunity.id, fonte]);

    const abas = [
        { id: 'apresentacao', label: 'Apresentação' },
        ...(comEstudo ? [{ id: 'acompanhamento', label: 'Acompanhamento' }] : []),
        ...(comEstudo ? [{ id: 'viabilidade', label: 'Viabilidade' }] : []),
        { id: 'documentos', label: 'Documentos' },
    ];

    return (
        <section ref={ref} aria-label={opportunity.title} className="scroll-mt-4 portal-entra space-y-3">
            <GhostButton onClick={onVoltar} aria-label="Voltar para Oportunidades" className="-ml-3">
                <ArrowLeft className="w-4 h-4" /> Oportunidades
            </GhostButton>
            {ehGestor && <FaixaDoGestor opportunity={opportunity} vp={vp} gestor={gestor!} />}
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
                    {aba === 'apresentacao' && <ApresentacaoDaOportunidade op={op} fichaTecnica={fichaTecnica} obra={obra} />}
                    {aba === 'acompanhamento' && comEstudo && <PortalAcompanhamento op={op} ler={fonte.acompanhamento} />}
                    {aba === 'viabilidade' && comEstudo && (
                        carregando ? <PortalLoading label="Carregando a viabilidade..." />
                            : erro ? <p role="alert" className="text-sm text-[#5F6573]">{erro}</p>
                                : vp ? (
                                    <div className="space-y-8">
                                        <ImovibPainelDoInvestidor versaoPublicada={vp} study={vp.study} cenarios={vp.cenarios} accent="portal" semTitulo />
                                        {/* Plano 2026-11-21, item 2.3: as listas da versão também na tela, não só no PDF. */}
                                        <ListasDaVersao versaoPublicada={vp} />
                                    </div>
                                )
                                    : null
                    )}
                    {aba === 'documentos' && opportunity.id && (
                        <DataRoomPanel
                            opportunityId={opportunity.id}
                            organizationId={opportunity.organization_id}
                            isAdmin={ehGestor}
                            uploadedBy={gestor?.uploadedBy}
                            empreendimentoId={ehGestor ? op.local?.empreendimento_id ?? null : undefined}
                            portalToken={portalToken}
                        />
                    )}
                </div>
            </PortalCard>
        </section>
    );
};

/**
 * Só no app, acima da tela que o investidor vê: o que é do gestor. Item 5.1 do plano 2026-11-21 (o estudo de hoje
 * já não bate com a versão publicada — o investidor nunca recebe o estudo vivo), os interesses e Editar.
 */
const FaixaDoGestor: React.FC<{ opportunity: InvestorOpportunity; vp: VersaoPublicada | null; gestor: DoGestor }> = ({ opportunity, vp, gestor }) => {
    const [diferencas, setDiferencas] = React.useState<DiferencaDaVersao[]>([]);
    const [interesses, setInteresses] = React.useState<number | null>(null);

    React.useEffect(() => {
        const ind = vp?.calculo?.indicadores;
        if (!ind || !opportunity.imovib_study_id) { setDiferencas([]); return; }
        let vivo = true;
        imovibService.getStudyById(opportunity.imovib_study_id, true)
            .then(atual => { if (vivo && atual) setDiferencas(diferencasDaVersaoPublicada({ vgv: ind.vgv, vpl: ind.vpl, tirAnual: ind.tirAnual, exposicaoMaxima: ind.exposicaoMaxima }, resultadosDoEstudo(atual))); })
            .catch(err => console.error('Erro ao comparar a versão com o estudo atual', err));
        return () => { vivo = false; };
    }, [vp, opportunity.imovib_study_id]);

    React.useEffect(() => {
        if (!opportunity.id) return;
        let vivo = true;
        investorPortalService.listInterests(opportunity.organization_id, opportunity.id)
            .then(l => { if (vivo) setInteresses(l.length); })
            .catch(() => { if (vivo) setInteresses(null); });
        return () => { vivo = false; };
    }, [opportunity.id, opportunity.organization_id]);

    return (
        <div role="region" aria-label="Só para o gestor" className="rounded-[10px] bg-slate-50 border border-slate-200 px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                    {opportunity.is_published ? 'Publicada' : 'Rascunho (o investidor ainda não vê)'} · abaixo, a tela como o investidor a vê.
                    {' '}Due diligence, riscos e comitê ficam no estudo de viabilidade.
                </p>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={gestor.onVerInteresses}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-[6px] hover:bg-slate-100">
                        <Users className="w-[15px] h-[15px]" /> Interesses{interesses != null ? ` (${interesses})` : ''}
                    </button>
                    <button type="button" onClick={gestor.onEditar}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-white bg-blue-600 rounded-[6px] hover:bg-blue-700">
                        <Pencil className="w-[15px] h-[15px]" /> Editar
                    </button>
                </div>
            </div>
            {diferencas.length > 0 && (
                <p role="status" className="text-sm text-amber-800">
                    O estudo mudou depois da versão que o investidor vê: {textoDasDiferencas(diferencas)}. Congele uma versão nova e escolha-a em Editar para atualizar a tela do investidor.
                </p>
            )}
        </div>
    );
};

export default PortalOportunidadeDetalhe;
