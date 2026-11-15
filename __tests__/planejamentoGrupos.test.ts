import { describe, expect, it } from 'vitest';
import { situacaoDePrazo, agruparPlanejamentos } from '../utils/planejamentoGrupos';
import type { IndicadoresDePrazo } from '../utils/planejamentoIndicadores';

const base: IndicadoresDePrazo = {
    avancoFisicoPct: 10, previstoPct: 50, ev: 0, pv: 0, spi: 0.2, atrasadas: 3, criticas: 0, criticasAbertas: 0,
    inicioPrevisto: '2026-08-01', fimPrevisto: '2026-12-02', fimBaseline: '', desvioDias: null, temDatas: true, totalFolhas: 5,
};
const ind = (o: Partial<IndicadoresDePrazo>): IndicadoresDePrazo => ({ ...base, ...o });

describe('situacaoDePrazo — régua da Central de Comando (SPI ≥ 1 = no prazo)', () => {
    it('atrasado diz quantas tarefas; singular e plural', () => {
        expect(situacaoDePrazo(ind({})).texto).toBe('Atrasado · 3 tarefas');
        expect(situacaoDePrazo(ind({ atrasadas: 1 })).texto).toBe('Atrasado · 1 tarefa');
        expect(situacaoDePrazo(ind({ atrasadas: 0 })).texto).toBe('Atrasado');
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
    it('Mês de término em ordem cronológica; sem término por último', () => {
        const g = agruparPlanejamentos(linhas, 'termino', 'asc', leitor);
        expect(g.map(x => x.label)).toEqual(['Abril/2026', 'Dezembro/2026', 'Sem término']);
    });
    it('Obra e cliente pelo texto da célula', () => {
        expect(agruparPlanejamentos(linhas, 'obra', 'asc', leitor).map(x => x.label)).toEqual(['Garden', 'Igreja', 'Sem obra vinculada']);
        expect(agruparPlanejamentos(linhas, 'cliente', 'asc', leitor).map(x => `${x.label}:${x.itens.length}`)).toEqual(['Viver Bem:2', 'Sem cliente:1']);
    });
});
