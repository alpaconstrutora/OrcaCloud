import { describe, it, expect } from 'vitest';
import { marcosDoEstudo, nomeDoMes, dataDoMes, mesDaData } from '../utils/imovibCronograma';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

/** Marcos e datas (item 5.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

describe('5.1 — nomes e datas dos meses', () => {
    it('com data-base, o mês 3 chama "mar/27"; sem ela, "Mês 3" e nenhuma data', () => {
        expect(nomeDoMes('2027-01-15', 3)).toBe('mar/27');
        expect(dataDoMes('2027-01-15', 3)).toBe('2027-03');
        expect(nomeDoMes(null, 3)).toBe('Mês 3');
        expect(nomeDoMes(undefined, 3)).toBe('Mês 3');
        expect(dataDoMes(null, 3)).toBeNull();
    });

    it('vira o ano e aceita data-base inválida sem inventar data', () => {
        expect(nomeDoMes('2027-11-01', 3)).toBe('jan/28');
        expect(dataDoMes('2027-11-01', 14)).toBe('2028-12');
        expect(nomeDoMes('lixo', 3)).toBe('Mês 3');
    });

    it('data → mês do estudo (para "Usar as datas do empreendimento")', () => {
        expect(mesDaData('2027-01-15', '2027-03-31')).toBe(3);
        expect(mesDaData('2027-01-15', '2026-12-01')).toBe(0); // antes da data-base: mês inválido, quem chama avisa
        expect(mesDaData(null, '2027-03-31')).toBeNull();
        expect(mesDaData('2027-01-15', null)).toBeNull();
    });

    it('com data-base, os meses do fluxo ganham nome de mês', () => {
        const r = computeImovibMath(baseStudy({ base_date: '2027-01-15' }));
        expect(r.monthlyFlows[0].name).toBe('jan/27');
        expect(computeImovibMath(baseStudy()).monthlyFlows[0].name).toBe('Mês 1');
    });
});

describe('5.1 — marcos do estudo', () => {
    it('saem do cronograma do estudo; marco vazio fica sem mês', () => {
        const s = baseStudy({ handover_delay_months: 2 });
        const m = Object.fromEntries(marcosDoEstudo(s, computeImovibMath(s)).map(x => [x.id, x.mes]));
        expect(m).toEqual({
            aquisicao: 1, aprovacao: null, registro_incorporacao: null, lancamento: 1, inicio_obra: 6,
            habite_se: 29, repasse: 31, fim_das_vendas: 24, encerramento: computeImovibMath(s).duration,
        });
    });

    it('com data-base, cada marco com mês ganha data; sem mês, data nula', () => {
        const s = baseStudy({ base_date: '2027-01-15' });
        const marcos = marcosDoEstudo(s, computeImovibMath(s));
        expect(marcos.find(x => x.id === 'inicio_obra')!.data).toBe('2027-06');
        expect(marcos.find(x => x.id === 'aprovacao')!.data).toBeNull();
    });

    it('lançamento antes do registro da incorporação avisa (Lei 4.591/64, art. 32); obra antes da aprovação também', () => {
        const r = computeImovibMath(baseStudy({ sales_start_month: 2, incorporation_registry_month: 5, approval_month: 8 }));
        const codigos = r.avisos.map(a => a.codigo);
        expect(codigos).toContain('lancamento_antes_do_registro');
        expect(codigos).toContain('obra_antes_da_aprovacao');
        expect(r.avisos.find(a => a.codigo === 'lancamento_antes_do_registro')!.mensagem).toMatch(/4\.591/);
    });

    it('marcos vazios ou em ordem não avisam', () => {
        expect(computeImovibMath(baseStudy()).avisos).toEqual([]);
        const r = computeImovibMath(baseStudy({ sales_start_month: 6, incorporation_registry_month: 5, approval_month: 4 }));
        expect(r.avisos.filter(a => a.codigo === 'lancamento_antes_do_registro' || a.codigo === 'obra_antes_da_aprovacao')).toEqual([]);
    });
});
