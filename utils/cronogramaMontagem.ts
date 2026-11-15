/**
 * Monta o `settings.schedule` de um planejamento a partir de um cronograma importado (MS Project
 * XML / modelo Excel) — fase 2c de docs/planos/2026-11-14-planejamento-lista-critica.md. Função
 * pura: recebe o arquivo lido, as decisões da prévia e o orçamento base; não grava nada.
 *
 * Decisões do usuário que valem aqui (14/11/2026):
 *  - datas ficam COMO NO ARQUIVO: cada tarefa leva restrição MSO na data de início (o mesmo que a
 *    edição manual de data faz) — o motor só recalcula quando alguém editar;
 *  - ao CRIAR, a linha de base nasce ativa com as datas do arquivo;
 *  - tarefa sem par decidida "sem custo" vira nó `activity` do outline (o caminho nativo do app
 *    para tarefa que não é item do orçamento): peso zero no avanço físico.
 *
 * Convenção de datas — a do motor (utils/schedulingEngine.ts): duração = dias úteis DEPOIS do
 * início até o término (sex→seg = 1) e término = início + duração. O MS Project grava Finish = último
 * dia trabalhado e Duration = dias de trabalho; por isso a duração vem do arquivo e o término do app
 * é recalculado a partir dela (sem ela, conta-se os dias úteis do início ao término, inclusive).
 */
import type { BudgetEntry, ProjectSchedule, ItemScheduleDetails, Baseline, OutlineNode, Predecessor } from '../types';
import { ConstraintType, DependencyType } from '../types';
import { seedOutlineFromBudget, insertNode, getAncestors } from './scheduleOutline';
import { ensureFullScheduleList } from './schedulingEngine';
import type { CronogramaImportado, TarefaImportada } from './cronogramaLeitura';

/** O que fazer com cada tarefa-folha do arquivo (as resumo nunca viram tarefa). */
export type DecisaoDaTarefa =
    | { tipo: 'item'; itemId: string }
    | { tipo: 'sem-custo' }
    | { tipo: 'ignorar' };

export interface EntradaDaMontagem {
    cronograma: CronogramaImportado;
    /** Por `tarefa.chave`. Folha sem decisão = ignorada (a prévia sempre decide todas). */
    decisoes: Map<string, DecisaoDaTarefa>;
    orcamento: BudgetEntry[];
    /** BDI do orçamento base (%), para o valor planejado da linha de base. */
    bdi: number;
    nomeDoArquivo: string;
    /** ISO completo — data/hora da importação (testes passam fixo). */
    agora: string;
    gerarId: () => string;
}

export interface CronogramaMontado {
    schedule: ProjectSchedule;
    contagem: { itens: number; semCusto: number; ignoradas: number; itensDoOrcamentoSemTarefa: number };
    /** O que foi deixado de fora com motivo (vínculo para tarefa ignorada, tarefa sem data…). */
    avisos: string[];
}

const NOME_GRUPO_AVULSO = 'Outras tarefas do cronograma';

// ── calendário seg–sex (o mesmo do motor sem feriados cadastrados) ──
const dia = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const util = (d: Date) => { const w = d.getUTCDay(); return w !== 0 && w !== 6; };
/** Soma n dias úteis (n ≥ 0), como `CalendarEngine.addWorkingDays`. */
export const somarDiasUteis = (inicio: string, n: number): string => {
    const d = dia(inicio);
    let r = n;
    while (r > 0) { d.setUTCDate(d.getUTCDate() + 1); if (util(d)) r--; }
    return iso(d);
};
/** Dias úteis do início ao término, os dois inclusive (mínimo 1). */
export const diasUteisInclusive = (inicio: string, termino: string): number => {
    let n = 0;
    for (const d = dia(inicio); d <= dia(termino); d.setUTCDate(d.getUTCDate() + 1)) if (util(d)) n++;
    return Math.max(n, 1);
};
const mesesEntre = (a: string, b: string) => {
    const da = dia(a), db = dia(b);
    return Math.max(1, (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth()) + 1);
};

/** Valor planejado de uma tarefa — a MESMA cascata de components/FinancialSchedule.tsx
 *  (`plannedValue ?? totalLaborCost ?? total do orçamento com BDI`); tarefa sem custo = 0. */
export const valorPlanejado = (s: ItemScheduleDetails, item: BudgetEntry | undefined, bdi: number): number => {
    const total = item ? item.quantity * (item.sinapiItem?.price ?? 0) * (1 + (item.bdi ?? bdi) / 100) : 0;
    return s.plannedValue ?? s.totalLaborCost ?? total;
};

