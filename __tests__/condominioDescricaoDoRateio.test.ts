/**
 * De onde sai a DESCRIÇÃO de uma despesa dentro de um rateio.
 *
 * `condominio_rateio_despesas.descricao` é uma cópia tirada quando o rateio foi
 * criado. Para um rateio FECHADO isso é certo: é o documento que o condômino
 * recebeu, e documento não se reescreve sozinho. Num RASCUNHO a cópia
 * envelhece — medido em 26/09/2026, as 38 despesas de rateio da base divergiam
 * do lançamento, porque as descrições boas ("Consumo de Energia") foram
 * escritas depois.
 *
 * A regra que estes testes travam: rascunho segue o lançamento, fechado e
 * cancelado seguem o snapshot, e o fechamento CONGELA o que o rascunho mostrava.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const base = () => ({
    condominio_rateios: [
        { id: 'r-rascunho', status: 'RASCUNHO', organization_id: 'org', empreendimento_id: 'emp', cost_center_id: 'cc', number: null },
        { id: 'r-fechado', status: 'FECHADO', organization_id: 'org', empreendimento_id: 'emp', cost_center_id: 'cc', number: '0001' },
        { id: 'r-cancelado', status: 'CANCELADO', organization_id: 'org', empreendimento_id: 'emp', cost_center_id: 'cc', number: '0002' },
    ],
    condominio_rateio_despesas: [
        // O caso real: snapshot cru, lançamento já corrigido à mão.
        { id: 'd1', rateio_id: 'r-rascunho', transaction_id: 't1', descricao: 'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA', valor: 350 },
        // Snapshot que é nome de arquivo.
        { id: 'd2', rateio_id: 'r-rascunho', transaction_id: 't2', descricao: 'documento_3054431_21_05_2020.pdf', valor: 118 },
        // Despesa sem lançamento de origem: só existe o snapshot.
        { id: 'd3', rateio_id: 'r-rascunho', transaction_id: null, descricao: 'Reembolso do síndico', valor: 40 },
        // Mesmos lançamentos, mas num rateio FECHADO.
        { id: 'd4', rateio_id: 'r-fechado', transaction_id: 't1', descricao: 'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA', valor: 350 },
        { id: 'd5', rateio_id: 'r-cancelado', transaction_id: 't1', descricao: 'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA', valor: 350 },
    ],
    internal_transactions: [
        { id: 't1', description: 'Manutençao do Elevador', supplier_id: 'f-mn', party_name: 'MN CONSERVAÇÃO ELEVADORES LTDA CNPJ: 07.604.526/0001-20', source_system: 'BOLETO', reference_id: 'b-705' },
        // Descrição viva que é nome de arquivo: o CREDOR é a segunda chance.
        { id: 't2', description: 'download (98).pdf', supplier_id: null, party_name: 'ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A. CADASTRE' },
    ],
    suppliers: [{ id: 'f-mn', name: 'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA' }],
    boletos: [{ id: 'b-705', numero: 705, documento_path: 'org/705.pdf', documento_nome: 'elevador-julho.pdf' }],
});

let tabelas = base();
const escritas: { tabela: string; dados: Linha; onde: Linha }[] = [];

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let alvo: Linha | null = null;
    const q: any = {
        select() { return q; },
        update(dados: Linha) { alvo = dados; return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        is(k: string, v: unknown) { preds.push(r => r[k] == v); return q; },
        order() { return q; },
        single() {
            const linhas = (tabelas as any)[table].filter((r: Linha) => preds.every(p => p(r)));
            return Promise.resolve({ data: linhas[0] ?? null, error: linhas[0] ? null : { message: 'nada' } });
        },
        then(resolve: (v: { data: Linha[]; error: null }) => unknown) {
            const linhas = (tabelas as any)[table].filter((r: Linha) => preds.every(p => p(r)));
            if (alvo) {
                for (const l of linhas) Object.assign(l, alvo);
                escritas.push({ tabela: table, dados: alvo, onde: { n: linhas.length } });
            }
            return Promise.resolve(resolve({ data: linhas, error: null }));
        },
    };
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/empreendimentoService', () => ({ empreendimentoService: {} }));
vi.mock('../services/documentNumbering', () => ({ generateDocumentNumber: async () => '0003' }));

import { condominioRateioService } from '../services/condominioRateioService';

beforeEach(() => { tabelas = base(); escritas.length = 0; });

describe('RASCUNHO segue o lançamento', () => {
    it('a descrição corrigida no lançamento aparece no rateio, no lugar do snapshot cru', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd1')!.descricao).toBe('Manutençao do Elevador');
    });

    it('lançamento cuja descrição é nome de arquivo cai no CREDOR, como na aba Despesas', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        // Sem essa segunda chance, esta linha virava "Despesa sem descrição"
        // aqui e mostrava a Energisa na aba Despesas.
        expect(ds.find(d => d.id === 'd2')!.descricao).toContain('ENERGISA');
        expect(ds.find(d => d.id === 'd2')!.descricao).not.toContain('.pdf');
    });

    it('despesa sem lançamento de origem mantém o snapshot — é o único lugar que existe', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd3')!.descricao).toBe('Reembolso do síndico');
    });
});

describe('FECHADO e CANCELADO seguem o snapshot', () => {
    it('rateio fechado NÃO se reescreve: é o documento que o condômino recebeu', async () => {
        const ds = await condominioRateioService.listarDespesas('r-fechado');
        expect(ds[0].descricao).toContain('MN CONSERVACAO DE ELEVADORES');
        expect(ds[0].descricao).not.toBe('Manutençao do Elevador');
    });

    it('cancelado idem — o histórico não muda por ter sido cancelado', async () => {
        const ds = await condominioRateioService.listarDespesas('r-cancelado');
        expect(ds[0].descricao).not.toBe('Manutençao do Elevador');
    });
});

describe('fechar CONGELA o que o rascunho mostrava', () => {
    it('o snapshot passa a ter o texto do lançamento', async () => {
        await condominioRateioService.fechar('r-rascunho');
        const gravado = tabelas.condominio_rateio_despesas.find(d => d.id === 'd1')!;
        expect(gravado.descricao).toBe('Manutençao do Elevador');
    });

    it('depois de fechado, a lista devolve o texto congelado — e não muda mais', async () => {
        await condominioRateioService.fechar('r-rascunho');
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd1')!.descricao).toBe('Manutençao do Elevador');
    });

    it('despesa sem lançamento não é tocada no congelamento', async () => {
        await condominioRateioService.fechar('r-rascunho');
        expect(tabelas.condominio_rateio_despesas.find(d => d.id === 'd3')!.descricao)
            .toBe('Reembolso do síndico');
    });
});

describe('a edição corrige o LANÇAMENTO, não o rateio', () => {
    it('com `transaction_id`, escreve em internal_transactions', async () => {
        await condominioRateioService.atualizarDescricaoDespesa('d1', 'Elevador — contrato mensal', 't1');
        expect(tabelas.internal_transactions.find(t => t.id === 't1')!.description)
            .toBe('Elevador — contrato mensal');
        // e NÃO no snapshot
        expect(tabelas.condominio_rateio_despesas.find(d => d.id === 'd1')!.descricao)
            .toContain('MN CONSERVACAO');
    });

    it('a correção alcança os OUTROS rateios em rascunho que usam o mesmo lançamento', async () => {
        await condominioRateioService.atualizarDescricaoDespesa('d1', 'Elevador — contrato mensal', 't1');
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd1')!.descricao).toBe('Elevador — contrato mensal');
    });

    it('sem `transaction_id`, grava no snapshot — é o único lugar que existe', async () => {
        await condominioRateioService.atualizarDescricaoDespesa('d3', 'Reembolso de material', null);
        expect(tabelas.condominio_rateio_despesas.find(d => d.id === 'd3')!.descricao)
            .toBe('Reembolso de material');
    });

    it('descrição vazia é recusada antes de qualquer escrita', async () => {
        await expect(condominioRateioService.atualizarDescricaoDespesa('d1', '   ', 't1')).rejects.toThrow();
        expect(tabelas.internal_transactions.find(t => t.id === 't1')!.description)
            .toBe('Manutençao do Elevador');
    });
});

describe('o COMPROVANTE chega até o relatório', () => {
    it('despesa de origem BOLETO traz o arquivo, com o bucket', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd1')!.documento).toEqual({
            bucket: 'boletos', path: 'org/705.pdf', nome: 'elevador-julho.pdf',
        });
    });

    it('rateio FECHADO também traz o comprovante — a prova não muda com o status', async () => {
        const ds = await condominioRateioService.listarDespesas('r-fechado');
        expect(ds[0].documento?.path).toBe('org/705.pdf');
    });

    it('despesa sem lançamento não inventa comprovante', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        expect(ds.find(d => d.id === 'd3')!.documento).toBeNull();
    });

    it('despesa cuja origem não tem arquivo fica sem comprovante', async () => {
        const ds = await condominioRateioService.listarDespesas('r-rascunho');
        // t2 não tem source_system/reference_id no dublê
        expect(ds.find(d => d.id === 'd2')!.documento).toBeNull();
    });
});
