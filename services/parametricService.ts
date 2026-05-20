
import { ProjectSettings, BudgetEntry, SinapiType, SinapiItem } from '../types';
import { CUB_STANDARDS_DATA, BASE_CUB_RATES } from '../constants';
import { NBR_12721_COEFFICIENTS } from '../constants_nbr';
import { supabase } from '../lib/supabase';

export const parametricService = {
    async generateParametricBudgetAsync(settings: ProjectSettings): Promise<BudgetEntry[]> {
        const area = settings.area || 0;
        const standardKey = (settings.standard || 'R8-N').toLowerCase().replace(/-/g, '_');

        // Fetch from Supabase
        const { data, error } = await supabase
            .from('cub_parametric_data')
            .select('*')
            .ilike('state', settings.location || 'MG')
            .eq('reference_date', settings.referenceMonth || '01/2025')
            .eq('social_charges', settings.socialChargesMode || 'Com Desoneração');

        if (error || !data || data.length === 0) {
            console.error("Error fetching CUB data or no data found:", error);
            return [];
        }

        const newBudget: BudgetEntry[] = [];
        let idCounter = 1;

        // Ensure we create 4 synthetic items: Materiais, Mão de Obra, Despesas Administrativas, Equipamentos
        const validNatures = ['Materiais', 'Mão de Obra', 'Despesas Administrativas', 'Equipamentos'];

        validNatures.forEach(nature => {
            const row = data.find(d => d.nature === nature);
            if (row && row[standardKey] > 0) {
                const cubRateForNature = parseFloat(row[standardKey]);
                const allocatedValue = area * cubRateForNature; // Exact value without BDI or multipliers

                const syntheticItem: SinapiItem = {
                    code: `PARAM-${nature.substring(0, 3).toUpperCase()}`,
                    description: `ESTIMATIVA PARAMÉTRICA - ${nature.toUpperCase()}`,
                    unit: 'vb',
                    price: allocatedValue,
                    type: SinapiType.SERVICE,
                    category: 'Estimativa',
                    nature: nature as SinapiItem['nature']
                };

                newBudget.push({
                    id: String(idCounter++),
                    group: "01 CONSTRUÇÃO CIVIL",
                    phase: "01.01 CURVA CUB",
                    subPhase: `01.01.01 ${nature}`,
                    sinapiItem: syntheticItem,
                    quantity: 1
                });
            }
        });

        return newBudget;
    },

    /**
     * Generates a quantitative budget based on NBR 12721 Coefficients.
     * Quantity = Area * coefficient
     */
    generateQuantitativeBudget(settings: ProjectSettings): BudgetEntry[] {
        const area = settings.area || 0;
        const standard = settings.standard;

        const coefficients = NBR_12721_COEFFICIENTS[standard] || [];

        if (coefficients.length === 0) return [];

        const newBudget: BudgetEntry[] = [];
        let idCounter = Date.now();

        coefficients.forEach((item, index) => {
            const calculatedQuantity = area * item.coefficient;

            const groupName = "01 CONSTRUÇÃO CIVIL";
            const phaseName = "01.01 ESTIMATIVA NBR 12721";
            const subPhaseName = "01.01.01 Lote Básico de Insumos";

            const syntheticItem: SinapiItem = {
                code: `NBR-${standard}-${index + 1}`,
                description: `NBR 12721 - ${item.description}`,
                unit: item.unit,
                price: 0,
                type: SinapiType.INPUT,
                category: 'NBR 12721'
            };

            newBudget.push({
                id: String(idCounter + index),
                group: groupName,
                phase: phaseName,
                subPhase: subPhaseName,
                sinapiItem: syntheticItem,
                quantity: calculatedQuantity
            });
        });

        return newBudget;
    },

    async calculateTotalEstimatedValueAsync(settings: ProjectSettings): Promise<number> {
        const area = settings.area || 0;
        const standardKey = (settings.standard || 'R8-N').toLowerCase().replace(/-/g, '_');

        const { data, error } = await supabase
            .from('cub_parametric_data')
            .select('*')
            .ilike('state', settings.location || 'MG')
            .eq('reference_date', settings.referenceMonth || '01/2025')
            .eq('social_charges', settings.socialChargesMode || 'Com Desoneração');

        let cubRateFromTable = 0;
        if (!error && data && data.length > 0) {
            const totalRow = data.find(d => d.nature === 'Total');
            if (totalRow && totalRow[standardKey] > 0) {
                cubRateFromTable = parseFloat(totalRow[standardKey]);
            }
        }

        // If table data is found, it overrides the manual cubRate settings
        let finalCubRate = cubRateFromTable;

        // Fallback to manual settings ONLY if table data is not found
        if (finalCubRate === 0) {
            const baseCub = BASE_CUB_RATES[settings.location] || 2000.00;
            const multiplier = (CUB_STANDARDS_DATA[settings.standard] || { multiplier: 1.0 }).multiplier;
            const fallbackRate = baseCub * multiplier;
            // Use cubRate if explicitly defined in settings, otherwise use fallback
            finalCubRate = settings.cubRate && settings.cubRate > 0 ? settings.cubRate : fallbackRate;
        }

        const bdi = this.calculateCompositeBdi(settings);
        const kFactor = settings.kFactor || 1.0;

        // Formula: Area * CUB * (1 + BDI) * K-Factor
        return area * finalCubRate * (1 + bdi / 100) * kFactor;
    },

    calculateCompositeBdi(settings: ProjectSettings): number {
        if (!settings.bdiComposition) return settings.bdi || 0;

        const {
            admin,
            insurance,
            guarantee,
            risk,
            finance,
            profit,
            taxes
        } = settings.bdiComposition;

        // BDI Official Formula: 
        // BDI = [((1 + (AC+S+G+R)) * (1 + DF) * (1 + L)) / (1 - I)] - 1

        const ac = (admin || 0) / 100;
        const s = (insurance || 0) / 100;
        const g = (guarantee || 0) / 100;
        const r = (risk || 0) / 100;
        const df = (finance || 0) / 100;
        const l = (profit || 0) / 100;
        const i = (taxes || 0) / 100;

        // Prevent division by zero or negative
        if (i >= 1) return 0;

        const numerator = (1 + (ac + s + g + r)) * (1 + df) * (1 + l);
        const denominator = 1 - i;

        const bdiValue = (numerator / denominator) - 1;

        return bdiValue * 100;
    },

    async getHistoricalCubDataAsync(settings: ProjectSettings): Promise<{ date: string; rate: number }[]> {
        const standardKey = (settings.standard || 'R8-N').toLowerCase().replace(/-/g, '_');

        // Fetch enough records to find unique months and avoid duplicates
        const { data, error } = await supabase
            .from('cub_parametric_data')
            .select(`reference_date, ${standardKey}, created_at`)
            .ilike('state', settings.location || 'MG')
            .eq('nature', 'Total')
            .eq('social_charges', settings.socialChargesMode || 'Com Desoneração')
            .order('created_at', { ascending: false }) // Prioritize most recent entries in DB
            .limit(200); // Fetch more to allow robust sorting/filtering

        if (error || !data) return [];

        // Manual De-duplication: Keep the most recent record (by created_at) for each reference_date
        const uniqueMonths = new Map<string, { date: string; rate: number; created: string }>();

        (data as unknown as Record<string, unknown>[]).forEach((row) => {
            const dateStr = String(row.reference_date || '');
            const rate = parseFloat(String(row[standardKey])) || 0;
            const created = String(row.created_at || '');

            // If we don't have this date yet, OR this one is more recent than what we have
            if (!uniqueMonths.has(dateStr) || new Date(created) > new Date(uniqueMonths.get(dateStr)!.created)) {
                uniqueMonths.set(dateStr, { date: dateStr, rate, created });
            }
        });

        // Convert Map to Array, sort chronologically and take last 12-24
        return Array.from(uniqueMonths.values())
            .sort((a, b) => {
                const [mA, yA] = a.date.split('/').map(Number);
                const [mB, yB] = b.date.split('/').map(Number);
                return (yA * 12 + mA) - (yB * 12 + mB); // Chronological ASC
            })
            // Filter strictly 2025 onwards as requested (ignore fictitious old data)
            .filter(item => {
                const year = parseInt(item.date.split('/')[1]);
                return year >= 2025;
            })
            .map(item => ({ date: item.date, rate: item.rate }));
    },

    async getRegionalComparisonDataAsync(settings: ProjectSettings): Promise<{ state: string; rate: number }[]> {
        const standardKey = (settings.standard || 'R8-N').toLowerCase().replace(/-/g, '_');
        const targetStates = ['MG', 'SP', 'RJ', 'SC', 'PR', 'ES']; // Chave states for benchmarking

        const { data, error } = await supabase
            .from('cub_parametric_data')
            .select(`state, ${standardKey}`)
            .in('state', targetStates)
            .eq('reference_date', settings.referenceMonth || '01/2025')
            .eq('nature', 'Total')
            .eq('social_charges', settings.socialChargesMode || 'Com Desoneração');

        if (error || !data) return [];

        return (data as unknown as Record<string, unknown>[]).map((row) => ({
            state: String(row.state || ''),
            rate: parseFloat(String(row[standardKey])) || 0
        })).sort((a, b) => b.rate - a.rate);
    },

    /**
     * Sensitivity Analysis: Applies variations to Material and Labor weights
     */
    calculateSensitivity(baseItems: BudgetEntry[], variations: { materials: number; labor: number }): BudgetEntry[] {
        return baseItems.map(item => {
            let multiplier = 1;
            if ((item.sinapiItem.nature as string) === 'Materiais') multiplier = 1 + (variations.materials / 100);
            if ((item.sinapiItem.nature as string) === 'Mão de Obra') multiplier = 1 + (variations.labor / 100);

            return {
                ...item,
                sinapiItem: {
                    ...item.sinapiItem,
                    price: item.sinapiItem.price * multiplier
                }
            };
        });
    },

    /**
     * S-Curve Generation: Projects monthly expenditure using Beta Distribution (approx)
     */
    generateSCurveData(totalValue: number, duration: number): { month: number; periodic: number; cumulative: number }[] {
        const data = [];
        let cumulative = 0;

        // Beta function approximation for S-Curve (a=2, b=2 style)
        for (let i = 1; i <= duration; i++) {
            const x = i / duration;
            // Simple sigmoid-like function: 3x^2 - 2x^3 (standard S-curve shape)
            const cumulativePerc = (3 * Math.pow(x, 2)) - (2 * Math.pow(x, 3));
            const targetCumulative = totalValue * cumulativePerc;
            const periodic = targetCumulative - cumulative;
            cumulative = targetCumulative;

            data.push({
                month: i,
                periodic: Math.round(periodic),
                cumulative: Math.round(cumulative)
            });
        }
        return data;
    },

    /**
     * Comparison Study: Fetches data for a secondary standard to compare side-by-side
     */
    async getMixComparisonAsync(settings: ProjectSettings, secondStandard: string): Promise<{ standard: string; total: number; m2: number } | null> {
        const tempSettings = { ...settings, standard: secondStandard };
        try {
            const total = await this.calculateTotalEstimatedValueAsync(tempSettings);
            return {
                standard: secondStandard,
                total,
                m2: total / (settings.area || 1)
            };
        } catch (e) {
            return null;
        }
    },

    /**
     * Calculates project milestones based on S-Curve data.
     */
    calculateMilestones(totalValue: number, duration: number): { label: string, percentage: number, value: number, month: number }[] {
        const curveData = this.generateSCurveData(totalValue, duration);
        const milestones = [10, 25, 50, 75, 90, 100];

        return milestones.map(m => {
            // Find the first month where cumulative >= m% of total
            const targetValue = (m / 100) * totalValue;
            const milestoneMonth = curveData.find(d => d.cumulative >= targetValue) || curveData[curveData.length - 1];

            return {
                label: `${m}% da Obra Concluída`,
                percentage: m,
                value: targetValue,
                month: milestoneMonth.month
            };
        });
    }
};
