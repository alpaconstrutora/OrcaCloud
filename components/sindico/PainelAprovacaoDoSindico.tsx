import React from 'react';
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import { PortalCard, CardHeader, PrimaryButton, SoftButton, GhostButton, StatusPill, fmtBRLCents, fmtDate, type PillTone } from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { competencia } from '../client/CondominioTab';
import { sindicoPortalService, type IdentidadeDoSindico, type RateioParaSindico, type CondominioDoSindico } from '../../services/sindicoPortalService';
import { situacaoDaAprovacao, ROTULO_DA_APROVACAO, type SituacaoDaAprovacao } from '../../utils/aprovacaoRateio';

/**
 * Portal do Síndico › Prestação de contas › aprovação (F3): os rateios em
 * aberto (rascunho) com a decisão do síndico — aprovar ou devolver com o que
 * precisa ser revisto. O detalhe (despesas, cotas, PDF) continua no painel de
 * baixo, o mesmo do Portal do Cliente.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Decidir exige LOGIN (decisão do usuário, 20/10/2026): pelo link sem senha os
 * botões ficam desligados dizendo o caminho — o banco também recusa.
 */

const TOM: Record<SituacaoDaAprovacao, PillTone> = {
    AGUARDANDO: 'neutral', APROVADO: 'good', DEVOLVIDO: 'accent', DESATUALIZADA: 'neutral',
};

interface Props {
    identidade: IdentidadeDoSindico;
    rateios: RateioParaSindico[];
    condominios: CondominioDoSindico[];
    /** Entrou com e-mail e senha (não pelo link) e não é a prévia do admin. */
    podeDecidir: boolean;
    somenteLeitura: boolean;
    onAlterado: () => void;
    notify: (m: string, t?: 'success' | 'error') => void;
}

const PainelAprovacaoDoSindico: React.FC<Props> = ({ identidade, rateios, condominios, podeDecidir, somenteLeitura, onAlterado, notify }) => {
    const abertos = rateios.filter(r => r.status === 'RASCUNHO');
    const multi = condominios.length > 1;
    const exige = (id: string) => !!condominios.find(c => c.id === id)?.exigeAprovacao;
    const [devolvendo, setDevolvendo] = React.useState<RateioParaSindico | null>(null);
    const [obs, setObs] = React.useState('');
    const [ocupado, setOcupado] = React.useState<string | null>(null);

    if (abertos.length === 0) return null;

    const motivoBloqueio = somenteLeitura
        ? 'Prévia somente leitura.'
        : !podeDecidir ? 'Para aprovar ou devolver, entre no Portal do Síndico com seu e-mail e senha.' : null;

    const decidir = async (r: RateioParaSindico, decisao: 'APROVADO' | 'DEVOLVIDO', observacao: string) => {
        setOcupado(r.id);
        try {
            await sindicoPortalService.decidirRateio(identidade, r.id, decisao, observacao);
            notify(decisao === 'APROVADO' ? 'Rateio aprovado. A administração já pode fechá-lo.' : 'Rateio devolvido à administração.');
            setDevolvendo(null);
            onAlterado();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setOcupado(null);
        }
    };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Aguardando sua aprovação"
                    subtitle="Confira as despesas e as cotas abaixo antes de decidir"
                />
                <ul className="divide-y divide-[#ECECEF] border-t border-[#ECECEF]">
                    {abertos.map(r => {
                        const sit = situacaoDaAprovacao({ status: r.aprovacao?.status ?? null, desatualizada: !!r.aprovacao?.desatualizada });
                        return (
                            <li key={r.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-[#1F2430]">
                                            Rateio {competencia(r.competencia)}{multi ? ` · ${r.condominioNome}` : ''}
                                        </span>
                                        <StatusPill tone={TOM[sit]}>{ROTULO_DA_APROVACAO[sit]}</StatusPill>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {fmtBRLCents(Number(r.totalRateado) || 0)} rateados · {r.despesas.length} {r.despesas.length === 1 ? 'despesa' : 'despesas'}
                                        {exige(r.condominioId) ? ' · a administração só fecha com a sua aprovação' : ''}
                                    </p>
                                    {r.aprovacao?.status && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {[r.aprovacao.porNome, r.aprovacao.em ? fmtDate(r.aprovacao.em) : null, r.aprovacao.observacao].filter(Boolean).join(' · ')}
                                            {r.aprovacao.desatualizada ? ' · o rateio mudou depois da decisão' : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <SoftButton
                                        onClick={() => { setObs(''); setDevolvendo(r); }}
                                        disabled={!!motivoBloqueio || ocupado === r.id}
                                        title={motivoBloqueio ?? 'Devolver à administração com o que precisa ser revisto'}
                                    >
                                        <Undo2 className="w-4 h-4" /> Devolver
                                    </SoftButton>
                                    <PrimaryButton
                                        onClick={() => decidir(r, 'APROVADO', '')}
                                        disabled={!!motivoBloqueio || ocupado === r.id || (sit === 'APROVADO')}
                                        title={motivoBloqueio ?? (sit === 'APROVADO' ? 'Você já aprovou este rateio.' : 'Aprovar a prestação de contas desta competência')}
                                    >
                                        {ocupado === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Aprovar
                                    </PrimaryButton>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {motivoBloqueio && !somenteLeitura && (
                    <p className="px-5 pb-4 text-xs text-gray-500">{motivoBloqueio}</p>
                )}
            </PortalCard>

            <Sheet open={!!devolvendo} onClose={() => setDevolvendo(null)} size="md" dirty={!!obs.trim() && !ocupado}>
                <SheetHeader onClose={() => setDevolvendo(null)}>
                    <SheetTitle>Devolver o rateio</SheetTitle>
                    <SheetDescription>{devolvendo ? `Competência ${competencia(devolvendo.competencia)}` : ''}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-4 md:p-6">
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="devolver-obs">O que precisa ser revisto</label>
                        <textarea
                            id="devolver-obs" rows={6} value={obs} onChange={e => setObs(e.target.value)}
                            placeholder="Ex.: a despesa de jardinagem de setembro está em dobro."
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]"
                        />
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <GhostButton onClick={() => setDevolvendo(null)}>Cancelar</GhostButton>
                    <PrimaryButton
                        onClick={() => devolvendo && decidir(devolvendo, 'DEVOLVIDO', obs)}
                        disabled={!obs.trim() || !!ocupado}
                        title={!obs.trim() ? 'Diga o que precisa ser revisto.' : undefined}
                    >
                        {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}
                        Devolver
                    </PrimaryButton>
                </SheetFooter>
            </Sheet>
        </>
    );
};

export default PainelAprovacaoDoSindico;
