import React from 'react';
import { FileUp, Download, AlertTriangle, CheckCircle2, Loader2, FilePlus2, Copy } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { projectService } from '../services/projectService';
import { lerMsProjectXml, lerModeloExcel, ErroDeLeituraDeCronograma, type CronogramaImportado } from '../utils/cronogramaLeitura';
import { casarComOrcamento, type ResultadoDoCasamento } from '../utils/cronogramaCasamento';
import { type DecisaoDaTarefa } from '../utils/cronogramaMontagem';
import { orcamentoBaseDoProjeto, criarPlanejamentoDoCronograma, criarPlanejamentoEmBranco, duplicarPlanejamento, type OrcamentoBase } from '../services/importarCronogramaService';
import { indicadoresDePrazo, folhasDoOrcamento, diasEntre, terminoParaExibir, calendarioDoCronograma, type IndicadoresDePrazo } from '../utils/planejamentoIndicadores';
import { situacaoDePrazo, diasPorExtenso } from '../utils/planejamentoGrupos';
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
 *
 * 2ª crítica (15/11/2026, publicação 2 de docs/planos/2026-11-15-planejamento-lista-critica-2.md):
 * o modo "criar" virou o ÚNICO "Novo planejamento" — havia duas portas (modal central com o
 * orçamento escondido na 2ª aba e "Criar" ligado com tudo vazio; e este painel, com a ordem oposta).
 * Três origens: em branco a partir de um orçamento, importar arquivo, duplicar. O orçamento vem
 * primeiro e a organização vem dele.
 */

export interface OrcamentoParaEscolher {
    id: string;
    name: string;
    code?: string | null;
    /** Obra a que o orçamento está vinculado (só para a pessoa reconhecer). */
    obra?: string | null;
    /** Nome da organização do orçamento — é a do planejamento (cascata). */
    organizacao?: string | null;
}

export interface PlanejamentoParaCopiar {
    id: string;
    name: string;
    code?: string | null;
    organizacao?: string | null;
}

export type OrigemDoPlanejamento = 'branco' | 'arquivo' | 'duplicar';

const ORIGENS: { valor: OrigemDoPlanejamento; titulo: string; descricao: string; Icone: typeof FileUp }[] = [
    { valor: 'branco', titulo: 'Em branco', descricao: 'Com os itens de um orçamento; você monta as datas no cronograma.', Icone: FilePlus2 },
    { valor: 'arquivo', titulo: 'Importar arquivo', descricao: 'MS Project (XML) ou o modelo Excel, casado com os itens do orçamento.', Icone: FileUp },
    { valor: 'duplicar', titulo: 'Duplicar', descricao: 'Copia um planejamento: cronograma, orçamento congelado e vínculo.', Icone: Copy },
];

type Props = { open: boolean; onClose: () => void } & (
    | {
        modo: 'criar';
        orcamentos: OrcamentoParaEscolher[];
        planejamentos: PlanejamentoParaCopiar[];
        /** Abrir já numa origem (o "Duplicar" da linha abre em 'duplicar' com o planejamento escolhido). */
        origemInicial?: OrigemDoPlanejamento;
        copiarDe?: string;
        onCriado: (id: string, nome: string, origem: OrigemDoPlanejamento) => void;
    }
    | {
        modo: 'atualizar';
        planejamentoNome: string;
        /** Orçamento do planejamento aberto (o que já está congelado nele). */
        orcamento: BudgetEntry[];
        schedule: ProjectSchedule | undefined;
        onAplicar: (resultado: ResultadoDaAtualizacao, nomeDoArquivo: string) => void | Promise<void>;
        /** Motivo que impede atualizar (ex.: modo What-If) — dito ao abrir, não no clique final. */
        bloqueadoPor?: string | null;
    }
);

type Passo = 1 | 2 | 3;
const PASSOS: { n: Passo; rotulo: string }[] = [
    { n: 1, rotulo: 'Arquivo e orçamento' },
    { n: 2, rotulo: 'Casamento' },
    { n: 3, rotulo: 'Confirmar' },
];

