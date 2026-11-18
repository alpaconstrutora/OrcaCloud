/**
 * Patrimônio do investidor na carteira (pedido de 18/11/2026).
 *
 * O Resumo do portal mostrava "Patrimônio R$ 230.000" para o Tiago no Garden Cambuhy, sem
 * participação nenhuma registrada: o valor era área padrão do formulário (100 m²) × CUB fixo de MG
 * (R$ 2.300/m²), atribuído 100% ao investidor ("1x"). Patrimônio só existe com participação
 * registrada E valor do empreendimento informado; fora disso é "—" com o motivo.
 */
import { describe, it, expect } from 'vitest';
import {
    itemDaCarteira, totalDaCarteira, SEM_PARTICIPACAO, SEM_VALOR_DO_EMPREENDIMENTO,
} from '../utils/investidorCarteira';

// O Garden Cambuhy como está no banco (lido em 18/11): obra ligada ao Tiago só por projects.investor_id.
const garden = {
    id: 'ddcdbec3', name: 'Garden Cambuhy',
    settings: { financialInfo: { totalValue: 0 }, area: 100, cubRate: 2300, obraStatus: 'Em andamento', obraProgress: 5.4 },
};
const participacao = (ownershipPct: number, totalContributed = 0) => ({
    ownershipPct, totalContributed,
    roiRealized: (v: number) => totalContributed > 0 ? ((v - totalContributed) / totalContributed) * 100 : 0,
});

describe('itemDaCarteira', () => {
    it('Garden sem participação: sem patrimônio, sem "1x", sem área × CUB', () => {
        const item = itemDaCarteira(garden, undefined);
        expect(item.equity).toBeNull();
        expect(item.currentValue).toBeUndefined();
        expect(item.semPatrimonio).toBe(SEM_PARTICIPACAO);
        expect(item.cota).toBe('—');
        expect(item.yield).toBeUndefined();
    });

    it('participação registrada, mas valor do empreendimento não informado: área × CUB não vira valor', () => {
        const item = itemDaCarteira(garden, participacao(25, 50000));
        expect(item.equity).toBeNull();
        expect(item.semPatrimonio).toBe(SEM_VALOR_DO_EMPREENDIMENTO);
        expect(item.cota).toBe('25%');
        expect(item.invested).toBe(50000);
        expect(item.yield).toBeUndefined();
    });

    it('participação e valor informados: patrimônio = valor × participação', () => {
        const p = { ...garden, settings: { ...garden.settings, financialInfo: { totalValue: 1_000_000 } } };
        const item = itemDaCarteira(p, participacao(25, 200000));
        expect(item.equity).toBe(250000);
        expect(item.currentValue).toBe(250000);
        expect(item.semPatrimonio).toBeUndefined();
        expect(item.cota).toBe('25%');
        expect(item.yield).toBe('25%');
        expect(item.status).toBe('Em andamento');
        expect(item.progress).toBe(5.4);
    });
});

describe('totalDaCarteira', () => {
    const conhecido = (equity: number) => ({ name: 'A', cota: '10%', equity, status: '', progress: 0 });
    const semPart = { name: 'B', cota: '—', equity: null, semPatrimonio: SEM_PARTICIPACAO, status: '', progress: 0 };
    const semValor = { name: 'C', cota: '5%', equity: null, semPatrimonio: SEM_VALOR_DO_EMPREENDIMENTO, status: '', progress: 0 };

    it('nenhum patrimônio conhecido: total nulo e o motivo', () => {
        expect(totalDaCarteira([semPart])).toEqual({ total: null, semPatrimonio: 1, motivo: SEM_PARTICIPACAO });
    });

    it('motivos diferentes: motivo genérico', () => {
        expect(totalDaCarteira([semPart, semValor]).motivo).toBe('Patrimônio não calculado');
    });

    it('parte conhecida: soma só o que se sabe e conta o resto', () => {
        expect(totalDaCarteira([conhecido(100), semPart, conhecido(50)])).toEqual({ total: 150, semPatrimonio: 1, motivo: SEM_PARTICIPACAO });
    });

    it('carteira vazia: total zero', () => {
        expect(totalDaCarteira([])).toEqual({ total: 0, semPatrimonio: 0, motivo: undefined });
    });
});
