import { describe, it, expect } from 'vitest';
import { agruparRecebiveis, type LinhaAgrupavel } from '../utils/recebivelGrupos';

type Linha = LinhaAgrupavel & { id: string };

const r = (id: string, extra: Partial<Linha> = {}): Linha =>
    ({ id, effective_status: 'PREVISTO', amount: 10, due_date: '2026-07-10', ...extra } as Linha);

// Mesma ordem do STATUS_LABEL de ContasReceberManager.
const ROTULOS: Record<string, string> = {
    PREVISTO: 'Previsto', EMITIDO: 'Emitido', ENVIADO: 'Enviado', RECEBIDO: 'Recebido',
    PARCIAL: 'Parcial', VENCIDO: 'Vencido', RENEGOCIADO: 'Renegociado', CANCELADO: 'Cancelado',
};

describe('agruparRecebiveis', () => {
    it('sem agrupamento devolve um grupo só, na mesma ordem', () => {
        const g = agruparRecebiveis([r('1'), r('2')], 'none', ROTULOS);
        expect(g).toHaveLength(1);
        expect(g[0].itens.map(x => x.id)).toEqual(['1', '2']);
        expect(g[0].total).toBe(20);
    });

    it('cliente: grupos em ordem alfabética (Crescente), com contagem e total bruto; "Sem cliente" por último', () => {
        const lista = [
            r('1', { party_name: 'Maria', amount: 5 }),
            r('2'),
            r('3', { party_name: 'João', amount: 7 }),
            r('4', { party_name: 'Maria', amount: 1.5 }),
        ];
        const g = agruparRecebiveis(lista, 'cliente', ROTULOS);
        expect(g.map(x => x.label)).toEqual(['João', 'Maria', 'Sem cliente']);
        // Dentro do grupo, a ordem da lista recebida (a coluna ordenada) não muda.
        expect(g[1].itens.map(x => x.id)).toEqual(['1', '4']);
        expect(g[1].total).toBe(6.5);
    });

    it('Decrescente inverte os grupos de cada campo; "Sem …" continua por último', () => {
        const nomes = [r('1', { party_name: 'Maria' }), r('2'), r('3', { party_name: 'João' })];
        expect(agruparRecebiveis(nomes, 'cliente', ROTULOS, 'desc').map(x => x.label)).toEqual(['Maria', 'João', 'Sem cliente']);
        const status = [r('1', { effective_status: 'VENCIDO' }), r('2', { effective_status: 'PREVISTO' }), r('3', { effective_status: 'RECEBIDO' })];
        expect(agruparRecebiveis(status, 'status', ROTULOS, 'desc').map(x => x.label)).toEqual(['Vencido', 'Recebido', 'Previsto']);
        const meses = [r('1', { due_date: '2025-12-31' }), r('2', { due_date: undefined }), r('3', { due_date: '2026-09-01' })];
        expect(agruparRecebiveis(meses, 'vencimento', ROTULOS, 'desc').map(x => x.label)).toEqual(['Setembro/2026', 'Dezembro/2025', 'Sem vencimento']);
    });

    it('vencimento: um grupo por mês, em ordem cronológica, rótulo "Mês/AAAA"', () => {
        const lista = [r('1', { due_date: '2026-09-01' }), r('2', { due_date: '2025-12-31' }), r('3', { due_date: undefined }), r('4', { due_date: '2026-09-30' })];
        const g = agruparRecebiveis(lista, 'vencimento', ROTULOS);
        expect(g.map(x => x.label)).toEqual(['Dezembro/2025', 'Setembro/2026', 'Sem vencimento']);
        expect(g[1].itens.map(x => x.id)).toEqual(['1', '4']);
    });

    it('status: na ordem do mapa de rótulos da tela, com o rótulo da tela', () => {
        const lista = [r('1', { effective_status: 'VENCIDO' }), r('2', { effective_status: 'PREVISTO' }), r('3', { effective_status: 'RECEBIDO' })];
        expect(agruparRecebiveis(lista, 'status', ROTULOS).map(x => x.label)).toEqual(['Previsto', 'Recebido', 'Vencido']);
    });

    it('centro de custo e plano de contas usam o NOME resolvido pela tela', () => {
        const lista = [r('1', { cost_center_name: 'Obra Garden', plano_de_contas_name: '' }), r('2', { cost_center_name: '' })];
        expect(agruparRecebiveis(lista, 'centro_custo', ROTULOS).map(x => x.label)).toEqual(['Obra Garden', 'Sem centro de custo']);
        expect(agruparRecebiveis(lista, 'plano_contas', ROTULOS).map(x => x.label)).toEqual(['Sem plano de contas']);
    });

    it('empreendimento ainda não resolvido (null/undefined) cai em "Sem empreendimento"', () => {
        const lista = [r('1', { empreendimento_name: null }), r('2', { empreendimento_name: 'Altavista' })];
        expect(agruparRecebiveis(lista, 'empreendimento', ROTULOS).map(x => x.label)).toEqual(['Altavista', 'Sem empreendimento']);
    });

    it('nomes que diferem só em maiúsculas caem no mesmo grupo', () => {
        const g = agruparRecebiveis([r('1', { project_name: 'Garden' }), r('2', { project_name: 'GARDEN' })], 'obra', ROTULOS);
        expect(g).toHaveLength(1);
        expect(g[0].label).toBe('Garden');
    });

    it('valor vazio não vira NaN no total', () => {
        const g = agruparRecebiveis([r('1', { amount: null as unknown as number }), r('2', { amount: 3 })], 'status', ROTULOS);
        expect(g[0].total).toBe(3);
    });
});
