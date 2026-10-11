/**
 * IRRF retido na fonte em LOCAÇÃO (10/10/2026).
 *
 * Regra do usuário: só há retenção quando o inquilino é pessoa JURÍDICA e o
 * locador é pessoa FÍSICA — o cliente retém o imposto e paga a parcela líquida
 * (valor da parcela − IRRF). PF→PF não retém (o locador recolhe pelo
 * Carnê-Leão); locador PJ não retém (o IR entra na apuração da empresa).
 *
 * PF/PJ vem do cadastro de Clientes (`clients.type`). Com vários inquilinos,
 * basta UM ser PJ (decisão do usuário).
 */
import { calculateIRRF, aplicarRedutorIRRF2026 } from '../lib/payrollCalc';
import type { IRRFBracket } from '../services/fiscalService';

export type TipoPessoa = 'PF' | 'PJ';

interface Pessoa { type?: TipoPessoa | string | null }

/** A regra de retenção: algum inquilino PJ e locador PF. */
export function deveReterIrrfLocacao(inquilinos: Pessoa[], locador: Pessoa | null | undefined): boolean {
    return locador?.type === 'PF' && inquilinos.some(i => i.type === 'PJ');
}

/**
 * IRRF sobre a parcela de aluguel: tabela progressiva mensal (`irrf_brackets`
 * vigente na data) e, de 2026 em diante, o mesmo redutor da folha
 * (`aplicarRedutorIRRF2026` — decisão do usuário). Arredondado a centavos.
 */
export function irrfDoAluguel(valorParcela: number, faixas: IRRFBracket[], ano: number): number {
    const bruto = calculateIRRF(valorParcela, faixas);
    const imposto = ano >= 2026 ? aplicarRedutorIRRF2026(bruto, valorParcela) : bruto;
    return Math.round(imposto * 100) / 100;
}
