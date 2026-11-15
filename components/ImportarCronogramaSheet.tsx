import React from 'react';
import { FileUp, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { projectService } from '../services/projectService';
import { lerMsProjectXml, lerModeloExcel, ErroDeLeituraDeCronograma, type CronogramaImportado } from '../utils/cronogramaLeitura';
import { casarComOrcamento, type ResultadoDoCasamento } from '../utils/cronogramaCasamento';
import { type DecisaoDaTarefa, somarDiasUteis } from '../utils/cronogramaMontagem';
import { orcamentoBaseDoProjeto, criarPlanejamentoDoCronograma, type OrcamentoBase } from '../services/importarCronogramaService';
import { gerarModeloDeCronograma, NOME_DO_MODELO } from '../utils/cronogramaModelo';
import { aplicarAtualizacao, diferencasDaAtualizacao, avulsasDoOutline, type ResultadoDaAtualizacao } from '../utils/cronogramaAtualizacao';
import { genId } from '../utils/scheduleOutline';
import type { BudgetEntry, ProjectSchedule } from '../types';

/**
 * "Importar cronograma" em Engenharia › Planejamento — CRIAR um planejamento a partir de um
 * cronograma do MS Project (XML) ou do modelo Excel (fase 2c de
 * docs/planos/2026-11-14-planejamento-lista-critica.md). Painel lateral largo (brief confirmado):
 * a lista de planejamentos continua atrás. Três passos: arquivo e orçamento → casamento → confirmar.
 * Nada é gravado antes de "Criar planejamento".
 *
 * Modo "atualizar" (fase 2d): dentro do planejamento aberto, o mesmo arquivo atualiza datas e
 * predecessoras das tarefas casadas; o avanço só nas linhas marcadas (padrão desmarcado); a linha
 * de base não muda; o que o arquivo não traz fica como está. Quem grava é o pai (onAplicar), que
 * antes guarda o cronograma atual em Versões do planejamento.
 */

export interface OrcamentoParaEscolher {
    id: string;
    name: string;
    code?: string | null;
    /** Obra a que o orçamento está vinculado (só para a pessoa reconhecer). */
    obra?: string | null;
}

type Props = { open: boolean; onClose: () => void } & (
    | { modo: 'criar'; orcamentos: OrcamentoParaEscolher[]; onCriado: (id: string, nome: string) => void }
    | {
        modo: 'atualizar';
        planejamentoNome: string;
        /** Orçamento do planejamento aberto (o que já está congelado nele). */
        orcamento: BudgetEntry[];
        schedule: ProjectSchedule | undefined;
        onAplicar: (resultado: ResultadoDaAtualizacao, nomeDoArquivo: string) => void | Promise<void>;
    }
);

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

export function ImportarCronogramaSheet(props: Props) {
    const { open, onClose } = props;
    const atualizar = props.modo === 'atualizar';
    const orcamentos = props.modo === 'criar' ? props.orcamentos : [];
    const scheduleAtual = props.modo === 'atualizar' ? props.schedule : undefined;
    const [passo, setPasso] = React.useState<Passo>(1);
    const [trocarAvanco, setTrocarAvanco] = React.useState<Set<string>>(new Set());
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
        setTrocarAvanco(new Set());
        // Atualizar: o orçamento e o nome são os do planejamento aberto.
        if (props.modo === 'atualizar') { setBase({ budget: props.orcamento, versao: null, bdi: 0 }); setNome(props.planejamentoNome); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        () => (cronograma && base ? casarComOrcamento(cronograma, base.budget, atualizar ? avulsasDoOutline(scheduleAtual?.outline) : []) : null),
        [cronograma, base, atualizar, scheduleAtual],
    );
    const avulsasExistentes = React.useMemo(() => (atualizar ? avulsasDoOutline(scheduleAtual?.outline) : []), [atualizar, scheduleAtual]);
    // Atualizar: o que cada tarefa casada muda (datas e avanço, app × arquivo).
    const diferencas = React.useMemo(
        () => (atualizar && cronograma ? diferencasDaAtualizacao(cronograma, decisoes, scheduleAtual) : new Map()),
        [atualizar, cronograma, decisoes, scheduleAtual],
    );
    // A confirmação mostra o resultado da MESMA função que grava.
    const previa: ResultadoDaAtualizacao | null = React.useMemo(() => {
        if (props.modo !== 'atualizar' || !cronograma || !scheduleAtual || passo !== 3) return null;
        let n = 0;
        return aplicarAtualizacao({ schedule: scheduleAtual, orcamento: props.orcamento, cronograma, decisoes, trocarAvanco, gerarId: () => `previa-${++n}` });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [passo, cronograma, decisoes, trocarAvanco, scheduleAtual]);

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
        const escolhidos = new Set([...decisoes.values()].filter(d => d.tipo === 'item').map(d => (d as { itemId: string }).itemId));
        return { itens, semCusto, ignorar, foraDoArquivo: (base?.budget ?? []).filter(b => !escolhidos.has(b.id)).length };
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
            if (props.modo === 'atualizar') {
                if (!scheduleAtual) throw new Error('O cronograma deste planejamento ainda não carregou.');
                const r = aplicarAtualizacao({ schedule: scheduleAtual, orcamento: props.orcamento, cronograma, decisoes, trocarAvanco, gerarId: genId });
                await props.onAplicar(r, arquivo.name);
                return;
            }
            const { id } = await criarPlanejamentoDoCronograma({ orcamentoId, nome, cronograma, decisoes, nomeDoArquivo: arquivo.name });
            props.onCriado(id, nome.trim());
        } catch (err) {
            setErroSalvar(err instanceof Error ? err.message : atualizar ? 'Não foi possível atualizar o cronograma.' : 'Não foi possível criar o planejamento.');
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
        : atualizar ? null
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
                <SheetTitle>{atualizar ? 'Importar datas do cronograma' : 'Importar cronograma'}</SheetTitle>
                <SheetDescription>{atualizar
                    ? 'Atualiza as datas deste planejamento a partir de um cronograma do MS Project (XML) ou do modelo Excel. O que o arquivo não traz fica como está.'
                    : 'Cria um planejamento a partir de um cronograma do MS Project (XML) ou do modelo Excel.'}</SheetDescription>
                <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Passos">
                    {PASSOS.map(p => (
                        <li key={p.n} aria-current={passo === p.n ? 'step' : undefined}
                            className={passo === p.n ? 'font-semibold text-blue-700' : passo > p.n ? 'text-gray-700' : 'text-gray-500'}>
                            {p.n}. {atualizar && p.n === 1 ? 'Arquivo' : atualizar && p.n === 2 ? 'O que muda' : p.rotulo}
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

                        {atualizar ? (
                            <p className="text-sm text-gray-700">
                                As tarefas do arquivo casam com os {base?.budget.length ?? 0} itens do orçamento deste planejamento
                                {avulsasExistentes.length > 0 && ` e com as ${avulsasExistentes.length} tarefa(s) sem custo que ele já tem`}.
                            </p>
                        ) : (
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
                        )}
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
                        {atualizar && (() => {
                            const difs = [...diferencas.values()];
                            const comAvanco = difs.filter(d => d.mudaPercentual).map(d => d.chave);
                            const todos = comAvanco.length > 0 && comAvanco.every(c => trocarAvanco.has(c));
                            return (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                    <span><span className="font-medium text-gray-900">{difs.filter(d => d.mudaDatas).length}</span> tarefa(s) com datas novas</span>
                                    <span>·</span>
                                    <span><span className="font-medium text-gray-900">{comAvanco.length}</span> com avanço diferente ({trocarAvanco.size} marcado(s) para trocar)</span>
                                    {comAvanco.length > 0 && (
                                        <button type="button" onClick={() => setTrocarAvanco(todos ? new Set() : new Set(comAvanco))}
                                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
                                            {todos ? 'Desmarcar todos os avanços' : 'Marcar todos os avanços diferentes'}
                                        </button>
                                    )}
                                    <span className="basis-full text-xs text-gray-600">O avanço só muda nas linhas marcadas — o que veio do Diário de Obra fica como está.</span>
                                </div>
                            );
                        })()}
                        {casamento.casamentos.some(c => !c.itemId) && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-700">Sem par no orçamento ({casamento.casamentos.filter(c => !c.itemId).length}):</span>
                                <button type="button" onClick={() => decidirSemPar({ tipo: 'sem-custo' })} className="h-8 px-3 rounded-[6px] border border-gray-300 bg-white font-medium text-gray-800 hover:bg-gray-50">Criar todas sem custo</button>
                                <button type="button" onClick={() => decidirSemPar({ tipo: 'ignorar' })} className="h-8 px-3 rounded-[6px] border border-gray-300 bg-white font-medium text-gray-800 hover:bg-gray-50">Ignorar todas</button>
                            </div>
                        )}
                        <div className="overflow-x-auto rounded-[10px] border border-gray-200">
                            {/* Larguras fixas: a tarefa ocupa o resto e quebra linha — o seletor não estoura o painel. */}
                            <table className="w-full table-fixed text-sm">
                                <caption className="sr-only">Tarefas do arquivo e o item do orçamento de cada uma</caption>
                                <colgroup>
                                    <col className="w-[96px]" />
                                    <col />
                                    <col className="w-[112px]" />
                                    <col className={atualizar ? 'w-[124px]' : 'w-[64px]'} />
                                    <col className="w-[240px]" />
                                </colgroup>
                                <thead className="bg-white border-b border-gray-200">
                                    <tr className="text-left text-gray-700">
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">EAP</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">Tarefa do arquivo</th>
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">{atualizar ? 'Datas (app / arquivo)' : 'Datas'}</th>
                                        <th scope="col" className="px-3 py-2 font-semibold text-right">{atualizar ? 'Avanço' : '%'}</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">No planejamento</th>
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
                                                <td className="px-3 py-2 text-gray-900 break-words">
                                                    {t.nome}{t.marco && <span className="text-gray-500"> · marco</span>}
                                                </td>
                                                {(() => {
                                                    const dif = atualizar ? diferencas.get(t.chave) : undefined;
                                                    if (!dif) return (
                                                        <>
                                                            <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap" title={t.inicio ? `No app: ${dataBr(t.inicio)} a ${dataBr(fimNoApp)} (término = início + duração, como o motor do cronograma conta)` : undefined}>
                                                                {t.inicio ? `${dataBr(t.inicio).slice(0, 5)} – ${dataBr(t.termino).slice(0, 5)}` : '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700 tabular-nums text-right">{t.percentual}%</td>
                                                        </>
                                                    );
                                                    const marcado = trocarAvanco.has(t.chave);
                                                    return (
                                                        <>
                                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                                                {dif.mudaDatas ? (
                                                                    <span className="flex flex-col text-gray-900">
                                                                        <span className="text-gray-500 line-through" aria-label={`No app: ${dataBr(dif.noApp.inicio)} a ${dataBr(dif.noApp.termino)}`}>{dataBr(dif.noApp.inicio).slice(0, 5)} – {dataBr(dif.noApp.termino).slice(0, 5)}</span>
                                                                        <span aria-label={`No arquivo: ${dataBr(dif.doArquivo.inicio)} a ${dataBr(dif.doArquivo.termino)}`}>{dataBr(dif.doArquivo.inicio).slice(0, 5)} – {dataBr(dif.doArquivo.termino).slice(0, 5)}</span>
                                                                    </span>
                                                                ) : <span className="text-gray-600">sem mudança</span>}
                                                            </td>
                                                            <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">
                                                                {dif.mudaPercentual ? (
                                                                    <label className="inline-flex items-center gap-2 text-gray-900">
                                                                        {dif.noApp.percentual}% → {dif.doArquivo.percentual}%
                                                                        <input type="checkbox" checked={marcado}
                                                                            aria-label={`Trocar o avanço de "${t.nome}" de ${dif.noApp.percentual}% para ${dif.doArquivo.percentual}%`}
                                                                            onChange={e => setTrocarAvanco(prev => { const n = new Set(prev); if (e.target.checked) n.add(t.chave); else n.delete(t.chave); return n; })} />
                                                                    </label>
                                                                ) : <span className="text-gray-600">{dif.noApp.percentual}%</span>}
                                                            </td>
                                                        </>
                                                    );
                                                })()}
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
                                                        {avulsasExistentes.length > 0 && (
                                                            <optgroup label="Tarefa sem custo já existente">
                                                                {avulsasExistentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                                                            </optgroup>
                                                        )}
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
                            <p className="text-sm text-gray-600">{contagem.foraDoArquivo} item(ns) do orçamento não estão no arquivo — {atualizar ? 'ficam como estão.' : 'entram no planejamento sem datas.'}</p>
                        )}
                    </div>
                )}

                {passo === 3 && atualizar && cronograma && (
                    <div className="space-y-6">
                        {previa ? (
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 rounded-[10px] border border-gray-200 p-4 text-sm">
                                <div><dt className={rotulo}>Planejamento</dt><dd className="text-gray-900">{nome}</dd></div>
                                <div><dt className={rotulo}>Arquivo</dt><dd className="text-gray-900">{arquivo?.name}</dd></div>
                                <div><dt className={rotulo}>Datas e predecessoras trocadas</dt><dd className="text-gray-900">{previa.contagem.datasTrocadas} tarefa(s) com datas novas · {previa.contagem.semMudanca} sem mudança</dd></div>
                                <div><dt className={rotulo}>Avanço trocado</dt><dd className="text-gray-900">{previa.contagem.avancosTrocados} tarefa(s) — só as marcadas</dd></div>
                                <div><dt className={rotulo}>Tarefas sem custo novas</dt><dd className="text-gray-900">{previa.contagem.novasSemCusto}</dd></div>
                                <div><dt className={rotulo}>Ignoradas</dt><dd className="text-gray-900">{previa.contagem.ignoradas}</dd></div>
                                <div className="sm:col-span-2"><dt className={rotulo}>Linha de base</dt><dd className="text-gray-900">Não muda — o desvio contra ela aparece na Central de Comando.</dd></div>
                            </dl>
                        ) : (
                            <p className="text-sm text-gray-600">O cronograma deste planejamento ainda não carregou.</p>
                        )}
                        <p className="text-sm text-gray-600">Antes de aplicar, o cronograma atual é guardado em <span className="font-medium text-gray-800">Versões do planejamento</span> — dá para voltar a ele. As datas entram como estão no arquivo; o que o arquivo não traz fica como está.</p>
                        {(cronograma.avisos.length > 0 || (previa?.avisos.length ?? 0) > 0) && (
                            <div className="space-y-1.5">
                                <h3 className="text-sm font-semibold text-gray-900">Avisos ({cronograma.avisos.length + (previa?.avisos.length ?? 0)})</h3>
                                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">{[...cronograma.avisos, ...(previa?.avisos ?? [])].map((a, i) => <li key={i}>{a}</li>)}</ul>
                            </div>
                        )}
                        {erroSalvar && <p role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{erroSalvar}</p>}
                    </div>
                )}

                {passo === 3 && !atualizar && cronograma && base && (
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
                                {passo === 1 ? (atualizar ? 'Ver o que muda' : 'Ver casamento') : 'Revisar e confirmar'}
                            </button>
                        </span>
                    ) : (
                        <button type="button" onClick={() => void criar()} disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:bg-blue-300">
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {atualizar ? (salvando ? 'Atualizando…' : 'Atualizar cronograma') : (salvando ? 'Criando…' : 'Criar planejamento')}
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
