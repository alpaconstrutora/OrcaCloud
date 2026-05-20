import { BudgetEntry, DiaryEntry, ProjectSchedule, PurchaseOrder, ProjectSettings, WBSGroup, WBSPhase, SchedulePeriod, ItemDistribution, ItemScheduleDetails } from '../types';

interface PhaseEvent {
    id: string;
    name: string;
    groupName: string;
    date: Date;
}

interface PhaseScheduleEntry {
    id: string;
    name: string;
    groupName: string;
    startDate: Date;
    endDate: Date;
    subPhases: string[];
}

/**
 * Calculates the overall physical progress of a project based on budget items and diary entries.
 * Returns progress as a percentage (0-100).
 */
export const calculateProjectProgress = (budget: BudgetEntry[], diaryEntries: DiaryEntry[] = []): number => {
    if (!budget || budget.length === 0) return 0;

    const itemQty: Record<string, number> = {};

    // 1. Accumulate quantities from non-refused diary entries
    diaryEntries.forEach(entry => {
        if (entry.status !== 'Recusado') {
            entry.activities?.forEach(activity => {
                if (!itemQty[activity.itemId]) {
                    itemQty[activity.itemId] = 0;
                }
                itemQty[activity.itemId] += activity.realizedQty || 0;
            });
        }
    });

    // 2. Calculate financial value for each item's progress vs planned
    let totalPlannedValue = 0;
    let totalRealizedValue = 0;

    budget.forEach(item => {
        const itemPrice = item.sinapiItem?.price || 0;
        const itemPlannedValue = item.quantity * itemPrice;

        const qtyRealized = itemQty[item.id] || 0;
        const realizedFactor = item.quantity > 0 ? Math.min(qtyRealized / item.quantity, 1) : 0;
        const itemRealizedValue = itemPlannedValue * realizedFactor;

        totalPlannedValue += itemPlannedValue;
        totalRealizedValue += itemRealizedValue;
    });

    if (totalPlannedValue === 0) return 0;

    const overallProgress = (totalRealizedValue / totalPlannedValue) * 100;
    return Math.round(overallProgress * 10) / 10; // 1 decimal place
};

/**
 * Calculates the earliest start date for construction phases based on item schedules or distributions.
 */
export const calculateUpcomingPhases = (settings: ProjectSettings, budget: BudgetEntry[]): PhaseEvent[] => {
    if (!settings.wbs || !settings.schedule) return [];

    const schedule: ProjectSchedule = settings.schedule;
    const itemSchedules: ItemScheduleDetails[] = schedule.itemSchedules || [];
    const distributions: ItemDistribution[] = schedule.distributions || [];
    const periods: SchedulePeriod[] = schedule.periods || [];

    // Map periods for quick date lookup
    const periodDates: Record<string, string> = {};
    periods.forEach((p: SchedulePeriod) => {
        periodDates[p.id] = p.date;
    });

    const phaseEvents: PhaseEvent[] = [];

    settings.wbs.forEach((group: WBSGroup) => {
        group.phases.forEach((phase: WBSPhase) => {
            const phaseItems = budget.filter(item => item.group === group.name && item.phase === phase.name);
            let phaseStartDate: Date | null = null;

            phaseItems.forEach(item => {
                let itemStartDate: Date | null = null;

                // 1. Check specific item schedule
                const specificSched = itemSchedules.find((s: ItemScheduleDetails) => s.id === item.id);
                if (specificSched?.startDate) {
                    itemStartDate = new Date(specificSched.startDate);
                } else {
                    // 2. Fallback to earliest distribution
                    const itemDistributions = distributions.filter((d: ItemDistribution) => d.itemId === item.id && d.percentage > 0);
                    if (itemDistributions.length > 0) {
                        // Find distribution in earliest period
                        let earliestPeriodDate: string | null = null;
                        itemDistributions.forEach((d: ItemDistribution) => {
                            const pDate = periodDates[d.periodId];
                            if (pDate && (!earliestPeriodDate || new Date(pDate) < new Date(earliestPeriodDate))) {
                                earliestPeriodDate = pDate;
                            }
                        });

                        if (earliestPeriodDate) {
                            itemStartDate = new Date(earliestPeriodDate);
                        }
                    }
                }

                if (itemStartDate) {
                    if (!phaseStartDate || itemStartDate < phaseStartDate) {
                        phaseStartDate = itemStartDate;
                    }
                }
            });

            if (phaseStartDate) {
                phaseEvents.push({
                    id: phase.id,
                    name: phase.name.replace(/^[\d\.]+\s+/, ''),
                    groupName: group.name,
                    date: phaseStartDate
                });
            }
        });
    });

    // Sort by date and take the next ones (upcoming or ongoing)
    // For "Upcoming", we might want to filter past ones, but usually showing the sequence is better
    return phaseEvents
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 4);
};

/**
 * Calculates start and end dates for all construction phases based on item schedules or distributions.
 */
