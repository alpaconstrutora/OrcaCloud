import { describe, expect, it } from 'vitest';
import { situacaoDePrazo, agruparPlanejamentos, ordemDoPrazo } from '../utils/planejamentoGrupos';
import type { IndicadoresDePrazo } from '../utils/planejamentoIndicadores';

const base: IndicadoresDePrazo = {
    avancoFisicoPct: 10, previstoPct: 50, ev: 0, pv: 0, spi: 0.2, atrasadas: 3, atrasoDias: 12, avancoEquivaleA: '2026-11-03', terminoVencidoDias: null, criticas: 0, criticasAbertas: 0,
    inicioPrevisto: '2026-08-01', fimPrevisto: '2026-12-02', fimBaseline: '', desvioDias: null, temDatas: true, totalFolhas: 5,
};
const ind = (o: Partial<IndicadoresDePrazo>): IndicadoresDePrazo => ({ ...base, ...o });

describe('situacaoDePrazo — régua da Central de Comando (SPI ≥ 1 = no prazo)', () => {
    it('atrasado diz QUANTOS DIAS (cronograma ganho), não quantas tarefas', () => {
        expect(situacaoDePrazo(ind({})).texto).toBe('Atrasado · 12 dias');
        expect(situacaoDePrazo(ind({ atrasoDias: 1 })).texto).toBe('Atrasado · 1 dia');
        expect(situacaoDePrazo(ind({ atrasoDias: 0 })).texto).toBe('Atrasado · menos de 1 dia');
    });
    it('término vencido vem antes de tudo e diz há quantos dias', () => {
        const s = situacaoDePrazo(ind({ terminoVencidoDias: 213, spi: 0.24 }));
        expect(s).toMatchObject({ chave: 'vencido', rotulo: 'Término vencido', texto: 'Vencido há 213 dias', dias: 213 });
        expect(situacaoDePrazo(ind({ terminoVencidoDias: 0 })).texto).toBe('Vence hoje');
        expect(situacaoDePrazo(ind({ terminoVencidoDias: 5, avancoFisicoPct: 100 })).chave).toBe('concluido');
    });
    it('ordem da coluna Prazo: vencido há mais tempo, depois mais atrasado, depois no prazo', () => {
        const linhas = [
            ind({ spi: 1.1, atrasoDias: 0 }),
            ind({ atrasoDias: 3 }),
            ind({ terminoVencidoDias: 10 }),
            ind({ atrasoDias: 40 }),
            ind({ terminoVencidoDias: 200 }),
        ];
        const ordem = [...linhas].sort((a, b) => ordemDoPrazo(a) - ordemDoPrazo(b)).map(i => situacaoDePrazo(i).texto);
        expect(ordem).toEqual(['Vencido há 200 dias', 'Vencido há 10 dias', 'Atrasado · 40 dias', 'Atrasado · 3 dias', 'No prazo']);
    });
    it('no prazo, não começou, sem datas, concluído', () => {
        expect(situacaoDePrazo(ind({ spi: 1.02, atrasadas: 0 })).chave).toBe('no-prazo');
        expect(situacaoDePrazo(ind({ spi: null, atrasadas: 0 })).chave).toBe('nao-comecou');
        expect(situacaoDePrazo(ind({ spi: null, atrasadas: 2 })).chave).toBe('atrasado');
        expect(situacaoDePrazo(ind({ temDatas: false })).chave).toBe('sem-datas');
        expect(situacaoDePrazo(ind({ avancoFisicoPct: 100 })).chave).toBe('concluido');
    });
});

describe('agruparPlanejamentos', () => {
    const linhas = [
        { id: 'a', obra: 'Igreja', cli: 'Viver Bem', i: ind({}) },
        { id: 'b', obra: 'Garden', cli: '', i: ind({ spi: 1.1, atrasadas: 0, fimPrevisto: '2026-04-15' }) },
        { id: 'c', obra: '', cli: 'Viver Bem', i: undefined },
    ];
    const leitor = { indicadores: (p: typeof linhas[number]) => p.i, obra: (p: typeof linhas[number]) => p.obra, cliente: (p: typeof linhas[number]) => p.cli };

    it('Prazo: Atrasado antes de No prazo; sem indicador cai em "Calculando", por último', () => {
        const g = agruparPlanejamentos(linhas, 'prazo', 'asc', leitor);
        expect(g.map(x => `${x.label}:${x.itens.length}`)).toEqual(['Atrasado:1', 'No prazo:1', 'Calculando:1']);
    });
    it('Prazo com a busca falhada: as linhas sem indicador viram "Sem dados", não "Calculando"', () => {
        const g = agruparPlanejamentos(linhas, 'prazo', 'asc', { ...leitor, semIndicadores: 'Sem dados' });
        expect(g.at(-1)?.label).toBe('Sem dados');
    });
    it('Mês de término em ordem cronológica; sem término por último', () => {
        const g = agruparPlanejamentos(linhas, 'termino', 'asc', leitor);
        expect(g.map(x => x.label)).toEqual(['Abril/2026', 'Dezembro/2026', 'Sem término']);
    });
    it('Obra e cliente pelo texto da célula', () => {
        expect(agruparPlanejamentos(linhas, 'obra', 'asc', leitor).map(x => x.label)).toEqual(['Garden', 'Igreja', 'Sem obra vinculada']);
        expect(agruparPlanejamentos(linhas, 'cliente', 'asc', leitor).map(x => `${x.label}:${x.itens.length}`)).toEqual(['Viver Bem:2', 'Sem cliente:1']);
    });
});
