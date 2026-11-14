import { describe, it, expect } from 'vitest';
import { agruparOrcamentos, type LeitorDoOrcamento } from '../utils/orcamentoGrupos';

/**
 * "Agrupar" de Engenharia › Orçamentos (guia de UI §6.12, pedido de 2026-11-14):
 * Status, Status Obra (ordem do fluxo), Bloqueio (Bloqueado antes de Livre) e Tipo de Obra.
 * "Sem …" sempre por último, nos dois sentidos.
 */

interface Orc { id: string; status?: string; obra?: string; bloq?: boolean; tipo?: string }

const leitor: LeitorDoOrcamento<Orc> = {
    status: o => o.status,
    statusObra: o => o.obra,
    bloqueado: o => !!o.bloq,
    tipoObra: o => o.tipo,
};

const ORCS: Orc[] = [
    { id: 'a', status: 'Em andamento', obra: 'Não Iniciado', bloq: true, tipo: 'Residencial' },
    { id: 'b', status: 'Fechado', obra: 'Concluída', bloq: false },
    { id: 'c', status: 'EM ANDAMENTO', obra: 'Em andamento', bloq: true, tipo: 'Comercial' },
    { id: 'd', obra: undefined, bloq: false, tipo: 'Residencial' },
];

const rotulos = (g: ReturnType<typeof agruparOrcamentos<Orc>>) => g.map(x => `${x.label}:${x.itens.length}`);

describe('agruparOrcamentos', () => {
    it('status: alfabético, caixa diferente cai junto, sem status no fim', () => {
        expect(rotulos(agruparOrcamentos(ORCS, 'status', 'asc', leitor))).toEqual(['Em andamento:2', 'Fechado:1', 'Sem status:1']);
        expect(rotulos(agruparOrcamentos(ORCS, 'status', 'desc', leitor))).toEqual(['Fechado:1', 'Em andamento:2', 'Sem status:1']);
    });

    it('status da obra: ordem do fluxo, não alfabética', () => {
        expect(rotulos(agruparOrcamentos(ORCS, 'status-obra', 'asc', leitor)))
            .toEqual(['Não Iniciado:1', 'Em andamento:1', 'Concluída:1', 'Sem status da obra:1']);
        expect(rotulos(agruparOrcamentos(ORCS, 'status-obra', 'desc', leitor)))
            .toEqual(['Concluída:1', 'Em andamento:1', 'Não Iniciado:1', 'Sem status da obra:1']);
    });

    it('pedidos: "Com pedidos" antes de "Sem pedidos" (o texto da célula); Decrescente inverte', () => {
        expect(rotulos(agruparOrcamentos(ORCS, 'bloqueio', 'asc', leitor))).toEqual(['Com pedidos:2', 'Sem pedidos:2']);
        expect(rotulos(agruparOrcamentos(ORCS, 'bloqueio', 'desc', leitor))).toEqual(['Sem pedidos:2', 'Com pedidos:2']);
    });

    it('tipo de obra: alfabético, sem tipo no fim', () => {
        expect(rotulos(agruparOrcamentos(ORCS, 'tipo-obra', 'asc', leitor))).toEqual(['Comercial:1', 'Residencial:2', 'Sem tipo de obra:1']);
    });

    it('a linha mantém a ordem recebida dentro do grupo', () => {
        const g = agruparOrcamentos(ORCS, 'bloqueio', 'asc', leitor);
        expect(g[0].itens.map(o => o.id)).toEqual(['a', 'c']);
        expect(g[1].itens.map(o => o.id)).toEqual(['b', 'd']);
    });
});
