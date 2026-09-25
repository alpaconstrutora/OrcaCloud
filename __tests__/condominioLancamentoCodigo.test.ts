/**
 * Coluna "Código" da aba Despesas do condomínio.
 *
 * O código é o do DOCUMENTO de origem — hoje o nº do boleto, com os mesmos 4
 * dígitos que a Conciliação Bancária imprime (`loadOriginCodes` em
 * `components/BankReconciliation.tsx`). O risco que estes testes travam é o
 * mesmo dos dois lados: o nº ser formatado diferente em cada tela, e o
 * lançamento sem código inventar um a partir do uuid.
 *
 * Dublê em memória do cliente Supabase, só com a cadeia que `listarLancamentos`
 * usa (from/select/eq/in/gte/lt/order/then).
 */
import { describe, it, expect, vi } from 'vitest';

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {
    cost_centers_v2: [
        { id: 'cc-a', code: '011', name: 'Bella Vista', empreendimento_id: 'emp-bv' },
    ],
    internal_transactions: [
        { id: 't1', description: 'Elevador', amount: 362.33, transaction_date: '2026-09-10', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-705', party_name: 'MN CONSERVAÇÃO ELEVADORES COM PEÇAS LTDA   CNPJ: 07.604.526/0001-20  Rua Francisco', supplier_id: 'f-mn' },
        // numero de 1 dígito: tem de sair com 4, como na Conciliação.
        { id: 't2', description: 'Água', amount: 99.61, transaction_date: '2026-09-11', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-6', party_name: 'Copasa' },
        // origem sem código próprio → null, nunca o uuid.
        { id: 't3', description: 'Reembolso', amount: 40, transaction_date: '2026-09-12', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'MANUAL', reference_id: null, party_name: 'Síndico' },
        // BOLETO cujo registro sumiu de `boletos` (RLS ou exclusão): null, e a
        // linha continua na lista — a despesa existe mesmo sem o documento.
        // O caso do boleto 1383 em produção: sem nome nenhum no lançamento,
        // mas COM `supplier_id` — a coluna mostrava "—" com o vínculo feito.
        { id: 't4', description: 'download (98).pdf', amount: 72.14, transaction_date: '2026-09-13', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-sumido', party_name: null, entity_name: null, supplier_id: 'f-en' },
        // Sem fornecedor cadastrado: sobra o texto cru, podado.
        { id: 't5', description: 'Zeladoria', amount: 200, transaction_date: '2026-09-14', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: null, party_name: 'NEW GRAN ROCHAS LTDA CNPJ: 12.345.678/0001-90 Av. Brasil 900', supplier_id: null },
        // Cadastro com nome em branco não pode ganhar do texto cru.
        { id: 't6', description: 'Jardim', amount: 80, transaction_date: '2026-09-15', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: null, party_name: 'JARDINAGEM SILVA LTDA', supplier_id: 'f-branco' },
    ],
    boletos: [
        { id: 'b-705', numero: 705, documento_path: 'org/705.pdf', documento_nome: 'elevador-julho.pdf' },
        { id: 'b-6', numero: 6, documento_path: 'org/6.pdf', documento_nome: 'download (98).pdf' },
        { id: 'b-nulo', numero: null, documento_path: null, documento_nome: null },
        // Arquivo sem nome: ainda é arquivo.
        { id: 'b-sem-nome', numero: 12, documento_path: 'org/12.pdf', documento_nome: '   ' },
        // Nome sem arquivo: não há o que abrir.
        { id: 'b-so-nome', numero: 13, documento_path: '  ', documento_nome: 'fantasma.pdf' },
    ],
    suppliers: [
        { id: 'f-mn', name: 'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA' },
        { id: 'f-en', name: 'Energisa' },
        { id: 'f-branco', name: '   ' },
    ],
    condominio_rateio_despesas: [],
};

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let ordem: { campo: string; asc: boolean } | null = null;
    const q: any = {
        select() { return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        is(k: string, v: unknown) { preds.push(r => r[k] == v); return q; },
        neq(k: string, v: unknown) {
            preds.push(r => {
                const valor = k.split('.').reduce<unknown>(
                    (acc, parte) => (acc == null ? acc : (acc as Linha)[parte]), r);
                return valor !== v;
            });
            return q;
        },
        gte(k: string, v: string) { preds.push(r => String(r[k]) >= v); return q; },
        lt(k: string, v: string) { preds.push(r => String(r[k]) < v); return q; },
        order(campo: string, o?: { ascending?: boolean }) { ordem = { campo, asc: o?.ascending !== false }; return q; },
        then(resolve: (v: { data: Linha[]; error: null }) => unknown) {
            let rows = (tabelas[table] ?? []).filter(r => preds.every(p => p(r)));
            if (ordem) rows = [...rows].sort((a, b) => String(a[ordem!.campo]).localeCompare(String(b[ordem!.campo])) * (ordem!.asc ? 1 : -1));
            return Promise.resolve(resolve({ data: rows, error: null }));
        },
    };
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: { listAllUnitsForEmpreendimento: async () => [] },
}));

import { condominioRateioService } from '../services/condominioRateioService';

const carregar = () => condominioRateioService.listarLancamentos({
    costCenterIds: ['cc-a'],
    competencia: '2026-09-01',
});

describe('listarLancamentos — coluna Código', () => {
    it('boleto traz o nº com 4 dígitos, igual à Conciliação Bancária', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't1')!.codigo).toBe('0705');
    });

    it('nº de um dígito também sai com 4 — senão a mesma tela mostra "6" e "0705" lado a lado', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't2')!.codigo).toBe('0006');
    });

    it('origem sem código próprio fica null — nunca o uuid do lançamento', async () => {
        const l = await carregar();
        const t3 = l.find(x => x.id === 't3')!;
        expect(t3.codigo).toBeNull();
        expect(t3.descricao).toContain('Reembolso');
    });

    it('boleto que não volta de `boletos` fica sem código, mas a despesa CONTINUA na lista', async () => {
        const l = await carregar();
        const t4 = l.find(x => x.id === 't4');
        expect(t4).toBeDefined();
        expect(t4!.codigo).toBeNull();
        expect(l).toHaveLength(6);
    });
});

