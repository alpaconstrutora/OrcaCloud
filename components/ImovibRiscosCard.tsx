import React, { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Loader2, AlertCircle, Plus } from 'lucide-react';
import { ImovibStudy, ImovibRisk } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { MatrizCalor } from './riscos/MatrizCalor';
import { motivoParaNaoLevar } from '../utils/imovibRiscoParaModuloRiscos';
import { ROTULO_DA_CATEGORIA, ROTULO_DA_SITUACAO, ROTULO_DA_TENDENCIA, rotuloDaCategoria, rotuloDaSituacao, severidade, corDaSeveridade } from '../constants/imovibRiscos';

interface ImovibRiscosCardProps {
    study: ImovibStudy;
}


const COLUNAS: StandardTableColumn[] = [
    { key: 'category', label: 'Categoria', sortable: true, width: 130 },
    { key: 'description', label: 'Risco', sortable: true, width: 340 },
    { key: 'severity', label: 'Severidade', sortable: true, width: 120, align: 'right' },
    { key: 'status', label: 'Situação', sortable: true, width: 120 },
    { key: 'owner', label: 'Responsável', sortable: true, width: 160 },
];

/**
 * Matriz de riscos do estudo (item 3.5 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): tabela, edição em
 * drawer e mapa de probabilidade × impacto.
 */
