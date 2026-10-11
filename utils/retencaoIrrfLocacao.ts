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
import { calcularIrrfMensal } from '../lib/payrollCalc';
import type { IRRFBracket } from '../services/fiscalService';

export type TipoPessoa = 'PF' | 'PJ';

interface Pessoa { type?: TipoPessoa | string | null }

/** A regra de retenção: algum inquilino PJ e locador PF. */
export function deveReterIrrfLocacao(inquilinos: Pessoa[], locador: Pessoa | null | undefined): boolean {
    return locador?.type === 'PF' && inquilinos.some(i => i.type === 'PJ');
}

/**
 * IRRF sobre a parcela de aluguel — a MESMA conta da folha
 * (`calcularIrrfMensal`, Lei 9.250): sem deduções legais conhecidas, vale o
 * desconto simplificado mensal (art. 4º, § 2º — a partir de 05/2023), depois a
 * tabela progressiva vigente na data e, de 2026 em diante, a redução do
 * art. 3º-A sobre o valor da parcela. Arredondado a centavos.
 */
export function irrfDoAluguel(valorParcela: number, faixas: IRRFBracket[], data: string): number {
    const { irrf } = calcularIrrfMensal(valorParcela, 0, faixas, data);
    // toFixed(6) antes de arredondar: 802,685 não pode virar 802,68 por ponto flutuante.
    return Math.round(Number(irrf.toFixed(6)) * 100) / 100;
}
