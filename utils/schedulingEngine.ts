import { DependencyType, ItemScheduleDetails, ConstraintType, Baseline, ReplanMode, ResourceRole, ResourceWorker, ResourceTeam, ResourceAllocation, LevelingResult, LevelingIssue, CompositionComponent } from '../types';

/**
 * ═══════════════════════════════════════════════════════════════════
 * SCHEDULING ENGINE — CPM (Critical Path Method)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Modular architecture:
 *   CalendarEngine  → Working days, holidays
 *   GraphEngine     → Topological sort, successor map
 *   CPMEngine       → Forward/Backward pass (pure, deterministic)
 *   BaselineEngine  → Slippage, SPI
 *
 * Algorithm:
 *   1. Build DAG + topological sort (Kahn's)
 *   2. Forward Pass  → ES, EF (topological order)
 *   3. Project Duration = max(EF)
 *   4. Backward Pass → LS, LF (reverse topological order)
 *   5. Float & Critical Path: TF = LS - ES, critical if TF == 0
 *
 * Complexity: O(V + E) for each pass
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────
// CALENDAR ENGINE
// ─────────────────────────────────────────────────

class CalendarEngine {
    private holidays: Set<string>;
    private workDays: Set<number>; // 0=Dom...6=Sáb

    constructor(holidays: string[] = [], workDays: number[] = [1, 2, 3, 4, 5]) {
        this.holidays = new Set(holidays);
        this.workDays = new Set(workDays.length > 0 ? workDays : [1, 2, 3, 4, 5]);
    }

    isWorkingDay(date: Date): boolean {
        // Use UTC methods — dates in the engine are always ISO strings parsed as UTC midnight.
        // Local-time methods (getDay/getDate) shift by timezone offset and give wrong weekday.
        const day = date.getUTCDay();
        if (!this.workDays.has(day)) return false;
        if (this.holidays.has(date.toISOString().split('T')[0])) return false;
        return true;
    }

    /**
     * Add working days to a date. Handles positive and negative values.
     * Duration of 0 returns the same date.
     * Uses UTC arithmetic to avoid timezone-shift bugs (e.g. UTC-3: getDate() lags 1 day).
     */
    addWorkingDays(date: Date, days: number, useWorkingDays: boolean): Date {
        const result = new Date(date);
        if (days === 0) return result;

        const direction = days > 0 ? 1 : -1;
        let remaining = Math.abs(days);

        while (remaining > 0) {
            result.setUTCDate(result.getUTCDate() + direction);
            if (!useWorkingDays || this.isWorkingDay(result)) {
                remaining--;
            }
        }
        return result;
    }

    /**
     * Calculate the number of working days between two dates.
     * Returns positive if d2 > d1, negative if d2 < d1, 0 if same.
     * Uses UTC arithmetic to avoid timezone-shift bugs.
     */
    diffWorkingDays(d1: Date, d2: Date, useWorkingDays: boolean): number {
        const start = new Date(Math.min(d1.getTime(), d2.getTime()));
        const end = new Date(Math.max(d1.getTime(), d2.getTime()));
        const sign = d2.getTime() >= d1.getTime() ? 1 : -1;

        // Normalise to UTC midnight to avoid partial-day counting
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(0, 0, 0, 0);

        let count = 0;
        const curr = new Date(start);
        while (curr < end) {
            curr.setUTCDate(curr.getUTCDate() + 1);
            if (!useWorkingDays || this.isWorkingDay(curr)) {
                count++;
            }
        }
        return count * sign;
    }
}

// ─────────────────────────────────────────────────
// GRAPH ENGINE
// ─────────────────────────────────────────────────

class GraphEngine {
    /**
     * Kahn's Algorithm for topological sort.
     * Returns ordered list of task IDs.
     * Throws if a cycle is detected.
     */
    static topologicalSort(tasks: ItemScheduleDetails[]): string[] {
        // Build adjacency (predecessors → task)
        // In-degree: number of predecessors each task has
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>(); // predecessor → [successors]
        const taskIds = new Set<string>();

        tasks.forEach(t => {
            taskIds.add(t.id);
            inDegree.set(t.id, 0);
            if (!adjacency.has(t.id)) adjacency.set(t.id, []);
        });

        tasks.forEach(t => {
            if (t.predecessors) {
                for (const pred of t.predecessors) {
                    if (!taskIds.has(pred.id)) continue; // skip invalid refs
                    inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
                    if (!adjacency.has(pred.id)) adjacency.set(pred.id, []);
                    adjacency.get(pred.id)!.push(t.id);
                }
            }
        });

        // Queue: tasks with no predecessors
        const queue: string[] = [];
        inDegree.forEach((deg, id) => {
            if (deg === 0) queue.push(id);
        });

        const result: string[] = [];

        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);

            for (const successor of adjacency.get(current) || []) {
                const newDegree = (inDegree.get(successor) || 1) - 1;
                inDegree.set(successor, newDegree);
                if (newDegree === 0) {
                    queue.push(successor);
                }
            }
        }

        if (result.length !== taskIds.size) {
            throw new Error('Circular dependency detected in schedule (topological sort failed).');
        }

        return result;
    }

    /**
     * Build a map: taskId → [{ successorId, dependency type, lag }]
     */
    static buildSuccessorMap(
        tasks: ItemScheduleDetails[]
    ): Map<string, Array<{ id: string; type: DependencyType; lag: number }>> {
        const successors = new Map<string, Array<{ id: string; type: DependencyType; lag: number }>>();
        tasks.forEach(t => {
            if (!successors.has(t.id)) successors.set(t.id, []);
        });

        tasks.forEach(t => {
            t.predecessors?.forEach(pred => {
                if (!successors.has(pred.id)) successors.set(pred.id, []);
                successors.get(pred.id)!.push({
                    id: t.id,
                    type: pred.type,
                    lag: pred.lag
                });
            });
        });

        return successors;
    }
}

