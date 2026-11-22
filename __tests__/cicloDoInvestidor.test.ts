/**
 * Análise E1 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md: o ciclo de vida do investidor
 * de ponta a ponta. Os dados abaixo são o que o banco devolveu (21/11/2026, transação desfeita) depois de:
 * interesse pelo link (R$ 200 mil) → Tornar sócio (20 cotas, 20%) → chamada de R$ 200 mil → pagamento em 10/03/2026
 * (vira aporte) → distribuição de R$ 50 mil em 30/09/2026 pela SPE. Aqui: cada tela do investidor mostra o mesmo número.
 */
import { describe, expect, it } from 'vitest';
import { carteiraDoInvestidor, resumoDaCarteira } from '../utils/investidorCarteira';
import { informeDoAno } from '../utils/informeDeRendimentos';
import { captacaoDaVitrine } from '../utils/oportunidadeCaptacao';

const obra = { id: 'obra', name: 'Garden Cambuhy', settings: { obraProgress: 5.4 } };
const socio = { id: 'spe', name: 'SPE ciclo E1', project_id: 'obra', ownership_pct: 20, quota_count: 20, capital_calls_total: 200_000, capital_paid: 200_000, lucro_da_versao: null };
const extrato = [
    { project_id: 'obra', type: 'aporte', amount: 200_000, status: 'liquidado', paid_date: '2026-03-10' },
    { project_id: 'obra', type: 'distribuicao', amount: 50_000, status: 'liquidado', paid_date: '2026-09-30' },
];

describe('E1 — ciclo do investidor', () => {
    const itens = carteiraDoInvestidor({ obras: [obra], socios: [socio], participacoes: [], lancamentos: extrato });

    it('Carteira: o sócio da SPE aparece com a cota e o integralizado (sem versão, a tela diz)', () => {
        expect(itens).toHaveLength(1);
        expect(itens[0]).toMatchObject({ name: 'Garden Cambuhy', cota: '20%', invested: 200_000, received: 50_000, equity: 200_000 });
        expect(itens[0].origemDoPatrimonio).toMatch(/integralizado/i);
    });

    it('Resumo: aportado, recebido e retornos batem com o extrato', () => {
        const r = resumoDaCarteira(itens, extrato, new Date('2026-11-21'));
        expect(r).toMatchObject({ patrimonio: 200_000, aportado: 200_000, recebido: 50_000 });
        expect(r.retornoTotal).toBeCloseTo(0.25);
        expect(r.retornoEmCaixa).toBeCloseTo(0.25);
    });

    it('Fiscal 2026: custo em 31/12 = o aporte; rendimentos = a distribuição; 2025 vazio', () => {
        const i2026 = informeDoAno(extrato, 2026, () => 'Garden Cambuhy');
        expect(i2026).toMatchObject({ custoAnterior: 0, custoAtual: 200_000, rendimentos: 50_000 });
        expect(informeDoAno(extrato, 2025, () => 'x').linhas).toEqual([]);
    });

    it('Vitrine: a captação mostra o integralizado da SPE', () => {
        const c = captacaoDaVitrine({ chamado: 200_000, integralizado: 200_000, com_spe: true, exposicao_maxima: null, fontes_de_investidor: null });
        expect(c).toMatchObject({ chamado: 200_000, integralizado: 200_000, comSpe: true });
    });
});
