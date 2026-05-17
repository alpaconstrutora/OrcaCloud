import { payrollService, PayrollRubric } from './payrollService';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export const rubricValidationService = {
    /**
     * Valida se uma rubrica pode ser alterada ou criada
     */
    async validateRubricChange(oldRubric: PayrollRubric | null, newRubric: PayrollRubric): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 1. Regras de Criação (oldRubric == null)
        if (!oldRubric) {
            // Verificar código único (já é PK no banco, mas bom validar na UI/Service)
            try {
                const existing = await payrollService.getRubric(newRubric.code);
                if (existing) errors.push('Já existe uma rubrica com este código.');
            } catch (e) { /* Não existe, ok */ }
        }

        // 2. Regras de Edição
        if (oldRubric) {
            // Código é imutável
            if (oldRubric.code !== newRubric.code) {
                errors.push('O código da rubrica não pode ser alterado.');
            }

            // Tipo é imutável se já houver uso
            if (oldRubric.type !== newRubric.type) {
                const used = await payrollService.isRubricUsed(oldRubric.code);
                if (used) {
                    errors.push('O tipo da rubrica não pode ser alterado pois já existem lançamentos vinculados.');
                }
            }

            // Rubricas Críticas Protegidas
            const protectedCodes = ['INSS', 'IRRF', 'FGTS', 'SALARIO'];
            if (protectedCodes.includes(oldRubric.code)) {
                if (oldRubric.incidence_inss !== newRubric.incidence_inss ||
                    oldRubric.incidence_fgts !== newRubric.incidence_fgts ||
                    oldRubric.incidence_irrf !== newRubric.incidence_irrf) {
                    errors.push(`A rubrica ${oldRubric.code} é essencial para o motor fiscal e suas incidências não podem ser alteradas.`);
                }
            }

            // Alerta de Mudança em Produção
            if (oldRubric.incidence_inss !== newRubric.incidence_inss ||
                oldRubric.incidence_fgts !== newRubric.incidence_fgts ||
                oldRubric.incidence_irrf !== newRubric.incidence_irrf) {
                warnings.push('A alteração de incidências mudará o cálculo de todas as folhas futuras (mensais, férias, etc).');
            }
        }

        // 3. Matriz de Coerência (Removida restrição de desconto/FGTS para permitir abatimento de base)
        if (newRubric.type === 'encargo') {
            if (newRubric.incidence_inss || newRubric.incidence_irrf) {
                errors.push('Encargos da empresa não podem ter incidência de INSS ou IRRF (apenas FGTS é permitido).');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
};