// ─────────────────────────────────────────────────
// CPM ENGINE (Pure, Deterministic)
// ─────────────────────────────────────────────────

class CPMEngine {
    /**
     * FORWARD PASS — Calculate Early Start (ES) and Early Finish (EF)
     *
     * Process tasks in topological order.
     * For each task: ES = max(candidate dates from all predecessors)
     * EF = ES + duration
     *
     * Dependency rules:
     *   FS: ES(B) ≥ EF(A) + lag
     *   SS: ES(B) ≥ ES(A) + lag
     *   FF: EF(B) ≥ EF(A) + lag  → ES(B) = EF(A) + lag - duration(B)
     *   SF: EF(B) ≥ ES(A) + lag  → ES(B) = ES(A) + lag - duration(B)
     */
    static forwardPass(
        topoOrder: string[],
        taskMap: Map<string, ItemScheduleDetails>,
        projectStart: Date,
        calendar: CalendarEngine,
        useWorkingDays: boolean
    ) {
        for (const taskId of topoOrder) {
            const task = taskMap.get(taskId)!;
            let earlyStart = new Date(projectStart);

            // Calculate ES from predecessors
            if (task.predecessors && task.predecessors.length > 0) {
                const candidates: number[] = [];

                for (const pred of task.predecessors) {
                    const predTask = taskMap.get(pred.id);
                    if (!predTask || !predTask.earlyStart || !predTask.earlyFinish) {
                        console.warn(`[CPM] Task ${task.id} ignoring pred ${pred.id}: missing dates`);
                        continue;
                    };

                    const predES = new Date(predTask.earlyStart);
                    const predEF = new Date(predTask.earlyFinish);
                    let candidate: Date;

                    switch (pred.type) {
                        case DependencyType.FS:
                            candidate = calendar.addWorkingDays(predEF, pred.lag, useWorkingDays);
                            break;
                        case DependencyType.SS:
                            candidate = calendar.addWorkingDays(predES, pred.lag, useWorkingDays);
                            break;
                        case DependencyType.FF:
                            candidate = calendar.addWorkingDays(predEF, pred.lag - (task.duration || 0), useWorkingDays);
                            break;
                        case DependencyType.SF:
                            candidate = calendar.addWorkingDays(predES, pred.lag - (task.duration || 0), useWorkingDays);
                            break;
                        default:
                            candidate = calendar.addWorkingDays(predEF, pred.lag, useWorkingDays);
                    }

                    candidates.push(candidate.getTime());
                }

                if (candidates.length > 0) {
                    earlyStart = new Date(Math.max(...candidates));
                    // Enforce project start as minimum — predecessor chains cannot push a task before day 1
                    if (earlyStart < projectStart) earlyStart = new Date(projectStart);
                }
            }

            // Apply Constraints
            if (task.constraintType && task.constraintDate) {
                const cDate = new Date(task.constraintDate);
                switch (task.constraintType) {
                    case ConstraintType.SNET: // Start No Earlier Than
                        if (earlyStart < cDate) earlyStart = cDate;
                        break;
                    case ConstraintType.MSO: // Must Start On — predecessors can still push later
                        if (earlyStart < cDate) earlyStart = cDate;
                        break;
                    case ConstraintType.FNET: // Finish No Earlier Than
                        const minES = calendar.addWorkingDays(cDate, -(task.duration || 0), useWorkingDays);
                        if (earlyStart < minES) earlyStart = minES;
                        break;
                }
            }

            // Store ES and EF
            const fmt = (d: Date) => d.toISOString().split('T')[0];
            task.earlyStart = fmt(earlyStart);
            task.startDate = task.earlyStart;

            const earlyFinish = calendar.addWorkingDays(earlyStart, task.duration || 0, useWorkingDays);
            task.earlyFinish = fmt(earlyFinish);
            task.endDate = task.earlyFinish;
        }
    }

