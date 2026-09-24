/**
 * Geração dos recebíveis da cota condominial (23/09/2026).
 *
 * ── Por que estes testes existem ────────────────────────────────────────────
 * `gerarRecebiveis` nunca rodou de verdade. A verificação de 27/08/2026 foi
 * feita com a escrita em `internal_transactions` ABORTADA no harness (está
 * escrito no plano), então o passo que grava nunca chegou ao banco — e ele não
 * funcionava: a trigger `trg_rateio_itens_protege` recusava o UPDATE que
 * preenche `transaction_id`, porque o rateio está FECHADO, que é justamente a
 * pré-condição da função. Medido em produção: 0 cobranças, 0 recebíveis.
 *
 * A trava do banco foi corrigida em `aplicar_20270923000010`. Estes testes
 * travam o lado do cliente, que tinha dois defeitos que só apareceriam depois
 * de o banco deixar passar:
 *
 *   1. O recebível nasce ANTES do vínculo. Falhando o vínculo, ele ficava em
 *      Contas a Receber sem ninguém apontando para ele — e o retry não o
 *      reaproveitava, porque `reference_id` é determinístico e colidia.
 *   2. O laço abortava no primeiro erro, deixando as cotas seguintes sem
 *      recebível e o rateio sem carimbo, com as anteriores já gravadas.
 *
 * O dublê do Supabase entende só a cadeia que este fluxo usa, e aceita ser
 * programado para falhar numa operação específica — inclusive só na N-ésima
 * vez, que é como se exercita um lote parcial.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;

const tabelas: Record<string, Linha[]> = {};

/** Falha programada: `${tabela}:${verbo}` → motivo, opcionalmente só na N-ésima. */
type Falha = { motivo: string; apenasNaChamada?: number };
let falhas: Record<string, Falha> = {};
let chamadas: Record<string, number> = {};
/** Tudo que foi escrito, na ordem — é sobre isto que alguns testes afirmam. */
let trilha: string[] = [];
let seq = 0;

function reset() {
    tabelas.condominio_rateios = [{
        id: 'r1', empreendimento_id: 'emp1', organization_id: 'org1', cost_center_id: 'cc1',
        competencia: '2026-09-01', tipo: 'ORDINARIO', criterio: 'IGUAL', status: 'FECHADO',
        total_despesas: 300, total_rateado: 300, observacoes: null, number: 'RAT-001',
        fechado_em: '2026-09-20T00:00:00Z', cobranca_gerada_em: null,
        created_at: '', updated_at: '',
    }];
    tabelas.empreendimentos = [{
        id: 'emp1', name: 'Galeria Altavista',
        cobranca_multa_percent: 2, cobranca_juros_mes_percent: 1,
    }];
    tabelas.condominio_rateio_itens = [
        { id: 'i1', rateio_id: 'r1', unit_id: 'u1', valor: 100, client_id: 'c1', transaction_id: null },
        { id: 'i2', rateio_id: 'r1', unit_id: 'u2', valor: 100, client_id: 'c2', transaction_id: null },
        { id: 'i3', rateio_id: 'r1', unit_id: 'u3', valor: 100, client_id: 'c3', transaction_id: null },
    ];
    tabelas.empreendimento_units = [
        { id: 'u1', name: '101', tower: { name: 'Torre A' } },
        { id: 'u2', name: '102', tower: { name: 'Torre A' } },
        { id: 'u3', name: '103', tower: { name: 'Torre A' } },
    ];
    tabelas.unit_occupancies = [
        { unit_id: 'u1', client_id: 'c1', role: 'RESPONSAVEL_FINANCEIRO', ended_at: null },
        { unit_id: 'u2', client_id: 'c2', role: 'RESPONSAVEL_FINANCEIRO', ended_at: null },
        { unit_id: 'u3', client_id: 'c3', role: 'RESPONSAVEL_FINANCEIRO', ended_at: null },
    ];
    tabelas.clients = [
        { id: 'c1', name: 'Ana', document: '11111111111' },
        { id: 'c2', name: 'Bruno', document: '22222222222' },
        { id: 'c3', name: 'Carla', document: '33333333333' },
    ];
    tabelas.internal_transactions = [];
    falhas = {};
    chamadas = {};
    trilha = [];
    seq = 0;
}

