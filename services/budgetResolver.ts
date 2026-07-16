import { supabase } from '../lib/supabase';
import { BudgetEntry, ProjectSettings } from '../types';
import { cloneBudgetForPersistence } from '../utils/budgetPersistence';

/**
 * Resolução do orçamento efetivo de um projeto.
 *
 * O campo `projects.budget` só contém itens no projeto que É o orçamento
 * (classification 'ORCAMENTO'). Num PLANEJAMENTO o orçamento vive no snapshot
 * congelado (`settings.basedOnBudgetSnapshot`) ou na versão fixada do orçamento
 * vinculado; numa OBRA ele costuma viver no projeto filho que aponta para ela.
 * `linkedProjectId` aponta sempre do filho para o pai: PLANEJAMENTO → ORCAMENTO → OBRA.
 *
 * Quem precisar dos itens de orçamento de um projeto deve passar por aqui em vez
 * de ler `project.budget` cru.
 */

export type BudgetSource =
    | 'own'                     // itens no próprio projeto (caso ORCAMENTO)
    | 'snapshot'                // settings.basedOnBudgetSnapshot (planejamento congelado)
    | 'pinned-version'          // versão do vinculado à qual este projeto está fixado
    | 'active-version'          // versão ativa do vinculado (fixada agora)
    | 'linked-live'             // budget ao vivo do vinculado (vinculado sem versões)
    | 'child-project'           // projeto filho que aponta para este (caso OBRA)
    | 'none';

export interface ResolvedBudget {
    budget: BudgetEntry[];
    source: BudgetSource;
    /** Versão do orçamento vinculado reconhecida/fixada nesta resolução. */
    versionId?: string;
    versionItem?: number;
    /**
     * Preenchido apenas quando a resolução congelou uma versão agora. O chamador
     * que persiste settings deve gravá-lo em `basedOnBudgetSnapshot` junto de
     * `versionId`/`versionItem`; leitores efêmeros podem ignorar.
     */
    snapshotToPersist?: BudgetEntry[];
}

/** Forma mínima de projeto que a resolução consome. */
export interface ResolvableProject {
    id: string;
    budget?: BudgetEntry[] | null;
    settings?: Partial<ProjectSettings> | null;
}

const rows = (b: BudgetEntry[] | null | undefined): BudgetEntry[] => (Array.isArray(b) ? b : []);
const has = (b: BudgetEntry[] | null | undefined): boolean => rows(b).length > 0;

const empty: ResolvedBudget = { budget: [], source: 'none' };

async function fetchProject(id: string): Promise<ResolvableProject | null> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, budget, settings')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    return (data as ResolvableProject) ?? null;
}

async function fetchProjectByName(name: string): Promise<ResolvableProject | null> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, budget, settings')
        .eq('name', name)
        .or('settings->>classification.eq.ORCAMENTO,settings->>classification.eq.OBRA')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return (data as ResolvableProject) ?? null;
}

/**
 * Projeto filho (ORCAMENTO ou PLANEJAMENTO) que aponta para `parentId`.
 * É a direção reversa do vínculo — usada quando o pai (a OBRA) não tem orçamento próprio.
 */
export async function findChildProject(
    parentId: string,
    classification: 'ORCAMENTO' | 'PLANEJAMENTO',
): Promise<ResolvableProject | null> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, budget, settings')
        .filter('settings->>linkedProjectId', 'eq', parentId)
        .filter('settings->>classification', 'eq', classification)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return (data as ResolvableProject) ?? null;
}

/** Resolve o orçamento a partir do projeto vinculado (pai), honrando o pin de versão. */
function resolveFromLinked(
    settings: Partial<ProjectSettings>,
    linked: ResolvableProject | null,
): ResolvedBudget {
    if (!linked) return empty;

    const versions = linked.settings?.versions ?? [];
    const pinId = settings.basedOnBudgetVersionId;
    const pinned = pinId ? versions.find(v => v.id === pinId) : undefined;

    if (pinned && has(pinned.budget)) {
        // Fixado numa versão mas ainda sem snapshot: congela agora.
        return {
            budget: pinned.budget!,
            source: 'pinned-version',
            versionId: pinned.id,
            versionItem: pinned.item,
            snapshotToPersist: cloneBudgetForPersistence(pinned.budget),
        };
    }

    if (versions.length > 0) {
        const active = versions.find(v => v.id === linked.settings?.activeVersionId)
            ?? versions[versions.length - 1];
        if (active && has(active.budget)) {
            return {
                budget: active.budget!,
                source: 'active-version',
                versionId: active.id,
                versionItem: active.item,
                snapshotToPersist: cloneBudgetForPersistence(active.budget),
            };
        }
    }

    // Vinculado sem versões: usa o budget ao vivo.
    if (has(linked.budget)) {
        return { budget: linked.budget!, source: 'linked-live' };
    }

    return empty;
}