    /**
     * BACKWARD PASS — Calculate Late Start (LS) and Late Finish (LF)
     *
     * Process tasks in REVERSE topological order.
     * For tasks with no successors: LF = projectEnd
     * For tasks with successors: LF = min(candidates from successors, using their LS/LF)
     *
     * Dependency rules (from successor's perspective):
     *   FS: LF(A) ≤ LS(B) - lag
     *   SS: LF(A) ≤ LS(B) - lag + duration(A)
     *   FF: LF(A) ≤ LF(B) - lag
     *   SF: LF(A) ≤ LF(B) - lag + duration(A)
     */
    static backwardPass(
        topoOrder: string[],
        taskMap: Map<string, ItemScheduleDetails>,
        successorMap: Map<string, Array<{ id: string; type: DependencyType; lag: number }>>,
        calendar: CalendarEngine,
        useWorkingDays: boolean
    ) {
        // Project end = max(EF) of all tasks
        let projectEndTime = 0;
        taskMap.forEach(t => {
            if (t.earlyFinish) {
                const ef = new Date(t.earlyFinish).getTime();
                if (ef > projectEndTime) projectEndTime = ef;
            }
        });
        const projectEnd = new Date(projectEndTime);
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        // Process in reverse topological order
        const reverseOrder = [...topoOrder].reverse();

        for (const taskId of reverseOrder) {
            const task = taskMap.get(taskId)!;
            const succs = successorMap.get(taskId) || [];
            let lateFinish: Date;

            if (succs.length === 0) {
                // No successors: LF = project end
                lateFinish = new Date(projectEnd);
            } else {
                // LF = min of all successor-derived limits
                const candidates: number[] = [];

                for (const succ of succs) {
                    const succTask = taskMap.get(succ.id);
                    if (!succTask || !succTask.lateStart || !succTask.lateFinish) continue;

                    const succLS = new Date(succTask.lateStart);
                    const succLF = new Date(succTask.lateFinish);
                    let candidate: Date;

                    switch (succ.type) {
                        case DependencyType.FS:
                            // LF(A) ≤ LS(B) - lag
                            candidate = calendar.addWorkingDays(succLS, -succ.lag, useWorkingDays);
                            break;
                        case DependencyType.SS:
                            // LF(A) ≤ LS(B) - lag + duration(A)
                            candidate = calendar.addWorkingDays(succLS, -succ.lag + (task.duration || 0), useWorkingDays);
                            break;
                        case DependencyType.FF:
                            // LF(A) ≤ LF(B) - lag
                            candidate = calendar.addWorkingDays(succLF, -succ.lag, useWorkingDays);
                            break;
                        case DependencyType.SF:
                            // LF(A) ≤ LF(B) - lag + duration(A)
                            candidate = calendar.addWorkingDays(succLF, -succ.lag + (task.duration || 0), useWorkingDays);
                            break;
                        default:
                            candidate = calendar.addWorkingDays(succLS, -succ.lag, useWorkingDays);
                    }

                    candidates.push(candidate.getTime());
                }

                lateFinish = candidates.length > 0
                    ? new Date(Math.min(...candidates))
                    : new Date(projectEnd);
            }

            // Apply backward constraints
            if (task.constraintType && task.constraintDate) {
                const cDate = new Date(task.constraintDate);
                switch (task.constraintType) {
                    case ConstraintType.FNLT: // Finish No Later Than
                        if (lateFinish.getTime() > cDate.getTime()) lateFinish = cDate;
                        break;
                    case ConstraintType.MFO: // Must Finish On
                        lateFinish = cDate;
                        break;
                }
            }

            task.lateFinish = fmt(lateFinish);
            const lateStart = calendar.addWorkingDays(lateFinish, -(task.duration || 0), useWorkingDays);
            task.lateStart = fmt(lateStart);

            // Calculate Total Float: TF = LS - ES (in working days)
            const es = new Date(task.earlyStart!);
            const ls = new Date(task.lateStart!);
            task.totalFloat = calendar.diffWorkingDays(es, ls, useWorkingDays);
            task.slack = task.totalFloat; // backward compat

            // Critical: TF == 0
            task.isCritical = task.totalFloat <= 0;
        }
    }
}

// ─────────────────────────────────────────────────
// BASELINE ENGINE
// ─────────────────────────────────────────────────

class BaselineEngine {
    static compare(
        tasks: ItemScheduleDetails[],
        baseline: Baseline,
        calendar: CalendarEngine,
        useWorkingDays: boolean
    ) {
        tasks.forEach(t => {
            const baselineDates = baseline.itemDates[t.id];
            if (baselineDates) {
                const currentEnd = new Date(t.endDate!);
                const baselineEnd = new Date(baselineDates.endDate);
                t.slippage = calendar.diffWorkingDays(baselineEnd, currentEnd, useWorkingDays);

                const baselineDur = Math.max(1, calendar.diffWorkingDays(
                    new Date(baselineDates.startDate), new Date(baselineDates.endDate), useWorkingDays
                ));
                const currentDur = Math.max(1, calendar.diffWorkingDays(
                    new Date(t.startDate!), currentEnd, useWorkingDays
                ));
                t.spi = baselineDur / currentDur;
            }
        });
    }
}

// ─────────────────────────────────────────────────
// CREW ENGINE (Auto-duration from team composition)
// ─────────────────────────────────────────────────

/**
 * Configurable keyword lists used to classify composition components into labor /
 * equipment / main worker / helper. All entries are lowercase substrings matched
 * case-insensitively against the component description (or role name).
 *
 * Defaults target Brazilian SINAPI nomenclature. Override per-org via
 * `SchedulingEngine.configureCrewClassification(...)` when cargos fall outside the
 * default lists (e.g. CALCETEIRO, MARMORISTA).
 */
export interface CrewClassificationConfig {
    /** Substrings that mark a component as labor (used as a fallback when SINAPI nature is absent). */
    laborRoles: string[];
    /** Substrings that mark a unit-"H" component as equipment, excluding it from labor. */
    equipmentKeywords: string[];
    /** Substrings that mark a labor role as a helper (servente/ajudante/auxiliar). */
    helperRoles: string[];
    /** Substrings that mark a labor role as a main worker (oficial/pedreiro/...). */
    mainWorkerRoles: string[];
}

export const DEFAULT_CREW_CLASSIFICATION: CrewClassificationConfig = {
    laborRoles: [
        'pedreiro', 'servente', 'oficial', 'ajudante', 'auxiliar',
        'carpinteiro', 'armador', 'pintor', 'eletricista', 'encanador',
        'mestre de obras', 'encarregado', 'operador', 'motorista', 'montador',
        'gesseiro', 'telhadista', 'serralheiro', 'bombeiro', 'mão de obra', 'mao de obra'
    ],
    equipmentKeywords: ['caminhão', 'betoneira', 'escavadeira', 'rolo', 'compactador', 'guindaste', 'locação', 'maquina', 'máquina'],
    helperRoles: ['servente', 'ajudante', 'auxiliar'],
    mainWorkerRoles: ['oficial', 'pedreiro', 'carpinteiro', 'pintor', 'eletricista']
};

