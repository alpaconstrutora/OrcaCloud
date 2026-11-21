import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gavel, Loader2, AlertCircle, FileDown, CheckCircle2, XCircle, Circle, RotateCcw, Pause, Archive } from 'lucide-react';
import type { ImovibStudy, ImovibRisk, ImovibLandChecklistItem } from '../types';
import { imovibService, type ModeloDeAquisicaoGravado } from '../services/imovibService';
import { useImovibEdicao, useImovibEhAdminDaOrg } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import type { ImovibStudyVersion } from '../utils/imovibVersoes';
import {
    GATES, ROTULO_DO_GATE, ROTULO_DA_DECISAO, proximoGate, motivoParaNaoAbrir, motivoParaNaoDecidir,
    type DecisaoDoGate, type DecisaoDoComite, type GateDoComite,
} from '../utils/imovibComite';
import { riscoQueTrava } from '../constants/imovibRiscos';
import { itemDaDueDiligenceQueTrava } from '../utils/imovibDueDiligenceMatricula';
import { ROTULO_DO_PARECER } from '../utils/imovibParecer';
import { computeImovibMath } from '../utils/imovibMotor';
import { resultadoDoModelo } from '../utils/imovibModelosDeAquisicao';
import { baixarDossieDoComite } from '../utils/imovibDossieDoComite';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const AREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none';

const ICONE: Record<DecisaoDoComite, React.ReactNode> = {
    pendente: <Circle className="w-4 h-4 text-gray-300" />,
    aprovado: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    aprovado_condicionantes: <CheckCircle2 className="w-4 h-4 text-amber-600" />,
    reprovado: <XCircle className="w-4 h-4 text-red-600" />,
    devolvido: <RotateCcw className="w-4 h-4 text-amber-600" />,
    suspenso: <Pause className="w-4 h-4 text-gray-500" />,
    arquivado: <Archive className="w-4 h-4 text-gray-400" />,
};

/**
 * Comitê & Gates do estudo (item 1.5 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md; decisão D5). Antes era aba
 * da Oportunidade. Cada decisão registra a versão congelada avaliada; o Parecer do
 * Resumo Executivo é a recomendação do analista que o comitê lê.
 */