const ImovibRiscosCard: React.FC<ImovibRiscosCardProps> = ({ study }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [riscos, setRiscos] = useState<ImovibRisk[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<ImovibRisk | 'novo' | null>(null);
    const [levando, setLevando] = useState<string | null>(null);
    const empreendimentoId = study.estrutura?.empreendimento_id ?? null;

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarRiscos(study.id)
            .then(r => { if (vivo) { setRiscos(r); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    const excluir = async (r: ImovibRisk) => {
        try {
            await imovibService.excluirRisco(r.id);
            setRiscos(prev => prev.filter(x => x.id !== r.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    // Fase 7.6 (plano 2026-11-21-imovib-oportunidades-consolidacao): o risco passa a ser gerido no Módulo Riscos.
    const levar = async (r: ImovibRisk) => {
        setLevando(r.id);
        try {
            const { codigo, projectRiskId } = await imovibService.levarRiscoAoModulo(r, study);
            setRiscos(prev => prev.map(x => (x.id === r.id ? { ...x, project_risk_id: projectRiskId } : x)));
            showToast(`Risco ${codigo} criado no Módulo Riscos, com a avaliação inerente do estudo.`, 'success');
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setLevando(null);
        }
    };
    const motivoDeNaoLevar = (r: ImovibRisk): string | null => (!pode ? motivo : motivoParaNaoLevar(r, empreendimentoId));

    // Mapa 5 × 5: impacto nas linhas (5 em cima), probabilidade nas colunas.
    const contagem = (p: number, i: number) => riscos.filter(r => r.probability === p && r.impact === i && r.status !== 'encerrado').length;

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700">Matriz de riscos</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Riscos que o número não captura: legais, ambientais, de mercado, de obra. Severidade = probabilidade × impacto.</p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={!pode}
                    title={!pode ? motivo : undefined}
                    onClick={() => setEditando('novo')}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo risco
                </button>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-start">
                <StandardTable<ImovibRisk>
                    storageKey="imovib:riscos"
                    columns={COLUNAS}
                    rows={riscos}
                    rowKey={r => r.id}
                    loading={carregando}
                    dense
                    searchText={r => `${r.description} ${r.owner ?? ''} ${rotuloDaCategoria(r.category)}`}
                    searchPlaceholder="Buscar risco..."
                    defaultSort={{ column: 'severity', direction: 'desc' }}
                    bare
                    sortValue={(k, r) => (k === 'severity' ? severidade(r) : k === 'category' ? rotuloDaCategoria(r.category) : k === 'status' ? rotuloDaSituacao(r.status) : k === 'owner' ? r.owner ?? '' : r.description)}
                    onRowClick={r => setEditando(r)}
                    renderCell={(k, r) => {
                        switch (k) {
                            case 'category': return <span className="text-sm text-gray-700">{rotuloDaCategoria(r.category)}</span>;
                            case 'description': return <span className="block text-sm text-gray-700 whitespace-normal">{r.description}</span>;
                            case 'severity': return <span className={`inline-block text-xs font-semibold rounded-[6px] px-2 py-0.5 ${corDaSeveridade(severidade(r))}`} title={`Probabilidade ${r.probability} × impacto ${r.impact}`}>{severidade(r)}</span>;
                            case 'status': return (
                                <span className="block text-sm text-gray-700">
                                    {rotuloDaSituacao(r.status)}
                                    {r.project_risk_id && <span className="block text-xs text-emerald-700">No Módulo Riscos</span>}
                                </span>
                            );
                            case 'owner': return <span className="text-sm text-gray-600">{r.owner || '—'}</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 136,
                        render: r => (
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                {/* Desligado, o ActionIconButton não mostra o title: o motivo vai no span. */}
                                <span className="inline-flex" title={motivoDeNaoLevar(r) ?? 'Levar ao Módulo Riscos (vira risco da obra ou do empreendimento)'}>
                                    <ActionIconButton
                                        kind="move"
                                        title="Levar ao Módulo Riscos"
                                        aria-label="Levar ao Módulo Riscos"
                                        icon={levando === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                        disabled={!!motivoDeNaoLevar(r) || levando === r.id}
                                        onClick={() => void levar(r)}
                                    />
                                </span>
                                <ActionIconButton kind="edit" title={pode ? 'Editar o risco' : 'Ver o risco'} onClick={() => setEditando(r)} />
                                {pode && <InlineDisclosureMenu showDelete onDelete={() => void excluir(r)} />}
                            </div>
                        ),
                    }}
                    // Com erro de leitura, a lista vazia não quer dizer "nenhum risco": o erro já está acima.
                    empty={erro ? {
                        icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Riscos não carregados',
                        subtitle: 'Veja o erro acima e recarregue a aba.',
                    } : {
                        icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhum risco cadastrado',
                        subtitle: 'Ex.: passivo ambiental aguardando laudo, aprovação da prefeitura, concorrência lançando no bairro.',
                    }}
                />

                {/* Mapa 5×5 compartilhado com o módulo Riscos (components/riscos/MatrizCalor.tsx, 14/11/2026):
                    tamanho compacto = o desenho que estava aqui, sem mudança de HTML. */}
                <MatrizCalor
                    ariaLabel="Mapa de riscos: probabilidade × impacto"
                    titulo={<p className="text-xs font-semibold text-slate-500 mb-2">Mapa (riscos não encerrados)</p>}
                    contagem={contagem}
                    corDaCelula={(p, i, n) => (n ? corDaSeveridade(p * i) : 'bg-slate-50 text-slate-300')}
                    tituloDaCelula={(p, i, n) => `Probabilidade ${p}, impacto ${i}: ${n} risco(s)`}
                />
            </div>

            <RiscoSheet
                risco={editando}
                study={study}
                proximaOrdem={riscos.length}
                onClose={() => setEditando(null)}
                onSalvo={(r, criado) => {
                    setRiscos(prev => (criado ? [...prev, r] : prev.map(x => (x.id === r.id ? r : x))));
                    // §25: criar fecha; editar permanece aberto, já com o salvo.
                    setEditando(criado ? null : r);
                }}
            />
        </div>
    );
};

type FormDoRisco = Omit<ImovibRisk, 'id' | 'study_id' | 'sort_order' | 'created_at'>;
const FORM_VAZIO: FormDoRisco = {
    category: 'outro', description: '', causa: '', consequencia: '', probability: 3, impact: 3, tendencia: null,
    mitigation: '', contingencia: '', owner: '', prazo: '', status: 'aberto',
};
const AREA = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none';

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

function RiscoSheet({ risco, study, proximaOrdem, onClose, onSalvo }: {
    risco: ImovibRisk | 'novo' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    onClose: () => void;
    onSalvo: (r: ImovibRisk, criado: boolean) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const [form, setForm] = useState<FormDoRisco>(FORM_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mudou, setMudou] = useState(false);

    useEffect(() => {
        if (!risco) return;
        setForm(risco === 'novo'
            ? FORM_VAZIO
            : {
                category: risco.category, description: risco.description, causa: risco.causa ?? '', consequencia: risco.consequencia ?? '',
                probability: risco.probability, impact: risco.impact, tendencia: risco.tendencia ?? null,
                mitigation: risco.mitigation ?? '', contingencia: risco.contingencia ?? '', owner: risco.owner ?? '', prazo: risco.prazo ?? '',
                status: risco.status,
            });
        setErro(null);
        setMudou(false);
    }, [risco]);

    if (!risco) return null;
    const novo = risco === 'novo';
    const motivo = !pode ? motivoRo : !form.description.trim() ? 'Descreva o risco.' : !mudou ? 'Nada foi alterado.' : undefined;
    const mudar = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm(prev => ({ ...prev, [k]: v })); setMudou(true); };

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const salvo = await imovibService.salvarRisco({
                ...(novo ? {} : { id: risco.id }),
                study_id: study.id,
                ...form,
                description: form.description.trim(),
                causa: form.causa?.trim() || null,
                consequencia: form.consequencia?.trim() || null,
                mitigation: form.mitigation?.trim() || null,
                contingencia: form.contingencia?.trim() || null,
                owner: form.owner?.trim() || null,
                prazo: form.prazo || null,
                sort_order: novo ? proximaOrdem : risco.sort_order,
            });
            setMudou(false);
            onSalvo(salvo, novo);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!risco} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{novo ? 'Novo risco' : 'Risco'}</SheetTitle>
                <SheetDescription>Probabilidade e impacto de 1 (baixo) a 5 (alto).</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-risco-descricao" className="text-xs font-semibold text-slate-500">Risco</label>
                        <textarea id="imovib-risco-descricao" rows={3} value={form.description} onChange={e => mudar('description', e.target.value)}
                            className={AREA} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-causa" className="text-xs font-semibold text-slate-500">Causa</label>
                            <textarea id="imovib-risco-causa" rows={2} value={form.causa ?? ''} onChange={e => mudar('causa', e.target.value)} className={AREA} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-consequencia" className="text-xs font-semibold text-slate-500">Consequência</label>
                            <textarea id="imovib-risco-consequencia" rows={2} value={form.consequencia ?? ''} onChange={e => mudar('consequencia', e.target.value)} className={AREA} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-categoria" className="text-xs font-semibold text-slate-500">Categoria</label>
                            <select id="imovib-risco-categoria" value={form.category} onChange={e => mudar('category', e.target.value as ImovibRisk['category'])} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DA_CATEGORIA) as ImovibRisk['category'][]).map(c => <option key={c} value={c}>{ROTULO_DA_CATEGORIA[c]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-situacao" className="text-xs font-semibold text-slate-500">Situação</label>
                            <select id="imovib-risco-situacao" value={form.status} onChange={e => mudar('status', e.target.value as ImovibRisk['status'])} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DA_SITUACAO) as ImovibRisk['status'][]).map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-probabilidade" className="text-xs font-semibold text-slate-500">Probabilidade</label>
                            <select id="imovib-risco-probabilidade" value={form.probability} onChange={e => mudar('probability', Number(e.target.value))} className={`${CAMPO} cursor-pointer`}>
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-impacto" className="text-xs font-semibold text-slate-500">Impacto</label>
                            <select id="imovib-risco-impacto" value={form.impact} onChange={e => mudar('impact', Number(e.target.value))} className={`${CAMPO} cursor-pointer`}>
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-tendencia" className="text-xs font-semibold text-slate-500">Tendência</label>
                            <select id="imovib-risco-tendencia" value={form.tendencia ?? ''} onChange={e => mudar('tendencia', (e.target.value || null) as ImovibRisk['tendencia'])} className={`${CAMPO} cursor-pointer`}>
                                <option value="">Não informada</option>
                                {(Object.keys(ROTULO_DA_TENDENCIA) as NonNullable<ImovibRisk['tendencia']>[]).map(t => <option key={t} value={t}>{ROTULO_DA_TENDENCIA[t]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-risco-prazo" className="text-xs font-semibold text-slate-500">Prazo da resposta</label>
                            <input id="imovib-risco-prazo" type="date" value={form.prazo ?? ''} onChange={e => mudar('prazo', e.target.value)} className={CAMPO} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-risco-mitigacao" className="text-xs font-semibold text-slate-500">Mitigação</label>
                        <textarea id="imovib-risco-mitigacao" rows={3} value={form.mitigation ?? ''} onChange={e => mudar('mitigation', e.target.value)} className={AREA} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-risco-contingencia" className="text-xs font-semibold text-slate-500">Contingência (se acontecer)</label>
                        <textarea id="imovib-risco-contingencia" rows={2} value={form.contingencia ?? ''} onChange={e => mudar('contingencia', e.target.value)} className={AREA} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-risco-responsavel" className="text-xs font-semibold text-slate-500">Responsável</label>
                        <input id="imovib-risco-responsavel" value={form.owner ?? ''} onChange={e => mudar('owner', e.target.value)} className={CAMPO} />
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{novo ? 'Cancelar' : 'Fechar'}</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {novo ? 'Criar risco' : 'Salvar risco'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibRiscosCard;
