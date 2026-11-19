import React, { useEffect, useMemo, useState } from 'react';
import { History, AlertCircle, Loader2, Type, Check, X } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { investorPortalService } from '../services/investorPortalService';
import { resultadosDoEstudo, diferencaEntreVersoes, dadosDoRelatorioDaVersao, congeladoDaVersao, acoesDaVersao, partesAusentesDaVersao, type AcaoDaVersao, type ImovibStudyVersion, type LadoDaComparacao, type SnapshotDaVersao } from '../utils/imovibVersoes';
import { nomeDeArquivo } from '../utils/nomeDeArquivo';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

interface Props {
    study: ImovibStudy;
    /** Edição de versão aberta pelo estudo: quem monta a aba recarrega o estudo (faixa, números). */
    onEstudoMudou?: () => void;
}

const ATUAL = 'atual';
const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

const fmt = (v: number | string | null, unidade: string): string => {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (unidade === 'R$') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
    const n = v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return unidade.startsWith('%') ? `${n}${unidade}` : `${n} ${unidade}`.trim();
};
const juntar = (l: string[]) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const COLUNAS: StandardTableColumn[] = [
    { key: 'label', label: 'Versão', width: 260 },
    { key: 'created_at', label: 'Congelada em', width: 150 },
    { key: 'vpl', label: 'VPL', width: 150, align: 'right' },
    { key: 'tir', label: 'TIR', width: 110, align: 'right' },
    { key: 'publicada', label: 'Para o investidor', width: 260 },
    { key: 'notes', label: 'Observações', width: 320 },
];

/**
 * Versões congeladas (item 10.2 do plano 2026-11-11): lista e comparação de duas versões (ou de uma
 * versão com o estudo atual). Desde 19/11 (plano 2026-11-19-imovib-versoes-editar-excluir): versão
 * PUBLICADA é só leitura; as demais se editam pelo estudo, se renomeiam na linha e se excluem.
 */