function deveFalhar(chave: string): string | null {
    const f = falhas[chave];
    if (!f) return null;
    chamadas[chave] = (chamadas[chave] ?? 0) + 1;
    if (f.apenasNaChamada && chamadas[chave] !== f.apenasNaChamada) return null;
    return f.motivo;
}

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let pendente: { verbo: 'insert' | 'update' | 'delete'; valores?: Linha } | null = null;

    const aplicar = (): { data: Linha[] | Linha | null; error: { message: string } | null } => {
        if (pendente) {
            const motivo = deveFalhar(`${table}:${pendente.verbo}`);
            if (motivo) {
                trilha.push(`${table}:${pendente.verbo}:ERRO`);
                return { data: null, error: { message: motivo } };
            }
        }
        if (pendente?.verbo === 'insert') {
            const nova = { id: `tx${++seq}`, ...pendente.valores };
            tabelas[table].push(nova);
            trilha.push(`${table}:insert:${nova.id}`);
            return { data: nova, error: null };
        }
        if (pendente?.verbo === 'update') {
            const alvos = tabelas[table].filter(r => preds.every(p => p(r)));
            for (const r of alvos) Object.assign(r, pendente.valores);
            trilha.push(`${table}:update:${alvos.length}`);
            return { data: alvos, error: null };
        }
        if (pendente?.verbo === 'delete') {
            const antes = tabelas[table].length;
            tabelas[table] = tabelas[table].filter(r => !preds.every(p => p(r)));
            trilha.push(`${table}:delete:${antes - tabelas[table].length}`);
            return { data: [], error: null };
        }
        return { data: tabelas[table].filter(r => preds.every(p => p(r))), error: null };
    };

    const q: Record<string, unknown> = {
        select: () => q,
        insert: (v: Linha) => { pendente = { verbo: 'insert', valores: v }; return q; },
        update: (v: Linha) => { pendente = { verbo: 'update', valores: v }; return q; },
        delete: () => { pendente = { verbo: 'delete' }; return q; },
        eq: (k: string, v: unknown) => { preds.push(r => r[k] === v); return q; },
        in: (k: string, vs: unknown[]) => { preds.push(r => vs.includes(r[k])); return q; },
        is: (k: string, v: unknown) => { preds.push(r => r[k] == v); return q; },
        neq: (k: string, v: unknown) => { preds.push(r => r[k] !== v); return q; },
        single: () => {
            const res = aplicar();
            const linha = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
            return Promise.resolve({ data: linha, error: res.error });
        },
        maybeSingle: () => (q.single as () => unknown)(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(aplicar())),
    };
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/clientChargeService', () => ({ clientChargeService: { emit: async () => ({}) } }));

import { condominioCobrancaService } from '../services/condominioCobrancaService';

beforeEach(reset);

describe('gerarRecebiveis · o caminho feliz', () => {
    it('cria um recebível por cota, vincula cada um e carimba o rateio', async () => {
        const r = await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });

        expect(r.criados).toBe(3);
        expect(r.falhas).toEqual([]);
        expect(tabelas.internal_transactions).toHaveLength(3);
        expect(tabelas.condominio_rateio_itens.every(i => i.transaction_id)).toBe(true);
        expect(tabelas.condominio_rateios[0].cobranca_gerada_em).toBeTruthy();
    });

    it('o reference_id é COMPOSTO ({item}-p{vencimento}) — é o que dá idempotência', async () => {
        await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });
        expect(tabelas.internal_transactions.map(t => t.reference_id))
            .toEqual(['i1-p2026-10-10', 'i2-p2026-10-10', 'i3-p2026-10-10']);
    });

    it('REGRA #2 na escrita: cota de condomínio não tem obra', async () => {
        await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });
        expect(tabelas.internal_transactions.every(t => t.project_id === null)).toBe(true);
    });
});

