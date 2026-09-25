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
        // Origem NFE: o documento é o XML, noutro bucket.
        { id: 't7', description: 'NF-e Portobello', amount: 500, transaction_date: '2026-09-16', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'NFE', reference_id: 'nf-1', party_name: 'PBG S/A' },
        { id: 't8', description: 'NF-e sem XML', amount: 20, transaction_date: '2026-09-17', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'NFE', reference_id: 'nf-sem-raw', party_name: 'Sem XML' },
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
    nfe_invoices: [
        // Chave real de 44 dígitos: nNF = posições 25..33 = 001600910.
        { id: 'nf-1', raw_document_id: 'raw-1', access_key: '42170783475913000272550010016009101078977179' },
        // Nota sem documento bruto: não há XML a oferecer, mas o número existe.
        { id: 'nf-sem-raw', raw_document_id: null, access_key: '42161083475913000272550010014949371075651897' },
        // Chave truncada (já apareceu vindo de OCR): sem número inventado.
        { id: 'nf-chave-curta', raw_document_id: 'raw-1', access_key: '4217078347591300' },
    ],
    raw_documents: [
        { id: 'raw-1', file_path: 'org/2026/PORTOBELLO-NFe4217078347591300027255.xml' },
    ],
    contracts: [
        // Alvo 1: a referência é o próprio contrato (CONTRACT_AVISTA/PARCELADO).
        { id: '11111111-1111-4111-8111-111111111111', number: 'CT-2026-001', deal_id: null },
        // Alvo 2: a referência é o NEGÓCIO (COMMERCIAL).
        { id: '22222222-2222-4222-8222-222222222222', number: 'CT-2026-002', deal_id: '33333333-3333-4333-8333-333333333333' },
    ],
    contract_document_versions: [
        // v1 tem arquivo; v2 é registro SEM arquivo — a v2 não pode ganhar.
        { contract_id: '11111111-1111-4111-8111-111111111111', v: 1, name: 'Minuta — contrato 001', storage_path: 'contract-minutas/111/a.pdf' },
        { contract_id: '11111111-1111-4111-8111-111111111111', v: 2, name: 'Minuta sem arquivo', storage_path: null },
        { contract_id: '22222222-2222-4222-8222-222222222222', v: 1, name: 'Minuta antiga', storage_path: 'contract-minutas/222/v1.pdf' },
        { contract_id: '22222222-2222-4222-8222-222222222222', v: 3, name: 'Minuta atual', storage_path: 'contract-minutas/222/v3.pdf' },
    ],
};

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let ordem: { campo: string; asc: boolean } | null = null;
    const q: any = {
        select() { return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        // `or('id.in.(a,b),deal_id.in.(a,b)')` — só a forma que o serviço usa.
        or(expr: string) {
            const alvos = [...expr.matchAll(/([a-z_]+)\.in\.\(([^)]*)\)/g)]
                .map(m => ({ campo: m[1], valores: m[2].split(',').filter(Boolean) }));
            preds.push(r => alvos.some(a => a.valores.includes(String(r[a.campo] ?? ''))));
            return q;
        },
        not(k: string, op: string, v: unknown) {
            if (op === 'is' && v === null) preds.push(r => r[k] != null);
            return q;
        },
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
        limit() { return q; },
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

import { condominioRateioService, numeroDaChaveNfe, uuidDaReferencia } from '../services/condominioRateioService';

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
        expect(l).toHaveLength(8);
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

    it('traz o PATH e o BUCKET, nunca uma URL — o bucket é privado e a assinatura expira', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-705']);
        const d = m.get('b-705')!.documento!;
        expect(d).toEqual({ bucket: 'boletos', path: 'org/705.pdf', nome: 'elevador-julho.pdf' });
        expect(d.path).not.toMatch(/^https?:/);
    });

    it('arquivo sem nome ainda é arquivo: o rótulo cai para o nome no path', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-sem-nome']);
        expect(m.get('b-sem-nome')!.documento).toEqual({ bucket: 'boletos', path: 'org/12.pdf', nome: '12.pdf' });
    });

    it('nome sem arquivo não vira link: não há o que abrir', async () => {
        const m = await condominioRateioService.dadosDoBoleto(['b-so-nome']);
        expect(m.get('b-so-nome')!.documento).toBeNull();
    });
});

describe('dadosDaNfe — a origem NFE traz o XML e o número', () => {
    it('resolve `nfe_invoices` → `raw_documents` e devolve o XML no bucket fiscal', async () => {
        const m = await condominioRateioService.dadosDaNfe(['nf-1']);
        expect(m.get('nf-1')!.documento).toEqual({
            bucket: 'fiscal-documents',
            path: 'org/2026/PORTOBELLO-NFe4217078347591300027255.xml',
            nome: 'PORTOBELLO-NFe4217078347591300027255.xml',
        });
    });

    it('bucket da NF-e é OUTRO: assinar no bucket de boleto devolveria 404', async () => {
        const nfe = (await condominioRateioService.dadosDaNfe(['nf-1'])).get('nf-1')!.documento!;
        const boleto = (await condominioRateioService.dadosDoBoleto(['b-705'])).get('b-705')!.documento!;
        expect(nfe.bucket).not.toBe(boleto.bucket);
    });

    it('nota sem documento bruto fica SEM XML, mas com o número — o código sai da chave, não do arquivo', async () => {
        const m = await condominioRateioService.dadosDaNfe(['nf-sem-raw']);
        expect(m.get('nf-sem-raw')).toEqual({ codigo: '1494937', documento: null });
    });

    it('lista vazia não consulta nada', async () => {
        expect((await condominioRateioService.dadosDaNfe([])).size).toBe(0);
    });
});