class CrewEngine {
    /** Active classification config. Mutated via SchedulingEngine.configureCrewClassification. */
    private static classification: CrewClassificationConfig = { ...DEFAULT_CREW_CLASSIFICATION };

    static configureClassification(partial: Partial<CrewClassificationConfig>): void {
        this.classification = { ...this.classification, ...partial };
    }

    static getClassification(): CrewClassificationConfig {
        return this.classification;
    }

    /**
     * Identifies if a composition component is a labor item based on a hierarchical check.
     */
    static isLaborComp(c: CompositionComponent): boolean {
        const unit = String(c.unit || '').toUpperCase();
        const desc = String(c.description || '').toLowerCase();
        const nature = String(c.nature || c.category || '').toLowerCase();

        // 1. Primary: Explicit SINAPI Nature/Category
        if (nature.includes('mão de obra') || nature.includes('mao de obra')) return true;

        // Explicitly exclude categories that are definitely not labor
        if (nature.includes('equipamento') || nature.includes('material')) return false;

        // 2. Fallback: Check for labor-related keywords in description
        const hasRole = this.classification.laborRoles.some(role => desc.includes(role));

        // 3. Fallback: Unit 'H' usually implies labor if not clearly equipment
        if (unit === 'H' || unit === 'HORA') {
            const isEquip = this.classification.equipmentKeywords.some(equip => desc.includes(equip));

            if (hasRole || !isEquip) return true;
        }

        return hasRole;
    }

    /**
     * Initializes effortCoefficient by summing labor items from a SINAPI composition.
     * Excludes items that are strictly "Encargos Complementares" (standalone costs).
     */
    static deriveEffortFromComposition(composition: CompositionComponent[]): number {
        let totalEffort = 0;
        let mainWorkerHH = 0;

        if (!composition || !Array.isArray(composition)) return 0;

        for (const comp of composition) {
            if (this.isLaborComp(comp)) {
                const desc = String(comp.description || '').toLowerCase();

                const isStrictlyCharges = desc.includes('encargos complementares') &&
                    !this.classification.laborRoles.some(role => desc.includes(role));

                if (!isStrictlyCharges) {
                    const quantity = Number(comp.quantity) || 0;
                    totalEffort += quantity;

                    const isHelper = this.classification.helperRoles.some(role => desc.includes(role));

                    if (!isHelper) {
                        mainWorkerHH += quantity;
                    }
                }
            }
        }

        // For DURATION: If we have main workers (e.g. Armador), they drive the duration.
        if (mainWorkerHH > 0) return mainWorkerHH;
        return totalEffort;
    }

    /**
     * Derives total man-hours and estimated labor cost from a composition.
     */
    static deriveTotalLaborFromComposition(composition: CompositionComponent[]): { effort: number, cost: number } {
        let effort = 0;
        let cost = 0;

        if (!composition || !Array.isArray(composition)) return { effort: 0, cost: 0 };

        for (const comp of composition) {
            if (this.isLaborComp(comp)) {
                const quantity = Number(comp.quantity) || 0;
                const price = Number(comp.price) || 0;
                effort += quantity;
                cost += quantity * price;
            }
        }

        return { effort, cost };
    }

    private static isHelperRole(name: string): boolean {
        const n = name.toLowerCase();
        return this.classification.helperRoles.some(role => n.includes(role));
    }

    private static isMainWorkerRole(name: string): boolean {
        const n = name.toLowerCase();
        return this.classification.mainWorkerRoles.some(role => n.includes(role));
    }

    /** Normalize a composition description into a role name (strip "COM ..." suffix, cap at 50 chars). */
    private static roleNameFromComp(comp: CompositionComponent): string {
        let roleName = String(comp.description || '').split(' COM ')[0].trim().toUpperCase();
        if (roleName.length > 50) roleName = roleName.substring(0, 50);
        return roleName;
    }

