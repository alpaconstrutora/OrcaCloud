import { supabase } from '../lib/supabase';
import { payrollService } from './payrollService';
import { fiscalService, INSSBracket, IRRFBracket } from './fiscalService';
import { calculateINSS, calculateIRRF } from '../lib/payrollCalc';

export interface ValidationDifference {
    employee_id: string;
    employee_name?: string;
    field: string;
    system: number;
    reference: number;
    diff: number;
    status: 'OK' | 'ERROR';
}

export interface ValidationLog {
    employee_id: string;
    employee_name: string;
    differences: ValidationDifference[];
}

export const payrollValidationService = {
    /**
     * Motor de Referência — usa faixas do banco (mesma lógica do payrollEngine)
     */
    calculatePayrollReference({ salary, overtime50 = 0, bonus = 0, inssBrackets, irrfBrackets }: {
        salary: number, overtime50?: number, bonus?: number,
        inssBrackets: INSSBracket[], irrfBrackets: IRRFBracket[]
    }) {
        const hourlyRate = salary / 220;
        const he50 = overtime50 * hourlyRate * 1.5;
        const gross = salary + he50 + bonus;

        const inss = Number(calculateINSS(gross, inssBrackets).toFixed(2));

        const baseIRRF = gross - inss;
        const irrf = Number(calculateIRRF(baseIRRF, irrfBrackets).toFixed(2));

        const fgts = Number((gross * 0.08).toFixed(2));
        const net = Number((gross - inss - irrf).toFixed(2));
        const employerCost = Number((gross + fgts).toFixed(2));

        return { gross, inss, irrf, fgts, net, employerCost };
    },

    /**
     * Valida um ciclo de folha completo
     */
    async validateRun(runId: string): Promise<ValidationLog[]> {
        const tolerance = 1; // R$ 1,00
        const logs: ValidationLog[] = [];

        // 1. Buscar a run, faixas fiscais do banco e resultados em paralelo
        const run = await payrollService.getRun(runId);
        const refDate = run.start_date;

        const [inssBrackets, irrfBrackets, results] = await Promise.all([
            fiscalService.getINSSBrackets(refDate),
            fiscalService.getIRRFBrackets(refDate),
            payrollService.listResultsByRun(runId)
        ]);

        for (const res of results) {
            const employeeId = res.employee_id;
            const employeeName = res.employee?.name || 'Desconhecido';

            // 2. Buscar eventos manuais (Usando 'all' para paridade)
            const events = await payrollService.listEvents('all', runId);
            const employeeEvents = events.filter(e => e.employee_id === employeeId);

            // Soma BONUS (rubricas de provento que não são salário base ou HE)
            const bonus = employeeEvents
                .filter(e => e.type === 'provento')
                .reduce((s, e) => s + (Number(e.amount) || 0), 0);

            // Vamos buscar itens processados para HE50
            const items = await payrollService.getEmployeeItems(runId, employeeId);
            const heItem = items.find(i => i.code === 'HE50');
            const overtimeHours = heItem ? Number(heItem.base_amount) : 0;

            const reference = this.calculatePayrollReference({
                salary: res.employee?.base_salary || 0,
                overtime50: overtimeHours,
                bonus,
                inssBrackets,
                irrfBrackets
            });

            // 3. Comparar
            const differences: ValidationDifference[] = [];
            const fields: (keyof typeof reference)[] = ['gross', 'inss', 'irrf', 'fgts', 'net', 'employerCost'];
            
            // Para uma validação precisa, vamos comparar os totais principais persistidos
            const systemValues: any = {
                gross: res.gross,
                net: res.net,
                employerCost: res.employer_cost,
                inss: items.find(i => i.code === 'INSS')?.amount || 0,
                irrf: items.find(i => i.code === 'IRRF')?.amount || 0,
                fgts: items.find(i => i.code === 'FGTS')?.amount || 0
            };

            for (const field of fields) {
                const sysValue = systemValues[field] || 0;
                const refValue = reference[field] || 0;
                const diff = Math.abs(sysValue - refValue);
                
                if (diff > tolerance) {
                    differences.push({
                        employee_id: employeeId,
                        field,
                        system: sysValue,
                        reference: refValue,
                        diff,
                        status: 'ERROR'
                    });
                }
            }

            if (differences.length > 0) {
                logs.push({
                    employee_id: employeeId,
                    employee_name: employeeName,
                    differences
                });
            }
        }

        // 4. Retornar logs (Removida gravação em validation_logs para evitar erro 400)
        console.log(`[Validation] Processadas ${logs.length} discrepâncias na folha ${runId}`);
        return logs;
    }
};
