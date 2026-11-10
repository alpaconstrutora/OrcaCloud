/**
 * Texto de cada achado da política de vendas (`fn_sales_simulation_checks`),
 * como a conferência do plano na negociação (aba Financeiro) e a Simulação do
 * Portal do Corretor o mostram.
 *
 * O servidor decide o veredito; aqui é só a FRASE. A mensagem dele vem sem
 * acento e com número cru ("Parcela abaixo do minimo de R$ 1000.00."), então a
 * tela monta o texto pela regra + limite + valor, no formato brasileiro e
 * dizendo o que fazer (crítica de design da aba, 10/11/2026 — plano
 * docs/planos/2026-11-10-negociacao-aba-financeiro.md, item 3). Regra nova, ou
 * achado sem os números, cai na mensagem do servidor.
 *
 * `publico` muda só a AÇÃO: na negociação (app interno) o plano se corrige em
 * Venda de Ativos e o plano de pagamento fala em sinal e reforços; o corretor
 * (portal externo) não abre Venda de Ativos, escolhe entre os planos da
 * Simulação e mexe em Entrada, Parcelas mensais e Desconto.
 */
import type { PolicyCheck } from '../services/salesPlanService';

export type PublicoDaPolitica = 'negociacao' | 'corretor';

const moeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const inteiro = (n: number) => Math.round(n).toLocaleString('pt-BR');

const ONDE_FICA_O_PLANO = 'Venda de Ativos › Planos de vendas';

/** O que fazer, por regra e por público. */
const ACAO: Record<PublicoDaPolitica, Record<string, string>> = {
    negociacao: {
        plan_status: `ative-o em ${ONDE_FICA_O_PLANO}`,
        plan_validity: `ajuste-a em ${ONDE_FICA_O_PLANO}`,
        min_down_payment: 'aumente o sinal',
        max_installments: 'reduza o nº de parcelas',
        max_discount: 'reveja o valor negociado das unidades',
        min_installment_value: 'reduza o nº de parcelas',
        max_intermediary: 'reduza os reforços',
    },
    corretor: {
        plan_status: 'escolha outro plano',
        plan_validity: 'escolha outro plano',
        min_down_payment: 'aumente a entrada',
        max_installments: 'reduza as parcelas mensais',
        max_discount: 'reduza o desconto',
        min_installment_value: 'reduza as parcelas mensais',
        max_intermediary: 'reduza as intermediárias',
    },
};

export function textoDaRegra(c: PolicyCheck, publico: PublicoDaPolitica = 'negociacao'): string {
    const temNumeros = c.limit != null && c.value != null;
    const limite = Number(c.limit);
    const valor = Number(c.value);
    const acao = ACAO[publico][c.rule];
    // Para o corretor é UM dos planos que ele escolheu na Simulação.
    const oPlano = publico === 'corretor' ? 'Este plano de vendas' : 'O plano de vendas';
    switch (c.rule) {
        case 'plan_status':
            return `${oPlano} não está ativo — ${acao}.`;
        case 'plan_validity':
            return `${oPlano} está fora do período de vigência — ${acao}.`;
        case 'min_down_payment':
            if (!temNumeros) break;
            return `Entrada de ${pct(valor)} abaixo do mínimo de ${pct(limite)} — ${acao}.`;
        case 'max_installments':
            if (!temNumeros) break;
            return `Prazo de ${inteiro(valor)}× acima do máximo de ${inteiro(limite)}× — ${acao}.`;
        case 'max_discount':
            if (!temNumeros) break;
            return `Desconto de ${pct(valor)} ${c.verdict === 'BLOCKED' ? 'muito acima' : 'acima'} do máximo de ${pct(limite)} — ${acao}.`;
        case 'min_installment_value':
            if (!temNumeros) break;
            return `Parcela de ${moeda(valor)} abaixo do mínimo de ${moeda(limite)} — ${acao}.`;
        case 'max_intermediary':
            if (!temNumeros) break;
            return `${inteiro(valor)} intermediárias acima do máximo de ${inteiro(limite)} — ${acao}.`;
    }
    return c.message;
}
