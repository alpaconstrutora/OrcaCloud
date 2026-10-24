import { describe, it, expect } from 'vitest';
import type { BankTransaction, InternalTransaction } from '../types';
import { agruparExtrato, agruparLancamentos, type NomesDoExtrato, type NomesDoLancamento } from '../utils/pendentesGrupos';
import { entradasDaPagina, linhasDaTela } from '../utils/agruparLinhas';

/**
 * "Agrupar" da aba Pendentes da Conciliação (Extrato e Lançamentos). Pedido de 24/10/2026,
 * docs/planos/2026-10-24-conciliacao-pendentes-agrupar.md.
 */

const banco = (id: string, o: Partial<BankTransaction>): BankTransaction => ({
    id, amount: 100, direction: 'DEBIT', transaction_date: '2026-09-10', ...o,
} as BankTransaction);

const lanc = (id: string, o: Partial<InternalTransaction>): InternalTransaction => ({
    id, amount: 100, direction: 'DEBIT', transaction_date: '2026-09-10', ...o,
} as InternalTransaction);

const OBRAS: Record<string, string> = { p1: 'Residencial Aurora', p2: 'Edifício Brisa' };
const nomesExtrato: NomesDoExtrato = {
    obra: tx => (tx.project_id ? OBRAS[tx.project_id] ?? '— outra organização —' : null),
    centroCusto: () => null,
};
const nomesLanc: NomesDoLancamento = {
    parte: tx => tx.entity_name ?? null,
    obra: tx => (tx.project_id ? OBRAS[tx.project_id] ?? null : null),
    centroCusto: () => null,
    data: tx => (tx as { due_date?: string | null }).due_date || tx.transaction_date,
};
const valorDe = (tx: InternalTransaction) => tx.amount;

describe('agruparExtrato', () => {
    const linhas = [
        banco('b1', { counterparty_name: 'Zeta Ltda', category: 'Material', amount: 300 }),
        banco('b2', { counterparty_name: 'alfa ME', category: 'Material', amount: 50, direction: 'CREDIT' }),
        banco('b3', { counterparty_name: 'ALFA ME', category: 'Serviço', amount: 20 }),
        banco('b4', { category: undefined, amount: 10 }),
    ];

    it('contraparte: A→Z sem caixa, "Sem …" por último', () => {
        const g = agruparExtrato(linhas, 'contraparte', nomesExtrato);
        expect(g.map(x => x.label)).toEqual(['alfa ME', 'Zeta Ltda', 'Sem cliente/credor']);
        expect(g[0].itens.map(i => i.id)).toEqual(['b2', 'b3']); // nomes que só diferem na caixa caem juntos
    });

    it('Decrescente inverte os grupos e mantém "Sem …" no fim', () => {
        const g = agruparExtrato(linhas, 'contraparte', nomesExtrato, 'desc');
        expect(g.map(x => x.label)).toEqual(['Zeta Ltda', 'alfa ME', 'Sem cliente/credor']);
    });

    it('total do grupo é o SALDO: crédito soma, débito subtrai', () => {
        const g = agruparExtrato(linhas, 'categoria', nomesExtrato);
        const material = g.find(x => x.label === 'Material')!;
        expect(material.total).toBe(-300 + 50);
        expect(g.find(x => x.label === 'Sem categoria')!.total).toBe(-10);
    });

    it('obra usa o texto da célula, inclusive o rótulo de obra de outra organização', () => {
        const g = agruparExtrato([
            banco('b1', { project_id: 'p2' }), banco('b2', { project_id: 'p1' }), banco('b3', { project_id: 'zzz' }), banco('b4', {}),
        ], 'obra', nomesExtrato);
        expect(g.map(x => x.label)).toEqual(['— outra organização —', 'Edifício Brisa', 'Residencial Aurora', 'Sem obra']);
    });

    it('data (mês) é cronológica, não alfabética, e inverte em Decrescente', () => {
        const porMes = [
            banco('a', { transaction_date: '2026-10-02' }), banco('b', { transaction_date: '2026-02-20' }), banco('c', { transaction_date: '2026-09-30' }),
        ];
        expect(agruparExtrato(porMes, 'data', nomesExtrato).map(x => x.label)).toEqual(['Fevereiro/2026', 'Setembro/2026', 'Outubro/2026']);
        expect(agruparExtrato(porMes, 'data', nomesExtrato, 'desc').map(x => x.label)).toEqual(['Outubro/2026', 'Setembro/2026', 'Fevereiro/2026']);
    });

    it('dentro do grupo, as linhas mantêm a ordem recebida (a coluna ordenada)', () => {
        const g = agruparExtrato([
            banco('x3', { category: 'A' }), banco('x1', { category: 'A' }), banco('x2', { category: 'A' }),
        ], 'categoria', nomesExtrato);
        expect(g[0].itens.map(i => i.id)).toEqual(['x3', 'x1', 'x2']);
    });
});

