/**
 * Mover um boleto de organização (24/09/2026).
 *
 * ─── O QUE ESTES CASOS PROVAM ───────────────────────────────────────────────
 *
 * O pedido nasceu de uma dúvida: "por que o boleto 0020 não mostra todos os
 * centros de custo, se o topo está em Todas as organizações?". Não era defeito
 * de filtro — o boleto pertence a UMA organização, e as dimensões oferecidas
 * são as dela. A resposta de produto foi dar um jeito de mudar a organização
 * do boleto, não de misturar catálogos de tenants diferentes.
 *
 * Duas coisas precisam ficar travadas, porque as duas perdem dinheiro em
 * silêncio se saírem erradas:
 *
 *  - **Só antes de existir título.** Aprovar cria a `internal_transaction` (e a
 *    nota) com o `organization_id` do boleto. Mover o boleto depois disso
 *    deixaria o título no caixa da org antiga e o documento na nova — e
 *    conciliação, rateio de condomínio e exercício encerrado passariam a olhar
 *    para lugares diferentes.
 *  - **As dimensões vão a zero.** Fornecedor, obra, centro de custo, plano de
 *    contas, conta financeira e plano contábil são FK para catálogo da org
 *    ANTIGA. Levá-los junto é o vazamento de tenant que o pedido queria evitar,
 *    só que gravado no banco em vez de exibido na tela.
 */
import { describe, expect, it, vi } from 'vitest';

type Linha = Record<string, unknown>;

const db: Record<string, Linha[]> = {};
const auditoria: Linha[] = [];

function filtrar(linhas: Linha[], filtros: Array<[string, unknown]>): Linha[] {
    return linhas.filter(l => filtros.every(([col, val]) => l[col] === val));
}

function query(tabela: string, modo: 'select' | 'update', patch: Linha = {}) {
    const filtros: Array<[string, unknown]> = [];
    const executar = () => {
        const linhas = filtrar(db[tabela] ?? [], filtros);
        if (modo === 'update') linhas.forEach(l => Object.assign(l, patch));
        return { data: linhas, error: null };
    };
    const api: any = {
        eq: (col: string, val: unknown) => (filtros.push([col, val]), api),
        select: () => api,
        single: async () => ({ data: executar().data[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: executar().data[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(executar()).then(resolve),
    };
    return api;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: () => query(tabela, 'select'),
            update: (patch: Linha) => query(tabela, 'update', patch),
            insert: async (linha: Linha) => {
                if (tabela === 'boletos_auditoria') auditoria.push(linha);
                return { data: null, error: null };
            },
        }),
    },
}));

import { boletoService } from '../services/boletoService';

const ORG_A = 'org-alpa';
const ORG_B = 'org-spe';

/** Boleto com TODAS as dimensões preenchidas — é isso que precisa cair. */
function cenario(status: string) {
    auditoria.length = 0;
    db.boletos = [{
        id: 'b1',
        numero: 20,
        organization_id: ORG_A,
        status,
        valor: 1500,
        vencimento: '2026-10-10',
        supplier_id: 'forn-da-org-a',
        project_id: 'obra-da-org-a',
        cost_center_id: 'cc-da-org-a',
        plano_de_contas_id: 'pc-da-org-a',
        category_id: 'cat-da-org-a',
        chart_of_accounts_id: 'coa-da-org-a',
        sugestao_supplier_id: 'forn-sugerido-org-a',
        sugestao_cc_id: 'cc-sugerido-org-a',
        sugestao_confianca: 88,
        created_at: '2026-09-01T00:00:00Z',
    }];
}