describe('dadosDoBoleto', () => {
    it('`numero` nulo não vira a string "null"', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-nulo']);
        expect(m.get('b-nulo')!.codigo).toBeNull();
    });

    it('lista vazia não consulta nada e devolve mapa vazio', async () => {
        expect((await condominioRateioService.dadosDoBoleto([])).size).toBe(0);
    });

    it('id repetido é consultado uma vez só', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-705', 'b-705', 'b-6']);
        expect([...m.keys()].sort()).toEqual(['b-6', 'b-705']);
        expect(m.get('b-705')!.codigo).toBe('0705');
    });

    it('traz o PATH do arquivo, nunca uma URL — o bucket é privado e a assinatura expira', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-705']);
        const d = m.get('b-705')!;
        expect(d.documentoPath).toBe('org/705.pdf');
        expect(d.documentoPath).not.toMatch(/^https?:/);
    });

    it('arquivo sem nome ainda é arquivo: rótulo cai para "Documento", link não se perde', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-sem-nome']);
        expect(m.get('b-sem-nome')).toMatchObject({ documentoPath: 'org/12.pdf', documentoNome: 'Documento' });
    });

    it('nome sem arquivo não vira link: não há o que abrir', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-so-nome']);
        expect(m.get('b-so-nome')).toMatchObject({ documentoPath: null, documentoNome: null });
    });
});

describe('listarLancamentos — coluna Documento', () => {
    it('boleto com arquivo traz path e nome na linha', async () => {
        const l = await carregar();
        const t1 = l.find(x => x.id === 't1')!;
        expect(t1.documentoPath).toBe('org/705.pdf');
        expect(t1.documentoNome).toBe('elevador-julho.pdf');
    });

    it('origem que não é BOLETO não tenta buscar documento', async () => {
        const l = await carregar();
        const t3 = l.find(x => x.id === 't3')!;
        expect(t3.documentoPath).toBeNull();
        expect(t3.documentoNome).toBeNull();
    });

    it('boleto que não volta de `boletos` fica sem documento, e a despesa CONTINUA na lista', async () => {
        const l = await carregar();
        const t4 = l.find(x => x.id === 't4')!;
        expect(t4.documentoPath).toBeNull();
        expect(l).toHaveLength(6);
    });
});

describe('listarLancamentos — coluna Fornecedor', () => {
    it('lançamento SEM party_name/entity_name mostra o fornecedor cadastrado (o caso do boleto 1383)', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't4')!.fornecedor).toBe('Energisa');
    });

    it('o cadastrado GANHA do bloco de OCR — senão a Conciliação e o condomínio nomeiam o mesmo título diferente', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't1')!.fornecedor)
            .toBe('MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA');
    });

    it('sem fornecedor cadastrado, o texto cru vai PODADO — não com CNPJ e endereço colados', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't5')!.fornecedor).toBe('NEW GRAN ROCHAS LTDA');
    });

    it('cadastro com nome em branco não apaga o texto cru', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't6')!.fornecedor).toBe('JARDINAGEM SILVA LTDA');
    });

    it('sem nome em lugar nenhum a coluna fica vazia — nunca "null" nem o uuid', async () => {
        const l = await carregar();
        const t3 = l.find(x => x.id === 't3')!;
        expect(t3.fornecedor).toBe('Síndico');
        const semNada = l.filter(x => x.fornecedor.includes('null') || x.fornecedor.includes('-4'));
        expect(semNada).toEqual([]);
    });
});

describe('nomesDeFornecedor', () => {
    it('lista vazia devolve mapa vazio, sem consultar', async () => {
        expect((await condominioRateioService.nomesDeFornecedor([])).size).toBe(0);
    });

    it('nome só com espaços não entra no mapa', async () => {
        const m = await condominioRateioService.nomesDeFornecedor(['f-branco']);
        expect(m.has('f-branco')).toBe(false);
    });
});