export const getPhaseSchedule = (settings: ProjectSettings, budget: BudgetEntry[]): PhaseScheduleEntry[] => {
    if (!settings.wbs || !settings.schedule) return [];

    const schedule: ProjectSchedule = settings.schedule;
    const itemSchedules: ItemScheduleDetails[] = schedule.itemSchedules || [];
    const distributions: ItemDistribution[] = schedule.distributions || [];
    const periods: SchedulePeriod[] = schedule.periods || [];

    // Map periods for quick date lookup
    const periodDates: Record<string, string> = {};
    periods.forEach((p: SchedulePeriod) => {
        periodDates[p.id] = p.date;
    });

    const phaseSchedules: PhaseScheduleEntry[] = [];

    settings.wbs.forEach((group: WBSGroup) => {
        group.phases.forEach((phase: WBSPhase) => {
            const phaseItems = budget.filter(item => item.group === group.name && item.phase === phase.name);
            let phaseStartDate: Date | null = null;
            let phaseEndDate: Date | null = null;

            phaseItems.forEach(item => {
                let itemStartDate: Date | null = null;
                let itemEndDate: Date | null = null;

                // 1. Check specific item schedule
                const specificSched = itemSchedules.find((s: ItemScheduleDetails) => s.id === item.id);
                if (specificSched?.startDate) {
                    itemStartDate = new Date(specificSched.startDate);
                    if (specificSched.endDate) {
                        itemEndDate = new Date(specificSched.endDate);
                    }
                } else {
                    // 2. Fallback to distributions
                    const itemDistributions = distributions.filter((d: ItemDistribution) => d.itemId === item.id && d.percentage > 0);
                    if (itemDistributions.length > 0) {
                        itemDistributions.forEach((d: ItemDistribution) => {
                            const pDate = periodDates[d.periodId];
                            if (pDate) {
                                const dDate = new Date(pDate);
                                if (!itemStartDate || dDate < itemStartDate) {
                                    itemStartDate = dDate;
                                }
                                if (!itemEndDate || dDate > itemEndDate) {
                                    itemEndDate = dDate;
                                }
                            }
                        });

                        // If we only have start of month from distributions, assume standard month duration if endDate not clear
                        if (itemEndDate) {
                            itemEndDate = new Date(itemEndDate);
                            itemEndDate.setMonth(itemEndDate.getMonth() + 1);
                        }
                    }
                }

                if (itemStartDate) {
                    if (!phaseStartDate || itemStartDate < phaseStartDate) {
                        phaseStartDate = itemStartDate;
                    }
                }
                if (itemEndDate) {
                    if (!phaseEndDate || itemEndDate > phaseEndDate) {
                        phaseEndDate = itemEndDate;
                    }
                }
            });

            // Fallback for duration if only start is found
            if (phaseStartDate && !phaseEndDate) {
                phaseEndDate = new Date(phaseStartDate);
                phaseEndDate.setMonth(phaseEndDate.getMonth() + 1);
            }

            if (phaseStartDate && phaseEndDate) {
                phaseSchedules.push({
                    id: phase.id,
                    name: phase.name.replace(/^[\d\.]+\s+/, ''),
                    groupName: group.name,
                    startDate: phaseStartDate,
                    endDate: phaseEndDate,
                    subPhases: phase.subPhases || []
                });
            }
        });
    });

    return phaseSchedules.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
};

/**
 * Calculates the overall realized financial progress based on purchase orders.
 */
export const calculateRealizedFinancialProgress = (budget: BudgetEntry[], orders: PurchaseOrder[]): number => {
    let totalBudgeted = 0;
    budget.forEach(item => {
        totalBudgeted += item.quantity * (item.sinapiItem?.price || 0);
    });

    if (totalBudgeted === 0) return 0;

    let totalRealized = 0;
    orders.forEach(order => {
        if (order.status !== 'Cancelado' && order.items) {
            totalRealized += order.items.reduce((acc, item) => acc + (item.total || 0), 0);
        }
    });

    const progress = (totalRealized / totalBudgeted) * 100;
    return Math.min(100, Math.round(progress * 10) / 10);
};

/**
 * Calculates where the project SHOULD be based on the schedule as of today.
 */
export const calculatePlannedFinancialProgress = (schedule: ProjectSchedule, budget: BudgetEntry[], asOfDate: Date = new Date()): number => {
    if (!schedule || !schedule.periods || !schedule.distributions || schedule.distributions.length === 0) return 0;

    let totalBudgeted = 0;
    const itemWeights: Record<string, number> = {};
    budget.forEach(item => {
        const val = item.quantity * (item.sinapiItem?.price || 0);
        totalBudgeted += val;
        itemWeights[item.id] = val;
    });

    if (totalBudgeted === 0) return 0;

    const pastPeriodIds = schedule.periods
        .filter(p => new Date(p.date) <= asOfDate)
        .map(p => p.id);

    if (pastPeriodIds.length === 0) return 0;

    let totalPlannedProgress = 0;
    const itemPlannedPercent: Record<string, number> = {};

    schedule.distributions.forEach(dist => {
        if (pastPeriodIds.includes(dist.periodId)) {
            itemPlannedPercent[dist.itemId] = (itemPlannedPercent[dist.itemId] || 0) + dist.percentage;
        }
    });

    Object.entries(itemPlannedPercent).forEach(([itemId, percent]) => {
        const weight = (itemWeights[itemId] || 0) / totalBudgeted;
        totalPlannedProgress += (Math.min(100, percent) / 100) * weight;
    });

    return Math.round(totalPlannedProgress * 1000) / 10;
};
