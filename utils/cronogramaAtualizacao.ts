/**
 * ATUALIZAR um planejamento existente a partir de um cronograma importado (MS Project XML / modelo
 * Excel) — fase 2d de docs/planos/2026-11-14-planejamento-lista-critica.md. Funções puras.
 *
 * Decisões do usuário (14/11/2026):
 *  - troca datas e predecessoras das tarefas casadas (datas como no arquivo, MSO segurando);
 *  - avanço: "Avanço também, item a item na prévia" — só nas tarefas MARCADAS (padrão desmarcado,
 *    para não apagar o que veio do Diário);
 *  - a linha de base NÃO muda (o desvio aparece na Central);
 *  - tarefa sem par: o usuário decide (sem custo = nova tarefa avulsa; ignorar).
 * O que o arquivo não traz fica exatamente como está.
 */
import type { BudgetEntry, ProjectSchedule, ItemScheduleDetails, OutlineNode } from '../types';
import type { CronogramaImportado, TarefaImportada } from './cronogramaLeitura';
import type { TarefaAvulsaExistente } from './cronogramaCasamento';
import { datasDoArquivoNoApp, predecessorasNoApp, posicionarAtividades, type DecisaoDaTarefa } from './cronogramaMontagem';
import { ensureFullScheduleList } from './schedulingEngine';
import { seedOutlineFromBudget, findNode } from './scheduleOutline';

/** Tarefas sem custo (nós `activity`) que já existem no outline do planejamento. */
export function avulsasDoOutline(outline: OutlineNode[] | undefined): TarefaAvulsaExistente[] {
    const saida: TarefaAvulsaExistente[] = [];
    const visitar = (ns: OutlineNode[]) => ns.forEach(n => {
        if (n.type === 'activity') saida.push({ id: n.id, nome: n.name });
        if (n.children?.length) visitar(n.children);
    });
    visitar(outline ?? []);
    return saida;
}

export interface DiferencaDaTarefa {
    chave: string;
    /** Id da tarefa no app (item do orçamento ou tarefa sem custo existente). */
    id: string;
    noApp: { inicio: string; termino: string; percentual: number };
    doArquivo: { inicio: string; termino: string; percentual: number };
    mudaDatas: boolean;
    mudaPercentual: boolean;
}

/** O que cada tarefa casada mudaria (só as que existem no planejamento). */
export function diferencasDaAtualizacao(
    cronograma: CronogramaImportado, decisoes: Map<string, DecisaoDaTarefa>, schedule: ProjectSchedule | undefined,
): Map<string, DiferencaDaTarefa> {
    const porId = new Map((schedule?.itemSchedules ?? []).map(s => [s.id, s]));
    const saida = new Map<string, DiferencaDaTarefa>();
    for (const t of cronograma.tarefas) {
        if (t.resumo) continue;
        const d = decisoes.get(t.chave);
        if (d?.tipo !== 'item') continue;
        const atual = porId.get(d.itemId);
        const datas = datasDoArquivoNoApp(t);
        const noApp = { inicio: atual?.startDate?.slice(0, 10) ?? '', termino: atual?.endDate?.slice(0, 10) ?? '', percentual: atual?.manualRealPct ?? 0 };
        const doArquivo = { inicio: datas?.startDate ?? '', termino: datas?.endDate ?? '', percentual: t.percentual };
        saida.set(t.chave, {
            chave: t.chave, id: d.itemId, noApp, doArquivo,
            mudaDatas: !!datas && (noApp.inicio !== doArquivo.inicio || noApp.termino !== doArquivo.termino),
            mudaPercentual: noApp.percentual !== doArquivo.percentual,
        });
    }
    return saida;
}

export interface EntradaDaAtualizacao {
    schedule: ProjectSchedule;
    orcamento: BudgetEntry[];
    cronograma: CronogramaImportado;
    decisoes: Map<string, DecisaoDaTarefa>;
    /** `tarefa.chave` cujo avanço o usuário marcou para trocar. */
    trocarAvanco: Set<string>;
    gerarId: () => string;
}

export interface ResultadoDaAtualizacao {
    schedule: ProjectSchedule;
    contagem: { datasTrocadas: number; avancosTrocados: number; novasSemCusto: number; ignoradas: number; semMudanca: number };
    avisos: string[];
}