/** Pai de cada tarefa no arquivo (a última anterior com nível menor) — o arquivo vem na ordem do outline. */
function paisDasTarefas(tarefas: TarefaImportada[]): Map<string, TarefaImportada | null> {
    const pais = new Map<string, TarefaImportada | null>();
    const pilha: TarefaImportada[] = [];
    for (const t of tarefas) {
        while (pilha.length && pilha[pilha.length - 1].nivel >= t.nivel) pilha.pop();
        pais.set(t.chave, pilha[pilha.length - 1] ?? null);
        pilha.push(t);
    }
    return pais;
}

/** Datas da tarefa do arquivo na convenção do app, com MSO segurando a data. null = sem início. */
export function datasDoArquivoNoApp(t: TarefaImportada): Pick<ItemScheduleDetails, 'startDate' | 'endDate' | 'duration' | 'constraintType' | 'constraintDate'> | null {
    if (!t.inicio) return null;
    // Duração do arquivo como está (0 inclusive — o app tem tarefa de duração 0 que não é marco,
    // ex.: "Seguros"); sem ela, os dias úteis do início ao término.
    const duracao = t.marco ? 0 : t.duracaoDias != null ? Math.max(0, Math.round(t.duracaoDias)) : diasUteisInclusive(t.inicio, t.termino || t.inicio);
    return { startDate: t.inicio, endDate: somarDiasUteis(t.inicio, duracao), duration: duracao, constraintType: ConstraintType.MSO, constraintDate: t.inicio };
}

/** Predecessoras do arquivo como vínculos entre ids do app. Vínculo com tarefa-resumo só conta
 *  (o app liga tarefa a tarefa); com tarefa que ficou de fora vira aviso. */
export function predecessorasNoApp(
    t: TarefaImportada, porChave: Map<string, TarefaImportada>, idPorChave: Map<string, string>, avisos: string[],
): { predecessors: Predecessor[]; comResumo: number } {
    const predecessors: Predecessor[] = [];
    let comResumo = 0;
    for (const p of t.predecessoras) {
        const alvo = porChave.get(p.chave);
        const idAlvo = idPorChave.get(p.chave);
        if (idAlvo) predecessors.push({ id: idAlvo, type: p.tipo as DependencyType, lag: Math.round(p.defasagemDias) });
        else if (alvo?.resumo) comResumo++;
        else avisos.push(`"${t.nome}": a predecessora "${alvo?.nome ?? p.chave}" ficou de fora da importação — o vínculo não entrou.`);
    }
    return { predecessors, comResumo };
}

/** Insere cada tarefa sem custo (nó `activity`) perto de onde estava no arquivo: no nó do outline
 *  do mesmo nível do pai dela, achado pela 1ª irmã/descendente do pai que já está no outline;
 *  sem referência, num grupo "Outras tarefas do cronograma". */
export function posicionarAtividades(
    outlineInicial: OutlineNode[], tarefas: TarefaImportada[], atividades: TarefaImportada[],
    idPorChave: Map<string, string>, estaNoOutline: (id: string) => boolean, gerarId: () => string,
): OutlineNode[] {
    let outline = outlineInicial;
    const pais = paisDasTarefas(tarefas);
    let grupoAvulso: string | null = null;
    const novas = new Set(atividades.map(a => idPorChave.get(a.chave)));
    for (const t of atividades) {
        const pai = pais.get(t.chave) ?? null;
        let paiNoOutline: string | null = null;
        if (pai) {
            const i0 = tarefas.indexOf(pai);
            for (let i = i0 + 1; i < tarefas.length && tarefas[i].nivel > pai.nivel; i++) {
                const id = idPorChave.get(tarefas[i].chave);
                if (!id || novas.has(id) || !estaNoOutline(id)) continue;
                const cadeia = getAncestors(outline, id);           // [grupo, etapa, (subetapa), item]
                if (cadeia.length >= 2) paiNoOutline = cadeia[Math.min(pai.nivel - 1, cadeia.length - 2)].id;
                break;
            }
        }
        if (!paiNoOutline) {
            if (!grupoAvulso) {
                grupoAvulso = outline.find(n => n.type === 'group' && n.name === NOME_GRUPO_AVULSO)?.id ?? null;
                if (!grupoAvulso) {
                    grupoAvulso = gerarId();
                    outline = insertNode(outline, null, { id: grupoAvulso, type: 'group', name: NOME_GRUPO_AVULSO, children: [] });
                }
            }
            paiNoOutline = grupoAvulso;
        }
        outline = insertNode(outline, paiNoOutline, { id: idPorChave.get(t.chave)!, type: 'activity', name: t.nome, children: [] });
    }
    return outline;
}

