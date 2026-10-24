import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Plus, Receipt, Undo2, XCircle } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PrimaryButton, SoftButton, StatusPill, fmtBRLCents, fmtDate, type PillTone,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { competencia } from '../client/CondominioTab';
import NovoRateioSheet from './NovoRateioSheet';
import {
    sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico, type RateioParaSindico, type UnidadeParaSindico,
} from '../../services/sindicoPortalService';
import {
    CRITERIOS_DO_RATEIO, ROTULO_SITUACAO_DO_RATEIO, motivoNaoCancelaRateio, motivoNaoFechaRateio, motivoNaoGeraCotas,
    situacaoDoRateio, type CotaParaGerar, type PagadorDaCota, type SituacaoDoRateio,
} from '../../utils/rateioDoSindico';
import { situacaoDaAprovacao, ROTULO_DA_APROVACAO } from '../../utils/aprovacaoRateio';

/**
 * Portal do Síndico › Prestação de contas › Rateios (G1, 24/10/2026).
 * Pedido: "o sindico é o gerenciador / executor do condominio e ele precisa de
 * total acesso para edicao" — pelo portal (ele não é da construtora).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O síndico monta o rateio do mês, fecha e gera as cotas (recebíveis). Fechar
 * é a aprovação dele — o banco grava as duas coisas juntas. "Devolver" fica
 * para o rateio que a administração preparou num condomínio que exige a
 * aprovação do síndico (F3 de 20/10). O detalhe (despesas, cotas, PDF) segue no
 * painel de baixo, o mesmo do Portal do Cliente.
 *
 * Gravar exige LOGIN: pelo link e na prévia do admin os botões ficam
 * desligados dizendo o motivo, e o banco recusa do mesmo jeito.
 */

const TOM: Record<SituacaoDoRateio, PillTone> = {
    RASCUNHO: 'neutral', FECHADO: 'info', COTAS_PARCIAIS: 'accent', COTAS_GERADAS: 'good',
};

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const rotuloDoCriterio = (c: string) => CRITERIOS_DO_RATEIO.find(x => x.id === c)?.label ?? c;

interface Props {
    identidade: IdentidadeDoSindico;
    /** Rateios do condomínio escolhido (rascunho e fechado; cancelado não chega). */
    rateios: RateioParaSindico[];
    condominio: CondominioDoSindico | null;
    unidades: UnidadeParaSindico[];
    /** Motivo de não poder gravar (link sem senha, prévia, condomínio sem org própria). */
    motivoBase: string | null;
    onAlterado: () => void;
    notify: (m: string, t?: 'success' | 'error') => void;
}

/** Botão com o motivo no `title` mesmo desligado (o navegador some com o title de botão disabled). */
const ComMotivo: React.FC<React.PropsWithChildren<{ motivo: string | null; dica?: string }>> = ({ motivo, dica, children }) => (
    <span title={motivo ?? dica} className={motivo ? '[&>button]:pointer-events-none' : ''}>{children}</span>
);