export interface ResolveOptions {
    /**
     * Lookup de projeto por nome, para o fallback legado `linkedProjectName`.
     * Sem isto, cai numa consulta ao banco.
     */
    findByName?: (name: string) => ResolvableProject | null | undefined;
    /**
     * Procura o orçamento em projeto filho quando o próprio não tem itens (caso OBRA).
     * Opt-in: só para quem quer *achar os itens* de um projeto (cotação, aquisições).
     * Quem edita o orçamento do projeto deve deixar desligado, para não exibir como
     * seus os itens de outro projeto. Custa uma consulta extra.
     */
    searchChildren?: boolean;
}

/**
 * Resolve o orçamento efetivo de um projeto já carregado.
 * Não escreve nada — ver `snapshotToPersist` no retorno.
 */
export async function resolveProjectBudget(
    project: ResolvableProject,
    options: ResolveOptions = {},
): Promise<ResolvedBudget> {
    const settings = (project.settings ?? {}) as Partial<ProjectSettings>;
    const { findByName, searchChildren = false } = options;

    // 1. Num PLANEJAMENTO o snapshot congelado é a verdade — vence o budget próprio,
    //    que pode conter resíduo de edição e não bate com os IDs do cronograma.
    const isPlanning = settings.classification === 'PLANEJAMENTO';
    if (isPlanning && has(settings.basedOnBudgetSnapshot)) {
        return {
            budget: settings.basedOnBudgetSnapshot!,
            source: 'snapshot',
            versionId: settings.basedOnBudgetVersionId,
            versionItem: settings.basedOnBudgetVersionItem,
        };
    }

    // 2. Orçamento próprio (caso ORCAMENTO).
    if (has(project.budget)) {
        return { budget: project.budget!, source: 'own' };
    }

    // 3. Snapshot fora do caso planejamento.
    if (has(settings.basedOnBudgetSnapshot)) {
        return {
            budget: settings.basedOnBudgetSnapshot!,
            source: 'snapshot',
            versionId: settings.basedOnBudgetVersionId,
            versionItem: settings.basedOnBudgetVersionItem,
        };
    }

    // 4. Sobe o vínculo (filho → pai) e resolve a versão fixada. Só o PLANEJAMENTO
    //    se fixa a uma versão do orçamento; um ORCAMENTO vazio vinculado a uma OBRA
    //    continua vazio, e não herda os itens dela.
    const linkedId = settings.linkedProjectId;
    const linkedName = settings.linkedProjectName;
    if (isPlanning && (linkedId || linkedName)) {
        try {
            let linked: ResolvableProject | null = null;
            if (linkedId) {
                linked = await fetchProject(linkedId);
            } else if (linkedName) {
                linked = findByName?.(linkedName) ?? (await fetchProjectByName(linkedName));
            }
            const fromLinked = resolveFromLinked(settings, linked);
            if (has(fromLinked.budget)) return fromLinked;
        } catch (err) {
            console.error('[budgetResolver] falha ao resolver orçamento vinculado:', err);
        }
    }

    // 5. Desce o vínculo: numa OBRA o orçamento vive no projeto filho.
    if (searchChildren) {
        try {
            for (const classification of ['ORCAMENTO', 'PLANEJAMENTO'] as const) {
                const child = await findChildProject(project.id, classification);
                if (!child) continue;
                const childResolved = await resolveProjectBudget(child, {
                    ...options,
                    searchChildren: false, // um nível só: evita ciclo pai↔filho
                });
                if (has(childResolved.budget)) {
                    return { ...childResolved, source: 'child-project' };
                }
            }
        } catch (err) {
            console.error('[budgetResolver] falha ao procurar orçamento em projeto filho:', err);
        }
    }

    return empty;
}

/** Conveniência: carrega o projeto e resolve o orçamento numa tacada. */
export async function resolveProjectBudgetById(
    projectId: string,
    options: ResolveOptions = {},
): Promise<ResolvedBudget> {
    const project = await fetchProject(projectId);
    if (!project) return empty;
    return resolveProjectBudget(project, options);
}