const ImovibComiteTab: React.FC<{ study: ImovibStudy }> = ({ study }) => {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const ehAdmin = useImovibEhAdminDaOrg(study.organization_id);
    const { showToast } = useToast();
    const [decisoes, setDecisoes] = useState<DecisaoDoGate[]>([]);
    const [versoes, setVersoes] = useState<ImovibStudyVersion[]>([]);
    const [dd, setDd] = useState<ImovibLandChecklistItem[]>([]);
    const [riscos, setRiscos] = useState<ImovibRisk[]>([]);
    const [modelos, setModelos] = useState<ModeloDeAquisicaoGravado[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aberto, setAberto] = useState<GateDoComite | null>(null);
    const [baixando, setBaixando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const [d, v, i, r, m] = await Promise.all([
                imovibService.listarDecisoesDoComite(study.id),
                imovibService.listarVersoes(study.id),
                imovibService.listarDueDiligence(study.id),
                imovibService.listarRiscos(study.id),
                imovibService.listarModelosDeAquisicao(study.id),
            ]);
            setDecisoes(d); setVersoes(v); setDd(i); setRiscos(r); setModelos(m);
            setErro(null);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setCarregando(false);
        }
    }, [study.id]);
    useEffect(() => { void carregar(); }, [carregar]);

    const bloqueios = useMemo(
        () => dd.filter(i => itemDaDueDiligenceQueTrava({ criticidade: i.criticidade ?? 'media', status: i.status })).length + riscos.filter(riscoQueTrava).length,
        [dd, riscos],
    );
    const proximo = proximoGate(decisoes);
    const daDecisao = (g: GateDoComite) => decisoes.find(d => d.gate === g);
    const versaoPorId = (id: string | null | undefined) => versoes.find(v => v.id === id);
    const podeDecidir = pode && ehAdmin;
    const motivoSemPermissao = !pode ? motivoRo : !ehAdmin ? 'Só owner ou admin da organização decide gates do comitê.' : undefined;

    const baixar = async () => {
        setBaixando(true);
        try {
            const base = computeImovibMath(study);
            const ultimaDecidida = [...decisoes].filter(d => d.version_id).sort((a, b) => b.gate - a.gate)[0];
            await baixarDossieDoComite({
                study,
                versao: versaoPorId(ultimaDecidida?.version_id) ?? versoes[0] ?? null,
                dueDiligence: dd,
                riscos,
                modelos: modelos.map(m => { const { premissas: _p, ...r } = resultadoDoModelo(study, m, base); return { name: m.name, deal_type: m.deal_type, r }; }),
                decisoes,
                gateAtual: proximo,
            });
        } catch (e) {
            showToast(`Não foi possível gerar o dossiê: ${(e as Error).message}`, 'error');
        } finally {
            setBaixando(false);
        }
    };

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-comite-titulo">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 id="imovib-comite-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Gavel className="w-5 h-5 text-indigo-500" />
                            Comitê de investimentos
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                            Gates 1 a 6, em ordem. Cada decisão registra a versão congelada avaliada.
                            {' '}Parecer do analista: <span className="text-slate-700 font-medium">{study.recommendation ? ROTULO_DO_PARECER[study.recommendation] : 'não registrado (Resumo Executivo)'}</span>.
                        </p>
                    </div>
                    <button type="button" onClick={() => void baixar()} disabled={carregando || baixando} title={carregando ? 'Carregando…' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 border border-gray-200 bg-white text-slate-700 rounded-[6px] hover:bg-slate-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                        {baixando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileDown className="w-[15px] h-[15px]" />}
                        Baixar dossiê
                    </button>
                </div>

                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}

                <div className={`rounded-[10px] border px-3 py-2 text-sm ${bloqueios ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                    {carregando ? 'Lendo due diligence e riscos…'
                        : bloqueios ? `${bloqueios} pendência(s) travam a aprovação: due diligence alta/crítica sem ok ou risco alto/crítico em aberto. Só "Aprovado com condicionantes" passa.`
                            : 'Nenhuma pendência trava a aprovação.'}
                </div>

                {carregando ? (
                    <p className="text-sm text-slate-500 py-6 text-center">Carregando…</p>
                ) : (
                    <ul className="divide-y divide-slate-100 border border-slate-100 rounded-[10px]">
                        {GATES.map(g => {
                            const d = daDecisao(g);
                            const decisao = d?.decision ?? 'pendente';
                            const v = versaoPorId(d?.version_id);
                            const naoAbre = motivoParaNaoAbrir(g, decisoes);
                            return (
                                <li key={g} className={`flex items-center justify-between gap-3 px-4 py-3 ${g === proximo ? 'bg-blue-50/40' : ''}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        {ICONE[decisao]}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900">{ROTULO_DO_GATE[g]}</p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {ROTULO_DA_DECISAO[decisao]}
                                                {d?.decided_by_nome ? ` — ${d.decided_by_nome}` : ''}
                                                {d?.decided_at ? `, ${new Date(d.decided_at).toLocaleDateString('pt-BR')}` : ''}
                                                {v ? ` · versão "${v.label}"` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setAberto(g)} disabled={!!naoAbre} title={naoAbre}
                                        className="flex items-center gap-1.5 h-9 px-3.5 text-blue-700 hover:bg-blue-50 rounded-[6px] font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                                        <Gavel className="w-[15px] h-[15px]" /> {motivoSemPermissao ? 'Ver' : decisao === 'pendente' ? 'Decidir' : 'Rever'}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <DecisaoSheet
                gate={aberto}
                study={study}
                atual={aberto ? daDecisao(aberto) ?? null : null}
                versoes={versoes}
                bloqueios={bloqueios}
                podeDecidir={podeDecidir}
                motivoSemPermissao={motivoSemPermissao}
                onClose={() => setAberto(null)}
                onSalvo={d => { setDecisoes(prev => [...prev.filter(x => x.gate !== d.gate), d]); setAberto(null); }}
            />
        </div>
    );
};