const ImovibVersoesTab: React.FC<Props> = ({ study, onEstudoMudou }) => {
    const pode = useImovibEdicao();
    const confirm = useConfirm();
    const [renomeando, setRenomeando] = useState<{ id: string; label: string; notes: string } | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [versoes, setVersoes] = useState<ImovibStudyVersion[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [ladoA, setLadoA] = useState<string>('');
    const [ladoB, setLadoB] = useState<string>(ATUAL);
    const [snapshots, setSnapshots] = useState<Record<string, ImovibStudy>>({});

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarVersoes(study.id)
            .then(l => { if (vivo) { setVersoes(l); setErro(null); setLadoA(a => a || l[0]?.id || ''); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    // Plano 2026-11-15, Fase 2: em que oportunidade cada versão está publicada (ou escolhida, em rascunho).
    const [oportunidades, setOportunidades] = useState<{ id?: string; title: string; is_published?: boolean; imovib_version_id?: string | null }[]>([]);
    useEffect(() => {
        let vivo = true;
        investorPortalService.oportunidadesComVersaoDoEstudo(study.id)
            .then(l => { if (vivo) setOportunidades(l); })
            .catch(e => console.error('Erro ao ler as oportunidades das versões', e));
        return () => { vivo = false; };
    }, [study.id]);
    const publicadaEm = (v: ImovibStudyVersion) => oportunidades.find(o => o.imovib_version_id === v.id && o.is_published)?.title ?? null;
    const rascunhosDe = (v: ImovibStudyVersion) => oportunidades.filter(o => o.imovib_version_id === v.id && !o.is_published).map(o => o.title);
    const acoes = (v: ImovibStudyVersion) => acoesDaVersao({ versaoId: v.id, publicadaEm: publicadaEm(v), edicaoAberta: study.edicao_versao ?? null, pode });

    const editarVersao = async (v: ImovibStudyVersion) => {
        try {
            const snap = (snapshots[v.id] ?? await imovibService.snapshotDaVersao(v.id)) as unknown as Record<string, unknown>;
            const faltam = partesAusentesDaVersao(snap);
            const ok = await confirm({
                title: `Editar a versão «${v.label}»?`,
                message: `O estudo passa a mostrar a versão até você salvar na versão ou descartar. O estudo de agora fica guardado e volta ao final.`
                    + (faltam.length ? `\n\nEsta versão não guardou ${juntar(faltam)} — essas partes ficam com o conteúdo de hoje do estudo e, ao salvar, passam a ser guardadas na versão.` : ''),
                confirmLabel: 'Editar versão',
            });
            if (!ok) return;
            setOcupado(true);
            await imovibService.iniciarEdicaoDaVersao(study, v.id);
            onEstudoMudou?.();
        } catch (e) {
            setErro(`Não foi possível abrir a edição da versão: ${(e as Error).message}`);
        } finally {
            setOcupado(false);
        }
    };

    const excluirVersao = async (v: ImovibStudyVersion) => {
        const rasc = rascunhosDe(v);
        const ok = await confirm({
            title: `Excluir a versão «${v.label}»?`,
            message: rasc.length
                ? `Ela está escolhida no rascunho «${rasc.join('», «')}» — a escolha sai do rascunho. Não dá para desfazer.`
                : 'Não dá para desfazer.',
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            setOcupado(true);
            await imovibService.excluirVersao(v.id);
            // §22: tira da lista local em vez de recarregar.
            setVersoes(l => l.filter(x => x.id !== v.id));
            setOportunidades(l => l.map(o => (o.imovib_version_id === v.id ? { ...o, imovib_version_id: null } : o)));
            setLadoA(a => (a === v.id ? '' : a));
            setLadoB(b => (b === v.id ? ATUAL : b));
        } catch (e) {
            setErro(`Não foi possível excluir a versão: ${(e as Error).message}`);
        } finally {
            setOcupado(false);
        }
    };

    const salvarNome = async () => {
        if (!renomeando || !renomeando.label.trim()) return;
        const { id, label, notes } = renomeando;
        try {
            setOcupado(true);
            await imovibService.renomearVersao(id, label.trim(), notes.trim() || null);
            setVersoes(l => l.map(x => (x.id === id ? { ...x, label: label.trim(), notes: notes.trim() || null } : x)));
            setRenomeando(null);
        } catch (e) {
            setErro(`Não foi possível renomear a versão: ${(e as Error).message}`);
        } finally {
            setOcupado(false);
        }
    };

    // Botão-ícone desligado não recebe hover (pointer-events-none): o motivo vai num <span> em volta.
    const botao = (acao: AcaoDaVersao, el: React.ReactElement) =>
        <span className="inline-flex" title={acao.pode ? undefined : acao.motivo}>{el}</span>;

    const paraOInvestidor = (v: ImovibStudyVersion) => oportunidades
        .filter(o => o.imovib_version_id === v.id)
        .map(o => (o.is_published ? `Publicada em ${o.title}` : `Escolhida em ${o.title} (rascunho)`));

    // O snapshot é pesado: só é lido quando a versão entra na comparação.
    useEffect(() => {
        let vivo = true;
        for (const id of [ladoA, ladoB]) {
            if (!id || id === ATUAL || snapshots[id]) continue;
            imovibService.snapshotDaVersao(id)
                .then(s => { if (vivo) setSnapshots(prev => ({ ...prev, [id]: s })); })
                .catch(e => { if (vivo) setErro((e as Error).message); });
        }
        return () => { vivo = false; };
    }, [ladoA, ladoB, snapshots]);

    // Relatório completo da versão (plano 2026-11-15, Fase 1): os dados vêm só do snapshot,
    // então o PDF é o do estudo no instante em que foi congelado.
    const [gerando, setGerando] = useState<string | null>(null);
    const baixarRelatorio = async (v: ImovibStudyVersion) => {
        if (gerando) return;
        setGerando(v.id);
        try {
            const [snapshot, organizacao, { gerarRelatorioCompleto }] = await Promise.all([
                snapshots[v.id] ? Promise.resolve(snapshots[v.id]) : imovibService.snapshotDaVersao(v.id),
                imovibService.organizacaoDoEstudo(study.organization_id),
                import('./ImovibGraficosParaPdf'),
            ]);
            const pdf = await gerarRelatorioCompleto(dadosDoRelatorioDaVersao(snapshot as SnapshotDaVersao, v),
                { versao: v, organizacao, congelado: congeladoDaVersao((snapshot as SnapshotDaVersao).calculo, 'interna') });
            pdf.save(`Relatorio_${nomeDeArquivo(study.name)}_${nomeDeArquivo(v.label)}.pdf`);
        } catch (e) {
            setErro(`Não foi possível gerar o relatório da versão: ${(e as Error).message}`);
        } finally {
            setGerando(null);
        }
    };

    const atual = useMemo<LadoDaComparacao>(() => ({ snapshot: study, results: resultadosDoEstudo(study) }), [study]);
    const lado = (id: string): LadoDaComparacao | null => {
        if (id === ATUAL) return atual;
        const v = versoes.find(x => x.id === id);
        return v && snapshots[id] ? { snapshot: snapshots[id], results: v.results } : null;
    };
    const a = lado(ladoA);
    const b = lado(ladoB);
    const diferenca = a && b ? diferencaEntreVersoes(a, b) : null;
    const nomeDe = (id: string) => (id === ATUAL ? 'Estudo atual' : versoes.find(v => v.id === id)?.label ?? '');
    const opcoes = [...versoes.map(v => ({ id: v.id, nome: `${v.label} (${dataHora(v.created_at)})` })), { id: ATUAL, nome: 'Estudo atual' }];

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-versoes-titulo">
                <div>
                    <h2 id="imovib-versoes-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-500" />
                        Versões congeladas
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Cada versão guarda o estudo inteiro e os indicadores do momento em que foi congelada. Enquanto não for publicada para o investidor, pode ser editada e excluída; publicada, fica só para leitura.</p>
                </div>
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <StandardTable<ImovibStudyVersion>
                    storageKey="imovib:versoes"
                    columns={COLUNAS}
                    rows={versoes}
                    rowKey={v => v.id}
                    loading={carregando}
                    dense
                    bare
                    actions={{
                        width: 170,
                        render: v => {
                            if (renomeando?.id === v.id) {
                                return (
                                    <div className="flex items-center gap-1.5">
                                        <ActionIconButton kind="edit" icon={<Check className="w-4 h-4" />} title="Salvar nome e observações" aria-label="Salvar nome e observações"
                                            disabled={ocupado || !renomeando.label.trim()} onClick={() => void salvarNome()} />
                                        <ActionIconButton kind="edit" icon={<X className="w-4 h-4" />} title="Cancelar" aria-label="Cancelar a renomeação" onClick={() => setRenomeando(null)} />
                                    </div>
                                );
                            }
                            const a = acoes(v);
                            return (
                                <div className="flex items-center gap-1.5">
                                    <ActionIconButton
                                        kind="download"
                                        title={gerando === v.id ? 'Gerando o relatório…' : 'Relatório da versão (PDF)'}
                                        aria-label="Relatório da versão (PDF)"
                                        onClick={() => void baixarRelatorio(v)}
                                    />
                                    {botao(a.editar, <ActionIconButton kind="edit" title="Editar a versão (premissas, cenários e tudo o mais, pelo estudo)" aria-label="Editar a versão"
                                        disabled={!a.editar.pode || ocupado} onClick={() => void editarVersao(v)} />)}
                                    {botao(a.renomear, <ActionIconButton kind="edit" icon={<Type className="w-4 h-4" />} title="Renomear e editar as observações" aria-label="Renomear a versão"
                                        disabled={!a.renomear.pode || ocupado} onClick={() => setRenomeando({ id: v.id, label: v.label, notes: v.notes ?? '' })} />)}
                                    {botao(a.excluir, <ActionIconButton kind="delete" title="Excluir a versão" aria-label="Excluir a versão"
                                        disabled={!a.excluir.pode || ocupado} onClick={() => void excluirVersao(v)} />)}
                                </div>
                            );
                        },
                    }}
                    renderCell={(k, v) => {
                        switch (k) {
                            case 'label': return renomeando?.id === v.id
                                ? <input aria-label="Nome da versão" className={`${CAMPO} w-full`} value={renomeando.label} onChange={e => setRenomeando(r => r && { ...r, label: e.target.value })} />
                                : <span className="text-sm text-gray-800">{v.label}</span>;
                            case 'created_at': return (
                                <span className="text-sm text-gray-700">
                                    {dataHora(v.created_at)}
                                    {v.updated_at && <span className="block text-xs text-gray-500">editada em {dataHora(v.updated_at)}</span>}
                                </span>
                            );
                            case 'vpl': return <span className="text-sm text-gray-700">{fmt(v.results.vpl, 'R$')}</span>;
                            case 'tir': return <span className="text-sm text-gray-700">{fmt(v.results.tirAnual, '% a.a.')}</span>;
                            case 'publicada': {
                                const l = paraOInvestidor(v);
                                return l.length ? <span className="text-sm text-gray-700">{l.map(t => <span key={t} className="block">{t}</span>)}</span> : <span className="text-sm text-gray-500">—</span>;
                            }
                            case 'notes': return renomeando?.id === v.id
                                ? <input aria-label="Observações da versão" className={`${CAMPO} w-full`} value={renomeando.notes} onChange={e => setRenomeando(r => r && { ...r, notes: e.target.value })} />
                                : <span className="text-sm text-gray-600">{v.notes ?? '—'}</span>;
                            default: return null;
                        }
                    }}
                    empty={{
                        icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma versão congelada',
                        subtitle: 'Use "Congelar versão" no cabeçalho do estudo para guardar o estudo como está, por exemplo antes de apresentar ao comitê.',
                    }}
                />
            </section>

            {versoes.length > 0 && (
                <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-comparar-titulo">
                    <div className="flex flex-wrap items-end gap-3">
                        <h2 id="imovib-comparar-titulo" className="text-lg font-semibold text-gray-900 mr-auto">Comparar</h2>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">De</span>
                            <select aria-label="Comparar de" value={ladoA} onChange={e => setLadoA(e.target.value)} className={CAMPO}>
                                {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">Para</span>
                            <select aria-label="Comparar para" value={ladoB} onChange={e => setLadoB(e.target.value)} className={CAMPO}>
                                {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </label>
                    </div>

                    {!diferenca ? (
                        erro ? null : <p className="text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo as versões…</p>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <section aria-label="Premissas que mudaram" className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700">Premissas que mudaram</h3>
                                {diferenca.premissas.length === 0 ? (
                                    <p className="text-sm text-slate-600">Nenhuma premissa do memorial mudou entre {nomeDe(ladoA)} e {nomeDe(ladoB)}.</p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3 font-semibold">Premissa</th><th className="py-2 pr-3 font-semibold text-right">{nomeDe(ladoA)}</th><th className="py-2 font-semibold text-right">{nomeDe(ladoB)}</th></tr></thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {diferenca.premissas.map(p => (
                                                <tr key={p.campo}>
                                                    <td className="py-2 pr-3 text-gray-700">{p.premissa}<span className="block text-xs text-slate-500">{p.grupo}</span></td>
                                                    <td className="py-2 pr-3 text-right text-gray-700">{fmt(p.antes, p.unidade)}</td>
                                                    <td className="py-2 text-right text-gray-800 font-medium">{fmt(p.depois, p.unidade)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                            <section aria-label="Indicadores lado a lado" className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700">Indicadores lado a lado</h3>
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3 font-semibold">Indicador</th><th className="py-2 pr-3 font-semibold text-right">{nomeDe(ladoA)}</th><th className="py-2 font-semibold text-right">{nomeDe(ladoB)}</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {diferenca.indicadores.map(i => (
                                            <tr key={i.chave}>
                                                <td className="py-2 pr-3 text-gray-700">{i.rotulo}</td>
                                                <td className="py-2 pr-3 text-right text-gray-700">{i.textoA ?? fmt(i.a, i.unidade)}</td>
                                                <td className={`py-2 text-right ${i.a !== i.b ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{i.textoB ?? fmt(i.b, i.unidade)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default ImovibVersoesTab;