const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** Data curta COM ano ("05/08/26"): sem ano, um cronograma que cruza o ano ficava ambíguo. */
const dataCurta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const VALOR_SEM_CUSTO = '__sem-custo__';
const VALOR_IGNORAR = '__ignorar__';

const campo = 'w-full h-9 rounded-[6px] border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500';
const rotulo = 'text-xs font-semibold text-slate-500';

export function ImportarCronogramaSheet(props: Props) {
    const { open, onClose } = props;
    const atualizar = props.modo === 'atualizar';
    const orcamentos = props.modo === 'criar' ? props.orcamentos : [];
    const planejamentos = props.modo === 'criar' ? props.planejamentos : [];
    const bloqueadoPor = props.modo === 'atualizar' ? props.bloqueadoPor ?? null : null;
    const [origem, setOrigem] = React.useState<OrigemDoPlanejamento>('branco');
    const [copiarId, setCopiarId] = React.useState('');
    const [inicio, setInicio] = React.useState('');
    const [termino, setTermino] = React.useState('');
    // O nome é preenchido sozinho (orçamento, arquivo, cópia) até a pessoa digitar o dela.
    const nomeAutomatico = React.useRef(true);
    // Troca de passo: foco no conteúdo novo (ver o efeito junto dos motivos).
    const conteudoRef = React.useRef<HTMLDivElement>(null);
    const passoAnterior = React.useRef<Passo>(1);
    const scheduleAtual = props.modo === 'atualizar' ? props.schedule : undefined;
    const [passo, setPasso] = React.useState<Passo>(1);
    const [trocarAvanco, setTrocarAvanco] = React.useState<Set<string>>(new Set());
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [cronograma, setCronograma] = React.useState<CronogramaImportado | null>(null);
    const [lendo, setLendo] = React.useState(false);
    const [erroLeitura, setErroLeitura] = React.useState<string | null>(null);
    // .mpp (formato binário do MS Project) não é lido — decisão de 15/11/2026: orientar "Salvar como
    // XML" em vez de um conversor no servidor (plano, fase 2e). Escolher um .mpp abre o passo a passo.
    const [escolheuMpp, setEscolheuMpp] = React.useState(false);
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
        setTrocarAvanco(new Set()); setEscolheuMpp(false);
        setInicio(''); setTermino(''); nomeAutomatico.current = true;
        passoAnterior.current = 1;
        // Atualizar abre filtrando "Só o que muda" (as 3 mudanças não ficam diluídas em 38 linhas).
        setSoPendentes(props.modo === 'atualizar');
        // Atualizar: o orçamento e o nome são os do planejamento aberto.
        if (props.modo === 'atualizar') { setBase({ budget: props.orcamento, versao: null, bdi: 0 }); setNome(props.planejamentoNome); }
        if (props.modo === 'criar') {
            setOrigem(props.origemInicial ?? 'branco');
            const copia = props.copiarDe ? props.planejamentos.find(x => x.id === props.copiarDe) : undefined;
            setCopiarId(copia?.id ?? '');
            if (copia) setNome(`${copia.name} (cópia)`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const lerArquivo = async (f: File) => {
        setArquivo(f); setCronograma(null); setErroLeitura(null); setEscolheuMpp(false); setLendo(true);
        try {
            const ext = f.name.toLowerCase().split('.').pop();
            let c: CronogramaImportado;
            if (ext === 'xml') c = lerMsProjectXml(await f.text());
            else if (ext === 'xlsx') c = await lerModeloExcel(await f.arrayBuffer());
            else if (ext === 'mpp') { setEscolheuMpp(true); setArquivo(null); return; }
            else throw new ErroDeLeituraDeCronograma('Use um arquivo .xml (MS Project) ou .xlsx (modelo Excel).');
            setCronograma(c);
            // Só ao CRIAR: ao atualizar, o nome é o do planejamento aberto (o título do arquivo não o troca).
            if (!atualizar && nomeAutomatico.current) setNome((c.titulo || f.name.replace(/\.[^.]+$/, '')).trim());
        } catch (err) {
            setErroLeitura(err instanceof ErroDeLeituraDeCronograma ? err.message : 'Não foi possível ler o arquivo.');
        } finally {
            setLendo(false);
        }
    };

    const escolherOrcamento = async (id: string) => {
        setOrcamentoId(id); setBase(null); setErroBase(null);
        if (!id) return;
        // Em branco: o nome sai do orçamento (o app já sabe — não pede de novo).
        const o = orcamentos.find(x => x.id === id);
        if (o && origem === 'branco' && nomeAutomatico.current) setNome(`${o.name} — Planejamento`);
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

    // A consequência, não só a contagem: término e prazo antes → depois (mesma conta da lista).
    const prazoAntesDepois: { antes: IndicadoresDePrazo; depois: IndicadoresDePrazo } | null = React.useMemo(() => {
        if (props.modo !== 'atualizar' || !previa || !scheduleAtual) return null;
        const folhas = folhasDoOrcamento(props.orcamento);
        return { antes: indicadoresDePrazo(folhas, scheduleAtual), depois: indicadoresDePrazo(folhas, previa.schedule) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previa, scheduleAtual]);

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
            props.onCriado(id, nome.trim(), 'arquivo');
        } catch (err) {
            setErroSalvar(err instanceof Error ? err.message : atualizar ? 'Não foi possível atualizar o cronograma.' : 'Não foi possível criar o planejamento.');
        } finally {
            setSalvando(false);
        }
    };

    const criarSemArquivo = async () => {
        setSalvando(true); setErroSalvar(null);
        try {
            const { id } = origem === 'duplicar'
                ? await duplicarPlanejamento({ planejamentoId: copiarId, nome })
                : await criarPlanejamentoEmBranco({ orcamentoId, nome, inicio, termino });
            if (props.modo === 'criar') props.onCriado(id, nome.trim(), origem);
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
    const motivoDoOrcamento = !orcamentoId ? 'Escolha o orçamento base'
        : carregandoBase ? 'Carregando o orçamento…'
        : !base ? 'O orçamento escolhido não pode ser usado' : null;
    const motivoDoArquivo = lendo ? 'Lendo o arquivo…' : !cronograma ? 'Escolha o arquivo do cronograma' : null;
    const motivoPasso1 = atualizar ? (bloqueadoPor ?? motivoDoArquivo)
        : origem === 'duplicar' ? (!copiarId ? 'Escolha o planejamento a copiar' : !nome.trim() ? 'Dê um nome ao planejamento' : null)
        : origem === 'branco' ? (motivoDoOrcamento ?? (!nome.trim() ? 'Dê um nome ao planejamento'
            : inicio && termino && termino < inicio ? 'O término previsto é antes do início' : null))
        : (motivoDoOrcamento ?? (!nome.trim() ? 'Dê um nome ao planejamento' : motivoDoArquivo));
    const comPassos = atualizar || origem === 'arquivo';
    const rotuloDoPasso = (n: Passo) => (atualizar && n === 1 ? 'Arquivo' : atualizar && n === 2 ? 'O que muda' : !atualizar && n === 1 ? 'Origem, orçamento e arquivo' : PASSOS[n - 1].rotulo);
    // Troca de passo: foco no conteúdo novo e anúncio (o botão clicado some — o foco caía no <body>).
    // Só quando o PASSO muda com o painel aberto (abrir é do Sheet; voltar ao 1 ao reabrir não conta).
    React.useEffect(() => {
        if (open && passoAnterior.current !== passo) conteudoRef.current?.focus({ preventScroll: true });
        passoAnterior.current = passo;
    }, [passo, open]);
    const motivoPasso2 = duplicadas ? `${duplicadas} item(ns) do orçamento escolhido(s) em mais de uma tarefa — cada item só pode ficar em uma` : null;

    const periodo = cronograma ? (() => {
        const ini = cronograma.tarefas.map(t => t.inicio).filter(Boolean).sort();
        const fim = cronograma.tarefas.map(t => t.termino).filter(Boolean).sort();
        return { ini: ini[0] ?? '', fim: fim[fim.length - 1] ?? '' };
    })() : null;
    const orcamentoEscolhido = orcamentos.find(o => o.id === orcamentoId);
    // Término mostrado = último dia trabalhado (as diferenças guardam o fim do motor, o dia útil seguinte).
    const calAtual = calendarioDoCronograma(scheduleAtual);
    const fimVisto = (d: { inicio: string; termino: string }) => terminoParaExibir(d.inicio, d.termino, calAtual);
    const mudaNaAtualizacao = (chave: string) => {
        const dif = diferencas.get(chave);
        return !!dif && (dif.mudaDatas || dif.mudaPercentual);
    };
    const linhas = casamento ? casamento.casamentos.filter(c => {
        if (!soPendentes) return true;
        const d = decisoes.get(c.tarefa.chave);
        const precisaDecidir = !c.itemId || (d?.tipo === 'item' && (usoDoItem.get(d.itemId) ?? 0) > 1) || d?.tipo !== 'item';
        return atualizar ? precisaDecidir || mudaNaAtualizacao(c.tarefa.chave) : precisaDecidir;
    }) : [];
    // Atualizar: o que muda vem primeiro (ordem do arquivo dentro de cada bloco).
    if (atualizar) linhas.sort((a, b) => Number(mudaNaAtualizacao(b.tarefa.chave)) - Number(mudaNaAtualizacao(a.tarefa.chave)));
    const sujo = !salvando && (!!arquivo || !!orcamentoId || !!copiarId || (!nomeAutomatico.current && !!nome.trim()));

    return (
        <Sheet open={open} onClose={onClose} size="4xl" dirty={sujo}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{atualizar ? 'Importar datas do cronograma' : 'Novo planejamento'}</SheetTitle>
                <SheetDescription>{atualizar
                    ? 'Atualiza as datas deste planejamento a partir de um cronograma do MS Project (XML) ou do modelo Excel. O que o arquivo não traz fica como está.'
                    : 'Escolha de onde vem o cronograma. O orçamento base traz os itens e a organização.'}</SheetDescription>
                {comPassos && (
                <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Passos">
                    {PASSOS.map(p => (
                        <li key={p.n} aria-current={passo === p.n ? 'step' : undefined}
                            className={passo === p.n ? 'font-semibold text-blue-700' : passo > p.n ? 'text-gray-700' : 'text-gray-500'}>
                            {p.n}. {rotuloDoPasso(p.n)}
                        </li>
                    ))}
                </ol>
                )}
                {comPassos && <p className="sr-only" aria-live="polite">{`Passo ${passo} de 3: ${rotuloDoPasso(passo)}`}</p>}
            </SheetHeader>

            <SheetPanel className="p-6">
              <div ref={conteudoRef} tabIndex={-1} className="outline-none">
                {passo === 1 && (
                    <div className="space-y-8">
                        {bloqueadoPor && (
                            <p role="alert" className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{bloqueadoPor}
                            </p>
                        )}
                        {!atualizar && (
                            <fieldset className="space-y-3">
                                <legend className="text-sm font-semibold text-gray-900">De onde vem o cronograma</legend>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {ORIGENS.map(({ valor, titulo, descricao, Icone }) => {
                                        const ativa = origem === valor;
                                        return (
                                            <label key={valor}
                                                className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${ativa ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                                                <input type="radio" name="origem-do-planejamento" value={valor} checked={ativa}
                                                    onChange={() => { setOrigem(valor); setErroSalvar(null); }}
                                                    className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                                                <span className="min-w-0">
                                                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                        <Icone className={`w-4 h-4 ${ativa ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />{titulo}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-gray-600">{descricao}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        )}

                        {!atualizar && origem === 'duplicar' && (
                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Planejamento a copiar e nome</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="space-y-1.5">
                                        <label htmlFor="planejamento-copiar" className={rotulo}>Planejamento a copiar</label>
                                        <select id="planejamento-copiar" className={campo} value={copiarId}
                                            onChange={e => {
                                                setCopiarId(e.target.value);
                                                const x = planejamentos.find(pl => pl.id === e.target.value);
                                                if (x && nomeAutomatico.current) setNome(`${x.name} (cópia)`);
                                            }}>
                                            <option value="">Escolha o planejamento…</option>
                                            {planejamentos.map(pl => (
                                                <option key={pl.id} value={pl.id}>{[pl.code, pl.name].filter(Boolean).join(' · ')}{pl.organizacao ? ` — ${pl.organizacao}` : ''}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-500">Copia o cronograma, o orçamento congelado e o vínculo. A cópia fica na mesma organização e ganha o próximo código dela.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="nome-planejamento" className={rotulo}>Nome do planejamento</label>
                                        <input id="nome-planejamento" className={campo} value={nome} onChange={e => { nomeAutomatico.current = false; setNome(e.target.value); }} placeholder="Ex.: Cronograma executivo — Torre A" />
                                    </div>
                                </div>
                            </section>
                        )}

                        {!atualizar && origem !== 'duplicar' && (
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
                                            : base ? `${base.budget.length} itens · ${base.versao ? `versão v${base.versao.item}` : 'orçamento atual'}${orcamentoEscolhido?.organizacao ? ` · organização ${orcamentoEscolhido.organizacao}` : ''}`
                                            : origem === 'arquivo' ? 'As tarefas do arquivo casam com os itens deste orçamento.' : 'Os itens deste orçamento viram as tarefas do cronograma.'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="nome-planejamento" className={rotulo}>Nome do planejamento</label>
                                    <input id="nome-planejamento" className={campo} value={nome} onChange={e => { nomeAutomatico.current = false; setNome(e.target.value); }} placeholder="Ex.: Cronograma executivo — Torre A" />
                                </div>
                                {origem === 'branco' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label htmlFor="inicio-previsto" className={rotulo}>Início previsto <span className="font-normal text-gray-500">(opcional)</span></label>
                                            <input id="inicio-previsto" type="date" className={campo} value={inicio} onChange={e => setInicio(e.target.value)} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label htmlFor="termino-previsto" className={rotulo}>Término previsto <span className="font-normal text-gray-500">(opcional)</span></label>
                                            <input id="termino-previsto" type="date" className={campo} value={termino} onChange={e => setTermino(e.target.value)}
                                                aria-invalid={inicio && termino && termino < inicio ? true : undefined} />
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                        )}

                        {(atualizar || origem === 'arquivo') && (
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
                                {escolheuMpp && <p role="alert" className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />Arquivo .mpp: salve como XML no MS Project (passo a passo abaixo) e escolha o .xml.</p>}
                                {cronograma && (
                                    <p className="flex items-start gap-2 text-sm text-gray-700">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                                        {cronograma.tarefas.filter(t => !t.resumo).length} tarefas lidas ({cronograma.tarefas.filter(t => t.resumo).length} de resumo) · {dataBr(periodo!.ini)} a {dataBr(periodo!.fim)}
                                        {cronograma.avisos.length > 0 && ` · ${cronograma.avisos.length} aviso(s), vistos na confirmação`}
                                    </p>
                                )}
                            </div>
                            <details open={escolheuMpp} className="rounded-[10px] border border-gray-200 bg-white text-sm">
                                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-gray-800">
                                    {escolheuMpp ? 'O arquivo .mpp precisa ser salvo como XML antes' : 'Tem um arquivo .mpp? Veja como gerar o XML no MS Project'}
                                </summary>
                                <div className="space-y-2 border-t border-gray-100 px-3 py-3 text-gray-700">
                                    {escolheuMpp && <p>O .mpp é o formato próprio do MS Project e não é lido aqui. O XML que o próprio Project gera traz tudo: EAP, datas, durações, % concluído e predecessoras.</p>}
                                    <ol className="list-decimal space-y-1 pl-5">
                                        <li>Abra o cronograma no Microsoft Project.</li>
                                        <li>Vá em <span className="font-medium text-gray-900">Arquivo › Salvar como</span> (em algumas versões, <span className="font-medium text-gray-900">Arquivo › Exportar › Salvar projeto como arquivo</span>).</li>
                                        <li>Em <span className="font-medium text-gray-900">Tipo</span>, escolha <span className="font-medium text-gray-900">Formato XML (*.xml)</span> e salve.</li>
                                        <li>Volte aqui e escolha o arquivo <span className="font-medium text-gray-900">.xml</span> que foi salvo.</li>
                                    </ol>
                                </div>
                            </details>
                        </section>

                        )}

                        {atualizar && (
                            <p className="text-sm text-gray-700">
                                As tarefas do arquivo casam com os {base?.budget.length ?? 0} itens do orçamento deste planejamento
                                {avulsasExistentes.length > 0 && ` e com as ${avulsasExistentes.length} tarefa(s) sem custo que ele já tem`}.
                            </p>
                        )}
                        {!atualizar && origem !== 'arquivo' && erroSalvar && (
                            <p role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{erroSalvar}</p>
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
                                {atualizar ? 'Só o que muda ou precisa de decisão' : 'Só o que precisa de decisão'}
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
                            {/* Abaixo de md a tabela vira lista empilhada: 5 colunas fixas não cabem em 340 px
                                (a tarefa virava uma letra por linha — 2ª crítica). */}
                            <table className="w-full table-fixed text-sm max-md:block max-md:min-w-0">
                                <caption className="sr-only">Tarefas do arquivo e o item do orçamento de cada uma</caption>
                                <colgroup>
                                    <col className="w-[96px]" />
                                    <col />
                                    <col className={atualizar ? 'w-[150px]' : 'w-[168px]'} />
                                    <col className={atualizar ? 'w-[124px]' : 'w-[64px]'} />
                                    <col className="w-[240px]" />
                                </colgroup>
                                <thead className="bg-white border-b border-gray-200 max-md:hidden">
                                    <tr className="text-left text-gray-700">
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">EAP</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">Tarefa do arquivo</th>
                                        <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">{atualizar ? 'Datas (app / arquivo)' : 'Datas'}</th>
                                        <th scope="col" className="px-3 py-2 font-semibold text-right">{atualizar ? 'Avanço' : '%'}</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">No planejamento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 max-md:block">
                                    {linhas.map(c => {
                                        const t = c.tarefa;
                                        const d = decisoes.get(t.chave);
                                        const valor = d?.tipo === 'item' ? d.itemId : d?.tipo === 'ignorar' ? VALOR_IGNORAR : VALOR_SEM_CUSTO;
                                        const repetido = d?.tipo === 'item' && (usoDoItem.get(d.itemId) ?? 0) > 1;
                                        return (
                                            <tr key={t.chave} className="align-top max-md:grid max-md:grid-cols-[auto_1fr] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-3">
                                                <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap max-md:p-0">{t.eap || '—'}</td>
                                                <td className="px-3 py-2 text-gray-900 break-words max-md:p-0 max-md:min-w-0">
                                                    {t.nome}{t.marco && <span className="text-gray-500"> · marco</span>}
                                                </td>
                                                {(() => {
                                                    const dif = atualizar ? diferencas.get(t.chave) : undefined;
                                                    if (!dif) return (
                                                        <>
                                                            <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap max-md:p-0">
                                                                {t.inicio ? `${dataCurta(t.inicio)} – ${dataCurta(t.termino)}` : '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700 tabular-nums text-right max-md:p-0 max-md:text-left">{t.percentual}%</td>
                                                        </>
                                                    );
                                                    const marcado = trocarAvanco.has(t.chave);
                                                    return (
                                                        <>
                                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap max-md:p-0">
                                                                {dif.mudaDatas ? (
                                                                    <span className="flex flex-col text-gray-900">
                                                                        <span className="text-gray-500 line-through" aria-label={`No app: ${dataBr(dif.noApp.inicio)} a ${dataBr(fimVisto(dif.noApp))}`}>{dataCurta(dif.noApp.inicio)} – {dataCurta(fimVisto(dif.noApp))}</span>
                                                                        <span aria-label={`No arquivo: ${dataBr(dif.doArquivo.inicio)} a ${dataBr(fimVisto(dif.doArquivo))}`}>{dataCurta(dif.doArquivo.inicio)} – {dataCurta(fimVisto(dif.doArquivo))}</span>
                                                                    </span>
                                                                ) : <span className="text-gray-600">sem mudança</span>}
                                                            </td>
                                                            <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap max-md:p-0 max-md:text-left">
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
                                                <td className="px-3 py-2 max-md:col-span-2 max-md:p-0 max-md:pt-1 max-md:min-w-0">
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
                                                            : !c.itemId && c.mesmoNumeroOutroNome && d?.tipo !== 'item' ? <span className="text-amber-800">{`O ${c.tarefa.eap} do orçamento tem outro nome — escolha à mão se for o mesmo serviço`}</span>
                                                            : !c.itemId ? 'Sem par no orçamento' : 'Escolha sua'}
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {linhas.length === 0 && (
                                        <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-600">{atualizar ? 'Nada muda e nada precisa de decisão — o arquivo traz as mesmas datas e o mesmo avanço.' : 'Nada precisa de decisão — todas as tarefas casaram com um item.'}</td></tr>
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
                                {prazoAntesDepois && (() => {
                                    const { antes, depois } = prazoAntesDepois;
                                    const mudouFim = antes.fimPrevisto !== depois.fimPrevisto;
                                    const delta = antes.fimPrevisto && depois.fimPrevisto ? diasEntre(antes.fimPrevisto, depois.fimPrevisto) : 0;
                                    const sitAntes = situacaoDePrazo(antes).texto;
                                    const sitDepois = situacaoDePrazo(depois).texto;
                                    return (
                                        <>
                                            <div>
                                                <dt className={rotulo}>Término</dt>
                                                <dd className="text-gray-900 tabular-nums">
                                                    {mudouFim ? `${dataBr(antes.fimPrevisto)} → ${dataBr(depois.fimPrevisto)} (${delta > 0 ? '+' : '−'}${diasPorExtenso(Math.abs(delta))})` : `${dataBr(depois.fimPrevisto)} — não muda`}
                                                    {depois.fimBaseline && <span className="text-gray-600"> · linha de base {dataBr(depois.fimBaseline)}</span>}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className={rotulo}>Prazo</dt>
                                                <dd className="text-gray-900">{sitAntes === sitDepois ? `Continua ${sitDepois.charAt(0).toLowerCase()}${sitDepois.slice(1)}` : `${sitAntes} → ${sitDepois}`}</dd>
                                            </div>
                                        </>
                                    );
                                })()}
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
                            <div><dt className={rotulo}>Organização</dt><dd className="text-gray-900">{orcamentoEscolhido?.organizacao || 'A do orçamento base'}{orcamentoEscolhido?.obra ? ` (obra ${orcamentoEscolhido.obra})` : ''}</dd></div>
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
              </div>
            </SheetPanel>

            <SheetFooter>
              <div className="w-full">
                <div className="flex w-full items-center justify-end gap-2">
                    {passo === 1 ? (
                        <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[6px] border border-gray-300 bg-white text-[13px] font-medium text-gray-800 hover:bg-gray-50">Cancelar</button>
                    ) : (
                        <button type="button" onClick={() => setPasso((passo - 1) as Passo)} disabled={salvando} className="h-9 px-3.5 rounded-[6px] border border-gray-300 bg-white text-[13px] font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60">Voltar</button>
                    )}
                    {!comPassos ? (
                        <span title={motivoPasso1 ?? undefined}>
                            <button type="button" onClick={() => void criarSemArquivo()} disabled={!!motivoPasso1 || salvando}
                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">
                                {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                                {salvando ? 'Criando…' : 'Criar planejamento'}
                            </button>
                        </span>
                    ) : passo < 3 ? (
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