export function montarCronogramaImportado(e: EntradaDaMontagem): CronogramaMontado {
    const { cronograma, decisoes, orcamento, gerarId } = e;
    const avisos: string[] = [];
    const tarefas = cronograma.tarefas;
    const folhas = tarefas.filter(t => !t.resumo);
    const porChave = new Map(tarefas.map(t => [t.chave, t]));
    const itensDoOrcamento = new Map(orcamento.map(b => [b.id, b]));

    // 1) Identidade de cada folha no cronograma do app
    const idPorChave = new Map<string, string>();
    const atividades: TarefaImportada[] = [];
    const itensUsados = new Set<string>();
    let ignoradas = 0;
    for (const t of folhas) {
        const d = decisoes.get(t.chave);
        if (d?.tipo === 'item' && itensDoOrcamento.has(d.itemId) && !itensUsados.has(d.itemId)) {
            idPorChave.set(t.chave, d.itemId);
            itensUsados.add(d.itemId);
        } else if (d?.tipo === 'sem-custo') {
            idPorChave.set(t.chave, gerarId());
            atividades.push(t);
        } else {
            if (d?.tipo === 'item') avisos.push(`"${t.nome}": o item escolhido já está em outra tarefa — a tarefa ficou de fora.`);
            ignoradas++;
        }
    }

    // 2) Datas, avanço, predecessoras e restrição de cada tarefa. Cada item parte do MESMO padrão
    // que o app cria para item de orçamento (ensureFullScheduleList: mão de obra da composição —
    // totalLaborCost, totalManHours, effortCoefficient); sem isso o valor planejado do app
    // (plannedValue ?? totalLaborCost ?? total do orçamento) e o da linha de base divergiam e o
    // planejamento recém-importado já abria com "desvio de custo" (medido em 15/11/2026).
    const padraoDoItem = new Map(ensureFullScheduleList([], orcamento).map(s => [s.id, s]));
    let vinculosComResumo = 0;
    const agendados: ItemScheduleDetails[] = [];
    for (const t of folhas) {
        const id = idPorChave.get(t.chave);
        if (!id) continue;
        const { predecessors, comResumo } = predecessorasNoApp(t, porChave, idPorChave, avisos);
        vinculosComResumo += comResumo;
        const base: ItemScheduleDetails = {
            ...(padraoDoItem.get(id) ?? {}),
            id,
            autoDuration: false,
            manualRealPct: t.percentual,
            predecessors,
            ...(t.marco ? { isMilestone: true } : {}),
            ...(atividades.includes(t) ? { hoursPerDay: 8, efficiencyFactor: 1.0 } : {}),
        };
        const datas = datasDoArquivoNoApp(t);
        if (datas) {
            Object.assign(base, datas);
        } else {
            avisos.push(`"${t.nome}" veio sem data de início — entrou sem datas.`);
        }
        agendados.push(base);
    }
    if (vinculosComResumo) avisos.push(`${vinculosComResumo} vínculo(s) com tarefa-resumo do arquivo não entraram (no app o vínculo é entre tarefas).`);

    // Itens do orçamento sem tarefa no arquivo entram sem datas (como num planejamento novo).
    const itemSchedules = ensureFullScheduleList(agendados, orcamento);
    const itensDoOrcamentoSemTarefa = orcamento.filter(b => !itensUsados.has(b.id)).length;

    // 3) Outline: a EAP do orçamento + cada tarefa sem custo perto de onde estava no arquivo
    const outline = posicionarAtividades(seedOutlineFromBudget(orcamento), tarefas, atividades, idPorChave, id => itensDoOrcamento.has(id), gerarId);

    // 4) Linha de base ativa = datas do arquivo (mesmo formato de "Salvar linha de base")
    const comDatas = itemSchedules.filter(s => s.startDate && s.endDate);
    const baseline: Baseline = {
        id: gerarId(),
        name: 'Cronograma importado',
        description: `Datas do arquivo ${e.nomeDoArquivo}, importado em ${e.agora.slice(8, 10)}/${e.agora.slice(5, 7)}/${e.agora.slice(0, 4)}.`,
        createdAt: e.agora,
        itemDates: Object.fromEntries(comDatas.map(s => [s.id, { startDate: s.startDate!, endDate: s.endDate! }])),
        itemData: Object.fromEntries(itemSchedules.map(s => [s.id, {
            plannedValue: valorPlanejado(s, itensDoOrcamento.get(s.id), e.bdi),
            totalManHours: s.totalManHours ?? 0,
            duration: s.duration ?? 0,
        }])),
    };

    const inicios = comDatas.map(s => s.startDate!).sort();
    const terminos = comDatas.map(s => s.endDate!).sort();
    const inicio = inicios[0] ?? e.agora.slice(0, 10);
    const termino = terminos[terminos.length - 1] ?? inicio;
    const schedule: ProjectSchedule = {
        startDate: inicio,
        endDate: termino,
        duration: mesesEntre(inicio, termino),
        periods: [],
        distributions: [],
        outline,
        itemSchedules,
        baselines: [baseline],
        activeBaselineId: baseline.id,
        useWorkingDays: true,
        resources: { roles: [], workers: [], teams: [] },
    };
    return {
        schedule,
        contagem: { itens: itensUsados.size, semCusto: atividades.length, ignoradas, itensDoOrcamentoSemTarefa },
        avisos,
    };
}