describe('agruparExtrato — campos só da aba Extrato', () => {
    const PLANOS: Record<string, string> = { pc1: '1.1.1 · PIS', pc2: '2.1 · Salários' };
    const nomes: NomesDoExtrato = {
        obra: () => null, centroCusto: () => null,
        planoContas: tx => (tx.plano_de_contas_id ? PLANOS[tx.plano_de_contas_id] ?? null : null),
        rotulosStatus: { IMPORTED: 'Importado', NORMALIZED: 'Normalizado', MATCHED: 'Conciliado', IGNORED: 'Ignorado' },
    };

    it('plano de contas: A→Z pelo rótulo da célula e "Sem plano de contas" no fim', () => {
        const g = agruparExtrato([
            banco('a', { plano_de_contas_id: 'pc2' }), banco('b', {}), banco('c', { plano_de_contas_id: 'pc1' }),
        ], 'plano_contas', nomes);
        expect(g.map(x => x.label)).toEqual(['1.1.1 · PIS', '2.1 · Salários', 'Sem plano de contas']);
    });

    it('organização: A→Z pelo nome que a coluna mostra e "Sem organização" no fim', () => {
        const ORGS: Record<string, string> = { o1: 'Zênite Engenharia', o2: 'Alpa Construtora' };
        const g = agruparExtrato([
            banco('a', { organization_id: 'o1' }), banco('b', { organization_id: 'o2' }), banco('c', { organization_id: 'x' }),
        ], 'organizacao', { ...nomes, organizacao: tx => ORGS[tx.organization_id] ?? null });
        expect(g.map(x => x.label)).toEqual(['Alpa Construtora', 'Zênite Engenharia', 'Sem organização']);
    });

    it('status: na ordem do fluxo (não alfabética) e inverte em Decrescente', () => {
        const linhas = [
            banco('a', { status: 'MATCHED' }), banco('b', { status: 'IMPORTED' }), banco('c', { status: 'IGNORED' }), banco('d', { status: 'NORMALIZED' }),
        ];
        expect(agruparExtrato(linhas, 'status', nomes).map(x => x.label)).toEqual(['Importado', 'Normalizado', 'Conciliado', 'Ignorado']);
        expect(agruparExtrato(linhas, 'status', nomes, 'desc').map(x => x.label)).toEqual(['Ignorado', 'Conciliado', 'Normalizado', 'Importado']);
    });
});

describe('agruparLancamentos', () => {
    const linhas = [
        lanc('l1', { entity_name: 'Beta', category: 'Aluguel', amount: 500, direction: 'CREDIT', transaction_date: '2026-08-01', ...({ due_date: '2026-10-05' } as object) }),
        lanc('l2', { entity_name: 'Beta', category: 'Aluguel', amount: 200, direction: 'DEBIT' }),
        lanc('l3', { entity_name: undefined, category: 'Taxa' }),
    ];

    it('Cliente/Credor: agrupa pelo nome resolvido e deixa os sem nome no fim', () => {
        const g = agruparLancamentos(linhas, 'parte', nomesLanc, valorDe);
        expect(g.map(x => x.label)).toEqual(['Beta', 'Sem cliente/credor']);
    });

    it('total usa o valor da coluna (líquido) com sinal pela direção', () => {
        const liquido = (tx: InternalTransaction) => (tx.id === 'l1' ? 450 : tx.amount);
        const g = agruparLancamentos(linhas, 'categoria', nomesLanc, liquido);
        expect(g.find(x => x.label === 'Aluguel')!.total).toBe(450 - 200);
    });

    it('data (mês) segue a data que a coluna mostra (vencimento antes da data do lançamento)', () => {
        const g = agruparLancamentos(linhas, 'data', nomesLanc, valorDe);
        expect(g.map(x => x.label)).toEqual(['Setembro/2026', 'Outubro/2026']);
        expect(g.find(x => x.label === 'Outubro/2026')!.itens.map(i => i.id)).toEqual(['l1']);
    });
});

describe('paginação sobre os grupos (como a tela usa)', () => {
    it('a página conta linhas de dado e o grupo recolhido sai da conta', () => {
        const linhas = ['A', 'A', 'A', 'B', 'B', 'C'].map((c, i) => banco(`b${i}`, { category: c }));
        const grupos = agruparExtrato(linhas, 'categoria', nomesExtrato);
        const recolhidos = new Set(['b']);
        expect(linhasDaTela(grupos, recolhidos).map(l => l.id)).toEqual(['b0', 'b1', 'b2', 'b5']);
        // página 1 de 2 linhas: cabeçalho A + 2 linhas; página 2: A (continua) + 1 linha, B recolhido, C + 1 linha
        const p1 = entradasDaPagina(grupos, recolhidos, 0, 2);
        expect(p1.map(e => (e.tipo === 'grupo' ? `G:${e.grupo.label}${e.continua ? '*' : ''}` : e.item.id))).toEqual(['G:A', 'b0', 'b1']);
        const p2 = entradasDaPagina(grupos, recolhidos, 2, 4);
        expect(p2.map(e => (e.tipo === 'grupo' ? `G:${e.grupo.label}${e.continua ? '*' : ''}` : e.item.id))).toEqual(['G:A*', 'b2', 'G:B', 'G:C', 'b5']);
    });
});