describe('numeroDaChaveNfe', () => {
    it('extrai o nNF das posições 25..33 da chave de 44 dígitos', () => {
        expect(numeroDaChaveNfe('42170783475913000272550010016009101078977179')).toBe('1600910');
    });

    it('ignora pontuação na chave', () => {
        expect(numeroDaChaveNfe('4217 0783 4759 1300 0272 5500 1001 6009 1010 7897 7179')).toBe('1600910');
    });

    it('chave truncada NÃO vira número inventado', () => {
        expect(numeroDaChaveNfe('4217078347591300')).toBeNull();
        expect(numeroDaChaveNfe('')).toBeNull();
        expect(numeroDaChaveNfe(null)).toBeNull();
    });
});

describe('listarLancamentos — coluna Documento', () => {
    it('boleto traz o documento no bucket de boletos', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't1')!.documento).toEqual({
            bucket: 'boletos', path: 'org/705.pdf', nome: 'elevador-julho.pdf',
        });
    });

    it('NF-e traz o XML no bucket fiscal — MESMA lista, buckets diferentes', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't7')!.documento).toMatchObject({
            bucket: 'fiscal-documents',
            nome: 'PORTOBELLO-NFe4217078347591300027255.xml',
        });
    });

    it('NF-e sem XML fica sem documento, mas a despesa CONTINUA na lista', async () => {
        const l = await carregar();
        const t8 = l.find(x => x.id === 't8');
        expect(t8).toBeDefined();
        expect(t8!.documento).toBeNull();
    });

    it('origem sem resolvedor (MANUAL) não tenta buscar documento', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't3')!.documento).toBeNull();
    });

    it('boleto que não volta de `boletos` fica sem documento, e a despesa CONTINUA na lista', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't4')!.documento).toBeNull();
        expect(l).toHaveLength(8);
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

describe('dadosDeContrato — COMMERCIAL e CONTRACT_* trazem a minuta', () => {
    const CONTRATO = '11111111-1111-4111-8111-111111111111';
    const NEGOCIO = '33333333-3333-4333-8333-333333333333';

    it('referência = o próprio contrato (CONTRACT_AVISTA): acha pelo `id`', async () => {
        const m = await condominioRateioService.dadosDeContrato([CONTRATO]);
        expect(m.get(CONTRATO)).toEqual({
            codigo: 'CT-2026-001',
            documento: { bucket: 'documents', path: 'contract-minutas/111/a.pdf', nome: 'Minuta — contrato 001' },
        });
    });

    it('referência = o NEGÓCIO (COMMERCIAL): acha pelo `deal_id`', async () => {
        const m = await condominioRateioService.dadosDeContrato([NEGOCIO]);
        expect(m.get(NEGOCIO)!.codigo).toBe('CT-2026-002');
    });

    it('a versão mais recente COM arquivo ganha — registro sem `storage_path` não conta', async () => {
        // O contrato 001 tem v2, mas sem arquivo: tem de vir a v1.
        const m = await condominioRateioService.dadosDeContrato([CONTRATO]);
        expect(m.get(CONTRATO)!.documento!.path).toBe('contract-minutas/111/a.pdf');
        // O 002 tem v1 e v3, ambas com arquivo: vem a v3.
        const m2 = await condominioRateioService.dadosDeContrato([NEGOCIO]);
        expect(m2.get(NEGOCIO)!.documento!.path).toBe('contract-minutas/222/v3.pdf');
    });

    it('as TRÊS grafias de referência acham o mesmo contrato', async () => {
        const grafias = [
            `${CONTRATO}:p3`,                    // contrato parcelado
            `${CONTRATO}-p2020-11-15`,           // série de locação
            `tax-${CONTRATO}-p2028-05-20-cofins`, // tributo sobre locação
        ];
        const m = await condominioRateioService.dadosDeContrato(grafias);
        for (const g of grafias) expect(m.get(g)!.codigo).toBe('CT-2026-001');
    });

    it('referência sem UUID não consulta nada — é assim que nascia o 22P02', async () => {
        const m = await condominioRateioService.dadosDeContrato(['sem-uuid-nenhum', '']);
        expect(m.size).toBe(0);
    });

    it('contrato desconhecido não inventa documento', async () => {
        const m = await condominioRateioService.dadosDeContrato(['99999999-9999-4999-8999-999999999999']);
        expect(m.size).toBe(0);
    });
});

describe('uuidDaReferencia', () => {
    it('acha o UUID mesmo com prefixo antes dele (`tax-…`)', () => {
        expect(uuidDaReferencia('tax-b4cab803-b898-483a-b6b6-bb4975e0ae9f-p2028-05-20-cofins'))
            .toBe('b4cab803-b898-483a-b6b6-bb4975e0ae9f');
    });

    it('acha nas grafias `:pN` e `-pAAAA-MM-DD`', () => {
        expect(uuidDaReferencia('dbb274e7-59e2-494a-bb5f-aba877c4330f:p3'))
            .toBe('dbb274e7-59e2-494a-bb5f-aba877c4330f');
        expect(uuidDaReferencia('dbb274e7-59e2-494a-bb5f-aba877c4330f-p2020-11-15'))
            .toBe('dbb274e7-59e2-494a-bb5f-aba877c4330f');
    });

    it('sem UUID devolve null, não um pedaço de string', () => {
        expect(uuidDaReferencia('asset-maintenance-xyz')).toBeNull();
        expect(uuidDaReferencia(null)).toBeNull();
    });
});