    /**
     * Auto-allocate crew (ROLE allocations) from a SINAPI composition.
     *
     * Single source of truth shared by the per-item and bulk "Auto Equipe" flows.
     * - Creates roles for labor comps that don't yet exist (matched by uppercase name).
     * - Reuses existing roles and preserves non-ROLE allocations (WORKER/TEAM) untouched.
     * - Distinguishes helpers (servente/ajudante/auxiliar) from main workers and ensures
     *   at least one helper when the composition requires it.
     *
     * Returns the (possibly extended) role list, the rebuilt allocation list and the
     * resolved helper count. Pure: it does not mutate the inputs.
     */
    static autoAllocateFromComposition(
        composition: CompositionComponent[] | undefined,
        existingRoles: ResourceRole[],
        existingAllocations: ResourceAllocation[] = [],
        opts: { defaultMainWorkers?: number; defaultHelpers?: number; hoursPerDay?: number } = {}
    ): { roles: ResourceRole[]; allocations: ResourceAllocation[]; crewHelpers: number } {
        const roles = [...existingRoles];
        const allocations = [...existingAllocations];

        const defaultMainWorkers = Math.max(1, Number(opts.defaultMainWorkers ?? 1));
        let defaultHelpers = Number(opts.defaultHelpers ?? 0);
        const hoursPerDay = Number(opts.hoursPerDay ?? 8);

        const compLabor = (composition || []).filter(c => this.isLaborComp(c));
        if (compLabor.length === 0) {
            return { roles, allocations, crewHelpers: defaultHelpers };
        }

        const rolesByName = new Map<string, ResourceRole>(roles.map(r => [r.name.toUpperCase(), r]));

        // Keep manual (non-ROLE) allocations; rebuild ROLE allocations from the composition.
        const allocMap = new Map<string, ResourceAllocation>();
        allocations.forEach(a => {
            if (a.resourceType !== 'ROLE') allocMap.set(a.resourceId, a);
        });

        compLabor.forEach(comp => {
            const roleName = this.roleNameFromComp(comp);

            let role = rolesByName.get(roleName);
            if (!role) {
                role = {
                    id: crypto.randomUUID(),
                    name: roleName,
                    costPerHour: Number(comp.price) || 0,
                    costPerDay: (Number(comp.price) || 0) * 8,
                    source: 'SINAPI'
                };
                roles.push(role);
                rolesByName.set(roleName, role);
            }

            if (!allocMap.has(role.id)) {
                const helper = this.isHelperRole(roleName);
                if (helper && defaultHelpers === 0) defaultHelpers = 1;
                const qty = Math.max(1, helper ? defaultHelpers : defaultMainWorkers);

                allocMap.set(role.id, {
                    id: crypto.randomUUID(),
                    resourceId: role.id,
                    resourceType: 'ROLE',
                    quantity: qty,
                    hoursPerDay
                });
            }
        });

        return { roles, allocations: Array.from(allocMap.values()), crewHelpers: defaultHelpers };
    }


    /**
     * Calculate duration from crew composition.
     *
     * Formula:
     *   effectiveCrew = mainWorkers + (helpers × helperFactor)
     *   totalEffort   = quantity × effortCoefficient  (man-hours)
     *   duration      = ⌈ totalEffort / (effectiveCrew × hoursPerDay) ⌉
     *
     * Returns null if crew data is incomplete.
     */
    static calculateDuration(
        task: ItemScheduleDetails,
        itemQuantity?: number,
        roles: ResourceRole[] = [],
        workers: ResourceWorker[] = [],
        teams: ResourceTeam[] = []
    ): number | null {
        if (task.id === '1p8rb7n2p' || task.id.includes('7n2p') || (itemQuantity ?? 0) > 0) {
            console.log(`[CalcDuration] START ${task.id}: Auto=${task.autoDuration}, Qty=${itemQuantity}`);
        }

        if (!task.autoDuration) return null;

        const qty = itemQuantity ?? 0;

        // Try to derive crew counts from actual allocations if they exist
        let mainWorkers = task.crewMainWorkers ?? 0;
        let helpers = task.crewHelpers ?? 0;

        if (task.allocations && task.allocations.length > 0) {
            let derivedMain = 0;
            let derivedHelpers = 0;
            let hasManualAllocation = false;

            task.allocations.forEach(alloc => {
                const processWorker = (workerId: string, multiplier: number) => {
                    const worker = workers.find(w => w.id === workerId);
                    if (worker) {
                        const role = roles.find(r => r.id === worker.roleId);
                        if (role) {
                            if (CrewEngine.isMainWorkerRole(role.name)) {
                                derivedMain += multiplier;
                            } else if (CrewEngine.isHelperRole(role.name)) {
                                derivedHelpers += multiplier;
                            } else {
                                // Unknown labor role: default to main worker.
                                derivedMain += multiplier;
                            }
                        }
                    }
                };

                if (alloc.resourceType === 'WORKER') {
                    processWorker(alloc.resourceId, alloc.quantity);
                    hasManualAllocation = true;
                } else if (alloc.resourceType === 'TEAM') {
                    const team = teams.find(t => t.id === alloc.resourceId);
                    if (team) {
                        team.memberIds.forEach(memberId => processWorker(memberId, alloc.quantity));
                        hasManualAllocation = true;
                    }
                }
            });

            if (hasManualAllocation) {
                mainWorkers = derivedMain;
                helpers = derivedHelpers;
            }
        }

        const hoursPerDay = task.hoursPerDay ?? 8;

        if (qty === 0) return 0; // Milestone if quantity is zero

        const dailyCapacity = (() => {
            // Model A: Productivity-based (Units per day per worker)
            if (task.mainWorkerProd && task.mainWorkerProd > 0) {
                const mainProd = task.mainWorkerProd;
                const helperProd = task.helperProd ?? 0;
                return (mainWorkers * mainProd) + (helpers * helperProd);
            }
            // Model B: Effort Coefficient-based (Legacy SINAPI style)
            else {
                const helperFactor = task.helperFactor ?? 0.5;
                let coefficient = task.effortCoefficient ?? 0;

                // User Logic: Helpers do NOT increase production speed (capacity) when a Main Worker is present.
                // They purely support. So efficient crew size = number of main workers.
                // If NO main workers (e.g. cleaning), then helpers drive the duration.
                const effectiveCrew = mainWorkers > 0 ? mainWorkers : (helpers * helperFactor);

                // Safety fallback: if we have a crew but no coefficient, assume 1.0 HH/unit
                if (coefficient <= 0 && effectiveCrew > 0) {
                    coefficient = 1.0;
                }

                if (effectiveCrew <= 0 || coefficient <= 0 || hoursPerDay <= 0) return 0;
                return (effectiveCrew * hoursPerDay) / coefficient;
            }
        })();

        if (task.id === '1p8rb7n2p' || task.id.includes('7n2p') || qty > 0) {
            console.log(`[CalcDuration] Item ${task.id}: Qty=${qty}, Auto=${task.autoDuration}, Coef=${task.effortCoefficient}, Crew=${mainWorkers}+${helpers}, Cap=${dailyCapacity}`);
        }

        const efficiency = task.efficiencyFactor ?? 1.0;
        if (dailyCapacity <= 0) return null;

        // Apply efficiency and calculate final duration
        const realCapacity = dailyCapacity * efficiency;
        const duration = Math.ceil(qty / realCapacity);

        return qty === 0 ? 0 : Math.max(1, duration);
    }

