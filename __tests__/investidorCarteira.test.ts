/**
 * Carteira do investidor — Fase B do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md (D2: o
 * Imovib e a SPE são a fonte). Mantém o caso de 18/11/2026: o Garden aparecia com "R$ 230.000" de patrimônio
 * (área padrão × CUB fixo, 100% ao investidor) sem participação nenhuma — tem de ser "—" com o motivo.
 */
import { describe, it, expect } from 'vitest';
import {
    carteiraDoInvestidor, resumoDaCarteira, resumoDosLancamentos, retornos, totalDaCarteira,
    SEM_PARTICIPACAO, ROTULO_DA_ORIGEM,
} from '../utils/investidorCarteira';

const garden = { id: 'obra-garden', name: 'Garden Cambuhy', settings: { location: 'Campinas', obraStatus: 'Em andamento', obraProgress: 5.4 } };
const torre = { id: 'obra-torre', name: 'Torre Sul', settings: {} };
const socio = (over = {}) => ({
    id: 'spe-1', name: 'SPE Garden', project_id: 'obra-garden', ownership_pct: 10, quota_count: 10,
    capital_calls_total: 1_000_000, capital_paid: 800_000, lucro_da_versao: 5_000_000, versao_label: 'Comitê', ...over,
});
const lanc = (type: string, amount: number, status = 'liquidado', project_id = 'obra-garden', paid_date = '2026-01-10') =>
    ({ project_id, type, amount, status, paid_date });

describe('carteiraDoInvestidor', () => {
    it('Garden sem participação nem aporte: sem patrimônio, sem área × CUB', () => {
        const [item] = carteiraDoInvestidor({ obras: [garden], socios: [], participacoes: [], lancamentos: [lanc('aporte', 100, 'pendente')] });
        expect(item.equity).toBeNull();
        expect(item.semPatrimonio).toBe(SEM_PARTICIPACAO);
        expect(item.cota).toBe('—');
    });

    it('sócio da SPE com versão: patrimônio = integralizado + lucro × %; cota da SPE', () => {
        const [item] = carteiraDoInvestidor({ obras: [garden], socios: [socio()], participacoes: [], lancamentos: [lanc('dividendo', 20_000)] });
        expect(item.equity).toBe(800_000 + 5_000_000 * 0.10);
        expect(item.cota).toBe('10%');
        expect(item.invested).toBe(800_000);
        expect(item.received).toBe(20_000);
        expect(item.origemDoPatrimonio).toBe(`${ROTULO_DA_ORIGEM.versao} (Comitê)`);
        // (20 mil + 1,3 mi − 800 mil) ÷ 800 mil = 65%; em caixa 20 mil ÷ 800 mil = 2,5%
        expect(item.yoc).toBeCloseTo(0.65);
        expect(item.retornoEmCaixa).toBe('2,5%');
        expect(item.name).toBe('Garden Cambuhy');
        expect(item.progress).toBe(5.4);
    });

    it('"Tornar sócio" sem participação digitada aparece na carteira (B1)', () => {
        const itens = carteiraDoInvestidor({ obras: [garden], socios: [socio({ capital_paid: 0, lucro_da_versao: null })], participacoes: [], lancamentos: [] });
        expect(itens).toHaveLength(1);
        expect(itens[0].cota).toBe('10%');
        expect(itens[0].equity).toBeNull();
    });

    it('sem versão publicada: só o integralizado, e a tela diz', () => {
        const [item] = carteiraDoInvestidor({ obras: [garden], socios: [socio({ lucro_da_versao: null })], participacoes: [], lancamentos: [] });
        expect(item.equity).toBe(800_000);
        expect(item.origemDoPatrimonio).toBe(ROTULO_DA_ORIGEM.integralizado);
    });

    it('obra sem SPE: participação legada, patrimônio = aportado; a obra da SPE não duplica', () => {
        const itens = carteiraDoInvestidor({
            obras: [garden, torre],
            socios: [socio()],
            participacoes: [{ project_id: 'obra-torre', ownership_pct: 5 }, { project_id: 'obra-garden', ownership_pct: 99 }],
            lancamentos: [lanc('aporte', 300_000, 'liquidado', 'obra-torre')],
        });
        expect(itens.map(i => i.name)).toEqual(['Garden Cambuhy', 'Torre Sul']);
        expect(itens[1]).toMatchObject({ equity: 300_000, cota: '5%', origemDoPatrimonio: ROTULO_DA_ORIGEM.aportado });
    });
});

describe('recebido e retornos (B3/B4)', () => {
    it('recebido = dividendo + distribuição liquidados; retirada à parte', () => {
        expect(resumoDosLancamentos([
            lanc('dividendo', 10), lanc('distribuicao', 5), lanc('distribuicao', 99, 'pendente'), lanc('retirada', 7), lanc('aporte', 50, 'atrasado'),
        ])).toEqual({ aportado: 0, recebido: 15, retirado: 7, pendente: 50 });
    });
    it('sem aporte não há retorno', () => {
        expect(retornos(0, 10, 100)).toEqual({ total: null, emCaixa: null });
    });
    it('resumo do Resumo: uma conta para portal e gestor', () => {
        const itens = carteiraDoInvestidor({ obras: [garden], socios: [socio()], participacoes: [], lancamentos: [] });
        const lancs = [lanc('aporte', 800_000), lanc('dividendo', 20_000), lanc('distribuicao', 4_000)];
        const r = resumoDaCarteira(itens, lancs, new Date('2026-11-10'));
        expect(r.patrimonio).toBe(1_300_000);
        expect(r.aportado).toBe(800_000);
        expect(r.recebido).toBe(24_000);
        expect(r.retornoEmCaixa).toBeCloseTo(0.03);
        expect(r.rendimentoMensalPct).toBeCloseTo((24_000 / 800_000 / 10) * 100);
    });
    it('totalDaCarteira soma só o conhecido', () => {
        expect(totalDaCarteira([{ equity: null, semPatrimonio: 'x' }]).total).toBeNull();
        expect(totalDaCarteira([{ equity: 10 }, { equity: null }]).total).toBe(10);
    });
});