export function aplicarAtualizacao(e: EntradaDaAtualizacao): ResultadoDaAtualizacao {
    const { schedule, orcamento, cronograma, decisoes, trocarAvanco, gerarId } = e;
    const avisos: string[] = [];
    const tarefas = cronograma.tarefas;
    const porChave = new Map(tarefas.map(t => [t.chave, t]));
    const atuais = new Map((schedule.itemSchedules ?? []).map(s => [s.id, s]));
    const padraoDoItem = new Map(ensureFullScheduleList([], orcamento).map(s => [s.id, s]));
    const idsValidos = new Set([...orcamento.map(b => b.id), ...avulsasDoOutline(schedule.outline).map(a => a.id)]);
    const diferencas = diferencasDaAtualizacao(cronograma, decisoes, schedule);

    // 1) Identidade de cada folha
    const idPorChave = new Map<string, string>();
    const novas: TarefaImportada[] = [];
    const usados = new Set<string>();
    let ignoradas = 0;
    for (const t of tarefas.filter(x => !x.resumo)) {
        const d = decisoes.get(t.chave);
        if (d?.tipo === 'item' && idsValidos.has(d.itemId) && !usados.has(d.itemId)) {
            idPorChave.set(t.chave, d.itemId);
            usados.add(d.itemId);
        } else if (d?.tipo === 'sem-custo') {
            idPorChave.set(t.chave, gerarId());
            novas.push(t);
        } else {
            if (d?.tipo === 'item') avisos.push(`"${t.nome}": a tarefa escolhida já está em outra linha do arquivo — esta ficou de fora.`);
            ignoradas++;
        }
    }

    // 2) Troca: datas + predecessoras sempre; avanço só se marcado
    let datasTrocadas = 0, avancosTrocados = 0, semMudanca = 0, vinculosComResumo = 0;
    const trocados = new Map<string, ItemScheduleDetails>();
    for (const t of tarefas.filter(x => !x.resumo)) {
        const id = idPorChave.get(t.chave);
        if (!id) continue;
        const { predecessors, comResumo } = predecessorasNoApp(t, porChave, idPorChave, avisos);
        vinculosComResumo += comResumo;
        const datas = datasDoArquivoNoApp(t);
        if (!datas) avisos.push(`"${t.nome}" veio sem data de início — as datas dela não mudaram.`);
        const ehNova = novas.includes(t);
        const anteriorCompleto = atuais.get(id) ?? padraoDoItem.get(id) ?? { id };
        // Com datas novas, as do cálculo anterior do motor (early/late) ficam erradas — e a lista e a
        // Central leem `earlyFinish` antes do `endDate`: sem limpar, o término velho seguia na lista
        // até alguém reabrir o planejamento (2ª crítica, 15/11/2026). O motor refaz ao abrir.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { earlyStart: _es, earlyFinish: _ef, lateStart: _ls, lateFinish: _lf, ...semCalculo } = anteriorCompleto as typeof anteriorCompleto & { earlyStart?: string; earlyFinish?: string; lateStart?: string; lateFinish?: string };
        const anterior = datas ? semCalculo : anteriorCompleto;
        const trocarPct = ehNova || trocarAvanco.has(t.chave);
        trocados.set(id, {
            ...anterior,
            ...(ehNova ? { hoursPerDay: 8, efficiencyFactor: 1.0 } : {}),
            ...(datas ?? {}),
            id,
            autoDuration: false,
            predecessors,
            ...(t.marco ? { isMilestone: true } : {}),
            manualRealPct: trocarPct ? t.percentual : anterior.manualRealPct,
        });
        const dif = diferencas.get(t.chave);
        if (!ehNova) {
            if (dif?.mudaDatas) datasTrocadas++;
            if (trocarPct && dif?.mudaPercentual) avancosTrocados++;
            if (!dif?.mudaDatas && !(trocarPct && dif?.mudaPercentual)) semMudanca++;
        }
    }
    if (vinculosComResumo) avisos.push(`${vinculosComResumo} vínculo(s) com tarefa-resumo do arquivo não entraram (no app o vínculo é entre tarefas).`);

    const lista = (schedule.itemSchedules ?? []).map(s => trocados.get(s.id) ?? s);
    for (const [id, s] of trocados) if (!atuais.has(id)) lista.push(s);
    const itemSchedules = ensureFullScheduleList(lista, orcamento);

    // 3) Outline só muda se entrou tarefa sem custo nova
    let outline = schedule.outline;
    if (novas.length) {
        const base = schedule.outline?.length ? schedule.outline : seedOutlineFromBudget(orcamento);
        outline = posicionarAtividades(base, tarefas, novas, idPorChave, id => !!findNode(base, id), gerarId);
    }

    // 4) Início do cronograma recua se o arquivo começa antes (o motor não deixa nada antes dele)
    const inicios = itemSchedules.map(s => s.startDate?.slice(0, 10)).filter(Boolean).sort() as string[];
    const terminos = itemSchedules.map(s => s.endDate?.slice(0, 10)).filter(Boolean).sort() as string[];
    const startDate = [schedule.startDate?.slice(0, 10), inicios[0]].filter(Boolean).sort()[0] ?? schedule.startDate;
    const endDate = terminos[terminos.length - 1] ?? schedule.endDate;

    return {
        schedule: { ...schedule, startDate, endDate, outline, itemSchedules },
        contagem: { datasTrocadas, avancosTrocados, novasSemCusto: novas.length, ignoradas, semMudanca },
        avisos,
    };
}
