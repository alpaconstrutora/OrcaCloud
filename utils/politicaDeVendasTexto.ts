/**
 * Texto de cada achado da política de vendas (`fn_sales_simulation_checks`),
 * como a conferência do plano na negociação (aba Financeiro) o mostra.
 *
 * O servidor decide o veredito; aqui é só a FRASE. A mensagem dele vem sem
 * acento e com número cru ("Parcela abaixo do minimo de R$ 1000.00."), então a
 * tela monta o texto pela regra + limite + valor, no formato brasileiro e
 * dizendo o que fazer (crítica de design da aba, 10/11/2026 — plano
 * docs/planos/2026-11-10-negociacao-aba-financeiro.md, item 3). Regra nova, ou
 * achado sem os números, cai na mensagem do servidor.
 */
import type { PolicyCheck } from '../services/salesPlanService';

const moeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const inteiro = (n: number) => Math.round(n).toLocaleString('pt-BR');

const ONDE_FICA_O_PLANO = 'Venda de Ativos › Planos de vendas';

export function textoDaRegra(c: PolicyCheck): string {
    const temNumeros = c.limit != null && c.value != null;
    const limite = Number(c.limit);
    const valor = Number(c.value);
    switch (c.rule) {
        case 'plan_status':
            return `O plano de vendas não está ativo — ative-o em ${ONDE_FICA_O_PLANO}.`;
        case 'plan_validity':
            return `O plano de vendas está fora do período de vigência — ajuste-a em ${ONDE_FICA_O_PLANO}.`;
        case 'min_down_payment':
            if (!temNumeros) break;
            return `Entrada de ${pct(valor)} abaixo do mínimo de ${pct(limite)} — aumente o sinal.`;
        case 'max_installments':
            if (!temNumeros) break;
            return `Prazo de ${inteiro(valor)}× acima do máximo de ${inteiro(limite)}× — reduza o nº de parcelas.`;
        case 'max_discount':
            if (!temNumeros) break;
            return `Desconto de ${pct(valor)} ${c.verdict === 'BLOCKED' ? 'muito acima' : 'acima'} do máximo de ${pct(limite)} — reveja o valor negociado das unidades.`;
        case 'min_installment_value':
            if (!temNumeros) break;
            return `Parcela de ${moeda(valor)} abaixo do mínimo de ${moeda(limite)} — reduza o nº de parcelas.`;
        case 'max_intermediary':
            if (!temNumeros) break;
            return `${inteiro(valor)} intermediárias acima do máximo de ${inteiro(limite)} — reduza os reforços.`;
    }
    return c.message;
}