describe('gerarRecebiveis · o vínculo falhou — o recebível não pode ficar órfão', () => {
    it('apaga o recebível recém-criado e NOMEIA a cota na falha', async () => {
        falhas['condominio_rateio_itens:update'] = { motivo: 'rateio já fechado' };

        const r = await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });

        expect(r.criados).toBe(0);
        expect(r.falhas).toHaveLength(3);
        expect(r.falhas[0].unitLabel).toBe('Torre A · 101');
        expect(r.falhas[0].motivo).toMatch(/vincular/i);
        // O que importa de verdade: nada sobrou em Contas a Receber.
        expect(tabelas.internal_transactions).toHaveLength(0);
        expect(trilha.filter(t => t.startsWith('internal_transactions:delete'))).toHaveLength(3);
    });

    it('sem nenhuma cota criada, o rateio NÃO é carimbado — segue "fechado, não cobrado"', async () => {
        falhas['condominio_rateio_itens:update'] = { motivo: 'rateio já fechado' };
        await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });
        expect(tabelas.condominio_rateios[0].cobranca_gerada_em).toBeNull();
    });
});

describe('gerarRecebiveis · o lote não aborta no primeiro erro', () => {
    it('a segunda cota falha ao inserir, e a TERCEIRA ainda é criada', async () => {
        falhas['internal_transactions:insert'] = { motivo: 'estouro de conexão', apenasNaChamada: 2 };

        const r = await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });

        expect(r.criados).toBe(2);
        expect(r.falhas).toHaveLength(1);
        expect(r.falhas[0].unitLabel).toBe('Torre A · 102');
        // A prova de que não abortou: a cota DEPOIS da que quebrou foi vinculada.
        expect(tabelas.condominio_rateio_itens.find(i => i.id === 'i3')!.transaction_id).toBeTruthy();
        expect(tabelas.condominio_rateio_itens.find(i => i.id === 'i2')!.transaction_id).toBeNull();
    });

    it('com alguma cota criada, o rateio É carimbado mesmo havendo falha', async () => {
        falhas['internal_transactions:insert'] = { motivo: 'estouro de conexão', apenasNaChamada: 2 };
        await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });
        expect(tabelas.condominio_rateios[0].cobranca_gerada_em).toBeTruthy();
    });

    it('cota bloqueada (sem CPF) é PULADA, não falha — a prévia já avisou', async () => {
        (tabelas.clients.find(c => c.id === 'c2') as Linha).document = null;

        const r = await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });

        expect(r.criados).toBe(2);
        expect(r.pulados).toBe(1);
        expect(r.falhas).toEqual([]);
        expect(tabelas.condominio_rateio_itens.find(i => i.id === 'i2')!.transaction_id).toBeNull();
    });
});

describe('gerarRecebiveis · as pré-condições continuam valendo', () => {
    it('rateio em RASCUNHO não vira cobrança', async () => {
        tabelas.condominio_rateios[0].status = 'RASCUNHO';
        await expect(condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' }))
            .rejects.toThrow(/FECHADO/);
    });

    it('nenhuma cota cobrável → erro claro, sem escrever nada', async () => {
        for (const c of tabelas.clients) c.document = null;
        await expect(condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' }))
            .rejects.toThrow(/Nenhuma cota pode ser cobrada/);
        expect(tabelas.internal_transactions).toHaveLength(0);
    });

    it('cota que já tem recebível é pulada — rodar duas vezes cria ZERO na segunda', async () => {
        await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });
        const r2 = await condominioCobrancaService.gerarRecebiveis('r1', { vencimento: '2026-10-10' });

        expect(r2.criados).toBe(0);
        expect(tabelas.internal_transactions).toHaveLength(3);
    });
});
