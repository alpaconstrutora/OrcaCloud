import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, AlertCircle, Plus } from 'lucide-react';
import { ImovibStudy, ImovibScenario } from '../types';
import { imovibService } from '../services/imovibService';
import { computeImovibMath } from '../utils/imovibMotor';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import { aplicarCenario } from '../utils/imovibCenarios';
import { Choques, VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL } from '../utils/imovibVariacoes';
import { IMOVIB_DEFAULTS, IMOVIB_CENARIOS_PADRAO } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { useConfirm } from './ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { formatarMetrica } from './ImovibTornadoCard';

interface ImovibCenariosCardProps {
    study: ImovibStudy;
    cenarios: ImovibScenario[];
    carregando: boolean;
    erro: string | null;
    onCenarios: (c: ImovibScenario[]) => void;
}

const ROTULO_DO_TIPO: Record<ImovibScenario['kind'], string> = { pessimista: 'Pessimista', otimista: 'Otimista', personalizado: 'Personalizado' };

/**
 * Cenários salvos (item 3.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): uma coluna por
 * cenário, uma linha por indicador. O cenário Base é o próprio estudo.
 */
const ImovibCenariosCard: React.FC<ImovibCenariosCardProps> = ({ study, cenarios, carregando, erro, onCenarios }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [editando, setEditando] = useState<ImovibScenario | 'novo' | null>(null);
    const [criando, setCriando] = useState(false);
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;

    const colunas = useMemo(() => {
        const medir = (choques: Choques) => {
            const x = aplicarCenario(study, choques);
            const r = computeImovibMath(x.study, x.options);
            return { r, ind: calcularIndicadores(r, tma) };
        };
        return [
            { id: 'base', nome: 'Base (o estudo)', cenario: null as ImovibScenario | null, ...medir({}) },
            ...cenarios.map(c => ({ id: c.id, nome: c.name, cenario: c, ...medir(c.choques) })),
        ];
    }, [study, cenarios, tma]);

    // Pelo TIPO, não pelo nome: "Pessimista" renomeado continua sendo o pessimista (pendência da Fase 3).
    const faltamPadrao = IMOVIB_CENARIOS_PADRAO.filter(p => !cenarios.some(c => c.kind === p.kind));
    const motivoPadrao = !pode ? motivo : faltamPadrao.length === 0 ? 'Os cenários Pessimista e Otimista já existem.' : undefined;

    const criarPadrao = async () => {
        setCriando(true);
        try {
            await imovibService.criarCenariosPadrao(study.id, faltamPadrao);
            onCenarios(await imovibService.listarCenarios(study.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setCriando(false);
        }
    };

    const LINHAS: { rotulo: string; valor: (c: typeof colunas[number]) => string }[] = [
        { rotulo: 'VGV', valor: c => formatarMetrica('vpl', c.r.vgvTotal) },
        { rotulo: 'VPL', valor: c => formatarMetrica('vpl', c.r.vpl) },
        { rotulo: 'TIR', valor: c => formatarMetrica('tir', c.r.annualIrr) },
        { rotulo: 'Margem líquida', valor: c => (c.ind.margemLiquidaSobreVgv == null ? '—' : formatarMetrica('margem', c.ind.margemLiquidaSobreVgv)) },
        { rotulo: 'Exposição máxima', valor: c => formatarMetrica('exposicao', c.r.maxExposure) },
        { rotulo: 'Payback', valor: c => (c.ind.paybackSimplesMes == null ? '—' : `Mês ${c.ind.paybackSimplesMes}`) },
    ];

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700">Cenários</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Conjuntos de choques salvos no estudo. Clique no nome de um cenário para ver e ajustar os choques.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={!!motivoPadrao || criando}
                        title={motivoPadrao}
                        onClick={() => void criarPadrao()}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {criando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        Criar cenários padrão
                    </button>
                    <button
                        type="button"
                        disabled={!pode}
                        title={!pode ? motivo : undefined}
                        onClick={() => setEditando('novo')}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Novo cenário
                    </button>
                </div>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-xs font-semibold text-gray-700">
                            <th className="px-3 py-2 text-left">Indicador</th>
                            {colunas.map(c => (
                                <th key={c.id} className="px-3 py-2 text-right whitespace-nowrap">
                                    {c.cenario ? (
                                        <button type="button" onClick={() => setEditando(c.cenario)} className="text-blue-700 hover:underline" title={`Ver os choques de ${c.nome}`}>
                                            {c.nome}
                                        </button>
                                    ) : c.nome}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {LINHAS.map(l => (
                            <tr key={l.rotulo}>
                                <td className="px-3 py-2 text-gray-700">{l.rotulo}</td>
                                {colunas.map(c => <td key={c.id} className="px-3 py-2 text-right text-gray-800 whitespace-nowrap">{l.valor(c)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {carregando && <p className="text-xs text-gray-500 mt-2">Carregando cenários…</p>}
            {!carregando && !erro && cenarios.length === 0 && (
                <p className="text-xs text-gray-500 mt-2">Nenhum cenário salvo. "Criar cenários padrão" grava um Pessimista e um Otimista.</p>
            )}

            <CenarioSheet
                cenario={editando}
                study={study}
                proximaOrdem={cenarios.length}
                onClose={() => setEditando(null)}
                onSalvo={(c, criado) => {
                    onCenarios(criado ? [...cenarios, c] : cenarios.map(x => (x.id === c.id ? c : x)));
                    // §25: criar fecha; editar permanece aberto, já com o salvo.
                    setEditando(criado ? null : c);
                }}
                onExcluido={(id) => { onCenarios(cenarios.filter(x => x.id !== id)); setEditando(null); }}
            />
        </div>
    );
};

function CenarioSheet({ cenario, study, proximaOrdem, onClose, onSalvo, onExcluido }: {
    cenario: ImovibScenario | 'novo' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    onClose: () => void;
    onSalvo: (c: ImovibScenario, criado: boolean) => void;
    onExcluido: (id: string) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const confirm = useConfirm();
    const [nome, setNome] = useState('');
    const [choques, setChoques] = useState<Record<string, string>>({});
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mudou, setMudou] = useState(false);

    useEffect(() => {
        if (!cenario) return;
        setNome(cenario === 'novo' ? '' : cenario.name);
        setChoques(Object.fromEntries(VARIAVEIS_DO_ESTUDO.map(v => [v, cenario === 'novo' ? '' : String(cenario.choques[v] ?? '')])));
        setErro(null);
        setMudou(false);
    }, [cenario]);

    if (!cenario) return null;
    const novo = cenario === 'novo';
    const motivo = !pode ? motivoRo : !nome.trim() ? 'Dê um nome ao cenário.' : !mudou ? 'Nada foi alterado.' : undefined;

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const valores: Choques = {};
            for (const v of VARIAVEIS_DO_ESTUDO) {
                const n = parseFloat(choques[v]);
                if (Number.isFinite(n) && n !== 0) valores[v] = n;
            }
            const salvo = await imovibService.salvarCenario({
                ...(novo ? {} : { id: cenario.id }),
                study_id: study.id,
                name: nome.trim(),
                kind: novo ? 'personalizado' : cenario.kind,
                choques: valores,
                sort_order: novo ? proximaOrdem : cenario.sort_order,
            });
            setMudou(false);
            onSalvo(salvo, novo);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async () => {
        if (novo) return;
        if (!(await confirm({ title: 'Excluir cenário?', message: `O cenário "${cenario.name}" será removido deste estudo.`, confirmLabel: 'Excluir', variant: 'danger' }))) return;
        try {
            await imovibService.excluirCenario(cenario.id);
            onExcluido(cenario.id);
        } catch (e) {
            setErro((e as Error).message);
        }
    };

    return (
        <Sheet open={!!cenario} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{novo ? 'Novo cenário' : `Cenário: ${cenario.name}`}</SheetTitle>
                <SheetDescription>Choques sobre as premissas do estudo. Vazio ou zero = como no estudo.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-cenario-nome" className="text-xs font-semibold text-slate-500">Nome</label>
                        <input
                            id="imovib-cenario-nome"
                            value={nome}
                            onChange={e => { setNome(e.target.value); setMudou(true); }}
                            placeholder="Ex.: Juros altos"
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        {!novo && <p className="text-xs text-slate-500">Tipo: {ROTULO_DO_TIPO[cenario.kind]}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {VARIAVEIS_DO_ESTUDO.map(v => (
                            <div key={v} className="space-y-1.5">
                                <label htmlFor={`imovib-cenario-${v}`} className="text-xs font-semibold text-slate-500">{ROTULO_DA_VARIAVEL[v]} ({UNIDADE_DA_VARIAVEL[v]})</label>
                                <input
                                    id={`imovib-cenario-${v}`}
                                    type="number"
                                    step="any"
                                    value={choques[v] ?? ''}
                                    placeholder="0"
                                    onChange={e => { setChoques(prev => ({ ...prev, [v]: e.target.value })); setMudou(true); }}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                            </div>
                        ))}
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                {!novo && (
                    <button
                        type="button"
                        disabled={!pode}
                        title={!pode ? motivoRo : undefined}
                        onClick={() => void excluir()}
                        className="h-9 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[6px] mr-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Excluir
                    </button>
                )}
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{novo ? 'Cancelar' : 'Fechar'}</button>
                <button
                    type="button"
                    onClick={() => void salvar()}
                    disabled={salvando || !!motivo}
                    title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {novo ? 'Criar cenário' : 'Salvar cenário'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibCenariosCard;
