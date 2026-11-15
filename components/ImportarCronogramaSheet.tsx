import React from 'react';
import { FileUp, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { projectService } from '../services/projectService';
import { lerMsProjectXml, lerModeloExcel, ErroDeLeituraDeCronograma, type CronogramaImportado } from '../utils/cronogramaLeitura';
import { casarComOrcamento, type ResultadoDoCasamento } from '../utils/cronogramaCasamento';
import { type DecisaoDaTarefa, somarDiasUteis } from '../utils/cronogramaMontagem';
import { orcamentoBaseDoProjeto, criarPlanejamentoDoCronograma, type OrcamentoBase } from '../services/importarCronogramaService';
import { gerarModeloDeCronograma, NOME_DO_MODELO } from '../utils/cronogramaModelo';

/**
 * "Importar cronograma" em Engenharia › Planejamento — CRIAR um planejamento a partir de um
 * cronograma do MS Project (XML) ou do modelo Excel (fase 2c de
 * docs/planos/2026-11-14-planejamento-lista-critica.md). Painel lateral largo (brief confirmado):
 * a lista de planejamentos continua atrás. Três passos: arquivo e orçamento → casamento → confirmar.
 * Nada é gravado antes de "Criar planejamento".
 */

export interface OrcamentoParaEscolher {
    id: string;
    name: string;
    code?: string | null;
    /** Obra a que o orçamento está vinculado (só para a pessoa reconhecer). */
    obra?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    orcamentos: OrcamentoParaEscolher[];
    onCriado: (id: string, nome: string) => void;
}

type Passo = 1 | 2 | 3;
const PASSOS: { n: Passo; rotulo: string }[] = [
    { n: 1, rotulo: 'Arquivo e orçamento' },
    { n: 2, rotulo: 'Casamento' },
    { n: 3, rotulo: 'Confirmar' },
];

const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const VALOR_SEM_CUSTO = '__sem-custo__';
const VALOR_IGNORAR = '__ignorar__';

const campo = 'w-full h-9 rounded-[6px] border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500';
const rotulo = 'text-xs font-semibold text-slate-500';

export function ImportarCronogramaSheet({ open, onClose, orcamentos, onCriado }: Props) {
    const [passo, setPasso] = React.useState<Passo>(1);
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [cronograma, setCronograma] = React.useState<CronogramaImportado | null>(null);
    const [lendo, setLendo] = React.useState(false);
    const [erroLeitura, setErroLeitura] = React.useState<string | null>(null);
    const [orcamentoId, setOrcamentoId] = React.useState('');
    const [base, setBase] = React.useState<OrcamentoBase | null>(null);
    const [carregandoBase, setCarregandoBase] = React.useState(false);
    const [erroBase, setErroBase] = React.useState<string | null>(null);
    const [nome, setNome] = React.useState('');
    const [decisoes, setDecisoes] = React.useState<Map<string, DecisaoDaTarefa>>(new Map());
    const [soPendentes, setSoPendentes] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [erroSalvar, setErroSalvar] = React.useState<string | null>(null);
    const inputArquivo = React.useRef<HTMLInputElement>(null);

    // Começa limpo a cada abertura.
    React.useEffect(() => {
        if (!open) return;
        setPasso(1); setArquivo(null); setCronograma(null); setErroLeitura(null); setOrcamentoId(''); setBase(null);
        setErroBase(null); setNome(''); setDecisoes(new Map()); setSoPendentes(false); setErroSalvar(null);
    }, [open]);

    const lerArquivo = async (f: File) => {
        setArquivo(f); setCronograma(null); setErroLeitura(null); setLendo(true);
        try {
            const ext = f.name.toLowerCase().split('.').pop();
            let c: CronogramaImportado;
            if (ext === 'xml') c = lerMsProjectXml(await f.text());
            else if (ext === 'xlsx') c = await lerModeloExcel(await f.arrayBuffer());
            else if (ext === 'mpp') throw new ErroDeLeituraDeCronograma('Arquivo .mpp ainda não é lido aqui. No MS Project, use Arquivo › Salvar como › XML e importe o XML.');
            else throw new ErroDeLeituraDeCronograma('Use um arquivo .xml (MS Project) ou .xlsx (modelo Excel).');
            setCronograma(c);
            if (!nome.trim()) setNome((c.titulo || f.name.replace(/\.[^.]+$/, '')).trim());
        } catch (err) {
            setErroLeitura(err instanceof ErroDeLeituraDeCronograma ? err.message : 'Não foi possível ler o arquivo.');
        } finally {
            setLendo(false);
        }
    };

    const escolherOrcamento = async (id: string) => {
        setOrcamentoId(id); setBase(null); setErroBase(null);
        if (!id) return;
        setCarregandoBase(true);
        try {
            const p = await projectService.loadProject(id);
            const b = p ? orcamentoBaseDoProjeto(p as never) : null;
            if (!b || b.budget.length === 0) setErroBase('Este orçamento não tem itens — escolha outro.');
            else setBase(b);
        } catch {
            setErroBase('Não foi possível carregar o orçamento. Tente de novo.');
        } finally {
            setCarregandoBase(false);
        }
    };

    const casamento: ResultadoDoCasamento | null = React.useMemo(
        () => (cronograma && base ? casarComOrcamento(cronograma, base.budget) : null),
        [cronograma, base],
    );

    // Ao entrar no passo 2 pela 1ª vez: casadas → item; sem par → "sem custo" (não perde tarefa).
    const irParaCasamento = () => {
        if (!casamento) return;
        if (decisoes.size === 0) {
            const m = new Map<string, DecisaoDaTarefa>();
            for (const c of casamento.casamentos) m.set(c.tarefa.chave, c.itemId ? { tipo: 'item', itemId: c.itemId } : { tipo: 'sem-custo' });
            setDecisoes(m);
        }
        setPasso(2);
    };

    const itensPorId = React.useMemo(() => new Map((base?.budget ?? []).map(b => [b.id, b])), [base]);
    const usoDoItem = React.useMemo(() => {
        const n = new Map<string, number>();
        decisoes.forEach(d => { if (d.tipo === 'item') n.set(d.itemId, (n.get(d.itemId) ?? 0) + 1); });
        return n;
    }, [decisoes]);
    const duplicadas = [...usoDoItem.values()].filter(v => v > 1).length;
    const contagem = React.useMemo(() => {
        let itens = 0, semCusto = 0, ignorar = 0;
        decisoes.forEach(d => { if (d.tipo === 'item') itens++; else if (d.tipo === 'sem-custo') semCusto++; else ignorar++; });
        return { itens, semCusto, ignorar, foraDoArquivo: (base?.budget.length ?? 0) - new Set([...decisoes.values()].filter(d => d.tipo === 'item').map(d => (d as { itemId: string }).itemId)).size };
    }, [decisoes, base]);

    const mudarDecisao = (chave: string, valor: string) => {
        setDecisoes(prev => {
            const m = new Map(prev);
            m.set(chave, valor === VALOR_SEM_CUSTO ? { tipo: 'sem-custo' } : valor === VALOR_IGNORAR ? { tipo: 'ignorar' } : { tipo: 'item', itemId: valor });
            return m;
        });
    };
    const decidirSemPar = (d: DecisaoDaTarefa) => {
        if (!casamento) return;
        setDecisoes(prev => {
            const m = new Map(prev);
            casamento.casamentos.filter(c => !c.itemId).forEach(c => m.set(c.tarefa.chave, d));
            return m;
        });
    };

    const criar = async () => {
        if (!cronograma || !arquivo) return;
        setSalvando(true); setErroSalvar(null);
        try {
            const { id } = await criarPlanejamentoDoCronograma({ orcamentoId, nome, cronograma, decisoes, nomeDoArquivo: arquivo.name });
            onCriado(id, nome.trim());
        } catch (err) {
            setErroSalvar(err instanceof Error ? err.message : 'Não foi possível criar o planejamento.');
        } finally {
            setSalvando(false);
        }
    };

    const baixarModelo = async () => {
        const blob = await gerarModeloDeCronograma();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = NOME_DO_MODELO; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Motivo do botão desligado (sempre dito — memória do projeto: botão desligado diz por quê).
    const motivoPasso1 = lendo ? 'Lendo o arquivo…'
        : !cronograma ? 'Escolha o arquivo do cronograma'
        : !orcamentoId ? 'Escolha o orçamento base'
        : carregandoBase ? 'Carregando o orçamento…'
        : !base ? 'O orçamento escolhido não pode ser usado'
        : !nome.trim() ? 'Dê um nome ao planejamento' : null;
    const motivoPasso2 = duplicadas ? `${duplicadas} item(ns) do orçamento escolhido(s) em mais de uma tarefa — cada item só pode ficar em uma` : null;

    const periodo = cronograma ? (() => {
        const ini = cronograma.tarefas.map(t => t.inicio).filter(Boolean).sort();
        const fim = cronograma.tarefas.map(t => t.termino).filter(Boolean).sort();
        return { ini: ini[0] ?? '', fim: fim[fim.length - 1] ?? '' };
    })() : null;
    const orcamentoEscolhido = orcamentos.find(o => o.id === orcamentoId);
    const linhas = casamento ? casamento.casamentos.filter(c => {
        if (!soPendentes) return true;
        const d = decisoes.get(c.tarefa.chave);
        return !c.itemId || (d?.tipo === 'item' && (usoDoItem.get(d.itemId) ?? 0) > 1) || d?.tipo !== 'item';
    }) : [];

    return (
        <Sheet open={open} onClose={onClose} size="4xl" dirty={!!arquivo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Importar cronograma</SheetTitle>
                <SheetDescription>Cria um planejamento a partir de um cronograma do MS Project (XML) ou do modelo Excel.</SheetDescription>
                <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Passos">
                    {PASSOS.map(p => (
                        <li key={p.n} aria-current={passo === p.n ? 'step' : undefined}
                            className={passo === p.n ? 'font-semibold text-blue-700' : passo > p.n ? 'text-gray-700' : 'text-gray-500'}>
                            {p.n}. {p.rotulo}
                        </li>
                    ))}
                </ol>
            </SheetHeader>

            <SheetPanel className="p-6">
                {passo === 1 && (
                    <div className="space-y-8">
                        <section className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Arquivo do cronograma</h3>
                                <button type="button" onClick={baixarModelo} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                                    <Download className="w-4 h-4" aria-hidden="true" /> Baixar o modelo Excel
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <input ref={inputArquivo} type="file" accept=".xml,.xlsx,.mpp" className="sr-only" id="arquivo-cronograma"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) void lerArquivo(f); e.target.value = ''; }} />
                                <button type="button" onClick={() => inputArquivo.current?.click()}
                                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50">
                                    <FileUp className="w-4 h-4" aria-hidden="true" /> {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                                </button>
                                <span className="text-sm text-gray-700">{arquivo ? arquivo.name : 'MS Project em XML (Arquivo › Salvar como › XML) ou o modelo Excel (.xlsx)'}</span>
                            </div>
                            <div aria-live="polite">
                                {lendo && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Lendo o arquivo…</p>}
                                {erroLeitura && <p role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{erroLeitura}</p>}
                                {cronograma && (
                                    <p className="flex items-start gap-2 text-sm text-gray-700">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                                        {cronograma.tarefas.filter(t => !t.resumo).length} tarefas lidas ({cronograma.tarefas.filter(t => t.resumo).length} de resumo) · {dataBr(periodo!.ini)} a {dataBr(periodo!.fim)}
                                        {cronograma.avisos.length > 0 && ` · ${cronograma.avisos.length} aviso(s), vistos na confirmação`}
                                    </p>
                                )}
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Orçamento base e nome</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="orcamento-base" className={rotulo}>Orçamento base</label>
                                    <select id="orcamento-base" className={campo} value={orcamentoId} onChange={e => void escolherOrcamento(e.target.value)}>
                                        <option value="">Escolha o orçamento…</option>
                                        {orcamentos.map(o => (
                                            <option key={o.id} value={o.id}>{[o.code, o.name].filter(Boolean).join(' · ')}{o.obra ? ` — ${o.obra}` : ''}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500">
                                        {carregandoBase ? 'Carregando os itens…'
                                            : erroBase ? <span className="text-red-700">{erroBase}</span>
                                            : base ? `${base.budget.length} itens · ${base.versao ? `versão v${base.versao.item}` : 'orçamento atual'} · a organização vem dele`
                                            : 'As tarefas do arquivo casam com os itens deste orçamento.'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="nome-planejamento" className={rotulo}>Nome do planejamento</label>
                                    <input id="nome-planejamento" className={campo} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Cronograma executivo — Torre A" />
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {passo === 2 && casamento && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-gray-700" aria-live="polite">
                                <span className="font-medium text-gray-900">{contagem.itens}</span> com item do orçamento ·{' '}
                                <span className="font-medium text-gray-900">{contagem.semCusto}</span> sem custo ·{' '}
                                <span className="font-medium text-gray-900">{contagem.ignorar}</span> ignorada(s)
                                {duplicadas > 0 && <span className="text-red-700"> · {duplicadas} item(ns) em mais de uma tarefa</span>}
                            </p>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />
                                Só o que precisa de decisão
                            </label>
                        </div>
                        {casamento.casamentos.some(c => !c.itemId) && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-700">Sem par no orçamento ({casamento.casamentos.filter(c => !c.itemId).length}):</span>
                                <button type="button" onClick={() => decidirSemPar({ tipo: 'sem-custo' })} className="h-8 px-3 rounded-[6px] border border-gray-300 bg-white font-medium text-gray-800 hover:bg-gray-50">Criar todas sem custo</button>
                                <button type="button" onClick={() => decidirSemPar({ tipo: 'ignorar' })} className="h-8 px-3 rounded-[6px] border border-gray-300 bg-white font-medium text-gray-800 hover:bg-gray-50">Ignorar todas</button>
                            </div>
                        )}
                        <div className="overflow-x-auto rounded-[10px] border border-gray-200">
                            <table className="w-full text-sm">
                                <caption className="sr-only">Tarefas do arquivo e o item do orçamento de cada uma</caption>
                                <thead className="bg-white border-b border-gray-200">
                                    <tr className="text-left text-gray-700">
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">EAP</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">Tarefa do arquivo</th>
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">Datas</th>
                                        <th scope="col" className="px-3 py-2 font-semibold text-right">%</th>
                                        <th scope="col" className="px-3 py-2 font-semibold min-w-[260px]">No planejamento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {linhas.map(c => {
                                        const t = c.tarefa;
                                        const d = decisoes.get(t.chave);
                                        const valor = d?.tipo === 'item' ? d.itemId : d?.tipo === 'ignorar' ? VALOR_IGNORAR : VALOR_SEM_CUSTO;
                                        const repetido = d?.tipo === 'item' && (usoDoItem.get(d.itemId) ?? 0) > 1;
                                        const fimNoApp = t.inicio ? somarDiasUteis(t.inicio, t.marco ? 0 : Math.max(0, Math.round(t.duracaoDias ?? 0))) : '';
                                        return (
                                            <tr key={t.chave} className="align-top">
                                                <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">{t.eap || '—'}</td>
                                                <td className="px-3 py-2 text-gray-900">
                                                    {t.nome}{t.marco && <span className="text-gray-500"> · marco</span>}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap" title={t.inicio ? `No app: ${dataBr(t.inicio)} a ${dataBr(fimNoApp)} (término = início + duração, como o motor do cronograma conta)` : undefined}>
                                                    {t.inicio ? `${dataBr(t.inicio).slice(0, 5)} – ${dataBr(t.termino).slice(0, 5)}` : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 tabular-nums text-right">{t.percentual}%</td>
                                                <td className="px-3 py-2">
                                                    <label className="sr-only" htmlFor={`decisao-${t.chave}`}>No planejamento: {t.nome}</label>
                                                    <select id={`decisao-${t.chave}`} value={valor} onChange={e => mudarDecisao(t.chave, e.target.value)}
                                                        className={`${campo} ${repetido ? 'border-red-400' : ''}`} aria-invalid={repetido || undefined}>
                                                        <option value={VALOR_SEM_CUSTO}>Criar como tarefa sem custo</option>
                                                        <option value={VALOR_IGNORAR}>Ignorar esta tarefa</option>
                                                        <optgroup label="Item do orçamento">
                                                            {base!.budget.map(b => (
                                                                <option key={b.id} value={b.id}>{(b.subPhase || b.phase || '').slice(0, 40)} · {b.sinapiItem?.description?.slice(0, 50)}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {repetido ? <span className="text-red-700">Este item já está em outra tarefa.</span>
                                                            : c.itemId && d?.tipo === 'item' && d.itemId === c.itemId ? `Casou ${c.motivo === 'eap' ? 'pela EAP' : 'pelo nome'}`
                                                            : !c.itemId ? 'Sem par no orçamento' : 'Escolha sua'}
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {linhas.length === 0 && (
                                        <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-600">Nada precisa de decisão — todas as tarefas casaram com um item.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {contagem.foraDoArquivo > 0 && (
                            <p className="text-sm text-gray-600">{contagem.foraDoArquivo} item(ns) do orçamento não estão no arquivo — entram no planejamento sem datas.</p>
                        )}
                    </div>
                )}

                {passo === 3 && cronograma && base && (
                    <div className="space-y-6">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 rounded-[10px] border border-gray-200 p-4 text-sm">
                            <div><dt className={rotulo}>Planejamento</dt><dd className="text-gray-900">{nome.trim()}</dd></div>
                            <div><dt className={rotulo}>Orçamento base</dt><dd className="text-gray-900">{orcamentoEscolhido?.name} · {base.versao ? `versão v${base.versao.item}` : 'orçamento atual'}</dd></div>
                            <div><dt className={rotulo}>Organização</dt><dd className="text-gray-900">A do orçamento base{orcamentoEscolhido?.obra ? ` (obra ${orcamentoEscolhido.obra})` : ''}</dd></div>
                            <div><dt className={rotulo}>Período do arquivo</dt><dd className="text-gray-900 tabular-nums">{dataBr(periodo!.ini)} a {dataBr(periodo!.fim)}</dd></div>
                            <div><dt className={rotulo}>Tarefas</dt><dd className="text-gray-900">{contagem.itens} com item · {contagem.semCusto} sem custo · {contagem.ignorar} ignorada(s)</dd></div>
                            <div><dt className={rotulo}>Itens do orçamento sem tarefa</dt><dd className="text-gray-900">{contagem.foraDoArquivo} (entram sem datas)</dd></div>
                            <div className="sm:col-span-2"><dt className={rotulo}>Linha de base</dt><dd className="text-gray-900">"Cronograma importado", ativa, com as datas do arquivo — o desvio passa a ser medido contra ela.</dd></div>
                        </dl>
                        <p className="text-sm text-gray-600">As datas entram como estão no arquivo: o cronograma só é recalculado quando alguém editar. Tarefa sem custo aparece no Gantt e conta em atrasadas e críticas, mas não move o avanço físico.</p>
                        {cronograma.avisos.length > 0 && (
                            <div className="space-y-1.5">
                                <h3 className="text-sm font-semibold text-gray-900">Avisos da leitura ({cronograma.avisos.length})</h3>
                                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">{cronograma.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                            </div>
                        )}
                        {erroSalvar && <p role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{erroSalvar}</p>}
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
              <div className="w-full">
                <div className="flex w-full items-center justify-end gap-2">
                    {passo === 1 ? (
                        <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[6px] border border-gray-300 bg-white text-[13px] font-medium text-gray-800 hover:bg-gray-50">Cancelar</button>
                    ) : (
                        <button type="button" onClick={() => setPasso((passo - 1) as Passo)} disabled={salvando} className="h-9 px-3.5 rounded-[6px] border border-gray-300 bg-white text-[13px] font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60">Voltar</button>
                    )}
                    {passo < 3 ? (
                        <span title={(passo === 1 ? motivoPasso1 : motivoPasso2) ?? undefined}>
                            <button type="button"
                                onClick={() => (passo === 1 ? irParaCasamento() : setPasso(3))}
                                disabled={!!(passo === 1 ? motivoPasso1 : motivoPasso2)}
                                className="h-9 px-3.5 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">
                                {passo === 1 ? 'Ver casamento' : 'Revisar e confirmar'}
                            </button>
                        </span>
                    ) : (
                        <button type="button" onClick={() => void criar()} disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:bg-blue-300">
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {salvando ? 'Criando…' : 'Criar planejamento'}
                        </button>
                    )}
                </div>
                {passo < 3 && (passo === 1 ? motivoPasso1 : motivoPasso2) && (
                    <p className="mt-2 w-full text-right text-xs text-gray-600">{passo === 1 ? motivoPasso1 : motivoPasso2}</p>
                )}
              </div>
            </SheetFooter>
        </Sheet>
    );
}

export default ImportarCronogramaSheet;