function DecisaoSheet({ gate, study, atual, versoes, bloqueios, podeDecidir, motivoSemPermissao, onClose, onSalvo }: {
    gate: GateDoComite | null;
    study: ImovibStudy;
    atual: DecisaoDoGate | null;
    versoes: ImovibStudyVersion[];
    bloqueios: number;
    podeDecidir: boolean;
    motivoSemPermissao?: string;
    onClose: () => void;
    onSalvo: (d: DecisaoDoGate) => void;
}) {
    const [decisao, setDecisao] = useState<DecisaoDoComite>('pendente');
    const [versaoId, setVersaoId] = useState<string>('');
    const [condicionantes, setCondicionantes] = useState('');
    const [parecer, setParecer] = useState('');
    const [mudou, setMudou] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!gate) return;
        setDecisao(atual?.decision ?? 'pendente');
        // Sem decisão anterior: a versão mais recente (a lista vem da mais nova para a mais antiga).
        setVersaoId(atual?.version_id ?? versoes[0]?.id ?? '');
        setCondicionantes(atual?.condicionantes ?? '');
        setParecer(atual?.parecer ?? '');
        setMudou(false);
        setErro(null);
    }, [gate, atual, versoes]);

    if (!gate) return null;
    const motivo = motivoSemPermissao
        ?? motivoParaNaoDecidir({ decision: decisao, version_id: versaoId || null, condicionantes, bloqueios })
        ?? (!mudou ? 'Nada foi alterado.' : undefined);

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            onSalvo(await imovibService.salvarDecisaoDoComite({
                study_id: study.id, gate, decision: decisao, version_id: versaoId || null,
                condicionantes: condicionantes.trim() || null, parecer: parecer.trim() || null,
            }));
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!gate} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{ROTULO_DO_GATE[gate]}</SheetTitle>
                <SheetDescription>Quem decide e quando ficam gravados pelo banco.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!podeDecidir} title={motivoSemPermissao} className="min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-comite-decisao" className="text-xs font-semibold text-slate-500">Decisão</label>
                            <select id="imovib-comite-decisao" value={decisao} onChange={e => { setDecisao(e.target.value as DecisaoDoComite); setMudou(true); }} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DA_DECISAO) as DecisaoDoComite[]).map(d => <option key={d} value={d}>{ROTULO_DA_DECISAO[d]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-comite-versao" className="text-xs font-semibold text-slate-500">Versão avaliada</label>
                            <select id="imovib-comite-versao" value={versaoId} onChange={e => { setVersaoId(e.target.value); setMudou(true); }} className={`${CAMPO} cursor-pointer`}>
                                <option value="">{versoes.length ? 'Escolha a versão' : 'Nenhuma versão congelada'}</option>
                                {versoes.map(v => <option key={v.id} value={v.id}>{v.label} · {new Date(v.created_at).toLocaleDateString('pt-BR')}</option>)}
                            </select>
                        </div>
                    </div>
                    {versoes.length === 0 && <p className="text-xs text-amber-700">Congele uma versão na aba Versões: o comitê decide sobre números que não mudam.</p>}
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-comite-condicionantes" className="text-xs font-semibold text-slate-500">Condicionantes</label>
                        <textarea id="imovib-comite-condicionantes" rows={2} value={condicionantes} onChange={e => { setCondicionantes(e.target.value); setMudou(true); }} className={AREA} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-comite-parecer" className="text-xs font-semibold text-slate-500">Parecer do comitê</label>
                        <textarea id="imovib-comite-parecer" rows={3} value={parecer} onChange={e => { setParecer(e.target.value); setMudou(true); }} className={AREA} />
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Fechar</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Registrar decisão
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibComiteTab;