const PainelRateiosDoSindico: React.FC<Props> = ({ identidade, rateios, condominio, unidades, motivoBase, onAlterado, notify }) => {
    const confirm = useConfirm();
    const [novo, setNovo] = React.useState(false);
    const [ocupado, setOcupado] = React.useState<string | null>(null);
    const [devolvendo, setDevolvendo] = React.useState<RateioParaSindico | null>(null);
    const [cancelando, setCancelando] = React.useState<RateioParaSindico | null>(null);
    const [gerando, setGerando] = React.useState<RateioParaSindico | null>(null);

    const lista = React.useMemo(
        () => [...rateios].sort((a, b) => b.competencia.localeCompare(a.competencia) || a.tipo.localeCompare(b.tipo)),
        [rateios]);
    const exigeAprovacao = !!condominio?.exigeAprovacao;

    const fechar = async (r: RateioParaSindico) => {
        const ok = await confirm({
            title: `Fechar o rateio de ${competencia(r.competencia)}?`,
            message: 'Fechado, as despesas e as cotas viram a prestação de contas do mês e não mudam mais. Fechar também registra a sua aprovação.',
            confirmLabel: 'Fechar rateio',
        });
        if (!ok) return;
        setOcupado(r.id);
        try {
            const numero = await sindicoPortalService.rateioFechar(identidade, r.id);
            notify(`Rateio ${numero} fechado. Agora você pode gerar as cotas.`);
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
                    title="Rateios do condomínio"
                    subtitle="Monte o rateio do mês, feche e gere as cotas de cada unidade"
                    right={
                        <ComMotivo motivo={motivoBase}>
                            <PrimaryButton onClick={() => setNovo(true)} disabled={!!motivoBase}>
                                <Plus className="w-4 h-4" /> Novo rateio
                            </PrimaryButton>
                        </ComMotivo>
                    }
                />
                {lista.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-gray-500">Nenhum rateio em aberto ou fechado neste condomínio.</p>
                ) : (
                    <ul className="divide-y divide-[#ECECEF] border-t border-[#ECECEF]">
                        {lista.map(r => {
                            const sit = situacaoDoRateio(r);
                            const aprov = situacaoDaAprovacao({ status: r.aprovacao?.status ?? null, desatualizada: !!r.aprovacao?.desatualizada });
                            const mFechar = motivoNaoFechaRateio(r, motivoBase);
                            const mCotas = motivoNaoGeraCotas(r, motivoBase);
                            const mCancelar = motivoNaoCancelaRateio(r, motivoBase);
                            const geradas = r.cotas.filter(c => !!c.tituloStatus).length;
                            return (
                                <li key={r.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-[#1F2430]">
                                                Rateio {competencia(r.competencia)}{r.tipo === 'EXTRAORDINARIO' ? ' · extraordinário' : ''}
                                            </span>
                                            <StatusPill tone={TOM[sit]}>{ROTULO_SITUACAO_DO_RATEIO[sit]}</StatusPill>
                                            {r.numero && <span className="text-xs text-gray-500">{r.numero}</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {rotuloDoCriterio(r.criterio)} · {fmtBRLCents(Number(r.totalRateado) || 0)} em {r.cotas.length} {r.cotas.length === 1 ? 'cota' : 'cotas'}
                                            {' · '}{r.despesas.length} {r.despesas.length === 1 ? 'despesa' : 'despesas'}
                                            {r.status === 'FECHADO' && r.cotas.length > 0 ? ` · ${geradas} de ${r.cotas.length} cotas geradas` : ''}
                                        </p>
                                        {r.status === 'RASCUNHO' && r.aprovacao?.status && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                {ROTULO_DA_APROVACAO[aprov]} · {[r.aprovacao.porNome, r.aprovacao.em ? fmtDate(r.aprovacao.em) : null, r.aprovacao.observacao].filter(Boolean).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <ComMotivo motivo={mCancelar} dica="Cancelar este rateio (o motivo fica registrado)">
                                            <GhostButton onClick={() => setCancelando(r)} disabled={!!mCancelar || ocupado === r.id}>
                                                <XCircle className="w-4 h-4" /> Cancelar
                                            </GhostButton>
                                        </ComMotivo>
                                        {r.status === 'RASCUNHO' && exigeAprovacao && (
                                            <ComMotivo motivo={motivoBase} dica="Devolver à administração com o que precisa ser revisto">
                                                <SoftButton onClick={() => setDevolvendo(r)} disabled={!!motivoBase || ocupado === r.id}>
                                                    <Undo2 className="w-4 h-4" /> Devolver
                                                </SoftButton>
                                            </ComMotivo>
                                        )}
                                        {r.status === 'RASCUNHO' ? (
                                            <ComMotivo motivo={mFechar} dica="Fechar a prestação de contas desta competência">
                                                <PrimaryButton onClick={() => fechar(r)} disabled={!!mFechar || ocupado === r.id}>
                                                    {ocupado === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                                    Fechar
                                                </PrimaryButton>
                                            </ComMotivo>
                                        ) : (
                                            <ComMotivo motivo={mCotas} dica="Gerar a cobrança de cada unidade em Contas a receber">
                                                <PrimaryButton onClick={() => setGerando(r)} disabled={!!mCotas || ocupado === r.id}>
                                                    <Receipt className="w-4 h-4" /> Gerar cotas
                                                </PrimaryButton>
                                            </ComMotivo>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {motivoBase && (
                    <p className="px-5 pb-4 text-xs text-gray-500">{motivoBase}</p>
                )}
            </PortalCard>

            <NovoRateioSheet
                open={novo}
                identidade={identidade}
                condominioId={condominio?.id ?? null}
                condominioNome={condominio?.nome ?? ''}
                unidades={unidades}
                motivoBase={motivoBase}
                onClose={() => setNovo(false)}
                onSalvo={m => { setNovo(false); notify(m); onAlterado(); }}
            />
            <DevolverSheet rateio={devolvendo} identidade={identidade} onClose={() => setDevolvendo(null)}
                onFeito={() => { setDevolvendo(null); notify('Rateio devolvido à administração.'); onAlterado(); }} />
            <CancelarRateioSheet rateio={cancelando} identidade={identidade} onClose={() => setCancelando(null)}
                onFeito={() => { setCancelando(null); notify('Rateio cancelado.'); onAlterado(); }} />
            <GerarCotasSheet rateio={gerando} identidade={identidade} onClose={() => setGerando(null)}
                onFeito={m => { setGerando(null); notify(m); onAlterado(); }} />
        </>
    );
};

// ── Devolver (rateio da administração que exige a aprovação do síndico) ─────
const DevolverSheet: React.FC<{
    rateio: RateioParaSindico | null; identidade: IdentidadeDoSindico; onClose: () => void; onFeito: () => void;
}> = ({ rateio, identidade, onClose, onFeito }) => {
    const [obs, setObs] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (rateio) { setObs(''); setErro(null); } }, [rateio]);

    const enviar = async () => {
        if (!rateio || !obs.trim()) return;
        setSalvando(true); setErro(null);
        try {
            await sindicoPortalService.decidirRateio(identidade, rateio.id, 'DEVOLVIDO', obs.trim());
            onFeito();
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!rateio} onClose={onClose} size="md" dirty={!!obs.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Devolver o rateio</SheetTitle>
                <SheetDescription>{rateio ? `Competência ${competencia(rateio.competencia)}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-1.5">
                    <label className={ROTULO} htmlFor="devolver-obs">O que precisa ser revisto</label>
                    <textarea id="devolver-obs" rows={6} value={obs} onChange={e => setObs(e.target.value)}
                        placeholder="Ex.: a despesa de jardinagem de setembro está em dobro."
                        className={`${CAMPO} h-auto py-2`} />
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <ComMotivo motivo={!obs.trim() ? 'Diga o que precisa ser revisto.' : null}>
                        <PrimaryButton onClick={enviar} disabled={!obs.trim() || salvando}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Devolver
                        </PrimaryButton>
                    </ComMotivo>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

// ── Cancelar (motivo obrigatório, fica nas observações do rateio) ───────────
const CancelarRateioSheet: React.FC<{
    rateio: RateioParaSindico | null; identidade: IdentidadeDoSindico; onClose: () => void; onFeito: () => void;
}> = ({ rateio, identidade, onClose, onFeito }) => {
    const [motivo, setMotivo] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (rateio) { setMotivo(''); setErro(null); } }, [rateio]);

    const enviar = async () => {
        if (!rateio || !motivo.trim()) return;
        setSalvando(true); setErro(null);
        try {
            await sindicoPortalService.rateioCancelar(identidade, rateio.id, motivo.trim());
            onFeito();
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!rateio} onClose={onClose} size="md" dirty={!!motivo.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Cancelar o rateio</SheetTitle>
                <SheetDescription>
                    {rateio ? `Competência ${competencia(rateio.competencia)} · ${rateio.status === 'FECHADO' ? 'fechado, sem cotas geradas' : 'rascunho'}` : ''}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-1.5">
                    <label className={ROTULO} htmlFor="cancelar-rateio-motivo">Por que cancelar</label>
                    <textarea id="cancelar-rateio-motivo" rows={4} value={motivo} maxLength={500} onChange={e => setMotivo(e.target.value)}
                        placeholder="Ex.: faltou a conta de água; vou refazer."
                        className={`${CAMPO} h-auto py-2`} />
                    <p className="text-xs text-gray-500">As despesas voltam a ficar disponíveis para um novo rateio da competência.</p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <ComMotivo motivo={!motivo.trim() ? 'Diga por que o rateio está sendo cancelado.' : null}>
                        <PrimaryButton onClick={enviar} disabled={!motivo.trim() || salvando}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancelar rateio
                        </PrimaryButton>
                    </ComMotivo>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

// ── Gerar cotas (recebíveis) — vencimento e de quem cobrar ──────────────────
const GerarCotasSheet: React.FC<{
    rateio: RateioParaSindico | null; identidade: IdentidadeDoSindico; onClose: () => void; onFeito: (m: string) => void;
}> = ({ rateio, identidade, onClose, onFeito }) => {
    const [vencimento, setVencimento] = React.useState('');
    const [pagador, setPagador] = React.useState<PagadorDaCota>('RESPONSAVEL');
    const [cotas, setCotas] = React.useState<CotaParaGerar[] | null>(null);
    const [erroCotas, setErroCotas] = React.useState<string | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!rateio) return;
        setVencimento(''); setErro(null);
        setPagador(rateio.tipo === 'EXTRAORDINARIO' ? 'PROPRIETARIO' : 'RESPONSAVEL');
    }, [rateio]);

    React.useEffect(() => {
        if (!rateio) return;
        let vivo = true;
        setCotas(null); setErroCotas(null);
        sindicoPortalService.rateioCotas(identidade, rateio.id, pagador)
            .then(c => { if (vivo) setCotas(c); })
            .catch(e => { if (vivo) setErroCotas((e as Error).message); });
        return () => { vivo = false; };
    }, [rateio, identidade, pagador]);

    const cobraveis = (cotas ?? []).filter(c => !c.bloqueio);
    const total = cobraveis.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const motivo = !vencimento ? 'Informe o vencimento das cotas.'
        : !cotas ? 'Carregando as cotas…'
            : cobraveis.length === 0 ? 'Nenhuma cota pode ser gerada — veja o motivo em cada unidade.' : null;

    const enviar = async () => {
        if (!rateio || motivo) return;
        setSalvando(true); setErro(null);
        try {
            const r = await sindicoPortalService.rateioGerarCotas(identidade, rateio.id, vencimento, pagador);
            const partes = [`${r.criados} ${r.criados === 1 ? 'cota gerada' : 'cotas geradas'} em Contas a receber`];
            if (r.pulados > 0) partes.push(`${r.pulados} ficaram de fora (sem pagador ou documento)`);
            if (r.falhas.length > 0) partes.push(`${r.falhas.length} falharam: ${r.falhas.map(f => f.unitLabel).join(', ')}`);
            onFeito(partes.join(' · ') + '.');
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!rateio} onClose={onClose} size="lg" dirty={!!vencimento && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Gerar as cotas</SheetTitle>
                <SheetDescription>
                    {rateio ? `Rateio ${rateio.numero ?? ''} · competência ${competencia(rateio.competencia)} — cada cota vira um título em Contas a receber` : ''}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="cotas-venc">Vencimento</label>
                            <input id="cotas-venc" type="date" className={CAMPO} value={vencimento}
                                onChange={e => setVencimento(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="cotas-pagador">Cobrar de</label>
                            <select id="cotas-pagador" className={CAMPO} value={pagador} onChange={e => setPagador(e.target.value as PagadorDaCota)}>
                                <option value="RESPONSAVEL">Responsável financeiro</option>
                                <option value="PROPRIETARIO">Proprietário</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[#1F2430]">
                            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#E1553C]" /> Cotas</span>
                            {cotas && <span className="text-sm font-medium tabular-nums">{cobraveis.length} · {fmtBRLCents(total)}</span>}
                        </div>
                        {erroCotas ? (
                            <p className="text-sm text-red-600 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erroCotas}</p>
                        ) : !cotas ? (
                            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
                        ) : (
                            <ul className="divide-y divide-[#ECECEF] border border-[#ECECEF] rounded-[8px]">
                                {cotas.map(c => (
                                    <li key={c.itemId} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                                        <span className="min-w-0">
                                            <span className="block text-[#1F2430]">{c.unitLabel} · {c.clientNome}</span>
                                            {c.bloqueio && <span className={`block text-xs ${c.gerada ? 'text-gray-500' : 'text-amber-700'}`}>{c.bloqueio}</span>}
                                        </span>
                                        <span className={`tabular-nums whitespace-nowrap ${c.bloqueio ? 'text-gray-500' : 'text-[#1F2430]'}`}>{fmtBRLCents(Number(c.valor) || 0)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">
                        A emissão do boleto/PIX para o condômino vem depois, quando a conta bancária do condomínio estiver cadastrada.
                    </p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <ComMotivo motivo={motivo}>
                        <PrimaryButton onClick={enviar} disabled={!!motivo || salvando}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                            Gerar {cobraveis.length > 0 ? `${cobraveis.length} ${cobraveis.length === 1 ? 'cota' : 'cotas'}` : 'cotas'}
                        </PrimaryButton>
                    </ComMotivo>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelRateiosDoSindico;
