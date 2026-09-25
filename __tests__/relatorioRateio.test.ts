/**
 * O modelo do relatório de rateio — a prestação de contas de uma competência.
 *
 * O que estes testes travam é o que separa um DOCUMENTO de uma tabela
 * impressa: quem recebe a prestação de contas não tem como saber por que a
 * soma não fecha, e a pergunta volta para o síndico como desconfiança. Os
 * avisos existem para dizer isso na cara do documento.
 */
import { describe, it, expect } from 'vitest';
import {
    montarRelatorioRateio, competenciaBR, dataBR,
    type EntradaRelatorio,
} from '../utils/relatorioRateio';

const AGORA = new Date(2026, 8, 25, 14, 32); // 25/09/2026 14:32, hora local

const base = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
    condominio: '007 - Bella Vista',
    numero: '0003',
    competencia: '2020-06-01',
    tipo: 'Ordinário',
    criterio: 'Valor igual por unidade',
    status: 'Fechado',
    fechadoEm: '2020-07-05T10:00:00Z',
    observacoes: null,
    despesas: [
        { descricao: 'MN CONSERVAÇÃO ELEVADORES', valor: 350 },
        { descricao: 'Energisa', valor: 118.01 },
        { descricao: 'Energisa', valor: 118.01 },
    ],
    cotas: [
        { unidade: 'Torre Única · 11', pagador: 'MARCOS JULIANO FORSTER', valor: 195.34, observacao: null },
        { unidade: 'Torre Única · 12', pagador: 'Napoleão Da Costa Azevedo', valor: 195.34, observacao: null },
        { unidade: 'Torre Única · 21', pagador: 'Francisco Salles', valor: 195.34, observacao: null },
    ],
    totalDespesas: 586.02,
    totalRateado: 586.02,
    agora: AGORA,
    ...over,
});

describe('montarRelatorioRateio — identidade do documento', () => {
    it('o título leva o NÚMERO quando existe: é por ele que o rateio é citado', () => {
        expect(montarRelatorioRateio(base()).titulo).toBe('Rateio 0003 · 06/2020');
    });

    it('sem número, o título ainda identifica a competência', () => {
        expect(montarRelatorioRateio(base({ numero: null })).titulo).toBe('Rateio de 06/2020');
    });

    it('número em branco conta como ausente — não vira "Rateio   · 06/2020"', () => {
        expect(montarRelatorioRateio(base({ numero: '   ' })).titulo).toBe('Rateio de 06/2020');
    });

    it('o nome do arquivo não carrega "/" nem ":"', () => {
        const r = montarRelatorioRateio(base());
        expect(r.nomeDoArquivo).toBe('rateio_0003_06-2020');
        expect(r.nomeDoArquivo).not.toMatch(/[/:\\]/);
    });
});

describe('montarRelatorioRateio — somas', () => {
    it('soma as linhas listadas, além de repetir os totais gravados', () => {
        const r = montarRelatorioRateio(base());
        expect(r.somaDespesas).toBe(586.02);
        expect(r.somaCotas).toBe(586.02);
        expect(r.unidades).toBe(3);
    });

    it('não acumula erro de ponto flutuante — 0,1 + 0,2 na conta de um documento vira 0,30', () => {
        const r = montarRelatorioRateio(base({
            despesas: [{ descricao: 'a', valor: 0.1 }, { descricao: 'b', valor: 0.2 }],
            totalDespesas: 0.3,
            cotas: [{ unidade: 'u', pagador: 'p', valor: 0.3, observacao: null }],
            totalRateado: 0.3,
        }));
        expect(r.somaDespesas).toBe(0.3);
        expect(r.diferenca).toBe(0);
        expect(r.avisos).toEqual([]);
    });

    it('diferença é despesa − rateado', () => {
        const r = montarRelatorioRateio(base({ totalRateado: 500 }));
        expect(r.diferenca).toBeCloseTo(86.02, 2);
    });
});

describe('montarRelatorioRateio — os avisos', () => {
    it('rateio fechado e fechado certinho não inventa aviso nenhum', () => {
        expect(montarRelatorioRateio(base()).avisos).toEqual([]);
    });

    it('RASCUNHO avisa que os valores podem mudar — o condômino vê a prévia no portal', () => {
        const r = montarRelatorioRateio(base({ status: 'Rascunho' }));
        expect(r.avisos.some(a => a.includes('rascunho'))).toBe(true);
    });

    it('soma das cotas que não fecha com a despesa é DITA, não deixada para o leitor descobrir', () => {
        const r = montarRelatorioRateio(base({ totalRateado: 500 }));
        expect(r.avisos.some(a => a.includes('86,02'))).toBe(true);
    });

    it('despesas listadas que não batem com o total gravado param a distribuição', () => {
        const r = montarRelatorioRateio(base({ totalDespesas: 700, totalRateado: 700 }));
        expect(r.avisos.some(a => a.includes('Refaça o cálculo'))).toBe(true);
    });

    it('unidade sem responsável financeiro entra no aviso, com a contagem', () => {
        const r = montarRelatorioRateio(base({
            cotas: [
                { unidade: 'Torre Única · 11', pagador: 'Alguém', valor: 293.01, observacao: null },
                { unidade: 'Torre Única · Estacionamento', pagador: null, valor: 293.01, observacao: null },
            ],
        }));
        expect(r.avisos.some(a => a.startsWith('1 unidade(s) sem responsável financeiro'))).toBe(true);
    });

    it('sem despesa listada não acusa divergência de soma — não há o que comparar', () => {
        const r = montarRelatorioRateio(base({ despesas: [], cotas: [], totalDespesas: 0, totalRateado: 0 }));
        expect(r.avisos).toEqual([]);
    });
});

describe('datas — string para string, sem passar por Date', () => {
    it('competência aceita `YYYY-MM-DD` e `YYYY-MM`', () => {
        expect(competenciaBR('2020-06-01')).toBe('06/2020');
        expect(competenciaBR('2020-06')).toBe('06/2020');
    });

    it('o dia 1º não volta para o mês anterior no fuso local', () => {
        // `new Date('2020-06-01')` é meia-noite UTC = 31/05 21h em Brasília.
        expect(competenciaBR('2020-06-01')).toBe('06/2020');
        expect(dataBR('2020-06-01T00:00:00Z')).toBe('01/06/2020');
    });

    it('data ausente vira null, não "Invalid Date"', () => {
        expect(dataBR(null)).toBeNull();
        expect(dataBR(undefined)).toBeNull();
        expect(montarRelatorioRateio(base({ fechadoEm: null })).fechadoEm).toBeNull();
    });

    it('o instante da geração é injetável — o documento não depende do relógio do teste', () => {
        expect(montarRelatorioRateio(base()).geradoEm).toBe('25/09/2026 às 14:32');
    });
});