describe('quais status permitem trocar de organização', () => {
    it('rascunho e revisão sim; aprovado, pago e cancelado não', () => {
        expect(boletoService.podeMudarOrganizacao('rascunho')).toBe(true);
        expect(boletoService.podeMudarOrganizacao('revisao')).toBe(true);
        expect(boletoService.podeMudarOrganizacao('aprovado')).toBe(false);
        expect(boletoService.podeMudarOrganizacao('pago')).toBe(false);
        expect(boletoService.podeMudarOrganizacao('cancelado')).toBe(false);
    });

    /* Campo desabilitado sem motivo vira chamado. Cada status recusado diz o
       porquê, e onde existe caminho, o texto aponta o caminho. */
    it('cada status bloqueado tem motivo escrito, e o do pago aponta o caminho', () => {
        expect(boletoService.motivoParaNaoMudarOrganizacao('rascunho')).toBeNull();
        expect(boletoService.motivoParaNaoMudarOrganizacao('revisao')).toBeNull();
        expect(boletoService.motivoParaNaoMudarOrganizacao('aprovado')).toMatch(/título no financeiro/i);
        expect(boletoService.motivoParaNaoMudarOrganizacao('pago')).toMatch(/reverta para rascunho/i);
        expect(boletoService.motivoParaNaoMudarOrganizacao('cancelado')).toMatch(/histórico/i);
    });
});

describe('recusa depois que o título existe', () => {
    it.each(['aprovado', 'pago', 'cancelado'])('recusa %s sem tocar no registro', async (status) => {
        cenario(status);
        await expect(boletoService.moverParaOrganizacao('b1', ORG_A, ORG_B))
            .rejects.toThrow(/organização/i);
        expect(db.boletos[0].organization_id).toBe(ORG_A);
        expect(db.boletos[0].cost_center_id).toBe('cc-da-org-a');
        expect(auditoria).toHaveLength(0);
    });
});

describe('mover um rascunho', () => {
    it('troca a organização e zera TODA dimensão da org antiga', async () => {
        cenario('rascunho');
        const movido = await boletoService.moverParaOrganizacao('b1', ORG_A, ORG_B, 'quem@fez.com');

        expect(movido.organization_id).toBe(ORG_B);
        for (const campo of [
            'supplier_id', 'project_id', 'cost_center_id', 'plano_de_contas_id',
            'category_id', 'chart_of_accounts_id', 'sugestao_supplier_id', 'sugestao_cc_id',
        ]) {
            expect(db.boletos[0][campo], `${campo} ficou apontando para a org antiga`).toBeNull();
        }
        // O que NÃO é dimensão de org continua intacto — mover não é recapturar.
        expect(db.boletos[0].valor).toBe(1500);
        expect(db.boletos[0].vencimento).toBe('2026-10-10');
        expect(db.boletos[0].numero).toBe(20);
    });

    it('registra a mudança na auditoria, com de-onde e para-onde', async () => {
        cenario('rascunho');
        await boletoService.moverParaOrganizacao('b1', ORG_A, ORG_B, 'quem@fez.com');

        expect(auditoria).toHaveLength(1);
        expect(auditoria[0]).toMatchObject({
            boleto_id: 'b1',
            organization_id: ORG_B,
            acao: 'mudanca_organizacao',
            campo: 'organization_id',
            valor_antes: ORG_A,
            valor_depois: ORG_B,
            metodo: 'usuario',
            usuario_email: 'quem@fez.com',
        });
    });

    it('escolher a mesma organização não limpa nada nem audita', async () => {
        cenario('rascunho');
        const mesmo = await boletoService.moverParaOrganizacao('b1', ORG_A, ORG_A);

        expect(mesmo.organization_id).toBe(ORG_A);
        expect(db.boletos[0].cost_center_id).toBe('cc-da-org-a');
        expect(auditoria).toHaveLength(0);
    });

    it('destino vazio é recusado antes de qualquer escrita', async () => {
        cenario('rascunho');
        await expect(boletoService.moverParaOrganizacao('b1', ORG_A, ''))
            .rejects.toThrow(/selecione a organização/i);
        expect(db.boletos[0].organization_id).toBe(ORG_A);
    });
});
