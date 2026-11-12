import { describe, it, expect } from 'vitest';
import { resultadosDoEstudo, diferencaEntreVersoes, INDICADORES_DA_VERSAO } from '../utils/imovibVersoes';
import { baseStudy, withCost } from './fixtures/imovibEstudos';

/**
 * Versões congeladas (item 10.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D5): o estudo
 * inteiro e os indicadores do momento; comparar duas versões.
 */
const versao = (study: ReturnType<typeof baseStudy>) => ({ snapshot: study, results: resultadosDoEstudo(study) });

describe('10.2 — versões congeladas', () => {
    it('duas versões iguais não têm diferença', () => {
        const d = diferencaEntreVersoes(versao(baseStudy()), versao(baseStudy()));
        expect(d.premissas).toEqual([]);
        expect(d.indicadores.every(i => i.a === i.b)).toBe(true);
    });

    it('mudar uma premissa aparece com o valor antes e depois, e os indicadores mudam', () => {
        const d = diferencaEntreVersoes(versao(baseStudy()), versao(baseStudy({ discount_rate: 15 })));
        expect(d.premissas).toEqual([expect.objectContaining({ campo: 'discount_rate', premissa: 'TMA', antes: 12, depois: 15, unidade: '% a.a.' })]);
        const vpl = d.indicadores.find(i => i.chave === 'vpl')!;
        expect(vpl.b).toBeLessThan(vpl.a as number);
    });

    it('recalcular o snapshot logo depois de congelar reproduz os resultados gravados (ida e volta pelo JSON do banco)', () => {
        const estudo = withCost(14_000, { funding_debt_percent: 60, financing_rate_annual: 14 });
        const gravado = JSON.parse(JSON.stringify(versao(estudo)));
        expect(resultadosDoEstudo(gravado.snapshot)).toEqual(gravado.results);
    });

    it('TIR que não existe é gravada como vazia (o JSON não tem NaN), não como 0', () => {
        const r = resultadosDoEstudo(baseStudy({ blocks: [] }));
        expect(r.tirAnual).toBeNull();
        expect(JSON.parse(JSON.stringify(r)).tirAnual).toBeNull();
    });

    it('os indicadores comparados têm rótulo e unidade', () => {
        expect(INDICADORES_DA_VERSAO.map(i => i.chave)).toEqual(expect.arrayContaining(['vgv', 'vpl', 'tirAnual', 'exposicaoMaxima', 'lucroLiquido']));
        for (const i of INDICADORES_DA_VERSAO) expect(i.rotulo && i.unidade).toBeTruthy();
    });
});

describe('10.2 (revisão) — a comparação vê mudança em lista e na estrutura', () => {
    it('mudar o mês de uma parcela do terreno aparece (antes só contava as parcelas)', () => {
        const a = baseStudy({ land_payment_schedule: [{ month: 1, percent: 50 }, { month: 6, percent: 50 }] });
        const b = baseStudy({ land_payment_schedule: [{ month: 1, percent: 50 }, { month: 30, percent: 50 }] });
        const d = diferencaEntreVersoes(versao(a), versao(b));
        expect(d.premissas.map(p => p.premissa)).toContain('Pagamento do terreno');
    });

    it('mudar preço por torre, rubrica, espelho ou fonte aparece como mudança de estrutura', () => {
        const a = baseStudy();
        const b = baseStudy();
        b.blocks[0].sales_price_sqm = 12_000;
        const d = diferencaEntreVersoes(versao(a), versao(b));
        expect(d.premissas.map(p => p.premissa)).toContain('Torres, tipologias e preços');
    });

    it('a exposição máxima sai positiva (o mesmo sinal do parecer e do relatório)', () => {
        expect(resultadosDoEstudo(withCost(14_000)).exposicaoMaxima).toBeGreaterThan(0);
    });
});
