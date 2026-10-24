import { describe, it, expect } from 'vitest';
import {
    motivoNaoCancelaRateio, motivoNaoFechaRateio, motivoNaoGeraCotas, motivoNaoSalvaRateio, rotulosDasDespesas,
    situacaoDoRateio, type RateioDoPortal,
} from '../utils/rateioDoSindico';

function rateio(p: Partial<RateioDoPortal> = {}): RateioDoPortal {
    return { status: 'RASCUNHO', cotas: [{ tituloStatus: null }, { tituloStatus: null }], ...p };
}

describe('situação do rateio no portal', () => {
    it('rascunho, fechado, cotas em parte e todas geradas', () => {
        expect(situacaoDoRateio(rateio())).toBe('RASCUNHO');
        expect(situacaoDoRateio(rateio({ status: 'FECHADO' }))).toBe('FECHADO');
        expect(situacaoDoRateio(rateio({ status: 'FECHADO', cotas: [{ tituloStatus: 'PENDING' }, { tituloStatus: null }] }))).toBe('COTAS_PARCIAIS');
        expect(situacaoDoRateio(rateio({ status: 'FECHADO', cotas: [{ tituloStatus: 'PENDING' }] }))).toBe('COTAS_GERADAS');
    });
});

describe('botões do rateio dizem por que estão desligados', () => {
    const base = null;
    it('o motivo de operar (link, prévia, 007) vem antes de tudo', () => {
        expect(motivoNaoFechaRateio(rateio(), 'Entre com e-mail e senha.')).toBe('Entre com e-mail e senha.');
        expect(motivoNaoGeraCotas(rateio({ status: 'FECHADO' }), 'Prévia.')).toBe('Prévia.');
    });
    it('fechar: só rascunho', () => {
        expect(motivoNaoFechaRateio(rateio(), base)).toBeNull();
        expect(motivoNaoFechaRateio(rateio({ status: 'FECHADO' }), base)).toMatch(/rascunho/);
    });
    it('gerar cotas: só fechado e com cota por gerar', () => {
        expect(motivoNaoGeraCotas(rateio(), base)).toMatch(/Feche/);
        expect(motivoNaoGeraCotas(rateio({ status: 'FECHADO' }), base)).toBeNull();
        expect(motivoNaoGeraCotas(rateio({ status: 'FECHADO', cotas: [{ tituloStatus: 'PENDING' }] }), base)).toMatch(/já foram geradas/);
    });
    it('cancelar: o banco recusa com cota na rua — o botão diz antes', () => {
        expect(motivoNaoCancelaRateio(rateio(), base)).toBeNull();
        expect(motivoNaoCancelaRateio(rateio({ status: 'FECHADO' }), base)).toBeNull();
        expect(motivoNaoCancelaRateio(rateio({ status: 'FECHADO', cotas: [{ tituloStatus: 'PENDING' }] }), base)).toMatch(/cobrança/);
    });
});

describe('salvar o rateio novo', () => {
    const previa = { totalRateado: 100, despesas: [{}] };
    it('grupo precisa de unidade; fixo precisa de valor; prévia precisa ter cota', () => {
        expect(motivoNaoSalvaRateio({ criterio: 'IGUAL', grupo: [], valorFixo: null }, previa, null)).toBeNull();
        expect(motivoNaoSalvaRateio({ criterio: 'GRUPO', grupo: [], valorFixo: null }, previa, null)).toMatch(/unidades do grupo/);
        expect(motivoNaoSalvaRateio({ criterio: 'FIXO', grupo: [], valorFixo: 0 }, previa, null)).toMatch(/valor fixo/);
        expect(motivoNaoSalvaRateio({ criterio: 'IGUAL', grupo: [], valorFixo: null }, null, null)).toMatch(/prévia/);
        expect(motivoNaoSalvaRateio({ criterio: 'IGUAL', grupo: [], valorFixo: null }, { totalRateado: 100, despesas: [] }, null)).toMatch(/despesa/);
        expect(motivoNaoSalvaRateio({ criterio: 'IGUAL', grupo: [], valorFixo: null }, { totalRateado: 0, despesas: [{}] }, null)).toMatch(/Nenhuma unidade/);
        expect(motivoNaoSalvaRateio({ criterio: 'IGUAL', grupo: [], valorFixo: null }, previa, 'Entre.')).toBe('Entre.');
    });
});

describe('descrição da despesa: a mesma poda do admin', () => {
    it('nome de arquivo do boleto vira o nome da parte; texto bom fica', () => {
        const r = rotulosDasDespesas([
            { transaction_id: 'a', descricao: 'Consumo de Energia', parte: 'ENERGISA' },
            { transaction_id: 'b', descricao: null, parte: null },
        ]);
        expect(r.a).toBe('Consumo de Energia');
        expect(r.b).toBeUndefined();
    });
});