    /**
     * Apply auto-duration to all tasks that have autoDuration enabled.
     * Mutates tasks in-place.
     */
    static applyAutoDurations(
        taskMap: Map<string, ItemScheduleDetails>,
        itemQuantities?: Map<string, number>,
        roles: ResourceRole[] = [],
        workers: ResourceWorker[] = [],
        teams: ResourceTeam[] = []
    ) {
        for (const [id, task] of taskMap) {
            if (task.autoDuration) {
                const qty = itemQuantities?.get(id) ?? 1;
                const calculated = this.calculateDuration(task, qty, roles, workers, teams);
                if (calculated !== null) {
                    task.duration = calculated;
                    task.isMilestone = calculated === 0;
                    // Update totalManHours from crew data
                    const coefficient = task.effortCoefficient ?? 0;
                    task.totalManHours = qty * coefficient;
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────
// SCHEDULING ENGINE (Public API — unchanged)
// ─────────────────────────────────────────────────

export class SchedulingEngine {
    /**
     * Calculates the schedule dates for all tasks based on dependencies and constraints.
     * Uses CPM: Topological Sort → Forward Pass → Backward Pass → Float
     */
    static calculate(
        tasks: ItemScheduleDetails[],
        projectStartDate: string,
        activeBaseline?: Baseline,
        useWorkingDays: boolean = true,
        replanMode: ReplanMode = ReplanMode.AFFECTED_TASK,
        roles: ResourceRole[] = [],
        itemQuantities?: Map<string, number>,
        workers: ResourceWorker[] = [],
        teams: ResourceTeam[] = [],
        workDays: number[] = [1, 2, 3, 4, 5]
    ): ItemScheduleDetails[] {
        if (!tasks.length) return [];

        const calendar = new CalendarEngine([], workDays);

        // 1. Initialize task map
        const taskMap = new Map<string, ItemScheduleDetails>(
            tasks.map(t => [t.id, {
                ...t,
                isCritical: false,
                slack: 0,
                totalFloat: 0,
                slippage: 0,
                spi: 1,
                totalLaborCost: 0,
                totalManHours: 0,
                isMilestone: t.duration === 0
            }])
        );

        // 2. Topological Sort (also validates no cycles)
        const topoOrder = GraphEngine.topologicalSort(Array.from(taskMap.values()));

        // 2.5 Apply crew-based auto-durations (before forward pass)
        CrewEngine.applyAutoDurations(taskMap, itemQuantities, roles, workers, teams);

        // 3. Determine project start
        let startDate = new Date(projectStartDate);
        if (replanMode === ReplanMode.CURRENT_DATE) {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            if (startDate < now) startDate = now;
        }

        // 4. Forward Pass: ES, EF
        CPMEngine.forwardPass(topoOrder, taskMap, startDate, calendar, useWorkingDays);

        // 5. Build successor map for backward pass
        const successorMap = GraphEngine.buildSuccessorMap(Array.from(taskMap.values()));

        // 6. Backward Pass: LS, LF, Float, Critical
        CPMEngine.backwardPass(topoOrder, taskMap, successorMap, calendar, useWorkingDays);

        // 7. Labor cost calculation
        const taskList = Array.from(taskMap.values());
        this.calculateLaborCosts(taskList, roles, workers, teams);

        // 8. Baseline comparison
        if (activeBaseline) {
            BaselineEngine.compare(taskList, activeBaseline, calendar, useWorkingDays);
        }

        return taskList;
    }

    /**
     * Helper to calculate duration for a single task based on crew/quantity.
     */
    static calculateDuration(task: ItemScheduleDetails, qty: number): number | null {
        return CrewEngine.calculateDuration(task, qty);
    }

    /**
     * Derives total man-hours and estimated labor cost from a composition.
     */
    static deriveTotalLaborFromComposition(composition: CompositionComponent[]): { effort: number, cost: number } {
        return CrewEngine.deriveTotalLaborFromComposition(composition);
    }

    /**
     * Identifies if a composition component is a labor item.
     */
    static isLaborItem(c: CompositionComponent): boolean {
        return CrewEngine.isLaborComp(c);
    }

    /**
     * Derives just the effort coefficient (main worker HH) for duration calculation.
     */
    static deriveEffortCoefficient(composition: CompositionComponent[]): number {
        return CrewEngine.deriveEffortFromComposition(composition);
    }

    /**
     * Calculate labor costs and man-hours for each task from resource allocations.
     */
    private static calculateLaborCosts(tasks: ItemScheduleDetails[], roles: ResourceRole[], workers: ResourceWorker[] = [], teams: ResourceTeam[] = []) {
        for (const task of tasks) {
            if (task.allocations && task.allocations.length > 0) {
                let laborCost = 0;
                let manHours = 0;
                for (const alloc of task.allocations) {
                    const duration = task.duration || 0;
                    const hoursPerDay = alloc.hoursPerDay || task.hoursPerDay || 8;

                    if (alloc.resourceType === 'ROLE' || !alloc.resourceType) {
                        const role = roles.find(r => r.id === alloc.resourceId);
                        if (role) {
                            manHours += alloc.quantity * hoursPerDay * duration;
                            laborCost += alloc.quantity * role.costPerHour * hoursPerDay * duration;
                        }
                    } else if (alloc.resourceType === 'WORKER') {
                        const worker = workers.find(w => w.id === alloc.resourceId);
                        if (worker) {
                            const role = roles.find(r => r.id === worker.roleId);
                            if (role) {
                                manHours += alloc.quantity * hoursPerDay * duration;
                                laborCost += alloc.quantity * role.costPerHour * hoursPerDay * duration;
                            }
                        }
                    } else if (alloc.resourceType === 'TEAM') {
                        const team = teams.find(t => t.id === alloc.resourceId);
                        if (team) {
                            team.memberIds.forEach(memberId => {
                                const worker = workers.find(w => w.id === memberId);
                                if (worker) {
                                    const role = roles.find(r => r.id === worker.roleId);
                                    if (role) {
                                        manHours += alloc.quantity * hoursPerDay * duration; // alloc.quantity acts as a multiplier for the team
                                        laborCost += alloc.quantity * role.costPerHour * hoursPerDay * duration;
                                    }
                                }
                            });
                        }
                    }
                }
                task.totalLaborCost = laborCost;
                task.totalManHours = manHours;
            } else if (task.plannedValue && task.plannedValue > 0) {
                // Fallback: Use task's own values if already set (e.g. from deriveTotalLaborFromComposition)
                // totalLaborCost and totalManHours are already in ItemScheduleDetails
                // We don't need to overwrite them if allocations are empty but they were initialized
            }
        }
    }

    /**
     * Generates a daily resource usage map (Histogram data)
     */
    static calculateResourceHistogram(
        tasks: ItemScheduleDetails[],
        useWorkingDays: boolean,
        workers: ResourceWorker[] = [],
        teams: ResourceTeam[] = []
    ): Record<string, Record<string, { total: number, taskIds: string[] }>> {
        const calendar = new CalendarEngine();
        const histogram: Record<string, Record<string, { total: number, taskIds: string[] }>> = {};

        tasks.forEach(task => {
            if (!task.startDate || !task.endDate || !task.allocations || task.allocations.length === 0) return;

            let curr = new Date(task.startDate);
            const end = new Date(task.endDate);
            let count = 0;

            while (curr <= end && count < 1000) {
                count++;
                if (!useWorkingDays || calendar.isWorkingDay(curr)) {
                    const dateStr = curr.toISOString().split('T')[0];
                    if (!histogram[dateStr]) histogram[dateStr] = {};

                    task.allocations.forEach(alloc => {
                        const processResource = (resId: string, quantity: number) => {
                            if (!histogram[dateStr][resId]) {
                                histogram[dateStr][resId] = { total: 0, taskIds: [] };
                            }
                            histogram[dateStr][resId].total += quantity;
                            if (!histogram[dateStr][resId].taskIds.includes(task.id)) {
                                histogram[dateStr][resId].taskIds.push(task.id);
                            }
                        };

                        if (alloc.resourceType === 'ROLE' || !alloc.resourceType) {
                            processResource(alloc.resourceId, alloc.quantity);
                        } else if (alloc.resourceType === 'WORKER') {
                            processResource(alloc.resourceId, alloc.quantity);
                            // Propagate to Role
                            const worker = workers.find(w => w.id === alloc.resourceId);
                            if (worker) {
                                processResource(worker.roleId, alloc.quantity);
                            }
                        } else if (alloc.resourceType === 'TEAM') {
                            processResource(alloc.resourceId, alloc.quantity);
                            const team = teams.find(t => t.id === alloc.resourceId);
                            if (team) {
                                team.memberIds.forEach(memberId => {
                                    processResource(memberId, alloc.quantity);
                                    // Propagate to Role
                                    const worker = workers.find(w => w.id === memberId);
                                    if (worker) {
                                        processResource(worker.roleId, alloc.quantity);
                                    }
                                });
                            }
                        }
                    });
                }
                curr.setUTCDate(curr.getUTCDate() + 1);
            }
        });

        return histogram;
    }

    /**
     * Attempts to resolve over-allocations by shifting tasks.
     * Heuristic: Iteratively identify over-allocations and push tasks with Float or later starts.
     */
    static levelResources(
        tasks: ItemScheduleDetails[],
        projectStartDate: string,
        useWorkingDays: boolean,
        roles: ResourceRole[],
        workers: ResourceWorker[],
        teams: ResourceTeam[] = [],
        itemQuantities?: Map<string, number>
    ): LevelingResult {
        const limits = new Map<string, number>();
        roles.forEach(r => {
            const count = workers.filter(w => w.roleId === r.id).length;
            limits.set(r.id, count || 1);
        });

        // Specific worker and team limits are always 1
        workers.forEach(w => limits.set(w.id, 1));
        teams.forEach(t => limits.set(t.id, 1));

        let leveledTasks = JSON.parse(JSON.stringify(tasks)) as ItemScheduleDetails[];
        let changed = true;
        let iterations = 0;
        const maxIter = 500;
        const unresolvableItems = new Set<string>();
        const issues: LevelingIssue[] = [];

        while (changed && iterations < maxIter) {
            changed = false;
            iterations++;

            // 1. Recalculate schedule
            leveledTasks = this.calculate(leveledTasks, projectStartDate, undefined, useWorkingDays, ReplanMode.AFFECTED_TASK, roles, itemQuantities, workers, teams);

            // 2. Check for over-allocations
            const histogram = this.calculateResourceHistogram(leveledTasks, useWorkingDays, workers, teams);
            const dates = Object.keys(histogram).sort();

            for (const dateStr of dates) {
                const dayUsage = histogram[dateStr];
                for (const resourceId of Object.keys(dayUsage)) {
                    const limit = limits.get(resourceId) || 0;
                    const totalUsage = dayUsage[resourceId].total;

                    if (totalUsage > limit) {
                        const overlappingTaskIds = dayUsage[resourceId].taskIds;

                        // Detect "Inherent" bottlenecks: a single task exceeds capacity
                        const tasksExceedingLimit = leveledTasks.filter(t => {
                            if (!overlappingTaskIds.includes(t.id)) return false;
                            const tAlloc = t.allocations?.find(a => a.resourceId === resourceId);
                            return tAlloc && tAlloc.quantity > limit;
                        });

                        if (tasksExceedingLimit.length > 0) {
                            tasksExceedingLimit.forEach(t => {
                                if (!unresolvableItems.has(t.id + resourceId)) {
                                    unresolvableItems.add(t.id + resourceId);
                                    issues.push({
                                        itemId: t.id,
                                        itemName: tasks.find(orig => orig.id === t.id)?.id || t.id, // Fallback if name is missing in details
                                        resourceId,
                                        resourceName: roles.find(r => r.id === resourceId)?.name || resourceId,
                                        required: t.allocations?.find(a => a.resourceId === resourceId)?.quantity || 0,
                                        capacity: limit,
                                        type: 'SINGLE_TASK_OVER_CAPACITY'
                                    });
                                }
                            });
                            // We don't shift tasks that are over capacity on their own (it won't help)
                            // We look for OTHER tasks to shift, or just ignore these for now
                            const otherTasks = leveledTasks.filter(t => overlappingTaskIds.includes(t.id) && !tasksExceedingLimit.some(tel => tel.id === t.id));
                            if (otherTasks.length === 0) continue; // Only unresolvable tasks here

                            otherTasks.sort((a, b) => (b.totalFloat || 0) - (a.totalFloat || 0));
                            const taskToPush = otherTasks[0];
                            const calendar = new CalendarEngine();
                            const newStart = calendar.addWorkingDays(new Date(taskToPush.startDate!), 1, useWorkingDays);
                            taskToPush.constraintType = ConstraintType.SNET;
                            taskToPush.constraintDate = newStart.toISOString().split('T')[0];
                            changed = true;
                            break;
                        } else {
                            // Normal bottleneck: sum > limit, but individual tasks <= limit
                            const overlappingTasks = leveledTasks.filter(t => overlappingTaskIds.includes(t.id));
                            overlappingTasks.sort((a, b) => {
                                if ((a.totalFloat || 0) !== (b.totalFloat || 0)) return (b.totalFloat || 0) - (a.totalFloat || 0);
                                return new Date(b.startDate!).getTime() - new Date(a.startDate!).getTime();
                            });

                            const taskToPush = overlappingTasks[0];
                            const calendar = new CalendarEngine();
                            const newStart = calendar.addWorkingDays(new Date(taskToPush.startDate!), 1, useWorkingDays);
                            taskToPush.constraintType = ConstraintType.SNET;
                            taskToPush.constraintDate = newStart.toISOString().split('T')[0];
                            changed = true;
                            break;
                        }
                    }
                }
                if (changed) break;
            }
        }

        console.log(`[LevelResources] Completed in ${iterations} iterations.`);
        return { leveledSchedules: leveledTasks, issues, iterations };
    }

    /**
     * Expose crew calculation helpers
     */
    static isLaborComp(c: CompositionComponent): boolean {
        return CrewEngine.isLaborComp(c);
    }
    static deriveEffortFromComposition(composition: CompositionComponent[]): number {
        return CrewEngine.deriveEffortFromComposition(composition);
    }
    static calculateDurationFromCrew(task: ItemScheduleDetails, qty?: number): number | null {
        return CrewEngine.calculateDuration(task, qty);
    }
    static autoAllocateFromComposition(
        composition: CompositionComponent[] | undefined,
        existingRoles: ResourceRole[],
        existingAllocations: ResourceAllocation[] = [],
        opts: { defaultMainWorkers?: number; defaultHelpers?: number; hoursPerDay?: number } = {}
    ) {
        return CrewEngine.autoAllocateFromComposition(composition, existingRoles, existingAllocations, opts);
    }

    /** Override the crew classification keyword lists (e.g. per org). Partial merge over defaults. */
    static configureCrewClassification(partial: Partial<CrewClassificationConfig>): void {
        CrewEngine.configureClassification(partial);
    }
    static getCrewClassification(): CrewClassificationConfig {
        return CrewEngine.getClassification();
    }

    // ── Legacy compatibility methods (used externally) ──

    static addDays(date: Date, days: number, useWorkingDays: boolean): Date {
        const calendar = new CalendarEngine();
        return calendar.addWorkingDays(date, days, useWorkingDays);
    }

    static diffDays(d1: Date, d2: Date, useWorkingDays: boolean): number {
        const calendar = new CalendarEngine();
        return calendar.diffWorkingDays(d1, d2, useWorkingDays);
    }

    static isWorkingDay(date: Date): boolean {
        const calendar = new CalendarEngine();
        return calendar.isWorkingDay(date);
    }

    static hasCircularDependency(tasks: ItemScheduleDetails[]): boolean {
        try {
            GraphEngine.topologicalSort(tasks);
            return false;
        } catch {
            return true;
        }
    }
}
